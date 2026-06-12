
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
  TextInput,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import ContentDetailModal from '@/components/ContentDetailModal';
import { useTranslation } from 'react-i18next';
import { stripFormattingTags } from '@/components/FormattedText';
import CategoryPill from '@/components/CategoryPill';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { getImageUrl } from '@/utils/imageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useRouter } from 'expo-router';
import SeasonSelector, { type Season } from '@/components/SeasonSelector';
import { menuIconAndroid } from '@/constants/menuIcons';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import {
  labelForCategoryName,
  labelForSubcategoryName,
  findCategoryByName,
  resolveRecipeSubName,
} from '@/utils/menuCategoryLabels';

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

// The category tree (and each category's accent color) is loaded per-org from
// the DB via useMenuCategories. The swipe-pager page sequence — one page per
// subcategory plus a virtual 'All' page per category — is derived per-render in
// the component. 'All' is never persisted; it stays a display-only affordance.
const ALL_PAGE_KEY = 'All';

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

// Filter options
const FILTER_OPTIONS = [
  { key: 'dinner', label: 'Dinner' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'gf', label: 'GF' },
  { key: 'gfa', label: 'GFA' },
  { key: 'v', label: 'V' },
  { key: 'va', label: 'VA' },
  { key: 'wine', label: 'Wine' },
  { key: 'libations', label: 'Libations' },
  { key: 'happyHour', label: 'Happy Hour' },
  { key: 'weeklySpecials', label: 'Weekly Specials' },
];

// Category/subcategory labels resolve through utils/menuCategoryLabels:
// built-ins keep their i18n labels; renamed/custom names show raw.

interface MenuDisplayProps {
  colors: {
    background: string;
    text: string;
    textSecondary: string;
    primary: string;
    card: string;
    highlight: string;
    border: string;
  };
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

  // Build pages from the loaded category tree: one page per subcategory plus a
  // virtual 'All' page per category, then prepend the phantom bridge page when
  // swipe-to-welcome is enabled.
  const hasBridge = !!onSwipeToWelcome;
  const menuPages = useMemo<PageConfig[]>(() => {
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
  }, [menuCats]);
  const PAGES = useMemo(() => {
    return hasBridge ? [WELCOME_BRIDGE_PAGE, ...menuPages] : menuPages;
  }, [hasBridge, menuPages]);
  const bridgeOffset = hasBridge ? 1 : 0;

  const perMenu = organization?.menu_category_scope === 'per_menu';
  // Behavior resolvers — key off system_key / filter_behavior, not display name,
  // so Wine/Lunch/Dinner/Libations behavior survives renames.
  const catOf = useCallback(
    (name: string | null | undefined) => findCategoryByName(menuCats, name),
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
      if (fb === 'weekly_specials') return item.category === categoryName || !!item.is_weekly_special;
      return item.category === categoryName;
    },
    [catOf, perMenu],
  );

  // Cocktail-recipe injection: map the fixed recipe vocabulary to the org's
  // CURRENT Libations subcategory names (by system_key) so injected cocktails
  // follow renames; plus the set of cocktail-fed names for the winter dedup.
  const libInjection = useMemo(() => {
    const libCat = menuCats.find((c) => c.system_key === 'cat.libations');
    const libationsCategoryName = libCat?.display_name ?? 'Libations';
    const subNameByKey: Record<string, string> = {};
    const cocktailSubNames = new Set<string>();
    if (libCat) {
      for (const s of libCat.subcategories) {
        if (s.system_key) subNameByKey[s.system_key] = s.display_name;
        if (s.is_cocktail_fed) cocktailSubNames.add(s.display_name);
      }
    }
    return { libationsCategoryName, subNameByKey, cocktailSubNames };
  }, [menuCats]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  // Cross-menu search corpus (both menus + their injected cocktails), deduped.
  // Used only when there's a search query so the customer can find an item on
  // either menu; the badge on each result shows which menu it lives on.
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(bridgeOffset);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  // Per-menu hides the Lunch/Dinner chips — drop any stale ones so they can't
  // linger as active filters with no way to untoggle them.
  useEffect(() => {
    if (perMenu) setActiveFilters((prev) => prev.filter((f) => f !== 'lunch' && f !== 'dinner'));
  }, [perMenu]);
  const { user } = useAuth();
  const router = useRouter();

  const pagerRef = useRef<FlatList>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const subcategoryScrollRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  const subcategoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});

  // Derive selected category/subcategory from page index
  const currentPage = PAGES[currentPageIndex];
  const selectedCategory = currentPage?.category || '';
  const selectedSubcategory = currentPage?.subcategory || null;
  const selectedCategoryObj = findCategoryByName(menuCats, selectedCategory);
  // Availability tags + filter chips follow the lunch/dinner (and other built-in) renames.
  const lunchName = labelForCategoryName(menuCats.find((c) => c.filter_behavior === 'lunch')?.display_name || 'Lunch', t, menuCats, language);
  const dinnerName = labelForCategoryName(menuCats.find((c) => c.filter_behavior === 'dinner')?.display_name || 'Dinner', t, menuCats, language);
  const filterChipLabel = (key: string, fallback: string): string => {
    switch (key) {
      case 'lunch': return lunchName;
      case 'dinner': return dinnerName;
      case 'wine': return labelForCategoryName(menuCats.find((c) => c.system_key === 'cat.wine')?.display_name || 'Wine', t, menuCats, language);
      case 'libations': return labelForCategoryName(menuCats.find((c) => c.system_key === 'cat.libations')?.display_name || 'Libations', t, menuCats, language);
      case 'happyHour': return labelForCategoryName(menuCats.find((c) => c.system_key === 'cat.happy_hour')?.display_name || 'Happy Hour', t, menuCats, language);
      case 'weeklySpecials': return labelForCategoryName(menuCats.find((c) => c.system_key === 'cat.weekly_specials')?.display_name || 'Weekly Specials', t, menuCats, language);
      default: return fallback;
    }
  };

  // Auto-scroll category pills to center the active one
  useEffect(() => {
    const layout = categoryLayoutsRef.current[selectedCategory];
    if (layout && categoryScrollRef.current) {
      const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
      categoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
    }
  }, [selectedCategory]);

  // Auto-scroll subcategory pills to center the active one
  const prevCategoryRef = useRef(selectedCategory);
  useEffect(() => {
    if (!selectedSubcategory || !subcategoryScrollRef.current) return;

    const categoryChanged = prevCategoryRef.current !== selectedCategory;
    prevCategoryRef.current = selectedCategory;

    if (categoryChanged) {
      // Category just changed — new pills are rendering, layouts aren't measured yet.
      // Scroll to start immediately (first subcategory is always at x=0),
      // then try to center after a short delay once onLayout has fired.
      subcategoryLayoutsRef.current = {};
      subcategoryScrollRef.current.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        const layoutKey = `${selectedCategory}_${selectedSubcategory}`;
        const layout = subcategoryLayoutsRef.current[layoutKey];
        if (layout && subcategoryScrollRef.current) {
          const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
          subcategoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
        }
      }, 100);
    } else {
      // Same category, just subcategory changed — layouts are already measured
      const layoutKey = `${selectedCategory}_${selectedSubcategory}`;
      const layout = subcategoryLayoutsRef.current[layoutKey];
      if (layout) {
        const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
        subcategoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
      }
    }
  }, [selectedCategory, selectedSubcategory]);

  const getCategoryLabel = (category: string) => labelForCategoryName(category, t, menuCats, language);
  const getSubcategoryLabel = (subcategory: string) => labelForSubcategoryName(subcategory, t, menuCats, language);

  useEffect(() => {
    if (categoriesLoading) return; // wait for the category tree so injection resolves names
    loadMenuItems();
    setCurrentPageIndex(bridgeOffset);
    pagerRef.current?.scrollToIndex({ index: bridgeOffset, animated: false });
  }, [season, menuCats, categoriesLoading]);

  // Filter items for a given page
  const getItemsForPage = useCallback((page: PageConfig): MenuItem[] => {
    let filtered = menuItems.filter(item => categoryMatches(item, page.category));

    // Filter by subcategory if not null and not the virtual "All" page
    if (page.subcategory && page.subcategory !== ALL_PAGE_KEY) {
      filtered = filtered.filter(item => item.subcategory === page.subcategory);
    }

    return filtered;
  }, [menuItems, categoryMatches]);

  // Get filtered items for search/filter mode
  const getSearchFilteredItems = useCallback(() => {
    // A text search spans the WHOLE menu (allItems); filter-only stays on the
    // active menu (menuItems).
    let filtered = searchQuery.trim() ? allItems : menuItems;

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

    if (activeFilters.length > 0) {
      filtered = filtered.filter(item => {
        return activeFilters.every(filter => {
          switch (filter) {
            case 'dinner': return item.available_for_dinner;
            case 'lunch': return item.available_for_lunch;
            case 'gf': return item.is_gluten_free;
            case 'gfa': return item.is_gluten_free_available;
            case 'v': return item.is_vegetarian;
            case 'va': return item.is_vegetarian_available;
            case 'wine': return isWineName(item.category);
            case 'libations': return catOf(item.category)?.system_key === 'cat.libations';
            case 'happyHour': return catOf(item.category)?.system_key === 'cat.happy_hour';
            case 'weeklySpecials': return catOf(item.category)?.filter_behavior === 'weekly_specials';
            default: return true;
          }
        });
      });
    }

    return filtered;
  }, [menuItems, allItems, searchQuery, activeFilters, isWineName, catOf]);

  const isSearchOrFilterMode = searchQuery.trim().length > 0 || activeFilters.length > 0;

  // Build the full item list for ONE menu (regular items + that menu's injected
  // cocktail recipes). Used both for the active display and the cross-menu
  // search corpus. (For the non-active menu the cocktail subcategory names
  // resolve best-effort against the active tree — fine for search.)
  const buildItemsForSeason = async (seasonKey: Season): Promise<MenuItem[]> => {
    const { data, error } = await (supabase
      .from('menu_items') as any)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .in('season', [seasonKey, 'both'])
      .order('display_order', { ascending: true });

    if (error) throw error;
    let items: MenuItem[] = data || [];

    if (seasonKey === 'summer') {
      const { data: slrData } = await (supabase
        .from('summer_libation_recipes' as any) as any)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

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
        (i) => !(i.category === libInjection.libationsCategoryName && i.subcategory != null && libInjection.cocktailSubNames.has(i.subcategory))
      );

      const { data: lrData } = await (supabase
        .from('libation_recipes' as any) as any)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

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

  const loadMenuItems = async () => {
    try {
      setLoading(true);
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

  const openDetailModal = (item: MenuItem) => {
    setSelectedMenuItem(item);
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedMenuItem(null);
  };

  const openFilterModal = () => setFilterModalVisible(true);
  const closeFilterModal = () => setFilterModalVisible(false);

  const toggleFilter = (filterKey: string) => {
    setActiveFilters(prev =>
      prev.includes(filterKey) ? prev.filter(f => f !== filterKey) : [...prev, filterKey]
    );
  };

  const removeFilter = (filterKey: string) => {
    setActiveFilters(prev => prev.filter(f => f !== filterKey));
  };

  const clearAllFilters = () => setActiveFilters([]);

  const getFilterLabel = (filterKey: string) => {
    const filterTranslationMap: { [key: string]: string } = {
      'dinner': 'menu_display.dinner',
      'lunch': 'menu_display.lunch',
      'wine': 'menu_display.wine',
      'libations': 'menu_display.libations',
      'happyHour': 'menu_display.happy_hour',
      'weeklySpecials': 'menu_display.weekly_specials',
    };
    const translationKey = filterTranslationMap[filterKey];
    if (translationKey) return t(translationKey);
    const option = FILTER_OPTIONS.find(opt => opt.key === filterKey);
    return option ? option.label : filterKey;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  const buildDetailedDescription = (item: MenuItem) => {
    let description = getLocalizedField(item, 'description', language) || item.description || '';

    if (isWineName(item.category)) {
      const loc = getLocalizedField(item, 'location', language) || item.location;
      if (loc) description = `📍 ${loc}\n\n${description}`.trim();

      const priceLines: string[] = [];
      if (item.glass_price) priceLines.push(`Glass: ${formatPrice(item.glass_price)}`);
      if (item.bottle_price) priceLines.push(`Bottle: ${formatPrice(item.bottle_price)}`);
      if (item.member_bottle_price) priceLines.push(`Member Bottle: ${formatPrice(item.member_bottle_price)}`);
      if (priceLines.length > 0) {
        description += `\n\n${priceLines.join('\n')}`;
      }

      const flavor = getLocalizedField(item, 'flavor_profile', language);
      if (flavor && flavor.trim()) {
        const label = language === 'es' ? 'Sabor / Sensorial Clave' : 'Flavor / Key Sensory';
        description += `\n\n🍇 ${label}:\n${flavor}`;
      }
      const usp = getLocalizedField(item, 'unique_selling_points', language);
      if (usp && usp.trim()) {
        const label = language === 'es' ? 'Puntos de Venta Únicos' : 'Unique Selling Points';
        description += `\n\n✨ ${label}:\n${usp}`;
      }
    }

    const dietaryInfo = [];
    if (item.is_gluten_free) dietaryInfo.push('Gluten Free');
    if (item.is_gluten_free_available) dietaryInfo.push('Gluten Free Available');
    if (item.is_vegetarian) dietaryInfo.push('Vegetarian');
    if (item.is_vegetarian_available) dietaryInfo.push('Vegetarian Available');

    if (dietaryInfo.length > 0) {
      description += `\n\nDietary Options: ${dietaryInfo.join(', ')}`;
    }

    const availability = [];
    if (item.available_for_lunch) availability.push(lunchName);
    if (item.available_for_dinner) availability.push(dinnerName);

    if (availability.length > 0) {
      description += `\n\nAvailable for: ${availability.join(', ')}`;
    }

    if (item.category) description += `\n\nCategory: ${getCategoryLabel(item.category)}`;
    if (item.subcategory) description += `\nSubcategory: ${getSubcategoryLabel(item.subcategory)}`;

    return description;
  };

  // Navigate to a specific page by category/subcategory
  const navigateToPage = (category: string, subcategory?: string | null) => {
    let targetIndex: number;
    if (subcategory) {
      targetIndex = PAGES.findIndex(p => p.category === category && p.subcategory === subcategory);
    } else {
      targetIndex = PAGES.findIndex(p => p.category === category);
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
        pagerRef.current?.scrollToIndex({ index: bridgeOffset, animated: false });
        setCurrentPageIndex(bridgeOffset);
      }, 100);
      return;
    }

    if (newIndex >= 0 && newIndex < PAGES.length && newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
    }
  };

  // Render a single menu item card (compact style matching Welcome page)
  // Which menu an item belongs to (winter → Menu 1, summer → Menu 2, both →
  // shared) — shown as a badge on whole-menu search results.
  const menuBadgeForSeason = (s: string | null | undefined): { icon: string; label: string } => {
    if (s === 'winter') return { icon: organization?.menu_1_icon || 'snowflake', label: organization?.menu_1_name || 'Menu 1' };
    if (s === 'summer') return { icon: organization?.menu_2_icon || 'sun.max.fill', label: organization?.menu_2_name || 'Menu 2' };
    return { icon: 'circle.grid.2x2', label: t('menu_display.both_menus') };
  };

  const renderMenuCard = (item: MenuItem, categoryColor: string, menuBadge?: { icon: string; label: string }) => {
    const isWine = isWineName(item.category);
    const localizedLocation = isWine ? getLocalizedField(item, 'location', language) : '';
    // Banner items render the image full-width across the top of the card;
    // square items keep the inline 80×80 thumbnail (matches the Menu Editor).
    const isBanner = item.thumbnail_shape === 'banner';
    return (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.menuItemCard,
        {
          backgroundColor: colors.card,
          borderLeftColor: categoryColor,
        },
      ]}
      onPress={() => openDetailModal(item)}
      activeOpacity={0.7}
    >
      {isBanner && item.thumbnail_url && (
        <Image
          source={getImageUrl(item.thumbnail_url, item.updated_at)!}
          style={styles.cardImageBanner}
          contentFit="cover"
        />
      )}
      <View style={styles.cardRow}>
        {!isBanner && item.thumbnail_url && (
          <Image
            source={getImageUrl(item.thumbnail_url, item.updated_at)!}
            style={styles.cardImage}
            contentFit="cover"
          />
        )}
        <View style={styles.cardContent}>
          {menuBadge && (
            <View style={styles.menuBadge}>
              <IconSymbol ios_icon_name={menuBadge.icon} android_material_icon_name={menuIconAndroid(menuBadge.icon)} size={11} color={colors.primary} />
              <Text style={[styles.menuBadgeText, { color: colors.primary }]} numberOfLines={1}>{menuBadge.label}</Text>
            </View>
          )}
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(item, 'name', language)}
            </Text>
            {isWine ? (
              <View style={styles.winePriceStack}>
                {item.glass_price ? (
                  <Text style={[styles.winePriceLine, { color: colors.primary }]}>
                    Gl {formatPrice(item.glass_price)}
                  </Text>
                ) : null}
                {item.bottle_price ? (
                  <Text style={[styles.winePriceLine, { color: colors.primary }]}>
                    Btl {formatPrice(item.bottle_price)}
                  </Text>
                ) : null}
                {item.member_bottle_price ? (
                  <Text style={[styles.winePriceLine, { color: colors.textSecondary }]}>
                    Mbr {formatPrice(item.member_bottle_price)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.cardPrice, { color: colors.primary }]}>
                {formatPrice(item.price)}
              </Text>
            )}
          </View>
          {isWine && localizedLocation ? (
            <Text style={[styles.wineLocation, { color: colors.textSecondary }]} numberOfLines={1}>
              📍 {localizedLocation}
            </Text>
          ) : null}
          {(catOf(item.category)?.filter_behavior === 'weekly_specials' && (item.available_for_lunch || item.available_for_dinner)) || item.is_gluten_free || item.is_gluten_free_available ||
            item.is_vegetarian || item.is_vegetarian_available ? (
            <View style={styles.tagsRow}>
              {catOf(item.category)?.filter_behavior === 'weekly_specials' && item.available_for_lunch && (
                <View style={[styles.tag, { backgroundColor: '#FF980018' }]}>
                  <Text style={[styles.tagText, { color: '#FF9800' }]}>{lunchName}</Text>
                </View>
              )}
              {catOf(item.category)?.filter_behavior === 'weekly_specials' && item.available_for_dinner && (
                <View style={[styles.tag, { backgroundColor: '#9C27B018' }]}>
                  <Text style={[styles.tagText, { color: '#9C27B0' }]}>{dinnerName}</Text>
                </View>
              )}
              {item.is_gluten_free && (
                <View style={[styles.tag, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.tagText, { color: colors.text }]}>GF</Text>
                </View>
              )}
              {item.is_gluten_free_available && (
                <View style={[styles.tag, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.tagText, { color: colors.text }]}>GFA</Text>
                </View>
              )}
              {item.is_vegetarian && (
                <View style={[styles.tag, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.tagText, { color: colors.text }]}>V</Text>
                </View>
              )}
              {item.is_vegetarian_available && (
                <View style={[styles.tag, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.tagText, { color: colors.text }]}>VA</Text>
                </View>
              )}
            </View>
          ) : null}
          {item.description && (
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {stripFormattingTags(getLocalizedField(item, 'description', language) || item.description)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
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

    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <ScrollView
          style={styles.pageScrollView}
          contentContainerStyle={styles.pageContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {pageItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant-menu"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>{t('menu_display.no_items')}</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {t('menu_display.check_back')}
              </Text>
            </View>
          ) : (
            pageItems.map(item => renderMenuCard(item, categoryColor))
          )}
        </ScrollView>
      </View>
    );
  };

  const styles = createStyles(colors);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Fixed Header Area: Season toggle + Search + Filter + Category/Subcategory pills */}
      <View style={styles.headerArea}>
        {/* Season Selector — hidden when org only has one menu */}
        {organization.menu_count === 2 && (
          <View style={styles.seasonSelectorContainer}>
            <SeasonSelector
              selectedSeason={season}
              onSeasonChange={setSeason}
              menu1Label={organization.menu_1_name}
              menu2Label={organization.menu_2_name}
              menu1Icon={organization.menu_1_icon}
              menu2Icon={organization.menu_2_icon}
            />
          </View>
        )}

        {/* Search Bar and Filter Button */}
        <View style={styles.searchFilterContainer}>
          <View style={styles.searchContainer}>
            <IconSymbol
              ios_icon_name="magnifyingglass"
              android_material_icon_name="search"
              size={20}
              color={colors.textSecondary}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('menu_display.search_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.filterButton, { backgroundColor: colors.card }]} onPress={openFilterModal}>
            <IconSymbol
              ios_icon_name="line.3.horizontal.decrease.circle"
              android_material_icon_name="filter-list"
              size={20}
              color={colors.text}
            />
            <Text style={[styles.filterButtonText, { color: colors.text }]}>{t('menu_display.filter')}</Text>
            {activeFilters.length > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.filterBadgeText}>{activeFilters.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <View style={styles.activeFiltersContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeFiltersContent}
            >
              {activeFilters.map((filter, index) => (
                <View key={index} style={[styles.activeFilterChip, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.activeFilterChipText, { color: colors.text }]}>{getFilterLabel(filter)}</Text>
                  <TouchableOpacity onPress={() => removeFilter(filter)}>
                    <IconSymbol
                      ios_icon_name="xmark"
                      android_material_icon_name="close"
                      size={14}
                      color={colors.text}
                    />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.clearAllButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={clearAllFilters}
              >
                <Text style={[styles.clearAllButtonText, { color: colors.textSecondary }]}>{t('menu_display.clear_all')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Category Tabs — only in normal mode */}
        {!isSearchOrFilterMode && (
          <ScrollView
            ref={categoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {menuCats.map((cat) => (
              <CategoryPill
                key={cat.id}
                size="lg"
                label={getCategoryLabel(cat.display_name)}
                selected={selectedCategory === cat.display_name}
                onPress={() => navigateToPage(cat.display_name)}
                onLayout={(e) => {
                  categoryLayoutsRef.current[cat.display_name] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
              />
            ))}
          </ScrollView>
        )}

        {/* Subcategory Tabs — only in normal mode and when category has subcategories.
            A virtual 'All' pill is appended (never persisted). */}
        {!isSearchOrFilterMode && selectedCategoryObj && selectedCategoryObj.subcategories.length > 0 && (
          <ScrollView
            ref={subcategoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subcategoryScroll}
            contentContainerStyle={styles.subcategoryScrollContent}
          >
            {[...selectedCategoryObj.subcategories.map((s) => s.display_name), ALL_PAGE_KEY].map((subcategory, index) => (
              <CategoryPill
                key={index}
                size="sm"
                label={getSubcategoryLabel(subcategory)}
                selected={selectedSubcategory === subcategory}
                onPress={() => navigateToPage(selectedCategory, subcategory)}
                onLayout={(e) => {
                  subcategoryLayoutsRef.current[`${selectedCategory}_${subcategory}`] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Main Content Area */}
      {(loading || categoriesLoading) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isSearchOrFilterMode ? (
        /* Search/Filter mode: flat scrollable list */
        <ScrollView style={styles.pageScrollView} contentContainerStyle={styles.pageContentContainer}>
          {getSearchFilteredItems().length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant-menu"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>{t('menu_display.no_items')}</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {t('menu_display.adjust_search')}
              </Text>
            </View>
          ) : (
            getSearchFilteredItems().map(item =>
              renderMenuCard(
                item,
                catOf(item.category)?.color || colors.primary,
                searchQuery.trim() ? menuBadgeForSeason(item.season) : undefined,
              )
            )
          )}
        </ScrollView>
      ) : (
        /* Normal mode: horizontal swipe pager */
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
          initialScrollIndex={bridgeOffset}
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeFilterModal}
      >
        <View style={styles.filterModalContainer}>
          <TouchableOpacity
            style={styles.filterModalBackdrop}
            activeOpacity={1}
            onPress={closeFilterModal}
          />
          <View style={[styles.filterModalContent, { backgroundColor: colors.card }]}>
            <View style={[styles.filterModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.filterModalTitle, { color: colors.text }]}>{t('menu_display.filter_title')}</Text>
              <TouchableOpacity onPress={closeFilterModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalScroll} contentContainerStyle={styles.filterModalScrollContent}>
              {/* Per-menu treats Lunch/Dinner as ordinary categories, so their
                  meal-overlay filter chips don't apply there. */}
              {FILTER_OPTIONS.filter((o) => !(perMenu && (o.key === 'lunch' || o.key === 'dinner'))).map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.filterOption,
                    { backgroundColor: colors.background },
                    activeFilters.includes(option.key) && { backgroundColor: colors.highlight },
                  ]}
                  onPress={() => toggleFilter(option.key)}
                >
                  <View
                    style={[
                      styles.filterCheckbox,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      activeFilters.includes(option.key) && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    {activeFilters.includes(option.key) && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: colors.text },
                      activeFilters.includes(option.key) && styles.filterOptionTextActive,
                    ]}
                  >
                    {filterChipLabel(option.key, option.label)}
                  </Text>
                </TouchableOpacity>
              ))}

              {activeFilters.length > 0 && (
                <TouchableOpacity
                  style={[styles.clearFiltersButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={clearAllFilters}
                >
                  <Text style={[styles.clearFiltersButtonText, { color: colors.textSecondary }]}>
                    {t('menu_display.clear_all_filters')}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.applyFiltersButton, { backgroundColor: colors.primary }]} onPress={closeFilterModal}>
              <Text style={styles.applyFiltersButtonText}>
                {t('menu_display.apply_filters')} {activeFilters.length > 0 && `(${activeFilters.length})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Content Detail Modal for Menu Items */}
      {selectedMenuItem && (() => {
        const trimmed = (selectedMenuItem.price || '').trim();
        const m = trimmed.match(/^\$?(\d+(?:\.\d{1,2})?)$/);
        const parsedPrice = m ? parseFloat(m[1]) : NaN;
        const bucksCost = isFinite(parsedPrice) && parsedPrice > 0 ? Math.ceil(parsedPrice) : null;
        const isInactive = (selectedMenuItem as any).is_active === false;
        const showRedeem = user?.role === 'employee' && bucksCost !== null && !isInactive;
        const item = selectedMenuItem;
        return (
          <ContentDetailModal
            visible={detailModalVisible}
            onClose={closeDetailModal}
            title={
              isWineName(item.category)
                ? getLocalizedField(item, 'name', language)
                : `${getLocalizedField(item, 'name', language)} - ${formatPrice(item.price)}`
            }
            content={buildDetailedDescription(item)}
            thumbnailUrl={item.thumbnail_url}
            thumbnailShape={item.thumbnail_shape}
            colors={colors}
            redeemAction={
              showRedeem
                ? {
                    label: t('rewards_ui:redeem_for', { amount: bucksCost }),
                    onPress: () => {
                      closeDetailModal();
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
                : null
            }
          />
        );
      })()}
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerArea: {
      paddingTop: 20,
    },
    seasonSelectorContainer: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    // Search & Filter
    searchFilterContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 12,
      gap: 8,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 15,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 6,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    filterButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    filterBadge: {
      borderRadius: 10,
      width: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 4,
    },
    filterBadgeText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    // Active filters
    activeFiltersContainer: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    activeFiltersContent: {
      flexDirection: 'row',
      gap: 8,
    },
    activeFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 6,
    },
    activeFilterChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    clearAllButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      justifyContent: 'center',
      borderWidth: 1,
    },
    clearAllButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
    // Category tabs
    categoryScroll: {
      maxHeight: 50,
      marginBottom: 12,
    },
    categoryScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    // Subcategory tabs
    subcategoryScroll: {
      maxHeight: 40,
      marginBottom: 8,
    },
    subcategoryScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
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
    // Compact menu item card (matches Welcome page style)
    menuItemCard: {
      borderRadius: 12,
      marginBottom: 10,
      padding: 12,
      borderLeftWidth: 4,
      boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
      elevation: 2,
    },
    cardRow: {
      flexDirection: 'row',
      gap: 12,
    },
    cardImage: {
      width: 80,
      height: 80,
      borderRadius: 10,
    },
    cardImageBanner: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 10,
      marginBottom: 10,
    },
    cardContent: {
      flex: 1,
      justifyContent: 'center',
    },
    menuBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.primary + '18',
      marginBottom: 4,
      maxWidth: 150,
    },
    menuBadgeText: {
      fontSize: 10,
      fontWeight: '600',
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 8,
    },
    cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
    },
    cardPrice: {
      fontSize: 15,
      fontWeight: '600',
    },
    winePriceStack: {
      alignItems: 'flex-end',
    },
    winePriceLine: {
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 14,
    },
    wineLocation: {
      fontSize: 12,
      marginTop: 1,
      marginBottom: 2,
      fontStyle: 'italic',
    },
    cardSubtitle: {
      fontSize: 13,
      lineHeight: 18,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 4,
    },
    tag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    tagText: {
      fontSize: 10,
      fontWeight: '600',
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
      fontSize: 18,
      fontWeight: '600',
      marginTop: 16,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
    // Filter Modal
    filterModalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    filterModalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    filterModalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: '70%',
      boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.2)',
      elevation: 10,
    },
    filterModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
    },
    filterModalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    filterModalScroll: {
      flex: 1,
    },
    filterModalScrollContent: {
      padding: 20,
      paddingBottom: 20,
    },
    filterOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 10,
      gap: 12,
    },
    filterCheckbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterOptionText: {
      fontSize: 16,
      fontWeight: '500',
    },
    filterOptionTextActive: {
      fontWeight: '600',
    },
    clearFiltersButton: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 10,
      borderWidth: 1,
    },
    clearFiltersButtonText: {
      fontSize: 15,
      fontWeight: '600',
    },
    applyFiltersButton: {
      marginHorizontal: 20,
      marginVertical: 16,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    applyFiltersButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
  });
