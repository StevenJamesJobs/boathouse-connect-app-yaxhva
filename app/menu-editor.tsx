
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter } from 'expo-router';
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
import * as FileSystem from 'expo-file-system/legacy';
import { managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';

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
    paddingTop: 48,
    paddingBottom: 16,
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  addButton: {
    backgroundColor: managerColors.highlight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 10,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: managerColors.text,
    padding: 0,
  },
  categoryScroll: {
    maxHeight: 50,
    marginBottom: 12,
  },
  categoryScrollContent: {
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
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
    maxHeight: 40,
    marginBottom: 16,
  },
  subcategoryScrollContent: {
    gap: 8,
  },
  subcategoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: managerColors.card,
    marginRight: 8,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 1,
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
  menuItemCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  menuItemImage: {
    width: '100%',
    height: 200,
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
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
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
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: managerColors.highlight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: managerColors.text,
  },
  menuItemActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: managerColors.highlight,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 40,
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
    backgroundColor: managerColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  modalForm: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: managerColors.highlight,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
    color: managerColors.text,
  },
  imagePickerButton: {
    backgroundColor: managerColors.highlight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  thumbnailPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});

export default function MenuEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Weekly Specials');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Weekly Specials');
  const [subcategory, setSubcategory] = useState('');
  const [availableForLunch, setAvailableForLunch] = useState(false);
  const [availableForDinner, setAvailableForDinner] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isGlutenFreeAvailable, setIsGlutenFreeAvailable] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegetarianAvailable, setIsVegetarianAvailable] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailShape, setThumbnailShape] = useState<'square' | 'banner'>('banner');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadMenuItems();
  }, []);

  const filterItems = useCallback(() => {
    let filtered = menuItems;

    // Filter by category
    if (selectedCategory === 'Weekly Specials') {
      filtered = filtered.filter(item => item.category === 'Weekly Specials');
    } else if (selectedCategory === 'Lunch') {
      filtered = filtered.filter(item => item.available_for_lunch);
    } else if (selectedCategory === 'Dinner') {
      filtered = filtered.filter(item => item.available_for_dinner);
    } else {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    // Filter by subcategory
    if (selectedSubcategory) {
      filtered = filtered.filter(item => item.subcategory === selectedSubcategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.subcategory?.toLowerCase().includes(query)
      );
    }

    setFilteredItems(filtered);
  }, [menuItems, selectedCategory, selectedSubcategory, searchQuery]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      console.error('Error loading menu items:', error);
      Alert.alert('Error', 'Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: thumbnailShape === 'square' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      const fileName = `menu-item-${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.storage
        .from('menu-items')
        .upload(fileName, decode(base64), {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('menu-items').getPublicUrl(data.path);

      setThumbnailUrl(publicUrl);
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter an item name');
        return;
      }

      if (!price.trim()) {
        Alert.alert('Error', 'Please enter a price');
        return;
      }

      setLoading(true);

      const itemData = {
        name: name.trim(),
        description: description.trim() || null,
        price: price.trim(),
        category,
        subcategory: subcategory || null,
        available_for_lunch: availableForLunch,
        available_for_dinner: availableForDinner,
        is_gluten_free: isGlutenFree,
        is_gluten_free_available: isGlutenFreeAvailable,
        is_vegetarian: isVegetarian,
        is_vegetarian_available: isVegetarianAvailable,
        thumbnail_url: thumbnailUrl,
        thumbnail_shape: thumbnailShape,
        display_order: editingItem ? editingItem.display_order : menuItems.length,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        Alert.alert('Success', 'Menu item updated successfully');
      } else {
        const { error } = await supabase.from('menu_items').insert({
          ...itemData,
          created_by: user?.id,
        });

        if (error) throw error;
        Alert.alert('Success', 'Menu item added successfully');
      }

      setShowModal(false);
      resetForm();
      loadMenuItems();
    } catch (error: any) {
      console.error('Error saving menu item:', error);
      Alert.alert('Error', error.message || 'Failed to save menu item');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    Alert.alert('Delete Menu Item', 'Are you sure you want to delete this menu item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('menu_items')
              .update({ is_active: false })
              .eq('id', item.id);

            if (error) throw error;
            Alert.alert('Success', 'Menu item deleted successfully');
            loadMenuItems();
          } catch (error: any) {
            console.error('Error deleting menu item:', error);
            Alert.alert('Error', error.message || 'Failed to delete menu item');
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || '');
    setPrice(item.price);
    setCategory(item.category);
    setSubcategory(item.subcategory || '');
    setAvailableForLunch(item.available_for_lunch);
    setAvailableForDinner(item.available_for_dinner);
    setIsGlutenFree(item.is_gluten_free);
    setIsGlutenFreeAvailable(item.is_gluten_free_available);
    setIsVegetarian(item.is_vegetarian);
    setIsVegetarianAvailable(item.is_vegetarian_available);
    setThumbnailUrl(item.thumbnail_url);
    setThumbnailShape(item.thumbnail_shape as 'square' | 'banner');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('Weekly Specials');
    setSubcategory('');
    setAvailableForLunch(false);
    setAvailableForDinner(false);
    setIsGlutenFree(false);
    setIsGlutenFreeAvailable(false);
    setIsVegetarian(false);
    setIsVegetarianAvailable(false);
    setThumbnailUrl(null);
    setThumbnailShape('banner');
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('menu-items').getPublicUrl(url);
    return data.publicUrl;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Menu Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Add Button */}
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={managerColors.text}
          />
          <Text style={styles.addButtonText}>Add Menu Item</Text>
        </TouchableOpacity>

        {/* Search Box */}
        <View style={styles.searchContainer}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={managerColors.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
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

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((cat, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.categoryTab,
                selectedCategory === cat && styles.categoryTabActive,
              ]}
              onPress={() => {
                setSelectedCategory(cat);
                setSelectedSubcategory(null);
              }}
            >
              <Text
                style={[
                  styles.categoryTabText,
                  selectedCategory === cat && styles.categoryTabTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Subcategory Tabs */}
        {SUBCATEGORIES[selectedCategory] && SUBCATEGORIES[selectedCategory].length > 0 && (
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
                All
              </Text>
            </TouchableOpacity>
            {SUBCATEGORIES[selectedCategory].map((sub, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.subcategoryTab,
                  selectedSubcategory === sub && styles.subcategoryTabActive,
                ]}
                onPress={() => setSelectedSubcategory(sub)}
              >
                <Text
                  style={[
                    styles.subcategoryTabText,
                    selectedSubcategory === sub && styles.subcategoryTabTextActive,
                  ]}
                >
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Menu Items List */}
        {filteredItems.length === 0 ? (
          <Text style={styles.emptyText}>No menu items found</Text>
        ) : (
          filteredItems.map((item, index) => (
            <View key={index} style={styles.menuItemCard}>
              {item.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(item.thumbnail_url) || undefined }}
                  style={styles.menuItemImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.menuItemContent}>
                <View style={styles.menuItemHeader}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                </View>
                {item.description && (
                  <Text style={styles.menuItemDescription}>{item.description}</Text>
                )}
                <View style={styles.menuItemTags}>
                  {item.is_gluten_free && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>GF</Text>
                    </View>
                  )}
                  {item.is_gluten_free_available && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>GFA</Text>
                    </View>
                  )}
                  {item.is_vegetarian && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>V</Text>
                    </View>
                  )}
                  {item.is_vegetarian_available && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>VA</Text>
                    </View>
                  )}
                </View>
                <View style={styles.menuItemActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(item)}
                  >
                    <Text style={styles.buttonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item)}
                  >
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Item Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter item name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Description */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Enter description"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Price */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Price *</Text>
                <TextInput
                  style={styles.formInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g., 12 or $12"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              {/* Category */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Category *</Text>
                <View style={styles.picker}>
                  {CATEGORIES.map((cat, index) => (
                    <TouchableOpacity
                      key={index}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        backgroundColor:
                          category === cat ? managerColors.highlight : 'transparent',
                      }}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={{
                          color: managerColors.text,
                          fontWeight: category === cat ? '600' : '400',
                        }}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Subcategory */}
              {SUBCATEGORIES[category] && SUBCATEGORIES[category].length > 0 && (
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Subcategory</Text>
                  <View style={styles.picker}>
                    {SUBCATEGORIES[category].map((sub, index) => (
                      <TouchableOpacity
                        key={index}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor:
                            subcategory === sub ? managerColors.highlight : 'transparent',
                        }}
                        onPress={() => setSubcategory(sub)}
                      >
                        <Text
                          style={{
                            color: managerColors.text,
                            fontWeight: subcategory === sub ? '600' : '400',
                          }}
                        >
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Availability */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Availability</Text>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAvailableForLunch(!availableForLunch)}
                >
                  <View style={styles.checkbox}>
                    {availableForLunch && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Available for Lunch</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAvailableForDinner(!availableForDinner)}
                >
                  <View style={styles.checkbox}>
                    {availableForDinner && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Available for Dinner</Text>
                </TouchableOpacity>
              </View>

              {/* Dietary Options */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Dietary Options</Text>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsGlutenFree(!isGlutenFree)}
                >
                  <View style={styles.checkbox}>
                    {isGlutenFree && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Gluten Free</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsGlutenFreeAvailable(!isGlutenFreeAvailable)}
                >
                  <View style={styles.checkbox}>
                    {isGlutenFreeAvailable && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Gluten Free Available</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsVegetarian(!isVegetarian)}
                >
                  <View style={styles.checkbox}>
                    {isVegetarian && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Vegetarian</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsVegetarianAvailable(!isVegetarianAvailable)}
                >
                  <View style={styles.checkbox}>
                    {isVegetarianAvailable && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Vegetarian Available</Text>
                </TouchableOpacity>
              </View>

              {/* Thumbnail Shape */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Thumbnail Shape</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor:
                        thumbnailShape === 'banner' ? managerColors.highlight : managerColors.card,
                      borderWidth: 1,
                      borderColor: managerColors.border,
                      alignItems: 'center',
                    }}
                    onPress={() => setThumbnailShape('banner')}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: managerColors.text,
                      }}
                    >
                      Banner (16:9)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor:
                        thumbnailShape === 'square' ? managerColors.highlight : managerColors.card,
                      borderWidth: 1,
                      borderColor: managerColors.border,
                      alignItems: 'center',
                    }}
                    onPress={() => setThumbnailShape('square')}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: managerColors.text,
                      }}
                    >
                      Square (1:1)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Image Upload */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Item Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={styles.imagePickerButtonText}>
                    {uploadingImage ? 'Uploading...' : 'Choose Image'}
                  </Text>
                </TouchableOpacity>
                {thumbnailUrl && (
                  <Image
                    source={{ uri: getImageUrl(thumbnailUrl) || undefined }}
                    style={styles.thumbnailPreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSave}
                disabled={loading || uploadingImage}
              >
                {loading ? (
                  <ActivityIndicator color={managerColors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingItem ? 'Update Item' : 'Add Item'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
