
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface LibationRecipe {
  id: string;
  name: string;
  price: string;
  category: string;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const CATEGORIES = [
  'Featured',
  'Signature Cocktails',
  'Martinis',
  'Sangrias',
  'Low ABV',
  'No ABV',
];

// Placeholder image for recipes without thumbnails
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function LibationRecipesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<LibationRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [scrollY] = useState(new Animated.Value(0));
  
  // Use manager colors if user is a manager, otherwise use employee colors
  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      console.log('Loading libation recipes from table: libation_recipes');
      const { data, error } = await supabase
        .from('libation_recipes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading libation recipes:', error);
        throw error;
      }
      console.log('Loaded libation recipes:', data);
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading libation recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (recipe: LibationRecipe) => {
    setSelectedRecipe(recipe);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setTimeout(() => {
      setSelectedRecipe(null);
      scrollY.setValue(0);
    }, 300);
  };

  const handleBackPress = () => {
    router.back();
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    return `${url}?t=${Date.now()}`;
  };

  // Group recipes by category
  const recipesByCategory = CATEGORIES.reduce((acc, category) => {
    const categoryRecipes = recipes.filter(r => r.category === category);
    // Only include category if it has recipes (except for Featured which should only show if it has recipes)
    if (categoryRecipes.length > 0) {
      acc[category] = categoryRecipes;
    }
    return acc;
  }, {} as Record<string, LibationRecipe[]>);

  // Animated header opacity for parallax effect
  const imageOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0.3],
    extrapolate: 'clamp',
  });

  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Libation Recipes</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {Object.keys(recipesByCategory).length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>No recipes available</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Check back later for new libation recipes!
              </Text>
            </View>
          ) : (
            Object.entries(recipesByCategory).map(([category, categoryRecipes], categoryIndex) => (
              <React.Fragment key={categoryIndex}>
                {/* Category Header */}
                <Text style={[styles.categoryTitle, { color: colors.text }]}>{category}</Text>

                {/* Recipe Tiles in 2 columns */}
                <View style={styles.tilesContainer}>
                  {categoryRecipes.map((recipe, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.recipeTile}
                      onPress={() => openDetailModal(recipe)}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                        style={styles.tileImage}
                        resizeMode="cover"
                      />
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileName} numberOfLines={2}>
                          {recipe.name}
                        </Text>
                        <Text style={styles.tilePrice}>{recipe.price}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      {/* Detail Modal - Beautiful Styled Card */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeDetailModal}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeDetailModal}
          />
          <View style={styles.modalCard}>
            {/* Close Button */}
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={closeDetailModal}
              activeOpacity={0.7}
            >
              <View style={styles.closeButtonCircle}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={20}
                  color="#FFFFFF"
                />
              </View>
            </TouchableOpacity>

            <Animated.ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )}
            >
              {/* Floating Thumbnail Image with Parallax */}
              {selectedRecipe?.thumbnail_url && (
                <Animated.View 
                  style={[
                    styles.imageContainer,
                    {
                      opacity: imageOpacity,
                      transform: [{ translateY: imageTranslateY }],
                    }
                  ]}
                >
                  <Image
                    source={{ uri: getImageUrl(selectedRecipe.thumbnail_url) }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                  <View style={styles.imageGradient} />
                </Animated.View>
              )}

              {/* Content Card - Floats over image */}
              <View style={styles.contentCard}>
                {/* Recipe Name */}
                <Text style={styles.recipeTitleLarge}>{selectedRecipe?.name}</Text>

                {/* Information Section */}
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Price</Text>
                      <View style={styles.priceBadge}>
                        <Text style={styles.priceValue}>{selectedRecipe?.price}</Text>
                      </View>
                    </View>

                    {selectedRecipe?.category && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Category</Text>
                        <Text style={styles.infoValue}>{selectedRecipe.category}</Text>
                      </View>
                    )}
                  </View>

                  {selectedRecipe?.glassware && (
                    <View style={styles.infoRow}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Glassware</Text>
                        <Text style={styles.infoValue}>{selectedRecipe.glassware}</Text>
                      </View>
                    </View>
                  )}

                  {selectedRecipe?.garnish && (
                    <View style={styles.infoRow}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Garnish</Text>
                        <Text style={styles.infoValue}>{selectedRecipe.garnish}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Separator */}
                <View style={styles.separator} />

                {/* Ingredients Section */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <IconSymbol
                      ios_icon_name="list.bullet"
                      android_material_icon_name="format-list-bulleted"
                      size={24}
                      color="#2C3E50"
                    />
                    <Text style={styles.sectionTitle}>Ingredients</Text>
                  </View>
                  {selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0 ? (
                    <View style={styles.ingredientsList}>
                      {selectedRecipe.ingredients.map((item, index) => (
                        <View key={index} style={styles.ingredientRow}>
                          <View style={styles.ingredientBullet} />
                          <Text style={styles.ingredientAmount}>{item.amount}</Text>
                          <Text style={styles.ingredientName}>{item.ingredient}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noDataText}>No ingredients listed</Text>
                  )}
                </View>

                {/* Separator */}
                <View style={styles.separator} />

                {/* Procedure Section */}
                {selectedRecipe?.procedure && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <IconSymbol
                        ios_icon_name="doc.text"
                        android_material_icon_name="description"
                        size={24}
                        color="#2C3E50"
                      />
                      <Text style={styles.sectionTitle}>Procedure</Text>
                    </View>
                    <Text style={styles.procedureText}>{selectedRecipe.procedure}</Text>
                  </View>
                )}

                {/* Bottom Padding for safe scrolling */}
                <View style={styles.bottomPadding} />
              </View>
            </Animated.ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  categoryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  tilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  recipeTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  tileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tilePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalCard: {
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
    overflow: 'hidden',
    boxShadow: '0px -4px 24px rgba(0, 0, 0, 0.5)',
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 100,
  },
  closeButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 5,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 60,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    background: 'linear-gradient(to bottom, transparent, rgba(248, 249, 250, 0.9))',
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: 28,
    paddingHorizontal: 24,
    boxShadow: '0px -2px 16px rgba(0, 0, 0, 0.1)',
    elevation: 8,
  },
  recipeTitleLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 24,
    lineHeight: 38,
  },
  infoSection: {
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 16,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F8C8D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2C3E50',
  },
  priceBadge: {
    backgroundColor: '#27AE60',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#E8EAED',
    marginVertical: 24,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  ingredientsList: {
    gap: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    gap: 12,
  },
  ingredientBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3498DB',
  },
  ingredientAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
    minWidth: 80,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#34495E',
    flex: 1,
  },
  noDataText: {
    fontSize: 15,
    color: '#95A5A6',
    fontStyle: 'italic',
  },
  procedureText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#34495E',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
  },
  bottomPadding: {
    height: 40,
  },
});
