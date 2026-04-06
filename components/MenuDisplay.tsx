
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Dimensions,
  TextInput,
  FlatList,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import ContentDetailModal from '@/components/ContentDetailModal';
import { useTranslation } from 'react-i18next';
import { stripFormattingTags } from '@/components/FormattedText';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';

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
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORIES = ['Weekly Specials', 'Lunch', 'Dinner', 'Libations', 'Wine', 'Happy Hour'];

const SUBCATEGORIES: { [key: string]: string[] } = {
  'Weekly Specials': [],
  Lunch: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Burgers', 'Sandwiches', 'Sides', 'All'],
  Dinner: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Entrees', 'Pasta', 'Sides', 'All'],
  Libations: ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV', 'Draft Beer', 'Bottle & Cans', 'All'],
  Wine: ['Sparkling', 'Rose', 'Chardonnay', 'Pinot Grigio', 'Sauvignon Blanc', 'Interesting Whites', 'Cabernet Sauvignon', 'Pinot Noir', 'Merlot', 'Italian Reds', 'Interesting Reds', 'All'],
  'Happy Hour': ['Appetizers', 'Drinks', 'Spirits', 'All'],
};

// Border-left accent colors by category
const CATEGORY_COLORS: { [key: string]: string } = {
  'Weekly Specials': '#F44336',
  'Lunch': '#4CAF50',
  'Dinner': '#1976D2',
  'Libations': '#9C27B0',
  'Wine': '#E91E63',
  'Happy Hour': '#FF9800',
};

// Build flat page sequence for swipe navigation
interface PageConfig {
  category: string;
  subcategory: string | null;
}

const MENU_PAGES: PageConfig[] = [];
for (const category of CATEGORIES) {
  const subs = SUBCATEGORIES[category];
  if (subs.length === 0) {
    MENU_PAGES.push({ category, subcategory: null });
  } else {
    for (const sub of subs) {
      MENU_PAGES.push({ category, subcategory: sub });
    }
  }
}

// Phantom bridge page used when swipe-to-welcome is enabled
const WELCOME_BRIDGE_PAGE: PageConfig = { category: '__welcome-bridge__', subcategory: null };

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

// Mapping from English category/subcategory names to i18n translation keys
const CATEGORY_TRANSLATION_KEYS: { [key: string]: string } = {
  'Weekly Specials': 'menu_display.weekly_specials',
  'Lunch': 'menu_display.lunch',
  'Dinner': 'menu_display.dinner',
  'Libations': 'menu_display.libations',
  'Wine': 'menu_display.wine',
  'Happy Hour': 'menu_display.happy_hour',
};

const SUBCATEGORY_TRANSLATION_KEYS: { [key: string]: string } = {
  'Starters': 'menu_display.starters',
  'Raw Bar': 'menu_display.raw_bar',
  'Soups': 'menu_display.soups',
  'Tacos': 'menu_display.tacos',
  'Salads': 'menu_display.salads',
  'Burgers': 'menu_display.burgers',
  'Sandwiches': 'menu_display.sandwiches',
  'Sides': 'menu_display.sides',
  'Entrees': 'menu_display.entrees',
  'Pasta': 'menu_display.pasta',
  'Signature Cocktails': 'menu_display.signature_cocktails',
  'Martinis': 'menu_display.martinis',
  'Sangria': 'menu_display.sangria',
  'Low ABV': 'menu_display.low_abv',
  'Zero ABV': 'menu_display.zero_abv',
  'Draft Beer': 'menu_display.draft_beer',
  'Bottle & Cans': 'menu_display.bottle_and_cans',
  'Sparkling': 'menu_display.sparkling',
  'Rose': 'menu_display.rose',
  'Chardonnay': 'menu_display.chardonnay',
  'Pinot Grigio': 'menu_display.pinot_grigio',
  'Sauvignon Blanc': 'menu_display.sauvignon_blanc',
  'Interesting Whites': 'menu_display.interesting_whites',
  'Cabernet Sauvignon': 'menu_display.cabernet_sauvignon',
  'Pinot Noir': 'menu_display.pinot_noir',
  'Merlot': 'menu_display.merlot',
  'Italian Reds': 'menu_display.italian_reds',
  'Interesting Reds': 'menu_display.interesting_reds',
  'Appetizers': 'menu_display.appetizers',
  'Drinks': 'menu_display.drinks',
  'Spirits': 'menu_display.spirits',
  'All': 'menu_display.all',
};

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

  // Build pages array — prepend phantom bridge page when swipe-to-welcome is enabled
  const hasBridge = !!onSwipeToWelcome;
  const PAGES = useMemo(() => {
    return hasBridge ? [WELCOME_BRIDGE_PAGE, ...MENU_PAGES] : MENU_PAGES;
  }, [hasBridge]);
  const bridgeOffset = hasBridge ? 1 : 0;

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(bridgeOffset);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const pagerRef = useRef<FlatList>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const subcategoryScrollRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  const subcategoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});

  // Derive selected category/subcategory from page index
  const currentPage = PAGES[currentPageIndex];
  const selectedCategory = currentPage?.category || 'Weekly Specials';
  const selectedSubcategory = currentPage?.subcategory || null;

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

  const getCategoryLabel = (category: string) => {
    const key = CATEGORY_TRANSLATION_KEYS[category];
    return key ? t(key) : category;
  };

  const getSubcategoryLabel = (subcategory: string) => {
    const key = SUBCATEGORY_TRANSLATION_KEYS[subcategory];
    return key ? t(key) : subcategory;
  };

  useEffect(() => {
    loadMenuItems();
  }, []);

  // Filter items for a given page
  const getItemsForPage = useCallback((page: PageConfig): MenuItem[] => {
    let filtered = menuItems;

    // Filter by category
    if (page.category === 'Weekly Specials') {
      filtered = filtered.filter(item => item.category === 'Weekly Specials');
    } else if (page.category === 'Lunch') {
      filtered = filtered.filter(item => item.available_for_lunch);
    } else if (page.category === 'Dinner') {
      filtered = filtered.filter(item => item.available_for_dinner);
    } else {
      filtered = filtered.filter(item => item.category === page.category);
    }

    // Filter by subcategory if not null and not "All"
    if (page.subcategory && page.subcategory !== 'All') {
      filtered = filtered.filter(item => item.subcategory === page.subcategory);
    }

    return filtered;
  }, [menuItems]);

  // Get filtered items for search/filter mode
  const getSearchFilteredItems = useCallback(() => {
    let filtered = menuItems;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = menuItems.filter(
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
            case 'wine': return item.category === 'Wine';
            case 'libations': return item.category === 'Libations';
            case 'happyHour': return item.category === 'Happy Hour';
            case 'weeklySpecials': return item.category === 'Weekly Specials';
            default: return true;
          }
        });
      });
    }

    return filtered;
  }, [menuItems, searchQuery, activeFilters]);

  const isSearchOrFilterMode = searchQuery.trim().length > 0 || activeFilters.length > 0;

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
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

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  const buildDetailedDescription = (item: MenuItem) => {
    let description = getLocalizedField(item, 'description', language) || item.description || '';

    const dietaryInfo = [];
    if (item.is_gluten_free) dietaryInfo.push('Gluten Free');
    if (item.is_gluten_free_available) dietaryInfo.push('Gluten Free Available');
    if (item.is_vegetarian) dietaryInfo.push('Vegetarian');
    if (item.is_vegetarian_available) dietaryInfo.push('Vegetarian Available');

    if (dietaryInfo.length > 0) {
      description += `\n\nDietary Options: ${dietaryInfo.join(', ')}`;
    }

    const availability = [];
    if (item.available_for_lunch) availability.push('Lunch');
    if (item.available_for_dinner) availability.push('Dinner');

    if (availability.length > 0) {
      description += `\n\nAvailable for: ${availability.join(', ')}`;
    }

    if (item.category) description += `\n\nCategory: ${item.category}`;
    if (item.subcategory) description += `\nSubcategory: ${item.subcategory}`;

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
  const renderMenuCard = (item: MenuItem, categoryColor: string) => (
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
      <View style={styles.cardRow}>
        {item.thumbnail_url && (
          <Image
            source={{ uri: getImageUrl(item.thumbnail_url)! }}
            style={styles.cardImage}
          />
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(item, 'name', language)}
            </Text>
            <Text style={[styles.cardPrice, { color: colors.primary }]}>
              {formatPrice(item.price)}
            </Text>
          </View>
          {(item.category === 'Weekly Specials' && (item.available_for_lunch || item.available_for_dinner)) || item.is_gluten_free || item.is_gluten_free_available ||
            item.is_vegetarian || item.is_vegetarian_available ? (
            <View style={styles.tagsRow}>
              {item.category === 'Weekly Specials' && item.available_for_lunch && (
                <View style={[styles.tag, { backgroundColor: '#FF980018' }]}>
                  <Text style={[styles.tagText, { color: '#FF9800' }]}>Lunch</Text>
                </View>
              )}
              {item.category === 'Weekly Specials' && item.available_for_dinner && (
                <View style={[styles.tag, { backgroundColor: '#9C27B018' }]}>
                  <Text style={[styles.tagText, { color: '#9C27B0' }]}>Dinner</Text>
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

  // Render a single page of menu items (for swipe pager)
  const renderPage = ({ item: page, index }: { item: PageConfig; index: number }) => {
    // Phantom bridge page — render empty
    if (page.category === '__welcome-bridge__') {
      return <View style={{ width: SCREEN_WIDTH }} />;
    }

    const pageItems = getItemsForPage(page);
    const categoryColor = CATEGORY_COLORS[page.category] || colors.primary;

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
      {/* Fixed Header Area: Search + Filter + Category/Subcategory pills */}
      <View style={styles.headerArea}>
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
            {CATEGORIES.map((category, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.categoryTab,
                  { backgroundColor: colors.card },
                  selectedCategory === category && { backgroundColor: colors.primary },
                ]}
                onPress={() => navigateToPage(category)}
                onLayout={(e) => {
                  categoryLayoutsRef.current[category] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    { color: colors.textSecondary },
                    selectedCategory === category && { color: '#FFFFFF' },
                  ]}
                >
                  {getCategoryLabel(category)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Subcategory Tabs — only in normal mode and when category has subcategories */}
        {!isSearchOrFilterMode && SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
          <ScrollView
            ref={subcategoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subcategoryScroll}
            contentContainerStyle={styles.subcategoryScrollContent}
          >
            {SUBCATEGORIES[selectedCategory].map((subcategory, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.subcategoryTab,
                  { backgroundColor: colors.card },
                  selectedSubcategory === subcategory && { backgroundColor: colors.highlight },
                ]}
                onPress={() => navigateToPage(selectedCategory, subcategory)}
                onLayout={(e) => {
                  subcategoryLayoutsRef.current[`${selectedCategory}_${subcategory}`] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
              >
                <Text
                  style={[
                    styles.subcategoryTabText,
                    { color: colors.textSecondary },
                    selectedSubcategory === subcategory && { color: colors.text },
                  ]}
                >
                  {getSubcategoryLabel(subcategory)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Main Content Area */}
      {loading ? (
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
              renderMenuCard(item, CATEGORY_COLORS[item.category] || colors.primary)
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
              {FILTER_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={index}
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
                    {option.label}
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
      {selectedMenuItem && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={`${getLocalizedField(selectedMenuItem, 'name', language)} - ${formatPrice(selectedMenuItem.price)}`}
          content={buildDetailedDescription(selectedMenuItem)}
          thumbnailUrl={selectedMenuItem.thumbnail_url}
          thumbnailShape={selectedMenuItem.thumbnail_shape}
          colors={colors}
        />
      )}
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
    categoryTab: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      marginRight: 8,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    categoryTabText: {
      fontSize: 14,
      fontWeight: '600',
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
    subcategoryTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      marginRight: 8,
      boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
      elevation: 1,
    },
    subcategoryTabText: {
      fontSize: 12,
      fontWeight: '600',
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
      resizeMode: 'cover',
    },
    cardContent: {
      flex: 1,
      justifyContent: 'center',
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
