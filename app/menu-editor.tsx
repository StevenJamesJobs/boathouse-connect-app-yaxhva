
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
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';
import * as FileSystem from 'expo-file-system';

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

const CATEGORIES = [
  'All',
  'Appetizers',
  'Salads',
  'Entrees',
  'Sandwiches',
  'Desserts',
  'Beverages',
];

const SUBCATEGORIES: { [key: string]: string[] } = {
  Appetizers: ['Hot', 'Cold', 'Shared'],
  Salads: ['House', 'Caesar', 'Specialty'],
  Entrees: ['Seafood', 'Steak', 'Pasta', 'Chicken'],
  Sandwiches: ['Burgers', 'Wraps', 'Classic'],
  Desserts: ['Cakes', 'Ice Cream', 'Specialty'],
  Beverages: ['Soft Drinks', 'Coffee', 'Tea'],
};

export default function MenuEditorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Appetizers',
    subcategory: '',
    available_for_lunch: true,
    available_for_dinner: true,
    is_gluten_free: false,
    is_gluten_free_available: false,
    is_vegetarian: false,
    is_vegetarian_available: false,
    thumbnail_url: null as string | null,
    thumbnail_shape: 'square',
    is_active: true,
  });

  const loadMenuItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      console.error('Error loading menu items:', error);
      Alert.alert('Error', 'Failed to load menu items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenuItems();
  }, [loadMenuItems]);

  const filterItems = useCallback(() => {
    if (selectedCategory === 'All') {
      setFilteredItems(menuItems);
    } else {
      setFilteredItems(menuItems.filter((item) => item.category === selectedCategory));
    }
  }, [selectedCategory, menuItems]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      await uploadImage(imageUri);
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = decode(base64);
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('menu-items')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('menu-items').getPublicUrl(filePath);

      setFormData((prev) => ({ ...prev, thumbnail_url: publicUrl }));
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setUploading(true);

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update({
            name: formData.name,
            description: formData.description,
            price: formData.price,
            category: formData.category,
            subcategory: formData.subcategory,
            available_for_lunch: formData.available_for_lunch,
            available_for_dinner: formData.available_for_dinner,
            is_gluten_free: formData.is_gluten_free,
            is_gluten_free_available: formData.is_gluten_free_available,
            is_vegetarian: formData.is_vegetarian,
            is_vegetarian_available: formData.is_vegetarian_available,
            thumbnail_url: formData.thumbnail_url,
            thumbnail_shape: formData.thumbnail_shape,
            is_active: formData.is_active,
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        Alert.alert('Success', 'Menu item updated successfully');
      } else {
        const { error } = await supabase.from('menu_items').insert({
          name: formData.name,
          description: formData.description,
          price: formData.price,
          category: formData.category,
          subcategory: formData.subcategory,
          available_for_lunch: formData.available_for_lunch,
          available_for_dinner: formData.available_for_dinner,
          is_gluten_free: formData.is_gluten_free,
          is_gluten_free_available: formData.is_gluten_free_available,
          is_vegetarian: formData.is_vegetarian,
          is_vegetarian_available: formData.is_vegetarian_available,
          thumbnail_url: formData.thumbnail_url,
          thumbnail_shape: formData.thumbnail_shape,
          is_active: formData.is_active,
          display_order: menuItems.length,
        });

        if (error) throw error;
        Alert.alert('Success', 'Menu item added successfully');
      }

      closeModal();
      loadMenuItems();
    } catch (error) {
      console.error('Error saving menu item:', error);
      Alert.alert('Error', 'Failed to save menu item');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Attempting to delete menu item:', item.id);
              
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                Alert.alert('Error', 'You must be logged in to delete items');
                return;
              }

              console.log('User is authenticated, proceeding with delete');
              
              const { error } = await supabase
                .from('menu_items')
                .delete()
                .eq('id', item.id);

              if (error) {
                console.error('Supabase delete error:', error);
                throw error;
              }

              console.log('Menu item deleted successfully');
              Alert.alert('Success', 'Menu item deleted successfully');
              loadMenuItems();
            } catch (error: any) {
              console.error('Error deleting menu item:', error);
              
              let errorMessage = 'Failed to delete menu item';
              if (error.code === '42501') {
                errorMessage = 'Permission denied. Please make sure you are logged in as a manager.';
              } else if (error.message) {
                errorMessage = error.message;
              }
              
              Alert.alert('Error', errorMessage);
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    resetForm();
    setEditingItem(null);
    setModalVisible(true);
  };

  const openEditModal = (item: MenuItem) => {
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
      thumbnail_url: item.thumbnail_url,
      thumbnail_shape: item.thumbnail_shape,
      is_active: item.is_active,
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      category: 'Appetizers',
      subcategory: '',
      available_for_lunch: true,
      available_for_dinner: true,
      is_gluten_free: false,
      is_gluten_free_available: false,
      is_vegetarian: false,
      is_vegetarian_available: false,
      thumbnail_url: null,
      thumbnail_shape: 'square',
      is_active: true,
    });
  };

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('menu-items').getPublicUrl(url);
    return data.publicUrl;
  };

  const formatPrice = (price: string): string => {
    const num = parseFloat(price);
    return isNaN(num) ? price : `$${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Menu Editor</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.filterButton,
                selectedCategory === category && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedCategory === category && styles.filterButtonTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={48} color={managerColors.textSecondary} />
            <Text style={styles.emptyStateText}>No menu items found</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.menuItem}>
              <View style={styles.menuItemHeader}>
                {item.thumbnail_url && (
                  <Image
                    source={{ uri: getImageUrl(item.thumbnail_url) }}
                    style={styles.menuItemImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.menuItemInfo}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemPrice}>{formatPrice(item.price)}</Text>
                  <Text style={styles.menuItemCategory}>
                    {item.category}
                    {item.subcategory ? ` • ${item.subcategory}` : ''}
                  </Text>
                </View>
              </View>
              {item.description && (
                <Text style={styles.menuItemDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              <View style={styles.menuItemActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => openEditModal(item)}
                >
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={16} color="#fff" />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDelete(item)}
                >
                  <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color="#fff" />
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </Text>
              <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color={managerColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Enter item name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  placeholder="Enter description"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Price *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                  placeholder="0.00"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  disabled={uploading}
                >
                  <Text style={styles.imagePickerButtonText}>
                    {uploading ? 'Uploading...' : 'Choose Image'}
                  </Text>
                </TouchableOpacity>
                {formData.thumbnail_url && (
                  <>
                    <Image
                      source={{ uri: getImageUrl(formData.thumbnail_url) }}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.label}>Display Shape (for menu view)</Text>
                    <View style={styles.shapeSelector}>
                      <TouchableOpacity
                        style={[
                          styles.shapeButton,
                          formData.thumbnail_shape === 'square' && styles.shapeButtonActive,
                        ]}
                        onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                      >
                        <Text
                          style={[
                            styles.shapeButtonText,
                            formData.thumbnail_shape === 'square' &&
                              styles.shapeButtonTextActive,
                          ]}
                        >
                          Square
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.shapeButton,
                          formData.thumbnail_shape === 'banner' && styles.shapeButtonActive,
                        ]}
                        onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                      >
                        <Text
                          style={[
                            styles.shapeButtonText,
                            formData.thumbnail_shape === 'banner' &&
                              styles.shapeButtonTextActive,
                          ]}
                        >
                          Banner
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    formData.is_active && styles.checkboxChecked,
                  ]}
                  onPress={() => setFormData({ ...formData, is_active: !formData.is_active })}
                >
                  {formData.is_active && (
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>Active</Text>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeModal}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSave}
                disabled={uploading}
              >
                <Text style={styles.modalButtonText}>
                  {uploading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: managerColors.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
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
    borderRadius: 20,
    backgroundColor: managerColors.background,
    marginRight: 10,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  filterButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    color: managerColors.text,
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  menuItem: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  menuItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  menuItemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: managerColors.background,
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: 16,
    color: managerColors.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuItemCategory: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  menuItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: managerColors.primary,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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
    padding: 4,
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
    fontSize: 16,
    color: managerColors.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: managerColors.primary,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: managerColors.primary,
  },
  checkboxLabel: {
    fontSize: 16,
    color: managerColors.text,
  },
  imagePickerButton: {
    backgroundColor: managerColors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  imagePickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  shapeSelector: {
    flexDirection: 'row',
    marginTop: 10,
  },
  shapeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  shapeButtonActive: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  shapeButtonText: {
    fontSize: 14,
    color: managerColors.text,
  },
  shapeButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: managerColors.textSecondary,
  },
  saveButton: {
    backgroundColor: managerColors.primary,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
