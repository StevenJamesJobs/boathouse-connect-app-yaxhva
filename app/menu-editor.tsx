
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
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ActionSheetIOS,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { translateTexts, saveTranslations, getLocalizedField } from '@/utils/translateContent';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import RichTextToolbar from '@/components/RichTextToolbar';
import FormattedText from '@/components/FormattedText';
import CategoryPill from '@/components/CategoryPill';

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
  name_es?: string | null;
  description_es?: string | null;
}

const CATEGORIES = ['Weekly Specials', 'Lunch', 'Dinner', 'Libations', 'Wine', 'Happy Hour'];

const SUBCATEGORIES: { [key: string]: string[] } = {
  'Weekly Specials': [],
  Lunch: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Burgers', 'Sandwiches', 'Sides'],
  Dinner: ['Starters', 'Raw Bar', 'Soups', 'Tacos', 'Salads', 'Entrees', 'Pasta', 'Sides'],
  Libations: ['Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV', 'Draft Beer', 'Bottle & Cans'],
  Wine: ['Sparkling', 'Rose', 'Chardonnay', 'Pinot Grigio', 'Sauvignon Blanc', 'Interesting Whites', 'Cabernet Sauvignon', 'Pinot Noir', 'Merlot', 'Italian Reds', 'Interesting Reds'],
  'Happy Hour': ['Appetizers', 'Drinks', 'Spirits'],
};

export default function MenuEditorScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Weekly Specials');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
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
    name_es: '',
    description_es: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  const descriptionInputRef = useRef<TextInput>(null);
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  useEffect(() => {
    loadMenuItems();
  }, []);

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      console.log('Loaded menu items:', data);
      setMenuItems(data || []);
    } catch (error) {
      console.error('Error loading menu items:', error);
      Alert.alert(t('common:error'), t('menu_editor:load_error'));
    } finally {
      setLoading(false);
    }
  };

  const filterItems = useCallback(() => {
    let filtered = menuItems;

    // FIXED: If there's a search query, search through ALL menu items first
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          item.category.toLowerCase().includes(query) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(query)) ||
          (item.is_gluten_free && 'gf'.includes(query)) ||
          (item.is_gluten_free_available && 'gfa'.includes(query)) ||
          (item.is_vegetarian && ('v'.includes(query) || 'vegetarian'.includes(query))) ||
          (item.is_vegetarian_available && ('va'.includes(query) || 'vegetarian available'.includes(query)))
      );
    } else {
      // Only filter by category/subcategory if there's NO search query
      // Filter by category
      if (selectedCategory === 'Weekly Specials') {
        filtered = filtered.filter(item => item.category === 'Weekly Specials');
      } else if (selectedCategory === 'Lunch') {
        filtered = filtered.filter(item => item.available_for_lunch);
      } else if (selectedCategory === 'Dinner') {
        filtered = filtered.filter(item => item.available_for_dinner);
      } else {
        // For other categories (Libations, Wine, Happy Hour), use the category field
        filtered = filtered.filter(item => item.category === selectedCategory);
      }

      // Filter by subcategory if selected
      if (selectedSubcategory) {
        filtered = filtered.filter(item => item.subcategory === selectedSubcategory);
      }
    }

    setFilteredItems(filtered);
  }, [menuItems, searchQuery, selectedCategory, selectedSubcategory]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

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
    try {
      setUploadingImage(true);
      console.log('Starting image upload for menu item');

      // Read the file as base64 (same method as profile pictures)
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

      // Get file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('menu-items')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading image:', error);
        throw error;
      }

      console.log('Upload successful:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('menu-items')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common:error'), t('menu_editor:upload_image_error'));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!formData.name && !formData.description) {
      Alert.alert(t('common:error'), t('translation_section:no_content_to_translate'));
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([formData.name, formData.description]);
      setFormData(prev => ({
        ...prev,
        name_es: results[0] || '',
        description_es: results[1] || '',
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
    if (!formData.name || !formData.price) {
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
        });

        if (error) {
          console.error('Error updating menu item:', error);
          throw error;
        }
        console.log('Menu item updated successfully');
        Alert.alert(t('common:success'), t('menu_editor:updated_success'));

        // Save Spanish translations
        if (formData.name_es || formData.description_es) {
          await saveTranslations('menu_items', editingItem.id, {
            name_es: formData.name_es,
            description_es: formData.description_es,
          });
        }
      } else {
        // Create new item using database function
        const { data, error } = await supabase.rpc('create_menu_item', {
          p_user_id: user.id,
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
        });

        if (error) {
          console.error('Error creating menu item:', error);
          throw error;
        }
        console.log('Menu item created successfully');
        Alert.alert(t('common:success'), t('menu_editor:created_success'));

        // Save Spanish translations for newly created item
        if (formData.name_es || formData.description_es) {
          const { data: newItem } = await supabase
            .from('menu_items')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (newItem) {
            await saveTranslations('menu_items', newItem.id, {
              name_es: formData.name_es,
              description_es: formData.description_es,
            });
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
                p_menu_item_id: item.id,
              });

              if (error) {
                console.error('Error deleting menu item:', error);
                throw error;
              }

              // Delete image if exists
              if (item.thumbnail_url) {
                const fileName = item.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('menu-items')
                    .remove([fileName]);
                }
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
      await Promise.all([
        supabase.from('menu_items').update({ display_order: aboveOrder }).eq('id', currentItem.id),
        supabase.from('menu_items').update({ display_order: currentOrder }).eq('id', aboveItem.id),
      ]);
    } catch (error) {
      console.error('Error moving menu item up:', error);
      loadMenuItems();
    }
  };

  const handleMoveDown = async (index: number) => {
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
      await Promise.all([
        supabase.from('menu_items').update({ display_order: belowOrder }).eq('id', currentItem.id),
        supabase.from('menu_items').update({ display_order: currentOrder }).eq('id', belowItem.id),
      ]);
    } catch (error) {
      console.error('Error moving menu item down:', error);
      loadMenuItems();
    }
  };

  // Overflow (⋮) action sheet for a menu item row. Combines Edit / Move Up /
  // Move Down / Delete into one compact menu so individual cards can ditch
  // their four-button footer. Drag-to-reorder remains the primary reorder
  // path; Up/Down here are a secondary nicety.
  const openItemActions = (item: MenuItem, index: number) => {
    const isFirst = index === 0;
    const isLast = index === filteredItems.length - 1;

    const editLabel = t('common:edit');
    const moveUpLabel = t('upcoming_events_editor:move_up');
    const moveDownLabel = t('upcoming_events_editor:move_down');
    const deleteLabel = t('common:delete');
    const cancelLabel = t('common:cancel');

    if (Platform.OS === 'ios') {
      const options: string[] = [editLabel];
      const actions: Array<() => void> = [() => openEditModal(item)];
      if (!isFirst) {
        options.push(moveUpLabel);
        actions.push(() => handleMoveUp(index));
      }
      if (!isLast) {
        options.push(moveDownLabel);
        actions.push(() => handleMoveDown(index));
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
      if (!isFirst) buttons.push({ text: moveUpLabel, onPress: () => handleMoveUp(index) });
      if (!isLast) buttons.push({ text: moveDownLabel, onPress: () => handleMoveDown(index) });
      buttons.push({ text: deleteLabel, style: 'destructive', onPress: () => handleDelete(item) });
      buttons.push({ text: cancelLabel, style: 'cancel' });
      Alert.alert(item.name, undefined, buttons);
    }
  };

  const handleDragEnd = async ({ data: reorderedData }: { data: MenuItem[] }) => {
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
      const updates = reorderedData.map((item, index) =>
        supabase.from('menu_items').update({ display_order: index }).eq('id', item.id)
      );
      await Promise.all(updates);
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
      available_for_lunch: selectedCategory === 'Lunch',
      available_for_dinner: selectedCategory === 'Dinner',
      is_gluten_free: false,
      is_gluten_free_available: false,
      is_vegetarian: false,
      is_vegetarian_available: false,
      thumbnail_shape: 'square',
      display_order: 0,
      name_es: '',
      description_es: '',
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
      name_es: item.name_es || '',
      description_es: item.description_es || '',
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
    // Add timestamp to force reload and bypass cache
    return `${url}?t=${Date.now()}`;
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
        <View style={styles.backButton} />
      </View>

      {/* Add New Item Button - Elongated button above search bar */}
      <TouchableOpacity style={styles.addNewItemButton} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={colors.text}
        />
        <Text style={styles.addNewItemButtonText}>{t('menu_editor:add_button')}</Text>
      </TouchableOpacity>

      {/* Search Bar */}
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
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((category, index) => (
            <CategoryPill
              key={index}
              size="lg"
              label={category}
              selected={selectedCategory === category}
              onPress={() => {
                setSelectedCategory(category);
                setSelectedSubcategory(null);
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* Subcategory Tabs - Only show when NOT searching */}
      {!searchQuery && SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subcategoryScroll}
          contentContainerStyle={styles.subcategoryScrollContent}
        >
          <CategoryPill
            size="sm"
            label={t('menu_editor:subcategory_all')}
            selected={selectedSubcategory === null}
            onPress={() => setSelectedSubcategory(null)}
          />
          {SUBCATEGORIES[selectedCategory].map((subcategory, index) => (
            <CategoryPill
              key={index}
              size="sm"
              label={subcategory}
              selected={selectedSubcategory === subcategory}
              onPress={() => setSelectedSubcategory(subcategory)}
            />
          ))}
        </ScrollView>
      )}

      {/* Menu Items List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
        {filteredItems.length === 0 ? (
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
              {searchQuery
                ? t('menu_editor:empty_search_subtext')
                : t('menu_editor:empty_subtext')
              }
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
                    <Image key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.squareImage} />
                    <View style={styles.squareContent}>
                      <View style={styles.squareHeader}>
                        <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                        <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                      </View>
                      {item.description && (
                        <FormattedText style={styles.squareDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>
                      )}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                        {item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text></View>}
                        {item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text></View>}
                        {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                        {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                        {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                        {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                      </View>
                    </View>
                    <View style={styles.displayOrderCorner}>
                      <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    {item.thumbnail_url && <Image key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.menuItemImageBanner} />}
                    <View style={styles.menuItemContent}>
                      <View style={styles.menuItemHeader}>
                        <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                        <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                      </View>
                      {item.description && <FormattedText style={styles.menuItemDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                        {item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text></View>}
                        {item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text></View>}
                        {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                        {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                        {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                        {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                      </View>
                      <View style={styles.displayOrderCorner}>
                        <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.itemsList}>
            {filteredItems.length > 1 && (
              <Text style={styles.reorderHint}>{t('upcoming_events_editor:reorder_hint')}</Text>
            )}
            <DraggableFlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              onDragEnd={handleDragEnd}
              activationDistance={10}
              contentContainerStyle={styles.itemsListContent}
              renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<MenuItem>) => {
                const index = getIndex() ?? 0;

                return (
                  <ScaleDecorator>
                    <View style={[styles.menuItemCard, isActive && styles.menuItemCardDragging]}>
                      {/* Drag Handle */}
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
                          <Image key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.squareImage} />
                          <View style={styles.squareContent}>
                            <View style={styles.squareHeader}>
                              <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                              <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                            </View>
                            {item.description && (
                              <FormattedText style={styles.squareDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>
                            )}
                            <View style={styles.menuItemTags}>
                              {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                              {item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text></View>}
                              {item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text></View>}
                              {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                              {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                              {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                              {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                            </View>
                          </View>
                          <View style={styles.displayOrderCorner}>
                            <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                          </View>
                        </View>
                      ) : (
                        <>
                          {item.thumbnail_url && <Image key={getImageUrl(item.thumbnail_url)} source={{ uri: getImageUrl(item.thumbnail_url) }} style={styles.menuItemImageBanner} />}
                          <View style={styles.menuItemContent}>
                            <View style={styles.menuItemHeader}>
                              <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                              <Text style={styles.menuItemName} numberOfLines={1}>{getLocalizedField(item, 'name', language)}</Text>
                            </View>
                            {item.description && <FormattedText style={styles.menuItemDescription} numberOfLines={2}>{getLocalizedField(item, 'description', language)}</FormattedText>}
                            <View style={styles.menuItemTags}>
                              {item.subcategory && <View style={styles.tag}><Text style={styles.tagText}>{item.subcategory}</Text></View>}
                              {item.available_for_lunch && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text></View>}
                              {item.available_for_dinner && <View style={[styles.tag, styles.tagAvailability]}><Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text></View>}
                              {item.is_gluten_free && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GF</Text></View>}
                              {item.is_gluten_free_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>GFA</Text></View>}
                              {item.is_vegetarian && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>V</Text></View>}
                              {item.is_vegetarian_available && <View style={[styles.tag, styles.tagDietary]}><Text style={styles.tagText}>VA</Text></View>}
                            </View>
                            <View style={styles.displayOrderCorner}>
                              <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  </ScaleDecorator>
                );
              }}
            />
          </View>
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
              {/* Thumbnail (80×80, top-left) + Name (right) */}
              <View style={styles.thumbAndNameRow}>
                <View style={styles.thumbColumn}>
                  <TouchableOpacity style={styles.thumbSquare} onPress={pickImage}>
                    {selectedImageUri || editingItem?.thumbnail_url ? (
                      <Image
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

              {/* Square / Banner segmented control — full width row */}
              <View style={styles.shapeSegmented}>
                <TouchableOpacity
                  style={[
                    styles.shapeSegment,
                    formData.thumbnail_shape === 'square' && styles.shapeSegmentActive,
                  ]}
                  onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                >
                  <Text
                    style={[
                      styles.shapeSegmentText,
                      formData.thumbnail_shape === 'square' && styles.shapeSegmentTextActive,
                    ]}
                  >
                    {t('menu_editor:shape_square')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.shapeSegment,
                    formData.thumbnail_shape === 'banner' && styles.shapeSegmentActive,
                  ]}
                  onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                >
                  <Text
                    style={[
                      styles.shapeSegmentText,
                      formData.thumbnail_shape === 'banner' && styles.shapeSegmentTextActive,
                    ]}
                  >
                    {t('menu_editor:shape_banner')}
                  </Text>
                </TouchableOpacity>
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

              {/* Price + Display Order — side by side */}
              <View style={styles.priceOrderRow}>
                <View style={styles.priceOrderCol}>
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
                <View style={styles.priceOrderCol}>
                  <Text style={styles.formLabel}>{t('menu_editor:display_order_label')}</Text>
                  <View style={styles.inputWithAdornment}>
                    <Text style={styles.inputAdornment}>#</Text>
                    <TextInput
                      style={styles.inputAdornmentField}
                      placeholder={t('menu_editor:display_order_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.display_order.toString()}
                      onChangeText={(text) => {
                        const num = parseInt(text) || 0;
                        setFormData({ ...formData, display_order: num });
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:category_label')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {CATEGORIES.map((category, index) => (
                    <CategoryPill
                      key={index}
                      size="sm"
                      label={category}
                      selected={formData.category === category}
                      onPress={() => setFormData({ ...formData, category, subcategory: '' })}
                    />
                  ))}
                </ScrollView>
              </View>

              {/* Subcategory */}
              {SUBCATEGORIES[formData.category] && SUBCATEGORIES[formData.category].length > 0 && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{t('menu_editor:subcategory_label')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.optionsScroll}
                  >
                    {SUBCATEGORIES[formData.category].map((subcategory, index) => (
                      <CategoryPill
                        key={index}
                        size="sm"
                        label={subcategory}
                        selected={formData.subcategory === subcategory}
                        onPress={() => setFormData({ ...formData, subcategory })}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Availability - Only show for Lunch, Dinner, and Weekly Specials */}
              {(formData.category === 'Lunch' || formData.category === 'Dinner' || formData.category === 'Weekly Specials') && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{t('menu_editor:available_for_label')}</Text>
                  <View style={styles.checkboxGroup}>
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
                            color="#1A1A1A"
                          />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{t('menu_editor:available_lunch')}</Text>
                    </TouchableOpacity>
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
                            color="#1A1A1A"
                          />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{t('menu_editor:available_dinner')}</Text>
                    </TouchableOpacity>
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
                          color="#1A1A1A"
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
                          color="#1A1A1A"
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
                          color="#1A1A1A"
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
                          color="#1A1A1A"
                        />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>VA</Text>
                  </TouchableOpacity>
                </View>
              </View>

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
                    <ActivityIndicator color="#1A1A1A" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingItem ? t('menu_editor:save_button') : t('menu_editor:add_save_button')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  addNewItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.highlight,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
    gap: 10,
  },
  addNewItemButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
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
    marginBottom: 16,
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
    backgroundColor: colors.highlight,
  },
  shapeSegmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  shapeSegmentTextActive: {
    color: '#1A1A1A',
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
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: colors.highlight,
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
