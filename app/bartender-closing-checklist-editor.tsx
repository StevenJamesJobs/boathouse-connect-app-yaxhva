
import React, { useState, useEffect, useCallback } from 'react';
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

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

export default function BartenderClosingChecklistEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, flex: 1, textAlign: 'center' },
    addButton: { padding: 4 },
    placeholder: { width: 40 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollView: { flex: 1 },
    contentContainer: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 20, gap: 12 },
    infoText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    categoryCard: { backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, overflow: 'hidden', boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)', elevation: 3 },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    categoryHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    categoryHeaderText: { flex: 1 },
    categoryTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
    categoryItemCount: { fontSize: 13, color: colors.textSecondary },
    categoryActions: { flexDirection: 'row', gap: 8 },
    actionButton: { padding: 8 },
    itemsContainer: { paddingBottom: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    itemText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 22, marginRight: 12 },
    itemActions: { flexDirection: 'row', gap: 4 },
    addItemButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 8, marginHorizontal: 16, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', gap: 8 },
    addItemText: { fontSize: 15, fontWeight: '600', color: colors.highlight },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: colors.card, borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
    input: { backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    categoryPicker: { maxHeight: 200, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    categoryOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    categoryOptionSelected: { backgroundColor: colors.highlight },
    categoryOptionText: { fontSize: 15, color: colors.text },
    categoryOptionTextSelected: { fontWeight: '600' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    cancelButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
    saveButton: { backgroundColor: colors.highlight },
    saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  });

  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChecklistCategory | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [itemText, setItemText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadChecklist();
    }, [])
  );

  const loadChecklist = async () => {
    console.log('Loading Bartender Closing Checklist for editing');
    try {
      setLoading(true);

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('bartender_checklist_categories')
        .select('*')
        .eq('checklist_type', 'closing')
        .eq('is_active', true)
        .order('display_order');

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        throw categoriesError;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('bartender_checklist_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (itemsError) {
        console.error('Error loading items:', itemsError);
        throw itemsError;
      }

      const categoriesWithItems: ChecklistCategory[] = categoriesData?.map(cat => ({
        id: cat.id,
        name: cat.name,
        display_order: cat.display_order,
        items: itemsData
          ?.filter(item => item.category_id === cat.id)
          .map(item => ({
            id: item.id,
            text: item.text,
            display_order: item.display_order,
            category_id: item.category_id,
          })) || [],
      })) || [];

      setCategories(categoriesWithItems);
      
      const allCategoryIds = new Set(categoriesWithItems.map(c => c.id));
      setExpandedCategories(allCategoryIds);

      console.log('Loaded closing checklist with', categoriesWithItems.length, 'categories');
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert(t('common:error'), t('checklist_editor:error_load_checklist'));
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    console.log('Toggling category:', categoryId);
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
    console.log('Opening add category modal');
    setEditingCategory(null);
    setCategoryName('');
    setCategoryModalVisible(true);
  };

  const openEditCategoryModal = (category: ChecklistCategory) => {
    console.log('Opening edit category modal for:', category.name);
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryModalVisible(true);
  };

  const openAddItemModal = (categoryId: string) => {
    console.log('Opening add item modal for category:', categoryId);
    setEditingItem(null);
    setItemText('');
    setSelectedCategoryId(categoryId);
    setItemModalVisible(true);
  };

  const openEditItemModal = (item: ChecklistItem) => {
    console.log('Opening edit item modal for:', item.text);
    setEditingItem(item);
    setItemText(item.text);
    setSelectedCategoryId(item.category_id);
    setItemModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert(t('common:error'), t('checklist_editor:error_enter_category_name'));
      return;
    }

    console.log('Saving category:', categoryName);
    setSaving(true);

    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('bartender_checklist_categories')
          .update({ name: categoryName.trim() })
          .eq('id', editingCategory.id);

        if (error) throw error;
        console.log('Category updated successfully');
      } else {
        const maxOrder = Math.max(...categories.map(c => c.display_order), 0);
        const { error } = await supabase
          .from('bartender_checklist_categories')
          .insert({
            checklist_type: 'closing',
            name: categoryName.trim(),
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        console.log('Category created successfully');
      }

      setCategoryModalVisible(false);
      loadChecklist();
    } catch (error) {
      console.error('Error saving category:', error);
      Alert.alert(t('common:error'), t('checklist_editor:error_save_category'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = (category: ChecklistCategory) => {
    console.log('Deleting category:', category.name);
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
                .from('bartender_checklist_categories')
                .update({ is_active: false })
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
      Alert.alert(t('common:error'), t('checklist_editor:error_select_category'));
      return;
    }

    console.log('Saving item:', itemText);
    setSaving(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('bartender_checklist_items')
          .update({ 
            text: itemText.trim(),
            category_id: selectedCategoryId,
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        console.log('Item updated successfully');
      } else {
        const category = categories.find(c => c.id === selectedCategoryId);
        const maxOrder = category ? Math.max(...category.items.map(i => i.display_order), 0) : 0;
        
        const { error } = await supabase
          .from('bartender_checklist_items')
          .insert({
            category_id: selectedCategoryId,
            text: itemText.trim(),
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        console.log('Item created successfully');
      }

      setItemModalVisible(false);
      loadChecklist();
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert(t('common:error'), t('checklist_editor:error_save_item'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = (item: ChecklistItem) => {
    console.log('Deleting item:', item.text);
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
                .from('bartender_checklist_items')
                .update({ is_active: false })
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
          <Text style={styles.headerTitle}>{t('checklist_editor:closing_checklist_editor')}</Text>
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
        <Text style={styles.headerTitle}>Closing Checklist Editor</Text>
        <TouchableOpacity onPress={openAddCategoryModal} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={28}
            color={colors.highlight}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoCard}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={24}
            color={colors.highlight}
          />
          <Text style={styles.infoText}>
            {t('checklist_editor:info_bartender_closing')}
          </Text>
        </View>

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
                    color={colors.text}
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
                    onPress={() => openEditCategoryModal(category)}
                    style={styles.actionButton}
                  >
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={colors.highlight}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(category)}
                    style={styles.actionButton}
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
                <View style={styles.itemsContainer}>
                  {category.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemText}>{item.text}</Text>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          onPress={() => openEditItemModal(item)}
                          style={styles.actionButton}
                        >
                          <IconSymbol
                            ios_icon_name="pencil"
                            android_material_icon_name="edit"
                            size={18}
                            color={colors.highlight}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteItem(item)}
                          style={styles.actionButton}
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
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => openAddItemModal(category.id)}
                  >
                    <IconSymbol
                      ios_icon_name="plus.circle"
                      android_material_icon_name="add-circle-outline"
                      size={20}
                      color={colors.highlight}
                    />
                    <Text style={styles.addItemText}>{t('checklist_editor:add_item')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? t('checklist_editor:edit_category') : t('checklist_editor:add_category')}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={t('checklist_editor:category_name_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={categoryName}
              onChangeText={setCategoryName}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setCategoryModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveCategory}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.saveButtonText}>{t('common:save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={itemModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingItem ? t('checklist_editor:edit_item') : t('checklist_editor:add_item')}
            </Text>

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('checklist_editor:item_text_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={itemText}
              onChangeText={setItemText}
              multiline
              numberOfLines={3}
              autoFocus
            />

            <Text style={styles.label}>{t('checklist_editor:category_label')}</Text>
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

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setItemModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveItem}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.saveButtonText}>{t('common:save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
