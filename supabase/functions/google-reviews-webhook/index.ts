// @ts-nocheck
//
// google-reviews-webhook — receives Outscraper's async callback and ingests the
// scraped reviews. Outscraper POSTs here (with the result data, or at least a
// results_location) once a reviews-v3 request submitted by import-google-reviews
// finishes. Auth = a shared secret passed in the webhook URL query string
// (?secret=...), validated against public.service_config. verify_jwt MUST stay
// false (Outscraper sends no Supabase auth header).
//
// NOTE: translateBatch / extractReviews / ingestReviews are duplicated verbatim
// in import-google-reviews/index.ts (the reconcile sweep uses them too). Edge
// functions are deployed independently and can't share a module via MCP deploy,
// so keep these two copies BYTE-IDENTICAL when changing ingest behavior.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Shared ingest helpers (keep in sync with import-google-reviews/index.ts)
// ---------------------------------------------------------------------------
async function translateBatch(texts: string[], apiKey: string): Promise<string[]> {
  const nonEmpty = texts.filter((t) => t?.trim());
  if (nonEmpty.length === 0) return texts.map(() => '');

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: nonEmpty, target: 'es', source: 'en', format: 'text' }),
      }
    );

    if (!response.ok) {
      console.error('Translation API error:', response.status, await response.text());
      return texts.map(() => '');
    }

    const data = await response.json();
    const translated = data.data.translations.map((t: any) => t.translatedText);

    let idx = 0;
    return texts.map((original) => (original?.trim() ? translated[idx++] || '' : ''));
  } catch (error) {
    console.error('Translation failed:', error);
    return texts.map(() => '');
  }
}

// Pull the reviews array out of an Outscraper payload (webhook body OR the GET
// /requests/{id} results body). data[0] is the first place; it's either the
// reviews array directly or an object with a reviews_data field.
function extractReviews(payload: any): any[] {
  const placeData = payload?.data?.[0];
  if (Array.isArray(placeData)) return placeData;
  if (placeData?.reviews_data) return placeData.reviews_data;
  return [];
}

// Translate review/owner text to Spanish and upsert into google_reviews.
// When orgId is null the BEFORE INSERT trigger trg_default_org_id_google_reviews
// fills in McLoone's org (legacy default-query path). Returns rows upserted.
async function ingestReviews(orgId: string | null, reviews: any[], adminClient: any): Promise<number> {
  const translateApiKey = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
  const reviewTexts = reviews.map((r: any) => r.review_text || '');
  const ownerAnswers = reviews.map((r: any) => r.owner_answer || '');

  let reviewTextsEs: string[] = reviewTexts.map(() => '');
  let ownerAnswersEs: string[] = ownerAnswers.map(() => '');

  if (translateApiKey) {
    const allTexts = [...reviewTexts, ...ownerAnswers];
    const allTranslated = await translateBatch(allTexts, translateApiKey);
    reviewTextsEs = allTranslated.slice(0, reviews.length);
    ownerAnswersEs = allTranslated.slice(reviews.length);
  } else {
    console.warn('GOOGLE_TRANSLATE_API_KEY not configured, skipping translation');
  }

  const rows = [];
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    if (!r.review_id) continue;

    rows.push({
      review_id: String(r.review_id),
      author_title: r.author_title || 'Anonymous',
      author_image: r.author_image || null,
      review_rating: r.review_rating,
      review_text: r.review_text || null,
      review_text_es: reviewTextsEs[i] || null,
      review_datetime_utc: r.review_datetime_utc,
      owner_answer: r.owner_answer || null,
      owner_answer_es: ownerAnswersEs[i] || null,
      updated_at: new Date().toISOString(),
      ...(orgId ? { organization_id: orgId } : {}),
    });
  }

  if (rows.length === 0) return 0;

  const { data, error } = await adminClient
    .from('google_reviews')
    .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    console.error('Upsert error:', error);
    throw new Error(`Database error: ${error.message}`);
  }

  return data?.length || 0;
}

// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let pendingId: string | null = null;

  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const orgParam = url.searchParams.get('org'); // org uuid, or '-' for legacy null-org
    pendingId = url.searchParams.get('pending');

    // --- Auth: shared secret from service_config, passed in the URL ---
    const { data: cfg } = await adminClient
      .from('service_config')
      .select('value')
      .eq('key', 'google_reviews_webhook_secret')
      .single();
    const webhookSecret = cfg?.value;

    if (!webhookSecret || secret !== webhookSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // --- Body (tolerant: Outscraper may deliver data inline) ---
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // no/empty body
    }

    // --- Resolve the pending row (by id, fallback to Outscraper request id) ---
    let pending: any = null;
    if (pendingId) {
      const { data } = await adminClient
        .from('pending_review_imports')
        .select('*')
        .eq('id', pendingId)
        .maybeSingle();
      pending = data;
    }
    if (!pending && body?.id) {
      const { data } = await adminClient
        .from('pending_review_imports')
        .select('*')
        .eq('outscraper_request_id', String(body.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      pending = data;
      if (pending) pendingId = pending.id;
    }

    // --- Atomic claim: only one worker ingests (webhook vs reconcile sweep) ---
    if (pending) {
      const { data: claimed } = await adminClient
        .from('pending_review_imports')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', pending.id)
        .eq('status', 'pending')
        .select('id');
      if (!claimed || claimed.length === 0) {
        // Already processed (duplicate callback or the sweep beat us).
        return new Response(
          JSON.stringify({ success: true, alreadyProcessed: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    const orgId = orgParam && orgParam !== '-' ? orgParam : (pending?.organization_id ?? null);

    // --- Get the reviews: inline body first, else GET results_location ---
    let reviews = extractReviews(body);
    if (reviews.length === 0) {
      const loc = pending?.results_location || body?.results_location;
      if (loc) {
        const key = Deno.env.get('OUTSCRAPER_API_KEY');
        const resp = await fetch(loc, { headers: { 'X-API-KEY': key ?? '' } });
        if (resp.ok) {
          const locData = await resp.json();
          reviews = extractReviews(locData);
        } else {
          console.error('results_location fetch failed:', resp.status);
        }
      }
    }

    if (reviews.length === 0) {
      if (pendingId) {
        await adminClient
          .from('pending_review_imports')
          .update({ status: 'empty', reviews_upserted: 0, updated_at: new Date().toISOString() })
          .eq('id', pendingId);
      }
      return new Response(
        JSON.stringify({ success: true, reviews_upserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const upserted = await ingestReviews(orgId, reviews, adminClient);

    if (pendingId) {
      await adminClient
        .from('pending_review_imports')
        .update({ reviews_upserted: upserted, updated_at: new Date().toISOString() })
        .eq('id', pendingId);
    }

    console.log(`Webhook ingested ${upserted} reviews for org=${orgId} (pending=${pendingId})`);
    return new Response(
      JSON.stringify({ success: true, reviews_upserted: upserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    // Revert the claim to 'pending' so the reconcile sweep can retry (and
    // eventually age it out to 'failed'). Returning 200 avoids an Outscraper
    // retry storm; the sweep is the recovery path.
    if (pendingId) {
      try {
        await adminClient
          .from('pending_review_imports')
          .update({ status: 'pending', last_error: String(error?.message || error), updated_at: new Date().toISOString() })
          .eq('id', pendingId)
          .eq('status', 'done');
      } catch (_) {
        // best effort
      }
    }
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
