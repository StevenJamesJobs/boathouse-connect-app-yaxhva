// @ts-nocheck
// Libations AI Upload (s90) — parse a cocktail list / recipe sheet (PDF or
// photos) with Claude vision into sections → recipes, then PARK the result on
// the upload row for the Review Libations page. The parse-menu mould:
//   * verifies the caller server-side — org owner, or a manager whose org holds
//     the premium.ai_libation_upload grant (custom auth — never trust the
//     Authorization header; the service role loads users by id);
//   * the upload row must be the caller org's, kind 'libations', with the book
//     (target_menu_slot 1 | 2) chosen up front — the prompt is fed THAT book's
//     recipe-fed Libations subcategory names so the AI reuses them;
//   * stores parsed_result on menu_uploads and sets status='ready_for_review';
//     the client reviews / edits, then apply_parsed_libations writes. Credits
//     come out of the ONE menu-upload pool (p_kind 'libations' — never the free
//     first menu scan) after a successful parse.
// Text only: photos on the sheet are ignored (Steve, s90) — the review and the
// editors add photos through the multi-image field afterwards.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParseRequest {
  file_url: string;
  upload_id: string;
  user_id: string;
  organization_id: string;
  media_type?: string; // 'application/pdf' | 'image/jpeg' | 'image/png'
  source_type?: string; // 'pdf' | 'image'
  page_count?: number;
  additional_image_urls?: string[];
}

function buildLibationsPrompt(restaurantName: string, bookName: string, existingSubs: string[]): string {
  const name = restaurantName || 'this restaurant';
  const subs = existingSubs.length ? existingSubs.map((s) => `- ${s}`).join('\n') : '(none yet — use the headings printed on the sheet)';
  return `You are parsing a cocktail list or bar recipe sheet for ${name} into structured drink recipes for a restaurant staff app. These recipes will be filed under the "${bookName}" libations book. You are given one or more pages (PDF or photos). Read EVERY page carefully — what a human sees printed on the page.

Extract every DRINK recipe (cocktails, mixed drinks, martinis, sangrias, mocktails, batch cocktails, frozen drinks), grouped the way the sheet groups them.

Return ONLY valid JSON (no markdown, no commentary) with EXACTLY this structure:

{
  "sections": [
    {
      "name": "Section heading as printed (e.g. Signature Cocktails, Martinis), or an empty string when the sheet has no headings",
      "recipes": [
        {
          "name": "Drink name as printed",
          "price": "Price exactly as printed including the symbol (for example $14 or 14), or empty if none is printed",
          "glassware": "Glass as printed (e.g. Coupe, Rocks, Collins, Copper Mug), or empty",
          "garnish": "Garnish as printed, or empty",
          "ingredients": [
            { "amount": "Measure exactly as printed (e.g. 2 oz, 0.75 oz, 3 dashes, top), or empty when the sheet lists no measure", "ingredient": "Ingredient name" }
          ],
          "procedure": "Method / build steps as printed, one step per line, or empty if none is printed"
        }
      ]
    }
  ]
}

REUSE EXISTING SECTIONS — this book already has these libation subcategories. When a sheet heading matches one of them, use the EXACT existing name (capitalization and spelling). Do NOT invent a near-duplicate:
${subs}

RULES:
- The NAME and the INGREDIENTS are the essentials — every recipe needs both. Price, glassware, garnish, measures and the procedure are optional: fill them ONLY when they are printed; never invent, guess or pad them.
- One ingredient per row. Keep the ingredient name clean (no measure inside the name). A garnish printed in the ingredient list stays an ingredient row unless the sheet labels it as the garnish.
- Do NOT extract food, wine lists, beer lists or spirit lists (bottles by the glass are not recipes). A drink with no ingredients printed is not a recipe — leave it out.
- Keep the sheet's grouping. A sheet with no headings returns ONE section with name "" holding every recipe.
- Preserve prices exactly as printed. Never invent a price.
- Return ALL recipes from ALL pages — do not skip anything. Return ONLY the JSON object.`;
}

// S50 strict: service-role storage download is the ONLY path (private buckets,
// stored URLs are opaque identifiers the function parses bucket/path out of).
async function fetchFileAsBase64(supabase: any, url: string): Promise<{ base64: string; byteLength: number }> {
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
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return { base64: btoa(binary), byteLength: arrayBuffer.byteLength };
}

// The only bucket a libations parse may read from (the broker's
// libation_upload_file purpose writes `${organization_id}/<timestamp>-<name>` there).
const MENU_UPLOADS_BUCKET = 'menu-uploads';

function storageUrlInOrg(url: unknown, organizationId: string): boolean {
  if (typeof url !== 'string') return false;
  const PUBLIC_MARKER = '/storage/v1/object/public/';
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx === -1) return false;
  const rest = url.slice(idx + PUBLIC_MARKER.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return false;
  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1).split('?')[0]);
  if (path.includes('..')) return false;
  return bucket === MENU_UPLOADS_BUCKET && path.startsWith(`${organizationId}/`);
}

// The book's recipe-fed Libations subcategory names (the destinations the
// review offers) + the book's display name for the prompt.
async function buildBookContext(
  supabase: any,
  organizationId: string,
  targetSlot: number,
): Promise<{ bookName: string; subs: string[] }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('menu_category_scope, menu_1_name, menu_2_name')
    .eq('id', organizationId)
    .maybeSingle();
  const treeSlot = org?.menu_category_scope === 'per_menu' ? targetSlot : 0;
  const bookName = (targetSlot === 2 ? org?.menu_2_name : org?.menu_1_name) || (targetSlot === 2 ? 'Menu 2' : 'Menu 1');
  const { data: cat } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('system_key', 'cat.libations')
    .eq('menu_slot', treeSlot)
    .maybeSingle();
  if (!cat?.id) return { bookName, subs: [] };
  const { data: subs } = await supabase
    .from('menu_subcategories')
    .select('display_name, is_cocktail_fed, is_hidden, display_order')
    .eq('category_id', cat.id)
    .order('display_order');
  const names = (subs || [])
    .filter((s: any) => s.is_cocktail_fed && !s.is_hidden && s.display_name)
    .map((s: any) => s.display_name);
  return { bookName, subs: names };
}

async function processInBackground(
  supabase: any,
  anthropicApiKey: string,
  body: ParseRequest,
  targetSlot: number,
): Promise<void> {
  const { file_url, upload_id, user_id, organization_id, additional_image_urls = [] } = body;
  const media_type = body.media_type || 'application/pdf';
  const source_type = body.source_type || (media_type.startsWith('image/') ? 'image' : 'pdf');
  const page_count = body.page_count || (1 + (additional_image_urls?.length || 0));
  try {
    console.log(`[bg] Starting libations parse for upload ${upload_id} (${source_type}, ${page_count} page(s), book ${targetSlot})`);
    await supabase.from('menu_uploads').update({ status: 'processing' }).eq('id', upload_id);

    let restaurantName: string | undefined;
    const { data: orgData } = await supabase.from('organizations').select('name').eq('id', organization_id).single();
    if (orgData?.name) restaurantName = orgData.name;
    const { bookName, subs } = await buildBookContext(supabase, organization_id, targetSlot);

    const primaryFile = await fetchFileAsBase64(supabase, file_url);
    console.log(`Primary file fetched (${media_type}), ${primaryFile.byteLength} bytes`);
    const additionalFiles: Array<{ base64: string }> = [];
    for (let i = 0; i < additional_image_urls.length; i++) {
      additionalFiles.push(await fetchFileAsBase64(supabase, additional_image_urls[i]));
    }

    const isImage = media_type.startsWith('image/');
    const contentBlocks: any[] = [];
    if (isImage) {
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type, data: primaryFile.base64 } });
      for (const extra of additionalFiles) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type, data: extra.base64 } });
      }
    } else {
      contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: primaryFile.base64 } });
    }
    contentBlocks.push({ type: 'text', text: buildLibationsPrompt(restaurantName, bookName, subs) });

    // Same vision model + shape as parse-menu — accuracy matters most here.
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 32000,
        messages: [{ role: 'user', content: contentBlocks }],
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
    const usage = claudeData.usage || {};
    console.log(`Claude response received, length: ${responseText.length}, stop_reason: ${stopReason}`);
    console.log(`[bg] Claude token usage: input=${usage.input_tokens ?? '?'} output=${usage.output_tokens ?? '?'}`);

    if (stopReason === 'max_tokens') {
      throw new Error('This recipe sheet is too large for one upload — the AI response was cut off. Try uploading fewer pages at a time.');
    }

    let parsed;
    try {
      const jsonStr = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (_) {
      console.error('Failed to parse Claude response:', responseText.substring(0, 500));
      throw new Error('Could not read the recipes from this file. Make sure it clearly shows the recipe text.');
    }

    if (!parsed || !Array.isArray(parsed.sections)) {
      throw new Error('No recipes could be found in this file.');
    }
    // Normalise defensively: every section an array of recipes, every recipe a
    // name + an ingredient list (the review relies on the shape).
    parsed.sections = parsed.sections
      .filter((s: any) => s && Array.isArray(s.recipes))
      .map((s: any) => ({
        name: String(s.name || '').trim(),
        recipes: s.recipes
          .filter((r: any) => r && String(r.name || '').trim())
          .map((r: any) => ({
            name: String(r.name || '').trim(),
            price: String(r.price || '').trim(),
            glassware: String(r.glassware || '').trim(),
            garnish: String(r.garnish || '').trim(),
            ingredients: (Array.isArray(r.ingredients) ? r.ingredients : [])
              .map((i: any) => ({ amount: String(i?.amount || '').trim(), ingredient: String(i?.ingredient || '').trim() }))
              .filter((i: any) => i.ingredient),
            procedure: String(r.procedure || '').trim(),
          })),
      }))
      .filter((s: any) => s.recipes.length > 0);
    const recipeCount = parsed.sections.reduce((n: number, s: any) => n + s.recipes.length, 0);
    if (recipeCount === 0) {
      throw new Error('No recipes could be found in this file.');
    }

    // Charge the shared pool now that the AI work succeeded (p_kind 'libations'
    // never spends the free first MENU scan). Insufficient here is only the rare
    // concurrent-upload race — fail it to keep billing honest.
    let creditsCharged = 0;
    const { data: charge } = await supabase.rpc('consume_menu_upload_credits', {
      p_user_id: user_id,
      p_organization_id: organization_id,
      p_source_type: source_type,
      p_page_count: page_count,
      p_kind: 'libations',
    });
    if (charge?.ok) {
      creditsCharged = charge.charged || 0;
    } else if (charge?.reason === 'insufficient_credits') {
      throw new Error('You’re out of upload credits this month. They reset next month, or upgrade for more.');
    } else {
      console.warn('consume_menu_upload_credits not ok:', JSON.stringify(charge));
    }

    await supabase
      .from('menu_uploads')
      .update({
        status: 'ready_for_review',
        parsed_result: parsed,
        page_count,
        source_type,
        credits_charged: creditsCharged,
        was_free: false,
        input_tokens: usage.input_tokens ?? null,
        output_tokens: usage.output_tokens ?? null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload_id);

    console.log(`[bg] Libations parse complete: ${parsed.sections.length} sections, ${recipeCount} recipes`);
  } catch (error) {
    console.error('[bg] Libations parse error:', error);
    if (upload_id) {
      try {
        await supabase
          .from('menu_uploads')
          .update({ status: 'failed', error_message: error.message || 'Unknown error', updated_at: new Date().toISOString() })
          .eq('id', upload_id);
      } catch (_) {
        console.error('[bg] Failed to update upload status:', _);
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let upload_id = '';
  let uploadOrgVerified = false; // gates every failure-path write to menu_uploads
  try {
    const body = (await req.json()) as ParseRequest;
    upload_id = body.upload_id || '';

    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!body.file_url || !upload_id || !body.user_id || !body.organization_id) {
      throw new Error('Missing required fields: file_url, upload_id, user_id, organization_id');
    }

    // Org-scope validation, part 1: the upload row must be the caller org's own
    // LIBATIONS upload with its book chosen BEFORE any status write targets it.
    const { data: uploadRow } = await supabase
      .from('menu_uploads')
      .select('organization_id, upload_kind, target_menu_slot')
      .eq('id', upload_id)
      .maybeSingle();
    if (!uploadRow || uploadRow.organization_id !== body.organization_id || uploadRow.upload_kind !== 'libations') {
      return new Response(
        JSON.stringify({ success: false, error: 'Upload not found for your organization.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }
    uploadOrgVerified = true;
    const targetSlot = Number(uploadRow.target_menu_slot);
    if (targetSlot !== 1 && targetSlot !== 2) {
      throw new Error('Pick which libations book these recipes belong to before scanning.');
    }

    // Server-side permission verification (custom auth — do NOT trust the
    // Authorization header): the org owner, or a manager whose org holds the
    // premium.ai_libation_upload grant (_may_upload_libations is the same rule
    // inside the upload RPCs).
    const { data: caller, error: callerErr } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', body.user_id)
      .single();
    let callerMayUpload =
      !!caller && caller.organization_id === body.organization_id && caller.role === 'owner';
    if (!callerMayUpload && caller && caller.organization_id === body.organization_id && caller.role === 'manager') {
      const { data: perm } = await supabase
        .from('manager_permissions')
        .select('granted')
        .eq('organization_id', body.organization_id)
        .eq('permission_key', 'premium.ai_libation_upload')
        .maybeSingle();
      callerMayUpload = perm?.granted === true;
    }
    if (callerErr || !caller || !callerMayUpload) {
      if (caller?.organization_id === body.organization_id) {
        try {
          await supabase
            .from('menu_uploads')
            .update({ status: 'failed', error_message: 'Not authorized', updated_at: new Date().toISOString() })
            .eq('id', upload_id);
        } catch (_) { /* noop */ }
      }
      return new Response(
        JSON.stringify({ success: false, error: 'You do not have permission to upload libation recipes.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Org-scope validation, part 2: every storage URL must live in the
    // menu-uploads bucket under the caller org's own prefix.
    for (const u of [body.file_url, ...(body.additional_image_urls || [])]) {
      if (!storageUrlInOrg(u, body.organization_id)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Recipe file URL is not an upload belonging to your organization.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    const task = processInBackground(supabase, anthropicApiKey, body, targetSlot);
    // @ts-ignore EdgeRuntime is a Supabase Edge Runtime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else {
      task.catch((err) => console.error('[bg] Background task rejected:', err));
    }

    return new Response(
      JSON.stringify({ accepted: true, upload_id, status: 'processing', message: 'Libations parse started — poll menu_uploads.status.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202 }
    );
  } catch (error) {
    console.error('Request validation error:', error);
    if (upload_id && uploadOrgVerified) {
      try {
        await supabase
          .from('menu_uploads')
          .update({ status: 'failed', error_message: error.message || 'Unknown error', updated_at: new Date().toISOString() })
          .eq('id', upload_id);
      } catch (_) { /* noop */ }
    }
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal error starting libations parse' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
