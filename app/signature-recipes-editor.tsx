
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { managerColors } from '@/styles/commonStyles';

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

const SUBCATEGORIES = [
  'All',
  'Signature Cocktails',
  'Seasonal Specials',
  'Classic Cocktails',
  'Mocktails',
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: managerColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  filterButtonActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  filterButtonText: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: managerColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  searchInput: {
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  recipeList: {
    padding: 20,
  },
  recipeCard: {
    backgroundColor: managerColors.surface,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
    flexDirection: 'row',
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: managerColors.background,
    marginRight: 15,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 5,
  },
  recipeDetails: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 3,
  },
  recipeActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  editButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: managerColors.surface,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  closeButton: {
    padding: 5,
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 5,
  },
  input: {
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  pickerButtonText: {
    fontSize: 16,
    color: managerColors.text,
  },
  imagePickerButton: {
    backgroundColor: managerColors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  imagePickerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  ingredientsContainer: {
    marginBottom: 15,
  },
  ingredientRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
  },
  ingredientInput: {
    flex: 1,
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
    marginRight: 10,
  },
  removeIngredientButton: {
    backgroundColor: '#DC2626',
    padding: 8,
    borderRadius: 6,
  },
  addIngredientButton: {
    backgroundColor: managerColors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  addIngredientButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: managerColors.accent,
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    textAlign: 'center',
  },
});

export default function SignatureRecipesEditorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('Signature Cocktails');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ingredient: '', amount: '' }]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Ensure ingredients is always an array
      const recipesWithIngredients = (data || []).map(recipe => ({
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      }));

      setRecipes(recipesWithIngredients);
      setFilteredRecipes(recipesWithIngredients);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load signature recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  const filterRecipes = useCallback(() => {
    let filtered = recipes;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(recipe => recipe.subcategory === selectedCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter(recipe =>
        recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredRecipes(filtered);
  }, [recipes, selectedCategory, searchQuery]);

  useEffect(() => {
    filterRecipes();
  }, [filterRecipes]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setThumbnailUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      
      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const byteArray = decode(base64);
      
      // Generate unique filename
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `signature-recipes/${fileName}`;

      // Upload to Supabase storage - using 'cocktail-images' bucket which exists
      const { data, error } = await supabase.storage
        .from('cocktail-images')
        .upload(filePath, byteArray, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('cocktail-images')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // Helper function to decode base64 to Uint8Array
  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: 'ingredient' | 'amount', value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setLoading(true);

      // Upload image if new one selected
      let thumbnailUrl = editingRecipe?.thumbnail_url || null;
      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        const uploadedUrl = await uploadImage(thumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      }

      // Filter out empty ingredients
      const validIngredients = ingredients.filter(
        ing => ing.ingredient.trim() && ing.amount.trim()
      );

      if (editingRecipe) {
        // Update existing recipe using RPC function
        const { error } = await supabase.rpc('update_signature_recipe', {
          p_user_id: user.id,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_price: price.trim(),
          p_subcategory: subcategory,
          p_glassware: glassware.trim() || null,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: parseInt(displayOrder) || 0,
        });

        if (error) {
          console.error('RPC error:', error);
          throw error;
        }

        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        // Insert new recipe using RPC function
        const { error } = await supabase.rpc('create_signature_recipe', {
          p_user_id: user.id,
          p_name: name.trim(),
          p_price: price.trim(),
          p_subcategory: subcategory,
          p_glassware: glassware.trim() || null,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: parseInt(displayOrder) || 0,
        });

        if (error) {
          console.error('RPC error:', error);
          throw error;
        }

        Alert.alert('Success', 'Recipe created successfully');
      }

      closeModal();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipe: SignatureRecipe) => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('delete_signature_recipe', {
                p_user_id: user.id,
                p_recipe_id: recipe.id,
              });

              if (error) throw error;

              Alert.alert('Success', 'Recipe deleted successfully');
              loadRecipes();
            } catch (error: any) {
              console.error('Error deleting recipe:', error);
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setSubcategory(recipe.subcategory || 'Signature Cocktails');
    setGlassware(recipe.glassware || '');
    setIngredients(
      Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ ingredient: '', amount: '' }]
    );
    setProcedure(recipe.procedure || '');
    setThumbnailUri(recipe.thumbnail_url);
    setDisplayOrder(recipe.display_order.toString());
    setIsActive(recipe.is_active);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingRecipe(null);
    setName('');
    setPrice('');
    setSubcategory('Signature Cocktails');
    setGlassware('');
    setIngredients([{ ingredient: '', amount: '' }]);
    setProcedure('');
    setThumbnailUri(null);
    setDisplayOrder('0');
    setIsActive(true);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${url}`;
  };

  const formatPrice = (price: string): string => {
    const num = parseFloat(price);
    return isNaN(num) ? price : `$${num.toFixed(2)}`;
  };

  if (loading && recipes.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={managerColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol name="plus" size={24} color={managerColors.text} />
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {SUBCATEGORIES.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.filterButton,
              selectedCategory === category && styles.filterButtonActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.filterButtonText,
                selectedCategory === category && styles.filterButtonTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={managerColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Recipe List */}
      <ScrollView style={styles.recipeList}>
        {filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No recipes found</Text>
          </View>
        ) : (
          filteredRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <View style={styles.thumbnailContainer}>
                {recipe.thumbnail_url ? (
                  <Image
                    source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumbnail, { backgroundColor: managerColors.background }]} />
                )}
              </View>
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipeDetails}>{formatPrice(recipe.price)}</Text>
                {recipe.subcategory && (
                  <Text style={styles.recipeDetails}>{recipe.subcategory}</Text>
                )}
                {recipe.glassware && (
                  <Text style={styles.recipeDetails}>Glass: {recipe.glassware}</Text>
                )}
                <View style={styles.recipeActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(recipe)}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(recipe)}
                  >
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <IconSymbol name="xmark" size={24} color={managerColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Image Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={styles.imagePickerButtonText}>
                    {uploadingImage ? 'Uploading...' : 'Select Image'}
                  </Text>
                </TouchableOpacity>
                {thumbnailUri && (
                  <Image
                    source={{ uri: thumbnailUri }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Recipe Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter recipe name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Price */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Subcategory */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {SUBCATEGORIES.filter(cat => cat !== 'All').map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.filterButton,
                        subcategory === cat && styles.filterButtonActive,
                      ]}
                      onPress={() => setSubcategory(cat)}
                    >
                      <Text
                        style={[
                          styles.filterButtonText,
                          subcategory === cat && styles.filterButtonTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Glassware */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Glassware</Text>
                <TextInput
                  style={styles.input}
                  value={glassware}
                  onChangeText={setGlassware}
                  placeholder="e.g., Martini Glass, Rocks Glass"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.ingredientsContainer}>
                <Text style={styles.label}>Ingredients</Text>
                {ingredients.map((ing, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <TextInput
                      style={[styles.ingredientInput, { flex: 2 }]}
                      value={ing.ingredient}
                      onChangeText={(text) => updateIngredient(index, 'ingredient', text)}
                      placeholder="Ingredient"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    <TextInput
                      style={[styles.ingredientInput, { flex: 1 }]}
                      value={ing.amount}
                      onChangeText={(text) => updateIngredient(index, 'amount', text)}
                      placeholder="Amount"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeIngredientButton}
                        onPress={() => removeIngredient(index)}
                      >
                        <IconSymbol name="minus" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                  <Text style={styles.addIngredientButtonText}>Add Ingredient</Text>
                </TouchableOpacity>
              </View>

              {/* Procedure */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Procedure</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder="Enter preparation instructions"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                />
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  placeholder="0"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>

              {/* Active Status */}
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={[
                    styles.filterButton,
                    isActive && styles.filterButtonActive,
                  ]}
                  onPress={() => setIsActive(!isActive)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      isActive && styles.filterButtonTextActive,
                    ]}
                  >
                    {isActive ? 'Active' : 'Inactive'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={loading || uploadingImage}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingRecipe ? 'Update Recipe' : 'Create Recipe'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
