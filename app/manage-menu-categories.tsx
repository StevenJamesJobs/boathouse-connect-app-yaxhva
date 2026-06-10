import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories, MenuCategory, MenuSubcategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import CategoryColorPicker from '@/components/CategoryColorPicker';

type NameMode = 'add-cat' | 'rename-cat' | 'add-sub' | 'rename-sub';

// One-line behavior captions for the built-ins so owners understand where each
// special category surfaces / how its items get tagged. Keyed by system_key;
// plain built-ins (Happy Hour) get none.
const BEHAVIOR_CAPTION_KEY: Record<string, string> = {
  'cat.weekly_specials': 'manage_categories:behavior_weekly_specials',
  'cat.lunch': 'manage_categories:behavior_lunch_dinner',
  'cat.dinner': 'manage_categories:behavior_lunch_dinner',
  'cat.wine': 'manage_categories:behavior_wine',
  'cat.libations': 'manage_categories:behavior_libations',
};

export default function ManageMenuCategoriesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { categories: hookCats, loading, refresh } = useMenuCategories({ includeHidden: true });

  // Local mirror so drag-reorder is snappy; re-synced whenever the hook reloads.
  const [cats, setCats] = useState<MenuCategory[]>([]);
  useEffect(() => setCats(hookCats), [hookCats]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [colorPickerCatId, setColorPickerCatId] = useState<string | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: NameMode; id: string | null; title: string } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedCategory = cats.find((c) => c.id === selectedCategoryId) || null;

  if (user?.role !== 'owner') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.deniedText}>{t('manage_categories:access_denied')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>{t('manage_categories:go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- RPC helper ----------------------------------------------------------
  const callRpc = async (fn: string, args: Record<string, any>, doRefresh = true): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)(fn, args);
      if (error) {
        Alert.alert(t('common:error'), error.message);
        return false;
      }
      if (data && data.success === false) {
        Alert.alert(t('common:error'), data.error || 'Action failed');
        return false;
      }
      if (doRefresh) await refresh();
      return true;
    } catch (e: any) {
      Alert.alert(t('common:error'), e?.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // --- Name modal ----------------------------------------------------------
  const openNameModal = (mode: NameMode, id: string | null, initial: string, title: string) => {
    setNameModal({ mode, id, title });
    setNameInput(initial);
  };

  const submitName = async () => {
    if (!nameModal) return;
    const value = nameInput.trim();
    if (!value) return;
    const m = nameModal;
    setNameModal(null);
    if (m.mode === 'add-cat') {
      await callRpc('manage_menu_category_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_display_name: value,
      });
    } else if (m.mode === 'rename-cat') {
      await callRpc('manage_menu_category_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_new_name: value,
      });
    } else if (m.mode === 'add-sub') {
      await callRpc('manage_menu_subcategory_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_display_name: value,
      });
    } else if (m.mode === 'rename-sub') {
      await callRpc('manage_menu_subcategory_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_subcategory_id: m.id,
        p_new_name: value,
      });
    }
  };

  // --- Category actions ----------------------------------------------------
  const toggleCategoryHidden = (cat: MenuCategory) =>
    callRpc('manage_menu_category_set_hidden', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: cat.id,
      p_is_hidden: !cat.is_hidden,
    });

  const deleteCategory = (cat: MenuCategory) => {
    Alert.alert(
      t('manage_categories:delete_category_title'),
      t('manage_categories:delete_category_confirm', { name: cat.display_name }),
      [
        { text: t('manage_categories:cancel'), style: 'cancel' },
        {
          text: t('manage_categories:delete'),
          style: 'destructive',
          onPress: () =>
            callRpc('manage_menu_category_delete', {
              p_organization_id: organizationId,
              p_user_id: user!.id,
              p_category_id: cat.id,
            }),
        },
      ],
    );
  };

  const setCategoryColor = (catId: string, color: string) => {
    setColorPickerCatId(null);
    callRpc('manage_menu_category_set_color', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: catId,
      p_color: color,
    });
  };

  const persistCategoryOrder = (ordered: MenuCategory[]) => {
    setCats(ordered);
    callRpc(
      'manage_menu_category_reorder',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_ordered_ids: ordered.map((c) => c.id),
      },
      false,
    );
  };

  // --- Subcategory actions -------------------------------------------------
  const toggleSubHidden = (sub: MenuSubcategory) =>
    callRpc('manage_menu_subcategory_set_hidden', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_is_hidden: !sub.is_hidden,
    });

  const deleteSub = (sub: MenuSubcategory) => {
    Alert.alert(
      t('manage_categories:delete_subcategory_title'),
      t('manage_categories:delete_subcategory_confirm', { name: sub.display_name }),
      [
        { text: t('manage_categories:cancel'), style: 'cancel' },
        {
          text: t('manage_categories:delete'),
          style: 'destructive',
          onPress: () =>
            callRpc('manage_menu_subcategory_delete', {
              p_organization_id: organizationId,
              p_user_id: user!.id,
              p_subcategory_id: sub.id,
            }),
        },
      ],
    );
  };

  const persistSubOrder = (catId: string, ordered: MenuSubcategory[]) => {
    setCats((prev) => prev.map((c) => (c.id === catId ? { ...c, subcategories: ordered } : c)));
    callRpc(
      'manage_menu_subcategory_reorder',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: catId,
        p_ordered_ids: ordered.map((s) => s.id),
      },
      false,
    );
  };

  // --- Renderers -----------------------------------------------------------
  const renderCategory = ({ item, drag, isActive }: RenderItemParams<MenuCategory>) => {
    const builtIn = item.system_key !== null;
    return (
      <ScaleDecorator>
        <View style={[styles.row, { opacity: item.is_hidden ? 0.5 : 1 }, isActive && styles.rowActive]}>
          <TouchableOpacity onLongPress={drag} disabled={busy} style={styles.dragHandle}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setColorPickerCatId(item.id)} style={[styles.swatch, { backgroundColor: item.color }]} />

          <TouchableOpacity style={styles.rowLabelArea} onPress={() => setSelectedCategoryId(item.id)} activeOpacity={0.7}>
            <Text style={styles.rowLabel} numberOfLines={1}>{categoryLabel(item, t)}</Text>
            {builtIn && (
              <View style={styles.badge}>
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.textSecondary} />
                <Text style={styles.badgeText}>{t('manage_categories:built_in')}</Text>
              </View>
            )}
            {item.system_key && BEHAVIOR_CAPTION_KEY[item.system_key] && (
              <Text style={styles.caption}>{t(BEHAVIOR_CAPTION_KEY[item.system_key])}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => openNameModal('rename-cat', item.id, item.display_name, t('manage_categories:rename_category'))} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleCategoryHidden(item)} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name={item.is_hidden ? 'eye.slash' : 'eye'} android_material_icon_name={item.is_hidden ? 'visibility-off' : 'visibility'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {!builtIn ? (
            <TouchableOpacity onPress={() => deleteCategory(item)} style={styles.iconBtn} disabled={busy}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#E53935" />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtn} />
          )}
          <TouchableOpacity onPress={() => setSelectedCategoryId(item.id)} style={styles.iconBtn}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  const renderSub = ({ item, drag, isActive }: RenderItemParams<MenuSubcategory>) => {
    const locked = item.is_cocktail_fed;
    return (
      <ScaleDecorator>
        <View style={[styles.row, { opacity: item.is_hidden ? 0.5 : 1 }, isActive && styles.rowActive]}>
          <TouchableOpacity onLongPress={drag} disabled={busy} style={styles.dragHandle}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.rowLabelArea}>
            <Text style={styles.rowLabel} numberOfLines={1}>{subcategoryLabel(item, t)}</Text>
            {locked && (
              <View style={styles.badge}>
                <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={11} color={colors.textSecondary} />
                <Text style={styles.badgeText}>{t('manage_categories:linked_to_recipes')}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={() => openNameModal('rename-sub', item.id, item.display_name, t('manage_categories:rename_subcategory'))} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleSubHidden(item)} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name={item.is_hidden ? 'eye.slash' : 'eye'} android_material_icon_name={item.is_hidden ? 'visibility-off' : 'visibility'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {!locked ? (
            <TouchableOpacity onPress={() => deleteSub(item)} style={styles.iconBtn} disabled={busy}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#E53935" />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
      </ScaleDecorator>
    );
  };

  // --- Screen --------------------------------------------------------------
  const inSubview = selectedCategory !== null;
  const pickerCat = cats.find((c) => c.id === colorPickerCatId) || null;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (inSubview ? setSelectedCategoryId(null) : router.back())} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {inSubview ? categoryLabel(selectedCategory!, t) : t('manage_categories:title')}
        </Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : inSubview ? (
        <DraggableFlatList
          data={selectedCategory!.subcategories}
          keyExtractor={(s) => s.id}
          renderItem={renderSub}
          onDragEnd={({ data }) => persistSubOrder(selectedCategory!.id, data)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.hint}>{t('manage_categories:subcategory_hint')}</Text>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openNameModal('add-sub', selectedCategory!.id, '', t('manage_categories:add_subcategory'))}
              disabled={busy}
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.addBtnText}>{t('manage_categories:add_subcategory')}</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <DraggableFlatList
          data={cats}
          keyExtractor={(c) => c.id}
          renderItem={renderCategory}
          onDragEnd={({ data }) => persistCategoryOrder(data)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Text style={styles.hint}>{t('manage_categories:category_hint')}</Text>}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openNameModal('add-cat', null, '', t('manage_categories:add_category'))}
              disabled={busy}
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.addBtnText}>{t('manage_categories:add_category')}</Text>
            </TouchableOpacity>
          }
        />
      )}

      <CategoryColorPicker
        visible={pickerCat !== null}
        value={pickerCat?.color || '#607D8B'}
        title={pickerCat ? categoryLabel(pickerCat, t) : ''}
        onSelect={(color) => colorPickerCatId && setCategoryColor(colorPickerCatId, color)}
        onClose={() => setColorPickerCatId(null)}
      />

      {/* Name input modal (add / rename) */}
      <Modal visible={nameModal !== null} transparent animationType="fade" onRequestClose={() => setNameModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{nameModal?.title}</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={t('manage_categories:name_placeholder')}
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setNameModal(null)}>
                <Text style={styles.modalCancelText}>{t('manage_categories:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, !nameInput.trim() && { opacity: 0.5 }]} onPress={submitName} disabled={!nameInput.trim()}>
                <Text style={styles.modalSaveText}>{t('manage_categories:save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { justifyContent: 'center', alignItems: 'center' },
    deniedText: { fontSize: 16, color: colors.text, textAlign: 'center', marginHorizontal: 32 },
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
    backButton: { padding: 8, width: 40 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 'bold', color: colors.text },
    listContent: { padding: 12, paddingBottom: 40 },
    hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, paddingHorizontal: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowActive: { borderColor: colors.primary, boxShadow: '0px 2px 8px rgba(0,0,0,0.25)', elevation: 4 },
    dragHandle: { paddingHorizontal: 4, paddingVertical: 6 },
    swatch: { width: 26, height: 26, borderRadius: 13, marginHorizontal: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
    rowLabelArea: { flex: 1, paddingRight: 8 },
    rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
    badgeText: { fontSize: 11, color: colors.textSecondary },
    caption: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
    iconBtn: { padding: 6, width: 32, alignItems: 'center' },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary,
    },
    addBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    primaryBtn: { marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    primaryBtnText: { color: '#fff', fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
    modalCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.background,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
    modalCancel: { paddingHorizontal: 18, paddingVertical: 10 },
    modalCancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
    modalSave: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
    modalSaveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  });
