// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const DEFAULT_GOOGLE_MAPS_QUERY = "McLoone's Boathouse, 9 Cherry Lane, West Orange, NJ 07052";
const DEFAULT_REVIEWS_LIMIT = 10;
const BACKFILL_REVIEWS_LIMIT = 15;

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

/**
 * Core import: fetch reviews from Outscraper for one org's query, translate to
 * Spanish, and upsert into google_reviews. When orgId is provided, every row is
 * tagged with that organization_id; when null (legacy McLoone's default-query
 * call), the DB backward-compat trigger fills in McLoone's org_id.
 *
 * Returns { reviews_fetched, reviews_upserted }. Throws on Outscraper / DB
 * failures so callers (single-org handler or the cron_all loop) can react.
 */
async function importReviewsForOrg(
  orgId: string | null,
  query: string,
  adminClient: any,
  outscrapterKey: string,
  isBackfill: boolean
): Promise<{ reviews_fetched: number; reviews_upserted: number }> {
  const reviewsLimit = isBackfill ? BACKFILL_REVIEWS_LIMIT : DEFAULT_REVIEWS_LIMIT;
  console.log(`Importing reviews: org=${orgId}, query="${query}", limit=${reviewsLimit}, backfill=${isBackfill}`);

  // --- Fetch reviews from Outscraper ---
  const outscrapterUrl = new URL('https://api.app.outscraper.com/maps/reviews-v3');
  outscrapterUrl.searchParams.set('query', query);
  outscrapterUrl.searchParams.set('reviewsLimit', String(reviewsLimit));
  outscrapterUrl.searchParams.set('sort', 'newest');
  outscrapterUrl.searchParams.set('language', 'en');
  outscrapterUrl.searchParams.set('async', 'false');

  const outscrapterResponse = await fetch(outscrapterUrl.toString(), {
    headers: { 'X-API-KEY': outscrapterKey },
  });

  if (!outscrapterResponse.ok) {
    const errorText = await outscrapterResponse.text();
    console.error('Outscraper API error:', outscrapterResponse.status, errorText);
    throw new Error(`Outscraper API error: ${outscrapterResponse.status}`);
  }

  const outscrapterData = await outscrapterResponse.json();

  let reviews: any[] = [];
  const placeData = outscrapterData.data?.[0];

  if (Array.isArray(placeData)) {
    reviews = placeData;
  } else if (placeData?.reviews_data) {
    reviews = placeData.reviews_data;
  }

  if (reviews.length === 0) {
    console.log(`No reviews returned from Outscraper for org=${orgId}`);
    return { reviews_fetched: 0, reviews_upserted: 0 };
  }

  console.log(`Fetched ${reviews.length} reviews from Outscraper for org=${orgId}`);

  // --- Translate review texts + owner answers to Spanish ---
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
    console.log(`Translated ${allTexts.filter((t: string) => t?.trim()).length} texts to Spanish`);
  } else {
    console.warn('GOOGLE_TRANSLATE_API_KEY not configured, skipping translation');
  }

  // --- Upsert into google_reviews ---
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

  let upsertedCount = 0;
  if (rows.length > 0) {
    const { data, error } = await adminClient
      .from('google_reviews')
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: false })
      .select('id');

    if (error) {
      console.error('Upsert error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    upsertedCount = data?.length || 0;
  }

  console.log(`Upserted ${upsertedCount} reviews for org=${orgId}`);
  return { reviews_fetched: reviews.length, reviews_upserted: upsertedCount };
}

/**
 * cron_all mode: refresh Google reviews for every org that (a) has a non-empty
 * google_maps_query and (b) is on an active paid plan — premium, or trial whose
 * trial_end_date is still in the future. Base/expired orgs are naturally
 * excluded by the tier filter, so downgrade stops auto-refresh with no extra
 * bookkeeping. Runs sequentially and continues past per-org failures.
 */
async function importReviewsForAllOrgs(
  adminClient: any,
  outscrapterKey: string,
  isBackfill: boolean
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
  let succeeded = 0;
  let failed = 0;

  for (const o of qualifying) {
    try {
      const result = await importReviewsForOrg(
        o.id,
        (o.google_maps_query || '').trim(),
        adminClient,
        outscrapterKey,
        isBackfill
      );
      succeeded++;
      details.push({ organization_id: o.id, name: o.name, success: true, ...result });
    } catch (err: any) {
      failed++;
      console.error(`cron_all: org ${o.id} (${o.name}) failed:`, err?.message || err);
      details.push({ organization_id: o.id, name: o.name, success: false, error: err?.message || String(err) });
    }
  }

  console.log(`cron_all complete: ${succeeded} succeeded, ${failed} failed`);

  return new Response(
    JSON.stringify({
      success: true,
      source: 'cron',
      mode: 'cron_all',
      orgs_processed: qualifying.length,
      orgs_succeeded: succeeded,
      orgs_failed: failed,
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
        .select('role')
        .eq('id', body.user_id)
        .single();
      if (userData?.role === 'manager' || userData?.role === 'owner') {
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

    const isBackfill = body.backfill === true;
    const organizationId = body.organization_id;

    // --- cron_all mode: a cron call with no specific org refreshes every
    //     qualifying (premium / active-trial) org that has a google_maps_query ---
    if (source === 'cron' && !organizationId) {
      return await importReviewsForAllOrgs(adminClient, outscrapterKey, isBackfill);
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

    const result = await importReviewsForOrg(
      organizationId ?? null,
      googleMapsQuery,
      adminClient,
      outscrapterKey,
      isBackfill
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
