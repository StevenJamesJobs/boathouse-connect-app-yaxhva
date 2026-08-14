
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { stripFormattingTags } from '@/components/FormattedText';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { getImageUrl } from '@/utils/imageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';
import { isManagerOrOwner } from '@/utils/roles';
import { useMenuCategories, type MenuCategory } from '@/hooks/useMenuCategories';
import { useRedemptionSettings, foodRedeemCost } from '@/hooks/useRedemptionSettings';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import {
  labelForCategoryName,
  labelForSubcategoryName,
  resolveRecipeSubName,
} from '@/utils/menuCategoryLabels';
import { menuBadgeForSeason as menuBadgeForSeasonUtil, compareBySectionThenOrder } from '@/utils/menuBadges';
import MenuTopArea, { MenuSeasonTabs } from '@/components/MenuTopArea';
import MenuSearchRow from '@/components/MenuSearchRow';
import MenuCategoryTabs from '@/components/MenuCategoryTabs';
import MenuItemDetailSheet, { type MenuItemForDetail } from '@/components/MenuItemDetailSheet';
import { MenuItemSquareCard, MenuItemBannerCard } from '@/components/MenuItemCards';
import MenuFilterSheet, { type DietKey } from '@/components/MenuFilterSheet';
import MenuSheet from '@/components/MenuSheet';

interface MenuItem {
  id: string;
  name: string;
  name_es?: string | null;
  description: string | null;
  description_es?: string | null;
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
  display_order: number;
  is_active: boolean;
  is_weekly_special?: boolean;
  season?: string;
  location?: string | null;
  location_es?: string | null;
  glass_price?: string | null;
  bottle_price?: string | null;
  member_bottle_price?: string | null;
  flavor_profile?: string | null;
  flavor_profile_es?: string | null;
  unique_selling_points?: string | null;
  unique_selling_points_es?: string | null;
  updated_at?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// Legacy wire values: 'winter' = Menu 1, 'summer' = Menu 2. Unchanged.
type Season = 'winter' | 'summer';

// The category tree (and each category's accent color) is loaded per-org from
// the DB via useMenuCategories. The swipe-pager page sequence — one page per
// subcategory plus a virtual 'All' page per category — is derived per-render in
// the component. 'All' is never persisted; it stays a display-only affordance.
const ALL_PAGE_KEY = 'All';

// The subcategory-tab row's virtual 'All' entry (rendered FIRST, never persisted).
const SUB_ALL_TAB = '__all__';

interface PageConfig {
  category: string;
  subcategory: string | null;
}

// Phantom bridge page used when swipe-to-welcome is enabled
const WELCOME_BRIDGE_PAGE: PageConfig = { category: '__welcome-bridge__', subcategory: null };

// Cocktail recipe injection (summer_libation_recipes / libation_recipes) is now
// resolved against the org's live Libations subcategories by stable system_key
// (RECIPE_CATEGORY_TO_SUBCATEGORY_KEY in utils/menuCategoryLabels), so injected
// cocktails follow subcategory renames. See `libInjection` in the component.

// The nine dietary flags, in display order (abbrev + full labels live in the
// `dietary` i18n namespace).
const DIET_KEYS: DietKey[] = ['gf', 'gfa', 'v', 'va', 'df', 'ef', 'nf', 'sf', 'nos'];

// Case-insensitive category/subcategory name key — the DB unique indexes are
// lower()-based and the AI upload path writes free-text names, so 'Chow Fun'
// and 'chow fun' are the same category (the s66 guides fix). Matching always
// normalizes; display always prints the stored/translated name.
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

// Search-collapse geometry: the search row is 46pt + 11pt margin. The chrome
// overlay glides up by exactly this much when the row collapses.
const SEARCH_ROW_H = 57;

// Category/subcategory labels resolve through utils/menuCategoryLabels:
// built-ins keep their i18n labels; renamed/custom names show raw.

interface MenuDisplayProps {
  colors: ThemeColorSet;
  /** Called when user swipes right past Weekly Specials (first page) to go back to Welcome */
  onSwipeToWelcome?: () => void;
}

export default function MenuDisplay({ colors, onSwipeToWelcome }: MenuDisplayProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { organizationId, organization } = useOrganization();
  // Default to Menu 1 (winter slot) for everyone — the more natural landing menu.
  const [season, setSeason] = useState<Season>('winter');
  // In per-menu scope the active season selects which menu's category tree to render.
  const { categories: menuCats, loading: categoriesLoading } = useMenuCategories({
    menuSlot: season === 'winter' ? 1 : 2,
  });
  // Filter-sheet Categories needs BOTH menus' trees regardless of which one
  // the pager is showing (menuCats above tracks the PAGER's season only) —
  // two slot-pinned calls, always mounted (hooks can't be conditional). In
  // 'shared' scope both resolve to the same effectiveSlot=0 tree (harmless
  // duplicate fetch, never wrong data); in 'per_menu' scope they diverge.
  const { categories: menuCatsSlot1 } = useMenuCategories({ menuSlot: 1 });
  const { categories: menuCatsSlot2 } = useMenuCategories({ menuSlot: 2 });

  const hasBridge = !!onSwipeToWelcome;

  const perMenu = organization?.menu_category_scope === 'per_menu';
  // Behavior resolvers — key off system_key / filter_behavior, not display name,
  // so Wine/Lunch/Dinner/Libations behavior survives renames. Lookup is
  // case-insensitive (catKey) against the loaded tree.
  const catOf = useCallback(
    (name: string | null | undefined) => {
      if (!name) return undefined;
      const key = catKey(name);
      return menuCats.find((c) => catKey(c.display_name) === key);
    },
    [menuCats],
  );
  const isWineName = useCallback(
    (name: string | null | undefined) => catOf(name)?.system_key === 'cat.wine',
    [catOf],
  );
  const categoryMatches = useCallback(
    (item: MenuItem, categoryName: string): boolean => {
      const fb = catOf(categoryName)?.filter_behavior;
      // Per-menu treats Lunch/Dinner as normal categories (placement by assignment);
      // shared mode keeps the meal-availability overlay.
      if (!perMenu && fb === 'lunch') return item.available_for_lunch;
      if (!perMenu && fb === 'dinner') return item.available_for_dinner;
      // Weekly Specials is an overlay: items flagged is_weekly_special surface
      // here too, on top of items actually categorized as Weekly Specials.
      if (fb === 'weekly_specials') return catKey(item.category) === catKey(categoryName) || !!item.is_weekly_special;
      return catKey(item.category) === catKey(categoryName);
    },
    [catOf, perMenu],
  );

  // ── Categories filter (Steve's feature) — needs BOTH menus' trees, not
  // just the pager's active one, so a selection resolves the same regardless
  // of which menu it lives on or which row the sheet's own Menu control shows.
  const unionCatTree = useMemo(() => {
    if (organization.menu_count !== 2) return menuCatsSlot1;
    // Dedup by system_key when present (built-ins survive renames), else by
    // catKey(display_name) for customs — first occurrence (slot 1) wins the
    // colour, matching "first colour wins" for anything that legitimately
    // exists on both trees.
    const seen = new Set<string>();
    const out: MenuCategory[] = [];
    for (const c of [...menuCatsSlot1, ...menuCatsSlot2]) {
      const dedupeKey = c.system_key || catKey(c.display_name);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(c);
    }
    return out;
  }, [organization.menu_count, menuCatsSlot1, menuCatsSlot2]);
  const unionCatOf = useCallback(
    (name: string | null | undefined) => {
      if (!name) return undefined;
      const key = catKey(name);
      return unionCatTree.find((c) => catKey(c.display_name) === key);
    },
    [unionCatTree],
  );
  // Same shape as categoryMatches above, resolved against the UNION tree — a
  // selected category keeps matching correctly even if the sheet's own Menu
  // row later narrows to a menu whose tree doesn't carry this category's
  // filter_behavior. Callers OR this across selections (getSearchFilteredItems).
  const filterCatMatches = useCallback(
    (item: MenuItem, categoryName: string): boolean => {
      const fb = unionCatOf(categoryName)?.filter_behavior;
      if (!perMenu && fb === 'lunch') return item.available_for_lunch;
      if (!perMenu && fb === 'dinner') return item.available_for_dinner;
      if (fb === 'weekly_specials') return catKey(item.category) === catKey(categoryName) || !!item.is_weekly_special;
      return catKey(item.category) === catKey(categoryName);
    },
    [unionCatOf, perMenu],
  );

  // Single source of truth for the filter predicates (sheet options, the
  // count badge, and the filtered results all agree). The category-behavior
  // cases survive from the old chip system and stay keyed off system_key.
  const matchesFilter = useCallback(
    (item: MenuItem, filter: string): boolean => {
      switch (filter) {
        case 'dinner': return item.available_for_dinner;
        case 'lunch': return item.available_for_lunch;
        case 'gf': return item.is_gluten_free;
        case 'gfa': return item.is_gluten_free_available;
        case 'v': return item.is_vegetarian;
        case 'va': return item.is_vegetarian_available;
        case 'df': return item.is_dairy_free;
        case 'ef': return item.is_egg_free;
        case 'nf': return item.is_nut_free;
        case 'sf': return item.is_sugar_free;
        case 'nos': return item.is_salt_free;
        case 'wine': return isWineName(item.category);
        case 'libations': return catOf(item.category)?.system_key === 'cat.libations';
        case 'happyHour': return catOf(item.category)?.system_key === 'cat.happy_hour';
        // Match the Featured Specials PAGE: items in the specials category OR
        // flag-overlaid ones (the old chip missed is_weekly_special items).
        case 'weeklySpecials':
          return catOf(item.category)?.filter_behavior === 'weekly_specials' || !!item.is_weekly_special;
        default: return true;
      }
    },
    [isWineName, catOf],
  );

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  // Cross-menu search corpus (both menus + their injected cocktails), deduped.
  // Used only when there's a search query so the customer can find an item on
  // either menu; the badge on each result shows which menu it lives on.
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter items for a given page
  const getItemsForPage = useCallback((page: PageConfig): MenuItem[] => {
    // Featured Specials combines flagged items from BOTH menus (allItems) so the
    // tab shows the same set on Menu 1 and Menu 2; every other page stays scoped
    // to the active menu (menuItems).
    const isSpecials = catOf(page.category)?.filter_behavior === 'weekly_specials';
    let filtered = (isSpecials ? allItems : menuItems).filter(item => categoryMatches(item, page.category));

    // Filter by subcategory if not null and not the virtual "All" page
    if (page.subcategory && page.subcategory !== ALL_PAGE_KEY) {
      filtered = filtered.filter(item => catKey(item.subcategory) === catKey(page.subcategory));
    }

    // Group the combined Specials list by category → subcategory → order so
    // flagged items from the same section stay together.
    if (isSpecials) filtered = [...filtered].sort(compareBySectionThenOrder);

    return filtered;
  }, [menuItems, allItems, categoryMatches, catOf]);

  // Build pages from the loaded category tree — one page per subcategory plus a
  // virtual 'All' page per category — minus pages that would render empty for
  // the active menu. Emptiness is computed AFTER cocktail-recipe injection
  // (counts read menuItems/allItems); while items are loading the unfiltered
  // build is returned — the pager is unmounted behind the spinner, so nothing
  // flashes. The bridge page is prepended in PAGES below.
  const menuPages = useMemo<PageConfig[]>(() => {
    const buildAll = (): PageConfig[] => {
      const out: PageConfig[] = [];
      for (const cat of menuCats) {
        const subs = cat.subcategories;
        if (subs.length === 0) {
          out.push({ category: cat.display_name, subcategory: null });
        } else {
          for (const sub of subs) out.push({ category: cat.display_name, subcategory: sub.display_name });
          out.push({ category: cat.display_name, subcategory: ALL_PAGE_KEY });
        }
      }
      return out;
    };
    if (loading) return buildAll();
    const count = (p: PageConfig) => getItemsForPage(p).length;
    const out: PageConfig[] = [];
    for (const cat of menuCats) {
      const name = cat.display_name;
      if (cat.subcategories.length === 0) {
        if (count({ category: name, subcategory: null }) > 0) out.push({ category: name, subcategory: null });
        continue;
      }
      const allPage: PageConfig = { category: name, subcategory: ALL_PAGE_KEY };
      const allCount = count(allPage);
      if (allCount === 0) continue; // whole category empty for this menu
      const survivors = cat.subcategories
        .map((s): PageConfig => ({ category: name, subcategory: s.display_name }))
        .filter((p) => count(p) > 0);
      if (survivors.length === 0) {
        // Items exist but none match a visible subcategory — collapse to one
        // page (a null-subcategory page applies no sub filter, same set as 'All').
        out.push({ category: name, subcategory: null });
      } else if (survivors.length === 1 && count(survivors[0]) === allCount) {
        out.push(survivors[0]); // 'All' would duplicate the only surviving sub-page
      } else {
        out.push(...survivors, allPage); // 'All' keeps null-/stale-subcategory items reachable
      }
    }
    if (out.length === 0) {
      // Whole menu empty — keep the first page so the empty state (+ owner
      // "Set up Menu Now" CTA) renders, and PAGES.length >= bridgeOffset+1
      // stays true whenever the org has categories (landing-index math).
      const all = buildAll();
      if (all.length > 0) out.push(all[0]);
    }
    return out;
  }, [menuCats, loading, getItemsForPage]);
  const PAGES = useMemo(() => {
    return hasBridge ? [WELCOME_BRIDGE_PAGE, ...menuPages] : menuPages;
  }, [hasBridge, menuPages]);
  const bridgeOffset = hasBridge ? 1 : 0;
  // Tabs mirror the surviving pages (empty categories carry no tab).
  const visibleCats = useMemo(
    () => menuCats.filter((c) => menuPages.some((p) => catKey(p.category) === catKey(c.display_name))),
    [menuCats, menuPages],
  );

  // A dietary option only shows in the filter sheet when it would match at
  // least one item on the active menu, so orgs that never set a flag don't get
  // a dead checkbox.
  const availableDietKeys = useMemo(() => {
    if (loading) return new Set<DietKey>(DIET_KEYS);
    return new Set<DietKey>(DIET_KEYS.filter((k) => menuItems.some((item) => matchesFilter(item, k))));
  }, [loading, menuItems, matchesFilter]);

  // Cocktail-recipe injection: map the fixed recipe vocabulary to the org's
  // CURRENT Libations subcategory names (by system_key) so injected cocktails
  // follow renames; plus the set of cocktail-fed names for the winter dedup
  // (names normalized via catKey).
  const libInjection = useMemo(() => {
    const libCat = menuCats.find((c) => c.system_key === 'cat.libations');
    const libationsCategoryName = libCat?.display_name ?? 'Libations';
    const subNameByKey: Record<string, string> = {};
    const cocktailSubNames = new Set<string>();
    if (libCat) {
      for (const s of libCat.subcategories) {
        if (s.system_key) subNameByKey[s.system_key] = s.display_name;
        if (s.is_cocktail_fed) cocktailSubNames.add(catKey(s.display_name));
      }
    }
    return { libationsCategoryName, subNameByKey, cocktailSubNames };
  }, [menuCats]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(bridgeOffset);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [dietFilters, setDietFilters] = useState<DietKey[]>([]);
  // The filter sheet's menu row ('both' = no menu narrowing — the default, and
  // the only value on single-menu orgs).
  const [menuFilterValue, setMenuFilterValue] = useState<'winter' | 'summer' | 'both'>('both');
  // Category filter chips — catKey'd display names, OR'd across selections
  // (see filterCatMatches). Same lifecycle as dietFilters, independent state.
  const [catFilters, setCatFilters] = useState<string[]>([]);
  // Drop stale dietary filters whose option is no longer offered (zero-match
  // flags after a menu switch) so they can't linger with no way to untoggle.
  useEffect(() => {
    if (loading) return;
    setDietFilters((prev) => {
      const next = prev.filter((f) => availableDietKeys.has(f));
      return next.length === prev.length ? prev : next;
    });
  }, [loading, availableDietKeys]);
  // A single-menu org has no menu row in the sheet — never let a stale value linger.
  useEffect(() => {
    if (organization.menu_count !== 2 && menuFilterValue !== 'both') setMenuFilterValue('both');
  }, [organization.menu_count, menuFilterValue]);

  // The Categories filter's own corpus: allItems narrowed the same way
  // getSearchFilteredItems' menuScoped branch narrows it, so the offered
  // chips always match what menuFilterValue would actually search (unlike
  // dietaryOptions above, which stays pinned to the pager's season today).
  const menuScopedItemsForFilter = useMemo(() => {
    if (organization.menu_count !== 2 || menuFilterValue === 'both') return allItems;
    return allItems.filter((item) =>
      menuFilterValue === 'winter' ? item.season !== 'summer' : item.season !== 'winter'
    );
  }, [allItems, organization.menu_count, menuFilterValue]);
  // Which tree backs the OFFERED chip list — follows the sheet's OWN Menu
  // row, not the pager's season. 'both' reuses the union tree so the dedup
  // logic lives in exactly one place.
  const filterCatTree = useMemo(() => {
    if (organization.menu_count !== 2) return menuCatsSlot1;
    if (menuFilterValue === 'winter') return menuCatsSlot1;
    if (menuFilterValue === 'summer') return menuCatsSlot2;
    return unionCatTree;
  }, [organization.menu_count, menuFilterValue, menuCatsSlot1, menuCatsSlot2, unionCatTree]);
  // Item-backed per the visibleCats honesty precedent — no dead chips. Hidden
  // categories are already excluded by useMenuCategories (no includeHidden
  // passed to any of the three hook calls above). Wine/Libations are ordinary
  // rows here — no special-casing, so they appear like any other category.
  const categoryOptions = useMemo(
    () =>
      filterCatTree
        .filter((c) => menuScopedItemsForFilter.some((item) => filterCatMatches(item, c.display_name)))
        .map((c) => ({
          key: catKey(c.display_name),
          label: labelForCategoryName(c.display_name, t, filterCatTree, language),
          color: c.color,
        })),
    [filterCatTree, menuScopedItemsForFilter, filterCatMatches, t, language],
  );
  // Drop a selected category no longer offered (menu-row switch, tree
  // reload) — mirrors the dietFilters cleanup effect above.
  useEffect(() => {
    if (loading) return;
    const offered = new Set(categoryOptions.map((o) => o.key));
    setCatFilters((prev) => {
      const next = prev.filter((k) => offered.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [loading, categoryOptions]);
  const { user } = useAuth();
  const { settings: redemptionSettings } = useRedemptionSettings();
  const { perms: managerPerms, reload: reloadPerms } = useManagerPermissions();
  const router = useRouter();

  const showActionChips = isManagerOrOwner(user);

  const pagerRef = useRef<FlatList>(null);

  // ── Search collapse + sticky-tab backdrop, driven by the ACTIVE page's scrollY ──
  // The collapse is NOT scroll-linked 1:1 — a fast fling made the raw mapping
  // read as an instant jump, and on pages barely taller than the viewport it
  // oscillated (collapsing frees 57pt → the offset falls back → re-expand →
  // shake; smoke-found). Instead the offset only picks a STATE through a
  // hysteresis band, and a timed ease animates the row between the two states.
  // Pages too short to meaningfully scroll never collapse at all.
  const collapseAnim = useRef(new Animated.Value(0)).current; // 0 open → 1 collapsed
  const collapsedRef = useRef(false);
  const collapseRunRef = useRef<Animated.CompositeAnimation | null>(null);
  const pageOffsetsRef = useRef<{ [index: number]: number }>({});
  const pageScrollRefs = useRef<{ [index: number]: ScrollView | null }>({});
  // Every page gets minHeight = viewport + band, so even a two-item category
  // has real room to scroll into and the collapse HOLDS (no clamp-back →
  // no reopen shake). This replaced the old short-page no-collapse gate:
  // Steve's round-5 rule is that every page collapses uniformly.
  const [pageViewportH, setPageViewportH] = useState(0);
  const backdropOnRef = useRef(false);
  const [backdropOn, setBackdropOn] = useState(false);
  const currentPageIndexRef = useRef(currentPageIndex);

  // Collapse fires past 48pt; reopen fires already at 28pt — early enough that
  // the row glides back WHILE the list is still visibly moving instead of
  // popping open after everything has settled (Steve's second smoke). The
  // 20pt gap between the two is the anti-shake hysteresis band.
  const COLLAPSE_AT = 48;
  const EXPAND_AT = 28;

  // The chrome (search row + tab rows) is an OVERLAY translating on the NATIVE
  // driver over a constant-padding pager — nothing resizes. Round 2 animated
  // the row's HEIGHT (a layout property, JS-thread driven), and the JS thread
  // is busiest exactly at the end of a hard fling, so the reopen started late
  // and popped no matter how soft the curve (Steve's third smoke). Transforms
  // + opacity run on the UI thread and glide through the fling's settle.
  // Measured height of the collapsing band (Menu 1/2 tabs + search row) — the
  // overlay glides up by exactly this much, parking the category rows directly
  // under the header. Estimate until the first onLayout corrects it.
  const [bandH, setBandH] = useState(
    organization.menu_count === 2 ? SEARCH_ROW_H + 51 : SEARCH_ROW_H
  );

  // The band fades out faster than it travels (gone by ~65% of the glide) so
  // it has dissolved before its slide carries it over the header chips.
  // Parked, the tabs' backdrop meets the header exactly — the breathing room
  // lives INSIDE the frosted bar (MenuCategoryTabs' top padding), never as a
  // see-through slot with cards swimming in it (Steve's round-6 screenshot).
  const collapseOpacity = collapseAnim.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 0, 0],
  });
  const overlayTranslate = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -bandH],
  });

  // Mirrors collapsedRef as state: the collapsed (invisible) search row is
  // transform-parked over the Menu 1/2 tabs, and a transformed Pressable STILL
  // receives touches at its new position — it must go pointerEvents:none.
  const [chromeCollapsed, setChromeCollapsed] = useState(false);

  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return;
    collapsedRef.current = next;
    setChromeCollapsed(next);
    collapseRunRef.current?.stop();
    collapseRunRef.current = Animated.timing(collapseAnim, {
      toValue: next ? 1 : 0,
      // Both directions glide with the same gentle inOut; the exit runs a
      // touch quicker than the return so browsing still feels responsive
      // (Steve's final tune: the way up wanted the same softness as the way
      // back down — the old out-cubic front-loaded the exit).
      duration: next ? 280 : 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true, // transform + opacity only — UI-thread animation
    });
    collapseRunRef.current.start();
  }, [collapseAnim]);

  // Measured height of the open chrome overlay — the pages pad their content
  // by it so the list top sits exactly under the open rows. Transforms don't
  // affect layout, so the measurement is stable while the overlay glides.
  const [chromeH, setChromeH] = useState(SEARCH_ROW_H + 88);

  const resetCollapse = useCallback(() => {
    collapseRunRef.current?.stop();
    collapsedRef.current = false;
    setChromeCollapsed(false);
    collapseAnim.setValue(0);
  }, [collapseAnim]);

  // A page collapses only when hiding the row still leaves real content to
  // scroll — otherwise the freed 57pt immediately un-scrolls the page and the
  // header shakes open/shut.
  const syncBackdrop = useCallback((y: number) => {
    const on = y > 6;
    if (on !== backdropOnRef.current) {
      backdropOnRef.current = on;
      setBackdropOn(on);
    }
  }, []);

  // Each page records its own offset; only the active page drives the shared
  // collapse state (a background page's late momentum must not fight it).
  // Every page can collapse (minHeight guarantees the room); reopening
  // requires an actual pull back under EXPAND_AT.
  const handlePageScroll = useCallback((pageIndex: number, y: number) => {
    pageOffsetsRef.current[pageIndex] = y;
    if (pageIndex !== currentPageIndexRef.current) return;
    if (y > COLLAPSE_AT) {
      setCollapsed(true);
    } else if (y < EXPAND_AT) {
      setCollapsed(false);
    } // between the thresholds: keep whatever state we're in (hysteresis)
    syncBackdrop(y);
  }, [setCollapsed, syncBackdrop]);

  // Page swipes NEVER change the collapse state (Steve's round-4 rule: once
  // the chrome is tucked away, browsing categories keeps it away — only a
  // pull-down brings it back). Retarget the active page + backdrop; and when
  // arriving collapsed on a page still resting near its top, tuck it to
  // y=bandH so the first cards sit under the parked tabs instead of a
  // band-sized gap (the constant padding reserves space for the OPEN chrome).
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
    let y = pageOffsetsRef.current[currentPageIndex] ?? 0;
    if (collapsedRef.current && y < bandH) {
      pageScrollRefs.current[currentPageIndex]?.scrollTo({ y: bandH, animated: false });
      pageOffsetsRef.current[currentPageIndex] = bandH;
      y = bandH;
    }
    syncBackdrop(y);
  }, [currentPageIndex, bandH, syncBackdrop]);

  // Derive selected category/subcategory from page index
  const currentPage = PAGES[currentPageIndex];
  const selectedCategory = currentPage?.category || '';
  const selectedSubcategory = currentPage?.subcategory || null;
  // Surviving sub-page names for the selected category ('All' included only
  // when it survived the empty-page filter; empty => no sub row).
  const visibleSubNames = useMemo(
    () => menuPages.filter((p) => catKey(p.category) === catKey(selectedCategory) && p.subcategory !== null).map((p) => p.subcategory as string),
    [menuPages, selectedCategory],
  );

  const getCategoryLabel = (category: string) => labelForCategoryName(category, t, menuCats, language);
  const getSubcategoryLabel = (subcategory: string) => labelForSubcategoryName(subcategory, t, menuCats, language);

  // Full dietary labels (filter sheet) + card abbreviations, via literal t()
  // calls so the i18n harvester sees every key.
  const dietLabel = (k: DietKey): string => {
    switch (k) {
      case 'gf': return t('dietary.gf');
      case 'gfa': return t('dietary.gfa');
      case 'v': return t('dietary.v');
      case 'va': return t('dietary.va');
      case 'df': return t('dietary.df');
      case 'ef': return t('dietary.ef');
      case 'nf': return t('dietary.nf');
      case 'sf': return t('dietary.sf');
      case 'nos': return t('dietary.nos');
    }
  };
  const dietAbbrev = (k: DietKey): string => {
    switch (k) {
      case 'gf': return t('dietary.gf_abbrev');
      case 'gfa': return t('dietary.gfa_abbrev');
      case 'v': return t('dietary.v_abbrev');
      case 'va': return t('dietary.va_abbrev');
      case 'df': return t('dietary.df_abbrev');
      case 'ef': return t('dietary.ef_abbrev');
      case 'nf': return t('dietary.nf_abbrev');
      case 'sf': return t('dietary.sf_abbrev');
      case 'nos': return t('dietary.nos_abbrev');
    }
  };

  // The dietary flags a card should chip, in display order.
  const cardDietKeys = (item: MenuItem): DietKey[] => {
    const out: DietKey[] = [];
    if (item.is_gluten_free) out.push('gf');
    if (item.is_gluten_free_available) out.push('gfa');
    if (item.is_vegetarian) out.push('v');
    if (item.is_vegetarian_available) out.push('va');
    if (item.is_dairy_free) out.push('df');
    if (item.is_egg_free) out.push('ef');
    if (item.is_nut_free) out.push('nf');
    if (item.is_sugar_free) out.push('sf');
    if (item.is_salt_free) out.push('nos');
    return out;
  };

  useEffect(() => {
    if (categoriesLoading) return; // wait for the category tree so injection resolves names
    loadMenuItems();
    // A menu/tree change replaces every page's content — the stored per-page
    // offsets no longer describe what's on screen, so open the search row.
    pageOffsetsRef.current = {};
    resetCollapse();
    syncBackdrop(0);
    // PAGES can be shorter than bridgeOffset+1 (logout teardown empties menuCats;
    // a zero-category org is legit too) — scrollToIndex past the end throws an
    // out-of-range Invariant caught by the root ErrorBoundary. Clamp to the list.
    const target = Math.min(bridgeOffset, PAGES.length - 1);
    if (target >= 0) {
      setCurrentPageIndex(target);
      pagerRef.current?.scrollToIndex({ index: target, animated: false });
    }
  }, [season, menuCats, categoriesLoading]);

  // Refresh items when the tab regains focus — the tab navigator keeps this
  // screen mounted, so editor changes (e.g. flagging a Featured Special)
  // otherwise never re-trigger the mount effect. Silent: no spinner, the
  // pager stays in place while fresh data swaps in.
  const focusSkipRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (focusSkipRef.current) { focusSkipRef.current = false; return; }
      if (!categoriesLoading && user?.id) loadMenuItems(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [season, menuCats, categoriesLoading, user?.id])
  );

  // Grants can flip while this tab stays mounted (the owner toggles them in
  // Org Settings → Manager Permissions) and the hook only fetches per mount —
  // so refresh once per tab focus (own effect: the data-refresh callback above
  // re-fires on season switches too, which would spam the RPC). The ⚙-open
  // effect below covers the in-tab case. Smoke-found staleness (s70 round 1).
  useFocusEffect(
    useCallback(() => {
      reloadPerms();
    }, [reloadPerms])
  );

  // PAGES can shrink when the item-aware filter lands (a menu switch can race
  // the category fetch). Keep the index inside the list; the load effect above
  // re-targets the landing page when categories settle.
  useEffect(() => {
    if (currentPageIndex > PAGES.length - 1) {
      const clamped = Math.max(0, PAGES.length - 1);
      setCurrentPageIndex(clamped);
      pagerRef.current?.scrollToIndex({ index: clamped, animated: false });
    }
  }, [PAGES.length, currentPageIndex]);

  const isSearchOrFilterMode =
    searchQuery.trim().length > 0 ||
    dietFilters.length > 0 ||
    catFilters.length > 0 ||
    (organization.menu_count === 2 && menuFilterValue !== 'both');

  // Entering/leaving search-filter mode unmounts/remounts the pager, so the
  // stored per-page offsets no longer describe live scroll views — reset the
  // collapse fully open either way (the search row must be usable while typing).
  useEffect(() => {
    pageOffsetsRef.current = {};
    resetCollapse();
    syncBackdrop(0);
  }, [isSearchOrFilterMode, resetCollapse, syncBackdrop]);

  // Get filtered items for search/filter mode
  const getSearchFilteredItems = useCallback(() => {
    // A text search spans the WHOLE menu (allItems); dietary-only filtering
    // stays on the active menu (menuItems — the classic behavior). A CATEGORY
    // selection also spans both menus: its chips are offered from the
    // cross-menu corpus, so the searched corpus must match that promise or a
    // chip backed only by the other menu returns an empty list (verify-lens
    // finding). The sheet's menu row can then narrow either corpus.
    const menuScoped = organization.menu_count === 2 && menuFilterValue !== 'both';
    let filtered = menuScoped
      ? allItems
      : (searchQuery.trim() || catFilters.length > 0 ? allItems : menuItems);
    if (menuScoped) {
      filtered = filtered.filter((item) =>
        menuFilterValue === 'winter' ? item.season !== 'summer' : item.season !== 'winter'
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query)) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(query)) ||
          (item.is_gluten_free && 'gluten free'.includes(query)) ||
          (item.is_gluten_free_available && 'gluten free available'.includes(query)) ||
          (item.is_vegetarian && 'vegetarian'.includes(query)) ||
          (item.is_vegetarian_available && 'vegetarian available'.includes(query)) ||
          (item.is_gluten_free && 'gf'.includes(query)) ||
          (item.is_gluten_free_available && 'gfa'.includes(query)) ||
          (item.is_vegetarian && 'v'.includes(query)) ||
          (item.is_vegetarian_available && 'va'.includes(query))
      );
    }

    if (dietFilters.length > 0) {
      filtered = filtered.filter(item => dietFilters.every(filter => matchesFilter(item, filter)));
    }

    // Categories: OR across selections (any match keeps the item), AND with
    // everything above. filterCatMatches resolves via the union tree so a
    // selection stays correct regardless of the sheet's own Menu row.
    if (catFilters.length > 0) {
      filtered = filtered.filter(item => catFilters.some(name => filterCatMatches(item, name)));
    }

    return filtered;
  }, [menuItems, allItems, searchQuery, dietFilters, catFilters, menuFilterValue, organization.menu_count, matchesFilter, filterCatMatches]);

  // Computed ONCE per render (the old code filtered the corpus twice: once for
  // the length check and again for the map).
  const searchFilteredItems = useMemo(
    () => (isSearchOrFilterMode ? getSearchFilteredItems() : []),
    [isSearchOrFilterMode, getSearchFilteredItems],
  );

  // Build the full item list for ONE menu (regular items + that menu's injected
  // cocktail recipes). Used both for the active display and the cross-menu
  // search corpus. (For the non-active menu the cocktail subcategory names
  // resolve best-effort against the active tree — fine for search.)
  const buildItemsForSeason = async (seasonKey: Season): Promise<MenuItem[]> => {
    // Logout teardown: user clears ~100ms before the root redirect unmounts this
    // tab; an empty actor would reach get_menu_items as uuid '' (22P02).
    if (!user?.id) return [];
    const { data, error } = await supabase.rpc('get_menu_items', {
      p_actor_id: user.id,
      p_season: seasonKey,
    });

    if (error) throw error;
    let items: MenuItem[] = data || [];

    if (seasonKey === 'summer') {
      // Mirror the winter dedup: hide manually-entered Libations cocktail menu
      // items so they can't double-render next to the injected summer recipes.
      items = items.filter(
        (i) => !(catKey(i.category) === catKey(libInjection.libationsCategoryName) && i.subcategory != null && libInjection.cocktailSubNames.has(catKey(i.subcategory)))
      );
      // RPC read (B4 batch 4): member-gated, org derived from the actor,
      // active-only server-side — replaces the last direct .from() read here.
      const { data: slrData } = await supabase.rpc('get_summer_libation_recipes', {
        p_actor_id: user.id,
      });

      if (slrData) {
        const mapped: MenuItem[] = slrData.map((r: any) => ({
          id: `slr-${r.id}`,
          name: r.name,
          name_es: null,
          description: r.ingredients?.map((i: any) => i.ingredient).join(', ') || null,
          description_es: null,
          price: r.price,
          category: libInjection.libationsCategoryName,
          subcategory: resolveRecipeSubName(menuCats, r),
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
          thumbnail_url: r.thumbnail_url,
          thumbnail_shape: 'square',
          display_order: r.is_featured ? -1000 + r.display_order : r.display_order,
          is_active: true,
          season: 'summer',
        }));
        items = [...items, ...mapped];
        items.sort((a, b) => a.display_order - b.display_order);
      }
    }

    if (seasonKey === 'winter') {
      // Winter cocktails are sourced from the Winter Libations Recipes editor
      // (libation_recipes), mirroring summer. Hide any manually-entered
      // Libations cocktail menu items first so they don't double up — the
      // beer/wine Libations subcategories (Draft Beer, Bottle & Cans, etc.)
      // are untouched. No data is deleted; manual rows just aren't re-rendered.
      items = items.filter(
        (i) => !(catKey(i.category) === catKey(libInjection.libationsCategoryName) && i.subcategory != null && libInjection.cocktailSubNames.has(catKey(i.subcategory)))
      );

      const { data: lrData } = await supabase.rpc('get_libation_recipes', {
        p_actor_id: user.id,
      });

      if (lrData) {
        const mapped: MenuItem[] = lrData.map((r: any) => ({
          id: `lr-${r.id}`,
          name: r.name,
          name_es: null,
          description: r.ingredients?.map((i: any) => i.ingredient).join(', ') || null,
          description_es: null,
          price: r.price,
          category: libInjection.libationsCategoryName,
          subcategory: resolveRecipeSubName(menuCats, r),
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
          thumbnail_url: r.thumbnail_url,
          thumbnail_shape: 'square',
          display_order: r.is_featured ? -1000 + r.display_order : r.display_order,
          is_active: true,
          season: 'winter',
        }));
        items = [...items, ...mapped];
        items.sort((a, b) => a.display_order - b.display_order);
      }
    }

    return items;
  };

  const loadMenuItems = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const active = await buildItemsForSeason(season);
      setMenuItems(active);
      // Cross-menu search corpus: also pull the OTHER menu (deduped by id) so the
      // search box spans the whole menu. Single-menu orgs reuse the active set.
      if (organization.menu_count === 2) {
        const other = await buildItemsForSeason(season === 'winter' ? 'summer' : 'winter');
        const byId = new Map<string, MenuItem>();
        for (const it of [...active, ...other]) byId.set(it.id, it);
        setAllItems(Array.from(byId.values()));
      } else {
        setAllItems(active);
      }
    } catch (error) {
      console.error('Error loading menu items:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailSheet = (item: MenuItem) => {
    setSelectedMenuItem(item);
    setDetailSheetVisible(true);
  };

  // Keep the item mounted through the sheet's slide-out; the next open replaces it.
  const closeDetailSheet = () => setDetailSheetVisible(false);

  const toggleDietFilter = (filterKey: DietKey) => {
    setDietFilters(prev =>
      prev.includes(filterKey) ? prev.filter(f => f !== filterKey) : [...prev, filterKey]
    );
  };

  const toggleCategoryFilter = (key: string) => {
    setCatFilters(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const clearAllFilters = () => {
    setDietFilters([]);
    setCatFilters([]);
    setMenuFilterValue('both');
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  // ── Menu sheet (⚙) wiring — quota fetched lazily when the sheet opens ──────
  const [uploadQuota, setUploadQuota] = useState<{ remaining: number; max: number; freeAvailable: boolean } | null>(null);
  const canSeeUploadQuota = user?.role === 'owner' || managerPerms.aiUpload;
  const fetchQuota = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      const { data } = await supabase.rpc('get_menu_upload_quota', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      const result = data as any;
      if (result?.success) {
        setUploadQuota({
          remaining: result.credits_remaining ?? 0,
          max: result.monthly_allowance ?? 0,
          // The first upload is free even without premium — the sheet's guard
          // must honor it exactly like menu-upload.tsx's guardUpload does.
          freeAvailable: result.free_available === true,
        });
      }
    } catch (e) {
      console.error('Error loading menu upload quota:', e);
    }
  }, [user?.id, organizationId]);
  useEffect(() => {
    if (menuSheetVisible && canSeeUploadQuota) fetchQuota();
  }, [menuSheetVisible, canSeeUploadQuota, fetchQuota]);
  // Refetch grants on every ⚙ open, so a flip the owner made since the last
  // open locks/unlocks the rows without a remount or re-login (smoke-found).
  // Contract: fresh per OPEN — a revocation while the sheet is already open
  // still waits for the next open (the server enforces it regardless).
  useEffect(() => {
    if (menuSheetVisible) reloadPerms();
  }, [menuSheetVisible, reloadPerms]);
  // Stable identity: MenuSheet's defer() (and through it the upload sheet's
  // poll effect) depends on onClose — an inline arrow here would restart the
  // poll interval on every MenuDisplay re-render.
  const closeMenuSheet = useCallback(() => setMenuSheetVisible(false), []);

  const handleMenuConfiguration = () => {
    // Managers arrive scoped to the Menu tab only (org-settings enforces it).
    const params: Record<string, string> = { tab: 'menu' };
    if (user?.role === 'manager') params.scoped = '1';
    router.push({ pathname: '/organization-settings', params } as any);
  };

  // Navigate to a specific page by category/subcategory
  const navigateToPage = (category: string, subcategory?: string | null) => {
    let targetIndex: number;
    const target = catKey(category);
    if (subcategory) {
      targetIndex = PAGES.findIndex(p => catKey(p.category) === target && catKey(p.subcategory) === catKey(subcategory));
    } else {
      targetIndex = PAGES.findIndex(p => catKey(p.category) === target);
    }
    if (targetIndex >= 0) {
      setCurrentPageIndex(targetIndex);
      pagerRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }
  };

  // Handle swipe end — sync page index
  const onMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);

    // If user swiped to the phantom bridge page (index 0), navigate back to Welcome
    if (hasBridge && newIndex === 0 && onSwipeToWelcome) {
      onSwipeToWelcome();
      // Scroll back to Weekly Specials (index 1) so position is correct if they return
      setTimeout(() => {
        if (PAGES.length > bridgeOffset) {
          pagerRef.current?.scrollToIndex({ index: bridgeOffset, animated: false });
          setCurrentPageIndex(bridgeOffset);
        }
      }, 100);
      return;
    }

    if (newIndex >= 0 && newIndex < PAGES.length && newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
    }
  };

  // Which menu an item belongs to (winter → Menu 1, summer → Menu 2, both →
  // shared) — shown as a badge on whole-menu search results and in the banner
  // eyebrow / detail sheet.
  const menuBadgeForSeason = (s: string | null | undefined): { icon: string; label: string } =>
    menuBadgeForSeasonUtil(s, organization, t);

  // "{menu} · {category}" for the banner eyebrow (category alone on 1-menu orgs).
  const bannerEyebrowText = (item: MenuItem): string => {
    const cat = getCategoryLabel(item.category);
    if (organization.menu_count === 2) return `${menuBadgeForSeason(item.season).label} · ${cat}`;
    return cat;
  };

  // ── Cards ──────────────────────────────────────────────────────────────────
  // Compute the shared display props once and dispatch to the presentational
  // square/banner card (components/MenuItemCards.tsx, s69 extraction — the
  // manager editor renders the identical components off the same contract).
  // Both call sites below invoke this exactly as they invoked the old inline
  // renderer, so the rendered output stays byte-identical for users.
  const renderMenuCard = (item: MenuItem, categoryColor: string, menuBadge?: { icon: string; label: string }, specialsContext: boolean = false) => {
    const isWine = isWineName(item.category);
    const title = getLocalizedField(item, 'name', language);
    const description = item.description
      ? stripFormattingTags(getLocalizedField(item, 'description', language) || item.description)
      : null;
    const thumbnailUrl = item.thumbnail_url ? getImageUrl(item.thumbnail_url, item.updated_at) : null;
    // Banner items render as photo cards; wine stays a row card (bottle shots
    // don't crop into a 152pt band) but DOES carry the left thumb like every
    // other row — Steve's smoke call reversed the mockup's hidden wine thumb.
    const isBanner = !isWine && item.thumbnail_shape === 'banner' && !!item.thumbnail_url;

    if (isBanner) {
      return (
        <MenuItemBannerCard
          key={item.id}
          colors={colors}
          title={title}
          description={description}
          thumbnailUrl={thumbnailUrl!}
          eyebrow={bannerEyebrowText(item)}
          priceLabel={formatPrice(item.price)}
          catColor={categoryColor}
          onPress={() => openDetailSheet(item)}
        />
      );
    }

    const dietaryAbbrevs = cardDietKeys(item).map(dietAbbrev);
    // Specials pages pass menuBadge+specialsContext together (old renderer
    // suppressed the top-badge pill there and showed the same info as a meta
    // tag instead) — mirror that split: metaTags carries it, menuBadge prop
    // to the card is omitted.
    const metaTags = specialsContext
      ? [
          ...(organization.menu_count === 2 ? [menuBadgeForSeason(item.season).label] : []),
          getCategoryLabel(item.category),
        ]
      : undefined;

    return (
      <MenuItemSquareCard
        key={item.id}
        colors={colors}
        title={title}
        description={description}
        thumbnailUrl={thumbnailUrl}
        isWine={isWine}
        priceLabel={isWine ? null : formatPrice(item.price)}
        winePrices={isWine ? {
          gl: item.glass_price ? `${t('menu_display.gl')} ${formatPrice(item.glass_price)}` : undefined,
          btl: item.bottle_price ? `${t('menu_display.btl')} ${formatPrice(item.bottle_price)}` : undefined,
          mbr: item.member_bottle_price ? `${t('menu_display.mbr')} ${formatPrice(item.member_bottle_price)}` : undefined,
        } : null}
        wineLocation={isWine ? getLocalizedField(item, 'location', language) : null}
        dietaryAbbrevs={dietaryAbbrevs}
        metaTags={metaTags}
        menuBadge={specialsContext ? undefined : menuBadge}
        catColor={categoryColor}
        onPress={() => openDetailSheet(item)}
      />
    );
  };

  // Render a single page of menu items (for swipe pager)
  const renderPage = ({ item: page, index }: { item: PageConfig; index: number }) => {
    // Phantom bridge page — render empty
    if (page.category === '__welcome-bridge__') {
      return <View style={{ width: SCREEN_WIDTH }} />;
    }

    const pageItems = getItemsForPage(page);
    const categoryColor = catOf(page.category)?.color || colors.primary;
    // Featured Specials shows items from both menus — badge each card with its
    // menu and show its home-category chip (replaces the Lunch/Dinner tags).
    const isSpecialsPage = catOf(page.category)?.filter_behavior === 'weekly_specials';

    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <ScrollView
          ref={(r) => { pageScrollRefs.current[index] = r; }}
          style={styles.pageScrollView}
          // The overlay chrome sits ABOVE this scroller (absolute) — pad the
          // content by its measured height so the list top starts below the
          // open rows, and give every page minHeight = viewport + band so the
          // collapse always has room to hold (short categories included).
          // Constant while scrolling: the overlay only transforms.
          contentContainerStyle={[
            styles.pageContentContainer,
            { paddingTop: chromeH + 8 },
            pageViewportH > 0 && { minHeight: pageViewportH + bandH },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => handlePageScroll(index, e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) setPageViewportH((prev) => (prev === h ? prev : h));
          }}
        >
          {/* "{n} items · {section}" — the editor's count voice, count-only on
              this side, right-aligned so it sits exactly where the editor's
              does and the user↔editor flip keeps it still (Steve's round 4). */}
          {pageItems.length > 0 && (
            <View style={styles.countRow}>
              <Text style={styles.countRowText} numberOfLines={1}>
                {t('menu_editor:items_count', { count: pageItems.length })}
                {' · '}
                {page.subcategory && page.subcategory !== ALL_PAGE_KEY
                  ? getSubcategoryLabel(page.subcategory)
                  : getCategoryLabel(page.category)}
              </Text>
            </View>
          )}
          {pageItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant-menu"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>{t('menu_display.no_items')}</Text>
              {user?.role === 'owner' ? (
                <>
                  <Text style={styles.emptySubtext}>
                    {t('menu_display.owner_setup_hint', 'Upload your first menu, or create and edit it by hand.')}
                  </Text>
                  <TouchableOpacity
                    style={styles.setupMenuButton}
                    onPress={() => router.push('/menu-editor' as any)}
                    activeOpacity={0.85}
                  >
                    <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={18} color={colors.fireText} />
                    <Text style={styles.setupMenuButtonText}>{t('menu_display.setup_menu_now', 'Set up Menu Now')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.emptySubtext}>
                  {t('menu_display.check_back')}
                </Text>
              )}
            </View>
          ) : (
            pageItems.map(item =>
              isSpecialsPage
                ? renderMenuCard(item, categoryColor, menuBadgeForSeason(item.season), true)
                : renderMenuCard(item, categoryColor),
            )
          )}
        </ScrollView>
      </View>
    );
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Category/subcategory tab models ────────────────────────────────────────
  const categoryTabs = useMemo(
    () => visibleCats.map((c) => ({
      name: c.display_name,
      label: labelForCategoryName(c.display_name, t, menuCats, language),
      color: c.color,
    })),
    [visibleCats, menuCats, t, language],
  );
  const subTabs = useMemo(() => {
    const hasAll = visibleSubNames.includes(ALL_PAGE_KEY);
    const subs = visibleSubNames
      .filter((s) => s !== ALL_PAGE_KEY)
      .map((s) => ({ name: s, label: labelForSubcategoryName(s, t, menuCats, language) }));
    // The virtual 'All' entry renders FIRST in the row (the All PAGE stays at
    // the end of the category's page run — row order is display-only).
    return hasAll ? [{ name: SUB_ALL_TAB, label: t('menu_display.all') }, ...subs] : subs;
  }, [visibleSubNames, menuCats, t, language]);
  const activeSubTab = selectedSubcategory === ALL_PAGE_KEY ? SUB_ALL_TAB : (selectedSubcategory || '');
  const activeCategoryColor = catOf(selectedCategory)?.color || colors.primary;
  const handleSelectSubcategory = (name: string) => {
    navigateToPage(selectedCategory, name === SUB_ALL_TAB ? ALL_PAGE_KEY : name);
  };

  const activeFilterCount =
    dietFilters.length + catFilters.length + (organization.menu_count === 2 && menuFilterValue !== 'both' ? 1 : 0);

  const dietaryOptions = useMemo(
    () => DIET_KEYS.filter((k) => availableDietKeys.has(k)).map((k) => ({
      key: k,
      label: dietLabel(k),
      abbrev: dietAbbrev(k),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availableDietKeys, t],
  );

  // ── Detail-sheet context — LANE rule: the redeem gate is computed HERE; the
  // sheet only renders what it's handed. Employees only, food only (never wine
  // or libations — happy hour keeps Redeem), active items with a parseable
  // price, and only while the org has food redemptions switched on.
  const detailCtx = (() => {
    const item = selectedMenuItem;
    if (!item) return { detailItem: null as MenuItemForDetail | null, menuLabel: '', isWine: false, isLibations: false, redeem: null as { label: string; onPress: () => void } | null };
    const isWine = isWineName(item.category);
    const isLibations = catOf(item.category)?.system_key === 'cat.libations';
    const trimmed = (item.price || '').trim();
    const m = trimmed.match(/^\$?(\d+(?:\.\d{1,2})?)$/);
    const parsedPrice = m ? parseFloat(m[1]) : NaN;
    const bucksCost = isFinite(parsedPrice) && parsedPrice > 0 ? foodRedeemCost(parsedPrice, redemptionSettings.food_mode) : null;
    const showRedeem = user?.role === 'employee' && !isWine && !isLibations && bucksCost !== null
      && item.is_active !== false && redemptionSettings.redemptions_enabled && redemptionSettings.food_enabled;
    const redeem = showRedeem && bucksCost !== null
      ? {
          label: t('menu_display.redeem_cta', { amount: bucksCost }),
          onPress: () => {
            closeDetailSheet();
            router.push({
              pathname: '/redeem',
              params: {
                prefillItemId: item.id,
                prefillItemSource: 'menu_items',
                prefillItemName: item.name,
                prefillItemPrice: item.price,
              },
            } as any);
          },
        }
      : null;
    const detailItem: MenuItemForDetail = {
      id: item.id,
      name: item.name,
      name_es: item.name_es ?? null,
      description: item.description,
      description_es: item.description_es ?? null,
      price: item.price,
      thumbnail_url: item.thumbnail_url,
      thumbnail_shape: item.thumbnail_shape,
      location: item.location ?? null,
      location_es: item.location_es ?? null,
      glass_price: item.glass_price ?? null,
      bottle_price: item.bottle_price ?? null,
      member_bottle_price: item.member_bottle_price ?? null,
      flavor_profile: item.flavor_profile ?? null,
      flavor_profile_es: item.flavor_profile_es ?? null,
      unique_selling_points: item.unique_selling_points ?? null,
      unique_selling_points_es: item.unique_selling_points_es ?? null,
      is_active: item.is_active,
      dietary: {
        gf: item.is_gluten_free,
        gfa: item.is_gluten_free_available,
        v: item.is_vegetarian,
        va: item.is_vegetarian_available,
        df: item.is_dairy_free,
        ef: item.is_egg_free,
        nf: item.is_nut_free,
        sf: item.is_sugar_free,
        nos: item.is_salt_free,
      },
    };
    const menuLabel = organization.menu_count === 2 ? menuBadgeForSeason(item.season).label : '';
    return { detailItem, menuLabel, isWine, isLibations, redeem };
  })();

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Fixed chrome — identical user↔editor: header + menu tabs, then the
          scroll-collapsing search row, then the sticky category rows. The
          AmbientGlow behind all of it comes from the PORTAL LAYOUT.
          zIndex lifts the header's chips ABOVE the pager's translated chrome
          overlay in sibling stacking — the parked (invisible) band otherwise
          intercepted chip taps on iOS despite pointerEvents:none (s69 smoke:
          ⚙/pencil dead while collapsed). */}
      <View style={styles.topAreaLayer}>
        <MenuTopArea
          colors={colors}
          mode="user"
          showActionChips={showActionChips}
          onOpenMenuSheet={() => setMenuSheetVisible(true)}
          onFlipSide={() => router.push('/menu-editor' as any)}
          season={season}
          onSeasonChange={setSeason}
          // Normal browse mode carries the Menu 1/2 tabs in the COLLAPSING band
          // (they dissolve with the search row — a scrolled user has settled
          // their menu choice); only search mode pins them here.
          showMenuTabs={isSearchOrFilterMode && organization.menu_count === 2}
          menu1Label={organization.menu_1_name}
          menu2Label={organization.menu_2_name}
          menu1Icon={organization.menu_1_icon}
          menu2Icon={organization.menu_2_icon}
        />
      </View>

      {isSearchOrFilterMode ? (
        <>
          {/* Search/Filter mode: static search row + flat scrollable list —
              no overlay, no collapse (the row must be usable while typing). */}
          <MenuSearchRow
            colors={colors}
            mode="user"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('menu_display.search_placeholder')}
            onRightPress={() => setFilterSheetVisible(true)}
            filterCount={activeFilterCount}
          />
          {(loading || categoriesLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.pageScrollView} contentContainerStyle={styles.pageContentContainer}>
              {searchFilteredItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <IconSymbol
                    ios_icon_name="fork.knife"
                    android_material_icon_name="restaurant-menu"
                    size={64}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.emptyText}>{t('menu_display.no_items')}</Text>
                  <Text style={styles.emptySubtext}>
                    {t('menu_display.adjust_search')}
                  </Text>
                </View>
              ) : (
                searchFilteredItems.map(item =>
                  renderMenuCard(
                    item,
                    catOf(item.category)?.color || colors.primary,
                    // Badge whenever the corpus spans both menus (query OR a
                    // category selection) — the reader needs to know which
                    // menu a cross-menu hit lives on.
                    (searchQuery.trim() || catFilters.length > 0) && organization.menu_count === 2 ? menuBadgeForSeason(item.season) : undefined,
                  )
                )
              )}
            </ScrollView>
          )}
        </>
      ) : (
        /* Normal mode: the pager fills the area; the chrome (search row + tab
           rows) is an ABSOLUTE OVERLAY gliding on the native driver above it.
           Pages pad their content by the measured overlay height, so nothing
           reflows when the search row collapses or returns. */
        <View style={styles.pagerArea}>
          {(loading || categoriesLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={pagerRef}
              data={PAGES}
              renderItem={renderPage}
              keyExtractor={(_, index) => `page-${index}`}
              horizontal
              pagingEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumScrollEnd}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              initialScrollIndex={Math.min(bridgeOffset, Math.max(PAGES.length - 1, 0))}
            />
          )}

          <Animated.View
            style={[styles.chromeOverlay, { transform: [{ translateY: overlayTranslate }] }]}
            // box-none: the overlay CONTAINER must never capture a touch
            // itself — only its interactive children may.
            pointerEvents="box-none"
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 0 && h !== chromeH) setChromeH(h);
            }}
          >
            {/* The collapsing band: Menu 1/2 tabs + search row dissolve and
                glide away together; category rows park under the header.
                pointerEvents none while collapsed — the invisible band sits
                transform-parked over the header chips, and transformed views
                still receive touches. */}
            <Animated.View
              style={{ opacity: collapseOpacity }}
              pointerEvents={chromeCollapsed ? 'none' : 'auto'}
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 0 && h !== bandH) setBandH(h);
              }}
            >
              {organization.menu_count === 2 && (
                <MenuSeasonTabs
                  colors={colors}
                  season={season}
                  onSeasonChange={setSeason}
                  menu1Label={organization.menu_1_name}
                  menu2Label={organization.menu_2_name}
                  menu1Icon={organization.menu_1_icon}
                  menu2Icon={organization.menu_2_icon}
                  style={styles.overlaySeasonTabs}
                />
              )}
              <MenuSearchRow
                colors={colors}
                mode="user"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('menu_display.search_placeholder')}
                onRightPress={() => setFilterSheetVisible(true)}
                filterCount={activeFilterCount}
              />
            </Animated.View>
            <MenuCategoryTabs
              colors={colors}
              categories={categoryTabs}
              activeCategory={selectedCategory}
              onSelectCategory={(name) => navigateToPage(name)}
              subcategories={subTabs}
              activeSubcategory={activeSubTab}
              onSelectSubcategory={handleSelectSubcategory}
              activeColor={activeCategoryColor}
              showBackdrop={backdropOn}
            />
          </Animated.View>
        </View>
      )}

      {/* Filter sheet — menu narrowing + dietary flags (live-applied; Apply closes) */}
      <MenuFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        colors={colors}
        showMenuSection={organization.menu_count === 2}
        menuValue={menuFilterValue}
        onMenuValue={setMenuFilterValue}
        menu1Label={organization.menu_1_name}
        menu2Label={organization.menu_2_name}
        categoryOptions={categoryOptions}
        selectedCategories={catFilters}
        onToggleCategory={toggleCategoryFilter}
        dietaryOptions={dietaryOptions}
        selected={dietFilters}
        onToggle={toggleDietFilter}
        onClear={clearAllFilters}
        onApply={() => setFilterSheetVisible(false)}
      />

      {/* Item detail sheet (replaces the old ContentDetailModal blob for menu items) */}
      <MenuItemDetailSheet
        visible={detailSheetVisible}
        onClose={closeDetailSheet}
        colors={colors}
        item={detailCtx.detailItem}
        menuLabel={detailCtx.menuLabel}
        categoryLabel={selectedMenuItem ? getCategoryLabel(selectedMenuItem.category) : ''}
        subcategoryLabel={selectedMenuItem?.subcategory ? getSubcategoryLabel(selectedMenuItem.subcategory) : null}
        isWine={detailCtx.isWine}
        isLibations={detailCtx.isLibations}
        redeem={detailCtx.redeem}
      />

      {/* The ⚙ Menu sheet — managers/owners only (employees never see the chip) */}
      {showActionChips && user && (
        <MenuSheet
          visible={menuSheetVisible}
          onClose={closeMenuSheet}
          colors={colors}
          role={user.role === 'owner' ? 'owner' : 'manager'}
          perms={managerPerms}
          onEditMenu={() => router.push('/menu-editor' as any)}
          onEditCategories={() => router.push('/manage-menu-categories' as any)}
          onMenuConfiguration={handleMenuConfiguration}
          quota={uploadQuota}
          refreshQuota={fetchQuota}
        />
      )}
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    // Transparent root — the portal layout owns the background + AmbientGlow.
    container: {
      flex: 1,
    },
    // Above the pager subtree (and its translated chrome overlay) in sibling
    // stacking, so the header chips stay tappable while the band is parked
    // over them.
    topAreaLayer: {
      zIndex: 20,
    },
    // Normal-mode content area: the pager fills it, the chrome overlay glides
    // absolutely above it (native-driver transform — never a layout change).
    pagerArea: {
      flex: 1,
    },
    chromeOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    // MenuSeasonTabs standalone in the overlay (MenuTopArea's wrap normally
    // supplies the 16pt gutters).
    overlaySeasonTabs: {
      marginHorizontal: 16,
    },
    // Page content
    pageScrollView: {
      flex: 1,
    },
    pageContentContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 100,
    },
    // The editor's .cntrow voice, count-only on this side (right-aligned to
    // match the editor's count position through the flip).
    countRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 10,
    },
    countRowText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    // Loading & empty states
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
    },
    emptyText: {
      fontFamily: fonts.display.bold,
      fontSize: 20,
      marginTop: 16,
      textAlign: 'center',
      color: colors.text,
    },
    emptySubtext: {
      fontFamily: fonts.body.regular,
      fontSize: 13.5,
      marginTop: 8,
      textAlign: 'center',
      color: colors.textSecondary,
    },
    setupMenuButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 47,
      paddingHorizontal: 20,
      borderRadius: 13,
      marginTop: 20,
      backgroundColor: colors.primary,
    },
    setupMenuButtonText: {
      fontFamily: fonts.body.semibold,
      fontSize: 15,
      color: colors.fireText,
    },
  });
