import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import MultiImageField, { MAX_ITEM_PHOTOS } from '@/components/MultiImageField';
import RichTextToolbar from '@/components/RichTextToolbar';
import { useTranslationSection } from '@/components/TranslationSection';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMenuCategories, type MenuCategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import { saveTranslations } from '@/utils/translateContent';
import { brokerDelete } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * The Add/Edit menu-item sheet (s69 Session B) — GlassSheet-shelled rebuild of
 * the old menu-editor.tsx inline Modal. Owns its own form state, validation,
 * image pick/upload, bilingual translation resolution and the create/update
 * RPC calls; the host only supplies WHERE a new item starts
 * (initialSeason/initialCategory/initialSubcategory) and WHAT is being edited
 * (editingItem), then reacts to `onSaved` (closes + reloads + success alert —
 * this sheet never shows a success alert itself, only validation/save errors).
 *
 * Category/subcategory selection, isWine and nextOrder all resolve against
 * `formMenuCats` — the tree for formData.item_season, NEVER whatever season
 * the host happens to be viewing — via a local catKey-based lookup
 * (findFormCat), so a case-different or renamed row is never a false miss
 * (the bug the old file had via its viewing-tree-bound isWineName).
 *
 * Photos (s90): up to four per item through <MultiImageField>, cover first.
 * The field uploads on pick through the storage broker and holds STORED URLs
 * only, so the save path never uploads; its nested photo sheet presents
 * INSIDE this sheet's own Modal and launches the pickers DIRECTLY while it
 * stays open (the MenuUploadSheet pattern, the only one proven on iOS — a
 * deferred launch after a nested sheet's dismissal is silently dropped). A
 * removed photo is broker-deleted only AFTER the row save succeeds, so a
 * storage failure can never read as a failed save.
 */

// Case-insensitive category/subcategory name matching — the DB unique index
// is lower()-based (mirrors MenuDisplay.tsx's catKey; duplicated locally
// since this lane owns a single new file and MenuDisplay is out of scope).
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

// The strip's seed for an existing row: the stored list (cover first), else a
// one-photo list from the legacy thumbnail, so the form and the save path
// never special-case a pre-s90 item.
const seedImages = (item: MenuItem): string[] => {
  const list = Array.isArray(item.images) ? item.images.filter((u) => typeof u === 'string' && u.length > 0) : [];
  if (list.length > 0) return list.slice(0, MAX_ITEM_PHOTOS);
  return item.thumbnail_url ? [item.thumbnail_url] : [];
};

type DietaryField =
  | 'is_gluten_free'
  | 'is_gluten_free_available'
  | 'is_vegetarian'
  | 'is_vegetarian_available'
  | 'is_dairy_free'
  | 'is_egg_free'
  | 'is_nut_free'
  | 'is_sugar_free'
  | 'is_salt_free';

// Literal key strings (not `dietary.${k}`) so the i18n harvester can see every
// reference directly (MenuItemDetailSheet.tsx follows the same rule).
const DIETARY_CHIPS: { field: DietaryField; abbrevKey: string; labelKey: string }[] = [
  { field: 'is_gluten_free', abbrevKey: 'dietary.gf_abbrev', labelKey: 'dietary.gf' },
  { field: 'is_gluten_free_available', abbrevKey: 'dietary.gfa_abbrev', labelKey: 'dietary.gfa' },
  { field: 'is_vegetarian', abbrevKey: 'dietary.v_abbrev', labelKey: 'dietary.v' },
  { field: 'is_vegetarian_available', abbrevKey: 'dietary.va_abbrev', labelKey: 'dietary.va' },
  { field: 'is_dairy_free', abbrevKey: 'dietary.df_abbrev', labelKey: 'dietary.df' },
  { field: 'is_egg_free', abbrevKey: 'dietary.ef_abbrev', labelKey: 'dietary.ef' },
  { field: 'is_nut_free', abbrevKey: 'dietary.nf_abbrev', labelKey: 'dietary.nf' },
  { field: 'is_sugar_free', abbrevKey: 'dietary.sf_abbrev', labelKey: 'dietary.sf' },
  { field: 'is_salt_free', abbrevKey: 'dietary.nos_abbrev', labelKey: 'dietary.nos' },
];

/**
 * Structurally matches the host's own MenuItem interface (menu-editor.tsx),
 * incl. the 5 dietary flags s68 added — deliberately re-declared here (not
 * imported) so the host can pass its rows in without a circular import; TS
 * structural typing makes the two interfaces interchangeable at the prop
 * boundary as long as the shapes agree.
 */
export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  category: string;
  subcategory: string | null;
  available_for_lunch: boolean;
  available_for_dinner: boolean;
  is_gluten_free: boolean;
  is_gluten_free_available: boolean;
  is_vegetarian: boolean;
  is_vegetarian_available: boolean;
  is_dairy_free: boolean;
  is_egg_free: boolean;
  is_nut_free: boolean;
  is_sugar_free: boolean;
  is_salt_free: boolean;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  /**
   * s90: the stored photo list (cover first) — get_menu_items returns it as
   * Json; the host casts. A pre-s90 row carries only thumbnail_url.
   */
  images?: string[] | null;
  display_order: number;
  is_active: boolean;
  is_weekly_special: boolean;
  season: string;
  name_es?: string | null;
  description_es?: string | null;
  location?: string | null;
  location_es?: string | null;
  glass_price?: string | null;
  bottle_price?: string | null;
  member_bottle_price?: string | null;
  flavor_profile?: string | null;
  flavor_profile_es?: string | null;
  unique_selling_points?: string | null;
  unique_selling_points_es?: string | null;
}

export interface MenuItemEditSheetProps {
  visible: boolean;
  /** Host clears editing state (Cancel / X / scrim / Android back). */
  onClose: () => void;
  /** Fired AFTER the RPC + translations complete; host closes + reloads + shows the success alert. */
  onSaved: () => void;
  /**
   * The underlying Modal finished dismissing (iOS only — RN never fires it on
   * Android). The host uses it to present the post-save alert the moment the
   * sheet is really gone instead of guessing with a bare timer.
   */
  onDismissed?: () => void;
  colors: ThemeColorSet;
  /** null = add mode. */
  editingItem: MenuItem | null;
  initialSeason: 'winter' | 'summer';
  /** Add-mode prefill (the active page's category) — null on search/none. */
  initialCategory: string | null;
  initialSubcategory: string | null;
  /**
   * The host computes the new item's display_order over its own `allItems`
   * (catKey + season scoped) — this sheet never sees the host's item arrays.
   */
  computeNextOrder: (category: string, subcategory: string, itemSeason: 'winter' | 'summer' | 'both') => number;
}

export default function MenuItemEditSheet({
  visible,
  onClose,
  onSaved,
  onDismissed,
  colors,
  editingItem,
  initialSeason,
  initialCategory,
  initialSubcategory,
  computeNextOrder,
}: MenuItemEditSheetProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { language } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    subcategory: '',
    available_for_lunch: false,
    available_for_dinner: false,
    is_gluten_free: false,
    is_gluten_free_available: false,
    is_vegetarian: false,
    is_vegetarian_available: false,
    is_dairy_free: false,
    is_egg_free: false,
    is_nut_free: false,
    is_sugar_free: false,
    is_salt_free: false,
    thumbnail_shape: 'square',
    // Stored URLs only, cover first (MultiImageField uploads on pick).
    images: [] as string[],
    display_order: 0,
    is_weekly_special: false,
    name_es: '',
    description_es: '',
    location: '',
    location_es: '',
    glass_price: '',
    bottle_price: '',
    member_bottle_price: '',
    flavor_profile: '',
    flavor_profile_es: '',
    unique_selling_points: '',
    unique_selling_points_es: '',
    item_season: 'both' as 'winter' | 'summer' | 'both',
  });
  // Photos the strip's Remove row dropped this session — distinct from "never
  // had one": they are broker-deleted only AFTER a successful save (a storage
  // failure must never read as a failed save), and nothing is deleted on
  // Cancel. Cleared on every open.
  const removedPhotosRef = useRef<string[]>([]);
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  const descriptionInputRef = useRef<TextInput>(null);
  const addSessionRef = useRef(0);
  // Latest initial* props, read imperatively by the open effect below — mirrors
  // TranslationSection's fieldsRef pattern so that effect fires exactly once
  // per open gesture (visible/editingItem transition) and never re-fires
  // merely because the host recomputed these primitives on an unrelated
  // render (they're typically derived inline from the host's active page).
  const initialsRef = useRef({ initialSeason, initialCategory, initialSubcategory });
  initialsRef.current = { initialSeason, initialCategory, initialSubcategory };

  const isSpanishAuthor = i18n.language === 'es';
  const perMenu = organization?.menu_category_scope === 'per_menu';

  // The category/subcategory pills, isWine and the wine block must reflect the
  // menu the item is being ASSIGNED to (formData.item_season) — never whatever
  // menu the host happens to be viewing. In shared mode this resolves to the
  // single shared tree.
  const formMenuSlot: 1 | 2 = formData.item_season === 'summer' ? 2 : 1;
  const { categories: formMenuCats } = useMenuCategories({ includeHidden: true, menuSlot: formMenuSlot });

  const findFormCat = (name: string | null | undefined): MenuCategory | undefined =>
    formMenuCats.find((c) => catKey(c.display_name) === catKey(name));

  const selectedFormCat = findFormCat(formData.category);
  // Bug 7: resolved against the FORM tree above, never a viewing tree — drives
  // the wine block, price hiding, translation extra fields, validation and
  // save params.
  const isWine = selectedFormCat?.system_key === 'cat.wine';

  const formWeeklySpecialsCat = formMenuCats.find((c) => c.system_key === 'cat.weekly_specials' && !c.is_hidden);
  const formHasWeeklySpecialsCat = !!formWeeklySpecialsCat;
  const formWeeklySpecialsLabel = formWeeklySpecialsCat ? categoryLabel(formWeeklySpecialsCat, t, language) : '';
  const formHasLunchCat = formMenuCats.some((c) => c.filter_behavior === 'lunch' && !c.is_hidden);
  const formHasDinnerCat = formMenuCats.some((c) => c.filter_behavior === 'dinner' && !c.is_hidden);
  const formLunchName = formMenuCats.find((c) => c.filter_behavior === 'lunch')?.display_name || t('menu_editor:available_lunch');
  const formDinnerName = formMenuCats.find((c) => c.filter_behavior === 'dinner')?.display_name || t('menu_editor:available_dinner');

  // Category picker: only LIBATIONS is withheld — its items come from the
  // Bartender recipe editors (Steve's smoke reversal: Wine IS offered whenever
  // it's visible in the tree; selecting it unlocks the wine field block, same
  // as editing an existing wine). The item's OWN current category always stays
  // selectable (legacy libations rows remain editable here), and hidden
  // categories keep the same current-value exception. catKey-safe (bug 5).
  const categoryOptions = formMenuCats.filter((cat) => {
    const isCurrent = catKey(cat.display_name) === catKey(formData.category);
    const hiddenOk = !cat.is_hidden || isCurrent;
    const libationsOk = cat.system_key !== 'cat.libations' || isCurrent;
    return hiddenOk && libationsOk;
  });
  // Only note the exclusion when it actually removed something a manager
  // could otherwise see — never just because hidden categories exist.
  const showWineLibNote = formMenuCats.some(
    (cat) =>
      !cat.is_hidden &&
      cat.system_key === 'cat.libations' &&
      catKey(cat.display_name) !== catKey(formData.category)
  );

  // Shared-mode meal-service overlay — today's exact filter_behavior gate
  // (lunch/dinner/weekly_specials), now read off the catKey-safe selectedFormCat.
  const showAvailability =
    !perMenu &&
    (formHasLunchCat || formHasDinnerCat) &&
    (selectedFormCat?.filter_behavior === 'lunch' ||
      selectedFormCat?.filter_behavior === 'dinner' ||
      selectedFormCat?.filter_behavior === 'weekly_specials');

  // Shared mode: an item filed under Lunch/Dinner is served at that meal by
  // definition (its page filters on the flag), so its own chip stays ticked
  // and the other meal is the optional "also show it there". s88: rows saved
  // with neither ticked matched no page at all.
  const ownMeal: 'lunch' | 'dinner' | null =
    !perMenu && (selectedFormCat?.filter_behavior === 'lunch' || selectedFormCat?.filter_behavior === 'dinner')
      ? selectedFormCat.filter_behavior
      : null;
  const lunchOn = formData.available_for_lunch || ownMeal === 'lunch';
  const dinnerOn = formData.available_for_dinner || ownMeal === 'dinner';

  // Subcategory tree for the currently-selected form category, kept visible
  // if hidden but currently assigned (legacy items keep their placement
  // editable) — same rule as the category picker, catKey-safe throughout.
  // Cocktail-fed subs are ALSO withheld (except as a legacy row's current
  // value): those mirror the Bartender recipe editors, and a manual item
  // filed into one would be hidden by the user side's dedup anyway.
  const formVisibleSubs = selectedFormCat
    ? selectedFormCat.subcategories.filter((s) => {
        const isCurrent = catKey(s.display_name) === catKey(formData.subcategory);
        return (!s.is_hidden || isCurrent) && (!s.is_cocktail_fed || isCurrent);
      })
    : [];
  const showSubcategory = !!selectedFormCat && formVisibleSubs.length > 0;
  // What actually gets stored: a name from the offered list, or nothing when
  // the category has no subcategories (a stale name would make a stray).
  const subToSave = showSubcategory ? formData.subcategory : '';

  const showWeeklySpecialFeature = formHasWeeklySpecialsCat && selectedFormCat?.system_key !== 'cat.weekly_specials';

  // Per-menu drops the 'both' choice for NEW selections; a legacy 'both' item
  // keeps it offered so it's never stranded (verbatim old-file rule).
  const menuChoiceOptions: readonly ('winter' | 'both' | 'summer')[] = !perMenu
    ? (['winter', 'both', 'summer'] as const)
    : formData.item_season === 'both'
    ? (['winter', 'both', 'summer'] as const)
    : (['winter', 'summer'] as const);

  // Hybrid bilingual authoring (s61): primary inputs bind the device language;
  // the shared section shows the other-language preview + translate + pencil.
  // Location is preview/pencil-only (noMachine). Wine-only fields join the set
  // when the FORM-resolved category is wine.
  const translation = useTranslationSection({
    fields: [
      {
        key: 'name',
        labelKey: 'translation_section:field_name',
        enValue: formData.name,
        esValue: formData.name_es,
        setEnValue: (v) => setFormData((prev) => ({ ...prev, name: v })),
        setEsValue: (v) => setFormData((prev) => ({ ...prev, name_es: v })),
      },
      {
        key: 'description',
        labelKey: 'translation_section:field_description',
        enValue: formData.description,
        esValue: formData.description_es,
        setEnValue: (v) => setFormData((prev) => ({ ...prev, description: v })),
        setEsValue: (v) => setFormData((prev) => ({ ...prev, description_es: v })),
        multiline: true,
      },
      ...(isWine
        ? [
            {
              key: 'location',
              labelKey: 'translation_section:field_location',
              enValue: formData.location,
              esValue: formData.location_es,
              setEnValue: (v: string) => setFormData((prev) => ({ ...prev, location: v })),
              setEsValue: (v: string) => setFormData((prev) => ({ ...prev, location_es: v })),
              noMachine: true,
            },
            {
              key: 'flavor_profile',
              labelKey: 'translation_section:field_flavor_profile',
              enValue: formData.flavor_profile,
              esValue: formData.flavor_profile_es,
              setEnValue: (v: string) => setFormData((prev) => ({ ...prev, flavor_profile: v })),
              setEsValue: (v: string) => setFormData((prev) => ({ ...prev, flavor_profile_es: v })),
              multiline: true,
            },
            {
              key: 'unique_selling_points',
              labelKey: 'translation_section:field_selling_points',
              enValue: formData.unique_selling_points,
              esValue: formData.unique_selling_points_es,
              setEnValue: (v: string) => setFormData((prev) => ({ ...prev, unique_selling_points: v })),
              setEsValue: (v: string) => setFormData((prev) => ({ ...prev, unique_selling_points_es: v })),
              multiline: true,
            },
          ]
        : []),
    ],
    sessionKey: editingItem ? `edit:${editingItem.id}` : `new:${addSessionRef.current}`,
    active: visible,
  });

  // Fires once per open gesture (add or edit). Deliberately NOT depending on
  // initialSeason/initialCategory/initialSubcategory/findFormCat/formMenuCats
  // — see initialsRef above. Because formMenuCats is keyed off
  // formData.item_season (only updated by the setFormData call below), the
  // very first Add after switching seasons can read a formMenuCats that is
  // still resolving the PREVIOUS slot — the lunch/dinner prefill below then
  // safely defaults to false (never a wrong-slot category) and the manager
  // can tick it manually; the category/subcategory pills themselves are
  // unaffected since they render reactively off the live hook.
  useEffect(() => {
    if (!visible) return;
    const { initialSeason: iSeason, initialCategory: iCategory, initialSubcategory: iSubcategory } = initialsRef.current;
    if (editingItem) {
      setFormData({
        name: editingItem.name,
        description: editingItem.description || '',
        price: editingItem.price,
        category: editingItem.category,
        subcategory: editingItem.subcategory || '',
        available_for_lunch: editingItem.available_for_lunch,
        available_for_dinner: editingItem.available_for_dinner,
        is_gluten_free: editingItem.is_gluten_free,
        is_gluten_free_available: editingItem.is_gluten_free_available,
        is_vegetarian: editingItem.is_vegetarian,
        is_vegetarian_available: editingItem.is_vegetarian_available,
        is_dairy_free: editingItem.is_dairy_free,
        is_egg_free: editingItem.is_egg_free,
        is_nut_free: editingItem.is_nut_free,
        is_sugar_free: editingItem.is_sugar_free,
        is_salt_free: editingItem.is_salt_free,
        thumbnail_shape: editingItem.thumbnail_shape,
        images: seedImages(editingItem),
        display_order: editingItem.display_order,
        is_weekly_special: editingItem.is_weekly_special,
        name_es: editingItem.name_es || '',
        description_es: editingItem.description_es || '',
        location: editingItem.location || '',
        location_es: editingItem.location_es || '',
        glass_price: editingItem.glass_price || '',
        bottle_price: editingItem.bottle_price || '',
        member_bottle_price: editingItem.member_bottle_price || '',
        flavor_profile: editingItem.flavor_profile || '',
        flavor_profile_es: editingItem.flavor_profile_es || '',
        unique_selling_points: editingItem.unique_selling_points || '',
        unique_selling_points_es: editingItem.unique_selling_points_es || '',
        item_season: (editingItem.season as 'winter' | 'summer' | 'both') || 'both',
      });
    } else {
      const cat = findFormCat(iCategory);
      setFormData({
        name: '',
        description: '',
        price: '',
        category: iCategory || '',
        subcategory: iSubcategory || '',
        available_for_lunch: cat?.filter_behavior === 'lunch',
        available_for_dinner: cat?.filter_behavior === 'dinner',
        is_gluten_free: false,
        is_gluten_free_available: false,
        is_vegetarian: false,
        is_vegetarian_available: false,
        is_dairy_free: false,
        is_egg_free: false,
        is_nut_free: false,
        is_sugar_free: false,
        is_salt_free: false,
        thumbnail_shape: 'square',
        images: [],
        display_order: 0,
        is_weekly_special: false,
        name_es: '',
        description_es: '',
        location: '',
        location_es: '',
        glass_price: '',
        bottle_price: '',
        member_bottle_price: '',
        flavor_profile: '',
        flavor_profile_es: '',
        unique_selling_points: '',
        unique_selling_points_es: '',
        item_season: iSeason,
      });
      addSessionRef.current += 1;
    }
    removedPhotosRef.current = [];
    setDescriptionSelection({ start: 0, end: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingItem]);

  // Indexed assignment (not an object-literal computed property) so the
  // union-typed `field` resolves against a single, unambiguous FormData type.
  const toggleDietary = (field: DietaryField) => {
    setFormData((prev) => {
      const next = { ...prev };
      next[field] = !next[field];
      return next;
    });
  };

  const handleSave = async () => {
    const authorName = isSpanishAuthor ? formData.name_es : formData.name;
    const winePriceMissing = isWine && !formData.glass_price && !formData.bottle_price;
    // Category is required too: the old modal could never reach an empty
    // category (a pager page was always active), but the search-mode Add path
    // can — and a ''-category row would be invisible everywhere but search.
    if (!authorName || !formData.category || (!isWine && !formData.price) || winePriceMissing) {
      Alert.alert(t('common:error'), t('menu_editor:error_fill_fields'));
      return;
    }
    // A category with subcategories needs one of them picked — an item filed
    // under none matches no page tab (s88: moved items were saved into the void).
    if (showSubcategory && !formVisibleSubs.some((sub) => catKey(sub.display_name) === catKey(formData.subcategory))) {
      Alert.alert(t('common:error'), t('menu_editor:error_pick_subcategory'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('common:error'), t('menu_editor:error_not_authenticated'));
      return;
    }

    const resolved = await translation.resolveOnSave();
    if (!resolved) return;

    try {
      // The strip holds stored URLs only (uploaded on pick), cover first. With
      // p_images passed the RPCs set thumbnail_url = images[0] themselves;
      // p_thumbnail_url carries the same cover for the arg contract (null
      // clears a row whose last photo was removed).
      const images = formData.images;
      const thumbnailUrl: string | null = images[0] ?? null;

      // location_es is clearable for wine items only (a wine's region should
      // clear like its name); for non-wine items it stays OUT — it is sent as
      // '' on every save regardless, and a global clear would wipe every
      // non-wine item's location_es (utils/translateContent.ts:197-203).
      const clearBlank = isWine ? ['name_es', 'description_es', 'location_es'] : ['name_es', 'description_es'];

      if (editingItem) {
        const { error } = await supabase.rpc('update_menu_item', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_menu_item_id: editingItem.id,
          p_name: resolved.name.en,
          p_description: (resolved.description.en || null) as string,
          p_price: formData.price,
          p_category: formData.category,
          p_subcategory: (subToSave || null) as string,
          p_available_for_lunch: lunchOn,
          p_available_for_dinner: dinnerOn,
          p_is_gluten_free: formData.is_gluten_free,
          p_is_gluten_free_available: formData.is_gluten_free_available,
          p_is_vegetarian: formData.is_vegetarian,
          p_is_vegetarian_available: formData.is_vegetarian_available,
          p_is_dairy_free: formData.is_dairy_free,
          p_is_egg_free: formData.is_egg_free,
          p_is_nut_free: formData.is_nut_free,
          p_is_sugar_free: formData.is_sugar_free,
          p_is_salt_free: formData.is_salt_free,
          p_thumbnail_url: thumbnailUrl as string,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_images: images,
          // TRAP: p_display_order defaults to 0 / p_season to 'both' on the
          // live RPC — omitting either on update RESETS the row. Always
          // round-trip both exactly, never derive them here.
          p_display_order: formData.display_order,
          p_location: isWine ? resolved.location?.en || undefined : undefined,
          p_glass_price: isWine ? formData.glass_price || undefined : undefined,
          p_bottle_price: isWine ? formData.bottle_price || undefined : undefined,
          p_member_bottle_price: isWine ? formData.member_bottle_price || undefined : undefined,
          p_flavor_profile: isWine ? resolved.flavor_profile?.en || undefined : undefined,
          p_flavor_profile_es: isWine ? resolved.flavor_profile?.es || undefined : undefined,
          p_unique_selling_points: isWine ? resolved.unique_selling_points?.en || undefined : undefined,
          p_unique_selling_points_es: isWine ? resolved.unique_selling_points?.es || undefined : undefined,
          p_season: formData.item_season,
          p_is_weekly_special: formData.is_weekly_special,
        });
        if (error) {
          console.error('Error updating menu item:', error);
          throw error;
        }

        await saveTranslations(
          'menu_items',
          editingItem.id,
          {
            name_es: resolved.name.es,
            description_es: resolved.description.es,
            location_es: resolved.location?.es ?? '',
          },
          user.id,
          { clearBlank }
        );
      } else {
        // Host-computed — it owns allItems (this sheet never fetches items).
        const nextOrder = computeNextOrder(formData.category, subToSave, formData.item_season);
        const { data, error } = await supabase.rpc('create_menu_item', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_name: resolved.name.en,
          p_description: (resolved.description.en || null) as string,
          p_price: formData.price,
          p_category: formData.category,
          p_subcategory: (subToSave || null) as string,
          p_available_for_lunch: lunchOn,
          p_available_for_dinner: dinnerOn,
          p_is_gluten_free: formData.is_gluten_free,
          p_is_gluten_free_available: formData.is_gluten_free_available,
          p_is_vegetarian: formData.is_vegetarian,
          p_is_vegetarian_available: formData.is_vegetarian_available,
          p_is_dairy_free: formData.is_dairy_free,
          p_is_egg_free: formData.is_egg_free,
          p_is_nut_free: formData.is_nut_free,
          p_is_sugar_free: formData.is_sugar_free,
          p_is_salt_free: formData.is_salt_free,
          p_thumbnail_url: thumbnailUrl as string,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_images: images,
          p_display_order: nextOrder,
          p_location: isWine ? resolved.location?.en || undefined : undefined,
          p_glass_price: isWine ? formData.glass_price || undefined : undefined,
          p_bottle_price: isWine ? formData.bottle_price || undefined : undefined,
          p_member_bottle_price: isWine ? formData.member_bottle_price || undefined : undefined,
          p_flavor_profile: isWine ? resolved.flavor_profile?.en || undefined : undefined,
          p_flavor_profile_es: isWine ? resolved.flavor_profile?.es || undefined : undefined,
          p_unique_selling_points: isWine ? resolved.unique_selling_points?.en || undefined : undefined,
          p_unique_selling_points_es: isWine ? resolved.unique_selling_points?.es || undefined : undefined,
          p_season: formData.item_season,
          p_is_weekly_special: formData.is_weekly_special,
        });
        if (error) {
          console.error('Error creating menu item:', error);
          throw error;
        }

        if (data) {
          await saveTranslations(
            'menu_items',
            data as string,
            {
              name_es: resolved.name.es,
              description_es: resolved.description.es,
              location_es: resolved.location?.es ?? '',
            },
            user.id,
            { clearBlank }
          );
        }
      }
      // Cleanup isolated in its own try/catch — a storage failure here must
      // never surface as a false "save failed" alert after the row write
      // already succeeded (mirrors the delete flow's brokerDelete isolation).
      // Runs after a create too: a photo picked then removed before the first
      // save was uploaded on pick and is referenced by no row. The broker
      // takes at most 10 urls per call, so this chunks like the delete flow.
      const removed = removedPhotosRef.current.filter((url) => !images.includes(url));
      removedPhotosRef.current = [];
      for (let i = 0; i < removed.length; i += 10) {
        try {
          await brokerDelete('menu-items', removed.slice(i, i + 10), user.id);
        } catch (cleanupError) {
          console.error('Error deleting removed menu item photos:', cleanupError);
        }
      }
      // No success alert / no close here — the host owns both, timed off its
      // own 450ms Modal-dismissal floor once it hides this sheet.
      onSaved();
    } catch (error: any) {
      console.error('Error saving menu item:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('menu_editor:save_error')));
    }
  };

  const chip = (opts: { key: string; abbrev?: string; label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
      key={opts.key}
      onPress={opts.onPress}
      style={[styles.chip, opts.selected ? styles.chipOn : styles.chipOff]}
    >
      {!!opts.abbrev && (
        <Text style={[styles.chipAbbrev, { color: opts.selected ? colors.blueText : colors.textSecondary }]}>
          {opts.abbrev}
        </Text>
      )}
      <Text
        style={[styles.chipLabel, { color: opts.selected ? colors.blueText : colors.textSecondary }]}
        numberOfLines={1}
      >
        {opts.label}
      </Text>
    </Pressable>
  );

  const footer = (
    <View style={styles.footerRow}>
      <Pressable style={[styles.footerBtn, styles.footerBtnCancel]} onPress={onClose}>
        <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
      </Pressable>
      <Pressable style={[styles.footerBtn, styles.footerBtnSave]} onPress={handleSave}>
        <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
          {editingItem ? t('menu_editor:save_button') : t('menu_editor:add_save_button')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismissed}
      title={editingItem ? t('menu_editor:modal_edit') : t('menu_editor:modal_add')}
      footer={footer}
    >
      {/* 1. Menu Choice — single-menu orgs never see this; item_season stays 'both'. */}
      {organization?.menu_count === 2 && (
        <View>
          <Text style={styles.formLabel}>{t('menu_editor:season_label')}</Text>
          <View style={styles.seg}>
            {menuChoiceOptions.map((s) => {
              const active = formData.item_season === s;
              const label =
                s === 'winter'
                  ? organization?.menu_1_name || t('menu_editor:season_winter')
                  : s === 'summer'
                  ? organization?.menu_2_name || t('menu_editor:season_summer')
                  : t('menu_editor:season_both');
              return (
                <Pressable
                  key={s}
                  style={[styles.segOpt, active && styles.segOptActive]}
                  onPress={() => {
                    // Switching to a DIFFERENT menu (per-menu) clears
                    // category/subcategory — each menu has its own tree.
                    const newSlot = s === 'summer' ? 2 : 1;
                    const oldSlot = formData.item_season === 'summer' ? 2 : 1;
                    if (perMenu && newSlot !== oldSlot) {
                      setFormData((prev) => ({ ...prev, item_season: s, category: '', subcategory: '' }));
                    } else {
                      setFormData((prev) => ({ ...prev, item_season: s }));
                    }
                  }}
                >
                  <Text style={[styles.segLabel, { color: active ? colors.fireText : colors.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {perMenu && formData.item_season === 'both' && (
            <Text style={styles.hint}>{t('menu_editor:season_both_legacy_hint')}</Text>
          )}
        </View>
      )}

      {/* 2. Category */}
      <View>
        <Text style={styles.formLabel}>{t('menu_editor:category_label')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {categoryOptions.map((cat) => {
            const active = catKey(cat.display_name) === catKey(formData.category);
            return (
              <Pressable
                key={cat.id}
                style={styles.catChip}
                onPress={() =>
                  setFormData((prev) =>
                    catKey(prev.category) === catKey(cat.display_name)
                      ? prev
                      : {
                          ...prev,
                          category: cat.display_name,
                          subcategory: '',
                          // Re-filing resets the meal tags to the new home's own
                          // (a stale tick would ghost the item onto the old meal).
                          available_for_lunch: cat.filter_behavior === 'lunch',
                          available_for_dinner: cat.filter_behavior === 'dinner',
                        },
                  )
                }
              >
                <View style={styles.catChipInner}>
                  <Text style={[styles.catChipLabel, active && styles.catChipLabelActive]} numberOfLines={1}>
                    {categoryLabel(cat, t, language)}
                  </Text>
                  <View style={[styles.catChipUnderline, { backgroundColor: active ? cat.color : 'transparent' }]} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Subcategory */}
      {showSubcategory && (
        <View>
          <Text style={styles.formLabel}>{t('menu_editor:subcategory_label')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.subChipRow}>
            {formVisibleSubs.map((sub) => {
              const active = catKey(sub.display_name) === catKey(formData.subcategory);
              return (
                <Pressable
                  key={sub.id}
                  style={styles.subChip}
                  hitSlop={{ top: 6, bottom: 6 }}
                  onPress={() => setFormData((prev) => ({ ...prev, subcategory: sub.display_name }))}
                >
                  <Text style={[styles.subChipLabel, active && styles.subChipLabelActive]} numberOfLines={1}>
                    {subcategoryLabel(sub, t, language)}
                  </Text>
                  <View
                    style={[
                      styles.subChipUnderline,
                      { backgroundColor: active ? selectedFormCat?.color || 'transparent' : 'transparent' },
                    ]}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 3.5 Availability — shared-mode Lunch/Dinner meal-service overlay. */}
      {showAvailability && (
        <View>
          <Text style={styles.formLabel}>{t('menu_editor:available_for_label')}</Text>
          <Text style={styles.hint}>
            {ownMeal
              ? t('menu_editor:available_for_hint_own', {
                  own: ownMeal === 'lunch' ? formLunchName : formDinnerName,
                  other: ownMeal === 'lunch' ? formDinnerName : formLunchName,
                })
              : t('menu_editor:available_for_hint')}
          </Text>
          <View style={styles.chipsWrap}>
            {formHasLunchCat &&
              chip({
                key: 'lunch',
                label: formLunchName,
                selected: lunchOn,
                onPress: () =>
                  ownMeal === 'lunch'
                    ? undefined
                    : setFormData((prev) => ({ ...prev, available_for_lunch: !prev.available_for_lunch })),
              })}
            {formHasDinnerCat &&
              chip({
                key: 'dinner',
                label: formDinnerName,
                selected: dinnerOn,
                onPress: () =>
                  ownMeal === 'dinner'
                    ? undefined
                    : setFormData((prev) => ({ ...prev, available_for_dinner: !prev.available_for_dinner })),
              })}
          </View>
        </View>
      )}

      {/* The Libations / Wine note sits BELOW the pickers (s88, Steve): the
          category and subcategory rows read as one block, then the meal
          chips, then this. The section gap already spaces it. */}
      {showWineLibNote && <Text style={[styles.hint, { marginTop: 0 }]}>{t('menu_editor:wine_libations_note')}</Text>}

      {/* 4. Name */}
      <View>
        <Text style={styles.formLabel}>{t('menu_editor:name_label')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('menu_editor:name_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={isSpanishAuthor ? formData.name_es : formData.name}
          onChangeText={(text) =>
            setFormData((prev) => (isSpanishAuthor ? { ...prev, name_es: text } : { ...prev, name: text }))
          }
        />
      </View>

      {/* 4.5 Photos — up to four, cover first (s90). The field uploads on pick
          and owns its nested photo sheet (library / camera / make cover / move
          / remove); the Shape segment right below governs the whole set's crop. */}
      <View>
        <MultiImageField
          images={formData.images}
          onChange={(next) => setFormData((prev) => ({ ...prev, images: next }))}
          onRemove={(url) => removedPhotosRef.current.push(url)}
          purpose="menu_item_image"
          bucket="menu-items"
          aspect={formData.thumbnail_shape === 'square' ? [1, 1] : [16, 9]}
        />
        {isWine && (
          <View style={styles.winePhotoTipRow}>
            <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={13} color={colors.textSecondary} />
            <Text style={styles.winePhotoTipText}>{t('menu_editor:wine_photo_tip')}</Text>
          </View>
        )}
      </View>

      {/* 5. Shape + Price (wine hides Price — Glass/Bottle/Member live in the wine block) */}
      <View style={styles.twoColRow}>
        <View style={styles.shapeCol}>
          <Text style={styles.formLabel}>{t('menu_editor:shape_label')}</Text>
          <View style={styles.seg}>
            <Pressable
              style={[styles.segOpt, formData.thumbnail_shape === 'square' && styles.segOptActive]}
              onPress={() => setFormData((prev) => ({ ...prev, thumbnail_shape: 'square' }))}
            >
              <Text
                style={[
                  styles.segLabel,
                  { color: formData.thumbnail_shape === 'square' ? colors.fireText : colors.textSecondary },
                ]}
              >
                {t('menu_editor:shape_square')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segOpt, formData.thumbnail_shape === 'banner' && styles.segOptActive]}
              onPress={() => setFormData((prev) => ({ ...prev, thumbnail_shape: 'banner' }))}
            >
              <Text
                style={[
                  styles.segLabel,
                  { color: formData.thumbnail_shape === 'banner' ? colors.fireText : colors.textSecondary },
                ]}
              >
                {t('menu_editor:shape_banner')}
              </Text>
            </Pressable>
          </View>
        </View>
        {!isWine && (
          <View style={styles.priceCol}>
            <Text style={styles.formLabel}>{t('menu_editor:price_label')}</Text>
            <View style={styles.inputAdornmentRow}>
              <Text style={styles.inputAdornmentSign}>$</Text>
              <TextInput
                style={styles.inputAdornmentField}
                placeholder={t('menu_editor:price_placeholder')}
                placeholderTextColor={colors.textSecondary}
                value={formData.price}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, price: text }))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        )}
      </View>

      {/* 6. Description */}
      <View>
        <Text style={styles.formLabel}>{t('menu_editor:description_label')}</Text>
        <RichTextToolbar
          text={isSpanishAuthor ? formData.description_es : formData.description}
          onChangeText={(text) =>
            setFormData((prev) => (isSpanishAuthor ? { ...prev, description_es: text } : { ...prev, description: text }))
          }
          selection={descriptionSelection}
          onSelectionChange={setDescriptionSelection}
          textInputRef={descriptionInputRef}
          accentColor={colors.highlight}
          backgroundColor={colors.glass}
          textColor={colors.text}
        />
        <TextInput
          ref={descriptionInputRef}
          style={[styles.input, styles.textArea]}
          placeholder={t('menu_editor:description_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={isSpanishAuthor ? formData.description_es : formData.description}
          onChangeText={(text) =>
            setFormData((prev) => (isSpanishAuthor ? { ...prev, description_es: text } : { ...prev, description: text }))
          }
          multiline
          numberOfLines={4}
          onSelectionChange={(e) => setDescriptionSelection(e.nativeEvent.selection)}
        />
      </View>

      {/* 7. Wine-only block — source of truth for auto-generated quiz/game questions. */}
      {isWine && (
        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.formLabel}>{t('menu_editor:wine_location_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('menu_editor:wine_location_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={isSpanishAuthor ? formData.location_es : formData.location}
              onChangeText={(text) =>
                setFormData((prev) => (isSpanishAuthor ? { ...prev, location_es: text } : { ...prev, location: text }))
              }
            />
          </View>
          <View style={styles.twoColRow}>
            <View style={styles.twoColItem}>
              <Text style={styles.formLabel}>{t('menu_editor:wine_glass_price_label')}</Text>
              <View style={styles.inputAdornmentRow}>
                <Text style={styles.inputAdornmentSign}>$</Text>
                <TextInput
                  style={styles.inputAdornmentField}
                  placeholder="12"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.glass_price}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, glass_price: text }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.twoColItem}>
              <Text style={styles.formLabel}>{t('menu_editor:wine_bottle_price_label')}</Text>
              <View style={styles.inputAdornmentRow}>
                <Text style={styles.inputAdornmentSign}>$</Text>
                <TextInput
                  style={styles.inputAdornmentField}
                  placeholder="45"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.bottle_price}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, bottle_price: text }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.formLabel}>{t('menu_editor:wine_member_bottle_price_label')}</Text>
            <View style={styles.inputAdornmentRow}>
              <Text style={styles.inputAdornmentSign}>$</Text>
              <TextInput
                style={styles.inputAdornmentField}
                placeholder="40"
                placeholderTextColor={colors.textSecondary}
                value={formData.member_bottle_price}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, member_bottle_price: text }))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.formLabel}>{t('menu_editor:wine_flavor_label')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('menu_editor:wine_flavor_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={isSpanishAuthor ? formData.flavor_profile_es : formData.flavor_profile}
              onChangeText={(text) =>
                setFormData((prev) =>
                  isSpanishAuthor ? { ...prev, flavor_profile_es: text } : { ...prev, flavor_profile: text }
                )
              }
              multiline
              numberOfLines={3}
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.formLabel}>{t('menu_editor:wine_selling_points_label')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('menu_editor:wine_selling_points_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={isSpanishAuthor ? formData.unique_selling_points_es : formData.unique_selling_points}
              onChangeText={(text) =>
                setFormData((prev) =>
                  isSpanishAuthor
                    ? { ...prev, unique_selling_points_es: text }
                    : { ...prev, unique_selling_points: text }
                )
              }
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      )}

      {/* 8. Bilingual translation preview/pencil — after ALL authored text fields. */}
      {translation.element}

      {/* 9. Dietary — always rendered, no gating condition. */}
      <View>
        <Text style={styles.formLabel}>{t('menu_editor:dietary_label')}</Text>
        <View style={styles.chipsWrap}>
          {DIETARY_CHIPS.map((d) =>
            chip({
              key: d.field,
              abbrev: t(d.abbrevKey),
              label: t(d.labelKey),
              selected: formData[d.field],
              onPress: () => toggleDietary(d.field),
            })
          )}
        </View>
      </View>

      {/* 10. Feature on Weekly Specials — hidden when the item already lives there. */}
      {showWeeklySpecialFeature && (
        <View style={styles.featureRow}>
          <View style={styles.featureTextCol}>
            <Text style={styles.featureLabel}>{t('menu_editor:weekly_special_label', { name: formWeeklySpecialsLabel })}</Text>
            <Text style={styles.featureHint}>{t('menu_editor:weekly_special_hint', { name: formWeeklySpecialsLabel })}</Text>
          </View>
          <Switch
            value={formData.is_weekly_special}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, is_weekly_special: v }))}
            trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
            thumbColor={colors.card}
            accessibilityLabel={t('menu_editor:weekly_special_checkbox', { name: formWeeklySpecialsLabel })}
          />
        </View>
      )}
    </GlassSheet>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    section: { gap: 12 },
    formLabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      marginBottom: 6,
      color: colors.textSecondary,
    },
    hint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 6,
    },
    input: {
      minHeight: 43,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontFamily: fonts.body.regular,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    inputAdornmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 43,
      borderRadius: 13,
      paddingHorizontal: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    inputAdornmentSign: { fontFamily: fonts.body.semibold, fontSize: 14, color: colors.textSecondary, marginRight: 3 },
    inputAdornmentField: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, color: colors.text, paddingVertical: 11 },

    twoColRow: { flexDirection: 'row', gap: 10 },
    twoColItem: { flex: 1, gap: 6 },
    shapeCol: { flex: 1 },
    priceCol: { flex: 1 },

    seg: {
      flexDirection: 'row',
      gap: 6,
      padding: 3,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    segOpt: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    segOptActive: { backgroundColor: colors.primary },
    segLabel: { fontFamily: fonts.display.semibold, fontSize: 12.5 },

    chipScroll: { flexGrow: 0 },
    chipRow: { gap: 7, paddingRight: 4 },
    catChip: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 10,
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    catChipInner: { alignItems: 'center' },
    catChipLabel: { fontFamily: fonts.display.semibold, fontSize: 12.5, color: colors.textSecondary },
    catChipLabelActive: { color: colors.text },
    catChipUnderline: { alignSelf: 'stretch', height: 2.5, borderRadius: 2, marginTop: 3 },

    subChipRow: { gap: 14, paddingRight: 4, alignItems: 'center' },
    subChip: { alignItems: 'center' },
    subChipLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5, color: colors.textSecondary },
    subChipLabelActive: { color: colors.text },
    subChipUnderline: { alignSelf: 'stretch', height: 2, borderRadius: 1, marginTop: 3 },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 32,
      paddingHorizontal: 10,
      borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    chipOff: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
    chipOn: { backgroundColor: colors.blue + '29', borderColor: colors.blue + '57' },
    chipAbbrev: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.4 },
    chipLabel: { fontFamily: fonts.body.semibold, fontSize: 11.5 },

    winePhotoTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8 },
    winePhotoTipText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, color: colors.textSecondary },

    fieldBlock: { gap: 6 },

    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    featureTextCol: { flex: 1 },
    featureLabel: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.text },
    featureHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2, color: colors.textSecondary },

    // paddingTop = breathing room between the scrolled body's last row and the
    // pinned buttons (Steve's smoke: content ran straight into the borders).
    footerRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
    footerBtn: {
      flex: 1,
      height: 47,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    footerBtnCancel: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
    footerBtnSave: { backgroundColor: colors.primary, borderColor: colors.primary },
    footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
  });
