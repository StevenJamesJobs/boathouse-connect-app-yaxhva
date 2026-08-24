
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField, saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import GlassSheet from '@/components/GlassSheet';
import { fonts } from '@/constants/fonts';

interface ChecklistItem {
  id: string;
  text: string;
  text_es: string | null;
  display_order: number;
  category_id: string;
}

interface ChecklistCategory {
  id: string;
  name: string;
  name_es: string | null;
  display_order: number;
  items: ChecklistItem[];
}

const TRASH_RED = '#E53935';

export default function BartenderClosingChecklistEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const isSpanishAuthor = i18n.language === 'es';

  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChecklistCategory | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryNameEs, setCategoryNameEs] = useState('');
  const [itemText, setItemText] = useState('');
  const [itemTextEs, setItemTextEs] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const addSessionRef = useRef(0);
  const addCatSessionRef = useRef(0);

  // ES/EN hybrid authoring for the category name (Steve, s74 smoke round 1).
  const categoryTranslation = useTranslationSection({
    fields: [
      {
        key: 'name',
        labelKey: 'translation_section:field_name',
        enValue: categoryName,
        esValue: categoryNameEs,
        setEnValue: setCategoryName,
        setEsValue: setCategoryNameEs,
        enStored: editingCategory ? editingCategory.name : undefined,
        esStored: editingCategory ? editingCategory.name_es : undefined,
      },
    ],
    sessionKey: editingCategory ? `edit:${editingCategory.id}` : `new:${addCatSessionRef.current}`,
    active: categoryModalVisible,
  });

  // ES/EN hybrid authoring for the item text (Steve, s74): the input binds the
  // author's device language; the section fills/refreshes the other side.
  const itemTranslation = useTranslationSection({
    fields: [
      {
        key: 'text',
        labelKey: 'checklist_editor:item_text_placeholder',
        enValue: itemText,
        esValue: itemTextEs,
        setEnValue: setItemText,
        setEsValue: setItemTextEs,
        multiline: true,
        enStored: editingItem ? editingItem.text : undefined,
        esStored: editingItem ? editingItem.text_es : undefined,
      },
    ],
    sessionKey: editingItem ? `edit:${editingItem.id}` : `new:${addSessionRef.current}`,
    active: itemModalVisible,
  });

  useFocusEffect(
    useCallback(() => {
      loadChecklist();
    }, [])
  );

  const loadChecklist = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const { data: categoriesData, error: categoriesError } = await supabase.rpc('get_checklist_categories', {
        p_actor_id: user.id,
        p_bartender: true,
        p_checklist_type: 'closing',
      });

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        throw categoriesError;
      }

      const { data: itemsData, error: itemsError } = await supabase.rpc('get_checklist_items', {
        p_actor_id: user.id,
        p_bartender: true,
        p_checklist_type: 'closing',
      });

      if (itemsError) {
        console.error('Error loading items:', itemsError);
        throw itemsError;
      }

      const categoriesWithItems: ChecklistCategory[] = categoriesData?.map(cat => ({
        id: cat.id,
        name: cat.name,
        name_es: cat.name_es,
        display_order: cat.display_order,
        items: itemsData
          ?.filter(item => item.category_id === cat.id)
          .map(item => ({
            id: item.id,
            text: item.text,
            text_es: item.text_es,
            display_order: item.display_order,
            category_id: item.category_id,
          })) || [],
      })) || [];

      setCategories(categoriesWithItems);

      const allCategoryIds = new Set(categoriesWithItems.map(c => c.id));
      setExpandedCategories(allCategoryIds);
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
    addCatSessionRef.current += 1;
    setEditingCategory(null);
    setCategoryName('');
    setCategoryNameEs('');
    setCategoryModalVisible(true);
  };

  const openEditCategoryModal = (category: ChecklistCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryNameEs(category.name_es || '');
    setCategoryModalVisible(true);
  };

  const openAddItemModal = (categoryId: string) => {
    addSessionRef.current += 1;
    setEditingItem(null);
    setItemText('');
    setItemTextEs('');
    setSelectedCategoryId(categoryId);
    setItemModalVisible(true);
  };

  const openEditItemModal = (item: ChecklistItem) => {
    setEditingItem(item);
    setItemText(item.text);
    setItemTextEs(item.text_es || '');
    setSelectedCategoryId(item.category_id);
    setItemModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!user?.id) return;
    const authorName = isSpanishAuthor ? categoryNameEs : categoryName;
    if (!authorName.trim()) {
      Alert.alert(t('common:error'), t('checklist_editor:error_enter_category_name'));
      return;
    }

    // Fill/refresh the other language per the staleness rules (may ask once).
    const resolved = await categoryTranslation.resolveOnSave();
    if (!resolved) return;

    setSaving(true);

    try {
      const { data: categoryId, error } = await supabase.rpc('upsert_checklist_category', {
        p_actor_id: user.id,
        p_bartender: true,
        p_checklist_type: 'closing',
        p_name: resolved.name.en.trim(),
        p_category_id: editingCategory?.id ?? undefined,
      });

      if (error) throw error;

      // '' (a confirmed clear) must write through — clearBlank marks it; null
      // would hit the RPC's COALESCE and silently keep the old translation.
      if (categoryId) {
        await saveTranslations(
          'bartender_checklist_categories',
          categoryId,
          { name_es: resolved.name.es },
          user.id,
          { clearBlank: ['name_es'] }
        );
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
    Alert.alert(
      t('checklist_editor:delete_category_title'),
      t('checklist_editor:delete_category_confirm', { name: category.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              const { error } = await supabase.rpc('delete_checklist_category', {
                p_actor_id: user.id,
                p_bartender: true,
                p_category_id: category.id,
              });

              if (error) throw error;
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
    if (!user?.id) return;
    const authorText = isSpanishAuthor ? itemTextEs : itemText;
    if (!authorText.trim()) {
      Alert.alert(t('common:error'), t('checklist_editor:error_enter_item_text'));
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert(t('common:error'), t('checklist_editor:error_select_category'));
      return;
    }

    // Fill/refresh the other language per the staleness rules (may ask once).
    const resolved = await itemTranslation.resolveOnSave();
    if (!resolved) return;

    setSaving(true);

    try {
      const { data: itemId, error } = await supabase.rpc('upsert_checklist_item', {
        p_actor_id: user.id,
        p_bartender: true,
        p_category_id: selectedCategoryId,
        p_text: resolved.text.en.trim(),
        p_item_id: editingItem?.id ?? undefined,
      });

      if (error) throw error;

      // '' (a confirmed clear) must write through — clearBlank marks it; null
      // would hit the RPC's COALESCE and silently keep the old translation.
      if (itemId) {
        await saveTranslations(
          'bartender_checklist_items',
          itemId,
          { text_es: resolved.text.es },
          user.id,
          { clearBlank: ['text_es'] }
        );
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
    Alert.alert(
      t('checklist_editor:delete_item_title'),
      t('checklist_editor:delete_item_confirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              const { error } = await supabase.rpc('delete_checklist_item', {
                p_actor_id: user.id,
                p_bartender: true,
                p_item_id: item.id,
              });

              if (error) throw error;
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

  // Sheet footer: Cancel (glass) / Save (primary) — the house pair.
  const sheetFooter = (onCancel: () => void, onSave: () => void) => (
    <View style={styles.footerRow}>
      <TouchableOpacity
        style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        onPress={onCancel}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }, saving && { opacity: 0.6 }]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color={colors.fireText} />
        ) : (
          <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('common:save')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const header = (
    <>
      <AmbientGlow />
      <ScreenHeader
        title={t('checklist_editor:closing_checklist_editor')}
        rightWide
        right={
          <View style={styles.headerRightRow}>
            {/* ⓘ + To User, matching the general checklist editors (Steve, s74
                round 2) — Add Category lives below the header as its own chip. */}
            <TouchableOpacity
              onPress={() => setInfoVisible(true)}
              style={[styles.addChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            >
              <IconSymbol ios_icon_name="info" android_material_icon_name="info-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <HeaderNavButton
              label={t('common:to_user')}
              iconIos="person.fill"
              iconAndroid="person"
              onPress={() => router.replace('/bartender-closing-checklist')}
            />
          </View>
        }
      />
    </>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {header}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Add Category — its own chip above the list (Steve, s74 round 2) */}
        <View style={styles.addCatRow}>
          <TouchableOpacity
            style={[styles.addCatChip, { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' }]}
            onPress={openAddCategoryModal}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={colors.primary} />
            <Text style={[styles.addCatChipText, { color: colors.primary }]}>{t('checklist_editor:add_category')}</Text>
          </TouchableOpacity>
        </View>

        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <View key={category.id} style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <View style={styles.categoryHeader}>
                <TouchableOpacity
                  style={styles.categoryHeaderLeft}
                  onPress={() => toggleCategory(category.id)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                    android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                    size={16}
                    color={colors.textSecondary}
                  />
                  <View style={styles.categoryHeaderText}>
                    <Text style={[styles.categoryTitle, { color: colors.text }]}>
                      {getLocalizedField(category, 'name', language)}
                    </Text>
                    <Text style={[styles.categoryItemCount, { color: colors.textSecondary }]}>
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
                      size={17}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(category)}
                    style={styles.actionButton}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={17}
                      color={TRASH_RED}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {category.items.map((item) => (
                    <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.border + '55' }]}>
                      <Text style={[styles.itemText, { color: colors.text }]}>
                        {getLocalizedField(item, 'text', language)}
                      </Text>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          onPress={() => openEditItemModal(item)}
                          style={styles.actionButton}
                        >
                          <IconSymbol
                            ios_icon_name="pencil"
                            android_material_icon_name="edit"
                            size={16}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteItem(item)}
                          style={styles.actionButton}
                        >
                          <IconSymbol
                            ios_icon_name="trash"
                            android_material_icon_name="delete"
                            size={16}
                            color={TRASH_RED}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.addItemButton, { borderColor: colors.primary + '8C' }]}
                    onPress={() => openAddItemModal(category.id)}
                  >
                    <IconSymbol
                      ios_icon_name="plus"
                      android_material_icon_name="add"
                      size={15}
                      color={colors.primary}
                    />
                    <Text style={[styles.addItemText, { color: colors.primary }]}>{t('checklist_editor:add_item')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* About this editor (the old top blurb, now behind the ⓘ chip) */}
      <GlassSheet
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        title={t('checklist_editor:about_title')}
      >
        <View style={[styles.infoCard, { backgroundColor: colors.primary + '15' }]}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.infoText, { color: colors.text }]}>
            {t('checklist_editor:info_bartender_closing')}
          </Text>
        </View>
      </GlassSheet>

      {/* Add/Edit Category */}
      <GlassSheet
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        title={editingCategory ? t('checklist_editor:edit_category') : t('checklist_editor:add_category')}
        footer={sheetFooter(() => setCategoryModalVisible(false), handleSaveCategory)}
      >
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
          placeholder={t('checklist_editor:category_name_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={isSpanishAuthor ? categoryNameEs : categoryName}
          onChangeText={(text) => (isSpanishAuthor ? setCategoryNameEs(text) : setCategoryName(text))}
          autoFocus
        />

        {categoryTranslation.element}
      </GlassSheet>

      {/* Add/Edit Item */}
      <GlassSheet
        visible={itemModalVisible}
        onClose={() => setItemModalVisible(false)}
        title={editingItem ? t('checklist_editor:edit_item') : t('checklist_editor:add_item')}
        footer={sheetFooter(() => setItemModalVisible(false), handleSaveItem)}
      >
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
          placeholder={t('checklist_editor:item_text_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={isSpanishAuthor ? itemTextEs : itemText}
          onChangeText={(text) => (isSpanishAuthor ? setItemTextEs(text) : setItemText(text))}
          multiline
          numberOfLines={3}
          autoFocus
        />

        {itemTranslation.element}

        <Text style={[styles.sheetLabel, { color: colors.textSecondary }]}>{t('checklist_editor:category_label')}</Text>
        {categories.map((cat) => {
          const isCurrent = selectedCategoryId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryOption,
                {
                  backgroundColor: isCurrent ? colors.primary + '2E' : colors.surface,
                  borderColor: isCurrent ? colors.primary + '6B' : colors.surfaceBorder,
                },
              ]}
              onPress={() => setSelectedCategoryId(cat.id)}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  { color: isCurrent ? colors.primary : colors.text },
                  isCurrent && { fontFamily: fonts.body.semibold },
                ]}
                numberOfLines={1}
              >
                {getLocalizedField(cat, 'name', language)}
              </Text>
              {isCurrent && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCatRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  addCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  addCatChipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
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
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 13,
    padding: 13,
    marginBottom: 14,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 18,
  },
  categoryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginBottom: 2,
  },
  categoryItemCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  itemsContainer: {
    paddingBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 21,
    marginRight: 8,
    paddingTop: 6,
  },
  itemActions: {
    flexDirection: 'row',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 6,
    marginHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 7,
  },
  addItemText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  input: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sheetLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 7,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 8,
  },
  categoryOptionText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
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
  footerBtnLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
});
