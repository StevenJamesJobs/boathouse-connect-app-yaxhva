
import React, { useState, useEffect, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { managerColors } from '@/styles/commonStyles';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface ChecklistItem {
  id: string;
  text: string;
  display_order: number;
  category_id: string;
}

interface ChecklistCategory {
  id: string;
  name: string;
  display_order: number;
  items: ChecklistItem[];
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
    backgroundColor: managerColors.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
  categoryCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 2,
  },
  categoryItemCount: {
    fontSize: 13,
    color: managerColors.textSecondary,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  itemsContainer: {
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    color: managerColors.text,
    lineHeight: 22,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  addItemButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryPicker: {
    maxHeight: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
    marginTop: 8,
  },
  categoryOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  categoryOptionSelected: {
    backgroundColor: managerColors.highlight,
  },
  categoryOptionText: {
    fontSize: 15,
    color: managerColors.text,
  },
  categoryOptionTextSelected: {
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  saveButton: {
    backgroundColor: managerColors.highlight,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
});

export default function RunningSideWorkEditorScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'category' | 'item'>('category');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [itemText, setItemText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadChecklist();
    }, [])
  );

  const loadChecklist = async () => {
    console.log('Loading Running Side Work Checklist for editing');
    try {
      setLoading(true);

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('checklist_categories')
        .select('*')
        .eq('checklist_type', 'running_side_work')
        .order('display_order');

      if (categoriesError) throw categoriesError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('checklist_items')
        .select('*')
        .order('display_order');

      if (itemsError) throw itemsError;

      const categoriesWithItems: ChecklistCategory[] = categoriesData?.map(cat => ({
        id: cat.id,
        name: cat.name,
        display_order: cat.display_order,
        items: itemsData?.filter(item => item.category_id === cat.id) || [],
      })) || [];

      setCategories(categoriesWithItems);
      const allCategoryIds = new Set(categoriesWithItems.map(c => c.id));
      setExpandedCategories(allCategoryIds);

      console.log('Loaded checklist with', categoriesWithItems.length, 'categories');
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert('Error', 'Failed to load checklist. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const openAddCategoryModal = () => {
    setModalType('category');
    setEditingId(null);
    setCategoryName('');
    setModalVisible(true);
  };

  const openEditCategoryModal = (category: ChecklistCategory) => {
    setModalType('category');
    setEditingId(category.id);
    setCategoryName(category.name);
    setModalVisible(true);
  };

  const openAddItemModal = (categoryId: string) => {
    setModalType('item');
    setEditingId(null);
    setItemText('');
    setSelectedCategoryId(categoryId);
    setModalVisible(true);
  };

  const openEditItemModal = (item: ChecklistItem) => {
    setModalType('item');
    setEditingId(item.id);
    setItemText(item.text);
    setSelectedCategoryId(item.category_id);
    setModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('checklist_categories')
          .update({ name: categoryName.trim() })
          .eq('id', editingId);

        if (error) throw error;
        console.log('Category updated successfully');
      } else {
        const maxOrder = Math.max(...categories.map(c => c.display_order), -1);
        const { error } = await supabase
          .from('checklist_categories')
          .insert({
            checklist_type: 'running_side_work',
            name: categoryName.trim(),
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        console.log('Category created successfully');
      }

      setModalVisible(false);
      loadChecklist();
    } catch (error) {
      console.error('Error saving category:', error);
      Alert.alert('Error', 'Failed to save category. Please try again.');
    }
  };

  const handleDeleteCategory = async (category: ChecklistCategory) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}" and all its items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('checklist_categories')
                .delete()
                .eq('id', category.id);

              if (error) throw error;
              console.log('Category deleted successfully');
              loadChecklist();
            } catch (error) {
              console.error('Error deleting category:', error);
              Alert.alert('Error', 'Failed to delete category. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSaveItem = async () => {
    if (!itemText.trim()) {
      Alert.alert('Error', 'Please enter item text');
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert('Error', 'No category selected');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('checklist_items')
          .update({ text: itemText.trim() })
          .eq('id', editingId);

        if (error) throw error;
        console.log('Item updated successfully');
      } else {
        const category = categories.find(c => c.id === selectedCategoryId);
        const maxOrder = category ? Math.max(...category.items.map(i => i.display_order), -1) : -1;
        
        const { error } = await supabase
          .from('checklist_items')
          .insert({
            category_id: selectedCategoryId,
            text: itemText.trim(),
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        console.log('Item created successfully');
      }

      setModalVisible(false);
      loadChecklist();
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert('Error', 'Failed to save item. Please try again.');
    }
  };

  const handleDeleteItem = async (item: ChecklistItem) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('checklist_items')
                .delete()
                .eq('id', item.id);

              if (error) throw error;
              console.log('Item deleted successfully');
              loadChecklist();
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Error', 'Failed to delete item. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={managerColors.text}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Running Side Work Editor</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Running Side Work Editor</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <TouchableOpacity style={styles.addButton} onPress={openAddCategoryModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={managerColors.text}
          />
          <Text style={styles.addButtonText}>Add Category</Text>
        </TouchableOpacity>

        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <View key={category.id} style={styles.categoryCard}>
              <View style={styles.categoryHeader}>
                <TouchableOpacity
                  style={styles.categoryHeaderLeft}
                  onPress={() => toggleCategory(category.id)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                    android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                    size={24}
                    color={managerColors.textSecondary}
                  />
                  <View style={styles.categoryHeaderText}>
                    <Text style={styles.categoryTitle}>{category.name}</Text>
                    <Text style={styles.categoryItemCount}>
                      {category.items.length} items
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.categoryActions}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openEditCategoryModal(category)}
                  >
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={managerColors.highlight}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleDeleteCategory(category)}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={20}
                      color="#ff4444"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isExpanded && (
                <>
                  <View style={styles.itemsContainer}>
                    {category.items.map((item) => (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={styles.itemText}>{item.text}</Text>
                        <View style={styles.itemActions}>
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => openEditItemModal(item)}
                          >
                            <IconSymbol
                              ios_icon_name="pencil"
                              android_material_icon_name="edit"
                              size={18}
                              color={managerColors.highlight}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => handleDeleteItem(item)}
                          >
                            <IconSymbol
                              ios_icon_name="trash"
                              android_material_icon_name="delete"
                              size={18}
                              color="#ff4444"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => openAddItemModal(category.id)}
                  >
                    <IconSymbol
                      ios_icon_name="plus"
                      android_material_icon_name="add"
                      size={20}
                      color={managerColors.text}
                    />
                    <Text style={styles.addItemButtonText}>Add Item</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingId
                ? modalType === 'category'
                  ? 'Edit Category'
                  : 'Edit Item'
                : modalType === 'category'
                ? 'Add Category'
                : 'Add Item'}
            </Text>

            {modalType === 'category' ? (
              <>
                <TextInput
                  style={styles.input}
                  value={categoryName}
                  onChangeText={setCategoryName}
                  placeholder="Category name (e.g., Restrooms)"
                  placeholderTextColor={managerColors.textSecondary}
                  autoFocus
                />
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={itemText}
                  onChangeText={setItemText}
                  placeholder="Item text"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={3}
                  autoFocus
                />

                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView style={styles.categoryPicker}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryOption,
                        selectedCategoryId === cat.id && styles.categoryOptionSelected,
                      ]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text
                        style={[
                          styles.categoryOptionText,
                          selectedCategoryId === cat.id && styles.categoryOptionTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={modalType === 'category' ? handleSaveCategory : handleSaveItem}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
