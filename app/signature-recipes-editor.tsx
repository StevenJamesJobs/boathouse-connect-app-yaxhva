
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect, useCallback } from 'react';
import { decode } from 'base64-arraybuffer';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
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
import { managerColors } from '@/styles/commonStyles';

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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    margin: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryButtonActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  categoryButtonText: {
    fontSize: 14,
    color: managerColors.text,
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  recipeList: {
    padding: 16,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  recipeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: managerColors.border,
  },
  recipeInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 4,
  },
  recipeDetails: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 2,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
  },
  modalBody: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
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
    fontSize: 16,
    color: managerColors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  thumbnailPicker: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    backgroundColor: managerColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: managerColors.border,
    borderStyle: 'dashed',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
  },
  thumbnailText: {
    marginTop: 8,
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  ingredientInput: {
    flex: 1,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
  },
  ingredientAmountInput: {
    width: 80,
  },
  removeIngredientButton: {
    padding: 8,
  },
  addIngredientButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addIngredientButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: managerColors.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: managerColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: managerColors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
});

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature-recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      const normalizedData = (data || []).map((recipe) => ({
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      }));

      setRecipes(normalizedData);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes');
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
    if (selectedCategory === 'All') {
      setFilteredRecipes(recipes);
    } else {
      setFilteredRecipes(recipes.filter((r) => r.subcategory === selectedCategory));
    }
  }, [selectedCategory, recipes]);

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

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = decode(base64);
      const fileName = `${Date.now()}.jpg`;

      const { data, error } = await supabase.storage
        .from('signature-recipe-images')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('signature-recipe-images')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error: any) {
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

    if (!subcategory) {
      Alert.alert('Error', 'Please select a subcategory');
      return;
    }

    try {
      setUploading(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        const uploadedUrl = await uploadImage(thumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      }

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory,
        glassware: glassware.trim(),
        ingredients: ingredients.filter((ing) => ing.ingredient.trim() !== ''),
        procedure: procedure.trim(),
        display_order: parseInt(displayOrder) || 0,
        thumbnail_url: thumbnailUrl,
        is_active: true,
      };

      if (editingRecipe) {
        const { error } = await supabase
          .from('signature-recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        const { error } = await supabase
          .from('signature-recipes')
          .insert([recipeData]);

        if (error) throw error;
        Alert.alert('Success', 'Recipe added successfully');
      }

      closeModal();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', 'Failed to save recipe');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (recipe: SignatureRecipe) => {
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
              const { error } = await supabase
                .from('signature-recipes')
                .delete()
                .eq('id', recipe.id);

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
    setEditingRecipe(null);
    setName('');
    setPrice('');
    setSubcategory('');
    setGlassware('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setDisplayOrder('0');
    setThumbnailUri(null);
    setModalVisible(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setSubcategory(recipe.subcategory || '');
    setGlassware(recipe.glassware || '');
    setIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ amount: '', ingredient: '' }]
    );
    setProcedure(recipe.procedure || '');
    setDisplayOrder(recipe.display_order.toString());
    setThumbnailUri(recipe.thumbnail_url);
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
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/signature-recipe-images/${url}`;
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
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <Text style={styles.addButtonText}>+ Add Recipe</Text>
      </TouchableOpacity>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              selectedCategory === 'All' && styles.categoryButtonActive,
            ]}
            onPress={() => setSelectedCategory('All')}
          >
            <Text
              style={[
                styles.categoryButtonText,
                selectedCategory === 'All' && styles.categoryButtonTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
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
          <View style={styles.emptyContainer}>
            <IconSymbol name="wineglass" size={48} color={managerColors.textSecondary} />
            <Text style={styles.emptyText}>
              No recipes found. Tap "Add Recipe" to create one.
            </Text>
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
                <Text style={styles.recipeDetails}>Price: ${recipe.price}</Text>
                <Text style={styles.recipeDetails}>Category: {recipe.subcategory}</Text>
                <View style={styles.recipeActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(recipe)}
                  >
                    <IconSymbol name="pencil" size={20} color={managerColors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDelete(recipe)}
                  >
                    <IconSymbol name="trash" size={20} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </Text>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Thumbnail */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail</Text>
                <TouchableOpacity style={styles.thumbnailPicker} onPress={pickImage}>
                  {thumbnailUri ? (
                    <Image source={{ uri: thumbnailUri }} style={styles.thumbnailImage} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder}>
                      <IconSymbol name="photo" size={32} color={managerColors.textSecondary} />
                      <Text style={styles.thumbnailText}>Tap to select image</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Name *</Text>
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
                  placeholder="Enter price"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Subcategory */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Subcategory *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATEGORIES.map((cat) => (
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
                  placeholder="Enter glassware type"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Ingredients</Text>
                {ingredients.map((ing, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <TextInput
                      style={[styles.ingredientInput, styles.ingredientAmountInput]}
                      value={ing.amount}
                      onChangeText={(text) => {
                        const newIngredients = [...ingredients];
                        newIngredients[index].amount = text;
                        setIngredients(newIngredients);
                      }}
                      placeholder="Amount"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    <TextInput
                      style={styles.ingredientInput}
                      value={ing.ingredient}
                      onChangeText={(text) => {
                        const newIngredients = [...ingredients];
                        newIngredients[index].ingredient = text;
                        setIngredients(newIngredients);
                      }}
                      placeholder="Ingredient"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeIngredientButton}
                        onPress={() => removeIngredient(index)}
                      >
                        <IconSymbol name="minus.circle" size={24} color="#ff4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                  <Text style={styles.addIngredientButtonText}>+ Add Ingredient</Text>
                </TouchableOpacity>
              </View>

              {/* Procedure */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Procedure</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder="Enter preparation procedure"
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
                  placeholder="Enter display order"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={uploading}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
