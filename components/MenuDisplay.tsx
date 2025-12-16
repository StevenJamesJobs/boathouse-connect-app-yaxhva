
import React, { useState, useEffect } from 'react';
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

// Filter options for the search
const FILTER_OPTIONS = [
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'GF', value: 'gf' },
  { label: 'GFA', value: 'gfa' },
  { label: 'V', value: 'v' },
  { label: 'VA', value: 'va' },
  { label: 'Wine', value: 'wine' },
  { label: 'Libations', value: 'libations' },
  { label: 'Happy Hour', value: 'happy_hour' },
  { label: 'Weekly Specials', value: 'weekly_specials' },
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Weekly Specials');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    loadMenuItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [menuItems, selectedCategory, selectedSubcategory, searchQuery, selectedFilters]);

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

  const filterItems = () => {
    let filtered = menuItems;

    // If searching, apply search and filter logic
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      
      filtered = filtered.filter(item => {
        // Search by name
        const nameMatch = item.name.toLowerCase().includes(query);
        
        // Search by description
        const descriptionMatch = item.description?.toLowerCase().includes(query) || false;
        
        // Search by category
        const categoryMatch = item.category.toLowerCase().includes(query);
        
        // Search by subcategory
        const subcategoryMatch = item.subcategory?.toLowerCase().includes(query) || false;
        
        // Search by dietary tags
        const dietaryMatch = 
          (query.includes('gf') && (item.is_gluten_free || item.is_gluten_free_available)) ||
          (query.includes('gluten') && (item.is_gluten_free || item.is_gluten_free_available)) ||
          (query.includes('v') && (item.is_vegetarian || item.is_vegetarian_available)) ||
          (query.includes('veg') && (item.is_vegetarian || item.is_vegetarian_available));
        
        return nameMatch || descriptionMatch || categoryMatch || subcategoryMatch || dietaryMatch;
      });

      // Apply selected filters (multiple filters)
      if (selectedFilters.length > 0) {
        filtered = applyMultipleFilters(filtered, selectedFilters);
      }
    } else {
      // Normal category/subcategory filtering when not searching
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
  };

  const applyMultipleFilters = (items: MenuItem[], filters: string[]) => {
    // Apply all filters - item must match ALL selected filters
    return items.filter(item => {
      return filters.every(filter => {
        switch (filter) {
          case 'lunch':
            return item.available_for_lunch;
          case 'dinner':
            return item.available_for_dinner;
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
          case 'happy_hour':
            return item.category === 'Happy Hour';
          case 'weekly_specials':
            return item.category === 'Weekly Specials';
          default:
            return true;
        }
      });
    });
  };

  const toggleFilter = (filterValue: string) => {
    setSelectedFilters(prev => {
      if (prev.includes(filterValue)) {
        // Remove filter if already selected
        return prev.filter(f => f !== filterValue);
      } else {
        // Add filter if not selected
        return [...prev, filterValue];
      }
    });
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
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
        {/* Search Box with Filter Button */}
        <View style={styles.searchSection}>
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <IconSymbol
              ios_icon_name="magnifyingglass"
              android_material_icon_name="search"
              size={20}
              color={colors.textSecondary}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
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
            <TouchableOpacity 
              style={[styles.filterButton, { backgroundColor: selectedFilters.length > 0 ? colors.primary : colors.highlight }]}
              onPress={() => setShowFilterModal(true)}
            >
              <IconSymbol
                ios_icon_name="line.3.horizontal.decrease.circle"
                android_material_icon_name="filter_list"
                size={20}
                color={selectedFilters.length > 0 ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.filterButtonText, { color: selectedFilters.length > 0 ? '#FFFFFF' : colors.text }]}>
                Filter
              </Text>
              {selectedFilters.length > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{selectedFilters.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Active Filters Display */}
          {selectedFilters.length > 0 && (
            <View style={styles.activeFiltersContainer}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.activeFiltersScroll}
              >
                {selectedFilters.map((filterValue, index) => {
                  const filterOption = FILTER_OPTIONS.find(f => f.value === filterValue);
                  return (
                    <View key={index} style={[styles.activeFilterChip, { backgroundColor: colors.primary }]}>
                      <Text style={styles.activeFilterChipText}>{filterOption?.label}</Text>
                      <TouchableOpacity onPress={() => toggleFilter(filterValue)}>
                        <IconSymbol
                          ios_icon_name="xmark.circle.fill"
                          android_material_icon_name="cancel"
                          size={16}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <TouchableOpacity 
                  style={[styles.clearAllButton, { backgroundColor: colors.highlight }]}
                  onPress={clearAllFilters}
                >
                  <Text style={[styles.clearAllButtonText, { color: colors.text }]}>Clear All</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {/* Search Results Header */}
          {searchQuery.trim() && (
            <View style={styles.searchResultsHeader}>
              <Text style={[styles.searchResultsText, { color: colors.text }]}>
                Search Results ({filteredItems.length})
              </Text>
            </View>
          )}
        </View>

        {/* Category Tabs - Only show when not searching */}
        {!searchQuery.trim() && (
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

        {/* Subcategory Tabs - Only show when not searching */}
        {!searchQuery.trim() && SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
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
              ios_icon_name={searchQuery.trim() ? "magnifyingglass" : "fork.knife"}
              android_material_icon_name={searchQuery.trim() ? "search" : "restaurant_menu"}
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No results found' : 'No menu items available'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery.trim() ? 'Try different keywords or filters' : 'Check back later for updates'}
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

      {/* Filter Modal - REDESIGNED WITH LARGER SIZE AND NO CHECKBOXES */}
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.filterModalOverlay}>
          <View style={[styles.filterModalContent, { backgroundColor: colors.card }]}>
            {/* Modal Header */}
            <View style={styles.filterModalHeader}>
              <Text style={[styles.filterModalTitle, { color: colors.text }]}>Filter Options</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Filter Options Grid - NO CHECKBOXES, JUST COLOR HIGHLIGHTING */}
            <ScrollView style={styles.filterModalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.filterOptionsGrid}>
                {FILTER_OPTIONS.map((option, index) => {
                  const isSelected = selectedFilters.includes(option.value);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.filterOptionBox,
                        { 
                          backgroundColor: isSelected ? colors.primary : colors.highlight,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => toggleFilter(option.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterOptionBoxText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={[styles.clearFiltersButton, { backgroundColor: colors.highlight }]}
                onPress={clearAllFilters}
              >
                <Text style={[styles.clearFiltersButtonText, { color: colors.text }]}>
                  Clear All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyFiltersButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.applyFiltersButtonText}>
                  Apply {selectedFilters.length > 0 ? `(${selectedFilters.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
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
    searchSection: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      gap: 10,
      boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.15)',
      elevation: 4,
      borderWidth: 2,
      borderColor: 'rgba(52, 152, 219, 0.2)',
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      padding: 0,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
    },
    filterButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    filterBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      borderRadius: 10,
      width: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: 'bold',
    },
    activeFiltersContainer: {
      marginTop: 12,
    },
    activeFiltersScroll: {
      gap: 8,
      paddingHorizontal: 4,
    },
    activeFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
    },
    activeFilterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    clearAllButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clearAllButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
    searchResultsHeader: {
      marginTop: 12,
      paddingHorizontal: 4,
    },
    searchResultsText: {
      fontSize: 16,
      fontWeight: '600',
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
      fontSize: 13,
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
    // Filter Modal Styles - REDESIGNED FOR LARGER SIZE
    filterModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    filterModalContent: {
      width: '95%',
      maxWidth: 500,
      maxHeight: '80%',
      borderRadius: 24,
      overflow: 'hidden',
      boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.4)',
      elevation: 15,
    },
    filterModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterModalTitle: {
      fontSize: 22,
      fontWeight: 'bold',
    },
    filterModalScroll: {
      flex: 1,
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    filterOptionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
      paddingBottom: 10,
    },
    filterOptionBox: {
      width: '47%',
      paddingVertical: 18,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 2,
      boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.12)',
      elevation: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterOptionBoxText: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    filterModalFooter: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 24,
      paddingVertical: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    clearFiltersButton: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clearFiltersButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    applyFiltersButton: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    applyFiltersButtonText: {
      fontSize: 16,
      fontWeight: '600',
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
