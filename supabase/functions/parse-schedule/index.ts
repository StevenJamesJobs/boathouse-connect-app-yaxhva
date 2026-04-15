// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSchedulePrompt(employeeNames: string[]): string {
  const nameList = employeeNames.map((n) => `  - ${n}`).join('\n');
  return `You are parsing a Restaurant 365 (R365) Weekly Schedule PDF for McLoone's Boathouse restaurant.

IMPORTANT: This PDF uses a calendar-grid visual layout. You MUST read employee names from the VISUAL rendering of the PDF (what a human would see), NOT from any hidden text layer. Look at the actual printed text in the leftmost column of each row.

R365 VISUAL FORMAT
- Calendar-grid layout: leftmost column is the Employee name, then one column per day of the week (typically Thursday through Wednesday).
- The report header shows the restaurant name and the date range for the week.
- Each employee row has the full name (and may include a role label below the name).
- Shift cells contain: a time range (e.g., "4:30 PM - 10:00 PM"), the job title, and sometimes extra annotations like "CL", "Rm 1", "Rm 2", or a moon icon 🌙.
- Empty cells mean the employee is off that day.
- Some employees have MULTIPLE shifts in one day (double shifts) — stacked entries in the same cell → emit them as separate shift objects.

ROW/CELL COLOR CODING (most reliable signal for the primary role — use this to disambiguate job titles when text is unclear):
- Purple  (#A143D1 approx) = Manager / Bar Manager / Banquet Captain
- Red     (#E50001 approx) = Server / Lead Server / Training Server / Banquet Server
- Orange  (#FF7701 approx) = Bartender / Training Bartender / Banquet Bartender / Barback
- Yellow  (#F3B202 approx) = Host
- Forest Green (#9BB700 approx) = Busser / Runner / Expo
- Highlighter Green (#26BC41 approx) = Chef / Cook / Kitchen / Dishwasher

CLOSER / OPENER / TRAINING DETECTION
- A moon icon 🌙 next to a shift time means that shift is a CLOSER. Set is_closer: true. This is especially common on manager shifts.
- Server/Bartender cells may also show "CL" (closer), "RM 1 CL", "RM 2 CL" etc. — "CL" → is_closer: true. Preserve "RM 1"/"RM 2" in room_assignment.
- If a cell or role label says "Opener" or "OP", set is_opener: true.
- If a cell or role says anything containing "Training" (e.g., "Training Server", "Training Bartender"), set is_training: true. Keep the training label as the primary role value.

ALLOWED ROLE VALUES (use these exact strings in the "roles" array — map any variant to the closest match below):
  Manager, Bar Manager, Banquet Captain,
  Server, Lead Server, Training Server, Banquet Server,
  Bartender, Training Bartender, Banquet Bartender, Barback,
  Host, Busser, Runner, Expo,
  Chef, Cook, Kitchen, Dishwasher

If you see "Bus" → "Busser". "Bart" → "Bartender". "Bqt Server" → "Banquet Server". Always normalize to one of the strings above.

KNOWN EMPLOYEE NAMES — These are the actual staff members. When you read a name from the PDF, match it to the closest name from this list. The PDF names may have slight visual artifacts or formatting differences, but they should correspond to someone on this list. If a PDF name is clearly a variant/misspelling of a known employee, use the KNOWN employee name instead.

Known employees:
${nameList}

If a name in the PDF does NOT reasonably match anyone on the known list (e.g., a brand new hire), use the name exactly as shown in the PDF.

Extract ALL shifts from ALL pages. Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "week_start": "YYYY-MM-DD",
  "week_end": "YYYY-MM-DD",
  "shifts": [
    {
      "employee_name": "Full Name (use known employee name if matched)",
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
- Use 24-hour time format (e.g., "16:30" not "4:30 PM").
- If end_time is after midnight (e.g., "1:00 AM" after a shift starting "10:00 PM"), still use "01:00".
- "CL" alone → room_assignment: "CL" AND is_closer: true.
- "Rm 1", "Rm 2", etc. → room_assignment with that value. If combined with "CL", also set is_closer: true.
- Moon icon 🌙 on a shift → is_closer: true (even if no "CL" text is present).
- Double shifts in one cell = two separate shift entries for that employee on that date.
- Return ALL employees from ALL pages — do not skip anyone.
- The "roles" array should contain ONE value: the primary job title for that shift, normalized to the allowed list above.
- CRITICAL: Match PDF names to the known employee list above whenever possible. Use the known spelling, not the PDF's potentially garbled version.
- Return ONLY the JSON object, nothing else.`;
}

interface ParseRequest {
  file_url: string;
  upload_id: string;
  media_type?: string; // 'application/pdf' | 'image/jpeg' | 'image/png'
  // For multi-image uploads (multiple pages as separate images)
  additional_image_urls?: string[];
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
  let media_type = 'application/pdf';
  let additional_image_urls: string[] = [];

  try {
    const body = (await req.json()) as ParseRequest;
    file_url = body.file_url || '';
    upload_id = body.upload_id || '';
    media_type = body.media_type || 'application/pdf';
    additional_image_urls = body.additional_image_urls || [];

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

    // Helper: fetch a file URL and return base64
    async function fetchFileAsBase64(url: string): Promise<{ base64: string; byteLength: number }> {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch file: ${resp.status}`);
      }
      const arrayBuffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let base64 = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        base64 += String.fromCharCode(...slice);
      }
      return { base64: btoa(base64), byteLength: arrayBuffer.byteLength };
    }

    // Fetch primary file from storage
    const primaryFile = await fetchFileAsBase64(file_url);
    console.log(`Primary file fetched (${media_type}), size: ${primaryFile.byteLength} bytes, base64 length: ${primaryFile.base64.length}`);

    // For multi-image uploads, fetch additional pages
    const additionalFiles: Array<{ base64: string; byteLength: number }> = [];
    for (let i = 0; i < additional_image_urls.length; i++) {
      const extra = await fetchFileAsBase64(additional_image_urls[i]);
      console.log(`Additional image ${i + 1} fetched, size: ${extra.byteLength} bytes`);
      additionalFiles.push(extra);
    }

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

    console.log(`Sending to Claude with ${employeeNames.length} known employee names, format: ${media_type}`);

    // Build content blocks based on file type (PDF vs images)
    const isImage = media_type.startsWith('image/');
    const contentBlocks: any[] = [];

    if (isImage) {
      // Primary image
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: media_type,
          data: primaryFile.base64,
        },
      });
      // Additional page images
      for (const extra of additionalFiles) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: media_type,
            data: extra.base64,
          },
        });
      }
      console.log(`Sending ${1 + additionalFiles.length} image(s) to Claude`);
    } else {
      // PDF document
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: primaryFile.base64,
        },
      });
    }

    // Add the prompt as the last content block
    contentBlocks.push({
      type: 'text',
      text: prompt,
    });

    // Send to Claude API with PDF support + extended output via beta headers
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25,output-128k-2025-02-19',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 64000,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
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
    const stopReason = claudeData.stop_reason || 'unknown';

    console.log(`Claude response received, length: ${responseText.length}, stop_reason: ${stopReason}`);

    // Detect output truncation — this means the schedule was too large for the token limit
    if (stopReason === 'max_tokens') {
      console.error('Claude response was TRUNCATED — output hit max_tokens limit. Schedule may be incomplete.');
      throw new Error('Schedule PDF is too large — the AI response was truncated. Try uploading fewer pages or splitting into separate uploads per job role.');
    }

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
