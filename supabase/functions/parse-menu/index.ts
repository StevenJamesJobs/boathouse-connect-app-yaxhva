// @ts-nocheck
// AI Menu Upload — parse a menu (PDF/photos) with Claude vision into our
// category->subcategory->item structure, then PARK the result for human review.
//
// Mirrors parse-schedule (background task + 202 + client polls status), but:
//   * verifies the caller is the org OWNER server-side (custom auth — never trust
//     the Authorization header; load users by user_id with the service role key);
//   * uses claude-opus-4-8 (latest vision) and feeds the org's EXISTING category
//     tree into the prompt so the AI reuses real category names;
//   * does NOT write to menu_items — it stores parsed_result on menu_uploads and
//     sets status='ready_for_review'. The owner reviews/edits, then the client
//     calls apply_parsed_menu to write. Credits are consumed after a successful
//     parse (the AI work), free-first bypassing the charge.
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

function buildMenuPrompt(restaurantName: string, existingTree: string): string {
  const name = restaurantName || 'this restaurant';
  return `You are parsing a restaurant menu for ${name} into a structured format for a restaurant staff app. You are given one or more menu pages (PDF or photos). Read EVERY page carefully — what a human sees printed on the page.

Extract every FOOD item and every WINE item, grouped into categories and (where the menu has them) subcategories.

Return ONLY valid JSON (no markdown, no commentary) with EXACTLY this structure:

{
  "categories": [
    {
      "name": "Category name (e.g. Appetizers, Salads, Entrees, Sides, Desserts, Wine)",
      "subcategories": [
        {
          "name": "Subcategory name, or an empty string if this category has no subcategories",
          "items": [
            {
              "name": "Item name",
              "description": "Description / ingredients as printed, or empty if none",
              "price": "Price exactly as printed including the symbol (for example $14, 14, or MP), or empty if there is none or if it is a wine priced by glass/bottle",
              "is_gluten_free": false,
              "is_vegetarian": false,
              "glass_price": "wine by-the-glass price, or empty",
              "bottle_price": "wine by-the-bottle price, or empty"
            }
          ]
        }
      ]
    }
  ],
  "flagged_cocktails": ["names of any cocktails / mixed drinks you see — do NOT put these in categories"]
}

REUSE EXISTING CATEGORIES — this restaurant already has these categories/subcategories. When a menu section matches one of these, use the EXACT existing name (capitalization and spelling). Do NOT invent a near-duplicate (e.g. don't create "Apps" when "Appetizers" already exists):
${existingTree || '(none yet — create sensible category names from the menu)'}

RULES:
- Extract FOOD and WINE only.
- WINE: place wines under a "Wine" category (reuse it if listed above). If a wine shows a by-the-glass and/or by-the-bottle price, put those in glass_price / bottle_price and leave "price" as "". A single-price wine uses "price".
- COCKTAILS / mixed drinks / signature cocktails / martinis / sangria / spirits / draft or bottled beer: do NOT add these as items. List any cocktail names you see in "flagged_cocktails". (They are managed separately in the app's Bartender Recipe editors.)
- Set is_gluten_free or is_vegetarian to true ONLY when the menu explicitly marks it (GF, V, "gluten-free", "vegetarian", a legend symbol). Otherwise false.
- Preserve prices exactly as printed (keep $, "MP", "Market Price", etc.). Never invent a price.
- Group items the way the menu groups them. Use a subcategory only when the menu clearly has one; otherwise use a single subcategory with name "".
- Return ALL items from ALL pages — do not skip anything. Return ONLY the JSON object.`;
}

// S50 strict (post-flip): service-role storage download is the ONLY path.
// The public-URL fetch fallback is GONE — buckets are private and stored URLs
// are opaque identifiers the function parses bucket/path out of.
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

// Build a human-readable list of the org's existing categories + subcategories so
// the AI reuses real names instead of inventing near-duplicates.
async function buildExistingTree(supabase: any, organizationId: string): Promise<string> {
  const { data: cats } = await supabase
    .from('menu_categories')
    .select('id, display_name, menu_slot')
    .eq('organization_id', organizationId);
  const { data: subs } = await supabase
    .from('menu_subcategories')
    .select('display_name, category_id')
    .eq('organization_id', organizationId);
  if (!cats || cats.length === 0) return '';
  // Dedupe category names across slots (the AI only needs the vocabulary).
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of cats) {
    const key = (c.display_name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const subNames = (subs || [])
      .filter((s: any) => s.category_id === c.id && s.display_name)
      .map((s: any) => s.display_name);
    lines.push(subNames.length ? `- ${c.display_name} (subcategories: ${subNames.join(', ')})` : `- ${c.display_name}`);
  }
  return lines.join('\n');
}

async function processMenuInBackground(
  supabase: any,
  anthropicApiKey: string,
  body: ParseRequest
): Promise<void> {
  const { file_url, upload_id, user_id, organization_id, additional_image_urls = [] } = body;
  const media_type = body.media_type || 'application/pdf';
  const source_type = body.source_type || (media_type.startsWith('image/') ? 'image' : 'pdf');
  const page_count = body.page_count || (1 + (additional_image_urls?.length || 0));
  try {
    console.log(`[bg] Starting menu parse for upload ${upload_id} (${source_type}, ${page_count} page(s))`);
    await supabase.from('menu_uploads').update({ status: 'processing' }).eq('id', upload_id);

    // Look up org name + existing category tree for the prompt.
    let restaurantName: string | undefined;
    const { data: orgData } = await supabase
      .from('organizations').select('name').eq('id', organization_id).single();
    if (orgData?.name) restaurantName = orgData.name;
    const existingTree = await buildExistingTree(supabase, organization_id);

    // Fetch the menu file(s) -> base64.
    const primaryFile = await fetchFileAsBase64(supabase, file_url);
    console.log(`Primary file fetched (${media_type}), ${primaryFile.byteLength} bytes`);
    const additionalFiles: Array<{ base64: string }> = [];
    for (let i = 0; i < additional_image_urls.length; i++) {
      additionalFiles.push(await fetchFileAsBase64(supabase, additional_image_urls[i]));
    }

    // Build content blocks (vision): PDF document or one image block per page.
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
    contentBlocks.push({ type: 'text', text: buildMenuPrompt(restaurantName, existingTree) });

    // Latest vision model — accuracy matters most here.
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
      throw new Error('This menu is too large for one upload — the AI response was cut off. Try uploading fewer pages at a time.');
    }

    let parsed;
    try {
      const jsonStr = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (_) {
      console.error('Failed to parse Claude response:', responseText.substring(0, 500));
      throw new Error('Could not read the menu from this file. Make sure it clearly shows the menu text.');
    }

    if (!parsed || !Array.isArray(parsed.categories)) {
      throw new Error('No menu items could be found in this file.');
    }
    if (!Array.isArray(parsed.flagged_cocktails)) parsed.flagged_cocktails = [];

    const itemCount = parsed.categories.reduce(
      (n: number, c: any) => n + (c.subcategories || []).reduce((m: number, s: any) => m + (s.items || []).length, 0),
      0
    );

    // Charge credits now that the AI work succeeded (free-first bypasses the charge).
    // The client enforces credits before uploading, so insufficient here is only a
    // rare concurrent-upload race — fail it (don't hand out a free parse) to keep
    // billing honest. Other non-ok reasons (owner_only / website) can't occur after
    // the owner check, so log + proceed if they somehow do.
    let creditsCharged = 0;
    let wasFree = false;
    const { data: charge } = await supabase.rpc('consume_menu_upload_credits', {
      p_user_id: user_id,
      p_organization_id: organization_id,
      p_source_type: source_type,
      p_page_count: page_count,
    });
    if (charge?.ok) {
      creditsCharged = charge.charged || 0;
      wasFree = !!charge.free_used;
    } else if (charge?.reason === 'insufficient_credits') {
      throw new Error('You’re out of menu-upload credits this month. They reset next month, or upgrade for more.');
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
        was_free: wasFree,
        input_tokens: usage.input_tokens ?? null,
        output_tokens: usage.output_tokens ?? null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload_id);

    console.log(`[bg] Menu parse complete: ${parsed.categories.length} categories, ${itemCount} items, ${parsed.flagged_cocktails.length} flagged cocktails`);
  } catch (error) {
    console.error('[bg] Menu parse error:', error);
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
  try {
    const body = (await req.json()) as ParseRequest;
    upload_id = body.upload_id || '';

    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!body.file_url || !upload_id || !body.user_id || !body.organization_id) {
      throw new Error('Missing required fields: file_url, upload_id, user_id, organization_id');
    }

    // Server-side OWNER verification (custom auth — do NOT trust the Authorization
    // header). Only the org owner may run an AI menu upload.
    const { data: caller, error: callerErr } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', body.user_id)
      .single();
    if (callerErr || !caller || caller.role !== 'owner' || caller.organization_id !== body.organization_id) {
      // Mark the upload failed so the client stops polling.
      try {
        await supabase
          .from('menu_uploads')
          .update({ status: 'failed', error_message: 'Not authorized', updated_at: new Date().toISOString() })
          .eq('id', upload_id);
      } catch (_) { /* noop */ }
      return new Response(
        JSON.stringify({ success: false, error: 'Only the restaurant owner can upload a menu.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const task = processMenuInBackground(supabase, anthropicApiKey, body);
    // @ts-ignore EdgeRuntime is a Supabase Edge Runtime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else {
      task.catch((err) => console.error('[bg] Background task rejected:', err));
    }

    return new Response(
      JSON.stringify({ accepted: true, upload_id, status: 'processing', message: 'Menu parse started — poll menu_uploads.status.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202 }
    );
  } catch (error) {
    console.error('Request validation error:', error);
    if (upload_id) {
      try {
        await supabase
          .from('menu_uploads')
          .update({ status: 'failed', error_message: error.message || 'Unknown error', updated_at: new Date().toISOString() })
          .eq('id', upload_id);
      } catch (_) { /* noop */ }
    }
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal error starting menu parse' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
