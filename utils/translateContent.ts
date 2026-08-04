import { supabase } from '@/app/integrations/supabase/client';
import { getCurrentActorId } from '@/utils/currentActor';

export interface TranslateResult {
  ok: boolean;
  translations: string[];
}

/**
 * Failure-aware translate: `ok: false` means the service call failed and
 * `translations` echoes the originals. Callers that must never write
 * same-language text into the other locale's columns should check `ok`
 * instead of consuming the echo.
 */
export async function translateTextsDetailed(
  texts: string[],
  targetLang: string = 'es',
  sourceLang: string = 'en'
): Promise<TranslateResult> {
  // Filter out empty strings, track their positions
  const hasContent = texts.some((t) => t && t.trim().length > 0);
  if (!hasContent) return { ok: true, translations: texts.map(() => '') };

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: {
        actor_id: getCurrentActorId(),
        texts,
        targetLang,
        sourceLang,
      },
    });

    if (error) {
      console.error('Translation Edge Function error:', error);
      return { ok: false, translations: texts };
    }

    if (!data?.success) {
      console.error('Translation failed:', data?.error);
      return { ok: false, translations: texts };
    }

    return { ok: true, translations: data.translations };
  } catch (err) {
    console.error('Translation request failed:', err);
    return { ok: false, translations: texts };
  }
}

/**
 * Translates an array of texts via the translate-text Edge Function.
 * Returns original texts on failure (graceful degradation).
 */
export async function translateTexts(
  texts: string[],
  targetLang: string = 'es',
  sourceLang: string = 'en'
): Promise<string[]> {
  const result = await translateTextsDetailed(texts, targetLang, sourceLang);
  return result.translations;
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
    rpc: 'update_announcement_translations_actor',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  special_features: {
    rpc: 'update_special_feature_translations_actor',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  upcoming_events: {
    rpc: 'update_upcoming_event_translations_actor',
    paramMap: { title_es: 'p_title_es', content_es: 'p_content_es' },
  },
  menu_items: {
    rpc: 'update_menu_item_translations_actor',
    paramMap: { name_es: 'p_name_es', description_es: 'p_description_es', location_es: 'p_location_es' },
  },
  menu_categories: {
    rpc: 'update_menu_category_translations_actor',
    paramMap: { display_name_es: 'p_display_name_es' },
  },
  menu_subcategories: {
    rpc: 'update_menu_subcategory_translations_actor',
    paramMap: { display_name_es: 'p_display_name_es' },
  },
  guides_and_training: {
    rpc: 'update_guide_translations_actor',
    paramMap: { title_es: 'p_title_es', description_es: 'p_description_es' },
  },
  libation_recipes: {
    rpc: 'update_libation_recipe_translations_actor',
    paramMap: { procedure_es: 'p_procedure_es' },
  },
  summer_libation_recipes: {
    rpc: 'update_summer_libation_recipe_translations_actor',
    paramMap: { procedure_es: 'p_procedure_es' },
  },
  cocktails: {
    rpc: 'update_cocktail_translations_actor',
    paramMap: { procedure_es: 'p_procedure_es' },
  },
  puree_syrup_recipes: {
    rpc: 'update_puree_syrup_recipe_translations_actor',
    paramMap: { procedure_es: 'p_procedure_es' },
  },
};

/**
 * Saves Spanish translation fields to a Supabase table via RPC.
 * B4 batch 2: routed to the actor-gated update_*_translations_actor family —
 * manager/owner only, org derived server-side from the actor, and the target
 * row must belong to the actor's org (the legacy no-actor fns let anyone
 * overwrite any org's Spanish text).
 *
 * @param table - The Supabase table name (e.g., 'announcements', 'menu_items')
 * @param id - The record ID to update
 * @param translations - Object with _es field names and values (e.g., { title_es: '...', content_es: '...' })
 * @param actorId - The signed-in manager/owner's user id (useAuth().user.id)
 */
export async function saveTranslations(
  table: string,
  id: string,
  translations: Record<string, string>,
  actorId: string | null | undefined
): Promise<boolean> {
  try {
    const rpcConfig = TRANSLATION_RPC_MAP[table];
    if (!rpcConfig) {
      console.error(`No translation RPC configured for table: ${table}`);
      return false;
    }
    if (!actorId) {
      console.error(`saveTranslations(${table}): no actor id — skipping`);
      return false;
    }

    // Build RPC parameters: always include p_actor_id and p_id, map translation fields to RPC params
    const rpcParams: Record<string, string | null> = { p_actor_id: actorId, p_id: id };
    for (const [fieldName, paramName] of Object.entries(rpcConfig.paramMap)) {
      const value = translations[fieldName];
      rpcParams[paramName] = value && value.trim() ? value : null;
    }

    const { error } = await supabase.rpc(rpcConfig.rpc as any, rpcParams);

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
