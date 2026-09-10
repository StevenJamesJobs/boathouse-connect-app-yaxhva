// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The generic role list — only the FALLBACK when an org has no job titles of its own.
// s83: the prompt is format-agnostic (R365, HotSchedules, 7shifts, Sling, Excel prints,
// hand-made grids) and the allowed roles are the ORG's own job titles.
const GENERIC_ROLES = [
  'Manager', 'Bar Manager', 'Banquet Captain',
  'Server', 'Lead Server', 'Training Server', 'Banquet Server',
  'Bartender', 'Training Bartender', 'Banquet Bartender', 'Barback',
  'Host', 'Busser', 'Runner', 'Expo',
  'Chef', 'Cook', 'Kitchen', 'Dishwasher',
];

function buildSchedulePrompt(
  employeeNames: string[],
  roleTitles: string[],
  restaurantName?: string,
  weekHint?: { start: string; end: string } | null,
): string {
  const nameList = employeeNames.map((n) => `  - ${n}`).join('\n');
  const displayName = restaurantName || 'the restaurant';
  const roles = roleTitles.length ? roleTitles : GENERIC_ROLES;
  const roleList = roles.map((r) => `  - ${r}`).join('\n');
  const hint = weekHint
    ? `\nWEEK RANGE FROM THE MANAGER: this schedule covers ${weekHint.start} to ${weekHint.end}. Use that range whenever the document does not clearly print its own dates. If the document clearly shows different dates, trust the document.`
    : '';
  return `You are extracting a staff work schedule for ${displayName} from the attached document — a PDF, or one or more photos/images of a schedule. Schedules come from many systems (Restaurant365, HotSchedules, 7shifts, Sling, When I Work, Excel / Google Sheets prints, hand-made grids). Read the VISUAL rendering — what a person would see printed — not a hidden text layer.

STEP 1 — IDENTIFY THE LAYOUT, then read it systematically:
- GRID: one row per employee (the name in the leftmost column), one column per day; each cell holds that person's shift(s) for that day. The header row carries the dates or weekday names.
- DAY SECTIONS: each day is a block or column listing the people working it, with their times and roles.
- ROLE SECTIONS: blocks per job (Servers, Bartenders, Hosts, Kitchen…) listing people and their days.
Multi-page documents continue the same table — carry the column dates across pages. Read EVERY page.

STEP 2 — WHAT A SHIFT CELL CONTAINS:
- A time range in any format: "4:30 PM - 10:00 PM", "4:30p-10p", "16:30-22:00", "11-4", "5-CL", "5-close". Convert to 24-hour "HH:MM". A start with no end (e.g. "5 PM") → end_time "23:00" for evening starts and "16:00" for morning starts is NOT acceptable — instead use the document's usual close/lunch-end time if one is printed anywhere, otherwise "22:00" (evening) / "16:00" (morning) and keep the shift.
- Usually a job/role label; sometimes only the section or colour identifies the role.
- Markers: a moon icon 🌙, "CL", "Close", "C" → is_closer: true. "OP", "Open", "O" → is_opener: true. "Training", "TR", "Trainee" → is_training: true (keep the training label as the role when the org has one). "Rm 1", "Rm 2", "Sec 3", "Patio", "Bar 2" → room_assignment (keep "CL" in room_assignment too when it is the only text).
- "OFF", "RDO", "X", "—", a blank cell, "Requested off", "Unavailable", "N/A" → NOT a shift. Vacation/PTO rows are not shifts.
- Two entries stacked in one cell = two separate shift objects (a double).

COLOUR CODING (when present): if rows or cells are colour-coded by job, use the colour to disambiguate the role. Restaurant365 prints usually mean: purple = Manager / Bar Manager, red = Server, orange = Bartender / Barback, yellow = Host, green = Busser / Runner / Expo, bright green = Kitchen.

DATES: use the dates printed on the document. If only weekday names are printed, derive each date from the week range. Every shift needs a full YYYY-MM-DD date.${hint}
If end_time is after midnight (e.g. a shift starting 22:00 ending 01:00), still write "01:00" on the same date.

ALLOWED ROLE VALUES — use these exact strings in the "roles" array (map each job label to the closest one; if a label truly matches none, use the label as written in Title Case; if a shift has no discernible role, use "Staff"):
${roleList}
Common abbreviations: "Bus" → Busser · "Bart"/"BT" → Bartender · "Svr" → Server · "Bqt Server" → Banquet Server · "Mgr" → Manager · "Exp" → Expo.

KNOWN EMPLOYEE NAMES — the actual staff. Match each printed name to the closest known name (printed names may be abbreviated, reordered "Last, First", or have small artifacts). When it is clearly the same person, use the KNOWN spelling. If a printed name matches nobody (a new hire), keep it exactly as printed.

Known employees:
${nameList}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "week_start": "YYYY-MM-DD",
  "week_end": "YYYY-MM-DD",
  "shifts": [
    {
      "employee_name": "Full Name (the known employee name when matched)",
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
- week_start / week_end = the first and last dates the schedule covers.
- The "roles" array holds ONE value: the primary job for that shift.
- Return ALL shifts for ALL employees from ALL pages — never skip anyone, never summarise.
- Return ONLY the JSON object, nothing else.`;
}

interface ParseRequest {
  file_url: string;
  upload_id: string;
  media_type?: string; // 'application/pdf' | 'image/jpeg' | 'image/png'
  additional_image_urls?: string[];
  organization_id?: string;
  user_id?: string; // B4 batch 8: caller id — verified mgr/owner when present
  // s83: the manager's optional week range (used when the document prints no dates),
  // and what the scan costs (consume_schedule_upload_credits after a successful parse).
  week_start_hint?: string | null; // YYYY-MM-DD
  week_end_hint?: string | null;
  source_type?: 'pdf' | 'image';
  page_count?: number;
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

    // Nickname/prefix match — handles Steve↔Steven, Mike↔Michael, Dan↔Daniel,
    // Chris↔Christopher, Matt↔Matthew, Tom↔Thomas, Kate↔Katherine, etc.
    // Rule: last names equal AND one first name is a prefix of the other,
    // where the shorter first name is at least 3 characters (prevents false
    // positives like "Al"↔"Alice" or "Jo"↔"Joseph").
    const nickname = users.find((u) => {
      if (!u.name) return false;
      const parts = normalizeStr(u.name).split(/\s+/);
      if (parts.length < 2) return false;
      const userFirst = parts[0];
      const userLast = parts[parts.length - 1];
      if (userLast !== pdfLast) return false;
      const shorter = pdfFirst.length <= userFirst.length ? pdfFirst : userFirst;
      const longer = pdfFirst.length <= userFirst.length ? userFirst : pdfFirst;
      return shorter.length >= 3 && longer.startsWith(shorter);
    });
    if (nickname) return nickname.id;
  }

  return null;
}

// ─── Heavy background work ──────────────────────────────────────────────────
// Parsing a full PDF + calling Claude can take well over 150 seconds (the
// default Supabase Edge Function wall-clock timeout). We run it as a
// background task via EdgeRuntime.waitUntil so the HTTP response returns
// immediately and the client polls `schedule_uploads.status` for completion.

async function processScheduleInBackground(
  supabase: any,
  anthropicApiKey: string,
  file_url: string,
  upload_id: string,
  media_type: string,
  additional_image_urls: string[],
  organizationId?: string,
  userId?: string,
  weekHint?: { start: string; end: string } | null,
  sourceType: 'pdf' | 'image' = 'pdf',
  pageCount = 1
): Promise<void> {
  try {
    console.log(`[bg] Starting schedule parse for upload ${upload_id}`);

    // Ensure status is processing (caller already set it, but idempotent)
    await supabase
      .from('schedule_uploads')
      .update({ status: 'processing' })
      .eq('id', upload_id);

    // Helper: fetch a stored file and return base64. S50 strict (post-flip):
    // service-role storage download is the ONLY path — the public-URL fetch
    // fallback is GONE (buckets are private; stored URLs are opaque ids).
    async function fetchFileAsBase64(url: string): Promise<{ base64: string; byteLength: number }> {
      const PUBLIC_MARKER = '/storage/v1/object/public/';
      const idx = url.indexOf(PUBLIC_MARKER);
      if (idx === -1) throw new Error('Not a storage URL');
      const rest = url.slice(idx + PUBLIC_MARKER.length);
      const slash = rest.indexOf('/');
      if (slash <= 0) throw new Error('Bad storage URL');
      const bucket = rest.slice(0, slash);
      const path = decodeURIComponent(rest.slice(slash + 1).split('?')[0]);
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? 'no data'}`);
      const arrayBuffer: ArrayBuffer = await data.arrayBuffer();
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
    let usersQuery = supabase.from('users').select('id, name, username');
    if (organizationId) {
      usersQuery = usersQuery.eq('organization_id', organizationId);
    }
    const { data: users, error: usersError } = await usersQuery;

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch users for matching');
    }

    // Look up organization name for the AI prompt
    let restaurantName: string | undefined;
    if (organizationId) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      if (orgData?.name) restaurantName = orgData.name;
    }

    // s83: the org's OWN job titles are the allowed role values (generic list = fallback)
    let roleTitles: string[] = [];
    if (organizationId) {
      const { data: titleRows } = await supabase
        .from('organization_job_titles')
        .select('title, is_active, display_order')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true });
      roleTitles = (titleRows || [])
        .filter((t: { title: string; is_active: boolean | null }) => t.title && t.title.trim() && t.is_active !== false)
        .map((t: { title: string }) => t.title.trim());
    }

    // Build prompt with known employee names for better matching
    const employeeNames = (users || [])
      .filter((u: { name: string }) => u.name && u.name.trim())
      .map((u: { name: string }) => u.name.trim());
    const prompt = buildSchedulePrompt(employeeNames, roleTitles, restaurantName, weekHint);

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
        // Sonnet 4.6 — current Sonnet; claude-sonnet-4-5 remains active but
        // this future-proofs the parser. 64K output cap matches Sonnet 4.6's max.
        model: 'claude-sonnet-4-6',
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
        ...(organizationId ? { organization_id: organizationId } : {}),
      });
    }

    // s83: charge the scan now that the AI work succeeded (free-first bypasses the
    // charge). A failed scan never charges; a deleted upload never refunds. The client
    // pre-checks the quota, so insufficient here is only a race — and it fails the
    // upload BEFORE any shift is written.
    let creditsCharged = 0;
    let wasFree = false;
    if (userId) {
      const { data: charge, error: chargeErr } = await supabase.rpc('consume_schedule_upload_credits', {
        p_actor_id: userId,
        p_source_type: sourceType,
        p_page_count: pageCount,
      });
      if (chargeErr) {
        console.error('consume_schedule_upload_credits error:', chargeErr);
      } else if (charge?.ok) {
        creditsCharged = charge.charged || 0;
        wasFree = !!charge.free_used;
      } else if (charge?.reason === 'insufficient_credits') {
        throw new Error('You’re out of schedule-scan credits this month. They reset next month, or upgrade for more.');
      } else if (charge?.reason === 'owner_only') {
        throw new Error('You do not have permission to upload schedules');
      } else {
        console.warn('consume_schedule_upload_credits not ok:', JSON.stringify(charge));
      }
    }

    // Check for existing uploads for the same week and mark as replaced
    let existingQuery = supabase
      .from('schedule_uploads')
      .select('id')
      .eq('week_start', week_start)
      .eq('week_end', week_end)
      .eq('status', 'completed')
      .neq('id', upload_id);
    if (organizationId) {
      existingQuery = existingQuery.eq('organization_id', organizationId);
    }
    const { data: existingUploads } = await existingQuery;

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
        credits_charged: creditsCharged,
        was_free: wasFree,
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

    console.log('[bg] Schedule parse complete:', JSON.stringify(summary));
  } catch (error) {
    console.error('[bg] Schedule parse error:', error);

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
        console.error('[bg] Failed to update upload status:', _);
      }
    }
  }
}

// ─── HTTP handler ───────────────────────────────────────────────────────────
// Validates the request, kicks off the background parse task, and returns
// 202 Accepted immediately. The client polls `schedule_uploads.status` to
// know when parsing is done.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let upload_id = '';

  try {
    const body = (await req.json()) as ParseRequest;
    const file_url = body.file_url || '';
    upload_id = body.upload_id || '';
    const media_type = body.media_type || 'application/pdf';
    const additional_image_urls = body.additional_image_urls || [];
    const organizationId = body.organization_id;
    // s83: optional week hint + scan cost inputs
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const weekHint =
      body.week_start_hint && body.week_end_hint && isoDate.test(body.week_start_hint) && isoDate.test(body.week_end_hint)
        ? { start: body.week_start_hint, end: body.week_end_hint }
        : null;
    const sourceType: 'pdf' | 'image' = body.source_type === 'image' || media_type.startsWith('image/') ? 'image' : 'pdf';
    const pageCount = Math.max(1, Number(body.page_count) || (1 + additional_image_urls.length));

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    if (!file_url || !upload_id || !organizationId) {
      // organization_id is REQUIRED: without it the background job would run
      // unscoped (all-orgs user enumeration into the AI prompt + null-org shift
      // inserts). Mirrors parse-menu, which has always required it.
      throw new Error('Missing required fields: file_url, upload_id and organization_id');
    }

    // S50 strict: server-side manager/owner verification is now REQUIRED
    // (custom auth — never trust the Authorization header). The pre-B4
    // legacy-client allowance for a missing user_id is GONE; old builds are
    // dead by design after the teardown window.
    {
      const { data: caller, error: callerErr } = body.user_id
        ? await supabase
            .from('users')
            .select('role, organization_id')
            .eq('id', body.user_id)
            .single()
        : { data: null, error: { message: 'missing user_id' } };
      const isManager = caller && (caller.role === 'manager' || caller.role === 'owner');
      // Org match is now UNCONDITIONAL (organization_id is required above) — a
      // manager/owner may only parse a schedule for their OWN org.
      const orgOk = caller && !!organizationId && caller.organization_id === organizationId;
      // s83: the AI Schedule Uploads grant is live — a MANAGER also needs
      // premium.ai_schedule_upload (mirrors _may_upload_schedule / parse-menu).
      let grantOk = true;
      if (caller && caller.role === 'manager' && orgOk) {
        const { data: perm } = await supabase
          .from('manager_permissions')
          .select('granted')
          .eq('organization_id', organizationId)
          .eq('permission_key', 'premium.ai_schedule_upload')
          .maybeSingle();
        grantOk = perm?.granted === true;
      }
      if (callerErr || !isManager || !orgOk || !grantOk) {
        try {
          await supabase
            .from('schedule_uploads')
            .update({ status: 'failed', error_message: 'Not authorized', updated_at: new Date().toISOString() })
            .eq('id', upload_id);
        } catch (_) { /* noop */ }
        return new Response(
          JSON.stringify({ success: false, error: 'Only managers can upload a schedule.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    // Kick off the heavy work as a background task so we don't hit the
    // 150s HTTP handler timeout.
    const task = processScheduleInBackground(
      supabase,
      anthropicApiKey,
      file_url,
      upload_id,
      media_type,
      additional_image_urls,
      organizationId,
      body.user_id,
      weekHint,
      sourceType,
      pageCount
    );

    // @ts-ignore EdgeRuntime is a Supabase Edge Runtime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else {
      // Fallback: fire-and-forget (works locally with supabase functions serve).
      task.catch((err) => console.error('[bg] Background task rejected:', err));
    }

    return new Response(
      JSON.stringify({
        accepted: true,
        upload_id,
        status: 'processing',
        message: 'Schedule parse started — poll schedule_uploads.status for completion.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202,
      }
    );
  } catch (error) {
    console.error('Request validation error:', error);

    // Mark upload as failed if we know its ID
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
        error: error.message || 'Internal error starting schedule parse',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
