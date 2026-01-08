
import React, { useState, useEffect } from 'react';
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
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Ingredient {
  ingredient: string;
  amount: string;
}

interface SignatureRecipe {
  id: string;
  name: string;
  price: string;
  subcategory: string | null;
  glassware: string | null;
  ingredients: Ingredient[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const SUBCATEGORIES = ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'];
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function SignatureRecipesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<SignatureRecipe | null>(null);
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
      const { data, error } = await supabase
        .from('signature-recipes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading signature recipes:', error);
        throw error;
      }
      
      console.log('Loaded signature recipes:', data);
      
      // Parse ingredients safely
      const parsedRecipes = (data || []).map(recipe => {
        let ingredients: Ingredient[] = [];
        
        try {
          // If ingredients is already an array, use it
          if (Array.isArray(recipe.ingredients)) {
            ingredients = recipe.ingredients;
          } 
          // If it's a string, try to parse it
          else if (typeof recipe.ingredients === 'string') {
            const parsed = JSON.parse(recipe.ingredients);
            ingredients = Array.isArray(parsed) ? parsed : [];
          }
          // If it's an object (JSONB), convert to array
          else if (recipe.ingredients && typeof recipe.ingredients === 'object') {
            ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
          }
        } catch (e) {
          console.error('Error parsing ingredients for recipe:', recipe.name, e);
          console.error('Raw ingredients value:', recipe.ingredients);
          ingredients = [];
        }
        
        return {
          ...recipe,
          ingredients,
          procedure: recipe.procedure || '',
          glassware: recipe.glassware || null,
        };
      });
      
      setRecipes(parsedRecipes);
    } catch (error) {
      console.error('Error loading signature recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (recipe: SignatureRecipe) => {
    console.log('Opening detail modal for recipe:', recipe.name);
    console.log('Recipe ingredients:', recipe.ingredients);
    setSelectedRecipe(recipe);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedRecipe(null);
    scrollY.setValue(0);
  };

  const handleBackPress = () => {
    router.back();
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    return `${url}?t=${Date.now()}`;
  };

  // Helper function to format price with $ sign
  const formatPrice = (price: string) => {
    if (!price) return '$0.00';
    if (price.includes('$')) {
      return price;
    }
    return `$${price}`;
  };

  // Group recipes by subcategory
  const groupedRecipes = SUBCATEGORIES.map(category => ({
    category,
    recipes: recipes.filter(recipe => recipe.subcategory === category),
  })).filter(group => group.recipes.length > 0);

  // Animated image opacity based on scroll
  const imageOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0],
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Signature Recipes</Text>
        <View style={styles.backButton} />
      </View>

      {/* Recipes Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.recipesList} contentContainerStyle={styles.recipesListContent}>
          {groupedRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>No recipes available</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Check back later for signature cocktail recipes
              </Text>
            </View>
          ) : (
            groupedRecipes.map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                {/* Category Header */}
                <Text style={[styles.categoryHeader, { color: colors.text }]}>{group.category}</Text>

                {/* 2-Column Grid for this category */}
                <View style={styles.recipesGrid}>
                  {group.recipes.map((recipe, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.recipeCard, { backgroundColor: colors.card }]}
                      onPress={() => openDetailModal(recipe)}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                        style={styles.recipeImage}
                        resizeMode="cover"
                      />
                      <View style={styles.recipeOverlay}>
                        <Text style={styles.recipeName} numberOfLines={2}>
                          {recipe.name}
                        </Text>
                        <Text style={[styles.recipePrice, { color: user?.role === 'manager' ? managerColors.highlight : employeeColors.highlight }]}>{formatPrice(recipe.price)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      {/* Detail Modal with Smooth Scrolling */}
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
          <View style={styles.modalContent}>
            {/* Fixed Image Background */}
            <Animated.View
              style={[
                styles.modalImageContainer,
                {
                  opacity: imageOpacity,
                  transform: [{ translateY: imageTranslateY }],
                },
              ]}
            >
              <Image
                source={{ uri: getImageUrl(selectedRecipe?.thumbnail_url || null) }}
                style={styles.modalImage}
                resizeMode="cover"
              />
              <View style={styles.imageGradient} />
            </Animated.View>

            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={closeDetailModal}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={32}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            {/* Scrollable Content */}
            <Animated.ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )}
            >
              {/* Spacer for image */}
              <View style={styles.imageSpacer} />

              {/* Content Card that slides over image */}
              <View style={styles.contentCard}>
                {/* Name, Price, and Glassware */}
                <View style={styles.detailSection}>
                  <Text style={styles.modalRecipeName}>{selectedRecipe?.name}</Text>
                  <View style={styles.priceGlasswareRow}>
                    <Text style={[styles.modalPrice, { color: colors.primary }]}>{formatPrice(selectedRecipe?.price || '')}</Text>
                    {selectedRecipe?.glassware && (
                      <View style={styles.glasswareBadge}>
                        <IconSymbol
                          ios_icon_name="wineglass"
                          android_material_icon_name="local-bar"
                          size={16}
                          color="#666666"
                        />
                        <Text style={styles.glasswareText}>{selectedRecipe.glassware}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Ingredients Section */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Ingredients</Text>
                  <View style={styles.ingredientsList}>
                    {selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0 ? (
                      selectedRecipe.ingredients.map((item, index) => (
                        <View key={index} style={styles.ingredientItem}>
                          <View style={[styles.ingredientBullet, { backgroundColor: colors.primary }]} />
                          <Text style={[styles.ingredientAmount, { color: colors.primary }]}>{item.amount || 'N/A'}</Text>
                          <Text style={styles.ingredientName}>{item.ingredient || 'Unknown ingredient'}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.detailText}>No ingredients listed</Text>
                    )}
                  </View>
                </View>

                {/* Separator between Ingredients and Procedure */}
                <View style={styles.sectionSeparator} />

                {/* Procedure Section */}
                <View style={styles.detailSection}>
                  <Text style={styles.procedureLabel}>Procedure</Text>
                  <Text style={styles.procedureText}>{selectedRecipe?.procedure || 'No procedure listed'}</Text>
                </View>

                {/* Extra padding at bottom for iOS/Android */}
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
  recipesList: {
    flex: 1,
  },
  recipesListContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
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
  categoryHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  recipesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  recipeCard: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: 140,
  },
  recipeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 10,
  },
  recipeName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: 'transparent',
    height: '95%',
    marginTop: 'auto',
    position: 'relative',
  },
  modalImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 1,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.3))',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 4,
  },
  modalScroll: {
    flex: 1,
    zIndex: 2,
  },
  modalScrollContent: {
    paddingBottom: 60,
  },
  imageSpacer: {
    height: 220,
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    minHeight: '100%',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.2)',
    elevation: 10,
  },
  detailSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalRecipeName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  priceGlasswareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalPrice: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  glasswareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  glasswareText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  detailLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  ingredientsList: {
    gap: 8,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ingredientBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ingredientAmount: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 60,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
  },
  sectionSeparator: {
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 1,
  },
  procedureLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#C44536',
    marginBottom: 12,
  },
  procedureText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
    whiteSpace: 'pre-line',
  },
  detailText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
    whiteSpace: 'pre-line',
  },
  bottomPadding: {
    height: 40,
  },
});
