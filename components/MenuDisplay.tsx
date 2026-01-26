
import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import ContentDetailModal from '@/components/ContentDetailModal';

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
  thumbnail_url: string | null;
  thumbnail_shape: string;
  display_order: number;
  is_active: boolean;
}

const CATEGORIES = ['Weekly Specials', 'Lunch', 'Dinner', 'Libations', 'Wine', 'Happy Hour'];

// Updated subcategories with "All" moved to the end
const SUBCATEGORIES: { [key: string]: string[] } = {
  'Weekly Specials': [],
  Lunch: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Burgers', 'Sandwiches', 'Sides', 'All'],
  Dinner: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Entrees', 'Pasta', 'Sides', 'All'],
  Libations: ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV', 'Draft Beer', 'Bottle & Cans', 'All'],
  Wine: ['Sparkling', 'Rose', 'Chardonnay', 'Pinot Grigio', 'Sauvignon Blanc', 'Interesting Whites', 'Cabernet Sauvignon', 'Pinot Noir', 'Merlot', 'Italian Reds', 'Interesting Reds', 'All'],
  'Happy Hour': ['Appetizers', 'Drinks', 'Spirits', 'All'],
};

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
}

export default function MenuDisplay({ colors }: MenuDisplayProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Weekly Specials');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  useEffect(() => {
    loadMenuItems();
  }, []);

  const filterItems = useCallback(() => {
    let filtered = menuItems;

    // Apply search query FIRST - search through ALL menu items, not just filtered ones
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = menuItems.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query)) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(query)) ||
          // Also search in dietary options
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

    // Apply active filters
    if (activeFilters.length > 0) {
      filtered = filtered.filter(item => {
        return activeFilters.every(filter => {
          switch (filter) {
            case 'dinner':
              return item.available_for_dinner;
            case 'lunch':
              return item.available_for_lunch;
            case 'gf':
              return item.is_gluten_free;
            case 'gfa':
              return item.is_gluten_free_available;
            case 'v':
              return item.is_vegetarian;
            case 'va':
              return item.is_vegetarian_available;
            case 'wine':
              return item.category === 'Wine';
            case 'libations':
              return item.category === 'Libations';
            case 'happyHour':
              return item.category === 'Happy Hour';
            case 'weeklySpecials':
              return item.category === 'Weekly Specials';
            default:
              return true;
          }
        });
      });
    } else if (!searchQuery.trim()) {
      // Only apply category/subcategory filters if no search query and no active filters
      // Filter by category
      if (selectedCategory === 'Weekly Specials') {
        filtered = filtered.filter(item => item.category === 'Weekly Specials');
      } else if (selectedCategory === 'Lunch') {
        filtered = filtered.filter(item => item.available_for_lunch);
      } else if (selectedCategory === 'Dinner') {
        filtered = filtered.filter(item => item.available_for_dinner);
      } else {
        // For other categories (Libations, Wine, Happy Hour), use the category field
        filtered = filtered.filter(item => item.category === selectedCategory);
      }

      // Filter by subcategory if selected and not "All"
      if (selectedSubcategory && selectedSubcategory !== 'All') {
        filtered = filtered.filter(item => item.subcategory === selectedSubcategory);
      }
    }

    setFilteredItems(filtered);
  }, [menuItems, searchQuery, selectedCategory, selectedSubcategory, activeFilters]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

  // Set the default subcategory when category changes
  useEffect(() => {
    if (SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0) {
      // Set to the first subcategory (which is now the proper starting one, not "All")
      setSelectedSubcategory(SUBCATEGORIES[selectedCategory][0]);
    } else {
      setSelectedSubcategory(null);
    }
  }, [selectedCategory]);

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      console.log('Loaded menu items for display:', data);
      setMenuItems(data || []);
    } catch (error) {
      console.error('Error loading menu items:', error);
    } finally {
      setLoading(false);
    }
  };

  const openImageModal = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageModalVisible(true);
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    setSelectedImage(null);
  };

  const openDetailModal = (item: MenuItem) => {
    setSelectedMenuItem(item);
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedMenuItem(null);
  };

  const openFilterModal = () => {
    setFilterModalVisible(true);
  };

  const closeFilterModal = () => {
    setFilterModalVisible(false);
  };

  const toggleFilter = (filterKey: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filterKey)) {
        return prev.filter(f => f !== filterKey);
      } else {
        return [...prev, filterKey];
      }
    });
  };

  const removeFilter = (filterKey: string) => {
    setActiveFilters(prev => prev.filter(f => f !== filterKey));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
  };

  const getFilterLabel = (filterKey: string) => {
    const option = FILTER_OPTIONS.find(opt => opt.key === filterKey);
    return option ? option.label : filterKey;
  };

  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      closeImageModal();
    }
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    // Add timestamp to force reload and bypass cache
    return `${url}?t=${Date.now()}`;
  };

  // Helper function to format price with $ sign
  const formatPrice = (price: string) => {
    // If price already has $, return as is
    if (price.includes('$')) {
      return price;
    }
    // Otherwise add $ at the beginning
    return `$${price}`;
  };

  // Helper function to build detailed description for modal
  const buildDetailedDescription = (item: MenuItem) => {
    let description = item.description || '';
    
    // Add dietary information
    const dietaryInfo = [];
    if (item.is_gluten_free) dietaryInfo.push('Gluten Free');
    if (item.is_gluten_free_available) dietaryInfo.push('Gluten Free Available');
    if (item.is_vegetarian) dietaryInfo.push('Vegetarian');
    if (item.is_vegetarian_available) dietaryInfo.push('Vegetarian Available');
    
    if (dietaryInfo.length > 0) {
      description += `\n\nDietary Options: ${dietaryInfo.join(', ')}`;
    }
    
    // Add availability information
    const availability = [];
    if (item.available_for_lunch) availability.push('Lunch');
    if (item.available_for_dinner) availability.push('Dinner');
    
    if (availability.length > 0) {
      description += `\n\nAvailable for: ${availability.join(', ')}`;
    }
    
    // Add category and subcategory
    if (item.category) {
      description += `\n\nCategory: ${item.category}`;
    }
    if (item.subcategory) {
      description += `\nSubcategory: ${item.subcategory}`;
    }
    
    return description;
  };

  const styles = createStyles(colors);

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
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
              style={styles.searchInput}
              placeholder="Search menu items..."
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
          <TouchableOpacity style={styles.filterButton} onPress={openFilterModal}>
            <IconSymbol
              ios_icon_name="line.3.horizontal.decrease.circle"
              android_material_icon_name="filter_list"
              size={20}
              color={colors.text}
            />
            <Text style={styles.filterButtonText}>Filter</Text>
            {activeFilters.length > 0 && (
              <View style={styles.filterBadge}>
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
                <View key={index} style={styles.activeFilterChip}>
                  <Text style={styles.activeFilterChipText}>{getFilterLabel(filter)}</Text>
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
              <TouchableOpacity style={styles.clearAllButton} onPress={clearAllFilters}>
                <Text style={styles.clearAllButtonText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Category Tabs - Only show if no active filters and no search query */}
        {activeFilters.length === 0 && !searchQuery.trim() && (
          <ScrollView
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
                  selectedCategory === category && styles.categoryTabActive,
                ]}
                onPress={() => {
                  setSelectedCategory(category);
                  // selectedSubcategory will be set by the useEffect
                }}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    selectedCategory === category && styles.categoryTabTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Subcategory Tabs - Only show if no active filters and no search query */}
        {activeFilters.length === 0 && !searchQuery.trim() && SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
          <ScrollView
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
                  selectedSubcategory === subcategory && styles.subcategoryTabActive,
                ]}
                onPress={() => setSelectedSubcategory(subcategory)}
              >
                <Text
                  style={[
                    styles.subcategoryTabText,
                    selectedSubcategory === subcategory && styles.subcategoryTabTextActive,
                  ]}
                >
                  {subcategory}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Menu Items */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant-menu"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyText}>No menu items found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery || activeFilters.length > 0
                ? 'Try adjusting your search or filters'
                : 'Check back later for updates'}
            </Text>
          </View>
        ) : (
          <View style={styles.menuItemsContainer}>
            {filteredItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItemCard}
                onPress={() => openDetailModal(item)}
                activeOpacity={0.7}
              >
                {/* Square Layout: Image on left, content on right */}
                {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      key={getImageUrl(item.thumbnail_url)}
                      source={{ uri: getImageUrl(item.thumbnail_url) }}
                      style={styles.squareImage}
                      onError={(error) => {
                        console.error('Image load error for item:', item.name, error.nativeEvent);
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully for item:', item.name);
                      }}
                    />
                    <View style={styles.squareContent}>
                      <View style={styles.squareHeader}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                      </View>
                      {(item.is_gluten_free ||
                        item.is_gluten_free_available ||
                        item.is_vegetarian ||
                        item.is_vegetarian_available) && (
                        <View style={styles.menuItemTags}>
                          {item.is_gluten_free && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>GF</Text>
                            </View>
                          )}
                          {item.is_gluten_free_available && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>GFA</Text>
                            </View>
                          )}
                          {item.is_vegetarian && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>V</Text>
                            </View>
                          )}
                          {item.is_vegetarian_available && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>VA</Text>
                            </View>
                          )}
                        </View>
                      )}
                      {item.description && (
                        <Text style={styles.squareDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  /* Banner Layout: Image on top, content below */
                  <>
                    {item.thumbnail_url && (
                      <Image
                        key={getImageUrl(item.thumbnail_url)}
                        source={{ uri: getImageUrl(item.thumbnail_url) }}
                        style={styles.bannerImage}
                        onError={(error) => {
                          console.error('Image load error for item:', item.name, error.nativeEvent);
                        }}
                        onLoad={() => {
                          console.log('Image loaded successfully for item:', item.name);
                        }}
                      />
                    )}
                    <View style={styles.menuItemContent}>
                      <View style={styles.menuItemHeader}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                      </View>
                      {item.description && (
                        <Text style={styles.menuItemDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                      {(item.is_gluten_free ||
                        item.is_gluten_free_available ||
                        item.is_vegetarian ||
                        item.is_vegetarian_available) && (
                        <View style={styles.menuItemTags}>
                          {item.is_gluten_free && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>GF</Text>
                            </View>
                          )}
                          {item.is_gluten_free_available && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>GFA</Text>
                            </View>
                          )}
                          {item.is_vegetarian && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>V</Text>
                            </View>
                          )}
                          {item.is_vegetarian_available && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>VA</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

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
          <View style={styles.filterModalContent}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter Menu Items</Text>
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
                    activeFilters.includes(option.key) && styles.filterOptionActive,
                  ]}
                  onPress={() => toggleFilter(option.key)}
                >
                  <View
                    style={[
                      styles.filterCheckbox,
                      activeFilters.includes(option.key) && styles.filterCheckboxActive,
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
                      activeFilters.includes(option.key) && styles.filterOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}

              {activeFilters.length > 0 && (
                <TouchableOpacity style={styles.clearFiltersButton} onPress={clearAllFilters}>
                  <Text style={styles.clearFiltersButtonText}>Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.applyFiltersButton} onPress={closeFilterModal}>
              <Text style={styles.applyFiltersButtonText}>
                Apply Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Modal (kept for backward compatibility if needed) */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity
              style={styles.imageModalCloseButton}
              onPress={closeImageModal}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={36}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            {selectedImage && (
              <Image
                source={{ uri: getImageUrl(selectedImage) }}
                style={styles.fullImage}
                resizeMode="contain"
                key={getImageUrl(selectedImage)}
              />
            )}
            <Text style={styles.swipeHint}>Swipe down to close</Text>
          </View>
        </PanGestureHandler>
      </Modal>

      {/* Content Detail Modal for Menu Items */}
      {selectedMenuItem && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={`${selectedMenuItem.name} - ${formatPrice(selectedMenuItem.price)}`}
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
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      paddingTop: 20,
      paddingBottom: 100,
    },
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
      color: colors.text,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
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
      color: colors.text,
    },
    filterBadge: {
      backgroundColor: colors.primary,
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
      backgroundColor: colors.highlight,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 6,
    },
    activeFilterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    clearAllButton: {
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearAllButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
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
      backgroundColor: colors.card,
      marginRight: 8,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    categoryTabActive: {
      backgroundColor: colors.primary,
    },
    categoryTabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    categoryTabTextActive: {
      color: '#FFFFFF',
    },
    subcategoryScroll: {
      maxHeight: 40,
      marginBottom: 16,
    },
    subcategoryScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    subcategoryTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: colors.card,
      marginRight: 8,
      boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
      elevation: 1,
    },
    subcategoryTabActive: {
      backgroundColor: colors.highlight,
    },
    subcategoryTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    subcategoryTabTextActive: {
      color: colors.text,
    },
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
      color: colors.text,
      marginTop: 16,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
    },
    menuItemsContainer: {
      paddingHorizontal: 16,
    },
    menuItemCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
      elevation: 3,
    },
    // Square layout styles (image on left, content on right)
    squareLayout: {
      flexDirection: 'row',
      padding: 12,
      gap: 12,
    },
    squareImage: {
      width: 100,
      height: 100,
      borderRadius: 12,
      resizeMode: 'cover',
    },
    squareContent: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    squareHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    squareDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 6,
      lineHeight: 18,
    },
    // Banner layout styles (image on top, content below)
    bannerImage: {
      width: '100%',
      height: 200,
      resizeMode: 'cover',
    },
    menuItemContent: {
      padding: 16,
    },
    menuItemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    menuItemName: {
      flex: 1,
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginRight: 12,
    },
    menuItemPrice: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    menuItemDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 20,
    },
    menuItemTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 6,
    },
    tag: {
      backgroundColor: colors.highlight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    tagText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
    },
    // Filter Modal Styles
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
      backgroundColor: colors.card,
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
      borderBottomColor: colors.border,
    },
    filterModalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
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
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 10,
      gap: 12,
    },
    filterOptionActive: {
      backgroundColor: colors.highlight,
    },
    filterCheckbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterCheckboxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterOptionText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    filterOptionTextActive: {
      fontWeight: '600',
    },
    clearFiltersButton: {
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearFiltersButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    applyFiltersButton: {
      backgroundColor: colors.primary,
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
    imageModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    imageModalCloseButton: {
      position: 'absolute',
      top: 60,
      right: 20,
      zIndex: 10,
    },
    fullImage: {
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height * 0.8,
    },
    swipeHint: {
      position: 'absolute',
      bottom: 40,
      fontSize: 14,
      color: '#FFFFFF',
      opacity: 0.7,
    },
  });
