
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/IconSymbol';
import { managerColors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
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
  'Long Island Iced Teas',
  'Margaritas',
  'Frozen Drinks',
];

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Signature Cocktails');
  
  // Form fields
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature-recipes')
        .select('*')
        .eq('is_active', true)
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
    return recipes.filter((recipe) => recipe.subcategory === selectedCategory);
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
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = decode(base64);

      const fileExt = uri.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
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

      setThumbnailUrl(publicUrl);
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    try {
      setSaving(true);

      const ingredientsJson = ingredients.filter(
        (ing) => ing.ingredient.trim() || ing.amount.trim()
      );

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory: subcategory || null,
        glassware: glassware.trim() || null,
        ingredients: ingredientsJson,
        procedure: procedure.trim() || null,
        thumbnail_url: thumbnailUrl || null,
        display_order: displayOrder,
        is_active: true,
      };

      if (editingRecipe) {
        const { error } = await supabase
          .from('signature-recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('signature-recipes').insert([recipeData]);

        if (error) throw error;
      }

      Alert.alert('Success', 'Recipe saved successfully');
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
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('signature-recipes')
              .update({ is_active: false })
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
    setThumbnailUrl('');
    setDisplayOrder(recipes.length);
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
    setThumbnailUrl(recipe.thumbnail_url || '');
    setDisplayOrder(recipe.display_order);
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

  const filteredRecipes = filterRecipesByCategory();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Add Recipe Button */}
      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>

      {/* Category Filter - REDUCED HEIGHT */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
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

      {/* Recipe List */}
      {loading ? (
        <ActivityIndicator size="large" color={managerColors.primary} style={styles.loader} />
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {filteredRecipes.length === 0 ? (
            <Text style={styles.emptyText}>No recipes in this category</Text>
          ) : (
            filteredRecipes.map((recipe) => (
              <View key={recipe.id} style={styles.recipeCard}>
                <Image
                  source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }}
                  style={styles.recipeThumbnail}
                  defaultSource={require('@/assets/images/final_quest_240x240.png')}
                />
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeName}>{recipe.name}</Text>
                  <Text style={styles.recipePrice}>{recipe.price}</Text>
                  <Text style={styles.recipeGlassware}>{recipe.glassware}</Text>
                </View>
                <View style={styles.recipeActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(recipe)}
                  >
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color="#4A90E2" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(recipe)}
                  >
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.modalSave, saving && styles.modalSaveDisabled]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Thumbnail */}
            <TouchableOpacity style={styles.thumbnailPicker} onPress={pickImage}>
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailPreview} />
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <IconSymbol ios_icon_name="photo" android_material_icon_name="photo" size={40} color="#999" />
                  <Text style={styles.thumbnailPlaceholderText}>Add Thumbnail</Text>
                </View>
              )}
              {uploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
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
              placeholderTextColor="#999"
            />

            {/* Price */}
            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="e.g., $18"
              placeholderTextColor="#999"
            />

            {/* Subcategory */}
            <Text style={styles.label}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.subcategoryScroll}
            >
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
            </ScrollView>

            {/* Glassware */}
            <Text style={styles.label}>Glassware</Text>
            <TextInput
              style={styles.input}
              value={glassware}
              onChangeText={setGlassware}
              placeholder="e.g., Large Rocks Glass"
              placeholderTextColor="#999"
            />

            {/* Ingredients */}
            <Text style={styles.label}>Ingredients</Text>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.input, styles.ingredientAmount]}
                  value={ingredient.amount}
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
                  value={ingredient.ingredient}
                  onChangeText={(text) => {
                    const newIngredients = [...ingredients];
                    newIngredients[index].ingredient = text;
                    setIngredients(newIngredients);
                  }}
                  placeholder="Ingredient"
                  placeholderTextColor="#999"
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeIngredientButton}
                    onPress={() => removeIngredient(index)}
                  >
                    <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color="#E74C3C" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={managerColors.primary} />
              <Text style={styles.addIngredientText}>Add Ingredient</Text>
            </TouchableOpacity>

            {/* Procedure */}
            <Text style={styles.label}>Procedure</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={procedure}
              onChangeText={setProcedure}
              placeholder="Enter preparation instructions"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.accent,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryScroll: {
    maxHeight: 45,
    marginBottom: 10,
  },
  categoryScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 5,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#2C3E50',
  },
  categoryButtonActive: {
    backgroundColor: managerColors.accent,
  },
  categoryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#2C3E50',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  recipeThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#1A252F',
  },
  recipeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 14,
    color: managerColors.accent,
    marginBottom: 2,
  },
  recipeGlassware: {
    fontSize: 12,
    color: '#999',
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 8,
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    borderRadius: 8,
  },
  deleteButton: {
    padding: 8,
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalCancel: {
    color: '#fff',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalSave: {
    color: managerColors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  thumbnailPicker: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#2C3E50',
    marginBottom: 20,
    overflow: 'hidden',
  },
  thumbnailPreview: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    color: '#999',
    marginTop: 8,
    fontSize: 14,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2C3E50',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  subcategoryScroll: {
    marginBottom: 16,
  },
  subcategoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#2C3E50',
  },
  subcategoryButtonActive: {
    backgroundColor: managerColors.accent,
  },
  subcategoryButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  subcategoryButtonTextActive: {
    fontWeight: '700',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientAmount: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  ingredientName: {
    flex: 2,
    marginRight: 8,
    marginBottom: 0,
  },
  removeIngredientButton: {
    padding: 4,
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  addIngredientText: {
    color: managerColors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});
