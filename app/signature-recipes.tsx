
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

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
  procedure: string;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const SUBCATEGORIES = ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'];
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function SignatureRecipesScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<SignatureRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      console.log('Loaded signature recipes:', data);
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading signature recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (recipe: SignatureRecipe) => {
    setSelectedRecipe(recipe);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedRecipe(null);
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={employeeColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes</Text>
        <View style={styles.backButton} />
      </View>

      {/* Recipes Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={employeeColors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.recipesList} contentContainerStyle={styles.recipesListContent}>
          {groupedRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={employeeColors.textSecondary}
              />
              <Text style={styles.emptyText}>No recipes available</Text>
              <Text style={styles.emptySubtext}>
                Check back later for signature cocktail recipes
              </Text>
            </View>
          ) : (
            groupedRecipes.map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                {/* Category Header */}
                <Text style={styles.categoryHeader}>{group.category}</Text>

                {/* 2-Column Grid for this category */}
                <View style={styles.recipesGrid}>
                  {group.recipes.map((recipe, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.recipeCard}
                      onPress={() => openDetailModal(recipe)}
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
                        <Text style={styles.recipePrice}>{formatPrice(recipe.price)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      {/* Detail Modal */}
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
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedRecipe?.name}</Text>
              <TouchableOpacity onPress={closeDetailModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color="#666666"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {/* Thumbnail Image */}
              <Image
                source={{ uri: getImageUrl(selectedRecipe?.thumbnail_url || null) }}
                style={styles.modalImage}
                resizeMode="cover"
              />

              {/* Name, Price, and Glassware */}
              <View style={styles.detailSection}>
                <Text style={styles.modalRecipeName}>{selectedRecipe?.name}</Text>
                <View style={styles.priceGlasswareRow}>
                  <Text style={styles.modalPrice}>{formatPrice(selectedRecipe?.price || '')}</Text>
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
                        <View style={styles.ingredientBullet} />
                        <View style={styles.ingredientContent}>
                          <Text style={styles.ingredientAmount}>{item.amount}</Text>
                          <Text style={styles.ingredientName}>{item.ingredient}</Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detailText}>No ingredients listed</Text>
                  )}
                </View>
              </View>

              {/* Procedure Section */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Procedure</Text>
                <Text style={styles.detailText}>{selectedRecipe?.procedure || 'No procedure listed'}</Text>
              </View>

              {/* Extra padding at bottom for iOS/Android */}
              <View style={styles.bottomPadding} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    backgroundColor: employeeColors.card,
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
    color: employeeColors.text,
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
    color: employeeColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  categoryHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 16,
    marginTop: 8,
  },
  recipesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  recipeCard: {
    width: '48%',
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: 180,
  },
  recipeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.highlight,
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    flex: 1,
    paddingRight: 12,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 60,
  },
  modalImage: {
    width: '100%',
    height: 280,
  },
  detailSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
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
    color: employeeColors.primary,
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
    gap: 10,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ingredientBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: employeeColors.primary,
    marginTop: 8,
  },
  ingredientContent: {
    flex: 1,
  },
  ingredientAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: employeeColors.primary,
    marginBottom: 2,
  },
  ingredientName: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
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
