
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface SignatureRecipe {
  id: string;
  name: string;
  description: string | null;
  price: string;
  subcategory: string | null;
  ingredients: string;
  procedure: string;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const SUBCATEGORIES = ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'];

export default function SignatureRecipesScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SignatureRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  useEffect(() => {
    filterRecipes();
  }, [recipes, searchQuery, selectedSubcategory]);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      console.log('Loaded signature recipes:', data);
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading signature recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRecipes = () => {
    let filtered = recipes;

    // Filter by subcategory
    if (selectedSubcategory) {
      filtered = filtered.filter(recipe => recipe.subcategory === selectedSubcategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        recipe =>
          recipe.name.toLowerCase().includes(query) ||
          (recipe.description && recipe.description.toLowerCase().includes(query)) ||
          recipe.ingredients.toLowerCase().includes(query)
      );
    }

    setFilteredRecipes(filtered);
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
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  // Helper function to format price with $ sign
  const formatPrice = (price: string) => {
    if (price.includes('$')) {
      return price;
    }
    return `$${price}`;
  };

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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={employeeColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={employeeColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={employeeColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Subcategory Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subcategoryScroll}
        contentContainerStyle={styles.subcategoryScrollContent}
      >
        <TouchableOpacity
          style={[
            styles.subcategoryTab,
            selectedSubcategory === null && styles.subcategoryTabActive,
          ]}
          onPress={() => setSelectedSubcategory(null)}
        >
          <Text
            style={[
              styles.subcategoryTabText,
              selectedSubcategory === null && styles.subcategoryTabTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {SUBCATEGORIES.map((subcategory, index) => (
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

      {/* Recipes Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={employeeColors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.recipesList} contentContainerStyle={styles.recipesListContent}>
          {filteredRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={employeeColors.textSecondary}
              />
              <Text style={styles.emptyText}>No recipes found</Text>
              <Text style={styles.emptySubtext}>
                Try adjusting your search or filter
              </Text>
            </View>
          ) : (
            <View style={styles.recipesGrid}>
              {filteredRecipes.map((recipe, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.recipeCard}
                  onPress={() => openDetailModal(recipe)}
                >
                  {recipe.thumbnail_url ? (
                    <Image
                      source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                      style={styles.recipeImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.recipePlaceholder}>
                      <IconSymbol
                        ios_icon_name="wineglass"
                        android_material_icon_name="local-bar"
                        size={48}
                        color={employeeColors.textSecondary}
                      />
                    </View>
                  )}
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeName} numberOfLines={2}>
                      {recipe.name}
                    </Text>
                    {recipe.subcategory && (
                      <View style={styles.subcategoryBadge}>
                        <Text style={styles.subcategoryBadgeText}>{recipe.subcategory}</Text>
                      </View>
                    )}
                    <Text style={styles.recipePrice}>{formatPrice(recipe.price)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
              {selectedRecipe?.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(selectedRecipe.thumbnail_url) }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
              )}

              <View style={styles.detailSection}>
                <View style={styles.detailHeader}>
                  {selectedRecipe?.subcategory && (
                    <View style={styles.modalSubcategoryBadge}>
                      <Text style={styles.modalSubcategoryText}>{selectedRecipe.subcategory}</Text>
                    </View>
                  )}
                  <Text style={styles.modalPrice}>{formatPrice(selectedRecipe?.price || '')}</Text>
                </View>
                {selectedRecipe?.description && (
                  <Text style={styles.modalDescription}>{selectedRecipe.description}</Text>
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Ingredients</Text>
                <Text style={styles.detailText}>{selectedRecipe?.ingredients}</Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Procedure</Text>
                <Text style={styles.detailText}>{selectedRecipe?.procedure}</Text>
              </View>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: employeeColors.text,
  },
  subcategoryScroll: {
    marginTop: 12,
    maxHeight: 50,
  },
  subcategoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subcategoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: employeeColors.card,
    marginRight: 8,
  },
  subcategoryTabActive: {
    backgroundColor: employeeColors.primary,
  },
  subcategoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  subcategoryTabTextActive: {
    color: employeeColors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipesList: {
    flex: 1,
    marginTop: 16,
  },
  recipesListContent: {
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
    color: employeeColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  recipesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  recipeCard: {
    width: '48%',
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  recipeImage: {
    width: '100%',
    height: 150,
  },
  recipePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: employeeColors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 8,
    minHeight: 40,
  },
  subcategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: employeeColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  subcategoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: employeeColors.text,
  },
  recipePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.primary,
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
    padding: 20,
    paddingBottom: 40,
  },
  modalImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    marginBottom: 24,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSubcategoryBadge: {
    backgroundColor: employeeColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modalSubcategoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: employeeColors.text,
  },
  modalPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.primary,
  },
  modalDescription: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
    whiteSpace: 'pre-line',
  },
});
