
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
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import CollapsibleSection from '@/components/CollapsibleSection';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';
import GlasswareIconPicker from '@/components/GlasswareIconPicker';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import {
  cocktailFedSubOptions,
  resolveRecipeSubId,
  recipeCategoryValueForSub,
} from '@/utils/menuCategoryLabels';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import RecipeGridCard from '@/components/RecipeGridCard';
import OrderPositionModal from '@/components/OrderPositionModal';

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
  // ··· meatball → "Order Position" picker (siblings = the tapped recipe's category list)
  const [positionPicker, setPositionPicker] = useState<{ recipe: LibationRecipe; siblings: LibationRecipe[]; currentIndex: number } | null>(null);

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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [procedureEs, setProcedureEs] = useState('');
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  // Dropdown pickers + auto-grow procedure height
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

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
          p_display_order: editingRecipe.display_order,
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
          p_display_order: recipes.length,
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

  // Persist a category's new card order via the reorder RPC (SECURITY DEFINER).
  const persistOrder = async (ordered: LibationRecipe[]) => {
    if (!user?.id) return;
    const orderMap = new Map(ordered.map((r, idx) => [r.id, idx]));
    setRecipes((prev) =>
      prev.map((r) => (orderMap.has(r.id) ? { ...r, display_order: orderMap.get(r.id)! } : r))
    );
    try {
      const { error } = await supabase.rpc('reorder_summer_libation_recipes', {
        p_user_id: user.id,
        p_organization_id: organizationId,
        p_ordered_ids: ordered.map((r) => r.id),
      });
      if (error) {
        console.error('Error reordering summer libation recipes:', error);
        loadRecipes();
      }
    } catch (error) {
      console.error('Error reordering summer libation recipes:', error);
      loadRecipes();
    }
  };

  const handleMove = (siblings: LibationRecipe[], index: number, dir: -1 | 1) => {
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

  const openRecipeActions = (recipe: LibationRecipe, siblings: LibationRecipe[], index: number) => {
    const isFirst = index === 0;
    const isLast = index === siblings.length - 1;
    const editLabel = t('common.edit');
    const moveUpLabel = t('summer_libation_editor.move_up');
    const moveDownLabel = t('summer_libation_editor.move_down');
    const orderLabel = t('summer_libation_editor.order_position');
    const deleteLabel = t('common.delete');
    const cancelLabel = t('common.cancel');

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
                renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<LibationRecipe>) => (
                  <RecipeGridCard
                    imageUrl={getImageUrl(item.thumbnail_url)}
                    name={item.name}
                    price={item.price}
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
        title={t('summer_libation_editor.order_position')}
        subtitle={positionPicker ? t('summer_libation_editor.order_position_subtitle', { name: positionPicker.recipe.name }) : undefined}
        count={positionPicker?.siblings.length ?? 0}
        currentIndex={positionPicker?.currentIndex ?? 0}
        onClose={() => setPositionPicker(null)}
        onApply={applyPositionChange}
      />

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
              {/* ── Section 1: Recipe Basics (open) ── */}
              <CollapsibleSection
                title={t('summer_libation_editor.section_basics')}
                iconIos="wineglass.fill"
                iconAndroid="local-bar"
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
                    {uploadingImage && (
                      <View style={styles.thumbUploading}><ActivityIndicator color="#FFFFFF" /></View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.nameColumn}>
                    <Text style={styles.formLabel}>{t('summer_libation_editor.recipe_name_label')}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={name}
                      onChangeText={setName}
                      placeholder={t('summer_libation_editor.recipe_name_placeholder')}
                      placeholderTextColor="#9E9E9E"
                    />
                  </View>
                </View>

                {/* Subcategory (dropdown) + Price */}
                <View style={styles.twoColRow}>
                  <View style={styles.twoColLeft}>
                    <Text style={styles.formLabel}>{t('summer_libation_editor.category_label')}</Text>
                    {cocktailSubOptions.length === 0 ? (
                      <Text style={[styles.pickerEmptyHint, { color: colors.textSecondary }]}>
                        {t('summer_libation_editor.no_cocktail_subs')}
                      </Text>
                    ) : (
                      <SelectField
                        value={cocktailSubOptions.find((o) => o.id === subcategoryId)?.label || ''}
                        placeholder={t('summer_libation_editor.select_category')}
                        onPress={() => setSubPickerOpen(true)}
                      />
                    )}
                  </View>
                  <View style={styles.twoColRight}>
                    <Text style={styles.formLabel}>{t('summer_libation_editor.price_label')}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={price}
                      onChangeText={setPrice}
                      placeholder={t('summer_libation_editor.price_placeholder')}
                      placeholderTextColor="#9E9E9E"
                    />
                  </View>
                </View>

                {/* Featured */}
                <View style={styles.featuredRow}>
                  <View style={styles.featuredTextWrap}>
                    <Text style={styles.formLabel}>{t('summer_libation_editor.featured_label')}</Text>
                    <Text style={[styles.featuredHint, { color: colors.textSecondary }]}>
                      {t('summer_libation_editor.featured_hint')}
                    </Text>
                  </View>
                  <Switch value={isFeatured} onValueChange={setIsFeatured} />
                </View>
              </CollapsibleSection>

              {/* ── Section 2: Recipe (collapsed) ── */}
              <CollapsibleSection
                title={t('summer_libation_editor.section_recipe')}
                iconIos="list.bullet"
                iconAndroid="format-list-bulleted"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={false}
              >
                {/* Glassware (visual picker) */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('summer_libation_editor.glassware_label')}</Text>
                  <GlasswareIconPicker
                    value={glassware}
                    onChange={setGlassware}
                    title={t('summer_libation_editor.select_glassware')}
                    placeholder={t('summer_libation_editor.select_glassware')}
                    customLabel={t('common.custom_option')}
                    customPlaceholder={t('summer_libation_editor.custom_glassware_placeholder')}
                  />
                </View>
                {/* Garnish */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('summer_libation_editor.garnish_label')}</Text>
                  <TextInput
                    style={styles.formInput}
                    value={garnish}
                    onChangeText={setGarnish}
                    placeholder={t('summer_libation_editor.garnish_placeholder')}
                    placeholderTextColor="#9E9E9E"
                  />
                </View>
                {/* Ingredients */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('summer_libation_editor.ingredients_label')}</Text>
                  {ingredients.map((ingredient, index) => (
                    <View key={index} style={styles.ingredientRow}>
                      <TextInput
                        style={[styles.formInput, styles.ingredientAmount]}
                        value={ingredient.amount}
                        onChangeText={(value) => updateIngredient(index, 'amount', value)}
                        placeholder={t('summer_libation_editor.amount_placeholder')}
                        placeholderTextColor="#9E9E9E"
                      />
                      <TextInput
                        style={[styles.formInput, styles.ingredientName]}
                        value={ingredient.ingredient}
                        onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                        placeholder={t('summer_libation_editor.ingredient_placeholder')}
                        placeholderTextColor="#9E9E9E"
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
                    <Text style={[styles.addIngredientText, { color: colors.highlight }]}>{t('summer_libation_editor.add_ingredient')}</Text>
                  </TouchableOpacity>
                </View>
              </CollapsibleSection>

              {/* ── Section 3: Procedure (collapsed) ── */}
              <CollapsibleSection
                title={t('summer_libation_editor.section_procedure')}
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
                  <Text style={styles.formLabel}>{t('summer_libation_editor.procedure_label')}</Text>
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
                      placeholder={t('summer_libation_editor.procedure_placeholder')}
                      placeholderTextColor="#9E9E9E"
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
                      <Text style={styles.spanishFieldLabel}>{t('summer_libation_editor.procedure_es_label')}</Text>
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

              </CollapsibleSection>

              {/* ── Actions ── */}
              <View style={styles.formSectionActions}>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={loading}>
                    <Text style={styles.cancelButtonText}>{t('summer_libation_editor.cancel_button')}</Text>
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
                        {editingRecipe ? t('summer_libation_editor.update_button') : t('summer_libation_editor.save_button')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.extraBottomPadding} />
            </ScrollView>
          </View>

          <SimpleSelectPicker
            visible={subPickerOpen}
            title={t('summer_libation_editor.select_category')}
            options={cocktailSubOptions.map((o) => o.label)}
            value={cocktailSubOptions.find((o) => o.id === subcategoryId)?.label || ''}
            onSelect={(label) => {
              const opt = cocktailSubOptions.find((o) => o.label === label);
              if (opt) setSubcategoryId(opt.id);
            }}
            onClose={() => setSubPickerOpen(false)}
          />
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
  // Tap-to-attach 80×80 thumbnail + name row, and the subcategory/price two-col row.
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
  twoColRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' },
  twoColLeft: { flex: 1 },
  twoColRight: { width: 120 },
});
