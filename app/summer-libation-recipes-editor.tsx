
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
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import GlasswareIconPicker from '@/components/GlasswareIconPicker';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import {
  cocktailFedSubOptions,
  resolveRecipeSubId,
  recipeCategoryValueForSub,
} from '@/utils/menuCategoryLabels';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RecipeGridCard, { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import OrderPositionModal from '@/components/OrderPositionModal';
import GlassActionSheet from '@/components/GlassActionSheet';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import GlassSheet from '@/components/GlassSheet';
import MenuSearchRow from '@/components/MenuSearchRow';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import type { MenuSubcategory } from '@/hooks/useMenuCategories';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

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

type LibationRow = Database['public']['Functions']['get_summer_libation_recipes']['Returns'][number];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

const TRASH_RED = '#E53935';

// The category picker's "Featured" choice (s73): a recipe added straight to
// the Featured section — no menu subcategory (it never feeds a menu surface),
// stored as subcategory_id NULL + the legacy category string 'Featured' +
// is_featured true. The RPCs write p_subcategory_id straight through (verified
// no-COALESCE), so omitting it on update also CLEARS a previous subcategory.
const FEATURED_SENTINEL = '__featured__';

export default function SummerLibationRecipesEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { organizationId, organization } = useOrganization();
  const { perms } = useManagerPermissions();
  // Menu 2 → slot 2 in per-menu scope (shared scope ignores the slot).
  const { categories: menuCats, refresh: refreshMenuCats } = useMenuCategories({ includeHidden: true, menuSlot: 2 });
  const cocktailSubOptions = cocktailFedSubOptions(menuCats, t);
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<LibationRecipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // ··· meatball → GlassActionSheet (Edit / Move / Order Position / Delete)
  const [actionsFor, setActionsFor] = useState<{ recipe: LibationRecipe; siblings: LibationRecipe[]; index: number } | null>(null);
  // ··· → "Order Position" picker (siblings = the tapped recipe's category list)
  const [positionPicker, setPositionPicker] = useState<{ recipe: LibationRecipe; siblings: LibationRecipe[]; currentIndex: number } | null>(null);
  // ⇅ chip → category reorder sheet. Rows = ALL of the Libations category's
  // subcategories (order is one list — reordering only the recipe-fed ones
  // past unseen manual subs would be ambiguous); persists via the SAME RPC the
  // Menu Categories editor uses, so both surfaces stay in sync by definition.
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderSubs, setReorderSubs] = useState<MenuSubcategory[]>([]);

  // Form state
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
  // Dropdown pickers + auto-grow procedure height
  const [subPickerOpen, setSubPickerOpen] = useState(false);
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
      const { data, error } = await supabase.rpc('get_summer_libation_recipes', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading libation recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a, b) =>
        (a.category || '').localeCompare(b.category || '') || (a.display_order ?? 0) - (b.display_order ?? 0));
      setRecipes(sorted as (LibationRow & { ingredients: { amount: string; ingredient: string }[] })[]);
    } catch (error) {
      console.error('Error loading libation recipes:', error);
      Alert.alert(t('common.error'), t('summer_libation_editor.no_recipes'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Deep-link from a recipe-fed menu card ("Open Recipes Editor"): ?edit=<name>
  // opens this editor's own edit modal for that recipe. Name is the bridge —
  // fed menu rows sync from recipes by name. Waits for BOTH recipes and the
  // category tree (openEditModal resolves the subcategory), applies once, and
  // a name that no longer matches simply lands on the normal editor.
  const deepLink = useLocalSearchParams<{ edit?: string }>();
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !deepLink.edit) return;
    if (recipes.length === 0 || menuCats.length === 0) return;
    deepLinkApplied.current = true;
    const wanted = String(deepLink.edit).trim().toLowerCase();
    const target = recipes.find((r) => r.name.trim().toLowerCase() === wanted);
    if (target) openEditModal(target);
  }, [recipes, menuCats, deepLink.edit]);

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

      // Upload via the storage broker
      const publicUrl = await brokerUploadImage('summer_libation_image', uri, user.id);
      if (!publicUrl) {
        throw new Error('Upload failed');
      }

      setThumbnailUrl(publicUrl);
      Alert.alert(t('common.success'), t('summer_libation_editor.image_uploaded'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', translateServerError(error, 'Failed to upload image'));
    } finally {
      setUploadingImage(false);
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

      // Validate ingredients
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
      // Fill/refresh the other language per the s61 staleness rules (may ask once).
      const resolved = await translation.resolveOnSave();
      if (!resolved) { setLoading(false); return; }

      // Resolve the chosen cocktail-fed subcategory; keep writing a stable legacy
      // `category` string (built-in vocab or custom name) for fallback resolution.
      // The Featured choice carries NO subcategory (it never feeds a menu surface).
      const isFeaturedOnly = subcategoryId === FEATURED_SENTINEL;
      const selectedSub = isFeaturedOnly
        ? undefined
        : menuCats.flatMap((c) => c.subcategories).find((s) => s.id === subcategoryId);
      const legacyCategory = isFeaturedOnly ? 'Featured' : (selectedSub ? recipeCategoryValueForSub(selectedSub) : '');
      const subForRpc = isFeaturedOnly ? undefined : subcategoryId;
      const featuredForRpc = isFeaturedOnly ? true : isFeatured;

      if (editingRecipe) {
        // Update existing recipe using RPC function (same pattern as cocktails editor)
        const { error } = await supabase.rpc('update_summer_libation_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_recipe_id: editingRecipe.id,
          p_name: name.trim(),
          p_price: price.trim(),
          p_category: legacyCategory,
          p_subcategory_id: subForRpc,
          p_is_featured: featuredForRpc,
          p_glassware: (glassware.trim() || null) as string,
          p_garnish: (garnish.trim() || null) as string,
          p_ingredients: validIngredients,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: editingRecipe.display_order,
        });

        if (error) {
          console.error('Error updating libation recipe:', error);
          throw error;
        }
        await saveTranslations('summer_libation_recipes', editingRecipe.id, { procedure_es: resolved.procedure.es }, user?.id);
        Alert.alert(t('common.success'), t('summer_libation_editor.recipe_updated'));
      } else {
        // Insert new recipe using RPC function (same pattern as cocktails editor)
        const { data, error } = await supabase.rpc('insert_summer_libation_recipe', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_name: name.trim(),
          p_price: price.trim(),
          p_category: legacyCategory,
          p_subcategory_id: subForRpc,
          p_is_featured: featuredForRpc,
          p_glassware: (glassware.trim() || null) as string,
          p_garnish: (garnish.trim() || null) as string,
          p_ingredients: validIngredients,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: recipes.length,
        });

        if (error) {
          console.error('Error adding libation recipe:', error);
          throw error;
        }
        // insert_summer_libation_recipe returns the new id — use it directly.
        if (data) {
          await saveTranslations('summer_libation_recipes', data as string, { procedure_es: resolved.procedure.es }, user?.id);
        }
        Alert.alert(t('common.success'), t('summer_libation_editor.recipe_added'));
      }

      setShowModal(false);
      resetForm();
      loadRecipes();
    } catch (error: any) {
      console.error('Error saving libation recipe:', error);
      Alert.alert('Error', translateServerError(error, 'Failed to save recipe'));
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
              p_organization_id: organizationId ?? undefined,
              p_recipe_id: recipe.id,
            });

            if (error) {
              console.error('Error deleting libation recipe:', error);
              throw error;
            }
            Alert.alert(t('common.success'), t('summer_libation_editor.recipe_deleted'));
            loadRecipes();
          } catch (error: any) {
            console.error('Error deleting libation recipe:', error);
            Alert.alert('Error', translateServerError(error, 'Failed to delete recipe'));
          }
        },
      },
    ]);
  };

  // Persist a category's new card order. `ordered` is that category's recipes in
  // their new sequence; display_order is written 0..n via the reorder RPC (the
  // SECURITY DEFINER RPC is required — libation_recipes' direct-UPDATE policy is
  // gated on auth.uid(), which is null under the app's anon-key custom auth).
  // Only ever called with a FULL category group (drag + meatball live outside
  // search mode), so the written 0..n order can't interleave with unseen rows.
  const persistOrder = async (ordered: LibationRecipe[]) => {
    if (!user?.id) return;
    const orderMap = new Map(ordered.map((r, idx) => [r.id, idx]));
    setRecipes((prev) =>
      prev.map((r) => (orderMap.has(r.id) ? { ...r, display_order: orderMap.get(r.id)! } : r))
    );
    try {
      const { error } = await supabase.rpc('reorder_summer_libation_recipes', {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_ordered_ids: ordered.map((r) => r.id),
      });
      if (error) {
        console.error('Error reordering libation recipes:', error);
        loadRecipes();
      }
    } catch (error) {
      console.error('Error reordering libation recipes:', error);
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

  const openAddModal = () => {
    resetForm();
    addSessionRef.current += 1;
    setShowModal(true);
  };

  const openEditModal = (recipe: LibationRecipe) => {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setPrice(recipe.price);
    setSubcategoryId(
      resolveRecipeSubId(menuCats, recipe) ||
        (recipe.category === 'Featured' ? FEATURED_SENTINEL : '')
    );
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
    return toPublicUrl('summer-libation-recipe-images', url);
  };

  // ── Category reorder (⇅ chip) ─────────────────────────────────────────────
  const libationsCat = menuCats.find((c) => c.system_key === 'cat.libations');

  const openReorder = () => {
    if (!libationsCat) return;
    setReorderSubs(libationsCat.subcategories);
    setReorderOpen(true);
  };

  const persistSubOrder = async (ordered: MenuSubcategory[]) => {
    setReorderSubs(ordered);
    if (!user?.id || !organizationId || !libationsCat) return;
    try {
      const { error } = await supabase.rpc('manage_menu_subcategory_reorder', {
        p_user_id: user.id,
        p_organization_id: organizationId,
        p_category_id: libationsCat.id,
        p_ordered_ids: ordered.map((s) => s.id),
      });
      if (error) {
        console.error('Error reordering libation subcategories:', error);
        Alert.alert(t('common.error'), translateServerError(error));
      }
    } catch (error: any) {
      console.error('Error reordering libation subcategories:', error);
      Alert.alert(t('common.error'), translateServerError(error));
    } finally {
      // Shelves + the add/edit picker resort from the hook either way (on
      // error this also snaps the sheet's optimistic order back to truth).
      refreshMenuCats();
    }
  };

  // Search across name, ingredients, glassware and garnish. While a query is
  // active the shelves render as PLAIN tiles (tap = edit): dragging a filtered
  // subset would persist a partial 0..n order over the full group.
  const query = searchQuery.trim().toLowerCase();
  const searching = query.length > 0;
  const visibleRecipes = searching
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        (r.glassware || '').toLowerCase().includes(query) ||
        (r.garnish || '').toLowerCase().includes(query) ||
        (r.ingredients || []).some((i) => (i.ingredient || '').toLowerCase().includes(query))
      )
    : recipes;

  // Group recipes under their bound cocktail-fed subcategory (current names, in
  // the menu's subcategory order); featured recipes pin to the top of each group.
  const recipesByCategory: Record<string, LibationRecipe[]> = {};
  const groupedIds = new Set<string>();
  for (const opt of cocktailSubOptions) {
    const subRecipes = visibleRecipes
      .filter((r) => resolveRecipeSubId(menuCats, r) === opt.id)
      .sort((a, b) => (Number(b.is_featured) - Number(a.is_featured)) || (a.display_order - b.display_order));
    if (subRecipes.length > 0) {
      recipesByCategory[opt.label] = subRecipes;
      subRecipes.forEach((r) => groupedIds.add(r.id));
    }
  }
  // Recipes whose subcategory no longer resolves (e.g. a sub was un-marked
  // recipe-backed) still show, grouped by their stored category string.
  // Featured-only recipes (the picker's Featured choice) live in the strip
  // alone — a leftover "Featured" shelf would duplicate them.
  for (const r of visibleRecipes) {
    if (groupedIds.has(r.id)) continue;
    if (r.category === 'Featured' && r.is_featured) continue;
    const key = r.category || 'Other';
    (recipesByCategory[key] ||= []).push(r);
  }

  // The view-only Featured strip (✦ recipes across every group; tap = edit —
  // a recipe joins or leaves it via the Featured toggle in the edit sheet).
  const featuredRecipes = visibleRecipes.filter((r) => r.is_featured);

  const shelfLabel = (label: string, count: number) => (
    <View style={styles.shelfLabelRow}>
      <Text style={[styles.shelfLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.shelfLabelLine, { backgroundColor: colors.border + '55' }]} />
      <Text style={[styles.shelfLabelCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );

  // Plain (non-drag) tile — the Featured strip and search results.
  const plainTile = (recipe: LibationRecipe) => (
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
      {recipe.is_featured && (
        <View style={styles.featuredPill}>
          <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color="#1A1E24" />
        </View>
      )}
      <View style={styles.plainTileMeta}>
        <Text style={styles.plainTileName} numberOfLines={2}>{recipe.name}</Text>
        <Text style={styles.plainTilePrice}>{recipe.price}</Text>
      </View>
    </TouchableOpacity>
  );

  const actionSiblings = actionsFor?.siblings ?? [];
  const actionIndex = actionsFor?.index ?? 0;

  const screenTitle = organization?.menu_2_name ? `${organization.menu_2_name} ${t('libation_editor.title')}` : t('summer_libation_editor.title');
  const canEditCategories = user?.role === 'owner' || perms.editCategories;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={screenTitle}
        rightWide
        right={
          <HeaderNavMenu
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            sheetTitle={screenTitle}
            actions={[
              {
                key: 'switch',
                label: t('common:to_user'),
                iosIcon: 'person.fill',
                androidIcon: 'person',
                onPress: () => router.replace('/summer-libation-recipes'),
              },
              {
                key: 'cats',
                label: t('menu_sheet.edit_categories'),
                iosIcon: 'square.grid.2x2',
                androidIcon: 'grid-view',
                disabled: !canEditCategories,
                onPress: () => router.push({ pathname: '/manage-menu-categories', params: { cat: 'cat.libations', slot: '2' } } as any),
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

      {/* Search + ⇅ category reorder + compact ＋ — the menu editor's row. */}
      <MenuSearchRow
        colors={colors}
        mode="editor"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('summer_libation_editor.search_placeholder')}
        onRightPress={openAddModal}
        onReorderPress={openReorder}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {Object.keys(recipesByCategory).length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name="wineglass"
              android_material_icon_name="local-bar"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searching ? t('cocktails.no_results') : t('summer_libation_editor.no_recipes')}
            </Text>
          </View>
        ) : (
          <>
            {/* ── Featured strip (view-only; toggle lives in the edit sheet) ── */}
            {featuredRecipes.length > 0 && (
              <>
                {shelfLabel(t('summer_libation_recipes.featured'), featuredRecipes.length)}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.shelf}
                  contentContainerStyle={styles.shelfContent}
                >
                  {featuredRecipes.map(plainTile)}
                </ScrollView>
              </>
            )}

            {/* ── One shelf per subcategory ── */}
            {Object.entries(recipesByCategory).map(([cat, categoryRecipes]) => (
              <React.Fragment key={cat}>
                {shelfLabel(cat, categoryRecipes.length)}
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
                    renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<LibationRecipe>) => (
                      <RecipeGridCard
                        imageUrl={getImageUrl(item.thumbnail_url)}
                        name={item.name}
                        price={item.price}
                        featured={item.is_featured}
                        onPress={() => openEditModal(item)}
                        onMeatball={() => setActionsFor({ recipe: item, siblings: categoryRecipes, index: getIndex() ?? 0 })}
                        drag={drag}
                        isActive={isActive}
                      />
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </>
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
            label: t('summer_libation_editor.move_up'),
            iosIcon: 'arrow.up',
            androidIcon: 'arrow-upward',
            disabled: actionIndex === 0,
            onPress: () => handleMove(actionSiblings, actionIndex, -1),
          },
          {
            key: 'down',
            label: t('summer_libation_editor.move_down'),
            iosIcon: 'arrow.down',
            androidIcon: 'arrow-downward',
            disabled: actionIndex === actionSiblings.length - 1,
            onPress: () => handleMove(actionSiblings, actionIndex, 1),
          },
          {
            key: 'order',
            label: t('summer_libation_editor.order_position'),
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

      {/* ⇅ Category reorder — the drag list writes through the SAME RPC the
          Menu Categories editor uses, so the two stay in sync by definition.
          Drag-in-Modal rules: nested GestureHandlerRootView + scroll={false}. */}
      <GlassSheet
        visible={reorderOpen}
        onClose={() => setReorderOpen(false)}
        title={t('manage_categories:reorder')}
        subtitle={libationsCat?.display_name}
        scroll={false}
      >
        {/* GestureHandlerRootView defaults to flex:1, which collapses to ZERO
            height inside the sheet's content-sized body — size it explicitly
            (CategorySheet's proven dragWrap values). */}
        <GestureHandlerRootView style={styles.reorderWrap}>
          <DraggableFlatList
            data={reorderSubs}
            keyExtractor={(s) => s.id}
            activationDistance={8}
            onDragEnd={({ data }) => persistSubOrder(data)}
            renderItem={({ item, drag, isActive }: RenderItemParams<MenuSubcategory>) => (
              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={120}
                disabled={isActive}
                activeOpacity={0.85}
                style={[
                  styles.reorderRow,
                  { backgroundColor: colors.surface, borderColor: isActive ? colors.primary : colors.surfaceBorder },
                ]}
              >
                <IconSymbol
                  ios_icon_name="line.3.horizontal"
                  android_material_icon_name="drag-indicator"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={[styles.reorderName, { color: colors.text }]} numberOfLines={1}>
                  {item.display_name}
                </Text>
                {item.is_cocktail_fed && (
                  <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={13} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </GestureHandlerRootView>
      </GlassSheet>

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
        title={editingRecipe ? t('summer_libation_editor.modal_edit_title') : t('summer_libation_editor.modal_add_title')}
        footer={
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={closeModal}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('summer_libation_editor.cancel_button')}</Text>
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
                  {editingRecipe ? t('summer_libation_editor.update_button') : t('summer_libation_editor.save_button')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {/* ── Section 1: Recipe Basics (open) ── */}
        <CollapsibleSection
          glass
          title={t('summer_libation_editor.section_basics')}
          iconIos="wineglass.fill"
          iconAndroid="local-bar"
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
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.recipe_name_label')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={name}
                onChangeText={setName}
                placeholder={t('summer_libation_editor.recipe_name_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Subcategory (dropdown, Featured first) + Price */}
          <View style={styles.twoColRow}>
            <View style={styles.twoColLeft}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.category_label')}</Text>
              <SelectField
                value={
                  subcategoryId === FEATURED_SENTINEL
                    ? t('summer_libation_recipes.featured')
                    : cocktailSubOptions.find((o) => o.id === subcategoryId)?.label || ''
                }
                placeholder={t('summer_libation_editor.select_category')}
                onPress={() => setSubPickerOpen(true)}
              />
              {cocktailSubOptions.length === 0 && (
                <Text style={[styles.pickerEmptyHint, { color: colors.textSecondary }]}>
                  {t('summer_libation_editor.no_cocktail_subs')}
                </Text>
              )}
            </View>
            <View style={styles.twoColRight}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.price_label')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={price}
                onChangeText={setPrice}
                placeholder={t('summer_libation_editor.price_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Featured — locked ON when the category itself is Featured. */}
          <View style={[styles.featuredRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.featuredTextWrap}>
              <Text style={[styles.featuredLabel, { color: colors.text }]}>{t('summer_libation_editor.featured_label')}</Text>
              <Text style={[styles.featuredHint, { color: colors.textSecondary }]}>
                {t('summer_libation_editor.featured_hint')}
              </Text>
            </View>
            <Switch
              value={subcategoryId === FEATURED_SENTINEL ? true : isFeatured}
              onValueChange={setIsFeatured}
              disabled={subcategoryId === FEATURED_SENTINEL}
            />
          </View>
        </CollapsibleSection>

        {/* ── Section 2: Recipe (collapsed) ── */}
        <CollapsibleSection
          glass
          title={t('summer_libation_editor.section_recipe')}
          iconIos="list.bullet"
          iconAndroid="format-list-bulleted"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          {/* Glassware (visual picker) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.glassware_label')}</Text>
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
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.garnish_label')}</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
              value={garnish}
              onChangeText={setGarnish}
              placeholder={t('summer_libation_editor.garnish_placeholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {/* Ingredients */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.ingredients_label')}</Text>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.formInput, styles.ingredientAmount, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.amount}
                  onChangeText={(value) => updateIngredient(index, 'amount', value)}
                  placeholder={t('summer_libation_editor.amount_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.formInput, styles.ingredientName, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.ingredient}
                  onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                  placeholder={t('summer_libation_editor.ingredient_placeholder')}
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
              <Text style={[styles.addIngredientText, { color: colors.primary }]}>{t('summer_libation_editor.add_ingredient')}</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleSection>

        {/* ── Section 3: Procedure (collapsed) ── */}
        <CollapsibleSection
          glass
          title={t('summer_libation_editor.section_procedure')}
          iconIos="list.number"
          iconAndroid="format-list-numbered"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          {/* Procedure (auto-grow) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('summer_libation_editor.procedure_label')}</Text>
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
                placeholder={t('summer_libation_editor.procedure_placeholder')}
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
            open sheet (a sibling Modal would be silently dropped). */}
        <SimpleSelectPicker
          visible={subPickerOpen}
          title={t('summer_libation_editor.select_category')}
          options={[t('summer_libation_recipes.featured'), ...cocktailSubOptions.map((o) => o.label)]}
          value={
            subcategoryId === FEATURED_SENTINEL
              ? t('summer_libation_recipes.featured')
              : cocktailSubOptions.find((o) => o.id === subcategoryId)?.label || ''
          }
          onSelect={(label) => {
            // A real subcategory wins a name collision with "Featured".
            const opt = cocktailSubOptions.find((o) => o.label === label);
            if (opt) setSubcategoryId(opt.id);
            else if (label === t('summer_libation_recipes.featured')) setSubcategoryId(FEATURED_SENTINEL);
          }}
          onClose={() => setSubPickerOpen(false)}
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
  // Plain (non-drag) tile — Featured strip + search results; same geometry as
  // RecipeGridCard so shelves never resize between modes.
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
  // Scrim text = fixed-dark literals (white + #FFB07A), the rulebook's ember rule.
  plainTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  plainTilePrice: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    color: '#FFB07A',
  },
  featuredPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB07A',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    zIndex: 3,
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
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  twoColLeft: { flex: 3 },
  twoColRight: { flex: 2 },
  pickerEmptyHint: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 17,
    paddingVertical: 12,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  featuredTextWrap: { flex: 1 },
  featuredLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 14,
  },
  featuredHint: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 2,
  },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  ingredientAmount: { flex: 1 },
  ingredientName: { flex: 2 },
  removeIngredientButton: { padding: 4 },
  addIngredientButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addIngredientText: { fontFamily: fonts.body.semibold, fontSize: 13 },
  // Category reorder sheet (48pt targets, constant border width). The wrap's
  // explicit maxHeight + shrink replace GestureHandlerRootView's default
  // flex:1, which would zero out in the content-sized sheet body.
  reorderWrap: {
    maxHeight: 420,
    flexShrink: 1,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 13,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  reorderName: {
    flex: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
});
