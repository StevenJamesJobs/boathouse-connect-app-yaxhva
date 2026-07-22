// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranslateRequest {
  actor_id?: string; // Required: verified active user. Guards the paid Google Translate key from anon abuse.
  texts: string[];
  targetLang: string;
  sourceLang?: string;
}

interface TranslateResponse {
  success: boolean;
  translations: string[];
  error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Bound the request so the paid Google Translate spend can't be amplified in one call.
const MAX_TEXTS = 100;
const MAX_TOTAL_CHARS = 50_000;

const reject = (status: number, error: string) =>
  new Response(
    JSON.stringify({ success: false, translations: [], error } as TranslateResponse),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_TRANSLATE_API_KEY not configured');
      return new Response(
        JSON.stringify({
          success: false,
          translations: [],
          error: 'Translation service not configured',
        } as TranslateResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const { actor_id, texts, targetLang, sourceLang = 'en' } = (await req.json()) as TranslateRequest;

    if (!texts || texts.length === 0 || !targetLang) {
      return new Response(
        JSON.stringify({
          success: false,
          translations: [],
          error: 'Missing required fields: texts and targetLang',
        } as TranslateResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // --- Authorization: verify a real active user (no Supabase Auth exists here, so the
    // anon key proves nothing) — closes the anonymous drain of the paid Google Translate key. ---
    if (!actor_id || !UUID_RE.test(actor_id)) {
      return reject(401, 'Unauthorized');
    }
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: actor, error: actorError } = await adminClient
      .from('users')
      .select('id, is_active')
      .eq('id', actor_id)
      .single();
    if (actorError || !actor || actor.is_active === false) {
      return reject(401, 'Unauthorized');
    }

    // --- Input caps: bound Google Translate spend per request ---
    if (texts.length > MAX_TEXTS) {
      return reject(400, `Too many texts (max ${MAX_TEXTS})`);
    }
    const totalChars = texts.reduce((n, t) => n + (typeof t === 'string' ? t.length : 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return reject(400, `Payload too large (max ${MAX_TOTAL_CHARS} characters)`);
    }

    // Filter out empty strings and track their positions
    const nonEmptyTexts = texts.filter((t) => t && t.trim().length > 0);

    if (nonEmptyTexts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          translations: texts.map(() => ''),
        } as TranslateResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Call Google Cloud Translation API v2
    const googleUrl = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const googleResponse = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: nonEmptyTexts,
        target: targetLang,
        source: sourceLang,
        format: 'text',
      }),
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error('Google Translate API error:', googleResponse.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          translations: [],
          error: `Translation API error: ${googleResponse.status}`,
        } as TranslateResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const googleData = await googleResponse.json();
    const translatedTexts = googleData.data.translations.map(
      (t: { translatedText: string }) => t.translatedText
    );

    // Map translations back to original positions (keeping empty strings empty)
    let translationIndex = 0;
    const result = texts.map((originalText) => {
      if (!originalText || originalText.trim().length === 0) {
        return '';
      }
      return translatedTexts[translationIndex++] || originalText;
    });

    console.log(`Translated ${nonEmptyTexts.length} texts from ${sourceLang} to ${targetLang}`);

    return new Response(
      JSON.stringify({
        success: true,
        translations: result,
      } as TranslateResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Translation function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        translations: [],
        error: error.message || 'Internal translation error',
      } as TranslateResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
