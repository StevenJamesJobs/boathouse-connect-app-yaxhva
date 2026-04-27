import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

export interface PickedMenuItem {
  source: 'menu_items' | 'weekly_specials';
  id: string;
  name: string;
  category: string;
  priceText: string;
  bucksCost: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: PickedMenuItem) => void;
}

interface RawRow {
  source: 'menu_items' | 'weekly_specials';
  id: string;
  name: string;
  category: string;
  price: string;
}

/**
 * Strict price parser: only accepts a single dollar amount like "$18.99", "12.99",
 * "$5", "5". Rejects ranges ("$16 - $34"), free text ("Market Price"), or anything
 * with multiple numeric tokens. Returns the bucks cost (rounded up).
 */
function parsePriceToBucks(priceText: string): number | null {
  if (!priceText) return null;
  const trimmed = priceText.trim();
  const match = trimmed.match(/^\$?(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

const CATEGORY_PILLS = ['All', 'Weekly Specials', 'Lunch', 'Dinner', 'Libations', 'Wine', 'Happy Hour'];

export function MenuItemSearchPicker({ visible, onClose, onSelect }: Props) {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RawRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [menuRes, specialsRes] = await Promise.all([
          supabase
            .from('menu_items')
            .select('id, name, category, price, is_active')
            .eq('is_active', true),
          (supabase.from('weekly_specials') as any).select('id, name, day_of_week, price'),
        ]);
        if (cancelled) return;
        const menuRows: RawRow[] = ((menuRes.data as any[]) || []).map((r) => ({
          source: 'menu_items',
          id: r.id,
          name: r.name,
          category: r.category,
          price: r.price,
        }));
        const specialRows: RawRow[] = ((specialsRes.data as any[]) || []).map((r) => ({
          source: 'weekly_specials',
          id: r.id,
          name: r.name,
          category: `Weekly Special — ${r.day_of_week}`,
          price: r.price,
        }));
        setRows([...menuRows, ...specialRows]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const filtered = useMemo<PickedMenuItem[]>(() => {
    const q = query.trim().toLowerCase();
    return rows
      .map<PickedMenuItem | null>((r) => {
        const bucks = parsePriceToBucks(r.price);
        if (bucks == null) return null;
        return {
          source: r.source,
          id: r.id,
          name: r.name,
          category: r.category,
          priceText: r.price,
          bucksCost: bucks,
        };
      })
      .filter((r): r is PickedMenuItem => {
        if (r === null) return false;
        // Category filter
        if (activeCategory !== 'All') {
          if (activeCategory === 'Weekly Specials') {
            if (!r.category.startsWith('Weekly Special')) return false;
          } else {
            if (r.category !== activeCategory) return false;
          }
        }
        // Text query
        if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, query, activeCategory]);

  const handleClose = () => {
    setQuery('');
    setActiveCategory('All');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerText, { color: colors.text }]}>Search Menu</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.pillRow}>
            {CATEGORY_PILLS.map((cat) => {
              const active = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.searchRow, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search food, beverages, weekly specials"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
              autoFocus
            />
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => `${item.source}_${item.id}`}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  {query ? 'No matching items.' : 'Start typing to search.'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSelect(item)}
                  style={[styles.row, { backgroundColor: colors.card }]}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.category, { color: colors.textSecondary }]}>{item.category}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={[styles.priceText, { color: colors.textSecondary }]}>{item.priceText}</Text>
                    <Text style={[styles.bucks, { color: colors.primary }]}>${item.bucksCost} bucks</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { height: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerText: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 6 },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  listContent: { paddingHorizontal: 12, paddingBottom: 30 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, gap: 12,
  },
  name: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  category: { fontSize: 12 },
  priceCol: { alignItems: 'flex-end' },
  priceText: { fontSize: 12, marginBottom: 2 },
  bucks: { fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
