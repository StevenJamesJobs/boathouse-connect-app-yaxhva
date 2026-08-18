
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import { brokerUploadImage } from '@/utils/storageBroker';
import { toPublicUrl } from '@/utils/storageResolver';
import RichTextToolbar from '@/components/RichTextToolbar';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import CollapsibleSection from '@/components/CollapsibleSection';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';
import { useOrganization } from '@/contexts/OrganizationContext';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import RecipeGridCard, { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import OrderPositionModal from '@/components/OrderPositionModal';
import GlassActionSheet from '@/components/GlassActionSheet';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import GlassSheet from '@/components/GlassSheet';
import MenuSearchRow from '@/components/MenuSearchRow';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

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

type PureeSyrupRow = Database['public']['Functions']['get_puree_syrup_recipes']['Returns'][number];

// The built-in categories keep their canonical EN values in the DB (DATA stays
// EN-canonical; only display is localized). The picker's Custom… entry lets an
// owner mint additional category strings, stored as typed.
const CATEGORIES = ['Purees', 'Simple Syrups'];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1587049352846-4a222e784acc?w=400&h=400&fit=crop';

const TRASH_RED = '#E53935';

export default function PureeSyrupRecipesEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
  const { perms } = useManagerPermissions();
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [recipes, setRecipes] = useState<PureeSyrupRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PureeSyrupRecipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // ··· meatball → GlassActionSheet (Edit / Move / Order Position / Delete)
  const [actionsFor, setActionsFor] = useState<{ recipe: PureeSyrupRecipe; siblings: PureeSyrupRecipe[]; index: number } | null>(null);
  // ··· → "Order Position" picker (siblings = the tapped recipe's category list)
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
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

  // Hybrid bilingual authoring (s61): the primary inputs bind the device
  // language; the shared section shows the other-language preview + translate
  // button + pencil edit. resolveOnSave() runs the staleness rules.
  const isSpanishAuthor = i18n.language === 'es';
  const addSessionRef = useRef(0);
  const translation = useTranslationSection({
    fields: [
      {
        key: 'procedure',
        labelKey: 'translation_section:field_procedure',
        enValue: procedure,
        esValue: procedureEs,
        setEnValue: setProcedure,
        setEsValue: setProcedureEs,
        multiline: true,
      },
    ],
    sessionKey: editingRecipe ? `edit:${editingRecipe.id}` : `new:${addSessionRef.current}`,
    active: showModal,
  });

  const loadRecipes = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_puree_syrup_recipes', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading puree syrup recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a, b) =>
        (a.category || '').localeCompare(b.category || '') || (a.display_order ?? 0) - (b.display_order ?? 0));
      setRecipes(sorted as (PureeSyrupRow & { ingredients: { amount: string; ingredient: string }[] })[]);
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

      const publicUrl = await brokerUploadImage('puree_syrup_image', uri, user.id);
      if (!publicUrl) {
        throw new Error('Upload failed');
      }

      setThumbnailUrl(publicUrl);
      Alert.alert(t('common:success'), t('puree_editor:updated_success'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('puree_editor:upload_image_error')));
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

      if (!category.trim()) {
        Alert.alert(t('common:error'), t('puree_editor:error_fill_fields'));
        return;
      }

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
      // Fill/refresh the other language per the s61 staleness rules (may ask once).
      const resolved = await translation.resolveOnSave();
      if (!resolved) { setLoading(false); return; }

      if (editingRecipe) {
        const { error } = await supabase.rpc('update_puree_syrup_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_category: category.trim(),
          p_ingredients: validIngredients,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: editingRecipe.display_order,
        });

        if (error) {
          console.error('Error updating puree syrup recipe:', error);
          throw error;
        }
        await saveTranslations('puree_syrup_recipes', editingRecipe.id, { procedure_es: resolved.procedure.es }, user?.id);
        Alert.alert(t('common:success'), t('puree_editor:updated_success'));
      } else {
        const { data, error } = await supabase.rpc('insert_puree_syrup_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_name: name.trim(),
          p_category: category.trim(),
          p_ingredients: validIngredients,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: recipes.length,
        });

        if (error) {
          console.error('Error adding puree syrup recipe:', error);
          throw error;
        }
        // insert_puree_syrup_recipe returns the new id — use it directly.
        if (data) {
          await saveTranslations('puree_syrup_recipes', data as string, { procedure_es: resolved.procedure.es }, user?.id);
        }
        Alert.alert(t('common:success'), t('puree_editor:created_success'));
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving puree syrup recipe:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('puree_editor:save_error')));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipe: PureeSyrupRecipe) => {
    Alert.alert(t('puree_editor:delete_title'), t('puree_editor:delete_confirm', { name: recipe.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!user?.id) {
              Alert.alert(t('common:error'), t('puree_editor:error_not_authenticated'));
              return;
            }

            const { error } = await supabase.rpc('delete_puree_syrup_recipe', {
              p_user_id: user.id,
              p_organization_id: organizationId ?? undefined,
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
            Alert.alert(t('common:error'), translateServerError(error, t('puree_editor:delete_error')));
          }
        },
      },
    ]);
  };

  // Persist a category's new card order via the reorder RPC (SECURITY DEFINER —
  // direct UPDATE is auth.uid()-gated, always null under custom auth). Only
  // ever called with a FULL category group (drag + meatball live outside
  // search mode), so the written 0..n order can't interleave with unseen rows.
  const persistOrder = async (ordered: PureeSyrupRecipe[]) => {
    if (!user?.id) return;
    const orderMap = new Map(ordered.map((r, idx) => [r.id, idx]));
    setRecipes((prev) =>
      prev.map((r) => (orderMap.has(r.id) ? { ...r, display_order: orderMap.get(r.id)! } : r))
    );
    try {
      const { error } = await supabase.rpc('reorder_puree_syrup_recipes', {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
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

  const openAddModal = () => {
    resetForm();
    addSessionRef.current += 1;
    setShowModal(true);
  };

  const openEditModal = (recipe: PureeSyrupRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setCategory(recipe.category || '');
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

  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    return toPublicUrl('puree-syrup-recipe-images', url);
  };

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      'Purees': t('purees_syrups.purees'),
      'Simple Syrups': t('purees_syrups.simple_syrups'),
    };
    return map[cat] ?? cat;
  };

  // Search across name and ingredients. While a query is active the shelves
  // render as PLAIN tiles (tap = edit): dragging a filtered subset would
  // persist a partial 0..n order over the full group.
  const query = searchQuery.trim().toLowerCase();
  const searching = query.length > 0;
  const visibleRecipes = searching
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        (r.ingredients || []).some((i) => (i.ingredient || '').toLowerCase().includes(query))
      )
    : recipes;

  // Shelves: built-in categories first (canonical order), then any custom
  // categories in the order they appear.
  const shelfOrder: string[] = [...CATEGORIES];
  for (const r of visibleRecipes) {
    const cat = r.category || 'Other';
    if (!shelfOrder.includes(cat)) shelfOrder.push(cat);
  }
  const recipesByCategory: Record<string, PureeSyrupRecipe[]> = {};
  for (const cat of shelfOrder) {
    const catRecipes = visibleRecipes.filter((r) => (r.category || 'Other') === cat);
    if (catRecipes.length > 0) recipesByCategory[cat] = catRecipes;
  }

  const shelfLabel = (label: string, count: number) => (
    <View style={styles.shelfLabelRow}>
      <Text style={[styles.shelfLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.shelfLabelLine, { backgroundColor: colors.border + '55' }]} />
      <Text style={[styles.shelfLabelCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );

  // Plain (non-drag) tile — search results.
  const plainTile = (recipe: PureeSyrupRecipe) => (
    <TouchableOpacity
      key={recipe.id}
      style={[styles.plainTile, { borderColor: colors.glassBorder }]}
      onPress={() => openEditModal(recipe)}
      activeOpacity={0.85}
    >
      <StorageImage
        source={{ uri: getImageUrl(recipe.thumbnail_url) }}
        style={styles.plainTileImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(8,10,14,0.30)', 'rgba(8,10,14,0.84)']}
        style={styles.plainTileScrim}
      />
      <View style={styles.plainTileMeta}>
        <Text style={styles.plainTileName} numberOfLines={2}>{recipe.name}</Text>
      </View>
    </TouchableOpacity>
  );

  const actionSiblings = actionsFor?.siblings ?? [];
  const actionIndex = actionsFor?.index ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('puree_editor:title')}
        rightWide
        right={
          <HeaderNavMenu
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            sheetTitle={t('puree_editor:title')}
            actions={[
              {
                key: 'switch',
                label: t('common:to_user'),
                iosIcon: 'person.fill',
                androidIcon: 'person',
                onPress: () => router.replace('/puree-syrup-recipes'),
              },
              {
                key: 'cats',
                label: t('menu_sheet.edit_categories'),
                iosIcon: 'square.grid.2x2',
                androidIcon: 'grid-view',
                disabled: !(user?.role === 'owner' || perms.editCategories),
                onPress: () => router.push({ pathname: '/manage-menu-categories', params: { cat: 'cat.libations' } } as any),
              },
              {
                key: 'menu',
                label: t('menu_sheet.edit_menu'),
                iosIcon: 'fork.knife',
                androidIcon: 'restaurant-menu',
                onPress: () => router.push('/menu-editor' as any),
              },
            ]}
          />
        }
      />

      {/* Search + compact ＋ — the menu editor's row, verbatim geometry. */}
      <MenuSearchRow
        colors={colors}
        mode="editor"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('puree_editor:search_placeholder')}
        onRightPress={openAddModal}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {Object.keys(recipesByCategory).length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name="drop.fill"
              android_material_icon_name="opacity"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searching ? t('cocktails.no_results') : t('puree_editor:empty_title')}
            </Text>
          </View>
        ) : (
          Object.entries(recipesByCategory).map(([cat, categoryRecipes]) => (
            <React.Fragment key={cat}>
              {shelfLabel(getCategoryLabel(cat), categoryRecipes.length)}
              {searching ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.shelf}
                  contentContainerStyle={styles.shelfContent}
                >
                  {categoryRecipes.map(plainTile)}
                </ScrollView>
              ) : (
                <DraggableFlatList
                  data={categoryRecipes}
                  horizontal
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  activationDistance={12}
                  style={styles.shelf}
                  contentContainerStyle={styles.shelfContent}
                  onDragEnd={({ data }) => persistOrder(data)}
                  renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<PureeSyrupRecipe>) => (
                    <RecipeGridCard
                      imageUrl={getImageUrl(item.thumbnail_url)}
                      name={item.name}
                      onPress={() => openEditModal(item)}
                      onMeatball={() => setActionsFor({ recipe: item, siblings: categoryRecipes, index: getIndex() ?? 0 })}
                      drag={drag}
                      isActive={isActive}
                    />
                  )}
                />
              )}
            </React.Fragment>
          ))
        )}
      </ScrollView>

      {/* ··· meatball actions (GlassActionSheet defers each action past its own dismissal) */}
      <GlassActionSheet
        visible={!!actionsFor}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.recipe.name ?? ''}
        actions={actionsFor ? [
          {
            key: 'edit',
            label: t('common.edit'),
            iosIcon: 'pencil',
            androidIcon: 'edit',
            onPress: () => openEditModal(actionsFor.recipe),
          },
          {
            key: 'up',
            label: t('puree_editor:move_up'),
            iosIcon: 'arrow.up',
            androidIcon: 'arrow-upward',
            disabled: actionIndex === 0,
            onPress: () => handleMove(actionSiblings, actionIndex, -1),
          },
          {
            key: 'down',
            label: t('puree_editor:move_down'),
            iosIcon: 'arrow.down',
            androidIcon: 'arrow-downward',
            disabled: actionIndex === actionSiblings.length - 1,
            onPress: () => handleMove(actionSiblings, actionIndex, 1),
          },
          {
            key: 'order',
            label: t('puree_editor:order_position'),
            iosIcon: 'list.number',
            androidIcon: 'format-list-numbered',
            disabled: actionSiblings.length < 2,
            onPress: () => setPositionPicker({ recipe: actionsFor.recipe, siblings: actionSiblings, currentIndex: actionIndex }),
          },
          {
            key: 'delete',
            label: t('common.delete'),
            iosIcon: 'trash',
            androidIcon: 'delete',
            destructive: true,
            onPress: () => handleDelete(actionsFor.recipe),
          },
        ] : []}
      />

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
      {loading && !showModal && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Add/Edit Sheet */}
      <GlassSheet
        visible={showModal}
        onClose={closeModal}
        title={editingRecipe ? t('puree_editor:modal_edit') : t('puree_editor:modal_add')}
        footer={
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={closeModal}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('puree_editor:cancel_button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerBtn,
                { backgroundColor: colors.primary, borderColor: colors.primary },
                (loading || uploadingImage) && styles.footerBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={loading || uploadingImage}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.fireText} />
              ) : (
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
                  {editingRecipe ? t('puree_editor:save_button') : t('puree_editor:add_save_button')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {/* ── Section 1: Recipe Basics (open) ── */}
        <CollapsibleSection
          glass
          title={t('puree_editor:section_basics')}
          iconIos="drop.fill"
          iconAndroid="opacity"
          iconColor={colors.primary}
          defaultExpanded
        >
          {/* Thumbnail (tap to attach) + Name */}
          <View style={styles.thumbAndNameRow}>
            <TouchableOpacity
              style={[styles.thumbSquare, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={pickImage}
              disabled={uploadingImage}
            >
              {thumbnailUrl ? (
                <StorageImage source={{ uri: getImageUrl(thumbnailUrl) }} style={styles.thumbImage} resizeMode="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <IconSymbol ios_icon_name="photo" android_material_icon_name="add-photo-alternate" size={26} color={colors.textSecondary} />
                </View>
              )}
              {uploadingImage && (
                <View style={styles.thumbUploading}><ActivityIndicator color="#FFFFFF" /></View>
              )}
            </TouchableOpacity>
            <View style={styles.nameColumn}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('puree_editor:name_label')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={name}
                onChangeText={setName}
                placeholder={t('puree_editor:name_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Category (dropdown w/ Custom…) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('puree_editor:category_label')}</Text>
            <SelectField
              value={category ? getCategoryLabel(category) : ''}
              placeholder={t('puree_editor:category_label')}
              onPress={() => setCatPickerOpen(true)}
            />
          </View>
        </CollapsibleSection>

        {/* ── Section 2: Ingredients (collapsed) ── */}
        <CollapsibleSection
          glass
          title={t('puree_editor:section_ingredients')}
          iconIos="list.bullet"
          iconAndroid="format-list-bulleted"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('puree_editor:ingredients_label')}</Text>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.formInput, styles.ingredientAmount, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.amount}
                  onChangeText={(value) => updateIngredient(index, 'amount', value)}
                  placeholder={t('puree_editor:amount_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.formInput, styles.ingredientName, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.ingredient}
                  onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                  placeholder={t('puree_editor:ingredient_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity style={styles.removeIngredientButton} onPress={() => removeIngredient(index)}>
                    <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color={TRASH_RED} />
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
          glass
          title={t('puree_editor:section_procedure')}
          iconIos="list.number"
          iconAndroid="format-list-numbered"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('puree_editor:procedure_label')}</Text>
            <RichTextToolbar
              text={isSpanishAuthor ? procedureEs : procedure}
              onChangeText={isSpanishAuthor ? setProcedureEs : setProcedure}
              selection={procedureSelection}
              onSelectionChange={setProcedureSelection}
              textInputRef={procedureInputRef}
              accentColor={colors.primary}
              backgroundColor={colors.surface}
              textColor={colors.text}
            />
            <View>
              <TextInput
                ref={procedureInputRef}
                style={[styles.formInput, styles.textArea, { minHeight: Math.max(120, procDragH), paddingBottom: 22, backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={isSpanishAuthor ? procedureEs : procedure}
                onChangeText={isSpanishAuthor ? setProcedureEs : setProcedure}
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

          {/* Bilingual authoring (s61 hybrid) */}
          <View style={styles.formField}>
            {translation.element}
          </View>
        </CollapsibleSection>

        {/* Nested INSIDE the sheet's Modal tree so iOS can present it above the
            open sheet (a sibling Modal would be silently dropped). The Custom…
            row lets an owner mint a new category for this section. */}
        <SimpleSelectPicker
          visible={catPickerOpen}
          title={t('puree_editor:category_label')}
          options={CATEGORIES.map(getCategoryLabel)}
          value={category ? getCategoryLabel(category) : ''}
          onSelect={(label) => {
            // Map a built-in label back to its canonical EN value; anything
            // else is a custom category, stored as typed.
            const builtin = CATEGORIES.find((c) => getCategoryLabel(c) === label);
            setCategory(builtin ?? label);
          }}
          onClose={() => setCatPickerOpen(false)}
          allowCustom
          customLabel={t('common.custom_option')}
          customPlaceholder={t('puree_editor:custom_category_placeholder')}
        />
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    marginTop: 14,
    textAlign: 'center',
  },
  // Shelf label — the mono zlabel rhythm (label · hairline · count).
  shelfLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  shelfLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  shelfLabelLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  shelfLabelCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  shelf: {
    marginHorizontal: -2,
  },
  shelfContent: {
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  // Plain (non-drag) tile — search results; same geometry as RecipeGridCard so
  // shelves never resize between modes.
  plainTile: {
    width: RECIPE_TILE_SIZE,
    aspectRatio: 1,
    borderRadius: 13,
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#1C2026',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  plainTileImage: {
    width: '100%',
    height: '100%',
  },
  plainTileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  plainTileMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 9,
    paddingBottom: 8,
  },
  // Scrim text = fixed-dark literal (white), the rulebook's ember rule.
  plainTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
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
  footerRow: {
    flexDirection: 'row',
    gap: 11,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnDisabled: {
    opacity: 0.6,
  },
  footerBtnLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
  formField: {
    marginBottom: 14,
  },
  formLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  formInput: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  thumbSquare: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
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
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  ingredientAmount: { flex: 1 },
  ingredientName: { flex: 2 },
  removeIngredientButton: { padding: 4 },
  addIngredientButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addIngredientText: { fontFamily: fonts.body.semibold, fontSize: 13 },
});
