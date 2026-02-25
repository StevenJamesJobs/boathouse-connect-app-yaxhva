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
 * Saves Spanish translation fields to a Supabase table.
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
    // Only save non-empty translations
    const nonEmptyTranslations: Record<string, string | null> = {};
    let hasContent = false;
    for (const [key, value] of Object.entries(translations)) {
      if (value && value.trim()) {
        nonEmptyTranslations[key] = value;
        hasContent = true;
      } else {
        nonEmptyTranslations[key] = null; // Clear empty translations
      }
    }

    if (!hasContent) {
      // Still save nulls to clear any previous translations if all fields are empty
      const { error } = await supabase.from(table).update(nonEmptyTranslations).eq('id', id);
      if (error) {
        console.error(`Failed to clear translations for ${table}:`, error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from(table).update(nonEmptyTranslations).eq('id', id);

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
