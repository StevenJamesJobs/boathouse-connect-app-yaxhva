// Shared helpers for the Featured Specials cross-menu view.
//
// `menuBadgeForSeason` resolves which menu an item lives on (winter → Menu 1,
// summer → Menu 2, both → shared) to the org's CUSTOM menu name + icon. It was
// duplicated inline in MenuDisplay and menu-editor; the Welcome-page Specials
// cards need the same mapping, so it lives here as one source of truth.
//
// `compareBySectionThenOrder` group-sorts a combined (cross-menu) item list by
// category → subcategory → display_order so flagged items from the same section
// stay together instead of scattering by raw per-menu order.

export interface MenuBadge {
  icon: string;
  label: string;
}

/** The subset of organization fields the badge needs. */
export interface OrgMenuMeta {
  menu_1_name?: string | null;
  menu_1_icon?: string | null;
  menu_2_name?: string | null;
  menu_2_icon?: string | null;
}

type TFunc = (key: string) => string;

/** Which menu an item belongs to, resolved to the org's custom name + icon.
 *  'both' (shared) items return the "Both Menus" label. */
export function menuBadgeForSeason(
  season: string | null | undefined,
  org: OrgMenuMeta | null | undefined,
  t: TFunc,
): MenuBadge {
  if (season === 'winter') {
    return { icon: org?.menu_1_icon || 'snowflake', label: org?.menu_1_name || 'Menu 1' };
  }
  if (season === 'summer') {
    return { icon: org?.menu_2_icon || 'sun.max.fill', label: org?.menu_2_name || 'Menu 2' };
  }
  return { icon: 'circle.grid.2x2', label: t('menu_display.both_menus') };
}

interface SectionSortable {
  category?: string | null;
  subcategory?: string | null;
  display_order?: number | null;
}

/** Group-sort a combined item list by category → subcategory → display_order,
 *  so cross-menu Featured Specials items from the same section stay together. */
export function compareBySectionThenOrder(a: SectionSortable, b: SectionSortable): number {
  const byCategory = (a.category || '').localeCompare(b.category || '');
  if (byCategory !== 0) return byCategory;
  const bySubcategory = (a.subcategory || '').localeCompare(b.subcategory || '');
  if (bySubcategory !== 0) return bySubcategory;
  return (a.display_order ?? 0) - (b.display_order ?? 0);
}
