import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

// Single source of truth for the owner-editable menu category tree (D4).
// Replaces the hardcoded CATEGORIES / SUBCATEGORIES / CATEGORY_COLORS /
// COCKTAIL_SUBCATEGORIES constants that used to live in both menu-editor.tsx
// and MenuDisplay.tsx.

export type FilterBehavior = 'category_match' | 'lunch' | 'dinner' | 'weekly_specials';

export interface MenuSubcategory {
  id: string;
  display_name: string;
  system_key: string | null;
  is_cocktail_fed: boolean;
  display_order: number;
  is_hidden: boolean;
}

export interface MenuCategory {
  id: string;
  display_name: string;
  system_key: string | null;
  filter_behavior: FilterBehavior;
  color: string;
  display_order: number;
  is_hidden: boolean;
  subcategories: MenuSubcategory[];
}

interface UseMenuCategoriesResult {
  categories: MenuCategory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads the current org's menu categories + subcategories, nested and ordered.
 * @param opts.includeHidden — owner editor passes true to manage hidden rows;
 *   MenuDisplay omits it so hidden categories/subcategories are filtered out.
 */
export function useMenuCategories(opts?: { includeHidden?: boolean }): UseMenuCategoriesResult {
  const includeHidden = opts?.includeHidden ?? false;
  const { organizationId } = useOrganization();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [catRes, subRes] = await Promise.all([
        (supabase
          .from('menu_categories' as any)
          .select('id, display_name, system_key, filter_behavior, color, display_order, is_hidden')
          .eq('organization_id', organizationId)
          .order('display_order', { ascending: true }) as any),
        (supabase
          .from('menu_subcategories' as any)
          .select('id, category_id, display_name, system_key, is_cocktail_fed, display_order, is_hidden')
          .eq('organization_id', organizationId)
          .order('display_order', { ascending: true }) as any),
      ]);

      if (catRes.error) throw catRes.error;
      if (subRes.error) throw subRes.error;

      const subsByCat = new Map<string, MenuSubcategory[]>();
      for (const s of (subRes.data || []) as any[]) {
        if (!includeHidden && s.is_hidden) continue;
        const arr = subsByCat.get(s.category_id) || [];
        arr.push({
          id: s.id,
          display_name: s.display_name,
          system_key: s.system_key ?? null,
          is_cocktail_fed: !!s.is_cocktail_fed,
          display_order: s.display_order ?? 0,
          is_hidden: !!s.is_hidden,
        });
        subsByCat.set(s.category_id, arr);
      }

      const cats: MenuCategory[] = ((catRes.data || []) as any[])
        .filter((c) => includeHidden || !c.is_hidden)
        .map((c) => ({
          id: c.id,
          display_name: c.display_name,
          system_key: c.system_key ?? null,
          filter_behavior: (c.filter_behavior || 'category_match') as FilterBehavior,
          color: c.color || '#607D8B',
          display_order: c.display_order ?? 0,
          is_hidden: !!c.is_hidden,
          subcategories: (subsByCat.get(c.id) || []).sort((a, b) => a.display_order - b.display_order),
        }));

      setCategories(cats);
    } catch (e: any) {
      console.error('[useMenuCategories] load error:', e);
      setError(e?.message || 'Failed to load menu categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, includeHidden]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, error, refresh: load };
}
