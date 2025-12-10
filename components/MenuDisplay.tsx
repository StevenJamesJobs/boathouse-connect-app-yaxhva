
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
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';

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

  useEffect(() => {
    loadMenuItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [menuItems, selectedCategory, selectedSubcategory]);

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

    setFilteredItems(filtered);
  };

  const openImageModal = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageModalVisible(true);
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    setSelectedImage(null);
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

  const styles = createStyles(colors);

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Category Tabs */}
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

        {/* Subcategory Tabs */}
        {SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
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
              android_material_icon_name="restaurant_menu"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyText}>No menu items available</Text>
            <Text style={styles.emptySubtext}>
              Check back later for updates
            </Text>
          </View>
        ) : (
          <View style={styles.menuItemsContainer}>
            {filteredItems.map((item, index) => (
              <View key={index} style={styles.menuItemCard}>
                {/* Square Layout: Image on left, content on right */}
                {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <TouchableOpacity onPress={() => openImageModal(item.thumbnail_url!)}>
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
                    </TouchableOpacity>
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
                        <Text style={styles.squareDescription}>
                          {item.description}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  /* Banner Layout: Image on top, content below */
                  <>
                    {item.thumbnail_url && (
                      <TouchableOpacity onPress={() => openImageModal(item.thumbnail_url!)}>
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
                      </TouchableOpacity>
                    )}
                    <View style={styles.menuItemContent}>
                      <View style={styles.menuItemHeader}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                      </View>
                      {item.description && (
                        <Text style={styles.menuItemDescription}>
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
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Image Modal */}
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
