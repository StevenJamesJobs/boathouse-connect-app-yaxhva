/**
 * Lays the favorites out as the mosaic: wide tiles take a row, squares pair up. Also the
 * new-user empty state (a faded sample of three tiles + the invitation).
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { defForId, FavoriteTile, LiveData, SAMPLE_LIVE_DATA } from '@/config/favorites';
import LiveTile from './LiveTile';
import { GRID_GAP } from './profileVisuals';

interface Props {
  tiles: FavoriteTile[];
  data: LiveData;
  onNavigate: (route: string) => void;
  onOptions: (tile: FavoriteTile) => void;
}

type Row = FavoriteTile[];

export function layoutRows(tiles: FavoriteTile[]): Row[] {
  const rows: Row[] = [];
  let pending: FavoriteTile[] = [];
  for (const t of tiles) {
    const def = defForId(t.id);
    if (!def) continue;
    const wide = t.size === 'wide' && !t.simple && def.sizes.includes('wide');
    if (wide) {
      if (pending.length) { rows.push(pending); pending = []; }
      rows.push([t]);
    } else {
      pending.push(t);
      if (pending.length === 2) { rows.push(pending); pending = []; }
    }
  }
  if (pending.length) rows.push(pending);
  return rows;
}

export default function FavoritesGrid({ tiles, data, onNavigate, onOptions }: Props) {
  const rows = useMemo(() => layoutRows(tiles), [tiles]);
  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((tile) => {
            const def = defForId(tile.id)!;
            const wide = row.length === 1 && tile.size === 'wide' && !tile.simple && def.sizes.includes('wide');
            return (
              <LiveTile
                key={tile.id}
                def={def}
                tile={tile}
                data={data}
                onPress={onNavigate}
                onOptions={wide ? () => onOptions(tile) : undefined}
                style={wide ? styles.wide : styles.square}
              />
            );
          })}
          {row.length === 1 && !(row[0].size === 'wide' && !row[0].simple) ? <View style={styles.square} /> : null}
        </View>
      ))}
    </View>
  );
}

const SAMPLE: FavoriteTile[] = [
  { id: 'tips', size: 'wide', simple: false, facts: { weekTotal: true, avg: true, verdict: false, logTonight: false } },
  { id: 'weekly-quizzes', size: 'square', simple: true, facts: {} },
  { id: 'guides-training', size: 'square', simple: true, facts: {} },
];
const SAMPLE_MGR: FavoriteTile[] = [
  { id: 'schedule-approvals', size: 'wide', simple: false, facts: { preview: true } },
  { id: 'todays-roster', size: 'square', simple: true, facts: {} },
  { id: 'announcement-editor', size: 'square', simple: true, facts: {} },
];

export function FavoritesEmpty({ manager, onAdd }: { manager: boolean; onAdd: () => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const sample = manager ? SAMPLE_MGR : SAMPLE;
  return (
    <View style={[styles.empty, { borderColor: colors.glassBorder, backgroundColor: colors.surface }]}>
      <View style={styles.ghost} pointerEvents="none">
        {layoutRows(sample).map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((tile) => (
              <LiveTile
                key={tile.id}
                def={defForId(tile.id)!}
                tile={tile}
                data={SAMPLE_LIVE_DATA}
                onPress={() => {}}
                inert
                style={row.length === 1 && tile.size === 'wide' ? styles.wide : styles.square}
              />
            ))}
          </View>
        ))}
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('profile_hub.empty_title')}</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{t('profile_hub.empty_body')}</Text>
      <TouchableOpacity onPress={onAdd} activeOpacity={0.85} style={[styles.addBtn, { backgroundColor: colors.tint }]}>
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.fireText} />
        <Text style={[styles.addText, { color: colors.fireText }]}>{t('profile_hub.empty_add')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: GRID_GAP },
  row: { flexDirection: 'row', gap: GRID_GAP },
  square: { flex: 1, minWidth: 0 },
  wide: { flex: 1 },
  empty: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 14, paddingBottom: 16, alignItems: 'center', gap: 12 },
  ghost: { width: '100%', gap: 8, opacity: 0.55 },
  emptyTitle: { fontFamily: fonts.display.bold, fontSize: 17, letterSpacing: -0.3, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center', maxWidth: 290 },
  addBtn: { height: 44, minWidth: 200, paddingHorizontal: 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addText: { fontFamily: fonts.body.semibold, fontSize: 14 },
});
