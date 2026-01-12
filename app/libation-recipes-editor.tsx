
import React, { useState, useEffect, useCallback } from 'react';
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
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';

interface LibationRecipe {
  id: string;
  name: string;
  price: string;
  category: string;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const CATEGORIES = [
  'Featured',
  'Signature Cocktails',
  'Martinis',
  'Sangrias',
  'Low ABV',
  'No ABV',
];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function LibationRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<LibationRecipe | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [glassware, setGlassware] = useState('');
  const [garnish, setGarnish] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading libation recipes from table: libation_recipes');
      const { data, error } = await supabase
        .from('libation_recipes')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading libation recipes:', error);
        throw error;
      }
      console.log('Loaded libation recipes:', data);
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading libation recipes:', error);
      Alert.alert('Error', 'Failed to load libation recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to upload images');
      return;
    }

    try {
      setUploadingImage(true);
      console.log('Starting image upload for user:', user.id);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Create file name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      console.log('Uploading file to libation-recipe-images bucket:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('libation-recipe-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('libation-recipe-images')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);
      setThumbnailUrl(urlData.publicUrl);
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter a recipe name');
        return;
      }

      if (!price.trim()) {
        Alert.alert('Error', 'Please enter a price');
        return;
      }

      if (!category) {
        Alert.alert('Error', 'Please select a category');
        return;
      }

      // Validate ingredients
      const validIngredients = ingredients.filter(
        (ing) => ing.amount.trim() && ing.ingredient.trim()
      );

      if (validIngredients.length === 0) {
        Alert.alert('Error', 'Please add at least one ingredient');
        return;
      }

      if (!user?.id) {
        Alert.alert('Error', 'You must be logged in to save recipes');
        return;
      }

      setLoading(true);

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        category: category,
        glassware: glassware.trim() || null,
        garnish: garnish.trim() || null,
        ingredients: validIngredients,
        procedure: procedure.trim() || null,
        thumbnail_url: thumbnailUrl,
        display_order: displayOrder.trim() ? parseInt(displayOrder.trim()) : (editingRecipe?.display_order || recipes.length),
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (editingRecipe) {
        // Update existing recipe
        console.log('Updating libation recipe:', editingRecipe.id);
        const { error } = await supabase
          .from('libation_recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) {
          console.error('Error updating libation recipe:', error);
          throw error;
        }
        console.log('Libation recipe updated successfully');
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        // Insert new recipe
        console.log('Adding new libation recipe');
        const { error } = await supabase
          .from('libation_recipes')
          .insert(recipeData);

        if (error) {
          console.error('Error adding libation recipe:', error);
          throw error;
        }
        console.log('Libation recipe added successfully');
        Alert.alert('Success', 'Recipe added successfully');
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving libation recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipe: LibationRecipe) => {
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('Deleting libation recipe:', recipe.id);
            const { error } = await supabase
              .from('libation_recipes')
              .update({ is_active: false })
              .eq('id', recipe.id);

            if (error) {
              console.error('Error deleting libation recipe:', error);
              throw error;
            }
            Alert.alert('Success', 'Recipe deleted successfully');
            loadRecipes();
          } catch (error: any) {
            console.error('Error deleting libation recipe:', error);
            Alert.alert('Error', error.message || 'Failed to delete recipe');
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (recipe: LibationRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setCategory(recipe.category);
    setGlassware(recipe.glassware || '');
    setGarnish(recipe.garnish || '');
    setIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ amount: '', ingredient: '' }]
    );
    setProcedure(recipe.procedure || '');
    setDisplayOrder(recipe.display_order.toString());
    setThumbnailUrl(recipe.thumbnail_url);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingRecipe(null);
    setName('');
    setPrice('');
    setCategory('');
    setGlassware('');
    setGarnish('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setDisplayOrder('');
    setThumbnailUrl(null);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { amount: '', ingredient: '' }]);
  };

  const removeIngredient = (index: number) => {
    const newIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(newIngredients.length > 0 ? newIngredients : [{ amount: '', ingredient: '' }]);
  };

  const updateIngredient = (index: number, field: 'amount' | 'ingredient', value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('libation-recipe-images').getPublicUrl(url);
    return data.publicUrl;
  };

  // Group recipes by category
  const recipesByCategory = CATEGORIES.reduce((acc, cat) => {
    const categoryRecipes = recipes.filter((r) => r.category === cat);
    if (categoryRecipes.length > 0) {
      acc[cat] = categoryRecipes;
    }
    return acc;
  }, {} as Record<string, LibationRecipe[]>);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
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
        <Text style={styles.headerTitle}>Libation Recipes Editor</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {/* Add Button */}
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={managerColors.text}
          />
          <Text style={styles.addButtonText}>Add Recipe</Text>
        </TouchableOpacity>

        {/* Recipes List by Category */}
        {Object.keys(recipesByCategory).length === 0 ? (
          <Text style={styles.emptyText}>No recipes found. Add your first recipe!</Text>
        ) : (
          Object.entries(recipesByCategory).map(([cat, categoryRecipes], categoryIndex) => (
            <React.Fragment key={categoryIndex}>
              {/* Category Header */}
              <Text style={styles.categoryTitle}>{cat}</Text>
              
              {/* Horizontal Scrollable Recipe Cards */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalScroll}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {categoryRecipes.map((recipe, index) => (
                  <View key={index} style={styles.recipeCard}>
                    <Image
                      source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                      style={styles.recipeThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.recipeInfo}>
                      <Text style={styles.recipeName} numberOfLines={2}>{recipe.name}</Text>
                      <Text style={styles.recipePrice}>{recipe.price}</Text>
                    </View>
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
                ))}
              </ScrollView>
            </React.Fragment>
          ))
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Image Upload */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Recipe Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={styles.imagePickerButtonText}>
                    {uploadingImage ? 'Uploading...' : 'Choose Image'}
                  </Text>
                </TouchableOpacity>
                {thumbnailUrl && (
                  <Image
                    source={{ uri: getImageUrl(thumbnailUrl) }}
                    style={styles.thumbnailPreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Category */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Category *</Text>
                <View style={styles.picker}>
                  {CATEGORIES.map((cat, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.pickerOption,
                        category === cat && styles.pickerOptionActive
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          category === cat && styles.pickerOptionTextActive
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Recipe Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter recipe name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Price */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Price *</Text>
                <TextInput
                  style={styles.formInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g., $12.00"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Glassware */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Glassware</Text>
                <TextInput
                  style={styles.formInput}
                  value={glassware}
                  onChangeText={setGlassware}
                  placeholder="e.g., Martini Glass"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Garnish */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Garnish</Text>
                <TextInput
                  style={styles.formInput}
                  value={garnish}
                  onChangeText={setGarnish}
                  placeholder="e.g., Lemon Twist"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Ingredients *</Text>
                {ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <TextInput
                      style={[styles.formInput, styles.ingredientAmount]}
                      value={ingredient.amount}
                      onChangeText={(value) => updateIngredient(index, 'amount', value)}
                      placeholder="Amount"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    <TextInput
                      style={[styles.formInput, styles.ingredientName]}
                      value={ingredient.ingredient}
                      onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                      placeholder="Ingredient"
                      placeholderTextColor={managerColors.textSecondary}
                    />
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeIngredientButton}
                        onPress={() => removeIngredient(index)}
                      >
                        <IconSymbol
                          ios_icon_name="minus.circle.fill"
                          android_material_icon_name="remove-circle"
                          size={24}
                          color="#F44336"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                  <IconSymbol
                    ios_icon_name="plus.circle.fill"
                    android_material_icon_name="add-circle"
                    size={20}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.addIngredientText}>Add Ingredient</Text>
                </TouchableOpacity>
              </View>

              {/* Procedure */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Procedure</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder="Enter preparation instructions"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.formInput}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  placeholder="Enter display order (optional)"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeModal}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleSave}
                  disabled={loading || uploadingImage}
                >
                  {loading ? (
                    <ActivityIndicator color={managerColors.text} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {editingRecipe ? 'Update' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
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
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingTop: 20,
    paddingBottom: 100,
  },
  addButton: {
    backgroundColor: managerColors.highlight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginTop: 16,
    marginBottom: 12,
    marginLeft: 16,
  },
  horizontalScroll: {
    marginBottom: 8,
  },
  horizontalScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  recipeCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    width: 180,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  recipeThumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  recipeInfo: {
    marginBottom: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    backgroundColor: managerColors.highlight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: managerColors.text,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 40,
    marginHorizontal: 16,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalForm: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  pickerOptionActive: {
    backgroundColor: managerColors.highlight,
  },
  pickerOptionText: {
    color: '#1A1A1A',
    fontWeight: '400',
  },
  pickerOptionTextActive: {
    color: managerColors.text,
    fontWeight: '600',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  ingredientAmount: {
    flex: 1,
  },
  ingredientName: {
    flex: 2,
  },
  removeIngredientButton: {
    padding: 4,
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  addIngredientText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  imagePickerButton: {
    backgroundColor: managerColors.highlight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  thumbnailPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  submitButton: {
    flex: 1,
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});
