
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useFocusEffect } from '@react-navigation/native';
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
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

interface SignatureRecipe {
  id: string;
  name: string;
  price: string;
  subcategory: string | null;
  glassware: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

// CORRECT CATEGORIES - matching the viewable Signature Recipes page
const CATEGORIES = ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'];

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
    padding: 5,
  },
  addButton: {
    padding: 5,
  },
  categoryContainer: {
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 20,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryButtonActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  recipeList: {
    padding: 15,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  recipeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: managerColors.background,
  },
  recipeInfo: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  recipeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 5,
  },
  recipePrice: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 5,
  },
  recipeGlassware: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  recipeActions: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  actionButton: {
    padding: 8,
    marginVertical: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 20,
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
  modalScroll: {
    maxHeight: '100%',
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
  input: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  thumbnailContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  thumbnailPreview: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: managerColors.background,
    marginBottom: 10,
  },
  thumbnailButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  thumbnailButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  ingredientsContainer: {
    marginBottom: 15,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ingredientInputContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  ingredientAmountInput: {
    flex: 1,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
  },
  ingredientNameInput: {
    flex: 2,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
  },
  removeIngredientButton: {
    padding: 8,
    marginLeft: 10,
  },
  addIngredientButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  addIngredientButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: managerColors.accent,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Signature Cocktails');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('Signature Cocktails');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState('0');

  const filterRecipesByCategory = useCallback((recipesToFilter: SignatureRecipe[], category: string) => {
    const filtered = recipesToFilter.filter((recipe) => recipe.subcategory === category);
    setFilteredRecipes(filtered);
  }, []);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      setRecipes(data || []);
      filterRecipesByCategory(data || [], selectedCategory);
    } catch (error) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load signature recipes');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, filterRecipesByCategory]);

  useEffect(() => {
    filterRecipesByCategory(recipes, selectedCategory);
  }, [selectedCategory, recipes, filterRecipesByCategory]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const fileName = `signature-recipe-${Date.now()}.jpg`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('signature-recipe-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('signature-recipe-images').getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
      return null;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    try {
      setSaving(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        const uploadedUrl = await uploadImage(thumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      }

      // Filter out empty ingredients
      const validIngredients = ingredients.filter((ing) => ing.amount.trim() || ing.ingredient.trim());

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory,
        glassware: glassware.trim() || null,
        ingredients: validIngredients,
        procedure: procedure.trim() || null,
        thumbnail_url: thumbnailUrl,
        display_order: parseInt(displayOrder) || 0,
        is_active: true,
      };

      console.log('Saving recipe with data:', recipeData);

      if (editingRecipe) {
        const { error } = await supabase.rpc('update_signature_recipe', {
          p_id: editingRecipe.id,
          p_name: recipeData.name,
          p_price: recipeData.price,
          p_subcategory: recipeData.subcategory,
          p_glassware: recipeData.glassware,
          p_ingredients: recipeData.ingredients,
          p_procedure: recipeData.procedure,
          p_thumbnail_url: recipeData.thumbnail_url,
          p_display_order: recipeData.display_order,
          p_is_active: recipeData.is_active,
        });

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        const { error } = await supabase.rpc('insert_signature_recipe', {
          p_name: recipeData.name,
          p_price: recipeData.price,
          p_subcategory: recipeData.subcategory,
          p_glassware: recipeData.glassware,
          p_ingredients: recipeData.ingredients,
          p_procedure: recipeData.procedure,
          p_thumbnail_url: recipeData.thumbnail_url,
          p_display_order: recipeData.display_order,
          p_is_active: recipeData.is_active,
        });

        if (error) throw error;
        Alert.alert('Success', 'Recipe created successfully');
      }

      closeModal();
      loadRecipes();
    } catch (error) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recipe: SignatureRecipe) => {
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
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
    setEditingRecipe(null);
    setName('');
    setPrice('');
    setSubcategory(selectedCategory);
    setGlassware('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setThumbnailUri(null);
    setDisplayOrder('0');
    setModalVisible(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setSubcategory(recipe.subcategory || 'Signature Cocktails');
    setGlassware(recipe.glassware || '');
    
    // Ensure ingredients are properly formatted with amount and ingredient fields
    const formattedIngredients = recipe.ingredients && recipe.ingredients.length > 0
      ? recipe.ingredients.map(ing => ({
          amount: ing.amount || '',
          ingredient: ing.ingredient || ''
        }))
      : [{ amount: '', ingredient: '' }];
    
    setIngredients(formattedIngredients);
    setProcedure(recipe.procedure || '');
    setThumbnailUri(recipe.thumbnail_url);
    setDisplayOrder(recipe.display_order.toString());
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingRecipe(null);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { amount: '', ingredient: '' }]);
  };

  const removeIngredient = (index: number) => {
    const newIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(newIngredients.length > 0 ? newIngredients : [{ amount: '', ingredient: '' }]);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${supabase.supabaseUrl}/storage/v1/object/public/signature-recipe-images/${url}`;
  };

  if (loading) {
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
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {CATEGORIES.map((category) => (
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

      {/* Recipe List */}
      <ScrollView style={styles.recipeList}>
        {filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="wineglass"
              android_material_icon_name="local-bar"
              size={48}
              color={managerColors.textSecondary}
            />
            <Text style={styles.emptyStateText}>No recipes in this category</Text>
          </View>
        ) : (
          filteredRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <Image
                source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }}
                style={styles.recipeThumbnail}
              />
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipePrice}>${recipe.price}</Text>
                {recipe.glassware && (
                  <Text style={styles.recipeGlassware}>{recipe.glassware}</Text>
                )}
              </View>
              <View style={styles.recipeActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(recipe)}
                >
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={20}
                    color={managerColors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDelete(recipe)}
                >
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color="#FF3B30"
                  />
                </TouchableOpacity>
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
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Thumbnail */}
              <View style={styles.thumbnailContainer}>
                {thumbnailUri && (
                  <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} />
                )}
                <TouchableOpacity onPress={pickImage} style={styles.thumbnailButton}>
                  <Text style={styles.thumbnailButtonText}>
                    {thumbnailUri ? 'Change Image' : 'Add Image'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Recipe name"
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

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryButton,
                        subcategory === category && styles.categoryButtonActive,
                      ]}
                      onPress={() => setSubcategory(category)}
                    >
                      <Text
                        style={[
                          styles.categoryButtonText,
                          subcategory === category && styles.categoryButtonTextActive,
                        ]}
                      >
                        {category}
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
                  placeholder="e.g., Martini Glass"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Ingredients - Two separate fields side-by-side */}
              <View style={styles.ingredientsContainer}>
                <Text style={styles.label}>Ingredients</Text>
                {ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <View style={styles.ingredientInputContainer}>
                      <TextInput
                        style={styles.ingredientAmountInput}
                        value={ingredient.amount}
                        onChangeText={(text) => {
                          const newIngredients = [...ingredients];
                          newIngredients[index].amount = text;
                          setIngredients(newIngredients);
                        }}
                        placeholder="Amount"
                        placeholderTextColor={managerColors.textSecondary}
                      />
                      <TextInput
                        style={styles.ingredientNameInput}
                        value={ingredient.ingredient}
                        onChangeText={(text) => {
                          const newIngredients = [...ingredients];
                          newIngredients[index].ingredient = text;
                          setIngredients(newIngredients);
                        }}
                        placeholder="Ingredient"
                        placeholderTextColor={managerColors.textSecondary}
                      />
                    </View>
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeIngredient(index)}
                        style={styles.removeIngredientButton}
                      >
                        <IconSymbol
                          ios_icon_name="minus.circle"
                          android_material_icon_name="remove-circle"
                          size={24}
                          color="#FF3B30"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={addIngredient} style={styles.addIngredientButton}>
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
                  placeholder="Preparation instructions"
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

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSave}
                style={styles.saveButton}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingRecipe ? 'Update Recipe' : 'Create Recipe'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Delete Button (only when editing) */}
              {editingRecipe && (
                <TouchableOpacity
                  onPress={() => {
                    closeModal();
                    handleDelete(editingRecipe);
                  }}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete Recipe</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
