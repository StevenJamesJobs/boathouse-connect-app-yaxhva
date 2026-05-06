// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const GOOGLE_MAPS_QUERY = "McLoone's Boathouse, 9 Cherry Lane, West Orange, NJ 07052";
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

    // --- Auth: cron secret OR manager user_id ---
    const cronSecret = Deno.env.get('CRON_SECRET');
    const requestCronSecret = req.headers.get('x-cron-secret');
    let isAuthorized = false;
    let source = 'unknown';

    if (cronSecret && requestCronSecret === cronSecret) {
      isAuthorized = true;
      source = 'cron';
    }

    if (!isAuthorized && body.user_id) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: userData } = await adminClient
        .from('users')
        .select('role')
        .eq('id', body.user_id)
        .single();
      if (userData?.role === 'manager') {
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
    const reviewsLimit = isBackfill ? BACKFILL_REVIEWS_LIMIT : DEFAULT_REVIEWS_LIMIT;

    console.log(`Import started: source=${source}, limit=${reviewsLimit}, backfill=${isBackfill}`);

    // --- Fetch reviews from Outscraper ---
    const outscrapterUrl = new URL('https://api.app.outscraper.com/maps/reviews-v3');
    outscrapterUrl.searchParams.set('query', GOOGLE_MAPS_QUERY);
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
      return new Response(
        JSON.stringify({ success: false, error: `Outscraper API error: ${outscrapterResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
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
      console.log('No reviews returned from Outscraper');
      return new Response(
        JSON.stringify({ success: true, source, reviews_fetched: 0, reviews_upserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Fetched ${reviews.length} reviews from Outscraper`);

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
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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
        return new Response(
          JSON.stringify({ success: false, error: `Database error: ${error.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      upsertedCount = data?.length || 0;
    }

    console.log(`Upserted ${upsertedCount} reviews`);

    return new Response(
      JSON.stringify({
        success: true,
        source,
        reviews_fetched: reviews.length,
        reviews_upserted: upsertedCount,
      }),
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
