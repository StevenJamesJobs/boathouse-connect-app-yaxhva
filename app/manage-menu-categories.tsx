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
import { translateTexts, saveTranslations } from '@/utils/translateContent';
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
  const { organizationId, organization } = useOrganization();
  const perMenu = organization?.menu_category_scope === 'per_menu';
  // In per-menu scope the owner edits one menu's tree at a time (slot 1 / 2).
  const [editSlot, setEditSlot] = useState<1 | 2>(1);
  const { categories: hookCats, loading, refresh } = useMenuCategories({ includeHidden: true, menuSlot: editSlot });

  // Local mirror so drag-reorder is snappy; re-synced whenever the hook reloads.
  const [cats, setCats] = useState<MenuCategory[]>([]);
  useEffect(() => setCats(hookCats), [hookCats]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [colorPickerCatId, setColorPickerCatId] = useState<string | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: NameMode; id: string | null; title: string } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameInputEs, setNameInputEs] = useState('');
  const [translating, setTranslating] = useState(false);
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
  // Returns the RPC's JSON payload on success (so callers can read e.g. the new
  // row's `id`), or null on failure. Success with no JSON body resolves to {}.
  const callRpc = async (fn: string, args: Record<string, any>, doRefresh = true): Promise<any | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)(fn, args);
      if (error) {
        Alert.alert(t('common:error'), error.message);
        return null;
      }
      if (data && data.success === false) {
        Alert.alert(t('common:error'), data.error || 'Action failed');
        return null;
      }
      if (doRefresh) await refresh();
      return data ?? {};
    } catch (e: any) {
      Alert.alert(t('common:error'), e?.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  // --- Name modal ----------------------------------------------------------
  const openNameModal = (mode: NameMode, id: string | null, initial: string, title: string, initialEs = '') => {
    setNameModal({ mode, id, title });
    setNameInput(initial);
    setNameInputEs(initialEs);
  };

  // Auto-translate the English name into the Spanish field (reuses the menu-item
  // name_es pattern: translate-text Edge Function via translateTexts).
  const handleTranslateName = async () => {
    const src = nameInput.trim();
    if (!src) return;
    setTranslating(true);
    try {
      const [es] = await translateTexts([src]);
      setNameInputEs(es || '');
    } finally {
      setTranslating(false);
    }
  };

  const submitName = async () => {
    if (!nameModal) return;
    const value = nameInput.trim();
    if (!value) return;
    const es = nameInputEs.trim();
    const m = nameModal;
    setNameModal(null);

    let res: any = null;
    let targetId: string | null = null;
    let table: 'menu_categories' | 'menu_subcategories' = 'menu_categories';

    if (m.mode === 'add-cat') {
      res = await callRpc('manage_menu_category_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_display_name: value,
        p_menu_slot: perMenu ? editSlot : 0,
      }, false);
      table = 'menu_categories';
      targetId = res?.id ?? null;
    } else if (m.mode === 'rename-cat') {
      res = await callRpc('manage_menu_category_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_new_name: value,
      }, false);
      table = 'menu_categories';
      targetId = res ? m.id : null;
    } else if (m.mode === 'add-sub') {
      res = await callRpc('manage_menu_subcategory_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_display_name: value,
      }, false);
      table = 'menu_subcategories';
      targetId = res?.id ?? null;
    } else if (m.mode === 'rename-sub') {
      res = await callRpc('manage_menu_subcategory_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_subcategory_id: m.id,
        p_new_name: value,
      }, false);
      table = 'menu_subcategories';
      targetId = res ? m.id : null;
    }

    // Write the Spanish override only when the English create/rename succeeded
    // (empty `es` clears it via saveTranslations → null).
    if (targetId) {
      await saveTranslations(table, targetId, { display_name_es: es }, organizationId);
    }
    await refresh();
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

  // Mark/unmark a Libations subcategory as recipe-backed (fed by the cocktail
  // recipe editors). Only valid under the Libations category (enforced by RPC).
  const toggleSubCocktailFed = (sub: MenuSubcategory) =>
    callRpc('manage_menu_subcategory_set_cocktail_fed', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_is_cocktail_fed: !sub.is_cocktail_fed,
    });

  const switchEditSlot = (slot: 1 | 2) => {
    setSelectedCategoryId(null);
    setEditSlot(slot);
  };

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
            {item.display_name_es ? (
              <Text style={styles.esCaption} numberOfLines={1}>{t('manage_categories:es_caption', { name: item.display_name_es })}</Text>
            ) : null}
            {builtIn && (
              <View style={styles.badge}>
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.textSecondary} />
                <Text style={styles.badgeText}>{t('manage_categories:built_in')}</Text>
              </View>
            )}
            {item.system_key && BEHAVIOR_CAPTION_KEY[item.system_key] &&
              !(perMenu && (item.system_key === 'cat.lunch' || item.system_key === 'cat.dinner')) && (
              <Text style={styles.caption}>{t(BEHAVIOR_CAPTION_KEY[item.system_key])}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => openNameModal('rename-cat', item.id, item.display_name, t('manage_categories:rename_category'), item.display_name_es || '')} style={styles.iconBtn} disabled={busy}>
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
            // Built-in category — a grey lock marks it as undeletable (hide instead).
            <View style={styles.iconBtn}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={colors.textSecondary} />
            </View>
          )}
          <TouchableOpacity onPress={() => setSelectedCategoryId(item.id)} style={styles.iconBtn}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  const renderSub = ({ item, drag, isActive }: RenderItemParams<MenuSubcategory>) => {
    const locked = item.is_cocktail_fed; // drives the "Linked to recipes" badge
    // Deletion is blocked server-side for built-in (system_key) subs AND for any
    // recipe-linked sub. Mirror that here so we don't show a trash button that
    // would just error — e.g. on a built-in cocktail sub that's been unlinked.
    const canDelete = item.system_key === null && !item.is_cocktail_fed;
    return (
      <ScaleDecorator>
        <View style={[styles.row, { opacity: item.is_hidden ? 0.5 : 1 }, isActive && styles.rowActive]}>
          <TouchableOpacity onLongPress={drag} disabled={busy} style={styles.dragHandle}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.rowLabelArea}>
            <Text style={styles.rowLabel} numberOfLines={1}>{subcategoryLabel(item, t)}</Text>
            {item.display_name_es ? (
              <Text style={styles.esCaption} numberOfLines={1}>{t('manage_categories:es_caption', { name: item.display_name_es })}</Text>
            ) : null}
            {locked && (
              <View style={styles.badge}>
                <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={11} color={colors.textSecondary} />
                <Text style={styles.badgeText}>{t('manage_categories:linked_to_recipes')}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={() => openNameModal('rename-sub', item.id, item.display_name, t('manage_categories:rename_subcategory'), item.display_name_es || '')} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
          </TouchableOpacity>
          {selectedCategory?.system_key === 'cat.libations' && (
            <TouchableOpacity
              onPress={() => toggleSubCocktailFed(item)}
              style={[styles.iconBtn, item.is_cocktail_fed && styles.iconBtnLinked]}
              disabled={busy || item.system_key !== null}
              accessibilityLabel={t('manage_categories:recipe_backed_toggle')}
            >
              {/* Filled link-circle = recipe-linked (on); hollow link-circle =
                  not linked (off). Distinct glyph per state (iOS has no broken-
                  chain symbol; filled-vs-hollow reads clearly + always renders).
                  Android uses link / link-off (chain / broken chain). */}
              <IconSymbol
                ios_icon_name={item.is_cocktail_fed ? 'link.circle.fill' : 'link.circle'}
                android_material_icon_name={item.is_cocktail_fed ? 'link' : 'link-off'}
                size={22}
                color={item.is_cocktail_fed ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => toggleSubHidden(item)} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name={item.is_hidden ? 'eye.slash' : 'eye'} android_material_icon_name={item.is_hidden ? 'visibility-off' : 'visibility'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {canDelete ? (
            <TouchableOpacity onPress={() => deleteSub(item)} style={styles.iconBtn} disabled={busy}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#E53935" />
            </TouchableOpacity>
          ) : item.system_key !== null ? (
            // Locked (built-in) sub — a grey lock marks it as undeletable.
            <View style={styles.iconBtn}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={colors.textSecondary} />
            </View>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
      </ScaleDecorator>
    );
  };

  // --- Bulleted hints (inline icons) ---------------------------------------
  const hintIcon = (ios: string, android: string, color?: string) => (
    <IconSymbol ios_icon_name={ios} android_material_icon_name={android} size={15} color={color || colors.textSecondary} />
  );
  const hintRow = (key: string, icons: React.ReactNode, text: string) => (
    <View key={key} style={styles.hintRow}>
      <View style={styles.hintIconCol}>{icons}</View>
      <Text style={styles.hintRowText}>{text}</Text>
    </View>
  );

  const categoryHint = (
    <View style={styles.hintBlock}>
      {hintRow('drag', hintIcon('line.3.horizontal', 'drag-indicator'), t('manage_categories:hint_drag'))}
      {hintRow('tap', hintIcon('chevron.right', 'chevron-right'), t('manage_categories:hint_tap_open'))}
      {hintRow('edit', <>{hintIcon('pencil', 'edit', colors.primary)}{hintIcon('eye', 'visibility')}</>, t('manage_categories:hint_builtin_edit'))}
      {hintRow('del', hintIcon('trash', 'delete', '#E53935'), t('manage_categories:hint_delete_custom'))}
    </View>
  );

  const isLibSub = selectedCategory?.system_key === 'cat.libations';
  const subcategoryHint = (
    <View style={styles.hintBlock}>
      {hintRow('drag', hintIcon('line.3.horizontal', 'drag-indicator'), t('manage_categories:hint_drag'))}
      {hintRow('edit', <>{hintIcon('pencil', 'edit', colors.primary)}{hintIcon('eye', 'visibility')}</>, t('manage_categories:hint_sub_edit'))}
      {isLibSub && hintRow('recipe', hintIcon('link.circle.fill', 'link', colors.primary), t('manage_categories:hint_recipe_backed', { menu1: organization?.menu_1_name || 'Menu 1', menu2: organization?.menu_2_name || 'Menu 2' }))}
      {hintRow('del', hintIcon('trash', 'delete', '#E53935'), t('manage_categories:hint_sub_delete'))}
      {isLibSub && hintRow('locked', hintIcon('lock.fill', 'lock'), t('manage_categories:hint_recipe_locked'))}
    </View>
  );

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
        {/* Context-aware add: a subcategory when inside a category, otherwise a
            category. Always reachable even when the hint text is long. */}
        <TouchableOpacity
          onPress={() =>
            inSubview
              ? openNameModal('add-sub', selectedCategory!.id, '', t('manage_categories:add_subcategory'))
              : openNameModal('add-cat', null, '', t('manage_categories:add_category'))
          }
          style={styles.backButton}
          disabled={busy}
          accessibilityLabel={inSubview ? t('manage_categories:add_subcategory') : t('manage_categories:add_category')}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
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
          ListHeaderComponent={subcategoryHint}
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
          ListHeaderComponent={
            <>
              {perMenu && (
                <View style={styles.slotToggle}>
                  <TouchableOpacity
                    style={[styles.slotSeg, editSlot === 1 && styles.slotSegActive]}
                    onPress={() => switchEditSlot(1)}
                    disabled={busy}
                  >
                    <Text style={[styles.slotSegText, editSlot === 1 && styles.slotSegTextActive]} numberOfLines={1}>
                      {organization?.menu_1_name || 'Menu 1'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.slotSeg, editSlot === 2 && styles.slotSegActive]}
                    onPress={() => switchEditSlot(2)}
                    disabled={busy}
                  >
                    <Text style={[styles.slotSegText, editSlot === 2 && styles.slotSegTextActive]} numberOfLines={1}>
                      {organization?.menu_2_name || 'Menu 2'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {categoryHint}
            </>
          }
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
              returnKeyType="next"
            />
            <View style={styles.esHeaderRow}>
              <Text style={styles.esFieldLabel}>{t('manage_categories:spanish_name_label')}</Text>
              <TouchableOpacity
                style={[styles.translateBtn, (!nameInput.trim() || translating) && styles.translateBtnDisabled]}
                onPress={handleTranslateName}
                disabled={!nameInput.trim() || translating}
              >
                {translating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.translateBtnText}>{t('manage_categories:translate_button')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, styles.esInput]}
              value={nameInputEs}
              onChangeText={setNameInputEs}
              placeholder={t('manage_categories:spanish_name_placeholder')}
              placeholderTextColor={colors.textSecondary}
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
    listContent: { padding: 12, paddingBottom: 120 },
    hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, paddingHorizontal: 4 },
    hintBlock: { marginBottom: 12, gap: 8, paddingHorizontal: 4 },
    hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    hintIconCol: { width: 40, flexDirection: 'row', gap: 4, alignItems: 'center', paddingTop: 1 },
    hintRowText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    slotToggle: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    slotSeg: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    slotSegActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    slotSegText: { fontSize: 14, fontWeight: '600', color: colors.text },
    slotSegTextActive: { color: colors.fireText },
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
    esCaption: { fontSize: 11, color: colors.primary, marginTop: 2 },
    iconBtn: { padding: 6, width: 32, alignItems: 'center' },
    iconBtnLinked: { backgroundColor: colors.primary + '1F', borderRadius: 8 },
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
    primaryBtnText: { color: colors.fireText, fontWeight: '700' },
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
    esHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
    esFieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    translateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      minWidth: 96,
      minHeight: 30,
    },
    translateBtnDisabled: { opacity: 0.5 },
    translateBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    esInput: { marginTop: 0 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
    modalCancel: { paddingHorizontal: 18, paddingVertical: 10 },
    modalCancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
    modalSave: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
    modalSaveText: { fontSize: 15, color: colors.fireText, fontWeight: '700' },
  });
