
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

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Signature Cocktails');
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);

  // Form fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('Signature Cocktails');
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
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRecipes(data || []);
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

    if (!result.canceled) {
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
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('signature-recipe-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('signature-recipe-images')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    try {
      setUploading(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      if (thumbnailUri && thumbnailUri !== editingRecipe?.thumbnail_url) {
        thumbnailUrl = await uploadImage(thumbnailUri);
      }

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory,
        glassware: glassware.trim() || null,
        ingredients: ingredients.filter((ing) => ing.ingredient.trim() !== ''),
        procedure: procedure.trim() || null,
        display_order: parseInt(displayOrder) || 0,
        thumbnail_url: thumbnailUrl,
        is_active: true,
      };

      if (editingRecipe) {
        const { error } = await supabase
          .from('signature_recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        const { error } = await supabase.from('signature_recipes').insert([recipeData]);

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
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
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
    setSubcategory('Signature Cocktails');
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
    setSubcategory(recipe.subcategory || 'Signature Cocktails');
    setGlassware(recipe.glassware || '');
    setIngredients(
      recipe.ingredients && recipe.ingredients.length > 0
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
    const newIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(newIngredients);
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
        <ActivityIndicator size="large" color={managerColors.primary} />
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
        <View style={styles.backButton} />
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <IconSymbol name="plus.circle.fill" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
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
      <ScrollView style={styles.content}>
        {filteredRecipes.map((recipe) => (
          <View key={recipe.id} style={styles.recipeCard}>
            {recipe.thumbnail_url && (
              <Image source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }} style={styles.thumbnail} />
            )}
            <View style={styles.recipeInfo}>
              <Text style={styles.recipeName}>{recipe.name}</Text>
              <Text style={styles.recipePrice}>${recipe.price}</Text>
              {recipe.glassware && <Text style={styles.recipeGlassware}>{recipe.glassware}</Text>}
            </View>
            <View style={styles.recipeActions}>
              <TouchableOpacity onPress={() => openEditModal(recipe)} style={styles.actionButton}>
                <IconSymbol name="pencil" size={20} color={managerColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(recipe)} style={styles.actionButton}>
                <IconSymbol name="trash" size={20} color="#dc3545" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
            </Text>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Recipe name"
            />

            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Subcategory</Text>
            <View style={styles.subcategoryContainer}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.subcategoryButton,
                    subcategory === cat && styles.subcategoryButtonActive,
                  ]}
                  onPress={() => setSubcategory(cat)}
                >
                  <Text
                    style={[
                      styles.subcategoryButtonText,
                      subcategory === cat && styles.subcategoryButtonTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Glassware</Text>
            <TextInput
              style={styles.input}
              value={glassware}
              onChangeText={setGlassware}
              placeholder="e.g., Martini Glass"
            />

            <Text style={styles.label}>Ingredients</Text>
            {ingredients.map((ing, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.input, styles.ingredientAmount]}
                  value={ing.amount}
                  onChangeText={(text) => {
                    const newIngredients = [...ingredients];
                    newIngredients[index].amount = text;
                    setIngredients(newIngredients);
                  }}
                  placeholder="Amount"
                />
                <TextInput
                  style={[styles.input, styles.ingredientName]}
                  value={ing.ingredient}
                  onChangeText={(text) => {
                    const newIngredients = [...ingredients];
                    newIngredients[index].ingredient = text;
                    setIngredients(newIngredients);
                  }}
                  placeholder="Ingredient"
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(index)}>
                    <IconSymbol name="minus.circle" size={24} color="#dc3545" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
              <IconSymbol name="plus.circle" size={20} color={managerColors.primary} />
              <Text style={styles.addIngredientText}>Add Ingredient</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Procedure</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={procedure}
              onChangeText={setProcedure}
              placeholder="Preparation instructions"
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>Display Order</Text>
            <TextInput
              style={styles.input}
              value={displayOrder}
              onChangeText={setDisplayOrder}
              placeholder="0"
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Thumbnail</Text>
            <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
              <IconSymbol name="photo" size={20} color="#fff" />
              <Text style={styles.imagePickerText}>
                {thumbnailUri ? 'Change Image' : 'Select Image'}
              </Text>
            </TouchableOpacity>
            {thumbnailUri && (
              <Image source={{ uri: thumbnailUri }} style={styles.previewImage} />
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={closeModal}
              disabled={uploading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton]}
              onPress={handleSave}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.primary,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.primary,
    padding: 12,
    margin: 15,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categoryTabActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  categoryTabText: {
    fontSize: 14,
    color: '#666',
  },
  categoryTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 15,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  thumbnail: {
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
    color: '#333',
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  recipeGlassware: {
    fontSize: 12,
    color: '#999',
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    backgroundColor: managerColors.primary,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  subcategoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subcategoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  subcategoryButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  subcategoryButtonText: {
    fontSize: 14,
    color: '#666',
  },
  subcategoryButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ingredientAmount: {
    flex: 1,
  },
  ingredientName: {
    flex: 2,
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  addIngredientText: {
    color: managerColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.primary,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  imagePickerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: managerColors.primary,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
