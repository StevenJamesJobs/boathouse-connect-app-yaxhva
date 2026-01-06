
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
import { useRouter } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';

interface SignatureRecipe {
  id: string;
  name: string;
  price: string;
  subcategory: string | null;
  glassware: string | null;
  ingredients: any[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = ['Classics', 'House Specials', 'Seasonal', 'Mocktails'];

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    subcategory: 'Classics',
    glassware: '',
    ingredients: [] as string[],
    procedure: '',
    display_order: 0,
  });
  const [uploading, setUploading] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [ingredientInput, setIngredientInput] = useState('');

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading signature recipes from database...');
      
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading recipes:', error);
        throw error;
      }
      
      console.log('Recipes loaded successfully:', data?.length || 0, 'items');
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Signature recipes editor screen focused, refreshing data...');
      loadRecipes();
    }, [loadRecipes])
  );

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploading(true);
      console.log('Starting image upload for signature recipe');

      // Read the file as base64 (same pattern as profile pages)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array (same pattern as profile pages)
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image:', fileName);

      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      const { data, error } = await supabase.storage
        .from('signature-recipe-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading image:', error);
        throw error;
      }

      console.log('Upload successful:', data);

      const { data: urlData } = supabase.storage
        .from('signature-recipe-images')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      Alert.alert('Error', 'Please fill in name and price');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      if (selectedImageUri) {
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL:', thumbnailUrl);
        }
      }

      // Convert ingredients array to JSONB format
      const ingredientsJsonb = formData.ingredients.map(ing => ({ name: ing }));

      if (editingRecipe) {
        console.log('Updating recipe:', editingRecipe.id);
        console.log('Calling update_signature_recipe with params:', {
          p_user_id: user.id,
          p_recipe_id: editingRecipe.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJsonb,
          p_procedure: formData.procedure || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        const { error } = await supabase.rpc('update_signature_recipe', {
          p_user_id: user.id,
          p_recipe_id: editingRecipe.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJsonb,
          p_procedure: formData.procedure || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error updating recipe:', error);
          throw error;
        }
        console.log('Recipe updated successfully');
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        console.log('Creating new recipe');
        console.log('Calling create_signature_recipe with params:', {
          p_user_id: user.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJsonb,
          p_procedure: formData.procedure || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        const { error } = await supabase.rpc('create_signature_recipe', {
          p_user_id: user.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJsonb,
          p_procedure: formData.procedure || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error creating recipe:', error);
          throw error;
        }
        console.log('Recipe created successfully');
        Alert.alert('Success', 'Recipe created successfully');
      }

      closeModal();
      await loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
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
              if (!user?.id) {
                Alert.alert('Error', 'User not authenticated');
                return;
              }

              console.log('Deleting recipe:', recipe.id);
              
              const { error } = await supabase.rpc('delete_signature_recipe', {
                p_user_id: user.id,
                p_recipe_id: recipe.id,
              });

              if (error) {
                console.error('Error deleting recipe:', error);
                throw error;
              }

              if (recipe.thumbnail_url) {
                const fileName = recipe.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('signature-recipe-images')
                    .remove([fileName]);
                }
              }

              console.log('Recipe deleted successfully');
              Alert.alert('Success', 'Recipe deleted successfully');
              
              await loadRecipes();
            } catch (error: any) {
              console.error('Error deleting recipe:', error);
              Alert.alert('Error', error.message || 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingRecipe(null);
    setFormData({
      name: '',
      price: '',
      subcategory: 'Classics',
      glassware: '',
      ingredients: [],
      procedure: '',
      display_order: recipes.length,
    });
    setSelectedImageUri(null);
    setIngredientInput('');
    setShowEditModal(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    // Extract ingredient names from JSONB array
    const ingredientNames = recipe.ingredients.map((ing: any) => 
      typeof ing === 'string' ? ing : ing.name || ''
    );
    setFormData({
      name: recipe.name,
      price: recipe.price,
      subcategory: recipe.subcategory || 'Classics',
      glassware: recipe.glassware || '',
      ingredients: ingredientNames,
      procedure: recipe.procedure || '',
      display_order: recipe.display_order,
    });
    setSelectedImageUri(null);
    setIngredientInput('');
    setShowEditModal(true);
  };

  const closeModal = () => {
    setShowEditModal(false);
    setEditingRecipe(null);
    setSelectedImageUri(null);
    setIngredientInput('');
  };

  const addIngredient = () => {
    if (ingredientInput.trim()) {
      setFormData({
        ...formData,
        ingredients: [...formData.ingredients, ingredientInput.trim()],
      });
      setIngredientInput('');
    }
  };

  const removeIngredient = (index: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index),
    });
  };

  const handleBackPress = () => {
    router.replace('/bartender-assistant-editor');
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const filteredRecipes = selectedCategory === 'All'
    ? recipes
    : recipes.filter(r => r.subcategory === selectedCategory);

  return (
    <View style={styles.container}>
      {/* Header */}
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

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
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
        {CATEGORIES.map((category, index) => (
          <TouchableOpacity
            key={index}
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

      {/* Recipes List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
          <Text style={styles.loadingText}>Loading recipes...</Text>
        </View>
      ) : (
        <ScrollView style={styles.recipesList} contentContainerStyle={styles.recipesListContent}>
          {filteredRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local_bar"
                size={64}
                color={managerColors.textSecondary}
              />
              <Text style={styles.emptyText}>No recipes found</Text>
              <Text style={styles.emptySubtext}>
                Tap the &quot;Add Recipe&quot; button to create one
              </Text>
            </View>
          ) : (
            filteredRecipes.map((recipe, index) => (
              <View key={index} style={styles.recipeCard}>
                <View style={styles.recipeCardContent}>
                  {recipe.thumbnail_url && (
                    <Image
                      source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                      style={styles.recipeThumbnail}
                      key={getImageUrl(recipe.thumbnail_url)}
                    />
                  )}
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeName}>{recipe.name}</Text>
                    <Text style={styles.recipePrice}>{recipe.price}</Text>
                    {recipe.subcategory && (
                      <Text style={styles.recipeCategory}>{recipe.subcategory}</Text>
                    )}
                    {recipe.glassware && (
                      <Text style={styles.recipeGlassware}>Glass: {recipe.glassware}</Text>
                    )}
                  </View>
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
                      color={managerColors.highlight}
                    />
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(recipe)}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={20}
                      color="#E74C3C"
                    />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            activeOpacity={1} 
            onPress={closeModal}
          />
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
                  color="#666666"
                />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Image Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Thumbnail Image</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {selectedImageUri || editingRecipe?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedImageUri || getImageUrl(editingRecipe?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                      key={selectedImageUri || getImageUrl(editingRecipe?.thumbnail_url || '')}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add_photo_alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload image</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Recipe Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter recipe name"
                  placeholderTextColor="#999999"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              {/* Price */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Price *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter price (e.g., $12)"
                  placeholderTextColor="#999999"
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                />
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {CATEGORIES.map((category, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.subcategory === category && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, subcategory: category })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.subcategory === category && styles.optionButtonTextActive,
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
                <Text style={styles.formLabel}>Glassware</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter glassware type (e.g., Martini Glass)"
                  placeholderTextColor="#999999"
                  value={formData.glassware}
                  onChangeText={(text) => setFormData({ ...formData, glassware: text })}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ingredients</Text>
                <View style={styles.ingredientInputContainer}>
                  <TextInput
                    style={styles.ingredientInput}
                    placeholder="Add ingredient"
                    placeholderTextColor="#999999"
                    value={ingredientInput}
                    onChangeText={setIngredientInput}
                    onSubmitEditing={addIngredient}
                  />
                  <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                    <IconSymbol
                      ios_icon_name="plus.circle.fill"
                      android_material_icon_name="add_circle"
                      size={28}
                      color={managerColors.highlight}
                    />
                  </TouchableOpacity>
                </View>
                {formData.ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientItem}>
                    <Text style={styles.ingredientText}>{ingredient}</Text>
                    <TouchableOpacity onPress={() => removeIngredient(index)}>
                      <IconSymbol
                        ios_icon_name="xmark.circle.fill"
                        android_material_icon_name="cancel"
                        size={24}
                        color="#E74C3C"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Procedure */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Procedure</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter preparation instructions"
                  placeholderTextColor="#999999"
                  value={formData.procedure}
                  onChangeText={(text) => setFormData({ ...formData, procedure: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter display order"
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#1A1A1A" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingRecipe ? 'Update Recipe' : 'Add Recipe'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
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
  categoryScroll: {
    maxHeight: 60,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: managerColors.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  categoryButtonActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  categoryButtonTextActive: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 12,
  },
  recipesList: {
    flex: 1,
    marginTop: 16,
  },
  recipesListContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  recipeCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  recipeCardContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  recipeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  recipeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  recipeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  recipePrice: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
    marginBottom: 4,
  },
  recipeCategory: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 2,
  },
  recipeGlassware: {
    fontSize: 12,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.background,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  deleteButton: {
    backgroundColor: '#2C1F1F',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  deleteButtonText: {
    color: '#E74C3C',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '95%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  imageUploadButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imageUploadPlaceholder: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageUploadText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
  },
  uploadedImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  optionsScroll: {
    maxHeight: 50,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionButtonActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  optionButtonTextActive: {
    color: '#1A1A1A',
  },
  ingredientInputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  ingredientInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  addIngredientButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  ingredientText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
});
