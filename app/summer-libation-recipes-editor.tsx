
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
import { brokerDelete } from '@/utils/storageBroker';
import { toPublicUrl } from '@/utils/storageResolver';
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
import LibationRecipeForm, {
  FEATURED_SENTINEL,
  cleanIngredients,
  emptyLibationDraft,
  type LibationRecipeDraft,
} from '@/components/LibationRecipeForm';
import LibationUploadSheet from '@/components/LibationUploadSheet';
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
  /** s90: every photo, cover first (the server mirrors [0] into thumbnail_url). */
  images: string[];
  display_order: number;
  is_active: boolean;
}

type LibationRow = Database['public']['Functions']['get_summer_libation_recipes']['Returns'][number];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

const TRASH_RED = '#E53935';

// The category picker's "Featured" choice (FEATURED_SENTINEL, s73) lives in
// LibationRecipeForm: a recipe added straight to the Featured section — no menu
// subcategory, stored as subcategory_id NULL + the legacy category string
// 'Featured' + is_featured true. The RPCs write p_subcategory_id straight
// through (verified no-COALESCE), so omitting it on update also CLEARS a
// previous subcategory.

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

  // Form state — the shared LibationRecipeForm draft (s90). Photos the user
  // removed wait here until the save succeeds, then get broker-deleted.
  const [draft, setDraft] = useState<LibationRecipeDraft>(emptyLibationDraft());
  const removedImages = useRef<string[]>([]);
  // s90: the Libations AI Upload sheet (the To User sheet's row).
  const [uploadVisible, setUploadVisible] = useState(false);

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
        enValue: draft.procedure,
        esValue: draft.procedureEs,
        setEnValue: (v: string) => setDraft((d) => ({ ...d, procedure: v })),
        setEsValue: (v: string) => setDraft((d) => ({ ...d, procedureEs: v })),
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
        console.error('Error loading summer libation recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a, b) =>
        (a.category || '').localeCompare(b.category || '') || (a.display_order ?? 0) - (b.display_order ?? 0));
      // s90: `images` arrives as Json — the stored URLs, cover first; rows that
      // predate the list still carry only the thumbnail.
      setRecipes(sorted.map((r) => ({
        ...r,
        images: Array.isArray(r.images) ? (r.images as string[]) : (r.thumbnail_url ? [r.thumbnail_url] : []),
      })) as (LibationRow & { ingredients: { amount: string; ingredient: string }[]; images: string[] })[]);
    } catch (error) {
      console.error('Error loading summer libation recipes:', error);
      Alert.alert(t('common.error'), t('summer_libation_editor.no_recipes'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on every focus (s90): the Libations AI Upload review navigates back
  // here after publishing, and the new recipes must be on the shelves.
  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

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

  const handleSave = async () => {
    try {
      const name = draft.name.trim();
      if (!name) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_name'));
        return;
      }
      if (!draft.subcategoryId) {
        Alert.alert(t('common.error'), t('summer_libation_editor.error_no_category'));
        return;
      }
      // s90: at least one NAMED ingredient; amounts are optional (manual and
      // scanned recipes alike — Steve), and so is the price.
      const validIngredients = cleanIngredients(draft.ingredients);
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
      const isFeaturedOnly = draft.subcategoryId === FEATURED_SENTINEL;
      const selectedSub = isFeaturedOnly
        ? undefined
        : menuCats.flatMap((c) => c.subcategories).find((sub) => sub.id === draft.subcategoryId);
      const legacyCategory = isFeaturedOnly ? 'Featured' : (selectedSub ? recipeCategoryValueForSub(selectedSub) : '');
      const subForRpc = isFeaturedOnly ? undefined : draft.subcategoryId;
      const featuredForRpc = isFeaturedOnly ? true : draft.isFeatured;
      // The photo list's first entry is the cover (the server mirrors it into thumbnail_url).
      const common = {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_name: name,
        p_price: draft.price.trim(),
        p_category: legacyCategory,
        p_subcategory_id: subForRpc,
        p_is_featured: featuredForRpc,
        p_glassware: (draft.glassware.trim() || null) as string,
        p_garnish: (draft.garnish.trim() || null) as string,
        p_ingredients: validIngredients,
        p_procedure: (resolved.procedure.en.trim() || null) as string,
        p_thumbnail_url: (draft.images[0] ?? null) as string,
        p_images: draft.images,
      };

      if (editingRecipe) {
        const { error } = await supabase.rpc('update_summer_libation_recipe', {
          ...common,
          p_recipe_id: editingRecipe.id,
          p_display_order: editingRecipe.display_order,
        });
        if (error) {
          console.error('Error updating libation recipe:', error);
          throw error;
        }
        await saveTranslations('summer_libation_recipes', editingRecipe.id, { procedure_es: resolved.procedure.es }, user?.id);
        Alert.alert(t('common.success'), t('summer_libation_editor.recipe_updated'));
      } else {
        const { data, error } = await supabase.rpc('insert_summer_libation_recipe', {
          ...common,
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

      // Photos removed in the form go only now that the row is saved — a storage
      // failure must never read as a failed save.
      const removed = removedImages.current.splice(0);
      if (removed.length > 0) {
        try {
          await brokerDelete('summer-libation-recipe-images', removed, user.id);
        } catch (cleanupError) {
          console.error('Error deleting removed recipe photos:', cleanupError);
        }
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
            // The row is gone for good (s88: a real delete) — drop EVERY photo too (s90).
            const photos = recipe.images.length > 0 ? recipe.images : recipe.thumbnail_url ? [recipe.thumbnail_url] : [];
            if (photos.length > 0) brokerDelete('summer-libation-recipe-images', photos, user.id);
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
    removedImages.current = [];
    setDraft({
      name: recipe.name,
      price: recipe.price,
      subcategoryId:
        resolveRecipeSubId(menuCats, recipe) ||
        (recipe.category === 'Featured' ? FEATURED_SENTINEL : ''),
      isFeatured: !!recipe.is_featured,
      glassware: recipe.glassware || '',
      garnish: recipe.garnish || '',
      ingredients: recipe.ingredients.length > 0 ? recipe.ingredients : [{ amount: '', ingredient: '' }],
      procedure: recipe.procedure || '',
      procedureEs: recipe.procedure_es || '',
      images: recipe.images,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingRecipe(null);
    setDraft(emptyLibationDraft());
    removedImages.current = [];
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
              {
                // s90: the Libations AI Upload — the sheet carries the gates.
                key: 'upload',
                label: t('bartender_assistant_editor.upload_tile'),
                iosIcon: 'sparkles',
                androidIcon: 'auto-awesome',
                onPress: () => setUploadVisible(true),
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
                loading && styles.footerBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={loading}
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
        <LibationRecipeForm
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          subOptions={cocktailSubOptions}
          imagePurpose="summer_libation_image"
          imageBucket="summer-libation-recipe-images"
          onImageRemoved={(url) => { removedImages.current.push(url); }}
          isSpanishAuthor={isSpanishAuthor}
          translationElement={translation.element}
        />
      </GlassSheet>
      <LibationUploadSheet visible={uploadVisible} onClose={() => setUploadVisible(false)} defaultSlot={2} />
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
