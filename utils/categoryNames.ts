import { supabase } from '@/app/integrations/supabase/client';

// Resolve an org's CURRENT menu category names by their stable system_key /
// filter_behavior. menu_items.category is free-text and follows owner renames,
// so any feature that filters items by a built-in category (Welcome Specials,
// unread badges, etc.) must resolve the current name instead of hardcoding the
// original string. Keys are stable; names change.

export interface OrgCategoryNames {
  bySystemKey: Record<string, string>;
  byBehavior: Record<string, string[]>;
}

export async function fetchOrgCategoryNames(organizationId: string): Promise<OrgCategoryNames> {
  const bySystemKey: Record<string, string> = {};
  const byBehavior: Record<string, string[]> = {};
  if (!organizationId) return { bySystemKey, byBehavior };
  try {
    const { data } = await (supabase
      .from('menu_categories' as any) as any)
      .select('display_name, system_key, filter_behavior')
      .eq('organization_id', organizationId);
    for (const c of (data || []) as any[]) {
      if (c.system_key) bySystemKey[c.system_key] = c.display_name;
      const fb = c.filter_behavior || 'category_match';
      (byBehavior[fb] ||= []).push(c.display_name);
    }
  } catch (e) {
    console.error('[categoryNames] fetch error:', e);
  }
  return { bySystemKey, byBehavior };
}

/** Current display name of the org's Weekly Specials category (falls back to the
 *  canonical English name if not yet seeded). */
export async function weeklySpecialsName(organizationId: string): Promise<string> {
  const { bySystemKey } = await fetchOrgCategoryNames(organizationId);
  return bySystemKey['cat.weekly_specials'] || 'Weekly Specials';
}
