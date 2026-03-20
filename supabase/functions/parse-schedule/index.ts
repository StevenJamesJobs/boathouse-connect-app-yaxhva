// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSchedulePrompt(employeeNames: string[]): string {
  const nameList = employeeNames.map((n) => `  - ${n}`).join('\n');
  return `You are parsing a HotSchedules Weekly Roster Report PDF for McLoone's Boathouse restaurant.

IMPORTANT: This PDF uses a calendar-grid visual layout. The underlying text layer may be garbled or incorrect. You MUST read employee names from the VISUAL rendering of the PDF (what a human would see), NOT from any hidden text layer. Look at the actual printed text in the leftmost column of each row.

The PDF is a calendar-grid layout with:
- Column headers: Employee name column, then one column per day of the week (typically Thursday through Wednesday)
- Each employee row contains: Full name [Nickname] on line 1, phone number on line 2
- Shift cells contain: time range (e.g., "4:30 PM - 10:00 PM"), roles (e.g., "Bus | Training Busser"), and sometimes flags like "Closer", "Opener", "CL", "Rm 1", "Rm 2"
- Some employees have MULTIPLE shifts in one day (double shifts) — these appear as stacked entries in the same cell
- Empty cells mean the employee is off that day
- The report header shows the restaurant name and the date range for the week

KNOWN EMPLOYEE NAMES — These are the actual staff members. When you read a name from the PDF, match it to the closest name from this list. The PDF names may have slight visual artifacts, OCR-like errors, or formatting differences, but they should correspond to someone on this list. If a PDF name is clearly a variant/misspelling of a known employee, use the KNOWN employee name instead.

Known employees:
${nameList}

If a name in the PDF does NOT reasonably match anyone on the known list (e.g., a brand new hire not yet in the system), use the name exactly as shown in the PDF.

Extract ALL shifts from ALL pages. Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "week_start": "YYYY-MM-DD",
  "week_end": "YYYY-MM-DD",
  "shifts": [
    {
      "employee_name": "Full Name (use known employee name if matched)",
      "nickname": "Nickname from brackets or null",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "roles": ["Server"],
      "is_closer": false,
      "is_opener": false,
      "is_training": false,
      "room_assignment": null
    }
  ]
}

Rules:
- Use 24-hour time format (e.g., "16:30" not "4:30 PM")
- If end_time would be after midnight (e.g., "1:00 AM" for a shift starting at "10:00 PM"), still use "01:00"
- Parse "CL" as room_assignment: "CL"
- Parse "Rm 1", "Rm 2" etc. as room_assignment with that value
- If roles contain "Closer", set is_closer: true and keep the primary role in the roles array
- If roles contain "Opener", set is_opener: true and keep the primary role in the roles array
- If roles contain "Training" in any form (e.g., "Training Server", "Training Busser"), set is_training: true and include both the training role and base role
- Double shifts in one cell = two separate shift entries for that employee on that date
- Return ALL employees from ALL pages — do not skip anyone
- The employee_name should be the full name WITHOUT the bracket nickname portion
- CRITICAL: Match PDF names to the known employee list above whenever possible. Use the known spelling, not the PDF's potentially garbled version.
- Return ONLY the JSON object, nothing else`;
}

interface ParseRequest {
  file_url: string;
  upload_id: string;
}

// Normalize unicode quotes/apostrophes and special chars for comparison
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'") // smart quotes → straight apostrophe
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // smart double quotes
    .replace(/\s+/g, ' '); // normalize whitespace
}

function matchEmployee(
  pdfName: string,
  users: Array<{ id: string; name: string; username: string }>
): string | null {
  const normalizedPdf = normalizeStr(pdfName);

  // Exact match (case-insensitive, unicode-normalized)
  const exact = users.find(
    (u) => u.name && normalizeStr(u.name) === normalizedPdf
  );
  if (exact) return exact.id;

  // First + Last name match (handles middle names, suffixes, slight spelling diffs)
  const pdfParts = normalizedPdf.split(/\s+/);
  if (pdfParts.length >= 2) {
    const pdfFirst = pdfParts[0];
    const pdfLast = pdfParts[pdfParts.length - 1];

    const partial = users.find((u) => {
      if (!u.name) return false;
      const parts = normalizeStr(u.name).split(/\s+/);
      if (parts.length < 2) return false;
      return parts[0] === pdfFirst && parts[parts.length - 1] === pdfLast;
    });
    if (partial) return partial.id;
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse request body early so upload_id is available in error handler
  let file_url = '';
  let upload_id = '';

  try {
    const body = (await req.json()) as ParseRequest;
    file_url = body.file_url || '';
    upload_id = body.upload_id || '';

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!file_url || !upload_id) {
      throw new Error('Missing required fields: file_url and upload_id');
    }

    console.log(`Starting schedule parse for upload ${upload_id}`);

    // Update status to processing
    await supabase
      .from('schedule_uploads')
      .update({ status: 'processing' })
      .eq('id', upload_id);

    // Fetch PDF from storage URL
    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
    }

    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfArrayBuffer);

    // Convert to base64 in chunks to avoid call stack overflow
    let pdfBase64 = '';
    const CHUNK = 8192;
    for (let i = 0; i < pdfBytes.length; i += CHUNK) {
      const slice = pdfBytes.subarray(i, Math.min(i + CHUNK, pdfBytes.length));
      pdfBase64 += String.fromCharCode(...slice);
    }
    pdfBase64 = btoa(pdfBase64);

    console.log(`PDF fetched, size: ${pdfArrayBuffer.byteLength} bytes, base64 length: ${pdfBase64.length}`);

    // Fetch all users BEFORE calling Claude so we can include names in the prompt
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, username');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch users for matching');
    }

    // Build prompt with known employee names for better matching
    const employeeNames = (users || [])
      .filter((u: { name: string }) => u.name && u.name.trim())
      .map((u: { name: string }) => u.name.trim());
    const prompt = buildSchedulePrompt(employeeNames);

    console.log(`Sending to Claude with ${employeeNames.length} known employee names`);

    // Send to Claude API with PDF support via beta header
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content?.[0]?.text || '';

    console.log(`Claude response received, length: ${responseText.length}`);

    // Parse the JSON response
    let parsedSchedule;
    try {
      // Strip any markdown code blocks if present
      const jsonStr = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsedSchedule = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText.substring(0, 500));
      throw new Error('Failed to parse schedule data from AI response');
    }

    const { week_start, week_end, shifts } = parsedSchedule;

    if (!shifts || !Array.isArray(shifts)) {
      throw new Error('Invalid schedule data: missing shifts array');
    }

    console.log(`Parsed ${shifts.length} shifts for week ${week_start} to ${week_end}`);

    // Match employees and prepare shift records (users already fetched above)
    const unmatchedEmployees = new Set<string>();
    const matchedShifts: Array<{
      upload_id: string;
      user_id: string | null;
      employee_name: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      roles: string[];
      is_closer: boolean;
      is_opener: boolean;
      is_training: boolean;
      room_assignment: string | null;
    }> = [];

    for (const shift of shifts) {
      const userId = matchEmployee(shift.employee_name, users || []);

      if (!userId) {
        unmatchedEmployees.add(shift.employee_name);
      }

      matchedShifts.push({
        upload_id,
        user_id: userId,
        employee_name: shift.employee_name,
        shift_date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        roles: shift.roles || [],
        is_closer: shift.is_closer || false,
        is_opener: shift.is_opener || false,
        is_training: shift.is_training || false,
        room_assignment: shift.room_assignment || null,
      });
    }

    // Check for existing uploads for the same week and mark as replaced
    const { data: existingUploads } = await supabase
      .from('schedule_uploads')
      .select('id')
      .eq('week_start', week_start)
      .eq('week_end', week_end)
      .eq('status', 'completed')
      .neq('id', upload_id);

    if (existingUploads && existingUploads.length > 0) {
      const existingIds = existingUploads.map((u: { id: string }) => u.id);
      console.log(`Replacing ${existingIds.length} existing uploads for this week`);

      await supabase
        .from('schedule_uploads')
        .update({ status: 'replaced', updated_at: new Date().toISOString() })
        .in('id', existingIds);

      // CASCADE delete will remove old shifts automatically
    }

    // Insert new shifts in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < matchedShifts.length; i += BATCH_SIZE) {
      const batch = matchedShifts.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('staff_schedules')
        .insert(batch);

      if (insertError) {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, insertError);
        throw new Error(`Failed to insert shifts: ${insertError.message}`);
      }
    }

    // Update the upload record
    const unmatchedArray = Array.from(unmatchedEmployees);
    const matchedCount = matchedShifts.filter((s) => s.user_id !== null).length;

    await supabase
      .from('schedule_uploads')
      .update({
        status: 'completed',
        week_start,
        week_end,
        parsed_shifts_count: matchedShifts.length,
        unmatched_employees: unmatchedArray,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload_id);

    const summary = {
      success: true,
      total_shifts: matchedShifts.length,
      matched_shifts: matchedCount,
      unmatched_shifts: matchedShifts.length - matchedCount,
      unmatched_employees: unmatchedArray,
      unique_employees: new Set(matchedShifts.map((s) => s.employee_name)).size,
      week_start,
      week_end,
    };

    console.log('Schedule parse complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Schedule parse error:', error);

    // Update upload status to failed
    if (upload_id) {
      try {
        await supabase
          .from('schedule_uploads')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', upload_id);
      } catch (_) {
        console.error('Failed to update upload status:', _);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal error parsing schedule',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
