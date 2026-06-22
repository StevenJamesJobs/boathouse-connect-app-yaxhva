
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActionSheetIOS,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import RichTextToolbar from '@/components/RichTextToolbar';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import CollapsibleSection from '@/components/CollapsibleSection';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateTexts, saveTranslations } from '@/utils/translateContent';
import { useOrganization } from '@/contexts/OrganizationContext';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import RecipeGridCard from '@/components/RecipeGridCard';
import OrderPositionModal from '@/components/OrderPositionModal';

interface PureeSyrupRecipe {
  id: string;
  name: string;
  category: string;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  procedure_es?: string | null;
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
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [recipes, setRecipes] = useState<PureeSyrupRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PureeSyrupRecipe | null>(null);
  // ··· meatball → "Order Position" picker (siblings = the tapped recipe's category list)
  const [positionPicker, setPositionPicker] = useState<{ recipe: PureeSyrupRecipe; siblings: PureeSyrupRecipe[]; currentIndex: number } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [ingredients, setIngredients] = useState<{ amount: string; ingredient: string }[]>([
    { amount: '', ingredient: '' },
  ]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [procedureEs, setProcedureEs] = useState('');
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading puree syrup recipes from table: puree_syrup_recipes');
      const { data, error } = await supabase
        .from('puree_syrup_recipes')
        .select('*')
        .eq('organization_id', organizationId)
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

  const handleAutoTranslate = async () => {
    if (!procedure.trim()) {
      Alert.alert(t('common:error'), 'No procedure text to translate');
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([procedure]);
      setProcedureEs(results[0] || '');
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common:error'), 'Translation failed');
    } finally {
      setTranslating(false);
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
          p_organization_id: organizationId,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_category: category,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: editingRecipe.display_order,
        });

        if (error) {
          console.error('Error updating puree syrup recipe:', error);
          throw error;
        }
        console.log('Puree syrup recipe updated successfully');
        if (procedureEs.trim()) {
          await saveTranslations('puree_syrup_recipes', editingRecipe.id, { procedure_es: procedureEs }, organizationId);
        }
        Alert.alert(t('common:success'), t('puree_editor:updated_success'));
      } else {
        // Insert new recipe using RPC function
        console.log('Adding new puree syrup recipe');
        const { data, error } = await supabase.rpc('insert_puree_syrup_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_name: name.trim(),
          p_category: category,
          p_ingredients: validIngredients,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: recipes.length,
        });

        if (error) {
          console.error('Error adding puree syrup recipe:', error);
          throw error;
        }
        console.log('Puree syrup recipe added successfully');
        const { data: newItems } = await supabase
          .from('puree_syrup_recipes')
          .select('id')
          .eq('name', name.trim())
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (newItems?.[0] && procedureEs.trim()) {
          await saveTranslations('puree_syrup_recipes', newItems[0].id, { procedure_es: procedureEs }, organizationId);
        }
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
              p_organization_id: organizationId,
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

  // Persist a category's new card order via the reorder RPC (SECURITY DEFINER).
  const persistOrder = async (ordered: PureeSyrupRecipe[]) => {
    if (!user?.id) return;
    const orderMap = new Map(ordered.map((r, idx) => [r.id, idx]));
    setRecipes((prev) =>
      prev.map((r) => (orderMap.has(r.id) ? { ...r, display_order: orderMap.get(r.id)! } : r))
    );
    try {
      const { error } = await supabase.rpc('reorder_puree_syrup_recipes', {
        p_user_id: user.id,
        p_organization_id: organizationId,
        p_ordered_ids: ordered.map((r) => r.id),
      });
      if (error) {
        console.error('Error reordering puree syrup recipes:', error);
        loadRecipes();
      }
    } catch (error) {
      console.error('Error reordering puree syrup recipes:', error);
      loadRecipes();
    }
  };

  const handleMove = (siblings: PureeSyrupRecipe[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    persistOrder(reordered);
  };

  const applyPositionChange = (newPos: number) => {
    if (!positionPicker) return;
    const { siblings, currentIndex } = positionPicker;
    const newIndex = newPos - 1;
    setPositionPicker(null);
    if (newIndex === currentIndex) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, moved);
    persistOrder(reordered);
  };

  const openRecipeActions = (recipe: PureeSyrupRecipe, siblings: PureeSyrupRecipe[], index: number) => {
    const isFirst = index === 0;
    const isLast = index === siblings.length - 1;
    const editLabel = t('common:edit');
    const moveUpLabel = t('puree_editor:move_up');
    const moveDownLabel = t('puree_editor:move_down');
    const orderLabel = t('puree_editor:order_position');
    const deleteLabel = t('common:delete');
    const cancelLabel = t('common:cancel');

    if (Platform.OS === 'ios') {
      const options: string[] = [editLabel];
      const actions: Array<() => void> = [() => openEditModal(recipe)];
      if (!isFirst) { options.push(moveUpLabel); actions.push(() => handleMove(siblings, index, -1)); }
      if (!isLast) { options.push(moveDownLabel); actions.push(() => handleMove(siblings, index, 1)); }
      if (siblings.length > 1) { options.push(orderLabel); actions.push(() => setPositionPicker({ recipe, siblings, currentIndex: index })); }
      options.push(deleteLabel); actions.push(() => handleDelete(recipe));
      options.push(cancelLabel);
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: options.length - 2, cancelButtonIndex: options.length - 1, title: recipe.name },
        (buttonIndex) => { if (buttonIndex === options.length - 1) return; actions[buttonIndex]?.(); }
      );
    } else {
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
        { text: editLabel, onPress: () => openEditModal(recipe) },
      ];
      if (!isFirst) buttons.push({ text: moveUpLabel, onPress: () => handleMove(siblings, index, -1) });
      if (!isLast) buttons.push({ text: moveDownLabel, onPress: () => handleMove(siblings, index, 1) });
      if (siblings.length > 1) buttons.push({ text: orderLabel, onPress: () => setPositionPicker({ recipe, siblings, currentIndex: index }) });
      buttons.push({ text: deleteLabel, style: 'destructive', onPress: () => handleDelete(recipe) });
      buttons.push({ text: cancelLabel, style: 'cancel' });
      Alert.alert(recipe.name, undefined, buttons);
    }
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
    setProcedureEs(recipe.procedure_es || '');
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
    setProcedureEs('');
    setShowSpanish(false);
    setProcDragH(0);
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
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={colors.fireText}
          />
          <Text style={[styles.addButtonText, { color: colors.fireText }]}>{t('puree_editor:add_button')}</Text>
        </TouchableOpacity>

        {/* Recipes List by Category */}
        {Object.keys(recipesByCategory).length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('puree_editor:empty_title')}</Text>
        ) : (
          Object.entries(recipesByCategory).map(([cat, categoryRecipes], categoryIndex) => (
            <React.Fragment key={categoryIndex}>
              {/* Category Header */}
              <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat}</Text>

              {/* Horizontal, drag-reorderable recipe cards (full-image tiles) */}
              <DraggableFlatList
                data={categoryRecipes}
                horizontal
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                activationDistance={12}
                style={styles.horizontalScroll}
                contentContainerStyle={styles.horizontalScrollContent}
                onDragEnd={({ data }) => persistOrder(data)}
                renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<PureeSyrupRecipe>) => (
                  <RecipeGridCard
                    imageUrl={getImageUrl(item.thumbnail_url)}
                    name={item.name}
                    onPress={() => openEditModal(item)}
                    onMeatball={() => openRecipeActions(item, categoryRecipes, getIndex() ?? 0)}
                    drag={drag}
                    isActive={isActive}
                  />
                )}
              />
            </React.Fragment>
          ))
        )}
      </ScrollView>

      {/* Order Position picker (··· → Order Position) */}
      <OrderPositionModal
        visible={!!positionPicker}
        title={t('puree_editor:order_position')}
        subtitle={positionPicker ? t('puree_editor:order_position_subtitle', { name: positionPicker.recipe.name }) : undefined}
        count={positionPicker?.siblings.length ?? 0}
        currentIndex={positionPicker?.currentIndex ?? 0}
        onClose={() => setPositionPicker(null)}
        onApply={applyPositionChange}
      />

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
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
              {/* ── Section 1: Recipe Basics (open) ── */}
              <CollapsibleSection
                title={t('puree_editor:section_basics')}
                iconIos="drop.fill"
                iconAndroid="opacity"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded
              >
                {/* Thumbnail (tap to attach) + Name */}
                <View style={styles.thumbAndNameRow}>
                  <TouchableOpacity style={styles.thumbSquare} onPress={pickImage} disabled={uploadingImage}>
                    {thumbnailUrl ? (
                      <Image source={{ uri: getImageUrl(thumbnailUrl) }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <IconSymbol ios_icon_name="photo" android_material_icon_name="add-photo-alternate" size={26} color="#999999" />
                      </View>
                    )}
                    {uploadingImage && (<View style={styles.thumbUploading}><ActivityIndicator color="#FFFFFF" /></View>)}
                  </TouchableOpacity>
                  <View style={styles.nameColumn}>
                    <Text style={styles.formLabel}>{t('puree_editor:name_label')}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={name}
                      onChangeText={setName}
                      placeholder={t('puree_editor:name_placeholder')}
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </View>

                {/* Category (Purées / Simple Syrups) */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('puree_editor:category_label')}</Text>
                  <View style={styles.picker}>
                    {CATEGORIES.map((cat, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.pickerOption, category === cat && { backgroundColor: colors.primary }]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[styles.pickerOptionText, category === cat && { color: colors.fireText, fontWeight: '600' }]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </CollapsibleSection>

              {/* ── Section 2: Ingredients (collapsed) ── */}
              <CollapsibleSection
                title={t('puree_editor:section_ingredients')}
                iconIos="list.bullet"
                iconAndroid="format-list-bulleted"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={false}
              >
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
                        <TouchableOpacity style={styles.removeIngredientButton} onPress={() => removeIngredient(index)}>
                          <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color="#F44336" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                    <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
                    <Text style={[styles.addIngredientText, { color: colors.primary }]}>{t('puree_editor:add_ingredient')}</Text>
                  </TouchableOpacity>
                </View>
              </CollapsibleSection>

              {/* ── Section 3: Procedure (collapsed) ── */}
              <CollapsibleSection
                title={t('puree_editor:section_procedure')}
                iconIos="list.number"
                iconAndroid="format-list-numbered"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={false}
              >
                {/* Procedure (auto-grow) */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('puree_editor:procedure_label')}</Text>
                  <RichTextToolbar
                    text={procedure}
                    onChangeText={setProcedure}
                    selection={procedureSelection}
                    onSelectionChange={setProcedureSelection}
                    textInputRef={procedureInputRef}
                    accentColor={colors.highlight}
                  />
                  <View>
                    <TextInput
                      ref={procedureInputRef}
                      style={[styles.formInput, styles.textArea, { minHeight: Math.max(120, procDragH), paddingBottom: 22 }]}
                      value={procedure}
                      onChangeText={setProcedure}
                      placeholder={t('puree_editor:procedure_placeholder')}
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      scrollEnabled={false}
                      onContentSizeChange={(e) => setProcH(e.nativeEvent.contentSize.height)}
                      onSelectionChange={(e) => setProcedureSelection(e.nativeEvent.selection)}
                    />
                    <ProcedureResizeHandle height={Math.max(120, procH, procDragH)} onResize={setProcDragH} />
                  </View>
                </View>

                {/* Spanish Procedure Translation (menu-editor blue style) */}
                <View style={styles.formField}>
                  <TouchableOpacity style={styles.spanishSectionHeader} onPress={() => setShowSpanish(!showSpanish)}>
                    <Text style={styles.formLabel}>{t('translation_section:spanish_section_title')}</Text>
                    <IconSymbol
                      ios_icon_name={showSpanish ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={showSpanish ? 'expand-less' : 'expand-more'}
                      size={20}
                      color="#666666"
                    />
                  </TouchableOpacity>
                  {showSpanish && (
                    <View style={styles.spanishFields}>
                      <TouchableOpacity style={styles.autoTranslateButton} onPress={handleAutoTranslate} disabled={translating}>
                        {translating ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.autoTranslateButtonText}>{t('translation_section:auto_translate')}</Text>
                        )}
                      </TouchableOpacity>
                      <Text style={styles.spanishFieldLabel}>{t('puree_editor:procedure_es_label')}</Text>
                      <TextInput
                        style={[styles.formInput, styles.textArea]}
                        value={procedureEs}
                        onChangeText={setProcedureEs}
                        placeholder="Procedimiento en español"
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={4}
                      />
                    </View>
                  )}
                </View>

              </CollapsibleSection>

              {/* ── Actions ── */}
              <View style={styles.formSectionActions}>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={loading}>
                    <Text style={styles.cancelButtonText}>{t('puree_editor:cancel_button')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: colors.primary }]}
                    onPress={handleSave}
                    disabled={loading || uploadingImage}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.fireText} />
                    ) : (
                      <Text style={[styles.submitButtonText, { color: colors.fireText }]}>
                        {editingRecipe ? t('puree_editor:save_button') : t('puree_editor:add_save_button')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
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
    backgroundColor: '#EEEFF1',
  },
  modalFormContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // White cards that group the form into scannable sections on the gray scroll (D5).
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)',
  },
  formSectionActions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)',
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
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
  // Spanish block — menu-editor blue style (replaces the old orange).
  spanishSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  spanishFields: {
    marginTop: 8,
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  autoTranslateButton: {
    backgroundColor: '#3498DB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  autoTranslateButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  spanishFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 4,
  },
  // Tap-to-attach 80×80 thumbnail + name row.
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  thumbSquare: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbUploading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  nameColumn: { flex: 1 },
});
