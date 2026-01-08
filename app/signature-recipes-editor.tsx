
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
  { label: 'All', value: null },
  { label: 'Signature Cocktails', value: 'Signature Cocktails' },
  { label: 'Martinis', value: 'Martinis' },
  { label: 'Sangria', value: 'Sangria' },
  { label: 'Low ABV', value: 'Low ABV' },
  { label: 'Zero ABV', value: 'Zero ABV' },
];

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState<string>('Signature Cocktails');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature-recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRecipes(data || []);
      filterRecipesByCategory(data || [], selectedCategory);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

  const filterRecipesByCategory = (recipesToFilter: SignatureRecipe[], category: string | null) => {
    if (!category) {
      setFilteredRecipes(recipesToFilter);
    } else {
      setFilteredRecipes(recipesToFilter.filter((r) => r.subcategory === category));
    }
  };

  useEffect(() => {
    filterRecipesByCategory(recipes, selectedCategory);
  }, [selectedCategory, recipes]);

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

  const uploadImage = async (uri: string): Promise<string> => {
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
        .getPublicUrl(fileName);

      return urlData.publicUrl;
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

    try {
      setSaving(true);

      let thumbnailUrl = editingRecipe?.thumbnail_url || null;
      if (thumbnailUri) {
        thumbnailUrl = await uploadImage(thumbnailUri);
      }

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory,
        glassware: glassware.trim() || null,
        ingredients: ingredients.filter((ing) => ing.ingredient.trim()),
        procedure: procedure.trim() || null,
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
        const { error } = await supabase.from('signature-recipes').insert([recipeData]);

        if (error) throw error;
        Alert.alert('Success', 'Recipe added successfully');
      }

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
            const { error } = await supabase.from('signature-recipes').delete().eq('id', recipe.id);

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
    setThumbnailUri(null);
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
    return `${supabase.storage.from('signature-recipe-images').getPublicUrl('').data.publicUrl}${url}`;
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
          <IconSymbol name="arrow_back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <IconSymbol name="add" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.label}
            style={[
              styles.categoryButton,
              selectedCategory === cat.value && styles.categoryButtonActive,
            ]}
            onPress={() => setSelectedCategory(cat.value)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                selectedCategory === cat.value && styles.categoryButtonTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recipe List */}
      <ScrollView style={styles.content}>
        {filteredRecipes.length === 0 ? (
          <Text style={styles.emptyText}>No recipes found. Tap "Add Recipe" to create one.</Text>
        ) : (
          filteredRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              {recipe.thumbnail_url && (
                <Image source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }} style={styles.thumbnail} />
              )}
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipePrice}>${recipe.price}</Text>
                {recipe.subcategory && (
                  <Text style={styles.recipeCategory}>{recipe.subcategory}</Text>
                )}
              </View>
              <View style={styles.recipeActions}>
                <TouchableOpacity onPress={() => openEditModal(recipe)} style={styles.actionButton}>
                  <IconSymbol name="edit" size={20} color={managerColors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(recipe)} style={styles.actionButton}>
                  <IconSymbol name="delete" size={20} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <IconSymbol name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <IconSymbol name="check" size={24} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Recipe name"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.categorySelector}>
              {CATEGORIES.filter((c) => c.value).map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categorySelectorButton,
                    subcategory === cat.value && styles.categorySelectorButtonActive,
                  ]}
                  onPress={() => setSubcategory(cat.value!)}
                >
                  <Text
                    style={[
                      styles.categorySelectorText,
                      subcategory === cat.value && styles.categorySelectorTextActive,
                    ]}
                  >
                    {cat.label}
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
              placeholderTextColor="#999"
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
                  placeholderTextColor="#999"
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
                  placeholderTextColor="#999"
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(index)}>
                    <IconSymbol name="remove_circle" size={24} color="#e74c3c" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
              <IconSymbol name="add" size={20} color={managerColors.primary} />
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
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Display Order</Text>
            <TextInput
              style={styles.input}
              value={displayOrder}
              onChangeText={setDisplayOrder}
              placeholder="0"
              keyboardType="number-pad"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Thumbnail</Text>
            <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
              {thumbnailUri || editingRecipe?.thumbnail_url ? (
                <Image
                  source={{
                    uri: thumbnailUri || getImageUrl(editingRecipe?.thumbnail_url || null) || undefined,
                  }}
                  style={styles.thumbnailPreview}
                />
              ) : (
                <>
                  <IconSymbol name="add_photo_alternate" size={40} color="#999" />
                  <Text style={styles.imagePickerText}>Select Image</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
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
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.primary,
    margin: 15,
    padding: 15,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryScroll: {
    maxHeight: 50,
    marginBottom: 10,
  },
  categoryScrollContent: {
    paddingHorizontal: 15,
    gap: 10,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: managerColors.primary,
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
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
    color: managerColors.primary,
    fontWeight: '500',
    marginBottom: 4,
  },
  recipeCategory: {
    fontSize: 12,
    color: '#666',
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    padding: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.primary,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalContent: {
    flex: 1,
    padding: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categorySelectorButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categorySelectorButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  categorySelectorText: {
    fontSize: 14,
    color: '#666',
  },
  categorySelectorTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
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
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginTop: 10,
  },
  addIngredientText: {
    marginLeft: 8,
    color: managerColors.primary,
    fontWeight: '600',
  },
  imagePickerButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    marginTop: 8,
    color: '#999',
    fontSize: 14,
  },
  thumbnailPreview: {
    width: 150,
    height: 150,
    borderRadius: 8,
  },
});
