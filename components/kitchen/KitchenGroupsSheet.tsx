import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import GlassActionSheet, { type GlassAction } from '@/components/GlassActionSheet';
import { GlassTextInput } from '@/components/content/FormKit';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';
import {
  fetchKitchenGroups,
  upsertKitchenGroup,
  deleteKitchenGroup,
  reorderKitchenGroups,
  type KitchenGroup,
} from '@/hooks/useKitchenRecipes';

/**
 * KitchenGroupsSheet — manage one section's recipe groups (s91): rows with a
 * grabber · name · "n recipes" · ⋯ (Rename / Delete), a pinned "+ Add group"
 * row, and hold-to-reorder through DraggableFlatList inside a SIZED nested
 * GestureHandlerRootView (a Modal is its own native hierarchy, so the app
 * root's handler does not reach in; the maxHeight + flexShrink pair is what
 * lets the list give height back under the sheet's 88% cap).
 *
 * Deleting a group leaves its recipes in the book, ungrouped (the server's
 * rule). `onChanged()` fires after every successful write.
 */
export type KitchenGroupsSection = 'prep' | 'desserts' | 'banquets';

export interface KitchenGroupsSheetProps {
  visible: boolean;
  onClose: () => void;
  section: KitchenGroupsSection;
  onChanged: () => void;
}

type NameSheetState = { mode: 'add' } | { mode: 'rename'; group: KitchenGroup } | null;

/** The add / rename prompt — module-level so it never remounts mid-keystroke. */
function GroupNameSheet({
  state,
  onClose,
  onSubmit,
  busy,
}: {
  state: NameSheetState;
  onClose: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const sessionKey = state === null ? '' : state.mode === 'add' ? 'add' : `rename:${state.group.id}`;

  useEffect(() => {
    if (state === null) return;
    setName(state.mode === 'rename' ? state.group.name : '');
    setError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const submit = () => {
    if (!name.trim()) {
      setError(true);
      return;
    }
    onSubmit(name.trim());
  };

  return (
    <GlassSheet
      visible={state !== null}
      onClose={onClose}
      title={state?.mode === 'rename' ? t('kitchen_editor.rename_group') : t('kitchen_editor.add_group')}
      footer={
        <View style={styles.footerRow}>
          <Pressable style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={onClose} disabled={busy}>
            <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }, busy && styles.footerBtnDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color={colors.fireText} /> : <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('common.save')}</Text>}
          </Pressable>
        </View>
      }
    >
      <GlassTextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (v.trim()) setError(false);
        }}
        placeholder={t('kitchen_editor.group_name_placeholder')}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        style={error ? { borderColor: colors.primary } : undefined}
      />
      {error && <Text style={[styles.error, { color: colors.primary }]}>{t('kitchen_editor.group_name_required')}</Text>}
    </GlassSheet>
  );
}

export default function KitchenGroupsSheet({ visible, onClose, section, onChanged }: KitchenGroupsSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { height: winH } = useWindowDimensions();
  const { user } = useAuth();
  const uid = user?.id;

  const [groups, setGroups] = useState<KitchenGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuGroup, setMenuGroup] = useState<KitchenGroup | null>(null);
  const [nameSheet, setNameSheet] = useState<NameSheetState>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      setGroups(await fetchKitchenGroups(uid, section));
    } catch (e: any) {
      console.error('KitchenGroupsSheet load error:', e);
      Alert.alert(t('common.error'), translateServerError(e, t('kitchen_editor.groups_load_failed')));
    }
  }, [uid, section, t]);

  useEffect(() => {
    if (!visible) return;
    setMenuGroup(null);
    setNameSheet(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, load]);

  // The nested root's ceiling: the sheet's 88% cap minus title + footer.
  const dragWrapStyle = useMemo(() => ({ maxHeight: Math.max(260, winH * 0.88 - 196), flexShrink: 1 as const }), [winH]);

  const write = async (fn: () => Promise<void>, fallback: string) => {
    if (!uid || busy) return false;
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (e: any) {
      console.error('KitchenGroupsSheet write error:', e);
      Alert.alert(t('common.error'), translateServerError(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitName = async (name: string) => {
    if (!uid || nameSheet === null) return;
    const groupId = nameSheet.mode === 'rename' ? nameSheet.group.id : undefined;
    const done = await write(async () => {
      await upsertKitchenGroup(uid, section, name, groupId);
    }, t('kitchen_editor.group_save_failed'));
    if (done) setNameSheet(null);
  };

  const confirmDelete = (g: KitchenGroup) => {
    Alert.alert(t('kitchen_editor.delete_group_title'), t('kitchen_editor.delete_group_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (!uid) return;
          void write(async () => {
            await deleteKitchenGroup(uid, g.id);
          }, t('kitchen_editor.group_save_failed'));
        },
      },
    ]);
  };

  const onDragEnd = (data: KitchenGroup[]) => {
    const nextIds = data.map((g) => g.id);
    const unchanged = nextIds.length === groups.length && nextIds.every((id, i) => id === groups[i].id);
    if (unchanged) return;
    setGroups(data);
    if (!uid) return;
    void write(async () => {
      await reorderKitchenGroups(uid, nextIds);
    }, t('kitchen_editor.group_save_failed'));
  };

  const menuActions: GlassAction[] = menuGroup
    ? [
        { key: 'rename', label: t('kitchen_editor.rename_group'), iosIcon: 'pencil', androidIcon: 'edit', onPress: () => setNameSheet({ mode: 'rename', group: menuGroup }) },
        { key: 'delete', label: t('common.delete'), iosIcon: 'trash', androidIcon: 'delete', destructive: true, onPress: () => confirmDelete(menuGroup) },
      ]
    : [];

  const renderRow = ({ item, drag, isActive }: RenderItemParams<KitchenGroup>) => (
    <ScaleDecorator>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: isActive ? 0.9 : 1 }]}>
        <Pressable onLongPress={drag} disabled={isActive || busy} hitSlop={6} style={styles.grabber}>
          <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-handle" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{t('kitchen_editor.group_recipes', { count: item.recipe_count })}</Text>
        <Pressable onPress={() => setMenuGroup(item)} hitSlop={8} style={styles.dots} disabled={busy}>
          <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </ScaleDecorator>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('kitchen_editor.groups_title')}
      subtitle={t('kitchen_editor.groups_subtitle')}
      scroll={false}
      footer={
        <Pressable
          style={[styles.addRow, { borderColor: colors.primary + '6B' }]}
          onPress={() => setNameSheet({ mode: 'add' })}
          disabled={busy || loading}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
          <Text style={[styles.addLabel, { color: colors.primary }]}>{t('kitchen_editor.add_group')}</Text>
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('kitchen_editor.groups_empty')}</Text>
      ) : (
        <GestureHandlerRootView style={dragWrapStyle}>
          <DraggableFlatList
            data={groups}
            keyExtractor={(g) => g.id}
            activationDistance={10}
            contentContainerStyle={styles.dragContent}
            onDragEnd={({ data }) => onDragEnd(data)}
            renderItem={renderRow}
          />
        </GestureHandlerRootView>
      )}

      {/* Nested inside this sheet's Modal tree so iOS presents them above it. */}
      <GlassActionSheet
        visible={menuGroup !== null}
        onClose={() => setMenuGroup(null)}
        title={menuGroup?.name ?? ''}
        subtitle={menuGroup ? t('kitchen_editor.group_recipes', { count: menuGroup.recipe_count }) : undefined}
        actions={menuActions}
      />
      <GroupNameSheet state={nameSheet} onClose={() => setNameSheet(null)} onSubmit={submitName} busy={busy} />
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 36, alignItems: 'center' },
  empty: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18, paddingVertical: 18, textAlign: 'center' },
  dragContent: { gap: 9, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  grabber: { padding: 4 },
  name: { flex: 1, flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  count: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.3 },
  dots: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  addRow: {
    marginTop: 12,
    height: 47,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  footerRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnDisabled: { opacity: 0.6 },
  footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
  error: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 6 },
});
