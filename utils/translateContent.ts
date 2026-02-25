import { supabase } from '@/app/integrations/supabase/client';

/**
 * Translates an array of texts to the target language via the translate-text Edge Function.
 * Returns original texts on failure (graceful degradation).
 */
export async function translateTexts(
  texts: string[],
  targetLang: string = 'es'
): Promise<string[]> {
  // Filter out empty strings, track their positions
  const hasContent = texts.some((t) => t && t.trim().length > 0);
  if (!hasContent) return texts.map(() => '');

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: {
        texts,
        targetLang,
        sourceLang: 'en',
      },
    });

    if (error) {
      console.error('Translation Edge Function error:', error);
      return texts; // Return originals as fallback
    }

    if (!data?.success) {
      console.error('Translation failed:', data?.error);
      return texts; // Return originals as fallback
    }

    return data.translations;
  } catch (err) {
    console.error('Translation request failed:', err);
    return texts; // Return originals as fallback
  }
}

/**
 * Returns the localized field value based on the user's language.
 * Falls back to the English (base) field if no translation exists.
 *
 * @example
 * getLocalizedField(announcement, 'title', 'es') // returns title_es or title
 * getLocalizedField(menuItem, 'name', 'es')      // returns name_es or name
 */
export function getLocalizedField(
  item: Record<string, any>,
  field: string,
  language: string
): string {
  if (language === 'es') {
    const esField = `${field}_es`;
    if (item[esField] && typeof item[esField] === 'string' && item[esField].trim()) {
      return item[esField];
    }
  }
  return item[field] || '';
}

/**
 * Maps table names to their corresponding translation save RPC function names
 * and parameter mappings. Using RPCs with SECURITY DEFINER ensures translations
 * are saved regardless of RLS policies on the tables.
 */
const TRANSLATION_RPC_MAP: Record<string, { rpc: string; paramMap: Record<string, string> }> = {
  announcements: {
    rpc: 'update_announcement_translations',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  special_features: {
    rpc: 'update_special_feature_translations',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  upcoming_events: {
    rpc: 'update_upcoming_event_translations',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  menu_items: {
    rpc: 'update_menu_item_translations',
    paramMap: { name_es: 'p_name_es', description_es: 'p_description_es' },
  },
};

/**
 * Saves Spanish translation fields to a Supabase table via RPC.
 * Uses SECURITY DEFINER RPCs to bypass RLS policies.
 * Called after the main RPC save to avoid modifying existing RPCs.
 *
 * @param table - The Supabase table name (e.g., 'announcements', 'menu_items')
 * @param id - The record ID to update
 * @param translations - Object with _es field names and values (e.g., { title_es: '...', content_es: '...' })
 */
export async function saveTranslations(
  table: string,
  id: string,
  translations: Record<string, string>
): Promise<boolean> {
  try {
    const rpcConfig = TRANSLATION_RPC_MAP[table];
    if (!rpcConfig) {
      console.error(`No translation RPC configured for table: ${table}`);
      return false;
    }

    // Build RPC parameters: always include p_id, map translation fields to RPC params
    const rpcParams: Record<string, string | null> = { p_id: id };
    for (const [fieldName, paramName] of Object.entries(rpcConfig.paramMap)) {
      const value = translations[fieldName];
      rpcParams[paramName] = value && value.trim() ? value : null;
    }

    const { error } = await supabase.rpc(rpcConfig.rpc, rpcParams);

    if (error) {
      console.error(`Failed to save translations for ${table}:`, error);
      return false;
    }

    console.log(`Translations saved for ${table} record ${id}`);
    return true;
  } catch (err) {
    console.error(`Translation save error for ${table}:`, err);
    return false;
  }
}
