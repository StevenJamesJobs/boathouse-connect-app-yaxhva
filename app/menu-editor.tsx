
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ActionSheetIOS,
  FlatList,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { brokerDelete, brokerUploadImage } from '@/utils/storageBroker';
import { useTranslation } from 'react-i18next';
import { translateTexts, saveTranslations, getLocalizedField } from '@/utils/translateContent';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import RichTextToolbar from '@/components/RichTextToolbar';
import FormattedText from '@/components/FormattedText';
import CategoryPill from '@/components/CategoryPill';
import SeasonSelector, { type Season } from '@/components/SeasonSelector';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel, findCategoryByName, labelForCategoryName } from '@/utils/menuCategoryLabels';
import { compareBySectionThenOrder } from '@/utils/menuBadges';
import { menuIconAndroid } from '@/constants/menuIcons';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  category: string;
  subcategory: string | null;
  available_for_lunch: boolean;
  available_for_dinner: boolean;
  is_gluten_free: boolean;
  is_gluten_free_available: boolean;
  is_vegetarian: boolean;
  is_vegetarian_available: boolean;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  display_order: number;
  is_active: boolean;
  is_weekly_special: boolean;
  name_es?: string | null;
  description_es?: string | null;
  location?: string | null;
  location_es?: string | null;
  glass_price?: string | null;
  bottle_price?: string | null;
  member_bottle_price?: string | null;
  flavor_profile?: string | null;
  flavor_profile_es?: string | null;
  unique_selling_points?: string | null;
  unique_selling_points_es?: string | null;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// The category/subcategory tree is loaded per-org from the DB (useMenuCategories).
// Labels/behavior resolve through utils/menuCategoryLabels: built-ins keep their
// i18n labels; renamed or custom names show raw. The swipe-pager page sequence is
// derived per-render from the loaded categories (see `pages` in the component).
interface PageConfig {
  category: string;
  subcategory: string | null;
}

export default function MenuEditorScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  // Default to Menu 1 (winter slot) — the more natural landing menu.
  const [season, setSeason] = useState<Season>('winter');
  const perMenu = organization?.menu_category_scope === 'per_menu';
  // In per-menu scope the active season selects which menu's category tree to edit.
  const { categories: menuCats, loading: categoriesLoading, refresh: refreshCategories } = useMenuCategories({
    includeHidden: true,
    menuSlot: season === 'winter' ? 1 : 2,
  });
  const { language } = useLanguage();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  // All org items across BOTH menus (no season filter) — used so the search box
  // spans the whole menu database, not just the active menu.
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  // Order Position picker (opened from a card's ··· menu): which item, its
  // category+subcategory siblings, and its current 0-based slot.
  const [positionPicker, setPositionPicker] = useState<{ item: MenuItem; siblings: MenuItem[]; currentIndex: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const pagerRef = useRef<FlatList>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const subcategoryScrollRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  const subcategoryLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  // Page sequence derived from the loaded category tree: one page per
  // subcategory, or a single page for a category with no subcategories.
  const pages = useMemo<PageConfig[]>(() => {
    const out: PageConfig[] = [];
    for (const cat of menuCats) {
      if (cat.is_hidden) continue; // hidden categories don't appear as editor tabs
      const visibleSubs = (cat.subcategories || []).filter((s) => !s.is_hidden);
      if (visibleSubs.length === 0) {
        out.push({ category: cat.display_name, subcategory: null });
      } else {
        for (const sub of visibleSubs) {
          out.push({ category: cat.display_name, subcategory: sub.display_name });
        }
      }
    }
    return out;
  }, [menuCats]);

  // Derive selected category/subcategory from current page index
  const currentPage = pages[currentPageIndex] || pages[0] || { category: '', subcategory: null };
  const selectedCategory = currentPage.category;
  const selectedSubcategory = currentPage.subcategory;

  // Behavior resolves by (possibly renamed) display name → system_key/filter_behavior.
  const categoryMatches = useCallback(
    (item: MenuItem, categoryName: string): boolean => {
      const fb = findCategoryByName(menuCats, categoryName)?.filter_behavior;
      // Per-menu treats Lunch/Dinner as normal categories — placement is by the
      // item's category assignment, not the "Available for" flags (which are a
      // shared-mode meal-service overlay).
      if (!perMenu && fb === 'lunch') return item.available_for_lunch;
      if (!perMenu && fb === 'dinner') return item.available_for_dinner;
      // Featured/Weekly Specials page surfaces both items tagged to it AND any item
      // flagged "Show on Featured Specials" (mirrors the customer MenuDisplay overlay).
      if (fb === 'weekly_specials') return item.category === categoryName || item.is_weekly_special;
      return item.category === categoryName;
    },
    [menuCats, perMenu],
  );
  const isWineName = useCallback(
    (name: string | null | undefined) => findCategoryByName(menuCats, name)?.system_key === 'cat.wine',
    [menuCats],
  );
  const selectedCategoryObj = findCategoryByName(menuCats, selectedCategory);
  const selectedSubObj = selectedCategoryObj?.subcategories.find((s) => s.display_name === selectedSubcategory);
  // Availability tag labels on the editor item cards follow lunch/dinner renames.
  // (The add/edit form uses its own menu-aware form* variants — see below.)
  const lunchName = menuCats.find((c) => c.filter_behavior === 'lunch')?.display_name || t('menu_editor:available_lunch');
  const dinnerName = menuCats.find((c) => c.filter_behavior === 'dinner')?.display_name || t('menu_editor:available_dinner');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Weekly Specials',
    subcategory: '',
    available_for_lunch: false,
    available_for_dinner: false,
    is_gluten_free: false,
    is_gluten_free_available: false,
    is_vegetarian: false,
    is_vegetarian_available: false,
    thumbnail_shape: 'square',
    display_order: 0,
    is_weekly_special: false,
    name_es: '',
    description_es: '',
    location: '',
    location_es: '',
    glass_price: '',
    bottle_price: '',
    member_bottle_price: '',
    flavor_profile: '',
    flavor_profile_es: '',
    unique_selling_points: '',
    unique_selling_points_es: '',
    item_season: 'both' as 'winter' | 'summer' | 'both',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  const descriptionInputRef = useRef<TextInput>(null);
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  // The add/edit form's category/subcategory pills must reflect the menu the
  // item is being assigned to (formData.item_season) — NOT whichever menu the
  // editor is currently viewing. In per-menu each menu has its own tree; in
  // shared mode this resolves to the single shared tree.
  const formMenuSlot: 1 | 2 = formData.item_season === 'summer' ? 2 : 1;
  const { categories: formMenuCats } = useMenuCategories({ includeHidden: true, menuSlot: formMenuSlot });
  const formWeeklySpecialsCat = formMenuCats.find((c) => c.system_key === 'cat.weekly_specials' && !c.is_hidden);
  const formHasWeeklySpecialsCat = !!formWeeklySpecialsCat;
  const formWeeklySpecialsLabel = formWeeklySpecialsCat ? categoryLabel(formWeeklySpecialsCat, t, language) : '';
  const formHasLunchCat = formMenuCats.some((c) => c.filter_behavior === 'lunch' && !c.is_hidden);
  const formHasDinnerCat = formMenuCats.some((c) => c.filter_behavior === 'dinner' && !c.is_hidden);
  const formLunchName = formMenuCats.find((c) => c.filter_behavior === 'lunch')?.display_name || t('menu_editor:available_lunch');
  const formDinnerName = formMenuCats.find((c) => c.filter_behavior === 'dinner')?.display_name || t('menu_editor:available_dinner');

  useEffect(() => {
    loadMenuItems();
    setCurrentPageIndex(0);
    pagerRef.current?.scrollToIndex({ index: 0, animated: false });
  }, [season]);

  // Refresh the category tree when returning from the Manage Categories screen.
  useFocusEffect(
    useCallback(() => {
      refreshCategories();
    }, [refreshCategories]),
  );

  const loadMenuItems = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      // Active-menu items (season-scoped) feed the swipe pager; the full set
      // (all menus) backs the whole-database search.
      const [scoped, all] = await Promise.all([
        supabase.rpc('get_menu_items', { p_actor_id: user.id, p_season: season }),
        supabase.rpc('get_menu_items', { p_actor_id: user.id }),
      ]);

      if (scoped.error) throw scoped.error;
      setMenuItems((scoped.data || []) as MenuItem[]);
      setAllItems((all.data || []) as MenuItem[]);
    } catch (error) {
      console.error('Error loading menu items:', error);
      Alert.alert(t('common:error'), t('menu_editor:load_error'));
    } finally {
      setLoading(false);
    }
  };

  const filterItems = useCallback(() => {
    // Search spans the WHOLE org (both menus) via allItems; browsing without a
    // query stays scoped to the active menu's pager (menuItems).
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredItems(
        allItems.filter(
          item =>
            item.name.toLowerCase().includes(query) ||
            (item.description && item.description.toLowerCase().includes(query)) ||
            item.category.toLowerCase().includes(query) ||
            (item.subcategory && item.subcategory.toLowerCase().includes(query)) ||
            (item.is_gluten_free && 'gf'.includes(query)) ||
            (item.is_gluten_free_available && 'gfa'.includes(query)) ||
            (item.is_vegetarian && ('v'.includes(query) || 'vegetarian'.includes(query))) ||
            (item.is_vegetarian_available && ('va'.includes(query) || 'vegetarian available'.includes(query)))
        )
      );
      return;
    }

    // No query: filter by the active page's category/subcategory.
    // Lunch/Dinner resolve to availability booleans; everything else matches
    // the category field (see categoryMatches).
    let filtered = menuItems.filter(item => categoryMatches(item, selectedCategory));
    if (selectedSubcategory) {
      filtered = filtered.filter(item => item.subcategory === selectedSubcategory);
    }
    setFilteredItems(filtered);
  }, [menuItems, allItems, searchQuery, selectedCategory, selectedSubcategory, categoryMatches]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

  // Navigate pager to a specific page by category/subcategory
  const navigateToPage = (category: string, subcategory?: string | null) => {
    let targetIndex: number;
    if (subcategory) {
      targetIndex = pages.findIndex(p => p.category === category && p.subcategory === subcategory);
    } else {
      targetIndex = pages.findIndex(p => p.category === category);
    }
    if (targetIndex >= 0) {
      setCurrentPageIndex(targetIndex);
      pagerRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }
  };

  // Handle swipe end — sync page index
  const onMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (newIndex >= 0 && newIndex < pages.length && newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
    }
  };

  // Auto-scroll category pills to center the active one
  useEffect(() => {
    const layout = categoryLayoutsRef.current[selectedCategory];
    if (layout && categoryScrollRef.current) {
      const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
      categoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
    }
  }, [selectedCategory]);

  // Auto-scroll subcategory pills to center the active one
  const prevCategoryRef = useRef(selectedCategory);
  useEffect(() => {
    if (!selectedSubcategory || !subcategoryScrollRef.current) return;
    const categoryChanged = prevCategoryRef.current !== selectedCategory;
    prevCategoryRef.current = selectedCategory;
    if (categoryChanged) {
      subcategoryLayoutsRef.current = {};
      subcategoryScrollRef.current.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        const layoutKey = `${selectedCategory}_${selectedSubcategory}`;
        const layout = subcategoryLayoutsRef.current[layoutKey];
        if (layout && subcategoryScrollRef.current) {
          const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
          subcategoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
        }
      }, 100);
    } else {
      const layoutKey = `${selectedCategory}_${selectedSubcategory}`;
      const layout = subcategoryLayoutsRef.current[layoutKey];
      if (layout) {
        const scrollToX = Math.max(0, layout.x - (SCREEN_WIDTH / 2) + (layout.width / 2));
        subcategoryScrollRef.current.scrollTo({ x: scrollToX, animated: true });
      }
    }
  }, [selectedCategory, selectedSubcategory]);

  // Get items for a specific page (used by the horizontal pager)
  const getItemsForPage = useCallback((page: PageConfig): MenuItem[] => {
    // Featured Specials combines flagged items from BOTH menus (allItems) so the
    // pill shows the same set on Menu 1 and Menu 2; other pages stay scoped to
    // the active menu (menuItems).
    const isSpecials = findCategoryByName(menuCats, page.category)?.filter_behavior === 'weekly_specials';
    let filtered = (isSpecials ? allItems : menuItems).filter(item => categoryMatches(item, page.category));
    if (page.subcategory) {
      filtered = filtered.filter(item => item.subcategory === page.subcategory);
    }
    // Group the combined Specials list by category → subcategory → order so
    // flagged items from the same section stay together.
    if (isSpecials) filtered = [...filtered].sort(compareBySectionThenOrder);
    return filtered;
  }, [menuItems, allItems, categoryMatches, menuCats]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: formData.thumbnail_shape === 'square' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common:error'), t('menu_editor:pick_image_error'));
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!user?.id) return null;
    try {
      setUploadingImage(true);
      console.log('Starting image upload for menu item');

      const publicUrl = await brokerUploadImage('menu_item_image', uri, user.id);

      if (!publicUrl) {
        Alert.alert(t('common:error'), t('menu_editor:upload_image_error'));
        return null;
      }

      console.log('Public URL:', publicUrl);

      return publicUrl;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAutoTranslate = async () => {
    const isWine = isWineName(formData.category);
    const hasAny = formData.name || formData.description ||
      (isWine && (formData.flavor_profile || formData.unique_selling_points));
    if (!hasAny) {
      Alert.alert(t('common:error'), t('translation_section:no_content_to_translate'));
      return;
    }
    setTranslating(true);
    try {
      const inputs = [
        formData.name,
        formData.description,
        isWine ? formData.flavor_profile : '',
        isWine ? formData.unique_selling_points : '',
      ];
      const results = await translateTexts(inputs);
      setFormData(prev => ({
        ...prev,
        name_es: results[0] || '',
        description_es: results[1] || '',
        ...(isWine ? {
          flavor_profile_es: results[2] || '',
          unique_selling_points_es: results[3] || '',
        } : {}),
      }));
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common:error'), t('translation_section:translate_failed'));
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    const isWine = isWineName(formData.category);
    // Wines validate on glass OR bottle price (members may not order all tiers);
    // non-wines still require the legacy single price.
    const winePriceMissing = isWine && !formData.glass_price && !formData.bottle_price;
    if (!formData.name || (!isWine && !formData.price) || winePriceMissing) {
      Alert.alert(t('common:error'), t('menu_editor:error_fill_fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('common:error'), t('menu_editor:error_not_authenticated'));
      return;
    }

    try {
      let thumbnailUrl = editingItem?.thumbnail_url || null;

      // Upload image if selected
      if (selectedImageUri) {
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL:', thumbnailUrl);
        }
      }

      if (editingItem) {
        // Update existing item using database function
        const { data, error } = await supabase.rpc('update_menu_item', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_menu_item_id: editingItem.id,
          p_name: formData.name,
          p_description: formData.description || null,
          p_price: formData.price,
          p_category: formData.category,
          p_subcategory: formData.subcategory || null,
          p_available_for_lunch: formData.available_for_lunch,
          p_available_for_dinner: formData.available_for_dinner,
          p_is_gluten_free: formData.is_gluten_free,
          p_is_gluten_free_available: formData.is_gluten_free_available,
          p_is_vegetarian: formData.is_vegetarian,
          p_is_vegetarian_available: formData.is_vegetarian_available,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_display_order: formData.display_order,
          p_location: isWine ? (formData.location || null) : null,
          p_glass_price: isWine ? (formData.glass_price || null) : null,
          p_bottle_price: isWine ? (formData.bottle_price || null) : null,
          p_member_bottle_price: isWine ? (formData.member_bottle_price || null) : null,
          p_flavor_profile: isWine ? (formData.flavor_profile || null) : null,
          p_flavor_profile_es: isWine ? (formData.flavor_profile_es || null) : null,
          p_unique_selling_points: isWine ? (formData.unique_selling_points || null) : null,
          p_unique_selling_points_es: isWine ? (formData.unique_selling_points_es || null) : null,
          p_season: formData.item_season,
          p_is_weekly_special: formData.is_weekly_special,
        });

        if (error) {
          console.error('Error updating menu item:', error);
          throw error;
        }
        console.log('Menu item updated successfully');
        Alert.alert(t('common:success'), t('menu_editor:updated_success'));

        // Save Spanish translations
        if (formData.name_es || formData.description_es || formData.location_es) {
          await saveTranslations('menu_items', editingItem.id, {
            name_es: formData.name_es,
            description_es: formData.description_es,
            ...(isWine ? { location_es: formData.location_es } : {}),
          }, user?.id);
        }
      } else {
        // New items append to the END of their category/subcategory list;
        // ordering is then adjusted via drag or the Order Position picker.
        const siblings = menuItems.filter(
          (m) => m.category === formData.category &&
            (formData.subcategory ? m.subcategory === formData.subcategory : !m.subcategory),
        );
        const nextOrder = siblings.length
          ? Math.max(...siblings.map((s) => s.display_order ?? 0)) + 1
          : 0;
        // Create new item using database function
        const { data, error } = await supabase.rpc('create_menu_item', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_name: formData.name,
          p_description: formData.description || null,
          p_price: formData.price,
          p_category: formData.category,
          p_subcategory: formData.subcategory || null,
          p_available_for_lunch: formData.available_for_lunch,
          p_available_for_dinner: formData.available_for_dinner,
          p_is_gluten_free: formData.is_gluten_free,
          p_is_gluten_free_available: formData.is_gluten_free_available,
          p_is_vegetarian: formData.is_vegetarian,
          p_is_vegetarian_available: formData.is_vegetarian_available,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_display_order: nextOrder,
          p_location: isWine ? (formData.location || null) : null,
          p_glass_price: isWine ? (formData.glass_price || null) : null,
          p_bottle_price: isWine ? (formData.bottle_price || null) : null,
          p_member_bottle_price: isWine ? (formData.member_bottle_price || null) : null,
          p_flavor_profile: isWine ? (formData.flavor_profile || null) : null,
          p_flavor_profile_es: isWine ? (formData.flavor_profile_es || null) : null,
          p_unique_selling_points: isWine ? (formData.unique_selling_points || null) : null,
          p_unique_selling_points_es: isWine ? (formData.unique_selling_points_es || null) : null,
          p_season: formData.item_season,
          p_is_weekly_special: formData.is_weekly_special,
        });

        if (error) {
          console.error('Error creating menu item:', error);
          throw error;
        }
        console.log('Menu item created successfully');
        Alert.alert(t('common:success'), t('menu_editor:created_success'));

        // Save Spanish translations for newly created item (create_menu_item returns its id).
        if (formData.name_es || formData.description_es || formData.location_es) {
          if (data) {
            await saveTranslations('menu_items', data as string, {
              name_es: formData.name_es,
              description_es: formData.description_es,
              ...(isWine ? { location_es: formData.location_es } : {}),
            }, user?.id);
          }
        }
      }

      closeModal();
      loadMenuItems();
    } catch (error: any) {
      console.error('Error saving menu item:', error);
      Alert.alert(t('common:error'), error.message || t('menu_editor:save_error'));
    }
  };

  const handleDelete = async (item: MenuItem) => {
    Alert.alert(
      t('menu_editor:delete_title'),
      t('menu_editor:delete_confirm', { name: item.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert(t('common:error'), t('menu_editor:error_not_authenticated'));
                return;
              }

              // Delete using database function
              const { error } = await supabase.rpc('delete_menu_item', {
                p_user_id: user.id,
                p_organization_id: organizationId,
                p_menu_item_id: item.id,
              });

              if (error) {
                console.error('Error deleting menu item:', error);
                throw error;
              }

              // Delete image if exists
              if (item.thumbnail_url) {
                await brokerDelete('menu-items', [item.thumbnail_url], user.id);
              }

              Alert.alert(t('common:success'), t('menu_editor:deleted_success'));
              loadMenuItems();
            } catch (error: any) {
              console.error('Error deleting menu item:', error);
              Alert.alert(t('common:error'), error.message || t('menu_editor:delete_error'));
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (!user?.id) return;
    if (index <= 0) return;
    const items = [...filteredItems];
    const currentItem = items[index];
    const aboveItem = items[index - 1];
    const currentOrder = currentItem.display_order;
    const aboveOrder = aboveItem.display_order;
    // Swap in filteredItems
    items[index] = { ...aboveItem, display_order: currentOrder };
    items[index - 1] = { ...currentItem, display_order: aboveOrder };
    setFilteredItems(items);
    // Also update in main menuItems array
    const newMenuItems = [...menuItems];
    const ci = newMenuItems.findIndex(m => m.id === currentItem.id);
    const ai = newMenuItems.findIndex(m => m.id === aboveItem.id);
    if (ci >= 0) newMenuItems[ci] = { ...newMenuItems[ci], display_order: aboveOrder };
    if (ai >= 0) newMenuItems[ai] = { ...newMenuItems[ai], display_order: currentOrder };
    setMenuItems(newMenuItems);
    try {
      // Persist the whole filtered group's new order (reindexed 0..N-1) via the gated RPC,
      // then reload so the editor reflects the DB's normalized display_order live.
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: items.map((i) => i.id),
      });
      if (error) throw error;
      loadMenuItems();
    } catch (error) {
      console.error('Error moving menu item up:', error);
      loadMenuItems();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (!user?.id) return;
    if (index >= filteredItems.length - 1) return;
    const items = [...filteredItems];
    const currentItem = items[index];
    const belowItem = items[index + 1];
    const currentOrder = currentItem.display_order;
    const belowOrder = belowItem.display_order;
    items[index] = { ...belowItem, display_order: currentOrder };
    items[index + 1] = { ...currentItem, display_order: belowOrder };
    setFilteredItems(items);
    const newMenuItems = [...menuItems];
    const ci = newMenuItems.findIndex(m => m.id === currentItem.id);
    const bi = newMenuItems.findIndex(m => m.id === belowItem.id);
    if (ci >= 0) newMenuItems[ci] = { ...newMenuItems[ci], display_order: belowOrder };
    if (bi >= 0) newMenuItems[bi] = { ...newMenuItems[bi], display_order: currentOrder };
    setMenuItems(newMenuItems);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: items.map((i) => i.id),
      });
      if (error) throw error;
      loadMenuItems();
    } catch (error) {
      console.error('Error moving menu item down:', error);
      loadMenuItems();
    }
  };

  // Open the Order Position picker for an item — a quick way to jump it to an
  // exact slot within its category/subcategory without dragging.
  const openPositionPicker = (item: MenuItem) => {
    const siblings = getItemsForPage({ category: item.category, subcategory: item.subcategory });
    const currentIndex = siblings.findIndex((s) => s.id === item.id);
    if (siblings.length < 2 || currentIndex < 0) return;
    setPositionPicker({ item, siblings, currentIndex });
  };

  // Commit a chosen 1-based position: splice the item into the new slot, then
  // rewrite display_order across the sibling group and reload.
  const applyPositionChange = async (newPos: number) => {
    if (!user?.id) return;
    if (!positionPicker) return;
    const { item, siblings, currentIndex } = positionPicker;
    const newIndex = newPos - 1;
    setPositionPicker(null);
    if (newIndex === currentIndex) return;
    const reordered = [...siblings];
    reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, item);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: reordered.map((it) => it.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error applying position change:', error);
    }
    loadMenuItems();
  };

  // Overflow (⋮) action sheet for a menu item row. Edit / Move Up / Move Down /
  // Order Position / Delete in one compact menu. Drag-to-reorder is the primary
  // reorder path; Move Up/Down (non-search only) and Order Position are quick
  // alternatives so cards stay clean.
  const openItemActions = (item: MenuItem, index: number, opts?: { allowReorder?: boolean }) => {
    // Featured Specials is a read-only combined overview — its overflow menu
    // omits the reorder actions (Move Up/Down/Order Position).
    const allowReorder = opts?.allowReorder !== false;
    const inSearch = searchQuery.trim().length > 0;
    const isFirst = index === 0;
    const isLast = index === filteredItems.length - 1;
    const siblingCount = getItemsForPage({ category: item.category, subcategory: item.subcategory }).length;

    const editLabel = t('common:edit');
    const moveUpLabel = t('upcoming_events_editor:move_up');
    const moveDownLabel = t('upcoming_events_editor:move_down');
    const orderLabel = t('menu_editor:order_position');
    const deleteLabel = t('common:delete');
    const cancelLabel = t('common:cancel');

    if (Platform.OS === 'ios') {
      const options: string[] = [editLabel];
      const actions: Array<() => void> = [() => openEditModal(item)];
      if (allowReorder && !inSearch && !isFirst) {
        options.push(moveUpLabel);
        actions.push(() => handleMoveUp(index));
      }
      if (allowReorder && !inSearch && !isLast) {
        options.push(moveDownLabel);
        actions.push(() => handleMoveDown(index));
      }
      if (allowReorder && siblingCount > 1) {
        options.push(orderLabel);
        actions.push(() => openPositionPicker(item));
      }
      options.push(deleteLabel);
      actions.push(() => handleDelete(item));
      options.push(cancelLabel);

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: options.length - 2,
          cancelButtonIndex: options.length - 1,
          title: item.name,
        },
        (buttonIndex) => {
          if (buttonIndex === options.length - 1) return;
          actions[buttonIndex]?.();
        }
      );
    } else {
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
        { text: editLabel, onPress: () => openEditModal(item) },
      ];
      if (allowReorder && !inSearch && !isFirst) buttons.push({ text: moveUpLabel, onPress: () => handleMoveUp(index) });
      if (allowReorder && !inSearch && !isLast) buttons.push({ text: moveDownLabel, onPress: () => handleMoveDown(index) });
      if (allowReorder && siblingCount > 1) buttons.push({ text: orderLabel, onPress: () => openPositionPicker(item) });
      buttons.push({ text: deleteLabel, style: 'destructive', onPress: () => handleDelete(item) });
      buttons.push({ text: cancelLabel, style: 'cancel' });
      Alert.alert(item.name, undefined, buttons);
    }
  };

  const handleDragEnd = async ({ data: reorderedData }: { data: MenuItem[] }) => {
    if (!user?.id) return;
    const updatedFiltered = reorderedData.map((item, index) => ({
      ...item,
      display_order: index,
    }));
    setFilteredItems(updatedFiltered);
    // Update in main menuItems array too
    const newMenuItems = [...menuItems];
    updatedFiltered.forEach((item) => {
      const idx = newMenuItems.findIndex(m => m.id === item.id);
      if (idx >= 0) newMenuItems[idx] = { ...newMenuItems[idx], display_order: item.display_order };
    });
    setMenuItems(newMenuItems);
    try {
      const { error } = await supabase.rpc('reorder_menu_items', {
        p_actor_id: user.id, p_ordered_ids: reorderedData.map((item) => item.id),
      });
      if (error) throw error;
      console.log('Drag reorder persisted successfully');
    } catch (error) {
      console.error('Error persisting drag reorder:', error);
      loadMenuItems();
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      category: selectedCategory,
      subcategory: selectedSubcategory || '',
      available_for_lunch: findCategoryByName(menuCats, selectedCategory)?.filter_behavior === 'lunch',
      available_for_dinner: findCategoryByName(menuCats, selectedCategory)?.filter_behavior === 'dinner',
      is_gluten_free: false,
      is_gluten_free_available: false,
      is_vegetarian: false,
      is_vegetarian_available: false,
      thumbnail_shape: 'square',
      display_order: 0,
      is_weekly_special: false,
      name_es: '',
      description_es: '',
      location: '',
      location_es: '',
      glass_price: '',
      bottle_price: '',
      member_bottle_price: '',
      flavor_profile: '',
      flavor_profile_es: '',
      unique_selling_points: '',
      unique_selling_points_es: '',
      item_season: season === 'summer' ? 'summer' : season === 'winter' ? 'winter' : 'both',
    });
    setSelectedImageUri(null);
    setShowSpanish(false);
    setShowAddModal(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      price: item.price,
      category: item.category,
      subcategory: item.subcategory || '',
      available_for_lunch: item.available_for_lunch,
      available_for_dinner: item.available_for_dinner,
      is_gluten_free: item.is_gluten_free,
      is_gluten_free_available: item.is_gluten_free_available,
      is_vegetarian: item.is_vegetarian,
      is_vegetarian_available: item.is_vegetarian_available,
      thumbnail_shape: item.thumbnail_shape,
      display_order: item.display_order,
      is_weekly_special: item.is_weekly_special,
      name_es: item.name_es || '',
      description_es: item.description_es || '',
      location: item.location || '',
      location_es: item.location_es || '',
      glass_price: item.glass_price || '',
      bottle_price: item.bottle_price || '',
      member_bottle_price: item.member_bottle_price || '',
      flavor_profile: item.flavor_profile || '',
      flavor_profile_es: item.flavor_profile_es || '',
      unique_selling_points: item.unique_selling_points || '',
      unique_selling_points_es: item.unique_selling_points_es || '',
      item_season: ((item as any).season as 'winter' | 'summer' | 'both') || 'both',
    });
    setShowSpanish(false);
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setSelectedImageUri(null);
  };

  const handleBackPress = () => {
    router.replace('/(portal)/manager/manage');
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url;
  };

  // Helper function to format price with $ sign
  const formatPrice = (price: string) => {
    // If price already has $, return as is
    if (price.includes('$')) {
      return price;
    }
    // Otherwise add $ at the beginning
    return `$${price}`;
  };

  // Compact price label for the editor preview card. Wines collapse to
  // "Glass / Bottle" tiers; non-wines fall back to the legacy single price.
  const formatItemPriceLabel = (item: MenuItem) => {
    if (isWineName(item.category)) {
      const parts: string[] = [];
      if (item.glass_price) parts.push(`Gl ${formatPrice(item.glass_price)}`);
      if (item.bottle_price) parts.push(`Btl ${formatPrice(item.bottle_price)}`);
      if (parts.length > 0) return parts.join(' / ');
    }
    return formatPrice(item.price);
  };

  // Which menu an item belongs to (winter → Menu 1, summer → Menu 2, both →
  // shared/legacy) — drives the badge on whole-database search results.
  const menuBadgeForSeason = (s: string | null | undefined): { icon: string; label: string } => {
    if (s === 'winter') return { icon: organization?.menu_1_icon || 'snowflake', label: organization?.menu_1_name || t('menu_editor:season_winter') };
    if (s === 'summer') return { icon: organization?.menu_2_icon || 'sun.max.fill', label: organization?.menu_2_name || t('menu_editor:season_summer') };
    return { icon: 'circle.grid.2x2', label: t('menu_editor:season_both') };
  };

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('menu_editor:title')}</Text>
        {user?.role === 'owner' ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/menu-upload' as any)}
              style={styles.aiButton}
              accessibilityLabel={t('menu_editor:ai_upload_button', 'AI Menu Upload')}
            >
              <IconSymbol
                ios_icon_name="sparkles"
                android_material_icon_name="auto-awesome"
                size={15}
                color={colors.primary}
              />
              <Text style={styles.aiButtonText}>{t('menu_editor:ai_button', 'AI')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/manage-menu-categories' as any)}
              style={styles.manageCatsButton}
              accessibilityLabel={t('menu_editor:manage_categories_button')}
            >
              <IconSymbol
                ios_icon_name="square.grid.2x2"
                android_material_icon_name="grid-view"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.manageCatsButtonText}>{t('menu_editor:manage_categories_button')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* Season Selector — only for two-menu orgs. A single-menu org has no
          Menu 1 / Menu 2 choice, so we hide the tabs (matches the customer
          MenuDisplay, which also gates this on menu_count === 2). */}
      {organization?.menu_count === 2 && (
        <View style={styles.seasonSelectorContainer}>
          <SeasonSelector
            selectedSeason={season}
            onSeasonChange={setSeason}
            menu1Label={organization?.menu_1_name}
            menu2Label={organization?.menu_2_name}
            menu1Icon={organization?.menu_1_icon}
            menu2Icon={organization?.menu_2_icon}
          />
        </View>
      )}

      {/* Search Bar + Add Button */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={colors.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t('menu_editor:search_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.addIconButton}
          onPress={openAddModal}
          accessibilityLabel={t('menu_editor:add_button')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={26}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      {searchQuery.length > 0 && (
        <View style={styles.searchInfoBanner}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={16}
            color={colors.primary}
          />
          <Text style={styles.searchInfoText}>
            {filteredItems.length === 1
              ? t('menu_editor:search_results', { count: filteredItems.length })
              : t('menu_editor:search_results_plural', { count: filteredItems.length })}
          </Text>
        </View>
      )}

      {/* Category Tabs - Only show when NOT searching */}
      {!searchQuery && (
        <ScrollView
          ref={categoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {menuCats.filter((c) => !c.is_hidden).map((cat) => (
            <CategoryPill
              key={cat.id}
              size="lg"
              label={categoryLabel(cat, t, language)}
              selected={selectedCategory === cat.display_name}
              onPress={() => navigateToPage(cat.display_name)}
              onLayout={(e) => {
                categoryLayoutsRef.current[cat.display_name] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* Subcategory Tabs - Only show when NOT searching */}
      {!searchQuery && selectedCategoryObj && selectedCategoryObj.subcategories.some((s) => !s.is_hidden) && (
        <ScrollView
          ref={subcategoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subcategoryScroll}
          contentContainerStyle={styles.subcategoryScrollContent}
        >
          {selectedCategoryObj.subcategories.filter((s) => !s.is_hidden).map((sub) => (
            <CategoryPill
              key={sub.id}
              size="sm"
              label={subcategoryLabel(sub, t, language)}
              selected={selectedSubcategory === sub.display_name}
              onPress={() => navigateToPage(selectedCategory, sub.display_name)}
              onLayout={(e) => {
                subcategoryLayoutsRef.current[`${selectedCategory}_${sub.display_name}`] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* Libation cocktails redirect banner — Menu 1 (winter) feeds from the Libation
          Recipes Editor; Menu 2 (summer) from the Summer Libation Recipes Editor. */}
      {selectedSubObj?.is_cocktail_fed && !searchQuery && (
        <TouchableOpacity
          style={styles.libationBanner}
          onPress={() => router.push((season === 'summer' ? '/summer-libation-recipes-editor' : '/libation-recipes-editor') as any)}
          activeOpacity={0.7}
        >
          <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={20} color={colors.primary} />
          <Text style={styles.libationBannerText}>
            {t(season === 'summer' ? 'menu_editor:summer_libation_banner' : 'menu_editor:winter_libation_banner')}
          </Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Menu Items List */}
      {(loading || categoriesLoading) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
        {searchQuery && filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant-menu"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyText}>
              {t('menu_editor:empty_title')}
            </Text>
            <Text style={styles.emptySubtext}>
              {t('menu_editor:empty_search_subtext')}
            </Text>
          </View>
        ) : searchQuery ? (
          <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
            {filteredItems.map((item, index) => (
              <View key={item.id} style={styles.menuItemCard}>
                {/* Overflow menu (Edit / Move Up / Move Down / Delete) */}
                <TouchableOpacity
                  style={styles.overflowButton}
                  onPress={() => openItemActions(item, index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol
                    ios_icon_name="ellipsis"
                    android_material_icon_name="more-vert"
                    size={20}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>

                {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <StorageImage key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.squareImage} />
                    <View style={styles.squareContent}>
                      <View style={styles.squareHeader}>
                        <Text style={styles.menuItemPrice}>{formatItemPriceLabel(item)}</Text>
                        <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                      </View>
                      {item.description && (
                        <FormattedText style={styles.squareDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>
                      )}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                        {!perMenu && item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{lunchName}</Text></View>}
                        {!perMenu && item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{dinnerName}</Text></View>}
                        {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                        {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                        {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                        {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                      </View>
                    </View>
                    {(() => {
                      const badge = menuBadgeForSeason((item as any).season);
                      return (
                        <View style={styles.menuBadge}>
                          <IconSymbol ios_icon_name={badge.icon} android_material_icon_name={menuIconAndroid(badge.icon)} size={12} color={colors.primary} />
                          <Text style={styles.menuBadgeText} numberOfLines={1}>{badge.label}</Text>
                        </View>
                      );
                    })()}
                  </View>
                ) : (
                  <>
                    {item.thumbnail_url && <StorageImage key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.menuItemImageBanner} />}
                    <View style={styles.menuItemContent}>
                      <View style={styles.menuItemHeader}>
                        <Text style={styles.menuItemPrice}>{formatItemPriceLabel(item)}</Text>
                        <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                      </View>
                      {item.description && <FormattedText style={styles.menuItemDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                        {!perMenu && item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{lunchName}</Text></View>}
                        {!perMenu && item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{dinnerName}</Text></View>}
                        {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                        {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                        {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                        {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                      </View>
                      {(() => {
                        const badge = menuBadgeForSeason((item as any).season);
                        return (
                          <View style={styles.menuBadge}>
                            <IconSymbol ios_icon_name={badge.icon} android_material_icon_name={menuIconAndroid(badge.icon)} size={12} color={colors.primary} />
                            <Text style={styles.menuBadgeText} numberOfLines={1}>{badge.label}</Text>
                          </View>
                        );
                      })()}
                    </View>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          /* Normal mode: horizontal swipe pager — one page per category/subcategory */
          <FlatList
            ref={pagerRef}
            style={{ flex: 1 }}
            data={pages}
            keyExtractor={(_, index) => `page-${index}`}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            // The loading spinner (line ~1157) unmounts this pager on every
            // loadMenuItems() (move up/down, add/edit/delete, position picker) —
            // remount on the ACTIVE page, not page 0, so the visible list stays
            // on the category/subcategory pills the user is parked on. Clamped:
            // pages can shrink after category edits.
            initialScrollIndex={Math.max(0, Math.min(currentPageIndex, pages.length - 1))}
            renderItem={({ item: page }) => {
              const pageItems = getItemsForPage(page);
              // Featured Specials is a combined cross-menu overview — read-only
              // ordering here (drag + Move/Order disabled), with menu + category chips.
              const isWS = findCategoryByName(menuCats, page.category)?.filter_behavior === 'weekly_specials';
              if (pageItems.length === 0) {
                return (
                  <View style={{ width: SCREEN_WIDTH }}>
                    <View style={styles.emptyContainer}>
                      <IconSymbol
                        ios_icon_name="fork.knife"
                        android_material_icon_name="restaurant-menu"
                        size={64}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.emptyText}>{t('menu_editor:empty_title')}</Text>
                      <Text style={styles.emptySubtext}>{t('menu_editor:empty_subtext')}</Text>
                      {user?.role === 'owner' && (
                        <TouchableOpacity
                          style={styles.uploadMenuButton}
                          onPress={() => router.push('/menu-upload' as any)}
                          activeOpacity={0.85}
                        >
                          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={18} color={colors.fireText} />
                          <Text style={styles.uploadMenuButtonText}>{t('menu_editor:upload_menu_button', 'Upload Menu')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }
              return (
                <View style={[styles.itemsList, { width: SCREEN_WIDTH }]}>
                  {pageItems.length > 1 && !isWS && (
                    <Text style={styles.reorderHint}>{t('upcoming_events_editor:reorder_hint')}</Text>
                  )}
                  <DraggableFlatList
                    data={pageItems}
                    keyExtractor={(item) => item.id}
                    onDragEnd={handleDragEnd}
                    activationDistance={10}
                    contentContainerStyle={styles.itemsListContent}
                    renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<MenuItem>) => {
                      const index = getIndex() ?? 0;

                return (
                  <ScaleDecorator>
                    <View style={[styles.menuItemCard, isActive && styles.menuItemCardDragging]}>
                      {/* Drag Handle — hidden on the read-only Featured Specials overview */}
                      {!isWS && (
                        <TouchableOpacity
                          onLongPress={drag}
                          disabled={isActive}
                          style={styles.dragHandle}
                        >
                          <IconSymbol
                            ios_icon_name="line.3.horizontal.decrease"
                            android_material_icon_name="drag-indicator"
                            size={20}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )}

                      {/* Overflow menu (Edit / Move Up / Move Down / Delete) */}
                      <TouchableOpacity
                        style={styles.overflowButton}
                        onPress={() => openItemActions(item, index, { allowReorder: !isWS })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol
                          ios_icon_name="ellipsis"
                          android_material_icon_name="more-vert"
                          size={20}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>

                      {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                        <View style={styles.squareLayout}>
                          <StorageImage key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.squareImage} />
                          <View style={styles.squareContent}>
                            <View style={styles.squareHeader}>
                              <Text style={styles.menuItemPrice}>{formatItemPriceLabel(item)}</Text>
                              <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                            </View>
                            {item.description && (
                              <FormattedText style={styles.squareDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>
                            )}
                            <View style={styles.menuItemTags}>
                              {isWS && (<>
                                <View style={[styles.tag, { backgroundColor: '#1E88E518' }]}><Text style={[styles.tagText, { color: '#1E88E5' }]}>{menuBadgeForSeason((item as any).season).label}</Text></View>
                                <View style={[styles.tag, { backgroundColor: '#00897B18' }]}><Text style={[styles.tagText, { color: '#00897B' }]}>{labelForCategoryName(item.category, t, menuCats, language)}</Text></View>
                              </>)}
                              {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                              {!perMenu && item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{lunchName}</Text></View>}
                              {!perMenu && item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{dinnerName}</Text></View>}
                              {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                              {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                              {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                              {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                            </View>
                          </View>
                        </View>
                      ) : (
                        <>
                          {item.thumbnail_url && <StorageImage key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.menuItemImageBanner} />}
                          <View style={styles.menuItemContent}>
                            <View style={[styles.menuItemHeader, !item.thumbnail_url && !isWS && styles.menuItemHeaderClear]}>
                              {item.thumbnail_url && <Text style={styles.menuItemPrice}>{formatItemPriceLabel(item)}</Text>}
                              <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                            </View>
                            {item.description && <FormattedText style={styles.menuItemDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>}
                            <View style={[styles.menuItemTags, !item.thumbnail_url && styles.menuItemTagsPriceRoom]}>
                              {isWS && (<>
                                <View style={[styles.tag, { backgroundColor: '#1E88E518' }]}><Text style={[styles.tagText, { color: '#1E88E5' }]}>{menuBadgeForSeason((item as any).season).label}</Text></View>
                                <View style={[styles.tag, { backgroundColor: '#00897B18' }]}><Text style={[styles.tagText, { color: '#00897B' }]}>{labelForCategoryName(item.category, t, menuCats, language)}</Text></View>
                              </>)}
                              {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                              {!perMenu && item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{lunchName}</Text></View>}
                              {!perMenu && item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={[styles.tagText, { color: colors.fireText }]}>{dinnerName}</Text></View>}
                              {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                              {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                              {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                              {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                            </View>
                            {!item.thumbnail_url && <Text style={styles.menuItemPriceCorner}>{formatItemPriceLabel(item)}</Text>}
                          </View>
                        </>
                      )}
                    </View>
                  </ScaleDecorator>
                );
              }}
                  />
                </View>
              );
            }}
          />
        )}
        </>
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
                {editingItem ? t('menu_editor:modal_edit') : t('menu_editor:modal_add')}
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
              {/* ── SECTION: Item basics ───────────────────────────── */}
              <View style={styles.formSection}>
              {/* Thumbnail (80×80, top-left) + Name (right) */}
              <View style={styles.thumbAndNameRow}>
                <View style={styles.thumbColumn}>
                  <TouchableOpacity style={styles.thumbSquare} onPress={pickImage}>
                    {selectedImageUri || editingItem?.thumbnail_url ? (
                      <StorageImage
                        source={{ uri: selectedImageUri || getImageUrl(editingItem?.thumbnail_url || '') || '' }}
                        style={styles.thumbImage}
                        key={selectedImageUri || getImageUrl(editingItem?.thumbnail_url || '')}
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <IconSymbol
                          ios_icon_name="photo"
                          android_material_icon_name="add-photo-alternate"
                          size={28}
                          color="#999999"
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.nameColumn}>
                  <Text style={styles.formLabel}>{t('menu_editor:name_label')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('menu_editor:name_placeholder')}
                    placeholderTextColor="#999999"
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                  />
                </View>
              </View>

              {/* Image shape (left, under the thumbnail) + Price (right, under the
                  Name). Wines hide the legacy single Price (Glass/Bottle/Member
                  live in the wine section); the shape selector then takes the full
                  width. */}
              <View style={styles.priceShapeRow}>
                <View style={styles.shapeCol}>
                  <Text style={styles.formLabel}>{t('menu_editor:shape_label')}</Text>
                  <View style={styles.shapeSegmented}>
                    <TouchableOpacity
                      style={[styles.shapeSegment, formData.thumbnail_shape === 'square' && styles.shapeSegmentActive]}
                      onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                    >
                      <Text style={[styles.shapeSegmentText, formData.thumbnail_shape === 'square' && styles.shapeSegmentTextActive]}>
                        {t('menu_editor:shape_square')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.shapeSegment, formData.thumbnail_shape === 'banner' && styles.shapeSegmentActive]}
                      onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                    >
                      <Text style={[styles.shapeSegmentText, formData.thumbnail_shape === 'banner' && styles.shapeSegmentTextActive]}>
                        {t('menu_editor:shape_banner')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {!isWineName(formData.category) && (
                  <View style={styles.priceCol}>
                    <Text style={styles.formLabel}>{t('menu_editor:price_label')}</Text>
                    <View style={styles.inputWithAdornment}>
                      <Text style={styles.inputAdornment}>$</Text>
                      <TextInput
                        style={styles.inputAdornmentField}
                        placeholder={t('menu_editor:price_placeholder')}
                        placeholderTextColor="#999999"
                        value={formData.price}
                        onChangeText={(text) => setFormData({ ...formData, price: text })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:description_label')}</Text>
                <RichTextToolbar
                  text={formData.description}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                  selection={descriptionSelection}
                  onSelectionChange={setDescriptionSelection}
                  textInputRef={descriptionInputRef}
                  accentColor={colors.highlight}
                />
                <TextInput
                  ref={descriptionInputRef}
                  style={[styles.input, styles.textArea]}
                  placeholder={t('menu_editor:description_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                  onSelectionChange={(e) => setDescriptionSelection(e.nativeEvent.selection)}
                />
              </View>

              {/* Spanish Translation Section */}
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.spanishSectionHeader}
                  onPress={() => setShowSpanish(!showSpanish)}
                >
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
                    <TouchableOpacity
                      style={styles.autoTranslateButton}
                      onPress={handleAutoTranslate}
                      disabled={translating}
                    >
                      {translating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.autoTranslateButtonText}>
                          {t('translation_section:auto_translate')}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.spanishFieldLabel}>{t('translation_section:name_es_label')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('translation_section:name_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.name_es}
                      onChangeText={(text) => setFormData({ ...formData, name_es: text })}
                    />

                    <Text style={[styles.spanishFieldLabel, { marginTop: 12 }]}>{t('translation_section:description_es_label')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder={t('translation_section:description_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.description_es}
                      onChangeText={(text) => setFormData({ ...formData, description_es: text })}
                      multiline
                      numberOfLines={4}
                    />

                    <Text style={styles.formHint}>{t('translation_section:hint')}</Text>
                  </View>
                )}
              </View>

              {/* Wine-specific fields: location + 3 prices.
                  Source-of-truth for auto-generated quiz/game questions. */}
              {isWineName(formData.category) && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Location</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Napa Valley, California"
                      placeholderTextColor="#999999"
                      value={formData.location}
                      onChangeText={(text) => setFormData({ ...formData, location: text })}
                    />
                    {showSpanish && (
                      <TextInput
                        style={[styles.input, { marginTop: 8 }]}
                        placeholder="Ubicación (Spanish)"
                        placeholderTextColor="#999999"
                        value={formData.location_es}
                        onChangeText={(text) => setFormData({ ...formData, location_es: text })}
                      />
                    )}
                  </View>
                  <View style={styles.priceOrderRow}>
                    <View style={styles.priceOrderCol}>
                      <Text style={styles.formLabel}>Glass Price</Text>
                      <View style={styles.inputWithAdornment}>
                        <Text style={styles.inputAdornment}>$</Text>
                        <TextInput
                          style={styles.inputAdornmentField}
                          placeholder="12"
                          placeholderTextColor="#999999"
                          value={formData.glass_price}
                          onChangeText={(text) => setFormData({ ...formData, glass_price: text })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <View style={styles.priceOrderCol}>
                      <Text style={styles.formLabel}>Bottle Price</Text>
                      <View style={styles.inputWithAdornment}>
                        <Text style={styles.inputAdornment}>$</Text>
                        <TextInput
                          style={styles.inputAdornmentField}
                          placeholder="45"
                          placeholderTextColor="#999999"
                          value={formData.bottle_price}
                          onChangeText={(text) => setFormData({ ...formData, bottle_price: text })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Member Bottle Price</Text>
                    <View style={styles.inputWithAdornment}>
                      <Text style={styles.inputAdornment}>$</Text>
                      <TextInput
                        style={styles.inputAdornmentField}
                        placeholder="40"
                        placeholderTextColor="#999999"
                        value={formData.member_bottle_price}
                        onChangeText={(text) => setFormData({ ...formData, member_bottle_price: text })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Flavor / Key Sensory</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="e.g. Crisp green apple, citrus, mineral finish"
                      placeholderTextColor="#999999"
                      value={formData.flavor_profile}
                      onChangeText={(text) => setFormData({ ...formData, flavor_profile: text })}
                      multiline
                      numberOfLines={3}
                    />
                    {showSpanish && (
                      <TextInput
                        style={[styles.input, styles.textArea, { marginTop: 8 }]}
                        placeholder="Sabor / Sensorial Clave (Spanish)"
                        placeholderTextColor="#999999"
                        value={formData.flavor_profile_es}
                        onChangeText={(text) => setFormData({ ...formData, flavor_profile_es: text })}
                        multiline
                        numberOfLines={3}
                      />
                    )}
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Unique Selling Points</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="e.g. Family-owned estate, biodynamic, limited 200 cases"
                      placeholderTextColor="#999999"
                      value={formData.unique_selling_points}
                      onChangeText={(text) => setFormData({ ...formData, unique_selling_points: text })}
                      multiline
                      numberOfLines={3}
                    />
                    {showSpanish && (
                      <TextInput
                        style={[styles.input, styles.textArea, { marginTop: 8 }]}
                        placeholder="Puntos de Venta Únicos (Spanish)"
                        placeholderTextColor="#999999"
                        value={formData.unique_selling_points_es}
                        onChangeText={(text) => setFormData({ ...formData, unique_selling_points_es: text })}
                        multiline
                        numberOfLines={3}
                      />
                    )}
                  </View>
                </>
              )}

              {/* close SECTION: Item basics */}
              </View>

              {/* ── SECTION: Menu placement & options ──────────────── */}
              <View style={styles.formSection}>

              {/* Menu Choice — pick the menu FIRST so the category pills below
                  reflect that menu's tree (per-menu) or the shared tree. Hidden
                  for single-menu orgs — there's only one menu, so items just
                  default to showing on it (item_season stays 'both'). */}
              {organization?.menu_count === 2 && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:season_label')}</Text>
                <View style={styles.seasonTagRow}>
                  {(((): readonly ('winter' | 'both' | 'summer')[] => {
                    // Per-menu scope: an item belongs to ONE menu, so the "Both"
                    // option is dropped for new/edited items. Legacy items already
                    // tagged 'both' keep the option so they're never stranded.
                    if (organization?.menu_category_scope !== 'per_menu') return ['winter', 'both', 'summer'] as const;
                    return formData.item_season === 'both'
                      ? (['winter', 'both', 'summer'] as const)
                      : (['winter', 'summer'] as const);
                  })()).map((s) => {
                    // Reflect the org's custom Menu 1 / Menu 2 names; "Both"
                    // stays translated since it spans both menus.
                    const seasonLabel =
                      s === 'winter'
                        ? organization?.menu_1_name || t('menu_editor:season_winter')
                        : s === 'summer'
                        ? organization?.menu_2_name || t('menu_editor:season_summer')
                        : t('menu_editor:season_both');
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.seasonTagOption,
                          formData.item_season === s && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => {
                          // Switching to a DIFFERENT menu (per-menu) clears the
                          // category/subcategory — each menu has its own tree.
                          const newSlot = s === 'summer' ? 2 : 1;
                          const oldSlot = formData.item_season === 'summer' ? 2 : 1;
                          if (perMenu && newSlot !== oldSlot) {
                            setFormData({ ...formData, item_season: s, category: '', subcategory: '' });
                          } else {
                            setFormData({ ...formData, item_season: s });
                          }
                        }}
                      >
                        <Text style={[
                          styles.seasonTagText,
                          { color: formData.item_season === s ? colors.fireText : colors.text },
                        ]}>
                          {seasonLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {organization?.menu_category_scope === 'per_menu' && formData.item_season === 'both' && (
                  <Text style={styles.seasonLegacyHint}>{t('menu_editor:season_both_legacy_hint')}</Text>
                )}
              </View>
              )}

              {/* Category — pills come from the SELECTED menu's tree (formMenuCats). */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:category_label')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {formMenuCats.map((cat) => (
                    <CategoryPill
                      key={cat.id}
                      size="sm"
                      label={categoryLabel(cat, t, language)}
                      selected={formData.category === cat.display_name}
                      onPress={() => setFormData({ ...formData, category: cat.display_name, subcategory: '' })}
                    />
                  ))}
                </ScrollView>
              </View>

              {/* Subcategory — also from the selected menu's tree. */}
              {(() => {
                const formCat = findCategoryByName(formMenuCats, formData.category);
                if (!formCat || formCat.subcategories.length === 0) return null;
                return (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{t('menu_editor:subcategory_label')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.optionsScroll}
                  >
                    {formCat.subcategories.map((sub) => (
                      <CategoryPill
                        key={sub.id}
                        size="sm"
                        label={subcategoryLabel(sub, t, language)}
                        selected={formData.subcategory === sub.display_name}
                        onPress={() => setFormData({ ...formData, subcategory: sub.display_name })}
                      />
                    ))}
                  </ScrollView>
                </View>
                );
              })()}

              {/* Availability — shared-mode meal overlay (Lunch/Dinner). Hidden in
                  per-menu and when neither category is present/visible. */}
              {!perMenu && (formHasLunchCat || formHasDinnerCat) && (() => {
                const fb = findCategoryByName(formMenuCats, formData.category)?.filter_behavior;
                return fb === 'lunch' || fb === 'dinner' || fb === 'weekly_specials';
              })() && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{t('menu_editor:available_for_label')}</Text>
                  <Text style={styles.seasonLegacyHint}>{t('menu_editor:available_for_hint')}</Text>
                  <View style={styles.checkboxGroup}>
                    {formHasLunchCat && (
                    <TouchableOpacity
                      style={styles.checkbox}
                      onPress={() =>
                        setFormData({
                          ...formData,
                          available_for_lunch: !formData.available_for_lunch,
                        })
                      }
                    >
                      <View
                        style={[
                          styles.checkboxBox,
                          formData.available_for_lunch && styles.checkboxBoxChecked,
                        ]}
                      >
                        {formData.available_for_lunch && (
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={16}
                            color={colors.fireText}
                          />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{formLunchName}</Text>
                    </TouchableOpacity>
                    )}
                    {formHasDinnerCat && (
                    <TouchableOpacity
                      style={styles.checkbox}
                      onPress={() =>
                        setFormData({
                          ...formData,
                          available_for_dinner: !formData.available_for_dinner,
                        })
                      }
                    >
                      <View
                        style={[
                          styles.checkboxBox,
                          formData.available_for_dinner && styles.checkboxBoxChecked,
                        ]}
                      >
                        {formData.available_for_dinner && (
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={16}
                            color={colors.fireText}
                          />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{formDinnerName}</Text>
                    </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Dietary Options */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:dietary_label')}</Text>
                <View style={styles.checkboxGroup}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() =>
                      setFormData({
                        ...formData,
                        is_gluten_free: !formData.is_gluten_free,
                      })
                    }
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        formData.is_gluten_free && styles.checkboxBoxChecked,
                      ]}
                    >
                      {formData.is_gluten_free && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color={colors.fireText}
                        />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>GF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() =>
                      setFormData({
                        ...formData,
                        is_gluten_free_available: !formData.is_gluten_free_available,
                      })
                    }
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        formData.is_gluten_free_available && styles.checkboxBoxChecked,
                      ]}
                    >
                      {formData.is_gluten_free_available && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color={colors.fireText}
                        />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>GFA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() =>
                      setFormData({
                        ...formData,
                        is_vegetarian: !formData.is_vegetarian,
                      })
                    }
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        formData.is_vegetarian && styles.checkboxBoxChecked,
                      ]}
                    >
                      {formData.is_vegetarian && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color={colors.fireText}
                        />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>V</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() =>
                      setFormData({
                        ...formData,
                        is_vegetarian_available: !formData.is_vegetarian_available,
                      })
                    }
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        formData.is_vegetarian_available && styles.checkboxBoxChecked,
                      ]}
                    >
                      {formData.is_vegetarian_available && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color={colors.fireText}
                        />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>VA</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Feature on Weekly Specials — overlay, kept LAST before save:
                  also shows the item on the Weekly Specials page/tab while it
                  stays in its home category. Hidden when it already lives there. */}
              {formHasWeeklySpecialsCat && findCategoryByName(formMenuCats, formData.category)?.system_key !== 'cat.weekly_specials' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{t('menu_editor:weekly_special_label', { name: formWeeklySpecialsLabel })}</Text>
                  <Text style={styles.seasonLegacyHint}>{t('menu_editor:weekly_special_hint', { name: formWeeklySpecialsLabel })}</Text>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => setFormData({ ...formData, is_weekly_special: !formData.is_weekly_special })}
                  >
                    <View style={[styles.checkboxBox, formData.is_weekly_special && styles.checkboxBoxChecked]}>
                      {formData.is_weekly_special && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>{t('menu_editor:weekly_special_checkbox', { name: formWeeklySpecialsLabel })}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* close SECTION: Menu placement & options */}
              </View>

              {/* ── SECTION: actions ───────────────────────────────── */}
              <View style={styles.formSectionActions}>
              {/* Cancel + Save — side by side */}
              <View style={styles.formFooter}>
                <TouchableOpacity
                  style={[styles.cancelButton, styles.footerButton]}
                  onPress={closeModal}
                >
                  <Text style={styles.cancelButtonText}>{t('menu_editor:cancel_button')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, styles.footerButton]}
                  onPress={handleSave}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color={colors.fireText} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingItem ? t('menu_editor:save_button') : t('menu_editor:add_save_button')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              {/* close SECTION: actions */}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Order Position picker — jump an item to an exact slot within its
          category/subcategory without dragging. */}
      <Modal
        visible={!!positionPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setPositionPicker(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPositionPicker(null)} />
          <View style={styles.positionSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('menu_editor:order_position')}</Text>
              <TouchableOpacity onPress={() => setPositionPicker(null)}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color="#666666" />
              </TouchableOpacity>
            </View>
            {positionPicker && (
              <>
                <Text style={styles.positionSubtitle}>
                  {t('menu_editor:order_position_subtitle', { name: positionPicker.item.name })}
                </Text>
                <ScrollView style={styles.positionScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {Array.from({ length: positionPicker.siblings.length }, (_, i) => i + 1).map((pos) => {
                    const isCurrent = pos - 1 === positionPicker.currentIndex;
                    return (
                      <TouchableOpacity
                        key={pos}
                        style={[styles.positionRow, isCurrent && styles.positionRowActive]}
                        onPress={() => applyPositionChange(pos)}
                      >
                        <Text style={[styles.positionRowText, isCurrent && styles.positionRowTextActive]}>{pos}</Text>
                        {isCurrent && (
                          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    backgroundColor: colors.card,
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
    color: colors.text,
  },
  manageCatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.primary + '18',
  },
  manageCatsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.primary + '18',
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  seasonSelectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  libationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  libationBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  seasonTagRow: {
    flexDirection: 'row',
    gap: 8,
  },
  seasonTagOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seasonTagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  seasonLegacyHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  addIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
  searchInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInfoText: {
    fontSize: 14,
    color: colors.highlight,
    fontWeight: '600',
  },
  categoryScroll: {
    marginTop: 16,
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subcategoryScroll: {
    marginTop: 12,
    maxHeight: 40,
  },
  subcategoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsList: {
    flex: 1,
    marginTop: 16,
  },
  itemsListContent: {
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
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  uploadMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
  },
  uploadMenuButtonText: {
    color: colors.fireText,
    fontSize: 15,
    fontWeight: '700',
  },
  menuItemCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  menuItemCardDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
  },
  // Square layout styles (image on left, content on right)
  squareLayout: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  squareImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  squareContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  squareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    paddingRight: 40, // leave space for overflow ⋮ button
  },
  squareDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  menuItemImageBanner: {
    width: '100%',
    height: 120,
    resizeMode: 'cover',
  },
  menuItemContent: {
    padding: 12,
  },
  menuItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    paddingRight: 40, // leave space for overflow ⋮ button
  },
  menuItemName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.highlight,
  },
  displayOrderCorner: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  displayOrderTextCompact: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    opacity: 0.7,
  },
  menuBadge: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    maxWidth: 130,
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  menuItemHeaderClear: {
    paddingLeft: 40, // clear the drag handle on no-thumbnail cards
  },
  menuItemTagsPriceRoom: {
    paddingRight: 64, // leave room for the bottom-right price on no-thumbnail cards
  },
  menuItemPriceCorner: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontSize: 16,
    fontWeight: '700',
    color: colors.highlight,
  },
  positionSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  positionSubtitle: {
    fontSize: 14,
    color: '#666666',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  positionScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 8,
  },
  positionRowActive: {
    backgroundColor: colors.primary + '22',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  positionRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  positionRowTextActive: {
    color: colors.primary,
  },
  menuItemDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  menuItemTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tag: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagAvailability: {
    backgroundColor: colors.primary,
  },
  tagDietary: {
    backgroundColor: colors.highlight,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  displayOrderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  displayOrderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dragHandle: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
  },
  overflowButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
  },
  reorderHint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 12,
  },
  // Modal styles
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
    backgroundColor: '#EEEFF1',
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // White cards that group the form into scannable sections on the gray scroll.
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
  priceShapeRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  priceCol: {
    width: 120,
  },
  shapeCol: {
    flex: 1,
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
    marginTop: 6,
    fontStyle: 'italic',
  },
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
  // Compact 80x80 thumbnail + name row
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  thumbColumn: {
    width: 80,
    alignItems: 'center',
  },
  nameColumn: {
    flex: 1,
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
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Square / Banner segmented control — full-width row below thumb+name
  shapeSegmented: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  shapeSegment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shapeSegmentActive: {
    backgroundColor: colors.primary,
  },
  shapeSegmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  shapeSegmentTextActive: {
    color: colors.fireText,
  },
  // Price + Display Order row
  priceOrderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceOrderCol: {
    flex: 1,
  },
  inputWithAdornment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
  },
  inputAdornment: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginRight: 6,
  },
  inputAdornmentField: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  formFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  footerButton: {
    flex: 1,
    marginTop: 0,
  },
  optionsScroll: {
    maxHeight: 50,
  },
  checkboxGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.fireText,
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
