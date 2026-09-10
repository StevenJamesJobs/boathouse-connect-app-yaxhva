import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgDirectory, type OrgDirectoryRow } from '@/utils/orgDirectory';
import { initialsOf } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

export interface PickedEmployee {
  id: string;
  name: string;
}

export interface EmployeePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** null = the Unassign row (only offered when `allowUnassign`) */
  onSelect: (employee: PickedEmployee | null) => void;
  selectedId?: string | null;
  /** pre-filter to holders of this job title; the sheet offers "Show everyone" */
  filterRole?: string | null;
  allowUnassign?: boolean;
  /** userId → the schedule name already assigned to them (the review page's warning line) */
  assignedNames?: Record<string, string>;
  title?: string;
}

/**
 * EmployeePickerSheet (s83) — the glass replacement for EmployeePickerModal:
 * search + the org directory, filtered to a job title when the shift has one.
 * scroll={false}: the FlatList is the only scroller (a list inside GlassSheet's
 * ScrollView would fight it), sized with an explicit max height + flexShrink so
 * it can never collapse to zero inside the content-sized sheet body.
 */
export default function EmployeePickerSheet({
  visible,
  onClose,
  onSelect,
  selectedId,
  filterRole,
  allowUnassign = false,
  assignedNames,
  title,
}: EmployeePickerSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [rows, setRows] = useState<OrgDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [everyone, setEveryone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setEveryone(false);
    let alive = true;
    (async () => {
      setLoading(true);
      const dir = await getOrgDirectory(user?.id);
      if (!alive) return;
      setRows(dir.filter((r) => r.is_active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [visible, user?.id]);

  const roleLc = (filterRole || '').trim().toLowerCase();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleLc && !everyone) {
        const titles = (r.job_titles && r.job_titles.length ? r.job_titles : r.job_title ? [r.job_title] : []).map((x) => x.toLowerCase());
        if (!titles.includes(roleLc)) return false;
      }
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, roleLc, everyone]);

  const renderItem = ({ item }: { item: OrgDirectoryRow }) => {
    const on = item.id === selectedId;
    const assignedTo = assignedNames?.[item.id];
    const titles = item.job_titles && item.job_titles.length ? item.job_titles.join(' · ') : item.job_title || '';
    return (
      <Pressable
        onPress={() => onSelect({ id: item.id, name: item.name || '' })}
        style={[styles.item, { borderTopColor: colors.hairline }, on && { backgroundColor: colors.primary + '1A' }]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary + '2E' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(item.name)}</Text>
        </View>
        <View style={styles.itemBody}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {!!titles && <Text style={[styles.itemSub, { color: colors.textSecondary }]} numberOfLines={1}>{titles}</Text>}
          {!!assignedTo && (
            <Text style={[styles.itemWarn, { color: colors.primary }]} numberOfLines={1}>
              {t('shift_edit.already_assigned', { name: assignedTo })}
            </Text>
          )}
        </View>
        {on && <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={18} color={colors.primary} />}
      </Pressable>
    );
  };

  return (
    <GlassSheet visible={visible} onClose={onClose} title={title ?? t('shift_edit.pick_employee')} scroll={false}>
      <View style={[styles.search, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={16} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('shift_edit.search_employees')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {!!roleLc && (
        <Pressable onPress={() => setEveryone((v) => !v)} style={styles.filterLine}>
          <Text style={[styles.filterText, { color: colors.textSecondary }]}>
            {everyone ? t('shift_edit.showing_everyone') : t('shift_edit.showing_role', { role: filterRole })}
          </Text>
          <Text style={[styles.filterLink, { color: colors.primary }]}>
            {everyone ? t('shift_edit.only_role', { role: filterRole }) : t('shift_edit.show_everyone')}
          </Text>
        </Pressable>
      )}

      <View style={styles.listWrap}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              allowUnassign ? (
                <Pressable onPress={() => onSelect(null)} style={[styles.item, styles.unassign]}>
                  <View style={[styles.avatar, { backgroundColor: colors.glass }]}>
                    <IconSymbol ios_icon_name="person.slash" android_material_icon_name="person-off" size={16} color={colors.textSecondary} />
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{t('shift_edit.unassign')}</Text>
                    <Text style={[styles.itemSub, { color: colors.textSecondary }]}>{t('shift_edit.unassign_sub')}</Text>
                  </View>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('shift_edit.no_matches')}</Text>
            }
          />
        )}
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  searchInput: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, paddingVertical: 10 },
  filterLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  filterText: { fontFamily: fonts.body.regular, fontSize: 11.5, flexShrink: 1 },
  filterLink: { fontFamily: fonts.body.semibold, fontSize: 11.5, marginLeft: 8 },
  // explicit size — a flex:1 list inside a content-sized sheet body collapses to zero
  listWrap: { maxHeight: 420, flexShrink: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  unassign: { borderTopWidth: 0 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 12 },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: fonts.body.semibold, fontSize: 14 },
  itemSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 1 },
  itemWarn: { fontFamily: fonts.body.medium, fontSize: 11, marginTop: 2 },
  empty: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
