
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { brokerDelete } from '@/utils/storageBroker';
import { useTranslation } from 'react-i18next';
import { getLocalizedField } from '@/utils/translateContent';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import { stripFormattingTags } from '@/components/FormattedText';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { labelForCategoryName, labelForSubcategoryName } from '@/utils/menuCategoryLabels';
import { menuBadgeForSeason as menuBadgeForSeasonUtil, compareBySectionThenOrder } from '@/utils/menuBadges';
import { getImageUrl } from '@/utils/imageUrl';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';
import AmbientGlow from '@/components/AmbientGlow';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import MenuTopArea, { MenuSeasonTabs } from '@/components/MenuTopArea';
import MenuSearchRow from '@/components/MenuSearchRow';
import MenuCategoryTabs from '@/components/MenuCategoryTabs';
import MenuSheet from '@/components/MenuSheet';
import MenuItemDetailSheet, { type MenuItemForDetail } from '@/components/MenuItemDetailSheet';
import GlassActionSheet, { type GlassAction } from '@/components/GlassActionSheet';
import OrderPositionModal from '@/components/OrderPositionModal';
import { MenuItemSquareCard, MenuItemBannerCard } from '@/components/MenuItemCards';
import MenuItemEditSheet from '@/components/MenuItemEditSheet';

interface MenuItem {
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
  updated_at?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// Legacy wire values: 'winter' = Menu 1, 'summer' = Menu 2. Unchanged.
type Season = 'winter' | 'summer';

interface PageConfig {
  category: string;
  subcategory: string | null;
}

// Case-insensitive category/subcategory name key — the DB unique indexes are
// lower()-based and the AI upload path writes free-text names. Matching always
// normalizes; display always prints the stored/translated name.
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

// Search-collapse geometry — identical to the user side (MenuDisplay): the
// search row is 46pt + 11pt margin; the chrome band glides up by its measured
// height when collapsed.
const SEARCH_ROW_H = 57;

export default function MenuEditorScreen() {
  useRequireManagerRoute();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { language } = useLanguage();
  const { perms: managerPerms, reload: reloadPerms } = useManagerPermissions();

  // Default to Menu 1 (winter slot) — the more natural landing menu.
  const [season, setSeason] = useState<Season>('winter');
  const perMenu = organization?.menu_category_scope === 'per_menu';
  // In per-menu scope the active season selects which menu's category tree to
  // edit. includeHidden keeps a legacy item's now-hidden category resolvable.
  const { categories: menuCats, loading: categoriesLoading, refresh: refreshCategories } = useMenuCategories({
    includeHidden: true,
    menuSlot: season === 'winter' ? 1 : 2,
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  // All org items across BOTH menus (no season filter) — the search corpus and
  // the cross-menu Featured Specials page.
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const pagerRef = useRef<FlatList>(null);

  // Behavior resolvers — key off system_key / filter_behavior via catKey, never
  // raw string equality (renames + AI-written case must both keep working).
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
      // Per-menu treats Lunch/Dinner as normal categories (placement by
      // assignment); shared mode keeps the meal-availability overlay.
      if (!perMenu && fb === 'lunch') return item.available_for_lunch;
      if (!perMenu && fb === 'dinner') return item.available_for_dinner;
      if (fb === 'weekly_specials') return catKey(item.category) === catKey(categoryName) || !!item.is_weekly_special;
      return catKey(item.category) === catKey(categoryName);
    },
    [catOf, perMenu],
  );

  // Page sequence from the loaded tree: one page per visible subcategory, or a
  // single page for a category with no subcategories. Empty pages stay — the
  // editor must be able to reach them to add the first item. No 'All' pages,
  // no Welcome bridge: real pages start at index 0.
  const pages = useMemo<PageConfig[]>(() => {
    const out: PageConfig[] = [];
    for (const cat of menuCats) {
      if (cat.is_hidden) continue;
      const visibleSubs = (cat.subcategories || []).filter((s) => !s.is_hidden);
      if (visibleSubs.length === 0) {
        out.push({ category: cat.display_name, subcategory: null });
      } else {
        for (const sub of visibleSubs) {
          out.push({ category: cat.display_name, subcategory: sub.display_name });
        }
      }
    }
    return out;
  }, [menuCats]);

  const currentPage = pages[currentPageIndex] || pages[0] || { category: '', subcategory: null };
  const selectedCategory = currentPage.category;
  const selectedSubcategory = currentPage.subcategory;
  const selectedCategoryObj = catOf(selectedCategory);
  const selectedSubObj = selectedCategoryObj?.subcategories.find(
    (s) => catKey(s.display_name) === catKey(selectedSubcategory),
  );

  const isSearchMode = searchQuery.trim().length > 0;

  // ── Search collapse + sticky-tab backdrop — the user side's architecture,
  // ported verbatim (MenuDisplay): the chrome band is an absolute overlay on a
  // native-driver transform; nothing resizes during scroll. Hysteresis picks a
  // state; a timed ease glides between them.
  const collapseAnim = useRef(new Animated.Value(0)).current; // 0 open → 1 collapsed
  const collapsedRef = useRef(false);
  const collapseRunRef = useRef<Animated.CompositeAnimation | null>(null);
  const pageOffsetsRef = useRef<{ [index: number]: number }>({});
  const pageListRefs = useRef<{ [index: number]: FlatList<MenuItem> | null }>({});
  const [pageViewportH, setPageViewportH] = useState(0);
  const backdropOnRef = useRef(false);
  const [backdropOn, setBackdropOn] = useState(false);
  const currentPageIndexRef = useRef(currentPageIndex);

  const COLLAPSE_AT = 48;
  const EXPAND_AT = 28;

  const [bandH, setBandH] = useState(
    organization.menu_count === 2 ? SEARCH_ROW_H + 51 : SEARCH_ROW_H
  );
  const collapseOpacity = collapseAnim.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 0, 0],
  });
  const overlayTranslate = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -bandH],
  });

  // Transform-parked views still receive touches — the collapsed (invisible)
  // band sits over the header chips, so it must go pointerEvents:none.
  const [chromeCollapsed, setChromeCollapsed] = useState(false);

  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return;
    collapsedRef.current = next;
    setChromeCollapsed(next);
    collapseRunRef.current?.stop();
    collapseRunRef.current = Animated.timing(collapseAnim, {
      toValue: next ? 1 : 0,
      duration: next ? 280 : 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true, // transform + opacity only — UI-thread animation
    });
    collapseRunRef.current.start();
  }, [collapseAnim]);

  const [chromeH, setChromeH] = useState(SEARCH_ROW_H + 88);

  const resetCollapse = useCallback(() => {
    collapseRunRef.current?.stop();
    collapsedRef.current = false;
    setChromeCollapsed(false);
    collapseAnim.setValue(0);
  }, [collapseAnim]);

  const syncBackdrop = useCallback((y: number) => {
    const on = y > 6;
    if (on !== backdropOnRef.current) {
      backdropOnRef.current = on;
      setBackdropOn(on);
    }
  }, []);

  // Each page records its own offset; only the active page drives the shared
  // collapse state. Between the thresholds the state holds (hysteresis).
  const handlePageScroll = useCallback((pageIndex: number, y: number) => {
    pageOffsetsRef.current[pageIndex] = y;
    if (pageIndex !== currentPageIndexRef.current) return;
    if (y > COLLAPSE_AT) {
      setCollapsed(true);
    } else if (y < EXPAND_AT) {
      setCollapsed(false);
    }
    syncBackdrop(y);
  }, [setCollapsed, syncBackdrop]);

  // Page swipes NEVER change collapse state — only retarget + the
  // collapsed-arrival snap to y=bandH (pre-paint) so cards sit tucked under
  // the parked tabs instead of a band-sized gap.
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
    let y = pageOffsetsRef.current[currentPageIndex] ?? 0;
    if (collapsedRef.current && y < bandH) {
      pageListRefs.current[currentPageIndex]?.scrollToOffset({ offset: bandH, animated: false });
      pageOffsetsRef.current[currentPageIndex] = bandH;
      y = bandH;
    }
    syncBackdrop(y);
  }, [currentPageIndex, bandH, syncBackdrop]);

  // Entering/leaving search mode swaps the pager for a flat list — the stored
  // offsets no longer describe live views; the row must be usable while typing.
  useEffect(() => {
    pageOffsetsRef.current = {};
    resetCollapse();
    syncBackdrop(0);
  }, [isSearchMode, resetCollapse, syncBackdrop]);

  // Loud loads only on mount/menu-switch; mutations reload silently so the
  // pager (and the collapse state) survives in place — the old full-spinner
  // reload would unmount every page on each edit.
  // The generation counter drops stale responses: a meatball action's deferred
  // silent reload (bound to the season it was opened under) must never clobber
  // a fresh season's items if the manager switches menus while it's in flight.
  const loadSeqRef = useRef(0);
  const loadMenuItems = useCallback(async (silent = false) => {
    if (!user?.id) return;
    const seq = ++loadSeqRef.current;
    try {
      if (!silent) setLoading(true);
      const [scoped, all] = await Promise.all([
        supabase.rpc('get_menu_items', { p_actor_id: user.id, p_season: season }),
        supabase.rpc('get_menu_items', { p_actor_id: user.id }),
      ]);
      if (seq !== loadSeqRef.current) return;
      if (scoped.error) throw scoped.error;
      setMenuItems((scoped.data || []) as MenuItem[]);
      setAllItems((all.data || []) as MenuItem[]);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      console.error('Error loading menu items:', error);
      Alert.alert(t('common:error'), t('menu_editor:load_error'));
    } finally {
      if (!silent && seq === loadSeqRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, season]);

  useEffect(() => {
    loadMenuItems();
    setCurrentPageIndex(0);
    // Empty pager data (a menu with no visible categories yet) — scrollToIndex
    // throws an out-of-range Invariant on an empty list (MenuDisplay's clamp
    // comment; verify-lens finding).
    if (pages.length > 0) pagerRef.current?.scrollToIndex({ index: 0, animated: false });
    // A menu switch replaces every page's content — reopen the chrome.
    pageOffsetsRef.current = {};
    resetCollapse();
    syncBackdrop(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  // The tree can also change WITHOUT a season switch (returning from Manage
  // Categories refreshes it) — the stored per-page offsets then describe pages
  // that no longer exist; reopen the chrome when the page sequence really
  // changed (not on every focus-driven refetch of an identical tree).
  const pagesSig = useMemo(
    () => pages.map((p) => `${p.category}|${p.subcategory ?? ''}`).join('~'),
    [pages],
  );
  const pagesSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (pagesSigRef.current === pagesSig) return;
    const first = pagesSigRef.current === null;
    pagesSigRef.current = pagesSig;
    if (first) return;
    pageOffsetsRef.current = {};
    resetCollapse();
    syncBackdrop(0);
  }, [pagesSig, resetCollapse, syncBackdrop]);

  // Refresh the category tree when returning from Manage Categories.
  useFocusEffect(
    useCallback(() => {
      refreshCategories();
    }, [refreshCategories]),
  );

  // Pages can shrink after category edits — keep the index inside the list.
  useEffect(() => {
    if (pages.length > 0 && currentPageIndex > pages.length - 1) {
      const clamped = Math.max(0, pages.length - 1);
      setCurrentPageIndex(clamped);
      pagerRef.current?.scrollToIndex({ index: clamped, animated: false });
    }
  }, [pages.length, currentPageIndex]);

  // Search spans the WHOLE org (both menus); browsing stays on the active menu.
  const filteredItems = useMemo(() => {
    if (!isSearchMode) return [];
    const query = searchQuery.toLowerCase();
    return allItems.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        item.category.toLowerCase().includes(query) ||
        (item.subcategory && item.subcategory.toLowerCase().includes(query)) ||
        (item.is_gluten_free && 'gf'.includes(query)) ||
        (item.is_gluten_free_available && 'gfa'.includes(query)) ||
        (item.is_vegetarian && ('v'.includes(query) || 'vegetarian'.includes(query))) ||
        (item.is_vegetarian_available && ('va'.includes(query) || 'vegetarian available'.includes(query)))
    );
  }, [isSearchMode, searchQuery, allItems]);

  // Items for one pager page. Featured Specials combines flagged items from
  // BOTH menus (allItems) so the tab shows the same set on Menu 1 and Menu 2.
  const getItemsForPage = useCallback((page: PageConfig): MenuItem[] => {
    const isSpecials = catOf(page.category)?.filter_behavior === 'weekly_specials';
    let filtered = (isSpecials ? allItems : menuItems).filter(item => categoryMatches(item, page.category));
    if (page.subcategory) {
      filtered = filtered.filter(item => catKey(item.subcategory) === catKey(page.subcategory));
    }
    if (isSpecials) filtered = [...filtered].sort(compareBySectionThenOrder);
    return filtered;
  }, [menuItems, allItems, categoryMatches, catOf]);

  // Reordering is only coherent on a page that is ONE category/subcategory's
  // complete season-scoped set — never the cross-menu Featured Specials
  // combination, and never search results. Structural guard (plan §7.3).
  const canReorderPage = useCallback(
    (page: PageConfig) => catOf(page.category)?.filter_behavior !== 'weekly_specials',
    [catOf],
  );

  // Rows living in a cocktail-fed Libations subcategory mirror the Bartender
  // recipe editors — they DISPLAY here but must never be edited, moved or
  // deleted from this screen (Steve's smoke rule: the recipes editors own
  // their ordering and the bridge both ways). Manual Libations subs (Draft
  // Beer, Bottles & Cans, custom ones) stay fully editable.
  const isRecipeFedItem = useCallback(
    (item: MenuItem): boolean => {
      const cat = catOf(item.category);
      if (cat?.system_key !== 'cat.libations' || !item.subcategory) return false;
      const sub = cat.subcategories.find((s) => catKey(s.display_name) === catKey(item.subcategory));
      return !!sub?.is_cocktail_fed;
    },
    [catOf],
  );

  const navigateToPage = (category: string, subcategory?: string | null) => {
    let targetIndex: number;
    const target = catKey(category);
    if (subcategory) {
      targetIndex = pages.findIndex(p => catKey(p.category) === target && catKey(p.subcategory) === catKey(subcategory));
    } else {
      targetIndex = pages.findIndex(p => catKey(p.category) === target);
    }
    if (targetIndex >= 0) {
      setCurrentPageIndex(targetIndex);
      pagerRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }
  };

  const onMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (newIndex >= 0 && newIndex < pages.length && newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
    }
  };

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  const menuBadgeForSeason = (s: string | null | undefined): { icon: string; label: string } =>
    menuBadgeForSeasonUtil(s, organization, t);

  const getCategoryLabel = (category: string) => labelForCategoryName(category, t, menuCats, language);
  const getSubcategoryLabel = (subcategory: string) => labelForSubcategoryName(subcategory, t, menuCats, language);

  // Card dietary abbreviations — literal t() calls so the harvester sees keys.
  const cardDietAbbrevs = (item: MenuItem): string[] => {
    const out: string[] = [];
    if (item.is_gluten_free) out.push(t('dietary.gf_abbrev'));
    if (item.is_gluten_free_available) out.push(t('dietary.gfa_abbrev'));
    if (item.is_vegetarian) out.push(t('dietary.v_abbrev'));
    if (item.is_vegetarian_available) out.push(t('dietary.va_abbrev'));
    if (item.is_dairy_free) out.push(t('dietary.df_abbrev'));
    if (item.is_egg_free) out.push(t('dietary.ef_abbrev'));
    if (item.is_nut_free) out.push(t('dietary.nf_abbrev'));
    if (item.is_sugar_free) out.push(t('dietary.sf_abbrev'));
    if (item.is_salt_free) out.push(t('dietary.nos_abbrev'));
    return out;
  };

  // "{menu} · {category}" for the banner eyebrow (category alone on 1-menu orgs).
  const bannerEyebrowText = (item: MenuItem): string => {
    const cat = getCategoryLabel(item.category);
    if (organization.menu_count === 2) return `${menuBadgeForSeason(item.season).label} · ${cat}`;
    return cat;
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleDelete = (item: MenuItem) => {
    Alert.alert(
      t('menu_editor:delete_title'),
      t('menu_editor:delete_confirm', { name: item.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert(t('common:error'), t('menu_editor:error_not_authenticated'));
                return;
              }
              const { error } = await supabase.rpc('delete_menu_item', {
                p_user_id: user.id,
                p_organization_id: organizationId ?? undefined,
                p_menu_item_id: item.id,
              });
              if (error) throw error;
              // Blob cleanup is best-effort — a storage failure must not
              // report the (already committed) delete as failed.
              if (item.thumbnail_url) {
                try {
                  await brokerDelete('menu-items', [item.thumbnail_url], user.id);
                } catch (e) {
                  console.error('Error deleting menu item image:', e);
                }
              }
              Alert.alert(t('common:success'), t('menu_editor:deleted_success'));
              loadMenuItems(true);
            } catch (error: any) {
              console.error('Error deleting menu item:', error);
              Alert.alert(t('common:error'), translateServerError(error, t('menu_editor:delete_error')));
            }
          },
        },
      ]
    );
  };

  // Move an item one slot within ITS page's list, resolved by id — never by a
  // row index against a different list (the old cross-list index bug).
  const moveItem = async (itemId: string, page: PageConfig, delta: -1 | 1) => {
    if (!user?.id) return;
    const items = getItemsForPage(page);
    const idx = items.findIndex((i) => i.id === itemId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target > items.length - 1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    // Optimistic: swap display_order in local state so the row moves now.
    const orderById = new Map(reordered.map((it, i) => [it.id, i]));
    const apply = (list: MenuItem[]) =>
      list.map((m) => (orderById.has(m.id) ? { ...m, display_order: orderById.get(m.id)! } : m));
    setMenuItems(apply);
    setAllItems(apply);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: reordered.map((i) => i.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error moving menu item:', error);
    }
    loadMenuItems(true);
  };

  // Order Position picker — id-based; siblings are the item's own page set.
  const [positionPicker, setPositionPicker] = useState<{ item: MenuItem; siblings: MenuItem[]; currentIndex: number } | null>(null);
  const openPositionPicker = (item: MenuItem) => {
    const siblings = getItemsForPage({ category: item.category, subcategory: item.subcategory });
    const currentIndex = siblings.findIndex((s) => s.id === item.id);
    if (siblings.length < 2 || currentIndex < 0) return;
    setPositionPicker({ item, siblings, currentIndex });
  };
  const applyPositionChange = async (newPos: number) => {
    if (!user?.id || !positionPicker) return;
    const { item, siblings, currentIndex } = positionPicker;
    const newIndex = newPos - 1;
    setPositionPicker(null);
    if (newIndex === currentIndex) return;
    const reordered = [...siblings];
    reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, item);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: reordered.map((it) => it.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error applying position change:', error);
    }
    loadMenuItems(true);
  };

  // Drag persists the page's complete new order (page-scoped by construction —
  // handleDragEnd is only wired on reorderable pages).
  const handleDragEnd = async (reorderedData: MenuItem[]) => {
    if (!user?.id) return;
    const orderById = new Map(reorderedData.map((it, i) => [it.id, i]));
    const apply = (list: MenuItem[]) =>
      list.map((m) => (orderById.has(m.id) ? { ...m, display_order: orderById.get(m.id)! } : m));
    setMenuItems(apply);
    setAllItems(apply);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: reorderedData.map((item) => item.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error persisting drag reorder:', error);
      loadMenuItems(true);
    }
  };

  // ── The meatball (⋯) — GlassActionSheet, all rows reachable on Android ─────
  // (Alert.alert keeps only three buttons there; the old six-button meatball
  // made Delete unreachable — plan §B1.)
  const [itemActions, setItemActions] = useState<{ item: MenuItem; page: PageConfig | null } | null>(null);

  const actionSheetModel = useMemo(() => {
    if (!itemActions) return null;
    const { item, page } = itemActions;
    const siblings = getItemsForPage({ category: item.category, subcategory: item.subcategory });
    const sibIdx = siblings.findIndex((i) => i.id === item.id);
    const pageItems = page ? getItemsForPage(page) : [];
    const idx = page ? pageItems.findIndex((i) => i.id === item.id) : -1;
    const reorderable = page ? canReorderPage(page) : false;

    const subtitleParts = [getCategoryLabel(item.category)];
    if (item.subcategory) subtitleParts.push(getSubcategoryLabel(item.subcategory));
    if (sibIdx >= 0 && siblings.length > 1) {
      subtitleParts.push(t('menu_editor:position_of', { n: sibIdx + 1, total: siblings.length }));
    }

    const actions: GlassAction[] = [
      {
        key: 'edit',
        label: t('common:edit'),
        iosIcon: 'pencil',
        androidIcon: 'edit',
        onPress: () => openEdit(item),
      },
    ];
    if (reorderable && idx > 0) {
      actions.push({
        key: 'up',
        label: t('upcoming_events_editor:move_up'),
        iosIcon: 'arrow.up',
        androidIcon: 'arrow-upward',
        onPress: () => moveItem(item.id, page!, -1),
      });
    }
    if (reorderable && idx >= 0 && idx < pageItems.length - 1) {
      actions.push({
        key: 'down',
        label: t('upcoming_events_editor:move_down'),
        iosIcon: 'arrow.down',
        androidIcon: 'arrow-downward',
        onPress: () => moveItem(item.id, page!, 1),
      });
    }
    // Order Position works from the item's own sibling set, so it stays safe
    // (and available) from search results too — matching the old behavior.
    if (siblings.length > 1 && (page ? reorderable : true)) {
      actions.push({
        key: 'order',
        label: t('menu_editor:order_position'),
        iosIcon: 'list.number',
        androidIcon: 'format-list-numbered',
        onPress: () => openPositionPicker(item),
      });
    }
    actions.push({
      key: 'delete',
      label: t('common:delete'),
      iosIcon: 'trash',
      androidIcon: 'delete',
      destructive: true,
      onPress: () => handleDelete(item),
    });
    return { title: item.name, subtitle: subtitleParts.join(' · '), actions };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemActions, getItemsForPage, canReorderPage, t]);

  // ── Recipe-fed item detail (read-only tap-through, Steve's round-3 ask) ────
  // Tapping a locked libations card opens the USER-side detail sheet so the
  // manager sees exactly what customers see, with an "Open Recipes Editor"
  // button in place of Redeem-side affordances. (Deep-linking into that
  // editor's own edit modal is queued for the Bartender design wave.)
  const [recipeDetail, setRecipeDetail] = useState<MenuItem | null>(null);
  const [recipeDetailVisible, setRecipeDetailVisible] = useState(false);
  const openRecipeDetail = (item: MenuItem) => {
    setRecipeDetail(item);
    setRecipeDetailVisible(true);
  };
  // Keep the item mounted through the slide-out; the next open replaces it.
  const closeRecipeDetail = useCallback(() => setRecipeDetailVisible(false), []);

  // Which recipes editor owns the item: its own menu when it has one, else the
  // menu being viewed (legacy 'both' rows) — mirrors the ＋ guard's routing.
  const recipesEditorPathFor = (item: MenuItem): string => {
    const s = item.season === 'summer' || item.season === 'winter' ? item.season : season;
    return s === 'summer' ? '/summer-libation-recipes-editor' : '/libation-recipes-editor';
  };

  const recipeDetailCtx = (() => {
    const item = recipeDetail;
    if (!item) {
      return { detailItem: null as MenuItemForDetail | null, menuLabel: '', isWine: false, isLibations: false, editAction: null as { label: string; onPress: () => void } | null };
    }
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
    return {
      detailItem,
      menuLabel: organization.menu_count === 2 ? menuBadgeForSeason(item.season).label : '',
      isWine: isWineName(item.category),
      isLibations: catOf(item.category)?.system_key === 'cat.libations',
      editAction: {
        label: t('menu_editor:open_recipes_editor'),
        // Recipe-fed rows sync from the recipes by NAME (no id bridge), so the
        // deep-link hands the editor the name and it opens its own edit modal
        // for that exact recipe (s69-queued, landed s73).
        onPress: () => router.push({ pathname: recipesEditorPathFor(item), params: { edit: item.name } } as any),
      },
    };
  })();

  // ── Add/Edit sheet hosting ─────────────────────────────────────────────────
  const [editSheet, setEditSheet] = useState<{ visible: boolean; item: MenuItem | null }>({ visible: false, item: null });

  const openAdd = () => {
    // COCKTAIL-FED subcategory pages mirror the Bartender recipe editors —
    // the ＋ points there instead. Manual Libations subs (Draft Beer, Bottles
    // & Cans, custom ones) add normally (Steve's carve-out).
    if (!isSearchMode && selectedSubObj?.is_cocktail_fed) {
      const bannerText =
        organization?.menu_count === 1
          ? t('menu_editor:libation_banner_single')
          : t(
              season === 'summer' ? 'menu_editor:summer_libation_banner' : 'menu_editor:winter_libation_banner',
              {
                menu: season === 'summer'
                  ? (organization?.menu_2_name || t('onboarding.default_menu_2'))
                  : (organization?.menu_1_name || t('onboarding.default_menu_1')),
              }
            );
      Alert.alert(bannerText, undefined, [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('menu_editor:open_recipes_editor'),
          onPress: () =>
            router.push((season === 'summer' ? '/summer-libation-recipes-editor' : '/libation-recipes-editor') as any),
        },
      ]);
      return;
    }
    // Prefill from the page the manager is parked on (never in search mode).
    setEditSheet({ visible: true, item: null });
  };
  const openEdit = (item: MenuItem) => setEditSheet({ visible: true, item });
  const closeEditSheet = useCallback(() => setEditSheet((prev) => ({ ...prev, visible: false })), []);

  // New items append to the END of their target category/subcategory list —
  // siblings resolved with catKey over the FORM's menu scope (allItems carries
  // both menus; 'both'-season legacy rows count on either menu).
  const computeNextOrder = useCallback((category: string, subcategory: string, itemSeason: 'winter' | 'summer' | 'both'): number => {
    const siblings = allItems.filter((m) => {
      if (catKey(m.category) !== catKey(category)) return false;
      const subOk = subcategory ? catKey(m.subcategory) === catKey(subcategory) : !m.subcategory;
      if (!subOk) return false;
      if (itemSeason === 'both') return true;
      return m.season === itemSeason || m.season === 'both';
    });
    return siblings.length ? Math.max(...siblings.map((s) => s.display_order ?? 0)) + 1 : 0;
  }, [allItems]);

  // The success alert must wait out the sheet's Modal teardown — UIKit
  // silently drops a presentation issued mid-dismissal. The sheet's iOS
  // onDismiss is the real "it's gone" signal; the 500ms timer is the Android
  // floor (RN Modal onDismiss never fires there) and the iOS fallback —
  // whichever lands first runs it, the other finds the ref empty. Same
  // contract as useSheetHandoff (500ms is its iOS constant; verify-lens fix).
  const pendingSavedAlertRef = useRef<(() => void) | null>(null);
  const flushSavedAlert = useCallback(() => {
    const fn = pendingSavedAlertRef.current;
    if (!fn) return;
    pendingSavedAlertRef.current = null;
    fn();
  }, []);

  const handleSaved = useCallback(() => {
    const wasEdit = !!editSheet.item;
    setEditSheet((prev) => ({ ...prev, visible: false }));
    loadMenuItems(true);
    pendingSavedAlertRef.current = () => {
      Alert.alert(
        t('common:success'),
        wasEdit ? t('menu_editor:updated_success') : t('menu_editor:created_success'),
      );
    };
    setTimeout(flushSavedAlert, 500);
  }, [editSheet.item, loadMenuItems, flushSavedAlert, t]);

  // ── ⚙ Menu sheet wiring (identical to the user side) ───────────────────────
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
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
  // Stable identity: MenuSheet's defer() (and the upload sheet's poll effect)
  // depends on onClose — an inline arrow would restart the poll per render.
  const closeMenuSheet = useCallback(() => setMenuSheetVisible(false), []);

  const handleMenuConfiguration = () => {
    const params: Record<string, string> = { tab: 'menu' };
    if (user?.role === 'manager') params.scoped = '1';
    router.push({ pathname: '/organization-settings', params } as any);
  };

  // ── Cards ──────────────────────────────────────────────────────────────────
  const renderCard = (
    item: MenuItem,
    categoryColor: string,
    opts: {
      editor?: { onMeatball: () => void; drag?: () => void; dragActive?: boolean; showGrabber: boolean };
      menuBadge?: { icon: string; label: string } | null;
      metaTags?: string[];
      // Only recipe-fed (display-only) cards carry a tap — it opens the
      // user-side detail sheet; editable cards keep grab/meatball only.
      onPress?: () => void;
    },
  ) => {
    const isWine = isWineName(item.category);
    const title = getLocalizedField(item, 'name', language);
    const rawDesc = item.description
      ? stripFormattingTags(getLocalizedField(item, 'description', language) || item.description)
      : null;
    const isBanner = !isWine && item.thumbnail_shape === 'banner' && !!item.thumbnail_url;
    if (isBanner) {
      return (
        <MenuItemBannerCard
          key={item.id}
          colors={colors}
          title={title}
          description={rawDesc}
          thumbnailUrl={getImageUrl(item.thumbnail_url!, item.updated_at)!}
          eyebrow={bannerEyebrowText(item)}
          priceLabel={formatPrice(item.price)}
          catColor={categoryColor}
          editor={opts.editor}
          onPress={opts.onPress}
        />
      );
    }
    return (
      <MenuItemSquareCard
        key={item.id}
        colors={colors}
        title={title}
        description={rawDesc}
        thumbnailUrl={item.thumbnail_url ? getImageUrl(item.thumbnail_url, item.updated_at) : null}
        isWine={isWine}
        priceLabel={isWine ? null : formatPrice(item.price)}
        winePrices={
          isWine
            ? {
                gl: item.glass_price ? `${t('menu_display.gl')} ${formatPrice(item.glass_price)}` : undefined,
                btl: item.bottle_price ? `${t('menu_display.btl')} ${formatPrice(item.bottle_price)}` : undefined,
                mbr: item.member_bottle_price ? `${t('menu_display.mbr')} ${formatPrice(item.member_bottle_price)}` : undefined,
              }
            : null
        }
        wineLocation={isWine ? getLocalizedField(item, 'location', language) : null}
        dietaryAbbrevs={cardDietAbbrevs(item)}
        metaTags={opts.metaTags}
        menuBadge={opts.menuBadge ?? null}
        catColor={categoryColor}
        editor={opts.editor}
        onPress={opts.onPress}
      />
    );
  };

  // ── One pager page: count row + libation banner + draggable list ───────────
  const renderPage = ({ item: page, index }: { item: PageConfig; index: number }) => {
    const pageItems = getItemsForPage(page);
    const categoryColor = catOf(page.category)?.color || colors.primary;
    const isSpecialsPage = catOf(page.category)?.filter_behavior === 'weekly_specials';
    const pageSub = catOf(page.category)?.subcategories.find(
      (s) => catKey(s.display_name) === catKey(page.subcategory),
    );
    // Recipe-fed pages are display-only (see isRecipeFedItem).
    const isCocktailFed = !!pageSub?.is_cocktail_fed;
    const reorderable = canReorderPage(page) && !isCocktailFed;
    const showDragHint = reorderable && pageItems.length > 1;

    const listHeader = (
      <View>
        {/* Drag hint LEFT (it sits over the grabbers), count RIGHT — the count
            then occupies the same spot as the user side's, so the flip keeps
            it still while the hint appears/disappears (Steve's round 4). */}
        <View style={styles.countRow}>
          {showDragHint && <Text style={styles.countRowText}>{t('menu_editor:drag_to_reorder')}</Text>}
          <Text style={[styles.countRowText, styles.countRowCount]} numberOfLines={1}>
            {t('menu_editor:items_count', { count: pageItems.length })}
            {' · '}
            {page.subcategory ? getSubcategoryLabel(page.subcategory) : getCategoryLabel(page.category)}
          </Text>
        </View>
        {isCocktailFed && (
          <TouchableOpacity
            style={styles.libationBanner}
            onPress={() => router.push((season === 'summer' ? '/summer-libation-recipes-editor' : '/libation-recipes-editor') as any)}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={20} color={colors.primary} />
            <Text style={styles.libationBannerText}>
              {organization?.menu_count === 1
                ? t('menu_editor:libation_banner_single')
                : t(
                    season === 'summer' ? 'menu_editor:summer_libation_banner' : 'menu_editor:winter_libation_banner',
                    {
                      menu: season === 'summer'
                        ? (organization?.menu_2_name || t('onboarding.default_menu_2'))
                        : (organization?.menu_1_name || t('onboarding.default_menu_1')),
                    }
                  )}
            </Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    );

    const listEmpty = (
      <View style={styles.emptyContainer}>
        <IconSymbol
          ios_icon_name="fork.knife"
          android_material_icon_name="restaurant-menu"
          size={64}
          color={colors.textSecondary}
        />
        <Text style={styles.emptyText}>{t('menu_editor:empty_title')}</Text>
        {!isCocktailFed && (
          <>
            <Text style={styles.emptySubtext}>{t('menu_editor:empty_subtext')}</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={openAdd} activeOpacity={0.85}>
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={colors.fireText} />
              <Text style={styles.emptyCtaText}>{t('menu_editor:add_button')}</Text>
            </TouchableOpacity>
            {/* AI upload only offered on a fully empty menu — single-item adds
                belong in the Add sheet, not the credit funnel. */}
            {user?.role === 'owner' && menuItems.length === 0 && (
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => router.push('/menu-upload' as any)}
                activeOpacity={0.85}
              >
                <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={18} color={colors.fireText} />
                <Text style={styles.emptyCtaText}>{t('menu_editor:upload_menu_button', 'Upload Menu')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );

    return (
      <View
        style={{ width: SCREEN_WIDTH }}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0) setPageViewportH((prev) => (prev === h ? prev : h));
        }}
      >
        <DraggableFlatList
          ref={(r: any) => { pageListRefs.current[index] = r; }}
          data={pageItems}
          keyExtractor={(item) => item.id}
          onDragEnd={reorderable ? ({ data }) => handleDragEnd(data) : undefined}
          activationDistance={10}
          onScrollOffsetChange={(y: number) => handlePageScroll(index, y)}
          contentContainerStyle={[
            styles.pageContentContainer,
            { paddingTop: chromeH + 8 },
            pageViewportH > 0 && { minHeight: pageViewportH + bandH },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          renderItem={({ item, drag, isActive }: RenderItemParams<MenuItem>) => {
            // Recipe-fed rows (whole cocktail-fed pages, or strays surfaced on
            // Featured Specials) render with NO editor affordances — display
            // only; tapping one opens the user-side detail (Steve's round 3).
            const readOnly = isCocktailFed || isRecipeFedItem(item);
            return (
              <ScaleDecorator>
                {renderCard(item, categoryColor, {
                  editor: readOnly
                    ? undefined
                    : {
                        onMeatball: () => setItemActions({ item, page }),
                        drag: reorderable ? drag : undefined,
                        dragActive: isActive,
                        showGrabber: showDragHint,
                      },
                  onPress: readOnly ? () => openRecipeDetail(item) : undefined,
                  metaTags: isSpecialsPage
                    ? [
                        ...(organization.menu_count === 2 ? [menuBadgeForSeason(item.season).label] : []),
                        getCategoryLabel(item.category),
                      ]
                    : undefined,
                })}
              </ScaleDecorator>
            );
          }}
        />
      </View>
    );
  };

  // ── Category/subcategory tab models (editor: full visible tree, empty pages
  // included — a manager must be able to reach an empty subcategory to fill it).
  const categoryTabs = useMemo(
    () => menuCats.filter((c) => !c.is_hidden).map((c) => ({
      name: c.display_name,
      label: labelForCategoryName(c.display_name, t, menuCats, language),
      color: c.color,
    })),
    [menuCats, t, language],
  );
  const subTabs = useMemo(() => {
    const cat = catOf(selectedCategory);
    if (!cat) return [];
    return cat.subcategories
      .filter((s) => !s.is_hidden)
      .map((s) => ({ name: s.display_name, label: labelForSubcategoryName(s.display_name, t, menuCats, language) }));
  }, [catOf, selectedCategory, menuCats, t, language]);
  const activeCategoryColor = catOf(selectedCategory)?.color || colors.primary;

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Pushed screen — it owns its backdrop (the portal layout renders these
          for tab pages); the inset spacer mirrors the portal layout's exactly
          so the user↔editor flip does not move the chrome. */}
      <AmbientGlow />
      <View style={{ height: insets.top }} />

      {/* zIndex lifts the header's chips ABOVE the pager's translated chrome
          overlay in sibling stacking — the parked (invisible) band otherwise
          intercepted chip taps on iOS despite pointerEvents:none (Steve's
          smoke: ⚙/eye dead while collapsed). */}
      <View style={styles.topAreaLayer}>
        <MenuTopArea
          colors={colors}
          mode="editor"
          showActionChips
          onOpenMenuSheet={() => setMenuSheetVisible(true)}
          onFlipSide={() => router.back()}
          season={season}
          onSeasonChange={setSeason}
          showMenuTabs={isSearchMode && organization.menu_count === 2}
          menu1Label={organization.menu_1_name}
          menu2Label={organization.menu_2_name}
          menu1Icon={organization.menu_1_icon}
          menu2Icon={organization.menu_2_icon}
        />
      </View>

      {isSearchMode ? (
        <>
          {/* Search mode: static search row + flat cross-menu results — no
              overlay, no collapse (the row must be usable while typing). */}
          <MenuSearchRow
            colors={colors}
            mode="editor"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('menu_editor:search_placeholder')}
            onRightPress={openAdd}
          />
          {(loading || categoriesLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.pageScrollView} contentContainerStyle={styles.searchListContent}>
              <View style={styles.searchInfoBanner}>
                <IconSymbol
                  ios_icon_name="magnifyingglass"
                  android_material_icon_name="search"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.searchInfoText}>
                  {filteredItems.length === 1
                    ? t('menu_editor:search_results', { count: filteredItems.length })
                    : t('menu_editor:search_results_plural', { count: filteredItems.length })}
                </Text>
              </View>
              {filteredItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <IconSymbol
                    ios_icon_name="fork.knife"
                    android_material_icon_name="restaurant-menu"
                    size={64}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.emptyText}>{t('menu_editor:empty_title')}</Text>
                  <Text style={styles.emptySubtext}>{t('menu_editor:empty_search_subtext')}</Text>
                </View>
              ) : (
                filteredItems.map((item) =>
                  renderCard(item, catOf(item.category)?.color || colors.primary, {
                    editor: isRecipeFedItem(item)
                      ? undefined
                      : {
                          onMeatball: () => setItemActions({ item, page: null }),
                          showGrabber: false,
                        },
                    onPress: isRecipeFedItem(item) ? () => openRecipeDetail(item) : undefined,
                    menuBadge: organization.menu_count === 2 ? menuBadgeForSeason(item.season) : null,
                  })
                )
              )}
            </ScrollView>
          )}
        </>
      ) : (
        /* Normal mode: pager + the collapsing chrome overlay (native-driver
           transform over constant-padding pages — nothing resizes on scroll). */
        <View style={styles.pagerArea}>
          {(loading || categoriesLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={pagerRef}
              data={pages}
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
              // Loud reloads remount the pager — land on the page the manager
              // is parked on, clamped (pages can shrink after category edits).
              initialScrollIndex={Math.max(0, Math.min(currentPageIndex, Math.max(pages.length - 1, 0)))}
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
                glide away together; category rows park under the header. */}
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
                mode="editor"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('menu_editor:search_placeholder')}
                onRightPress={openAdd}
              />
            </Animated.View>
            <MenuCategoryTabs
              colors={colors}
              categories={categoryTabs}
              activeCategory={selectedCategory}
              onSelectCategory={(name) => navigateToPage(name)}
              subcategories={subTabs}
              activeSubcategory={selectedSubcategory || ''}
              onSelectSubcategory={(name) => navigateToPage(selectedCategory, name)}
              activeColor={activeCategoryColor}
              showBackdrop={backdropOn}
            />
          </Animated.View>
        </View>
      )}

      {/* Overflow (⋯) actions — a real sheet so every row survives Android. */}
      <GlassActionSheet
        visible={!!itemActions}
        onClose={() => setItemActions(null)}
        title={actionSheetModel?.title ?? ''}
        subtitle={actionSheetModel?.subtitle}
        actions={actionSheetModel?.actions ?? []}
      />

      {/* Read-only view of a recipe-fed libations row — the user side's sheet,
          Redeem-less, with the jump to its Recipes Editor. */}
      <MenuItemDetailSheet
        visible={recipeDetailVisible}
        onClose={closeRecipeDetail}
        colors={colors}
        item={recipeDetailCtx.detailItem}
        menuLabel={recipeDetailCtx.menuLabel}
        categoryLabel={recipeDetail ? getCategoryLabel(recipeDetail.category) : ''}
        subcategoryLabel={recipeDetail?.subcategory ? getSubcategoryLabel(recipeDetail.subcategory) : null}
        isWine={recipeDetailCtx.isWine}
        isLibations={recipeDetailCtx.isLibations}
        redeem={null}
        editAction={recipeDetailCtx.editAction}
      />

      {/* Shared Order Position picker (the inline duplicate is gone — §B4). */}
      <OrderPositionModal
        visible={!!positionPicker}
        title={t('menu_editor:order_position')}
        subtitle={positionPicker ? t('menu_editor:order_position_subtitle', { name: positionPicker.item.name }) : ''}
        count={positionPicker?.siblings.length ?? 0}
        currentIndex={positionPicker?.currentIndex ?? 0}
        onClose={() => setPositionPicker(null)}
        onApply={applyPositionChange}
      />

      {/* The Add/Edit sheet owns the whole form incl. save; the host only
          reloads + alerts after it reports success. */}
      <MenuItemEditSheet
        visible={editSheet.visible}
        onClose={closeEditSheet}
        onSaved={handleSaved}
        onDismissed={flushSavedAlert}
        colors={colors}
        editingItem={editSheet.item}
        initialSeason={season}
        initialCategory={!isSearchMode ? selectedCategory || null : null}
        initialSubcategory={!isSearchMode ? selectedSubcategory : null}
        computeNextOrder={computeNextOrder}
      />

      {/* The ⚙ Menu sheet — same sheet as the user side; Edit Menu is a no-op
          here (we are already in the editor, the row just closes the sheet). */}
      {user && (
        <MenuSheet
          visible={menuSheetVisible}
          onClose={closeMenuSheet}
          colors={colors}
          role={user.role === 'owner' ? 'owner' : 'manager'}
          mode="editor"
          perms={managerPerms}
          onEditMenu={() => router.back()}
          onEditCategories={() => router.push('/manage-menu-categories' as any)}
          onMenuConfiguration={handleMenuConfiguration}
          quota={uploadQuota}
          refreshQuota={fetchQuota}
        />
      )}

      {/* Steve's smoke ask: the editor carries the floating nav + Jolt like
          the Menus tab (the pushed-editor family precedent — guides editor,
          redeem, etc.); also stages the later Jolt-dock session. The pages'
          paddingBottom 100 already clears the bar. */}
      <BottomNavBar activeTab="menus" />
      {/* On the Menus tab, Jolt is rendered by the PORTAL LAYOUT — a layer
          above the whole scene, so nothing in the screen can paint over it.
          Here Jolt shares the screen root with the zIndexed header (20) and
          the chrome overlay (10), which painted OVER its expanded panel
          (Steve's smoke screenshots) — the absoluteFill zIndex:30 layer
          reproduces the portal's stacking; box-none so it never eats touches
          meant for the screen. */}
      <View style={styles.joltLayer} pointerEvents="box-none">
        <JoltOverlay role="manager" />
      </View>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    // The screen owns its background (pushed route — no portal layout behind).
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Above the pager subtree (and its translated chrome overlay) in sibling
    // stacking, so the header chips stay tappable while the band is parked
    // over them.
    topAreaLayer: {
      zIndex: 20,
    },
    // Jolt paints above EVERYTHING (30 > header 20 > chrome overlay 10) —
    // mirrors the portal layout rendering it above the whole tab scene.
    joltLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 30,
    },
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
    overlaySeasonTabs: {
      marginHorizontal: 16,
    },
    pageScrollView: {
      flex: 1,
    },
    pageContentContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 100,
    },
    searchListContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 100,
    },
    // {n} items · {section} left · drag hint right — mono uppercase, the
    // mockup's .cntrow voice.
    countRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      gap: 12,
    },
    countRowText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    // Right-aligned whether or not the drag hint renders beside it.
    countRowCount: {
      marginLeft: 'auto',
    },
    searchInfoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
      marginBottom: 10,
    },
    searchInfoText: {
      flex: 1,
      fontFamily: fonts.body.medium,
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    libationBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 13,
      backgroundColor: colors.primary + '10',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.primary + '2E',
      marginBottom: 10,
    },
    libationBannerText: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 64,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyText: {
      fontFamily: fonts.display.semibold,
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
    },
    emptySubtext: {
      fontFamily: fonts.body.regular,
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 42,
      paddingHorizontal: 18,
      borderRadius: 13,
      backgroundColor: colors.primary,
      marginTop: 6,
    },
    emptyCtaText: {
      fontFamily: fonts.display.semibold,
      fontSize: 14,
      color: colors.fireText,
    },
  });
