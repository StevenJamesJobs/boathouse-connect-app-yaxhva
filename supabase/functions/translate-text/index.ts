// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranslateRequest {
  texts: string[];
  targetLang: string;
  sourceLang?: string;
}

interface TranslateResponse {
  success: boolean;
  translations: string[];
  error?: string;
}

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

    const { texts, targetLang, sourceLang = 'en' } = (await req.json()) as TranslateRequest;

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
