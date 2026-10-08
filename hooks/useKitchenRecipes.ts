import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import type { Json } from '@/app/integrations/supabase/types';

/**
 * s91 — the Kitchen Assistant's data layer: one place for the books, the row
 * shapes, the RPC calls and the reader preferences. Screens and sheets import
 * from here; nothing else talks to the kitchen RPCs directly.
 *
 * The world (server, migration s91b):
 *  - ONE recipe row per menu item, fed by trigger from the Menu Editor (section
 *    'menu'). Name / cover / placement are the menu's and read-only here;
 *    everything else is the kitchen's. Deleting the item deletes the recipe
 *    unless someone saved it — then it lives on as "off the menu" in their
 *    Saved book.
 *  - Free-standing recipes in three more sections (prep / desserts / banquets)
 *    organised by org-editable GROUPS (seeded per org).
 *  - Books are the hub's tiles: menu1 · menu2 · specials · prep · desserts ·
 *    banquets · saved. menu1/menu2 follow the menu item's season ('winter' =
 *    Menu 1, 'summer' = Menu 2, 'both' = both); specials = the ★ items.
 *  - Allergens: the four the menu carries (gluten / dairy / egg / nuts) write
 *    back to the item's free-of flags; the other five live on the recipe only.
 */

export type KitchenBook = 'menu1' | 'menu2' | 'specials' | 'prep' | 'desserts' | 'banquets' | 'saved';
export type KitchenSection = 'menu' | 'prep' | 'desserts' | 'banquets';
/** The sections an editor may ADD recipes to (menu recipes come from the Menu Editor). */
export const KITCHEN_EDITABLE_SECTIONS: KitchenSection[] = ['prep', 'desserts', 'banquets'];
export const KITCHEN_BOOKS: KitchenBook[] = ['menu1', 'menu2', 'specials', 'prep', 'desserts', 'banquets', 'saved'];

export function sectionForBook(book: KitchenBook): KitchenSection {
  return book === 'prep' || book === 'desserts' || book === 'banquets' ? book : 'menu';
}
/** The books that are plain sections (the ＋ lives here). */
export function bookIsEditableSection(book: KitchenBook): boolean {
  return book === 'prep' || book === 'desserts' || book === 'banquets';
}

/** Steps: the recipe's procedure, one entry per step; `images` ≤ 4 storage URLs. */
export type KitchenStep = {
  title?: string | null;
  title_es?: string | null;
  text?: string | null;
  text_es?: string | null;
  /** Optional per-step timer hint, whole minutes. */
  minutes?: number | null;
  images: string[];
};
export type KitchenIngredient = {
  amount?: string | null;
  ingredient: string;
  ingredient_es?: string | null;
  /** "cold, cubed" — the prep note after the ingredient. */
  prep?: string | null;
  prep_es?: string | null;
};

/** Allergen keys (server vocabulary). Labels: t(`kitchen_recipe.allergen_${key}`). */
export const KITCHEN_ALLERGENS = ['gluten', 'dairy', 'egg', 'tree_nuts', 'peanuts', 'soy', 'fish', 'shellfish', 'sesame'] as const;
export type KitchenAllergen = (typeof KITCHEN_ALLERGENS)[number];
/** The four that are ALSO the menu item's dietary flags (write-back both ways). */
export const KITCHEN_MENU_ALLERGENS: KitchenAllergen[] = ['gluten', 'dairy', 'egg', 'tree_nuts', 'peanuts'];
/** Station keys. Labels: t(`kitchen_recipe.station_${key}`). Free text is allowed too. */
export const KITCHEN_STATIONS = ['grill', 'saute', 'fry', 'pantry', 'pastry', 'prep', 'expo', 'pizza', 'wok'] as const;

/** A list row (get_kitchen_recipes / the hub). */
export interface KitchenRecipeRow {
  id: string;
  section: KitchenSection;
  menu_item_id: string | null;
  group_id: string | null;
  group_name: string | null;
  group_name_es: string | null;
  name: string;
  name_es: string | null;
  thumbnail_url: string | null;
  images: string[];
  category: string | null;
  subcategory: string | null;
  season: string | null;
  is_special: boolean;
  station: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  step_count: number;
  /** Steps or ingredients exist — otherwise the row wears "Needs recipe". */
  is_written: boolean;
  is_saved: boolean;
  /** A menu recipe whose item left the menu (kept by a save). */
  off_menu: boolean;
  display_order: number;
}

/** The full recipe (get_kitchen_recipe). */
export interface KitchenRecipeFull extends Omit<KitchenRecipeRow, 'step_count' | 'is_written'> {
  description: string | null;
  description_es: string | null;
  menu_active: boolean;
  yield_text: string | null;
  portions_text: string | null;
  shelf_life: string | null;
  allergens: KitchenAllergen[];
  plating_notes: string | null;
  plating_notes_es: string | null;
  ingredients: KitchenIngredient[];
  steps: KitchenStep[];
  save_count: number;
  updated_at: string;
}

export interface KitchenGroup {
  id: string;
  section: KitchenSection;
  name: string;
  name_es: string | null;
  display_order: number;
  recipe_count: number;
}

export interface KitchenHubBook {
  book: KitchenBook;
  total: number;
  needs: number;
  thumbs: string[];
}

/** What the editor sends. A `type` alias (not an interface) so it is assignable to Json. */
export type KitchenRecipePayload = {
  /** Non-menu recipes only (ignored for menu-fed rows). */
  name?: string;
  name_es?: string | null;
  group_id?: string | null;
  description?: string | null;
  description_es?: string | null;
  /** The recipe's own photos (≤ 4). For a menu-fed recipe the cover is separate (`cover_url`). */
  images: string[];
  /**
   * Menu-fed recipes only: the COVER, which is the menu item's own cover
   * (two-way — a change here lands on menu_items.thumbnail_url / images[0]
   * and the old cover stays among the menu's photos). Omit the key to leave
   * it alone; null clears it.
   */
  cover_url?: string | null;
  yield_text?: string | null;
  portions_text?: string | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  station?: string | null;
  shelf_life?: string | null;
  allergens: string[];
  plating_notes?: string | null;
  plating_notes_es?: string | null;
  ingredients: KitchenIngredient[];
  steps: KitchenStep[];
};

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

function normStep(raw: unknown): KitchenStep {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    title: (s.title as string) ?? null,
    title_es: (s.title_es as string) ?? null,
    text: (s.text as string) ?? null,
    text_es: (s.text_es as string) ?? null,
    minutes: typeof s.minutes === 'number' ? s.minutes : null,
    images: asStrings(s.images),
  };
}
function normIngredient(raw: unknown): KitchenIngredient | null {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof s.ingredient !== 'string' || !s.ingredient) return null;
  return {
    amount: (s.amount as string) ?? null,
    ingredient: s.ingredient,
    ingredient_es: (s.ingredient_es as string) ?? null,
    prep: (s.prep as string) ?? null,
    prep_es: (s.prep_es as string) ?? null,
  };
}

function rowFromRpc(r: any): KitchenRecipeRow {
  return {
    id: r.id, section: r.section, menu_item_id: r.menu_item_id ?? null, group_id: r.group_id ?? null,
    group_name: r.group_name ?? null, group_name_es: r.group_name_es ?? null,
    name: r.name, name_es: r.name_es ?? null, thumbnail_url: r.thumbnail_url ?? null, images: asStrings(r.images),
    category: r.category ?? null, subcategory: r.subcategory ?? null, season: r.season ?? null,
    is_special: !!r.is_special, station: r.station ?? null,
    prep_minutes: r.prep_minutes ?? null, cook_minutes: r.cook_minutes ?? null,
    step_count: Number(r.step_count ?? 0), is_written: !!r.is_written, is_saved: !!r.is_saved,
    off_menu: !!r.off_menu, display_order: Number(r.display_order ?? 0),
  };
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function fetchKitchenHub(actorId: string): Promise<KitchenHubBook[]> {
  const { data, error } = await supabase.rpc('get_kitchen_hub', { p_actor_id: actorId });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    book: r.book as KitchenBook, total: Number(r.total ?? 0), needs: Number(r.needs ?? 0), thumbs: asStrings(r.thumbs),
  }));
}

export async function fetchKitchenRecipes(actorId: string, book: KitchenBook): Promise<KitchenRecipeRow[]> {
  const { data, error } = await supabase.rpc('get_kitchen_recipes', { p_actor_id: actorId, p_book: book });
  if (error) throw error;
  return (data || []).map(rowFromRpc);
}

export async function fetchKitchenRecipe(actorId: string, id: string): Promise<KitchenRecipeFull | null> {
  const { data, error } = await supabase.rpc('get_kitchen_recipe', { p_actor_id: actorId, p_id: id });
  if (error) throw error;
  const r: any = (data || [])[0];
  if (!r) return null;
  const { step_count: _sc, is_written: _iw, ...base } = rowFromRpc({ ...r, step_count: 0, is_written: false });
  return {
    ...base,
    description: r.description ?? null, description_es: r.description_es ?? null,
    menu_active: r.menu_active !== false,
    yield_text: r.yield_text ?? null, portions_text: r.portions_text ?? null, shelf_life: r.shelf_life ?? null,
    allergens: (Array.isArray(r.allergens) ? r.allergens : []).filter((a: string) =>
      (KITCHEN_ALLERGENS as readonly string[]).includes(a)) as KitchenAllergen[],
    plating_notes: r.plating_notes ?? null, plating_notes_es: r.plating_notes_es ?? null,
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map(normIngredient).filter((x: KitchenIngredient | null): x is KitchenIngredient => !!x),
    steps: (Array.isArray(r.steps) ? r.steps : []).map(normStep),
    save_count: Number(r.save_count ?? 0), updated_at: r.updated_at,
  };
}

/** The Menu item Poster's "View Recipe" chip: null when the item has no kitchen recipe. */
export async function fetchKitchenRecipeForItem(actorId: string, menuItemId: string): Promise<{ id: string; is_written: boolean } | null> {
  const { data, error } = await supabase.rpc('get_kitchen_recipe_for_item', { p_actor_id: actorId, p_menu_item_id: menuItemId });
  if (error) throw error;
  const r: any = (data || [])[0];
  return r ? { id: r.id, is_written: !!r.is_written } : null;
}

export async function fetchKitchenGroups(actorId: string, section?: KitchenSection): Promise<KitchenGroup[]> {
  const { data, error } = await supabase.rpc('get_kitchen_recipe_groups', { p_actor_id: actorId, ...(section ? { p_section: section } : {}) });
  if (error) throw error;
  return (data || []).map((g: any) => ({
    id: g.id, section: g.section, name: g.name, name_es: g.name_es ?? null,
    display_order: Number(g.display_order ?? 0), recipe_count: Number(g.recipe_count ?? 0),
  }));
}

// ─── writes (editors: owners / managers / granted titles) ────────────────────

export async function createKitchenRecipe(actorId: string, section: KitchenSection, payload: KitchenRecipePayload): Promise<string> {
  const { data, error } = await supabase.rpc('create_kitchen_recipe', { p_actor_id: actorId, p_section: section, p_payload: payload as unknown as Json });
  if (error) throw error;
  return data as string;
}
export async function updateKitchenRecipe(actorId: string, id: string, payload: KitchenRecipePayload): Promise<void> {
  const { error } = await supabase.rpc('update_kitchen_recipe', { p_actor_id: actorId, p_id: id, p_payload: payload as unknown as Json });
  if (error) throw error;
}
export async function deleteKitchenRecipe(actorId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_kitchen_recipe', { p_actor_id: actorId, p_id: id });
  if (error) throw error;
}
export async function reorderKitchenRecipes(actorId: string, orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_kitchen_recipes', { p_actor_id: actorId, p_ordered_ids: orderedIds });
  if (error) throw error;
}
export async function upsertKitchenGroup(actorId: string, section: KitchenSection, name: string, groupId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_kitchen_recipe_group', { p_actor_id: actorId, p_section: section, p_name: name, ...(groupId ? { p_group_id: groupId } : {}) });
  if (error) throw error;
  return data as string;
}
export async function deleteKitchenGroup(actorId: string, groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_kitchen_recipe_group', { p_actor_id: actorId, p_group_id: groupId });
  if (error) throw error;
}
export async function reorderKitchenGroups(actorId: string, orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_kitchen_recipe_groups', { p_actor_id: actorId, p_ordered_ids: orderedIds });
  if (error) throw error;
}
/** Any member: their own Saved book. */
export async function setKitchenRecipeSaved(actorId: string, recipeId: string, saved: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_kitchen_recipe_saved', { p_actor_id: actorId, p_recipe_id: recipeId, p_saved: saved });
  if (error) throw error;
}

// ─── reader preferences (per device) ─────────────────────────────────────────

export type KitchenViewMode = 'scroll' | 'steps' | 'book';
const VIEW_MODE_KEY = '@kitchen_view_mode:v1';
const ROTATE_HINT_KEY = '@kitchen_rotate_hint_seen:v1';

/** The remembered reading mode, or null = ask on open. */
// ─── "open the Scroll view when the host regains focus" ──────────────────────
// The Steps / Book readers are routes. Their capsule's Scroll pops the reader
// and asks whichever opener host comes back into focus to show the Poster
// (useKitchenRecipeOpener consumes this in a focus effect).
let pendingScrollOpen: string | null = null;
export function requestScrollOpen(recipeId: string): void {
  pendingScrollOpen = recipeId;
}
export function takeScrollOpen(): string | null {
  const v = pendingScrollOpen;
  pendingScrollOpen = null;
  return v;
}

export async function getKitchenViewMode(): Promise<KitchenViewMode | null> {
  try {
    const v = await AsyncStorage.getItem(VIEW_MODE_KEY);
    return v === 'scroll' || v === 'steps' || v === 'book' ? v : null;
  } catch {
    return null;
  }
}
export async function setKitchenViewMode(mode: KitchenViewMode | null): Promise<void> {
  try {
    if (mode) await AsyncStorage.setItem(VIEW_MODE_KEY, mode);
    else await AsyncStorage.removeItem(VIEW_MODE_KEY);
  } catch { /* a lost preference is harmless */ }
}
export async function getRotateHintSeen(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ROTATE_HINT_KEY)) === '1'; } catch { return false; }
}
export async function setRotateHintSeen(seen: boolean): Promise<void> {
  try {
    if (seen) await AsyncStorage.setItem(ROTATE_HINT_KEY, '1');
    else await AsyncStorage.removeItem(ROTATE_HINT_KEY);
  } catch { /* harmless */ }
}

// ─── display helpers ─────────────────────────────────────────────────────────

/** Spanish copy when the app runs in Spanish and the field has it; else the EN. */
export function pickLang(en: string | null | undefined, es: string | null | undefined, lang: string): string {
  return lang.startsWith('es') && es ? es : (en ?? '');
}

/** "15 + 8 min" / "3 hr" style summary for list rows. */
export function kitchenTimeSummary(prep: number | null, cook: number | null): string | null {
  const fmt = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} hr` : m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`);
  if (prep && cook) return `${prep} + ${cook} min`;
  if (prep) return fmt(prep);
  if (cook) return fmt(cook);
  return null;
}

/** The hub tile / book title for a book, from the org's menu names. */
export function kitchenBookTitle(
  book: KitchenBook,
  org: { menu_1_name?: string | null; menu_2_name?: string | null } | null | undefined,
  t: (k: string, o?: any) => string,
): string {
  switch (book) {
    case 'menu1': return t('kitchen_assistant.menu_book', { menu: org?.menu_1_name || 'Menu 1' });
    case 'menu2': return t('kitchen_assistant.menu_book', { menu: org?.menu_2_name || 'Menu 2' });
    case 'specials': return t('kitchen_assistant.book_specials');
    case 'prep': return t('kitchen_assistant.book_prep');
    case 'desserts': return t('kitchen_assistant.book_desserts');
    case 'banquets': return t('kitchen_assistant.book_banquets');
    case 'saved': return t('kitchen_assistant.book_saved');
  }
}
