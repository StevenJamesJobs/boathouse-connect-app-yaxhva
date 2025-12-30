
import React, { useState, useEffect } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';

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
  ingredients: Ingredient[] | null;
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const SUBCATEGORIES = ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'];

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    subcategory: 'Signature Cocktails',
    glassware: '',
    procedure: '',
    display_order: 0,
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ingredient: '', amount: '' }]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  useEffect(() => {
    loadRecipes();
  }, []);

  useEffect(() => {
    filterRecipes();
  }, [recipes, searchQuery, selectedSubcategory]);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading signature recipes:', error);
        throw error;
      }
      
      console.log('Loaded signature recipes:', data);
      
      // Parse ingredients if they're stored as strings
      const parsedRecipes = (data || []).map(recipe => {
        let ingredients = recipe.ingredients;
        
        // Handle different ingredient formats
        if (typeof ingredients === 'string') {
          try {
            ingredients = JSON.parse(ingredients);
          } catch (e) {
            console.error('Error parsing ingredients for recipe:', recipe.name, e);
            ingredients = [];
          }
        }
        
        // Ensure ingredients is an array
        if (!Array.isArray(ingredients)) {
          ingredients = [];
        }
        
        return {
          ...recipe,
          ingredients: ingredients as Ingredient[],
        };
      });
      
      setRecipes(parsedRecipes);
    } catch (error) {
      console.error('Error loading signature recipes:', error);
      Alert.alert('Error', 'Failed to load signature recipes');
    } finally {
      setLoading(false);
    }
  };

  const filterRecipes = () => {
    let filtered = recipes;

    // Filter by subcategory
    if (selectedSubcategory) {
      filtered = filtered.filter(recipe => recipe.subcategory === selectedSubcategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        recipe =>
          recipe.name.toLowerCase().includes(query) ||
          (recipe.glassware && recipe.glassware.toLowerCase().includes(query)) ||
          (recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.some(ing => 
            ing.ingredient.toLowerCase().includes(query) || 
            ing.amount.toLowerCase().includes(query)
          ))
      );
    }

    setFilteredRecipes(filtered);
  };

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
        console.log('Image selected:', result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      console.log('Starting image upload for signature recipe, URI:', uri);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('File read as base64, length:', base64.length);

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      console.log('Converted to byte array, size:', byteArray.length);

      // Get file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image with filename:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      console.log('Content type:', contentType);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('signature-recipe-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading image to storage:', error);
        Alert.alert('Upload Error', `Failed to upload image: ${error.message}`);
        throw error;
      }

      console.log('Upload successful, data:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('signature-recipe-images')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error in uploadImage function:', error);
      Alert.alert('Error', `Failed to upload image: ${error.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      const newIngredients = ingredients.filter((_, i) => i !== index);
      setIngredients(newIngredients);
    }
  };

  const updateIngredient = (index: number, field: 'ingredient' | 'amount', value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name || !formData.price) {
      Alert.alert('Error', 'Please fill in Name and Price');
      return;
    }

    // Validate ingredients
    const validIngredients = ingredients.filter(ing => ing.ingredient.trim() && ing.amount.trim());
    
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      let thumbnailUrl = editingRecipe?.thumbnail_url || null;

      console.log('Starting save process...');
      console.log('Current thumbnail URL:', thumbnailUrl);
      console.log('Selected image URI:', selectedImageUri);

      // Upload image if selected
      if (selectedImageUri) {
        console.log('Uploading new image...');
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL set:', thumbnailUrl);
        } else {
          console.error('Image upload returned null');
          Alert.alert('Warning', 'Image upload failed. Saving recipe without image.');
        }
      }

      console.log('Final thumbnail URL to save:', thumbnailUrl);
      console.log('Valid ingredients:', validIngredients);

      // Convert ingredients to JSON string
      const ingredientsJson = JSON.stringify(validIngredients);
      console.log('Ingredients JSON:', ingredientsJson);

      if (editingRecipe) {
        // Update existing recipe
        console.log('Updating recipe with ID:', editingRecipe.id);
        const { error } = await supabase.rpc('update_signature_recipe', {
          p_user_id: user.id,
          p_recipe_id: editingRecipe.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJson,
          p_procedure: formData.procedure || '',
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
        // Create new recipe
        console.log('Creating new recipe...');
        const { error } = await supabase.rpc('create_signature_recipe', {
          p_user_id: user.id,
          p_name: formData.name,
          p_price: formData.price,
          p_subcategory: formData.subcategory,
          p_glassware: formData.glassware || null,
          p_ingredients: ingredientsJson,
          p_procedure: formData.procedure || '',
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
      loadRecipes();
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

              // Delete using database function
              const { error } = await supabase.rpc('delete_signature_recipe', {
                p_user_id: user.id,
                p_recipe_id: recipe.id,
              });

              if (error) {
                console.error('Error deleting recipe:', error);
                throw error;
              }

              // Delete image if exists
              if (recipe.thumbnail_url) {
                const fileName = recipe.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('signature-recipe-images')
                    .remove([fileName]);
                }
              }

              Alert.alert('Success', 'Recipe deleted successfully');
              loadRecipes();
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
      subcategory: selectedSubcategory || 'Signature Cocktails',
      glassware: '',
      procedure: '',
      display_order: 0,
    });
    setIngredients([{ ingredient: '', amount: '' }]);
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    console.log('Opening edit modal for recipe:', recipe);
    console.log('Recipe ingredients:', recipe.ingredients);
    
    setEditingRecipe(recipe);
    setFormData({
      name: recipe.name,
      price: recipe.price,
      subcategory: recipe.subcategory || 'Signature Cocktails',
      glassware: recipe.glassware || '',
      procedure: recipe.procedure || '',
      display_order: recipe.display_order,
    });
    
    // Handle ingredients - ensure it's an array
    let recipeIngredients = recipe.ingredients;
    if (!recipeIngredients || !Array.isArray(recipeIngredients) || recipeIngredients.length === 0) {
      recipeIngredients = [{ ingredient: '', amount: '' }];
    }
    
    setIngredients(recipeIngredients);
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingRecipe(null);
    setSelectedImageUri(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  // Helper function to format price with $ sign
  const formatPrice = (price: string) => {
    if (!price) return '$0.00';
    if (price.includes('$')) {
      return price;
    }
    return `$${price}`;
  };

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
        <View style={styles.backButton} />
      </View>

      {/* Add New Recipe Button */}
      <TouchableOpacity style={styles.addNewButton} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={managerColors.text}
        />
        <Text style={styles.addNewButtonText}>Add New Recipe</Text>
      </TouchableOpacity>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={managerColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={managerColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={managerColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Subcategory Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subcategoryScroll}
        contentContainerStyle={styles.subcategoryScrollContent}
      >
        <TouchableOpacity
          style={[
            styles.subcategoryTab,
            selectedSubcategory === null && styles.subcategoryTabActive,
          ]}
          onPress={() => setSelectedSubcategory(null)}
        >
          <Text
            style={[
              styles.subcategoryTabText,
              selectedSubcategory === null && styles.subcategoryTabTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {SUBCATEGORIES.map((subcategory, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.subcategoryTab,
              selectedSubcategory === subcategory && styles.subcategoryTabActive,
            ]}
            onPress={() => setSelectedSubcategory(subcategory)}
          >
            <Text
              style={[
                styles.subcategoryTabText,
                selectedSubcategory === subcategory && styles.subcategoryTabTextActive,
              ]}
            >
              {subcategory}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recipes List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      ) : (
        <ScrollView style={styles.recipesList} contentContainerStyle={styles.recipesListContent}>
          {filteredRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={managerColors.textSecondary}
              />
              <Text style={styles.emptyText}>No recipes found</Text>
              <Text style={styles.emptySubtext}>
                Tap &quot;Add New Recipe&quot; to create one
              </Text>
            </View>
          ) : (
            filteredRecipes.map((recipe, index) => (
              <View key={index} style={styles.recipeCard}>
                <View style={styles.recipeContent}>
                  {recipe.thumbnail_url && (
                    <Image
                      source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                      style={styles.recipeImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeName}>{recipe.name}</Text>
                    <Text style={styles.recipePrice}>{formatPrice(recipe.price)}</Text>
                    {recipe.subcategory && (
                      <View style={styles.subcategoryBadge}>
                        <Text style={styles.subcategoryBadgeText}>{recipe.subcategory}</Text>
                      </View>
                    )}
                    {recipe.glassware && (
                      <View style={styles.glasswareBadge}>
                        <IconSymbol
                          ios_icon_name="wineglass"
                          android_material_icon_name="local-bar"
                          size={14}
                          color={managerColors.textSecondary}
                        />
                        <Text style={styles.glasswareText}>{recipe.glassware}</Text>
                      </View>
                    )}
                    {recipe.thumbnail_url && (
                      <View style={styles.thumbnailIndicator}>
                        <IconSymbol
                          ios_icon_name="photo"
                          android_material_icon_name="image"
                          size={16}
                          color={managerColors.highlight}
                        />
                        <Text style={styles.thumbnailIndicatorText}>Has thumbnail</Text>
                      </View>
                    )}
                    <View style={styles.displayOrderBadge}>
                      <Text style={styles.displayOrderText}>Order: {recipe.display_order}</Text>
                    </View>
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

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
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
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload image</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {selectedImageUri && (
                  <TouchableOpacity 
                    style={styles.removeImageButton}
                    onPress={() => setSelectedImageUri(null)}
                  >
                    <Text style={styles.removeImageButtonText}>Remove Selected Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Name *</Text>
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
                  placeholder="e.g., $12.99"
                  placeholderTextColor="#999999"
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                />
              </View>

              {/* Subcategory */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Subcategory *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {SUBCATEGORIES.map((subcategory, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.subcategory === subcategory && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, subcategory })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.subcategory === subcategory && styles.optionButtonTextActive,
                        ]}
                      >
                        {subcategory}
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
                  placeholder="e.g., Martini glass, Rocks glass"
                  placeholderTextColor="#999999"
                  value={formData.glassware}
                  onChangeText={(text) => setFormData({ ...formData, glassware: text })}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ingredients</Text>
                <Text style={styles.formHint}>
                  Add each ingredient with its amount
                </Text>
                {ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <View style={styles.ingredientInputs}>
                      <TextInput
                        style={[styles.input, styles.ingredientAmountInput]}
                        placeholder="Amount"
                        placeholderTextColor="#999999"
                        value={ingredient.amount}
                        onChangeText={(text) => updateIngredient(index, 'amount', text)}
                      />
                      <TextInput
                        style={[styles.input, styles.ingredientNameInput]}
                        placeholder="Ingredient"
                        placeholderTextColor="#999999"
                        value={ingredient.ingredient}
                        onChangeText={(text) => updateIngredient(index, 'ingredient', text)}
                      />
                    </View>
                    {ingredients.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeIngredientButton}
                        onPress={() => removeIngredient(index)}
                      >
                        <IconSymbol
                          ios_icon_name="minus.circle.fill"
                          android_material_icon_name="remove-circle"
                          size={24}
                          color="#E74C3C"
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
                  <Text style={styles.addIngredientButtonText}>Add Ingredient</Text>
                </TouchableOpacity>
              </View>

              {/* Procedure */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Procedure</Text>
                <Text style={styles.formHint}>
                  Enter the preparation instructions
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g., Shake with ice and strain into glass. Garnish with cherry."
                  placeholderTextColor="#999999"
                  value={formData.procedure}
                  onChangeText={(text) => setFormData({ ...formData, procedure: text })}
                  multiline
                  numberOfLines={6}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter display order (e.g., 1, 2, 3...)"
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>
                  Lower numbers appear first. Items with the same order are sorted alphabetically.
                </Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
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
  addNewButton: {
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
  addNewButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: managerColors.text,
  },
  subcategoryScroll: {
    marginTop: 12,
    maxHeight: 50,
  },
  subcategoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subcategoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 8,
  },
  subcategoryTabActive: {
    backgroundColor: managerColors.highlight,
  },
  subcategoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  subcategoryTabTextActive: {
    color: managerColors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  recipeContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  recipeImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  recipeInfo: {
    flex: 1,
    justifyContent: 'flex-start',
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
    marginBottom: 8,
  },
  subcategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: managerColors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  subcategoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.text,
  },
  glasswareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  glasswareText: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  thumbnailIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  thumbnailIndicatorText: {
    fontSize: 12,
    color: managerColors.highlight,
    fontWeight: '600',
  },
  displayOrderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  displayOrderText: {
    fontSize: 11,
    fontWeight: '600',
    color: managerColors.textSecondary,
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
  formHint: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    fontStyle: 'italic',
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
    height: 120,
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
    height: 200,
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
    height: 200,
    resizeMode: 'cover',
  },
  removeImageButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  removeImageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E74C3C',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ingredientInputs: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  ingredientAmountInput: {
    flex: 1,
  },
  ingredientNameInput: {
    flex: 2,
  },
  removeIngredientButton: {
    padding: 4,
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 8,
    marginTop: 8,
  },
  addIngredientButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
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
