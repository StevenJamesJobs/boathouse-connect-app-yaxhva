import { supabase } from '@/app/integrations/supabase/client';

// Resolve an org's CURRENT menu category names by their stable system_key /
// filter_behavior. menu_items.category is free-text and follows owner renames,
// so any feature that filters items by a built-in category (Welcome Specials,
// unread badges, etc.) must resolve the current name instead of hardcoding the
// original string. Keys are stable; names change.

export interface OrgCategoryNames {
  // Last-wins single current name per system_key (back-compat for callers that
  // only need one name; in per-menu mode this is an arbitrary slot's name).
  bySystemKey: Record<string, string>;
  // ALL distinct current names per system_key, across menu slots. Per-menu mode
  // can seed the same built-in in slots 1 + 2 with different renames, so features
  // that match items must consider every name. Use with .in('category', names).
  namesBySystemKey: Record<string, string[]>;
  // All distinct names per filter_behavior (lunch/dinner/...), across slots.
  byBehavior: Record<string, string[]>;
}

// All resolvers now take the ACTING user's id (org derived server-side by the member-gated
// get_menu_categories/get_menu_subcategories RPCs). An optional sourceOrg is honored only when
// it's the actor's own org or the designated sample org (games' "use sample data" path).
export async function fetchOrgCategoryNames(actorId: string, sourceOrg?: string): Promise<OrgCategoryNames> {
  const bySystemKey: Record<string, string> = {};
  const namesBySystemKey: Record<string, string[]> = {};
  const byBehavior: Record<string, string[]> = {};
  if (!actorId) return { bySystemKey, namesBySystemKey, byBehavior };
  try {
    const { data } = await supabase.rpc('get_menu_categories', {
      p_actor_id: actorId,
      p_source_org: sourceOrg,
    });
    for (const c of (data || []) as any[]) {
      if (c.system_key) {
        bySystemKey[c.system_key] = c.display_name;
        const arr = (namesBySystemKey[c.system_key] ||= []);
        if (!arr.includes(c.display_name)) arr.push(c.display_name);
      }
      const fb = c.filter_behavior || 'category_match';
      const barr = (byBehavior[fb] ||= []);
      if (!barr.includes(c.display_name)) barr.push(c.display_name);
    }
  } catch (e) {
    console.error('[categoryNames] fetch error:', e);
  }
  return { bySystemKey, namesBySystemKey, byBehavior };
}

/** Current display name of the org's Weekly Specials category (falls back to the
 *  canonical English name if not yet seeded). Single-name; prefer
 *  weeklySpecialsNames() in per-menu-aware code. */
export async function weeklySpecialsName(actorId: string, sourceOrg?: string): Promise<string> {
  const { bySystemKey } = await fetchOrgCategoryNames(actorId, sourceOrg);
  return bySystemKey['cat.weekly_specials'] || 'Weekly Specials';
}

/** ALL distinct current names of the org's Weekly Specials category across menu
 *  slots (per-menu mode can have more than one). Use with .in('category', names). */
export async function weeklySpecialsNames(actorId: string, sourceOrg?: string): Promise<string[]> {
  const { namesBySystemKey } = await fetchOrgCategoryNames(actorId, sourceOrg);
  const names = namesBySystemKey['cat.weekly_specials'];
  return names && names.length ? names : ['Weekly Specials'];
}

// --- Plain-async resolver for non-React consumers (games/quizzes generators) ---
// The game/quiz generators run outside React and key off built-in categories by
// NAME. This resolves the org's CURRENT names by stable system_key (across menu
// slots) + the set of cocktail-fed subcategory names, so renames don't break
// pool filtering / price-range detection.

export interface MenuCategoryResolver {
  /** Current display names for the given built-in system_keys, across all slots. */
  namesForKeys: (keys: string[]) => string[];
  /** Distinct names of every cocktail-fed (recipe-backed) subcategory. */
  cocktailFedSubNames: string[];
}

export async function fetchMenuCategoryResolver(actorId: string, sourceOrg?: string): Promise<MenuCategoryResolver> {
  const empty: MenuCategoryResolver = { namesForKeys: () => [], cocktailFedSubNames: [] };
  if (!actorId) return empty;
  try {
    const [catRes, subRes] = await Promise.all([
      supabase.rpc('get_menu_categories', { p_actor_id: actorId, p_source_org: sourceOrg }),
      supabase.rpc('get_menu_subcategories', { p_actor_id: actorId, p_source_org: sourceOrg }),
    ]);
    const byKey: Record<string, string[]> = {};
    for (const c of (catRes.data || []) as any[]) {
      if (!c.system_key) continue;
      const arr = (byKey[c.system_key] ||= []);
      if (!arr.includes(c.display_name)) arr.push(c.display_name);
    }
    const cocktailFedSubNames: string[] = [];
    for (const s of (subRes.data || []) as any[]) {
      if (s.is_cocktail_fed && !cocktailFedSubNames.includes(s.display_name)) {
        cocktailFedSubNames.push(s.display_name);
      }
    }
    return {
      namesForKeys: (keys) => keys.flatMap((k) => byKey[k] || []),
      cocktailFedSubNames,
    };
  } catch (e) {
    console.error('[categoryNames] resolver fetch error:', e);
    return empty;
  }
}
