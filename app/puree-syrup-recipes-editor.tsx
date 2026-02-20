
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

interface PureeSyrupRecipe {
  id: string;
  name: string;
  category: string;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const CATEGORIES = ['Purees', 'Simple Syrups'];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1587049352846-4a222e784acc?w=400&h=400&fit=crop';

export default function PureeSyrupRecipesEditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [recipes, setRecipes] = useState<PureeSyrupRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PureeSyrupRecipe | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
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
      console.log('Loading puree syrup recipes from table: puree_syrup_recipes');
      const { data, error } = await supabase
        .from('puree_syrup_recipes')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading puree syrup recipes:', error);
        throw error;
      }
      console.log('Loaded puree syrup recipes:', data);
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading puree syrup recipes:', error);
      Alert.alert(t('common:error'), t('puree_editor:load_error'));
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
      Alert.alert(t('common:error'), t('puree_editor:pick_image_error'));
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) {
      Alert.alert(t('common:error'), t('puree_editor:error_not_authenticated'));
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
      
      console.log('Uploading file to puree-syrup-recipe-images bucket:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('puree-syrup-recipe-images')
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
        .from('puree-syrup-recipe-images')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);
      setThumbnailUrl(urlData.publicUrl);
      Alert.alert(t('common:success'), t('puree_editor:updated_success'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common:error'), error.message || t('puree_editor:upload_image_error'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert(t('common:error'), t('puree_editor:error_fill_fields'));
        return;
      }

      if (!category) {
        Alert.alert(t('common:error'), t('puree_editor:error_fill_fields'));
        return;
      }

      // Validate ingredients
      const validIngredients = ingredients.filter(
        (ing) => ing.amount.trim() && ing.ingredient.trim()
      );

      if (validIngredients.length === 0) {
        Alert.alert(t('common:error'), t('puree_editor:error_ingredients'));
        return;
      }

      if (!user?.id) {
        Alert.alert(t('common:error'), t('puree_editor:error_not_authenticated'));
        return;
      }

      setLoading(true);

      if (editingRecipe) {
        // Update existing recipe using RPC function
        console.log('Updating puree syrup recipe:', editingRecipe.id);
        const { data, error } = await supabase.rpc('update_puree_syrup_recipe', {
          p_user_id: user.id,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_category: category,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: displayOrder.trim() ? parseInt(displayOrder.trim()) : editingRecipe.display_order,
        });

        if (error) {
          console.error('Error updating puree syrup recipe:', error);
          throw error;
        }
        console.log('Puree syrup recipe updated successfully');
        Alert.alert(t('common:success'), t('puree_editor:updated_success'));
      } else {
        // Insert new recipe using RPC function
        console.log('Adding new puree syrup recipe');
        const { data, error } = await supabase.rpc('insert_puree_syrup_recipe', {
          p_user_id: user.id,
          p_name: name.trim(),
          p_category: category,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: displayOrder.trim() ? parseInt(displayOrder.trim()) : recipes.length,
        });

        if (error) {
          console.error('Error adding puree syrup recipe:', error);
          throw error;
        }
        console.log('Puree syrup recipe added successfully');
        Alert.alert(t('common:success'), t('puree_editor:created_success'));
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving puree syrup recipe:', error);
      Alert.alert(t('common:error'), error.message || t('puree_editor:save_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipe: PureeSyrupRecipe) => {
    Alert.alert(t('puree_editor:delete_title'), t('puree_editor:delete_confirm', { name: recipe.name }), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!user?.id) {
              Alert.alert(t('common:error'), t('puree_editor:error_not_authenticated'));
              return;
            }

            console.log('Deleting puree syrup recipe:', recipe.id);
            const { error } = await supabase.rpc('delete_puree_syrup_recipe', {
              p_user_id: user.id,
              p_recipe_id: recipe.id,
            });

            if (error) {
              console.error('Error deleting puree syrup recipe:', error);
              throw error;
            }
            Alert.alert(t('common:success'), t('puree_editor:deleted_success'));
            loadRecipes();
          } catch (error: any) {
            console.error('Error deleting puree syrup recipe:', error);
            Alert.alert(t('common:error'), error.message || t('puree_editor:delete_error'));
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (recipe: PureeSyrupRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setCategory(recipe.category);
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
    setCategory('');
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
    const { data } = supabase.storage.from('puree-syrup-recipe-images').getPublicUrl(url);
    return data.publicUrl;
  };

  // Group recipes by category
  const recipesByCategory = CATEGORIES.reduce((acc, cat) => {
    const categoryRecipes = recipes.filter((r) => r.category === cat);
    if (categoryRecipes.length > 0) {
      acc[cat] = categoryRecipes;
    }
    return acc;
  }, {} as Record<string, PureeSyrupRecipe[]>);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('puree_editor:title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {/* Add Button */}
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.highlight }]} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={colors.text}
          />
          <Text style={[styles.addButtonText, { color: colors.text }]}>{t('puree_editor:add_button')}</Text>
        </TouchableOpacity>

        {/* Recipes List by Category */}
        {Object.keys(recipesByCategory).length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('puree_editor:empty_title')}</Text>
        ) : (
          Object.entries(recipesByCategory).map(([cat, categoryRecipes], categoryIndex) => (
            <React.Fragment key={categoryIndex}>
              {/* Category Header */}
              <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat}</Text>

              {/* Horizontal Scrollable Recipe Cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalScroll}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {categoryRecipes.map((recipe, index) => (
                  <View key={index} style={[styles.recipeCard, { backgroundColor: colors.card }]}>
                    <Image
                      source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                      style={styles.recipeThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.recipeInfo}>
                      <Text style={[styles.recipeName, { color: colors.text }]} numberOfLines={2}>{recipe.name}</Text>
                    </View>
                    <View style={styles.recipeActions}>
                      <TouchableOpacity
                        style={[styles.editButton, { backgroundColor: colors.highlight }]}
                        onPress={() => openEditModal(recipe)}
                      >
                        <Text style={[styles.buttonText, { color: colors.text }]}>{t('common:edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(recipe)}
                      >
                        <Text style={[styles.buttonText, { color: colors.text }]}>{t('common:delete')}</Text>
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
          <ActivityIndicator size="large" color={colors.highlight} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? t('puree_editor:modal_edit') : t('puree_editor:modal_add')}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              contentContainerStyle={styles.modalFormContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Image Upload */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('puree_editor:image_label')}</Text>
                <TouchableOpacity
                  style={[styles.imagePickerButton, { backgroundColor: colors.highlight }]}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={[styles.imagePickerButtonText, { color: colors.text }]}>
                    {thumbnailUrl ? t('puree_editor:change_image_button') : t('puree_editor:pick_image_button')}
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
                <Text style={styles.formLabel}>{t('puree_editor:category_label')}</Text>
                <View style={styles.picker}>
                  {CATEGORIES.map((cat, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.pickerOption,
                        category === cat && { backgroundColor: colors.highlight }
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          category === cat && { color: colors.text, fontWeight: '600' }
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
                <Text style={styles.formLabel}>{t('puree_editor:name_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('puree_editor:name_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Ingredients */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('puree_editor:ingredients_label')}</Text>
                {ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <TextInput
                      style={[styles.formInput, styles.ingredientAmount]}
                      value={ingredient.amount}
                      onChangeText={(value) => updateIngredient(index, 'amount', value)}
                      placeholder={t('puree_editor:amount_placeholder')}
                      placeholderTextColor={colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.formInput, styles.ingredientName]}
                      value={ingredient.ingredient}
                      onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                      placeholder={t('puree_editor:ingredient_placeholder')}
                      placeholderTextColor={colors.textSecondary}
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
                    color={colors.highlight}
                  />
                  <Text style={[styles.addIngredientText, { color: colors.highlight }]}>{t('puree_editor:add_ingredient')}</Text>
                </TouchableOpacity>
              </View>

              {/* Procedure */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('puree_editor:procedure_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder={t('puree_editor:procedure_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('puree_editor:display_order_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  placeholder={t('puree_editor:display_order_placeholder')}
                  placeholderTextColor={colors.textSecondary}
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
                  <Text style={styles.cancelButtonText}>{t('puree_editor:cancel_button')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: colors.highlight }]}
                  onPress={handleSave}
                  disabled={loading || uploadingImage}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: colors.text }]}>
                      {editingRecipe ? t('puree_editor:save_button') : t('puree_editor:add_save_button')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Extra padding at bottom to ensure buttons are visible above keyboard */}
              <View style={styles.extraBottomPadding} />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
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
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingTop: 20,
    paddingBottom: 100,
  },
  addButton: {
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
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
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
    marginBottom: 4,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
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
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
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
    flex: 1,
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
    flex: 1,
  },
  modalFormContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
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
  pickerOptionText: {
    color: '#1A1A1A',
    fontWeight: '400',
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
  },
  imagePickerButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  extraBottomPadding: {
    height: 30,
  },
});
