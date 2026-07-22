// @ts-nocheck
//
// import-google-reviews — SUBMITS async Outscraper review scrapes and returns
// immediately (it no longer waits for the scrape, which used to 504 when
// Outscraper ran past Supabase's ~150s edge limit). Each submit:
//   1. inserts a pending_review_imports row (so the callback can always find it),
//   2. calls Outscraper reviews-v3 with async=true + a webhook URL pointing at
//      the google-reviews-webhook function (org + secret + pending id in the URL),
//   3. records the Outscraper request id / results_location, returns { queued }.
// Results are ingested later by google-reviews-webhook (primary) or by the
// reconcile sweep here (safety net, runs inline on the Mon/Thu cron and polls
// results_location for any pending row a webhook never landed for).
//
// Entry modes (unchanged): manual (body.user_id = manager/owner), single-org
// cron (source=cron + organization_id), cron_all (source=cron, no org). New:
// source=cron + mode=reconcile runs only the sweep.
//
// NOTE: translateBatch / extractReviews / ingestReviews are duplicated verbatim
// in google-reviews-webhook/index.ts. Edge functions deploy independently and
// can't share a module via MCP deploy — keep both copies BYTE-IDENTICAL.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const DEFAULT_GOOGLE_MAPS_QUERY = "McLoone's Boathouse, 9 Cherry Lane, West Orange, NJ 07052";
const DEFAULT_REVIEWS_LIMIT = 10;
const BACKFILL_REVIEWS_LIMIT = 15;

// Reconcile sweep tuning.
const RECONCILE_AGE_MINUTES = 10;   // only poll rows at least this old
const RECONCILE_EXPIRY_HOURS = 4;   // Outscraper results expire ~4h -> give up
const RECONCILE_MAX_ATTEMPTS = 5;   // poll attempts before marking failed
const RECONCILE_BATCH = 50;         // bound work per run

// ---------------------------------------------------------------------------
// Shared ingest helpers (keep in sync with google-reviews-webhook/index.ts)
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
async function getWebhookSecret(adminClient: any): Promise<string | null> {
  const { data } = await adminClient
    .from('service_config')
    .select('value')
    .eq('key', 'google_reviews_webhook_secret')
    .single();
  return data?.value || null;
}

/**
 * Submit ONE async Outscraper request for an org's query. Inserts the pending
 * row first (so the webhook can never arrive before the row exists), then fires
 * Outscraper with a webhook URL carrying org + secret + pending id. Records the
 * request id / results_location. Returns immediately — NO scrape wait, NO count.
 * Throws on submit failure (caller reacts / cron_all keeps going).
 */
async function submitReviewImport(
  orgId: string | null,
  query: string,
  adminClient: any,
  outscrapterKey: string,
  isBackfill: boolean,
  source: string,
  webhookSecret: string
): Promise<{ pending_id: string; outscraper_request_id: string | null; queued: boolean }> {
  const reviewsLimit = isBackfill ? BACKFILL_REVIEWS_LIMIT : DEFAULT_REVIEWS_LIMIT;

  // 1. Pending row FIRST.
  const { data: pendingRow, error: pErr } = await adminClient
    .from('pending_review_imports')
    .insert({ organization_id: orgId, status: 'pending', is_backfill: isBackfill, source })
    .select('id')
    .single();
  if (pErr || !pendingRow) {
    throw new Error(`Failed to create pending import row: ${pErr?.message || 'unknown'}`);
  }
  const pendingId = pendingRow.id as string;

  // 2. Webhook URL (org + secret + pending id preserved by Outscraper's callback).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const webhookUrl =
    `${supabaseUrl}/functions/v1/google-reviews-webhook` +
    `?org=${encodeURIComponent(orgId ?? '-')}` +
    `&secret=${encodeURIComponent(webhookSecret)}` +
    `&pending=${encodeURIComponent(pendingId)}`;

  // 3. Submit async.
  const outscrapterUrl = new URL('https://api.app.outscraper.com/maps/reviews-v3');
  outscrapterUrl.searchParams.set('query', query);
  outscrapterUrl.searchParams.set('reviewsLimit', String(reviewsLimit));
  outscrapterUrl.searchParams.set('sort', 'newest');
  outscrapterUrl.searchParams.set('language', 'en');
  outscrapterUrl.searchParams.set('async', 'true');
  outscrapterUrl.searchParams.set('webhook', webhookUrl);

  console.log(`Submitting async import: org=${orgId}, query="${query}", limit=${reviewsLimit}, pending=${pendingId}`);

  let resp: Response;
  try {
    resp = await fetch(outscrapterUrl.toString(), { headers: { 'X-API-KEY': outscrapterKey } });
  } catch (e: any) {
    await adminClient
      .from('pending_review_imports')
      .update({ status: 'failed', last_error: `submit fetch failed: ${e?.message || e}`, updated_at: new Date().toISOString() })
      .eq('id', pendingId);
    throw e;
  }

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('Outscraper submit error:', resp.status, errorText);
    await adminClient
      .from('pending_review_imports')
      .update({ status: 'failed', last_error: `Outscraper ${resp.status}: ${String(errorText).slice(0, 500)}`, updated_at: new Date().toISOString() })
      .eq('id', pendingId);
    throw new Error(`Outscraper API error: ${resp.status}`);
  }

  const data = await resp.json();
  const requestId = data?.id || data?.request_id || null;
  const resultsLocation = data?.results_location || data?.results_url || null;

  await adminClient
    .from('pending_review_imports')
    .update({ outscraper_request_id: requestId, results_location: resultsLocation, updated_at: new Date().toISOString() })
    .eq('id', pendingId);

  return { pending_id: pendingId, outscraper_request_id: requestId, queued: true };
}

/**
 * Reconcile sweep (safety net): for each pending row older than the threshold,
 * GET its results_location; ingest if ready, age out to failed past expiry/
 * attempts. Idempotent with the webhook via the atomic pending->done claim.
 */
async function reconcilePendingImports(
  adminClient: any,
  outscrapterKey: string
): Promise<{ reconciled: number; ingested: number; failed: number }> {
  const cutoff = new Date(Date.now() - RECONCILE_AGE_MINUTES * 60 * 1000).toISOString();
  const { data: rows } = await adminClient
    .from('pending_review_imports')
    .select('*')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(RECONCILE_BATCH);

  if (!rows || rows.length === 0) return { reconciled: 0, ingested: 0, failed: 0 };

  let ingested = 0;
  let failed = 0;
  const expiryMs = RECONCILE_EXPIRY_HOURS * 60 * 60 * 1000;

  for (const row of rows) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();

    if (ageMs > expiryMs) {
      await adminClient
        .from('pending_review_imports')
        .update({ status: 'failed', last_error: 'expired (Outscraper results no longer available)', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      failed++;
      continue;
    }

    const bumpAttempt = async (lastError: string) => {
      const attempts = (row.attempts || 0) + 1;
      const status = attempts >= RECONCILE_MAX_ATTEMPTS ? 'failed' : 'pending';
      await adminClient
        .from('pending_review_imports')
        .update({ attempts, status, last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (status === 'failed') failed++;
    };

    if (!row.results_location) {
      await bumpAttempt('no results_location to poll');
      continue;
    }

    try {
      const resp = await fetch(row.results_location, { headers: { 'X-API-KEY': outscrapterKey } });
      if (!resp.ok) {
        await bumpAttempt(`poll ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      const status = data?.status ? String(data.status).toLowerCase() : '';
      if (status === 'pending') {
        await bumpAttempt('still pending');
        continue;
      }

      // Ready — atomic claim before ingest (webhook may race us).
      const { data: claimed } = await adminClient
        .from('pending_review_imports')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');
      if (!claimed || claimed.length === 0) continue; // webhook beat us

      const reviews = extractReviews(data);
      if (reviews.length === 0) {
        await adminClient
          .from('pending_review_imports')
          .update({ status: 'empty', reviews_upserted: 0, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }
      const upserted = await ingestReviews(row.organization_id ?? null, reviews, adminClient);
      await adminClient
        .from('pending_review_imports')
        .update({ reviews_upserted: upserted, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      ingested++;
    } catch (e: any) {
      // Revert to pending (or fail after cap) so we don't strand the row.
      await bumpAttempt(`sweep error: ${e?.message || e}`);
    }
  }

  return { reconciled: rows.length, ingested, failed };
}

/**
 * cron_all mode: SUBMIT an async refresh for every org that (a) has a non-empty
 * google_maps_query and (b) is on an active paid plan (premium, or trial with a
 * future trial_end_date). Then run the reconcile sweep inline so the single
 * Mon/Thu run both refreshes everyone AND recovers any stragglers.
 */
async function importReviewsForAllOrgs(
  adminClient: any,
  outscrapterKey: string,
  isBackfill: boolean,
  webhookSecret: string
): Promise<Response> {
  const { data: orgRows, error: orgErr } = await adminClient
    .from('organizations')
    .select('id, name, google_maps_query, organization_subscriptions(subscription_tier, trial_end_date)')
    .not('google_maps_query', 'is', null);

  if (orgErr) {
    console.error('cron_all org query error:', orgErr);
    throw new Error(`Database error: ${orgErr.message}`);
  }

  const nowMs = Date.now();
  const qualifying = (orgRows || []).filter((o: any) => {
    const q = (o.google_maps_query || '').trim();
    if (!q) return false;
    const subs = o.organization_subscriptions;
    const sub = Array.isArray(subs) ? subs[0] : subs;
    if (!sub) return false;
    if (sub.subscription_tier === 'premium') return true;
    if (
      sub.subscription_tier === 'trial' &&
      sub.trial_end_date &&
      new Date(sub.trial_end_date).getTime() > nowMs
    ) {
      return true;
    }
    return false;
  });

  console.log(`cron_all: ${qualifying.length} qualifying org(s) of ${orgRows?.length || 0} with a query`);

  const details: any[] = [];
  let submitted = 0;
  let failed = 0;

  for (const o of qualifying) {
    try {
      const result = await submitReviewImport(
        o.id,
        (o.google_maps_query || '').trim(),
        adminClient,
        outscrapterKey,
        isBackfill,
        'cron_all',
        webhookSecret
      );
      submitted++;
      details.push({ organization_id: o.id, name: o.name, success: true, ...result });
    } catch (err: any) {
      failed++;
      console.error(`cron_all: org ${o.id} (${o.name}) submit failed:`, err?.message || err);
      details.push({ organization_id: o.id, name: o.name, success: false, error: err?.message || String(err) });
    }
  }

  // Recover any earlier requests a webhook never landed for.
  let sweep = { reconciled: 0, ingested: 0, failed: 0 };
  try {
    sweep = await reconcilePendingImports(adminClient, outscrapterKey);
  } catch (e: any) {
    console.error('cron_all reconcile sweep error:', e?.message || e);
  }

  console.log(`cron_all complete: ${submitted} submitted, ${failed} failed; sweep ${JSON.stringify(sweep)}`);

  return new Response(
    JSON.stringify({
      success: true,
      source: 'cron',
      mode: 'cron_all',
      orgs_processed: qualifying.length,
      orgs_submitted: submitted,
      orgs_failed: failed,
      sweep,
      details,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const outscrapterKey = Deno.env.get('OUTSCRAPER_API_KEY');
    if (!outscrapterKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OUTSCRAPER_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // --- Parse body first (needed for user_id auth) ---
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body (e.g. cron call)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // --- Auth: cron secret OR manager/owner user_id ---
    const cronSecret = Deno.env.get('CRON_SECRET');
    const requestCronSecret = req.headers.get('x-cron-secret');
    let isAuthorized = false;
    let source = 'unknown';

    if (cronSecret && requestCronSecret === cronSecret) {
      isAuthorized = true;
      source = 'cron';
    }

    if (!isAuthorized && body.user_id) {
      const { data: userData } = await adminClient
        .from('users')
        .select('role, organization_id')
        .eq('id', body.user_id)
        .single();
      const isManager = userData?.role === 'manager' || userData?.role === 'owner';
      // Manual callers may ONLY import for their OWN org — require an explicit
      // organization_id that matches the caller's, or an anon with a known
      // manager id could trigger paid Outscraper scrapes for any/every org.
      const orgMatch =
        !!userData?.organization_id &&
        !!body.organization_id &&
        userData.organization_id === body.organization_id;
      if (isManager && orgMatch) {
        isAuthorized = true;
        source = 'manual';
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const webhookSecret = await getWebhookSecret(adminClient);
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook secret not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const isBackfill = body.backfill === true;
    const organizationId = body.organization_id;

    // --- Reconcile-only mode (optional dedicated cron): source=cron + mode=reconcile ---
    if (source === 'cron' && body.mode === 'reconcile') {
      const sweep = await reconcilePendingImports(adminClient, outscrapterKey);
      return new Response(
        JSON.stringify({ success: true, source: 'cron', mode: 'reconcile', ...sweep }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // --- cron_all mode: a cron call with no specific org submits an async
    //     refresh for every qualifying org + reconciles stragglers ---
    if (source === 'cron' && !organizationId) {
      return await importReviewsForAllOrgs(adminClient, outscrapterKey, isBackfill, webhookSecret);
    }

    // --- Single-org mode: manual refresh, or a cron call targeting one org.
    //     Resolve that org's query; fall back to McLoone's default query. ---
    let googleMapsQuery = DEFAULT_GOOGLE_MAPS_QUERY;

    if (organizationId) {
      const { data: orgData } = await adminClient
        .from('organizations')
        .select('google_maps_query')
        .eq('id', organizationId)
        .single();
      if (orgData?.google_maps_query) {
        googleMapsQuery = orgData.google_maps_query;
      }
    }

    const result = await submitReviewImport(
      organizationId ?? null,
      googleMapsQuery,
      adminClient,
      outscrapterKey,
      isBackfill,
      source,
      webhookSecret
    );

    return new Response(
      JSON.stringify({ success: true, source, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
