
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { managerColors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
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
import { useFocusEffect } from '@react-navigation/native';
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

const CATEGORIES = [
  'Signature Cocktails',
  'Martinis',
  'Sangria',
  'Low ABV',
  'Zero ABV',
];

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
  const [subcategory, setSubcategory] = useState('');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState('0');

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      const recipesWithParsedIngredients = (data || []).map((recipe) => ({
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      }));

      setRecipes(recipesWithParsedIngredients);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load signature recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

  const filterRecipesByCategory = useCallback(() => {
    const filtered = recipes.filter((recipe) => recipe.subcategory === selectedCategory);
    setFilteredRecipes(filtered);
  }, [recipes, selectedCategory]);

  useEffect(() => {
    filterRecipesByCategory();
  }, [selectedCategory, recipes, filterRecipesByCategory]);

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

      const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const fileName = `${Date.now()}.jpg`;
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
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    if (!subcategory.trim()) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    try {
      setSaving(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        thumbnailUrl = await uploadImage(thumbnailUri);
      }

      const filteredIngredients = ingredients.filter(
        (ing) => ing.amount.trim() || ing.ingredient.trim()
      );

      const recipeData = {
        p_user_id: user?.id,
        p_recipe_id: editingRecipe?.id || null,
        p_name: name.trim(),
        p_price: price.trim(),
        p_subcategory: subcategory.trim(),
        p_glassware: glassware.trim() || null,
        p_ingredients: JSON.stringify(filteredIngredients),
        p_procedure: procedure.trim() || null,
        p_thumbnail_url: thumbnailUrl,
        p_display_order: parseInt(displayOrder) || 0,
        p_is_active: true,
      };

      const rpcFunction = editingRecipe ? 'update_signature_recipe' : 'create_signature_recipe';

      const { error } = await supabase.rpc(rpcFunction, recipeData);

      if (error) throw error;

      Alert.alert('Success', `Recipe ${editingRecipe ? 'updated' : 'created'} successfully`);
      closeModal();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
    } finally {
      setSaving(false);
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
              p_user_id: user?.id,
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
    setSubcategory(recipe.subcategory || '');
    setGlassware(recipe.glassware || '');
    setIngredients(
      recipe.ingredients && recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ amount: '', ingredient: '' }]
    );
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
    return `${supabase.storage.from('signature-recipe-images').getPublicUrl(url).data.publicUrl}`;
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
      {/* Fixed Header - Matching Announcement Editor */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add_circle"
          size={24}
          color={managerColors.text}
        />
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabs}
        contentContainerStyle={styles.categoryTabsContent}
      >
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryTab,
              selectedCategory === category && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory(category)}
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

      {/* Recipe List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="wineglass"
              android_material_icon_name="local_bar"
              size={48}
              color={managerColors.border}
            />
            <Text style={styles.emptyStateText}>No recipes in this category</Text>
            <Text style={styles.emptyStateSubtext}>Tap &quot;Add Recipe&quot; to create one</Text>
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
                    color={managerColors.primary}
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
                    color="#dc3545"
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Thumbnail */}
              <TouchableOpacity style={styles.thumbnailPicker} onPress={pickImage}>
                {thumbnailUri ? (
                  <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} />
                ) : (
                  <View style={styles.thumbnailPlaceholder}>
                    <IconSymbol
                      ios_icon_name="photo"
                      android_material_icon_name="add_photo_alternate"
                      size={40}
                      color={managerColors.border}
                    />
                    <Text style={styles.thumbnailPlaceholderText}>Tap to add image</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Name */}
              <Text style={styles.label}>Recipe Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter recipe name"
                placeholderTextColor={managerColors.border}
              />

              {/* Price */}
              <Text style={styles.label}>Price</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="Enter price"
                placeholderTextColor={managerColors.border}
                keyboardType="decimal-pad"
              />

              {/* Category */}
              <Text style={styles.label}>Category *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categorySelector}
              >
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categorySelectorButton,
                      subcategory === cat && styles.categorySelectorButtonActive,
                    ]}
                    onPress={() => setSubcategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categorySelectorText,
                        subcategory === cat && styles.categorySelectorTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Glassware */}
              <Text style={styles.label}>Glassware</Text>
              <TextInput
                style={styles.input}
                value={glassware}
                onChangeText={setGlassware}
                placeholder="Enter glassware type"
                placeholderTextColor={managerColors.border}
              />

              {/* Ingredients */}
              <View style={styles.ingredientsHeader}>
                <Text style={styles.label}>Ingredients</Text>
                <TouchableOpacity onPress={addIngredient} style={styles.addIngredientButton}>
                  <IconSymbol
                    ios_icon_name="plus.circle.fill"
                    android_material_icon_name="add_circle"
                    size={20}
                    color={managerColors.primary}
                  />
                  <Text style={styles.addIngredientText}>Add</Text>
                </TouchableOpacity>
              </View>

              {ingredients.map((ingredient, index) => (
                <View key={index} style={styles.ingredientRow}>
                  <TextInput
                    style={[styles.input, styles.ingredientAmountInput]}
                    value={ingredient.amount}
                    onChangeText={(text) => {
                      const newIngredients = [...ingredients];
                      newIngredients[index].amount = text;
                      setIngredients(newIngredients);
                    }}
                    placeholder="Amount"
                    placeholderTextColor={managerColors.border}
                  />
                  <TextInput
                    style={[styles.input, styles.ingredientNameInput]}
                    value={ingredient.ingredient}
                    onChangeText={(text) => {
                      const newIngredients = [...ingredients];
                      newIngredients[index].ingredient = text;
                      setIngredients(newIngredients);
                    }}
                    placeholder="Ingredient"
                    placeholderTextColor={managerColors.border}
                  />
                  {ingredients.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeIngredient(index)}
                      style={styles.removeIngredientButton}
                    >
                      <IconSymbol
                        ios_icon_name="minus.circle.fill"
                        android_material_icon_name="remove_circle"
                        size={24}
                        color="#dc3545"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Procedure */}
              <Text style={styles.label}>Procedure</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={procedure}
                onChangeText={setProcedure}
                placeholder="Enter preparation instructions"
                placeholderTextColor={managerColors.border}
                multiline
                numberOfLines={4}
              />

              {/* Display Order */}
              <Text style={styles.label}>Display Order</Text>
              <TextInput
                style={styles.input}
                value={displayOrder}
                onChangeText={setDisplayOrder}
                placeholder="Enter display order"
                placeholderTextColor={managerColors.border}
                keyboardType="number-pad"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingRecipe ? 'Update' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    backgroundColor: managerColors.card,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
    gap: 10,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  categoryTabs: {
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
    marginTop: 16,
  },
  categoryTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: managerColors.background,
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: managerColors.primary,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: managerColors.text,
  },
  categoryTabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: managerColors.subtext,
    marginTop: 8,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  recipeThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 14,
    color: managerColors.primary,
    fontWeight: '500',
    marginBottom: 2,
  },
  recipeGlassware: {
    fontSize: 12,
    color: managerColors.subtext,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: managerColors.background,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: managerColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: managerColors.text,
  },
  modalBody: {
    padding: 20,
  },
  thumbnailPicker: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  thumbnailPreview: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: managerColors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: managerColors.border,
    borderStyle: 'dashed',
  },
  thumbnailPlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: managerColors.subtext,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: managerColors.card,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categorySelector: {
    marginBottom: 16,
  },
  categorySelectorButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    borderWidth: 1,
    borderColor: managerColors.border,
    marginRight: 8,
  },
  categorySelectorButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  categorySelectorText: {
    fontSize: 14,
    fontWeight: '500',
    color: managerColors.text,
  },
  categorySelectorTextActive: {
    color: '#fff',
  },
  ingredientsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addIngredientText: {
    fontSize: 14,
    fontWeight: '500',
    color: managerColors.primary,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ingredientAmountInput: {
    flex: 1,
    marginBottom: 0,
  },
  ingredientNameInput: {
    flex: 2,
    marginBottom: 0,
  },
  removeIngredientButton: {
    padding: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: managerColors.card,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
  saveButton: {
    backgroundColor: managerColors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
