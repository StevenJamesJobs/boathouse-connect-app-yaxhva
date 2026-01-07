
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

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

const CATEGORIES = {
  'Appetizers': ['Hot', 'Cold', 'Shared Plates'],
  'Soups & Salads': ['Soups', 'Salads'],
  'Entrees': ['Seafood', 'Steaks & Chops', 'Pasta', 'Chicken', 'Burgers & Sandwiches'],
  'Sides': [],
  'Desserts': [],
  'Kids Menu': [],
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 5,
  },
  addButton: {
    padding: 5,
  },
  searchContainer: {
    padding: 15,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  searchInput: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
  },
  filterContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  filterButtonActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  menuList: {
    padding: 15,
  },
  menuCard: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  menuThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: managerColors.background,
  },
  menuInfo: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  menuName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 5,
  },
  menuPrice: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 5,
  },
  menuCategory: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  menuActions: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  actionButton: {
    padding: 8,
    marginVertical: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  closeButton: {
    padding: 5,
  },
  modalScroll: {
    maxHeight: '100%',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  thumbnailContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  thumbnailPreview: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: managerColors.background,
    marginBottom: 10,
  },
  thumbnailButton: {
    backgroundColor: managerColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  thumbnailButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: managerColors.border,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: managerColors.accent,
    borderColor: managerColors.accent,
  },
  checkboxLabel: {
    fontSize: 14,
    color: managerColors.text,
  },
  saveButton: {
    backgroundColor: managerColors.accent,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function MenuEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Appetizers');
  const [subcategory, setSubcategory] = useState('');
  const [availableForLunch, setAvailableForLunch] = useState(true);
  const [availableForDinner, setAvailableForDinner] = useState(true);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isGlutenFreeAvailable, setIsGlutenFreeAvailable] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegetarianAvailable, setIsVegetarianAvailable] = useState(false);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailShape, setThumbnailShape] = useState('square');
  const [displayOrder, setDisplayOrder] = useState('0');

  const filterItems = useCallback(() => {
    let filtered = menuItems;

    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== 'All') {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    if (selectedSubcategory !== 'All') {
      filtered = filtered.filter((item) => item.subcategory === selectedSubcategory);
    }

    setFilteredItems(filtered);
  }, [menuItems, searchQuery, selectedCategory, selectedSubcategory]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

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

      setMenuItems(data || []);
      setFilteredItems(data || []);
    } catch (error) {
      console.error('Error loading menu items:', error);
      Alert.alert('Error', 'Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const fileName = `menu-item-${Date.now()}.jpg`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('menu-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('menu-images').getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
      return null;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an item name');
      return;
    }

    try {
      setSaving(true);

      let thumbnailUrl = editingItem?.thumbnail_url || null;

      if (thumbnailUri && thumbnailUri !== editingItem?.thumbnail_url) {
        const uploadedUrl = await uploadImage(thumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      }

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
        display_order: parseInt(displayOrder) || 0,
        is_active: true,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        Alert.alert('Success', 'Menu item updated successfully');
      } else {
        const { error } = await supabase.from('menu_items').insert([itemData]);

        if (error) throw error;
        Alert.alert('Success', 'Menu item created successfully');
      }

      closeModal();
      loadMenuItems();
    } catch (error) {
      console.error('Error saving menu item:', error);
      Alert.alert('Error', 'Failed to save menu item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    Alert.alert('Delete Item', 'Are you sure you want to delete this menu item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('menu_items').delete().eq('id', item.id);

            if (error) throw error;

            Alert.alert('Success', 'Menu item deleted successfully');
            loadMenuItems();
          } catch (error) {
            console.error('Error deleting menu item:', error);
            Alert.alert('Error', 'Failed to delete menu item');
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('Appetizers');
    setSubcategory('');
    setAvailableForLunch(true);
    setAvailableForDinner(true);
    setIsGlutenFree(false);
    setIsGlutenFreeAvailable(false);
    setIsVegetarian(false);
    setIsVegetarianAvailable(false);
    setThumbnailUri(null);
    setThumbnailShape('square');
    setDisplayOrder('0');
    setModalVisible(true);
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
    setThumbnailUri(item.thumbnail_url);
    setThumbnailShape(item.thumbnail_shape);
    setDisplayOrder(item.display_order.toString());
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingItem(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${supabase.supabaseUrl}/storage/v1/object/public/menu-images/${url}`;
  };

  const formatPrice = (price: string) => {
    if (!price) return '$0.00';
    return price.startsWith('$') ? price : `$${price}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search menu items..."
          placeholderTextColor={managerColors.textSecondary}
        />
      </View>

      {/* Category Filter */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterButton, selectedCategory === 'All' && styles.filterButtonActive]}
            onPress={() => {
              setSelectedCategory('All');
              setSelectedSubcategory('All');
            }}
          >
            <Text
              style={[
                styles.filterButtonText,
                selectedCategory === 'All' && styles.filterButtonTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {Object.keys(CATEGORIES).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterButton, selectedCategory === cat && styles.filterButtonActive]}
              onPress={() => {
                setSelectedCategory(cat);
                setSelectedSubcategory('All');
              }}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedCategory === cat && styles.filterButtonTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Menu List */}
      <ScrollView style={styles.menuList}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={48}
              color={managerColors.textSecondary}
            />
            <Text style={styles.emptyStateText}>No menu items found</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.menuCard}>
              <Image
                source={{ uri: getImageUrl(item.thumbnail_url) || undefined }}
                style={styles.menuThumbnail}
              />
              <View style={styles.menuInfo}>
                <Text style={styles.menuName}>{item.name}</Text>
                <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
                <Text style={styles.menuCategory}>
                  {item.category}
                  {item.subcategory ? ` - ${item.subcategory}` : ''}
                </Text>
              </View>
              <View style={styles.menuActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEditModal(item)}>
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={20}
                    color={managerColors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item)}>
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color="#FF3B30"
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit/Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Add Item'}</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Thumbnail */}
              <View style={styles.thumbnailContainer}>
                {thumbnailUri && (
                  <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} />
                )}
                <TouchableOpacity onPress={pickImage} style={styles.thumbnailButton}>
                  <Text style={styles.thumbnailButtonText}>
                    {thumbnailUri ? 'Change Image' : 'Add Image'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Item name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Item description"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                />
              </View>

              {/* Price */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {Object.keys(CATEGORIES).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.filterButton,
                        category === cat && styles.filterButtonActive,
                      ]}
                      onPress={() => {
                        setCategory(cat);
                        setSubcategory('');
                      }}
                    >
                      <Text
                        style={[
                          styles.filterButtonText,
                          category === cat && styles.filterButtonTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Subcategory */}
              {CATEGORIES[category as keyof typeof CATEGORIES].length > 0 && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Subcategory</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CATEGORIES[category as keyof typeof CATEGORIES].map((subcat) => (
                      <TouchableOpacity
                        key={subcat}
                        style={[
                          styles.filterButton,
                          subcategory === subcat && styles.filterButtonActive,
                        ]}
                        onPress={() => setSubcategory(subcat)}
                      >
                        <Text
                          style={[
                            styles.filterButtonText,
                            subcategory === subcat && styles.filterButtonTextActive,
                          ]}
                        >
                          {subcat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Availability */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Availability</Text>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setAvailableForLunch(!availableForLunch)}
                >
                  <View style={[styles.checkbox, availableForLunch && styles.checkboxActive]}>
                    {availableForLunch && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Available for Lunch</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setAvailableForDinner(!availableForDinner)}
                >
                  <View style={[styles.checkbox, availableForDinner && styles.checkboxActive]}>
                    {availableForDinner && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Available for Dinner</Text>
                </TouchableOpacity>
              </View>

              {/* Dietary Options */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Dietary Options</Text>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setIsGlutenFree(!isGlutenFree)}
                >
                  <View style={[styles.checkbox, isGlutenFree && styles.checkboxActive]}>
                    {isGlutenFree && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Gluten Free</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setIsGlutenFreeAvailable(!isGlutenFreeAvailable)}
                >
                  <View
                    style={[styles.checkbox, isGlutenFreeAvailable && styles.checkboxActive]}
                  >
                    {isGlutenFreeAvailable && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Gluten Free Available</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setIsVegetarian(!isVegetarian)}
                >
                  <View style={[styles.checkbox, isVegetarian && styles.checkboxActive]}>
                    {isVegetarian && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Vegetarian</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setIsVegetarianAvailable(!isVegetarianAvailable)}
                >
                  <View
                    style={[styles.checkbox, isVegetarianAvailable && styles.checkboxActive]}
                  >
                    {isVegetarianAvailable && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Vegetarian Available</Text>
                </TouchableOpacity>
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  placeholder="0"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingItem ? 'Update Item' : 'Create Item'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Delete Button (only when editing) */}
              {editingItem && (
                <TouchableOpacity
                  onPress={() => {
                    closeModal();
                    handleDelete(editingItem);
                  }}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete Item</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
