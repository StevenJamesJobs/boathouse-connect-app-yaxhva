
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateTexts, saveTranslations } from '@/utils/translateContent';
import RichTextToolbar from '@/components/RichTextToolbar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import {
  cocktailFedSubOptions,
  resolveRecipeSubId,
  recipeCategoryValueForSub,
} from '@/utils/menuCategoryLabels';

interface LibationRecipe {
  id: string;
  name: string;
  price: string;
  category: string;
  subcategory_id: string | null;
  is_featured: boolean;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  procedure_es?: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function SummerLibationRecipesEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { organizationId, organization } = useOrganization();
  // Menu 2 → slot 2 in per-menu scope (shared scope ignores the slot).
  const { categories: menuCats } = useMenuCategories({ includeHidden: true, menuSlot: 2 });
  const cocktailSubOptions = cocktailFedSubOptions(menuCats, t);
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<LibationRecipe | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [glassware, setGlassware] = useState('');
  const [garnish, setGarnish] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [procedureEs, setProcedureEs] = useState('');
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('summer_libation_recipes')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading summer libation recipes:', error);
        throw error;
      }
      setRecipes(data || []);
    } catch (error) {
      console.error('Error loading summer libation recipes:', error);
      Alert.alert(t('common.error'), t('summer_libation_editor.no_recipes'));
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
      Alert.alert(t('common.error'), t('summer_libation_editor.error_pick_image'));
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) {
      Alert.alert(t('common.error'), t('summer_libation_editor.error_not_authenticated_upload'));
      return;
    }

    try {
      setUploadingImage(true);

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('summer-libation-recipe-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('summer-libation-recipe-images')
        .getPublicUrl(fileName);

      setThumbnailUrl(urlData.publicUrl);
      Alert.alert(t('common.success'), t('summer_libation_editor.image_uploaded'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!procedure.trim()) {
      Alert.alert(t('common.error'), 'No procedure text to translate');
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([procedure]);
      setProcedureEs(results[0] || '');
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common.error'), 'Translation failed');
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_name'));
        return;
      }

      if (!price.trim()) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_price'));
        return;
      }

      if (!subcategoryId) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_category'));
        return;
      }

      const validIngredients = ingredients.filter(
        (ing) => ing.amount.trim() && ing.ingredient.trim()
      );

      if (validIngredients.length === 0) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_ingredients'));
        return;
      }

      if (!user?.id) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_not_authenticated'));
        return;
      }

      setLoading(true);

      // Resolve the chosen cocktail-fed subcategory; keep writing a stable legacy
      // `category` string (built-in vocab or custom name) for fallback resolution.
      const selectedSub = menuCats.flatMap((c) => c.subcategories).find((s) => s.id === subcategoryId);
      const legacyCategory = selectedSub ? recipeCategoryValueForSub(selectedSub) : '';

      if (editingRecipe) {
        const { data, error } = await supabase.rpc('update_summer_libation_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_price: price.trim(),
          p_category: legacyCategory,
          p_subcategory_id: subcategoryId,
          p_is_featured: isFeatured,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: displayOrder.trim() ? parseInt(displayOrder.trim()) : editingRecipe.display_order,
        });

        if (error) {
          console.error('Error updating summer libation recipe:', error);
          throw error;
        }
        if (procedureEs.trim()) {
          await saveTranslations('summer_libation_recipes', editingRecipe.id, { procedure_es: procedureEs }, organizationId);
        }
        Alert.alert(t('common.success'), t('summer_libation_editor.recipe_updated'));
      } else {
        const { data, error } = await supabase.rpc('insert_summer_libation_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_name: name.trim(),
          p_price: price.trim(),
          p_category: legacyCategory,
          p_subcategory_id: subcategoryId,
          p_is_featured: isFeatured,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: displayOrder.trim() ? parseInt(displayOrder.trim()) : recipes.length,
        });

        if (error) {
          console.error('Error adding summer libation recipe:', error);
          throw error;
        }
        const { data: newRecipes } = await supabase
          .from('summer_libation_recipes')
          .select('id')
          .eq('name', name.trim())
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (newRecipes?.[0] && procedureEs.trim()) {
          await saveTranslations('summer_libation_recipes', newRecipes[0].id, { procedure_es: procedureEs }, organizationId);
        }
        Alert.alert(t('common.success'), t('summer_libation_editor.recipe_added'));
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving summer libation recipe:', error);
      Alert.alert('Error', error.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipe: LibationRecipe) => {
    Alert.alert(t('summer_libation_editor.delete_title'), t('summer_libation_editor.delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!user?.id) {
              Alert.alert(t('common.error'), t('summer_libation_editor.error_not_authenticated_delete'));
              return;
            }

            const { error } = await supabase.rpc('delete_summer_libation_recipe', {
              p_user_id: user.id,
              p_organization_id: organizationId,
              p_recipe_id: recipe.id,
            });

            if (error) {
              console.error('Error deleting summer libation recipe:', error);
              throw error;
            }
            Alert.alert(t('common.success'), t('summer_libation_editor.recipe_deleted'));
            loadRecipes();
          } catch (error: any) {
            console.error('Error deleting summer libation recipe:', error);
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
    setSubcategoryId(resolveRecipeSubId(menuCats, recipe) || '');
    setIsFeatured(!!recipe.is_featured);
    setGlassware(recipe.glassware || '');
    setGarnish(recipe.garnish || '');
    setIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients
        : [{ amount: '', ingredient: '' }]
    );
    setProcedure(recipe.procedure || '');
    setProcedureEs(recipe.procedure_es || '');
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
    setSubcategoryId('');
    setIsFeatured(false);
    setGlassware('');
    setGarnish('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setProcedureEs('');
    setShowSpanish(false);
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
    const { data } = supabase.storage.from('summer-libation-recipe-images').getPublicUrl(url);
    return data.publicUrl;
  };

  // Group recipes under their bound cocktail-fed subcategory (current names, in
  // the menu's subcategory order); featured recipes pin to the top of each group.
  const recipesByCategory: Record<string, LibationRecipe[]> = {};
  const groupedIds = new Set<string>();
  for (const opt of cocktailSubOptions) {
    const subRecipes = recipes
      .filter((r) => resolveRecipeSubId(menuCats, r) === opt.id)
      .sort((a, b) => (Number(b.is_featured) - Number(a.is_featured)) || (a.display_order - b.display_order));
    if (subRecipes.length > 0) {
      recipesByCategory[opt.label] = subRecipes;
      subRecipes.forEach((r) => groupedIds.add(r.id));
    }
  }
  for (const r of recipes) {
    if (groupedIds.has(r.id)) continue;
    const key = r.category || 'Other';
    (recipesByCategory[key] ||= []).push(r);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {organization?.menu_2_name ? `${organization.menu_2_name} ${t('libation_editor.title')}` : t('summer_libation_editor.title')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.highlight }]} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={colors.text}
          />
          <Text style={[styles.addButtonText, { color: colors.text }]}>{t('summer_libation_editor.add_recipe')}</Text>
        </TouchableOpacity>

        {Object.keys(recipesByCategory).length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('summer_libation_editor.no_recipes')}</Text>
        ) : (
          Object.entries(recipesByCategory).map(([cat, categoryRecipes], categoryIndex) => (
            <React.Fragment key={categoryIndex}>
              <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat}</Text>

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
                      <Text style={[styles.recipePrice, { color: colors.textSecondary }]}>{recipe.price}</Text>
                    </View>
                    <View style={styles.recipeActions}>
                      <TouchableOpacity
                        style={[styles.editButton, { backgroundColor: colors.highlight }]}
                        onPress={() => openEditModal(recipe)}
                      >
                        <Text style={[styles.buttonText, { color: colors.text }]}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(recipe)}
                      >
                        <Text style={[styles.buttonText, { color: colors.text }]}>{t('common.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </React.Fragment>
          ))
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRecipe ? t('summer_libation_editor.modal_edit_title') : t('summer_libation_editor.modal_add_title')}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color="#9E9E9E"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              contentContainerStyle={styles.modalFormContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('summer_libation_editor.image_label')}</Text>
                <TouchableOpacity
                  style={[styles.imagePickerButton, { backgroundColor: colors.highlight }]}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={[styles.imagePickerButtonText, { color: colors.text }]}>
                    {uploadingImage ? t('summer_libation_editor.uploading') : t('summer_libation_editor.choose_image')}
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

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('summer_libation_editor.category_label')}</Text>
                {cocktailSubOptions.length === 0 ? (
                  <Text style={[styles.pickerEmptyHint, { color: colors.textSecondary }]}>
                    {t('summer_libation_editor.no_cocktail_subs')}
                  </Text>
                ) : (
                  <View style={styles.picker}>
                    {cocktailSubOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.pickerOption,
                          subcategoryId === opt.id && { backgroundColor: colors.highlight }
                        ]}
                        onPress={() => setSubcategoryId(opt.id)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            subcategoryId === opt.id && { color: colors.text, fontWeight: '600' }
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Featured (pin to top of its subcategory) */}
              <View style={styles.formField}>
                <View style={styles.featuredRow}>
                  <View style={styles.featuredTextWrap}>
                    <Text style={styles.formLabel}>{t('summer_libation_editor.featured_label')}</Text>
                    <Text style={[styles.featuredHint, { color: colors.textSecondary }]}>
                      {t('summer_libation_editor.featured_hint')}
                    </Text>
                  </View>
                  <Switch value={isFeatured} onValueChange={setIsFeatured} />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Recipe Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter recipe name"
                  placeholderTextColor="#9E9E9E"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Price *</Text>
                <TextInput
                  style={styles.formInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g., $12.00"
                  placeholderTextColor="#9E9E9E"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Glassware</Text>
                <TextInput
                  style={styles.formInput}
                  value={glassware}
                  onChangeText={setGlassware}
                  placeholder="e.g., Martini Glass"
                  placeholderTextColor="#9E9E9E"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Garnish</Text>
                <TextInput
                  style={styles.formInput}
                  value={garnish}
                  onChangeText={setGarnish}
                  placeholder="e.g., Lemon Twist"
                  placeholderTextColor="#9E9E9E"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Ingredients *</Text>
                {ingredients.map((ingredient, index) => (
                  <View key={index} style={styles.ingredientRow}>
                    <TextInput
                      style={[styles.formInput, styles.ingredientAmount]}
                      value={ingredient.amount}
                      onChangeText={(value) => updateIngredient(index, 'amount', value)}
                      placeholder="Amount"
                      placeholderTextColor="#9E9E9E"
                    />
                    <TextInput
                      style={[styles.formInput, styles.ingredientName]}
                      value={ingredient.ingredient}
                      onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                      placeholder="Ingredient"
                      placeholderTextColor="#9E9E9E"
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
                    color={colors.primary}
                  />
                  <Text style={[styles.addIngredientText, { color: colors.highlight }]}>Add Ingredient</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Procedure</Text>
                <RichTextToolbar
                  text={procedure}
                  onChangeText={setProcedure}
                  selection={procedureSelection}
                  onSelectionChange={setProcedureSelection}
                  textInputRef={procedureInputRef}
                  accentColor={colors.highlight}
                />
                <TextInput
                  ref={procedureInputRef}
                  style={[styles.formInput, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder="Enter preparation instructions"
                  placeholderTextColor="#9E9E9E"
                  multiline
                  numberOfLines={4}
                  onSelectionChange={(e) => setProcedureSelection(e.nativeEvent.selection)}
                />
              </View>

              <View style={styles.formField}>
                <TouchableOpacity
                  style={[styles.spanishSectionHeader, { backgroundColor: '#FFF3E0' }]}
                  onPress={() => setShowSpanish(!showSpanish)}
                >
                  <Text style={styles.spanishHeaderText}>
                    {showSpanish ? '▼' : '▶'} Spanish Translation (Procedure)
                  </Text>
                  <TouchableOpacity
                    style={[styles.autoTranslateButton, { backgroundColor: colors.highlight }]}
                    onPress={handleAutoTranslate}
                    disabled={translating}
                  >
                    <Text style={[styles.autoTranslateButtonText, { color: colors.text }]}>
                      {translating ? 'Translating...' : 'Auto-Translate'}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
                {showSpanish && (
                  <View style={styles.spanishFields}>
                    <Text style={styles.formLabel}>Procedure (Spanish)</Text>
                    <TextInput
                      style={[styles.formInput, styles.textArea]}
                      value={procedureEs}
                      onChangeText={setProcedureEs}
                      placeholder="Procedimiento en español"
                      placeholderTextColor="#9E9E9E"
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                )}
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.formInput}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  placeholder="Enter display order (optional)"
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeModal}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
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
                      {editingRecipe ? 'Update' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

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
  recipePrice: {
    fontSize: 14,
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
  pickerEmptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featuredTextWrap: {
    flex: 1,
  },
  featuredHint: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
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
  spanishSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  spanishHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  autoTranslateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  autoTranslateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spanishFields: {
    marginTop: 8,
  },
});
