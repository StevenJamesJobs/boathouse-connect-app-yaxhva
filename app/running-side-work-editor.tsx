
import React, { useState, useEffect, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
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

export default function RunningSideWorkEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
    placeholder: { width: 40 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollView: { flex: 1 },
    contentContainer: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.highlight, borderRadius: 12, padding: 16, marginBottom: 20, gap: 8 },
    addButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
    categoryCard: { backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, overflow: 'hidden', boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)', elevation: 3 },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    categoryHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    categoryHeaderText: { flex: 1 },
    categoryTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
    categoryItemCount: { fontSize: 13, color: colors.textSecondary },
    categoryActions: { flexDirection: 'row', gap: 8 },
    iconButton: { padding: 8 },
    itemsContainer: { paddingBottom: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    itemText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 22 },
    itemActions: { flexDirection: 'row', gap: 8 },
    addItemButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: 8, padding: 12, marginHorizontal: 16, marginBottom: 8, gap: 8, borderWidth: 1, borderColor: colors.border },
    addItemButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: colors.card, borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 20 },
    inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    input: { backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    categoryPicker: { maxHeight: 200, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    categoryOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    categoryOptionSelected: { backgroundColor: colors.highlight },
    categoryOptionText: { fontSize: 15, color: colors.text },
    categoryOptionTextSelected: { fontWeight: '600' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalButton: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
    cancelButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    saveButton: { backgroundColor: colors.highlight },
    modalButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  });
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
      Alert.alert(t('common:error'), t('checklist_editor:error_load_checklist'));
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
      Alert.alert(t('common:error'), t('checklist_editor:error_enter_category_name'));
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
      Alert.alert(t('common:error'), t('checklist_editor:error_save_category'));
    }
  };

  const handleDeleteCategory = async (category: ChecklistCategory) => {
    Alert.alert(
      t('checklist_editor:delete_category_title'),
      t('checklist_editor:delete_category_confirm', { name: category.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
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
              Alert.alert(t('common:error'), t('checklist_editor:error_delete_category'));
            }
          },
        },
      ]
    );
  };

  const handleSaveItem = async () => {
    if (!itemText.trim()) {
      Alert.alert(t('common:error'), t('checklist_editor:error_enter_item_text'));
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert(t('common:error'), t('checklist_editor:error_no_category_selected'));
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
      Alert.alert(t('common:error'), t('checklist_editor:error_save_item'));
    }
  };

  const handleDeleteItem = async (item: ChecklistItem) => {
    Alert.alert(
      t('checklist_editor:delete_item_title'),
      t('checklist_editor:delete_item_confirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
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
              Alert.alert(t('common:error'), t('checklist_editor:error_delete_item'));
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
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('checklist_editor:running_side_work_editor')}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.highlight} />
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
            color={colors.text}
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
            color={colors.text}
          />
          <Text style={styles.addButtonText}>{t('checklist_editor:add_category')}</Text>
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
                    color={colors.textSecondary}
                  />
                  <View style={styles.categoryHeaderText}>
                    <Text style={styles.categoryTitle}>{category.name}</Text>
                    <Text style={styles.categoryItemCount}>
                      {t('checklist_editor:items_count', { count: category.items.length })}
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
                      color={colors.highlight}
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
                              color={colors.highlight}
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
                      color={colors.text}
                    />
                    <Text style={styles.addItemButtonText}>{t('checklist_editor:add_item')}</Text>
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
                  ? t('checklist_editor:edit_category')
                  : t('checklist_editor:edit_item')
                : modalType === 'category'
                ? t('checklist_editor:add_category')
                : t('checklist_editor:add_item')}
            </Text>

            {modalType === 'category' ? (
              <>
                <TextInput
                  style={styles.input}
                  value={categoryName}
                  onChangeText={setCategoryName}
                  placeholder={t('checklist_editor:category_name_placeholder_side_work')}
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={itemText}
                  onChangeText={setItemText}
                  placeholder={t('checklist_editor:item_text_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  autoFocus
                />

                <Text style={styles.inputLabel}>{t('checklist_editor:category_label')}</Text>
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
                <Text style={styles.modalButtonText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={modalType === 'category' ? handleSaveCategory : handleSaveItem}
              >
                <Text style={styles.modalButtonText}>{t('common:save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
