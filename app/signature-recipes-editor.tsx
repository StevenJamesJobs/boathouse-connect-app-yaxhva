
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
  'Zero ABV',
  'Low ABV',
  'Martinis',
  'Sangria',
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    backgroundColor: managerColors.primary,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
  },
  searchContainer: {
    padding: 15,
    backgroundColor: managerColors.background,
  },
  searchInput: {
    backgroundColor: managerColors.card,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: managerColors.background,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 10,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  categoryButtonText: {
    fontSize: 14,
    color: managerColors.text,
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: managerColors.primary,
    margin: 15,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  recipeCard: {
    backgroundColor: managerColors.card,
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 15,
    marginBottom: 15,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: managerColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  recipeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: managerColors.border,
    marginRight: 15,
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
  recipePrice: {
    fontSize: 16,
    color: managerColors.primary,
    fontWeight: '600',
    marginBottom: 3,
  },
  recipeSubcategory: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 3,
  },
  recipeGlassware: {
    fontSize: 13,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  recipeActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  editButton: {
    backgroundColor: managerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 5,
    marginRight: 10,
  },
  deleteButton: {
    backgroundColor: '#DC3545',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: managerColors.card,
    borderRadius: 15,
    padding: 20,
    width: '90%',
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  modalHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: '80%',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  required: {
    color: '#DC3545',
  },
  input: {
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    backgroundColor: managerColors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  imagePickerButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  thumbnailPreview: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'center',
  },
  ingredientsContainer: {
    marginBottom: 15,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ingredientInput: {
    flex: 2,
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
    marginRight: 8,
  },
  removeIngredientButton: {
    padding: 8,
  },
  addIngredientButton: {
    backgroundColor: managerColors.primary,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  addIngredientButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: managerColors.primary,
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButton: {
    backgroundColor: managerColors.textSecondary,
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: managerColors.background,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    textAlign: 'center',
  },
});

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('Signature Cocktails');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ingredient: '', amount: '' }]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

      const normalizedData = (data || []).map((recipe) => ({
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      }));

      setRecipes(normalizedData);
      filterRecipes(normalizedData);
    } catch (error) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  const filterRecipes = useCallback(() => {
    let filtered = recipes;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter((recipe) => recipe.subcategory === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(query) ||
          recipe.subcategory?.toLowerCase().includes(query) ||
          recipe.glassware?.toLowerCase().includes(query)
      );
    }

    setFilteredRecipes(filtered);
  }, [recipes, selectedCategory, searchQuery]);

  useEffect(() => {
    filterRecipes();
  }, [filterRecipes]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = decode(base64);
      const fileName = `recipe-${Date.now()}.jpg`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('signature-recipe-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('signature-recipe-images').getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

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
    if (!name.trim() || !price.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setUploading(true);

      let finalThumbnailUrl = thumbnailUrl;
      if (thumbnailUri && thumbnailUri !== thumbnailUrl) {
        finalThumbnailUrl = await uploadImage(thumbnailUri);
      }

      const validIngredients = ingredients.filter(
        (ing) => ing.ingredient.trim() && ing.amount.trim()
      );

      const recipeData = {
        p_name: name.trim(),
        p_price: price.trim(),
        p_subcategory: subcategory,
        p_glassware: glassware.trim() || null,
        p_ingredients: JSON.stringify(validIngredients),
        p_procedure: procedure.trim() || null,
        p_thumbnail_url: finalThumbnailUrl,
        p_display_order: editingRecipe?.display_order || recipes.length,
        p_is_active: true,
      };

      if (editingRecipe) {
        const { error } = await supabase.rpc('update_signature_recipe', {
          ...recipeData,
          p_id: editingRecipe.id,
        });

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        const { error } = await supabase.rpc('insert_signature_recipe', recipeData);

        if (error) throw error;
        Alert.alert('Success', 'Recipe added successfully');
      }

      closeModal();
      loadRecipes();
    } catch (error) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', 'Failed to save recipe');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (recipe: SignatureRecipe) => {
    Alert.alert('Delete Recipe', `Are you sure you want to delete "${recipe.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_signature_recipe', {
              p_id: recipe.id,
            });

            if (error) throw error;

            Alert.alert('Success', 'Recipe deleted successfully');
            loadRecipes();
          } catch (error) {
            console.error('Error deleting recipe:', error);
            Alert.alert('Error', 'Failed to delete recipe');
          }
        },
      },
    ]);
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
      recipe.ingredients && recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ ingredient: '', amount: '' }]
    );
    setProcedure(recipe.procedure || '');
    setThumbnailUrl(recipe.thumbnail_url);
    setThumbnailUri(recipe.thumbnail_url);
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
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${supabase.supabaseUrl}/storage/v1/object/public/signature-recipe-images/${url}`;
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    return isNaN(num) ? price : `$${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        </View>
      </View>

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

      {/* Categories */}
      <View style={styles.categoryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {SUBCATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text
                style={[
                  styles.categoryButtonText,
                  selectedCategory === category && styles.categoryButtonTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <Text style={styles.addButtonText}>+ Add Recipe</Text>
      </TouchableOpacity>

      {/* Recipes List */}
      <ScrollView>
        {filteredRecipes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recipes found</Text>
          </View>
        ) : (
          filteredRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              {recipe.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }}
                  style={styles.recipeThumbnail}
                />
              )}
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipePrice}>{formatPrice(recipe.price)}</Text>
                {recipe.subcategory && (
                  <Text style={styles.recipeSubcategory}>{recipe.subcategory}</Text>
                )}
                {recipe.glassware && (
                  <Text style={styles.recipeGlassware}>Glass: {recipe.glassware}</Text>
                )}
                <View style={styles.recipeActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(recipe)}
                  >
                    <Text style={styles.buttonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(recipe)}
                  >
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit/Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>
              {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Thumbnail */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail Image</Text>
                <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                  <Text style={styles.imagePickerButtonText}>Select Image</Text>
                </TouchableOpacity>
                {thumbnailUri && (
                  <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} />
                )}
              </View>

              {/* Recipe Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Recipe Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Tiki Berry Splash"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Price */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Price <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g., 8"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {SUBCATEGORIES.filter((cat) => cat !== 'All').map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryButton,
                        subcategory === cat && styles.categoryButtonActive,
                      ]}
                      onPress={() => setSubcategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categoryButtonText,
                          subcategory === cat && styles.categoryButtonTextActive,
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
                      style={styles.ingredientInput}
                      value={ing.ingredient}
                      onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                      placeholder="Ingredient"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    <TextInput
                      style={styles.amountInput}
                      value={ing.amount}
                      onChangeText={(value) => updateIngredient(index, 'amount', value)}
                      placeholder="Amount"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeIngredient(index)}
                        style={styles.removeIngredientButton}
                      >
                        <IconSymbol name="minus.circle.fill" size={24} color="#DC3545" />
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
                  placeholder="Procedure to be added"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
