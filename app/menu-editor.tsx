
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
import { useRouter } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';

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
  const router = useRouter();
  const { user } = useAuth();
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
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

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
    });
    setSelectedImageUri(null);
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
    });
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
            color={managerColors.text}
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
          color={managerColors.text}
        />
        <Text style={styles.addNewItemButtonText}>{t('menu_editor:add_button')}</Text>
      </TouchableOpacity>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={managerColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t('menu_editor:search_placeholder')}
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

      {searchQuery.length > 0 && (
        <View style={styles.searchInfoBanner}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={16}
            color={managerColors.highlight}
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
            <TouchableOpacity
              key={index}
              style={[
                styles.categoryTab,
                selectedCategory === category && styles.categoryTabActive,
              ]}
              onPress={() => {
                setSelectedCategory(category);
                setSelectedSubcategory(null);
              }}
            >
              <Text
                style={[
                  styles.categoryTabText,
                  selectedCategory === category && styles.categoryTabTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
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
              {t('menu_editor:subcategory_all')}
            </Text>
          </TouchableOpacity>
          {SUBCATEGORIES[selectedCategory].map((subcategory, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.subcategoryTab,
                selectedSubcategory === subcategory && styles.subcategoryTabActive,
              ]}
              onPress={() => setSelectedSubcategory(subcategory)}
            >
              <Text
                style={[
                  styles.subcategoryTabText,
                  selectedSubcategory === subcategory && styles.subcategoryTabTextActive,
                ]}
              >
                {subcategory}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Menu Items List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      ) : (
        <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
          {filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant-menu"
                size={64}
                color={managerColors.textSecondary}
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
          ) : (
            filteredItems.map((item, index) => (
              <View key={index} style={styles.menuItemCard}>
                {/* Display thumbnail based on shape - Square layout or Banner layout */}
                {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      key={getImageUrl(item.thumbnail_url)}
                      source={{ uri: getImageUrl(item.thumbnail_url) }}
                      style={styles.squareImage}
                      onError={(error) => {
                        console.error('Image load error for item:', item.name, error.nativeEvent);
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully for item:', item.name);
                      }}
                    />
                    <View style={styles.squareContent}>
                      <View style={styles.squareHeader}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <View style={styles.priceOrderContainer}>
                          <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                          <View style={styles.displayOrderBadgeCompact}>
                            <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                          </View>
                        </View>
                      </View>
                      {item.description && (
                        <Text style={styles.squareDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && (
                          <View style={styles.tag}>
                            <Text style={styles.tagText}>{item.subcategory}</Text>
                          </View>
                        )}
                        {item.available_for_lunch && (
                          <View style={[styles.tag, styles.tagAvailability]}>
                            <Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text>
                          </View>
                        )}
                        {item.available_for_dinner && (
                          <View style={[styles.tag, styles.tagAvailability]}>
                            <Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text>
                          </View>
                        )}
                        {item.is_gluten_free && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>GF</Text>
                          </View>
                        )}
                        {item.is_gluten_free_available && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>GFA</Text>
                          </View>
                        )}
                        {item.is_vegetarian && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>V</Text>
                          </View>
                        )}
                        {item.is_vegetarian_available && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>VA</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    {item.thumbnail_url && (
                      <Image
                        key={getImageUrl(item.thumbnail_url)}
                        source={{ uri: getImageUrl(item.thumbnail_url) }}
                        style={styles.menuItemImageBanner}
                        onError={(error) => {
                          console.error('Image load error for item:', item.name, error.nativeEvent);
                        }}
                        onLoad={() => {
                          console.log('Image loaded successfully for item:', item.name);
                        }}
                      />
                    )}
                    <View style={styles.menuItemContent}>
                      <View style={styles.menuItemHeader}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <View style={styles.priceOrderContainer}>
                          <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                          <View style={styles.displayOrderBadgeCompact}>
                            <Text style={styles.displayOrderTextCompact}>#{item.display_order}</Text>
                          </View>
                        </View>
                      </View>
                      {item.description && (
                        <Text style={styles.menuItemDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                      <View style={styles.menuItemTags}>
                        {item.subcategory && (
                          <View style={styles.tag}>
                            <Text style={styles.tagText}>{item.subcategory}</Text>
                          </View>
                        )}
                        {item.available_for_lunch && (
                          <View style={[styles.tag, styles.tagAvailability]}>
                            <Text style={styles.tagText}>{t('menu_editor:available_lunch')}</Text>
                          </View>
                        )}
                        {item.available_for_dinner && (
                          <View style={[styles.tag, styles.tagAvailability]}>
                            <Text style={styles.tagText}>{t('menu_editor:available_dinner')}</Text>
                          </View>
                        )}
                        {item.is_gluten_free && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>GF</Text>
                          </View>
                        )}
                        {item.is_gluten_free_available && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>GFA</Text>
                          </View>
                        )}
                        {item.is_vegetarian && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>V</Text>
                          </View>
                        )}
                        {item.is_vegetarian_available && (
                          <View style={[styles.tag, styles.tagDietary]}>
                            <Text style={styles.tagText}>VA</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </>
                )}
                <View style={styles.menuItemActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(item)}
                  >
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={managerColors.highlight}
                    />
                    <Text style={styles.actionButtonText}>{t('common:edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(item)}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={20}
                      color="#E74C3C"
                    />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                      {t('common:delete')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
              {/* Image Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:thumbnail_label')}</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {selectedImageUri || editingItem?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedImageUri || getImageUrl(editingItem?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                      key={selectedImageUri || getImageUrl(editingItem?.thumbnail_url || '')}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>{t('menu_editor:tap_upload')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Thumbnail Shape */}
                <View style={styles.shapeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.shapeOption,
                      formData.thumbnail_shape === 'square' && styles.shapeOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                  >
                    <Text
                      style={[
                        styles.shapeOptionText,
                        formData.thumbnail_shape === 'square' && styles.shapeOptionTextActive,
                      ]}
                    >
                      {t('menu_editor:shape_square')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.shapeOption,
                      formData.thumbnail_shape === 'banner' && styles.shapeOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                  >
                    <Text
                      style={[
                        styles.shapeOptionText,
                        formData.thumbnail_shape === 'banner' && styles.shapeOptionTextActive,
                      ]}
                    >
                      {t('menu_editor:shape_banner')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:name_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('menu_editor:name_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:description_label')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('menu_editor:description_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Price */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:price_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('menu_editor:price_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('menu_editor:display_order_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('menu_editor:display_order_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>
                  {t('menu_editor:display_order_hint')}
                </Text>
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
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.category === category && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, category, subcategory: '' })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.category === category && styles.optionButtonTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
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
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.optionButton,
                          formData.subcategory === subcategory && styles.optionButtonActive,
                        ]}
                        onPress={() => setFormData({ ...formData, subcategory })}
                      >
                        <Text
                          style={[
                            styles.optionButtonText,
                            formData.subcategory === subcategory && styles.optionButtonTextActive,
                          ]}
                        >
                          {subcategory}
                        </Text>
                      </TouchableOpacity>
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

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
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

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>{t('menu_editor:cancel_button')}</Text>
              </TouchableOpacity>
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
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
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
  addNewItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
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
    color: managerColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
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
    color: managerColors.text,
  },
  searchInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInfoText: {
    fontSize: 14,
    color: managerColors.highlight,
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
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: managerColors.highlight,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  categoryTabTextActive: {
    color: managerColors.text,
  },
  subcategoryScroll: {
    marginTop: 12,
    maxHeight: 40,
  },
  subcategoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subcategoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: managerColors.card,
    marginRight: 8,
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
    color: managerColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  menuItemCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  squareDescription: {
    fontSize: 13,
    color: managerColors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  menuItemImageBanner: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  menuItemContent: {
    padding: 16,
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  menuItemName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginRight: 12,
  },
  priceOrderContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  displayOrderBadgeCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  displayOrderTextCompact: {
    fontSize: 11,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  menuItemDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
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
    backgroundColor: managerColors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagAvailability: {
    backgroundColor: managerColors.primary,
  },
  tagDietary: {
    backgroundColor: managerColors.highlight,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.text,
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
    color: managerColors.textSecondary,
  },
  menuItemActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.background,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  deleteButton: {
    backgroundColor: '#2C1F1F',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  deleteButtonText: {
    color: '#E74C3C',
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
  imageUploadButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imageUploadPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageUploadText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
  },
  uploadedImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  shapeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  shapeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  shapeOptionActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  shapeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  shapeOptionTextActive: {
    color: '#1A1A1A',
  },
  optionsScroll: {
    maxHeight: 50,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionButtonActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  optionButtonTextActive: {
    color: '#1A1A1A',
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
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: managerColors.highlight,
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
