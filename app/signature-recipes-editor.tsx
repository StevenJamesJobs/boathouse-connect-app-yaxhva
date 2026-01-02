
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter } from 'expo-router';
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
import * as FileSystem from 'expo-file-system/legacy';
import { managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';

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
  ingredients: Ingredient[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const SUBCATEGORIES = [
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
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  addButton: {
    backgroundColor: managerColors.highlight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 10,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: managerColors.text,
    padding: 0,
  },
  subcategoryScroll: {
    maxHeight: 40,
    marginBottom: 16,
  },
  subcategoryScrollContent: {
    gap: 8,
  },
  subcategoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: managerColors.card,
    marginRight: 8,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  subcategoryTabActive: {
    backgroundColor: managerColors.highlight,
  },
  subcategoryTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  subcategoryTabTextActive: {
    color: managerColors.text,
  },
  recipeCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  recipeImage: {
    width: '100%',
    height: 200,
  },
  recipeContent: {
    padding: 16,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recipeName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginRight: 12,
  },
  recipePrice: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  recipeSubcategory: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 8,
  },
  recipeGlassware: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 12,
  },
  ingredientsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 6,
  },
  ingredientItem: {
    fontSize: 13,
    color: managerColors.textSecondary,
    marginBottom: 4,
  },
  recipeProcedure: {
    fontSize: 13,
    color: managerColors.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: managerColors.highlight,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 40,
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
    backgroundColor: managerColors.background,
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
    borderBottomColor: managerColors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
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
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
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
  ingredientsContainer: {
    gap: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  ingredientInputContainer: {
    flex: 1,
  },
  ingredientInput: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  removeIngredientButton: {
    backgroundColor: '#F44336',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  addIngredientButton: {
    backgroundColor: managerColors.highlight,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addIngredientButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  submitButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});

export default function SignatureRecipesEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<SignatureRecipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<SignatureRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SignatureRecipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [glassware, setGlassware] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ingredient: '', amount: '' }]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const filterRecipes = useCallback(() => {
    let filtered = recipes;

    // Filter by subcategory
    if (selectedSubcategory) {
      filtered = filtered.filter((recipe) => recipe.subcategory === selectedSubcategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(query) ||
          recipe.subcategory?.toLowerCase().includes(query) ||
          recipe.glassware?.toLowerCase().includes(query) ||
          recipe.ingredients.some(
            (ing) =>
              ing.ingredient.toLowerCase().includes(query) ||
              ing.amount.toLowerCase().includes(query)
          )
      );
    }

    setFilteredRecipes(filtered);
  }, [recipes, searchQuery, selectedSubcategory]);

  useEffect(() => {
    filterRecipes();
  }, [filterRecipes]);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_recipes')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
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
    try {
      setUploadingImage(true);

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      const fileName = `signature-recipe-${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.storage
        .from('signature-recipes')
        .upload(fileName, decode(base64), {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('signature-recipes').getPublicUrl(data.path);

      setThumbnailUrl(publicUrl);
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: 'ingredient' | 'amount', value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
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

      // Filter out empty ingredients
      const validIngredients = ingredients.filter(
        (ing) => ing.ingredient.trim() && ing.amount.trim()
      );

      if (validIngredients.length === 0) {
        Alert.alert('Error', 'Please add at least one ingredient');
        return;
      }

      setLoading(true);

      const recipeData = {
        name: name.trim(),
        price: price.trim(),
        subcategory: subcategory || null,
        glassware: glassware.trim() || null,
        ingredients: validIngredients,
        procedure: procedure.trim() || null,
        thumbnail_url: thumbnailUrl,
        display_order: editingRecipe ? editingRecipe.display_order : recipes.length,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (editingRecipe) {
        const { error } = await supabase
          .from('signature_recipes')
          .update(recipeData)
          .eq('id', editingRecipe.id);

        if (error) throw error;
        Alert.alert('Success', 'Recipe updated successfully');
      } else {
        const { error } = await supabase.from('signature_recipes').insert({
          ...recipeData,
          created_by: user?.id,
        });

        if (error) throw error;
        Alert.alert('Success', 'Recipe added successfully');
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
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
              .from('signature_recipes')
              .update({ is_active: false })
              .eq('id', recipe.id);

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
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (recipe: SignatureRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setSubcategory(recipe.subcategory || '');
    setGlassware(recipe.glassware || '');
    setIngredients(recipe.ingredients.length > 0 ? recipe.ingredients : [{ ingredient: '', amount: '' }]);
    setProcedure(recipe.procedure || '');
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
    setSubcategory('');
    setGlassware('');
    setIngredients([{ ingredient: '', amount: '' }]);
    setProcedure('');
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('signature-recipes').getPublicUrl(url);
    return data.publicUrl;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

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
        <Text style={styles.headerTitle}>Signature Recipes Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
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

        {/* Search Box */}
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
          {SUBCATEGORIES.map((sub, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.subcategoryTab,
                selectedSubcategory === sub && styles.subcategoryTabActive,
              ]}
              onPress={() => setSelectedSubcategory(sub)}
            >
              <Text
                style={[
                  styles.subcategoryTabText,
                  selectedSubcategory === sub && styles.subcategoryTabTextActive,
                ]}
              >
                {sub}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recipes List */}
        {filteredRecipes.length === 0 ? (
          <Text style={styles.emptyText}>No recipes found</Text>
        ) : (
          filteredRecipes.map((recipe, index) => (
            <View key={index} style={styles.recipeCard}>
              {recipe.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(recipe.thumbnail_url) || undefined }}
                  style={styles.recipeImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.recipeContent}>
                <View style={styles.recipeHeader}>
                  <Text style={styles.recipeName}>{recipe.name}</Text>
                  <Text style={styles.recipePrice}>{formatPrice(recipe.price)}</Text>
                </View>
                {recipe.subcategory && (
                  <Text style={styles.recipeSubcategory}>{recipe.subcategory}</Text>
                )}
                {recipe.glassware && (
                  <Text style={styles.recipeGlassware}>Glassware: {recipe.glassware}</Text>
                )}
                {recipe.ingredients.length > 0 && (
                  <React.Fragment>
                    <Text style={styles.ingredientsTitle}>Ingredients:</Text>
                    {recipe.ingredients.map((ing, idx) => (
                      <Text key={idx} style={styles.ingredientItem}>
                        • {ing.amount} {ing.ingredient}
                      </Text>
                    ))}
                  </React.Fragment>
                )}
                {recipe.procedure && (
                  <Text style={styles.recipeProcedure}>{recipe.procedure}</Text>
                )}
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
            </View>
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
                  placeholder="e.g., 12 or $12"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              {/* Subcategory */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Subcategory</Text>
                <View style={styles.picker}>
                  {SUBCATEGORIES.map((sub, index) => (
                    <TouchableOpacity
                      key={index}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        backgroundColor:
                          subcategory === sub ? managerColors.highlight : 'transparent',
                      }}
                      onPress={() => setSubcategory(sub)}
                    >
                      <Text
                        style={{
                          color: managerColors.text,
                          fontWeight: subcategory === sub ? '600' : '400',
                        }}
                      >
                        {sub}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Glassware */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Glassware</Text>
                <TextInput
                  style={styles.formInput}
                  value={glassware}
                  onChangeText={setGlassware}
                  placeholder="e.g., Martini Glass, Rocks Glass"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Ingredients *</Text>
                <View style={styles.ingredientsContainer}>
                  {ingredients.map((ing, index) => (
                    <View key={index} style={styles.ingredientRow}>
                      <View style={styles.ingredientInputContainer}>
                        <TextInput
                          style={styles.ingredientInput}
                          value={ing.amount}
                          onChangeText={(text) => updateIngredient(index, 'amount', text)}
                          placeholder="Amount (e.g., 2 oz)"
                          placeholderTextColor={managerColors.textSecondary}
                        />
                      </View>
                      <View style={[styles.ingredientInputContainer, { flex: 2 }]}>
                        <TextInput
                          style={styles.ingredientInput}
                          value={ing.ingredient}
                          onChangeText={(text) => updateIngredient(index, 'ingredient', text)}
                          placeholder="Ingredient"
                          placeholderTextColor={managerColors.textSecondary}
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
                            size={20}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                    <Text style={styles.addIngredientButtonText}>+ Add Ingredient</Text>
                  </TouchableOpacity>
                </View>
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
                    source={{ uri: getImageUrl(thumbnailUrl) || undefined }}
                    style={styles.thumbnailPreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSave}
                disabled={loading || uploadingImage}
              >
                {loading ? (
                  <ActivityIndicator color={managerColors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingRecipe ? 'Update Recipe' : 'Add Recipe'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
