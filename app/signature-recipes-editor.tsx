
import { managerColors } from '@/styles/commonStyles';
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
import { useAuth } from '@/contexts/AuthContext';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { IconSymbol } from '@/components/IconSymbol';
import React, { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginLeft: -40,
  },
  backButton: {
    padding: 5,
  },
  addButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    margin: 15,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: managerColors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryTabActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  categoryTabText: {
    fontSize: 12,
    color: managerColors.text,
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  recipeCard: {
    backgroundColor: managerColors.cardBackground,
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 15,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 16,
    color: managerColors.accent,
    fontWeight: '600',
  },
  recipeSubcategory: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 4,
  },
  recipeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginLeft: 10,
  },
  recipeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 5,
  },
  editButton: {
    backgroundColor: managerColors.accent,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    color: managerColors.text,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  ingredientInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: managerColors.text,
    backgroundColor: '#fff',
  },
  removeIngredientButton: {
    padding: 8,
  },
  addIngredientButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  addIngredientButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  imagePickerButton: {
    backgroundColor: managerColors.cardBackground,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  imagePickerText: {
    color: managerColors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: managerColors.accent,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
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
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Form fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState('0');

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [])
  );

  useEffect(() => {
    filterRecipesByCategory();
  }, [selectedCategory, recipes]);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRecipes(data || []);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', error.message || 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  };

  const filterRecipesByCategory = () => {
    if (selectedCategory === 'All') {
      setFilteredRecipes(recipes);
    } else {
      setFilteredRecipes(recipes.filter((r) => r.subcategory === selectedCategory));
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
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

      const fileName = `recipe-${Date.now()}.jpg`;
      const arrayBuffer = decode(base64);

      const { data, error } = await supabase.storage
        .from('signature-recipe-images')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('signature-recipe-images').getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    try {
      // Validate required fields with proper null/undefined checks
      const trimmedName = name?.trim() || '';
      const trimmedPrice = price?.trim() || '';
      const trimmedSubcategory = subcategory?.trim() || '';
      const trimmedGlassware = glassware?.trim() || '';
      const trimmedProcedure = procedure?.trim() || '';

      if (!trimmedName) {
        Alert.alert('Error', 'Please enter a recipe name');
        return;
      }

      if (!trimmedPrice) {
        Alert.alert('Error', 'Please enter a price');
        return;
      }

      if (!trimmedSubcategory) {
        Alert.alert('Error', 'Please select a subcategory');
        return;
      }

      // Validate ingredients with proper null checks
      const validIngredients = ingredients.filter(
        (ing) => 
          ing?.amount && 
          ing.amount.trim() !== '' && 
          ing?.ingredient && 
          ing.ingredient.trim() !== ''
      );

      if (validIngredients.length === 0) {
        Alert.alert('Error', 'Please add at least one ingredient');
        return;
      }

      setUploading(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      // Upload new image if selected
      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        thumbnailUrl = await uploadImage(thumbnailUri);
      }

      const recipeData = {
        name: trimmedName,
        price: trimmedPrice,
        subcategory: trimmedSubcategory,
        glassware: trimmedGlassware || null,
        ingredients: validIngredients,
        procedure: trimmedProcedure || null,
        thumbnail_url: thumbnailUrl,
        display_order: parseInt(displayOrder) || 0,
        is_active: true,
      };

      if (editingRecipe) {
        // Update existing recipe
        const { error } = await supabase
          .from('signature_recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        // Insert new recipe
        const { error } = await supabase.from('signature_recipes').insert([recipeData]);

        if (error) throw error;
        Alert.alert('Success', 'Recipe added successfully');
      }

      closeModal();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
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
            const { error } = await supabase.from('signature_recipes').delete().eq('id', recipe.id);

            if (error) throw error;
            Alert.alert('Success', 'Recipe deleted successfully');
            loadRecipes();
          } catch (error: any) {
            console.error('Error deleting recipe:', error);
            Alert.alert('Error', error.message || 'Failed to delete recipe');
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    setEditingRecipe(null);
    setName('');
    setPrice('');
    setSubcategory('');
    setGlassware('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setThumbnailUri(null);
    setDisplayOrder('0');
    setModalVisible(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name || '');
    setPrice(recipe.price || '');
    setSubcategory(recipe.subcategory || '');
    setGlassware(recipe.glassware || '');
    setIngredients(recipe.ingredients && recipe.ingredients.length > 0 ? recipe.ingredients : [{ amount: '', ingredient: '' }]);
    setProcedure(recipe.procedure || '');
    setThumbnailUri(recipe.thumbnail_url);
    setDisplayOrder(recipe.display_order?.toString() || '0');
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
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

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
        <TouchableOpacity
          style={[styles.categoryTab, selectedCategory === 'All' && styles.categoryTabActive]}
          onPress={() => setSelectedCategory('All')}
        >
          <Text style={[styles.categoryTabText, selectedCategory === 'All' && styles.categoryTabTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryTab, selectedCategory === cat && styles.categoryTabActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryTabText, selectedCategory === cat && styles.categoryTabTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recipe List */}
      <ScrollView>
        {filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No recipes found. Add your first recipe!</Text>
          </View>
        ) : (
          filteredRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <View style={styles.recipeHeader}>
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeName}>{recipe.name}</Text>
                  <Text style={styles.recipePrice}>${recipe.price}</Text>
                  {recipe.subcategory && <Text style={styles.recipeSubcategory}>{recipe.subcategory}</Text>}
                </View>
                {recipe.thumbnail_url && (
                  <Image source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }} style={styles.recipeThumbnail} />
                )}
              </View>
              <View style={styles.recipeActions}>
                <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(recipe)}>
                  <IconSymbol name="pencil" size={16} color="#fff" />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(recipe)}>
                  <IconSymbol name="trash" size={16} color="#fff" />
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingRecipe ? 'Edit Recipe' : 'Add Recipe'}</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Recipe Name *</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter recipe name" />

              <Text style={styles.label}>Price *</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="Enter price"
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Subcategory *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryTab, subcategory === cat && styles.categoryTabActive]}
                    onPress={() => setSubcategory(cat)}
                  >
                    <Text style={[styles.categoryTabText, subcategory === cat && styles.categoryTabTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Glassware</Text>
              <TextInput style={styles.input} value={glassware} onChangeText={setGlassware} placeholder="Enter glassware type" />

              <Text style={styles.label}>Ingredients *</Text>
              {ingredients.map((ing, index) => (
                <View key={index} style={styles.ingredientRow}>
                  <TextInput
                    style={[styles.ingredientInput, { flex: 0.3 }]}
                    value={ing?.amount || ''}
                    onChangeText={(text) => {
                      const newIngredients = [...ingredients];
                      newIngredients[index] = { ...newIngredients[index], amount: text };
                      setIngredients(newIngredients);
                    }}
                    placeholder="Amount"
                  />
                  <TextInput
                    style={[styles.ingredientInput, { flex: 0.6 }]}
                    value={ing?.ingredient || ''}
                    onChangeText={(text) => {
                      const newIngredients = [...ingredients];
                      newIngredients[index] = { ...newIngredients[index], ingredient: text };
                      setIngredients(newIngredients);
                    }}
                    placeholder="Ingredient"
                  />
                  {ingredients.length > 1 && (
                    <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeIngredientButton}>
                      <IconSymbol name="minus.circle.fill" size={24} color="#dc3545" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                <Text style={styles.addIngredientButtonText}>+ Add Ingredient</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Procedure</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={procedure}
                onChangeText={setProcedure}
                placeholder="Enter preparation procedure"
                multiline
              />

              <Text style={styles.label}>Display Order</Text>
              <TextInput
                style={styles.input}
                value={displayOrder}
                onChangeText={setDisplayOrder}
                placeholder="Enter display order"
                keyboardType="number-pad"
              />

              <Text style={styles.label}>Thumbnail Image</Text>
              <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                <Text style={styles.imagePickerText}>
                  {thumbnailUri ? 'Change Image' : 'Select Image'}
                </Text>
              </TouchableOpacity>
              {thumbnailUri && <Image source={{ uri: thumbnailUri }} style={styles.selectedImage} />}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeModal} disabled={uploading}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>{editingRecipe ? 'Update' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
