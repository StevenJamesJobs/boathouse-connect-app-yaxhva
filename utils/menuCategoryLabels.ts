import type { MenuCategory, MenuSubcategory } from '@/hooks/useMenuCategories';

// Label + behavior helpers for the owner-editable menu category tree (D4).
//
// LABELS are resolved by display_name against the canonical built-in names: an
// unrenamed built-in (e.g. "Wine", "Starters") maps to its i18n key so EN/ES
// localization still works; a renamed built-in or a custom category no longer
// matches a canonical name and falls back to its raw display_name. This mirrors
// the original `KEY ? t(KEY) : raw` behavior and gives "renamed → raw" for free.
//
// BEHAVIOR (filtering, Wine form, cocktail injection) keys off system_key /
// filter_behavior / is_cocktail_fed — never the display name — so it survives
// renames.

type TFunc = (key: string) => string;

// Canonical English name → i18n key (same key strings the constants used).
export const CATEGORY_TRANSLATION_KEYS: { [name: string]: string } = {
  'Weekly Specials': 'menu_display.weekly_specials',
  Lunch: 'menu_display.lunch',
  Dinner: 'menu_display.dinner',
  Libations: 'menu_display.libations',
  Wine: 'menu_display.wine',
  'Happy Hour': 'menu_display.happy_hour',
};

export const SUBCATEGORY_TRANSLATION_KEYS: { [name: string]: string } = {
  Starters: 'menu_display.starters',
  'Raw Bar': 'menu_display.raw_bar',
  Soups: 'menu_display.soups',
  Tacos: 'menu_display.tacos',
  Salads: 'menu_display.salads',
  Burgers: 'menu_display.burgers',
  Sandwiches: 'menu_display.sandwiches',
  Sides: 'menu_display.sides',
  Entrees: 'menu_display.entrees',
  Pasta: 'menu_display.pasta',
  'Signature Cocktails': 'menu_display.signature_cocktails',
  Martinis: 'menu_display.martinis',
  Sangria: 'menu_display.sangria',
  'Low ABV': 'menu_display.low_abv',
  'Zero ABV': 'menu_display.zero_abv',
  'Draft Beer': 'menu_display.draft_beer',
  'Bottle & Cans': 'menu_display.bottle_and_cans',
  Sparkling: 'menu_display.sparkling',
  Rose: 'menu_display.rose',
  Chardonnay: 'menu_display.chardonnay',
  'Pinot Grigio': 'menu_display.pinot_grigio',
  'Sauvignon Blanc': 'menu_display.sauvignon_blanc',
  'Interesting Whites': 'menu_display.interesting_whites',
  'Cabernet Sauvignon': 'menu_display.cabernet_sauvignon',
  'Pinot Noir': 'menu_display.pinot_noir',
  Merlot: 'menu_display.merlot',
  'Italian Reds': 'menu_display.italian_reds',
  'Interesting Reds': 'menu_display.interesting_reds',
  Appetizers: 'menu_display.appetizers',
  Drinks: 'menu_display.drinks',
  Spirits: 'menu_display.spirits',
  All: 'menu_display.all',
};

/** Virtual "All" subcategory system_key used by MenuDisplay (never persisted). */
export const ALL_SUBCATEGORY_KEY = 'sub.__all__';

// Display-label resolution order (when `language === 'es'`):
//   1. the owner's Spanish override `display_name_es`, if set;
//   2. the i18n key for an unrenamed built-in (so EN/ES still localize);
//   3. the raw `display_name` (renamed built-in or custom category).
// Omitting `language` (or any non-'es' value) preserves the original behavior.
export function categoryLabel(
  cat: Pick<MenuCategory, 'display_name' | 'display_name_es'>,
  t: TFunc,
  language?: string,
): string {
  if (language === 'es' && cat.display_name_es) return cat.display_name_es;
  const key = CATEGORY_TRANSLATION_KEYS[cat.display_name];
  return key ? t(key) : cat.display_name;
}

export function subcategoryLabel(
  sub: Pick<MenuSubcategory, 'display_name' | 'display_name_es' | 'system_key'>,
  t: TFunc,
  language?: string,
): string {
  if (sub.system_key === ALL_SUBCATEGORY_KEY) return t('menu_display.all');
  if (language === 'es' && sub.display_name_es) return sub.display_name_es;
  const key = SUBCATEGORY_TRANSLATION_KEYS[sub.display_name];
  return key ? t(key) : sub.display_name;
}

/** Plain string variant (for resolving names that aren't a category object).
 *  Pass the loaded `categories` tree + `language` to honor `display_name_es`
 *  overrides; without them it falls back to the i18n-key/raw-name behavior. */
export function labelForCategoryName(
  name: string,
  t: TFunc,
  categories?: MenuCategory[],
  language?: string,
): string {
  if (language === 'es' && categories) {
    const cat = categories.find((c) => c.display_name === name);
    if (cat?.display_name_es) return cat.display_name_es;
  }
  const key = CATEGORY_TRANSLATION_KEYS[name];
  return key ? t(key) : name;
}
export function labelForSubcategoryName(
  name: string,
  t: TFunc,
  categories?: MenuCategory[],
  language?: string,
): string {
  if (language === 'es' && categories) {
    for (const c of categories) {
      const sub = c.subcategories.find((s) => s.display_name === name);
      if (sub?.display_name_es) return sub.display_name_es;
    }
  }
  const key = SUBCATEGORY_TRANSLATION_KEYS[name];
  return key ? t(key) : name;
}

// --- Behavior helpers (key off system_key, not display name) ----------------

export function findCategoryByName(
  categories: MenuCategory[],
  name: string | null | undefined,
): MenuCategory | undefined {
  if (!name) return undefined;
  return categories.find((c) => c.display_name === name);
}

/** True when the given category display_name resolves to the Wine built-in. */
export function isWineCategoryName(categories: MenuCategory[], name: string | null | undefined): boolean {
  return findCategoryByName(categories, name)?.system_key === 'cat.wine';
}

// Recipe-table category vocabulary → cocktail-fed subcategory system_key.
// The libation_recipes / summer_libation_recipes tables use a FIXED vocabulary
// (this is recipe-table data, not menu vocabulary, so it legitimately stays
// static). MenuDisplay resolves the system_key to the org's CURRENT subcategory
// display_name so injected cocktails follow renames.
export const RECIPE_CATEGORY_TO_SUBCATEGORY_KEY: Record<string, string> = {
  Featured: 'sub.signature_cocktails',
  'Signature Cocktails': 'sub.signature_cocktails',
  Martinis: 'sub.martinis',
  Sangrias: 'sub.sangria',
  'Low ABV': 'sub.low_abv',
  'No ABV': 'sub.zero_abv',
};

// The fixed recipe-table category vocabulary (the values stored in
// libation_recipes.category / summer_libation_recipes.category). Stable — never
// renamed — so injection and existing rows keep working; only the LABEL shown to
// owners changes (see below).
export const LIBATION_RECIPE_CATEGORY_VALUES = [
  'Featured',
  'Signature Cocktails',
  'Martinis',
  'Sangrias',
  'Low ABV',
  'No ABV',
] as const;

/**
 * Resolve a recipe-table category value to the label the recipe editors/viewers
 * should show: the org's CURRENT Libations cocktail-subcategory name (by
 * system_key), so renamed cocktail subs (e.g. "Signature Cocktails" → "Bubbly")
 * appear in the recipe editors too. Unrenamed built-ins fall through
 * subcategoryLabel to their i18n translation. 'Featured' is a pin-to-top
 * placement, not a subcategory, so it keeps its own `fallback` label.
 */
export function libationRecipeCategoryLabel(
  categories: MenuCategory[],
  recipeCategory: string,
  t: TFunc,
  fallback: string,
): string {
  if (recipeCategory === 'Featured') return fallback;
  const subKey = RECIPE_CATEGORY_TO_SUBCATEGORY_KEY[recipeCategory];
  if (!subKey) return fallback;
  const libCat = categories.find((c) => c.system_key === 'cat.libations');
  const sub = libCat?.subcategories.find((s) => s.system_key === subKey);
  return sub ? subcategoryLabel(sub, t) : fallback;
}

export interface RecipeCategoryOption {
  value: string;
  label: string;
}

/** Build the recipe-editor category picker options: stable `value` stored on the
 *  recipe row, `label` showing the org's current cocktail-subcategory names. */
export function libationRecipeCategoryOptions(
  categories: MenuCategory[],
  t: TFunc,
  fallbackLabel: (recipeCategory: string) => string,
): RecipeCategoryOption[] {
  return LIBATION_RECIPE_CATEGORY_VALUES.map((value) => ({
    value,
    label: libationRecipeCategoryLabel(categories, value, t, fallbackLabel(value)),
  }));
}

// --- Generalized recipe-backing (Part B) ------------------------------------
// Recipes now bind to a Libations subcategory by id (subcategory_id) instead of
// the fixed vocab, so owners can mark ANY Libations sub (built-in or custom)
// recipe-backed. The legacy `category` string is still written as a stable
// fallback and resolves built-ins by system_key / customs by name.

// Reverse of RECIPE_CATEGORY_TO_SUBCATEGORY_KEY (system_key → stable vocab),
// used to keep writing a resolvable legacy `category` for built-in subs.
const SUBCATEGORY_KEY_TO_RECIPE_CATEGORY: Record<string, string> = {
  'sub.signature_cocktails': 'Signature Cocktails',
  'sub.martinis': 'Martinis',
  'sub.sangria': 'Sangrias',
  'sub.low_abv': 'Low ABV',
  'sub.zero_abv': 'No ABV',
};

export interface CocktailSubOption {
  id: string;
  label: string;
  system_key: string | null;
}

/** Cocktail-fed (recipe-backed) Libations subcategories for the recipe-editor
 *  picker: value = subcategory id, label = current (possibly renamed) name. */
export function cocktailFedSubOptions(categories: MenuCategory[], t: TFunc): CocktailSubOption[] {
  const libCat = categories.find((c) => c.system_key === 'cat.libations');
  if (!libCat) return [];
  return libCat.subcategories
    .filter((s) => s.is_cocktail_fed && !s.is_hidden)
    .map((s) => ({ id: s.id, label: subcategoryLabel(s, t), system_key: s.system_key }));
}

/** Resolve a subcategory id to its current display_name in the loaded tree. */
export function subNameById(categories: MenuCategory[], subId: string | null | undefined): string | null {
  if (!subId) return null;
  for (const c of categories) {
    const s = c.subcategories.find((x) => x.id === subId);
    if (s) return s.display_name;
  }
  return null;
}

/** The legacy `category` string to store for a recipe bound to `sub`: the stable
 *  recipe vocab for built-ins (keeps fallback resolution working across slots /
 *  renames), else the custom sub's display_name. */
export function recipeCategoryValueForSub(
  sub: Pick<MenuSubcategory, 'system_key' | 'display_name'>,
): string {
  return (sub.system_key && SUBCATEGORY_KEY_TO_RECIPE_CATEGORY[sub.system_key]) || sub.display_name;
}

/**
 * The Libations subcategory id a recipe should bind to, within the loaded
 * (slot-scoped) tree. Resolution order:
 *   1. subcategory_id, if that sub exists in this tree (same-slot binding);
 *   2. legacy `category` vocab → system_key → built-in sub in this tree
 *      (handles per-menu, where the stored id points at another slot's sub);
 *   3. a cocktail-fed sub whose display_name === `category` (custom subs by name).
 */
export function resolveRecipeSubId(
  categories: MenuCategory[],
  recipe: { subcategory_id?: string | null; category?: string | null },
): string | null {
  if (recipe.subcategory_id && subNameById(categories, recipe.subcategory_id)) return recipe.subcategory_id;
  const libCat = categories.find((c) => c.system_key === 'cat.libations');
  if (!libCat) return null;
  const key = recipe.category ? RECIPE_CATEGORY_TO_SUBCATEGORY_KEY[recipe.category] : undefined;
  if (key) {
    const s = libCat.subcategories.find((x) => x.system_key === key);
    if (s) return s.id;
  }
  if (recipe.category) {
    const s = libCat.subcategories.find((x) => x.display_name === recipe.category && x.is_cocktail_fed);
    if (s) return s.id;
  }
  return null;
}

/** Current display_name of the Libations subcategory a recipe should appear under,
 *  in the loaded tree (falls back to the raw `category` string if unresolved). */
export function resolveRecipeSubName(
  categories: MenuCategory[],
  recipe: { subcategory_id?: string | null; category?: string | null },
): string {
  const id = resolveRecipeSubId(categories, recipe);
  return (id && subNameById(categories, id)) || recipe.category || '';
}
