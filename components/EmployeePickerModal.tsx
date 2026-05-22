import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface PickedEmployee {
  id: string;
  name: string;
}

interface EmployeePickerModalProps {
  visible: boolean;
  /** When provided, the list is pre-filtered to employees whose job_titles include this role. */
  filterRole?: string | null;
  /** Currently selected employee id, for highlighting. */
  selectedId?: string | null;
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
    card: string;
    border: string;
  };
  onSelect: (employee: PickedEmployee) => void;
  onClose: () => void;
}

interface EmployeeRow {
  id: string;
  name: string;
  job_title: string | null;
  job_titles: string[] | null;
  is_active: boolean;
}

export default function EmployeePickerModal({
  visible,
  filterRole,
  selectedId,
  colors,
  onSelect,
  onClose,
}: EmployeePickerModalProps) {
  const { organizationId } = useOrganization();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [restrictToRole, setRestrictToRole] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, name, job_title, job_titles, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('EmployeePickerModal: fetch error', error);
        setEmployees([]);
      } else {
        setEmployees((data ?? []) as EmployeeRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setRestrictToRole(true);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterRole && restrictToRole) {
      const lowerRole = filterRole.toLowerCase();
      list = list.filter((e) => {
        if (e.job_titles && e.job_titles.length > 0) {
          return e.job_titles.some((t) => t.toLowerCase() === lowerRole);
        }
        return (e.job_title ?? '').toLowerCase() === lowerRole;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [employees, filterRole, restrictToRole, searchQuery]);

  const renderRow = ({ item }: { item: EmployeeRow }) => {
    const isSelected = item.id === selectedId;
    const titles =
      item.job_titles && item.job_titles.length > 0
        ? item.job_titles.join(', ')
        : item.job_title ?? '';
    const rowStyle: StyleProp<ViewStyle> = [
      styles.row,
      { borderBottomColor: colors.border },
      isSelected && { backgroundColor: colors.primary + '15' },
    ];
    return (
      <TouchableOpacity
        style={rowStyle}
        onPress={() => {
          onSelect({ id: item.id, name: item.name });
          onClose();
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
          {titles ? (
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{titles}</Text>
          ) : null}
        </View>
        {isSelected ? (
          <IconSymbol
            ios_icon_name="checkmark"
            android_material_icon_name="check"
            size={18}
            color={colors.primary}
          />
        ) : (
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={16}
            color={colors.textSecondary}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerSide}>
            <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Select Employee</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={18}
            color={colors.textSecondary}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by name"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {filterRole ? (
          <TouchableOpacity
            style={styles.roleToggle}
            onPress={() => setRestrictToRole((v) => !v)}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: colors.primary },
                restrictToRole && { backgroundColor: colors.primary },
              ]}
            >
              {restrictToRole && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={14}
                  color="#FFFFFF"
                />
              )}
            </View>
            <Text style={[styles.roleToggleText, { color: colors.text }]}>
              Only show {filterRole}s
            </Text>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={{ color: colors.textSecondary }}>No matching employees</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 16 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 70 },
  cancelText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 17, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16 },
  roleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleToggleText: { fontSize: 14, fontWeight: '500' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
});
