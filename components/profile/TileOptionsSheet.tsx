/**
 * A tile's options — Simple tile on top, a live preview, Size, the facts it may show, and
 * a red remove row. Local draft until Done. Opens from the editor (the Options chip) and
 * from the hub (a wide tile's ···).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { SegControl, SwitchRow, FieldLabel, GlassToggle } from '@/components/content/FormKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { defForId, FavoriteSize, FavoriteTile, LiveData, SAMPLE_LIVE_DATA } from '@/config/favorites';
import LiveTile from './LiveTile';
import { RED_HUE, hexToRgba } from './profileVisuals';

interface Props {
  visible: boolean;
  onClose: () => void;
  tile: FavoriteTile | null;
  data?: LiveData;
  onChange: (tile: FavoriteTile) => void;
  onRemove: (tile: FavoriteTile) => void;
}

export default function TileOptionsSheet({ visible, onClose, tile, data, onChange, onRemove }: Props) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FavoriteTile | null>(tile);
  useEffect(() => {
    if (visible) setDraft(tile);
  }, [visible, tile]);

  const def = draft ? defForId(draft.id) : undefined;
  const canWide = !!def?.sizes.includes('wide');
  const facts = def?.facts ?? [];
  const preview = useMemo<LiveData>(() => ({ ...SAMPLE_LIVE_DATA, ...(data ?? {}) }), [data]);

  if (!draft || !def) return null;

  const setSimple = (simple: boolean) => setDraft({ ...draft, simple, size: simple ? 'square' : draft.size });
  const setSize = (size: FavoriteSize) => setDraft({ ...draft, size });
  const setFact = (key: string, v: boolean) => setDraft({ ...draft, facts: { ...draft.facts, [key]: v } });
  const done = () => {
    onChange(draft);
    onClose();
  };

  const sizeOptions = [
    { key: 'square' as FavoriteSize, label: t('profile_hub.size_square'), iosIcon: 'square.grid.2x2', androidIcon: 'grid-view' },
    { key: 'wide' as FavoriteSize, label: t('profile_hub.size_wide'), iosIcon: 'rectangle', androidIcon: 'crop-landscape' },
  ];

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('profile_hub.options_title', { name: t(def.labelKey) })}
      subtitle={t('profile_hub.options_sub')}
      footer={
        <TouchableOpacity onPress={done} activeOpacity={0.85} style={[styles.done, { backgroundColor: colors.tint }]}>
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
          <Text style={[styles.doneText, { color: colors.fireText }]}>{t('common.done', 'Done')}</Text>
        </TouchableOpacity>
      }
    >
      <View style={[styles.simple, { backgroundColor: hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#FF7A2F', 0.1), borderColor: hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#FF7A2F', 0.32) }]}>
        <IconSymbol ios_icon_name="square.grid.2x2.fill" android_material_icon_name="grid-view" size={18} color={colors.tint} />
        <View style={styles.simpleBody}>
          <Text style={[styles.simpleTitle, { color: colors.text }]}>{t('profile_hub.simple_tile')}</Text>
          <Text style={[styles.simpleSub, { color: colors.textSecondary }]}>{t('profile_hub.simple_tile_sub')}</Text>
        </View>
        {/* GlassToggle, not Switch: this sheet opens INSIDE the editor sheet, where UISwitch goes dead. */}
        <GlassToggle value={draft.simple} onValueChange={setSimple} />
      </View>

      <View style={[styles.preview, { borderColor: colors.glassBorder }]}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{t('profile_hub.preview')}</Text>
        <LiveTile def={def} tile={draft} data={preview} onPress={() => {}} inert />
      </View>

      {!draft.simple && canWide ? (
        <View>
          <FieldLabel label={t('profile_hub.size')} />
          <SegControl options={sizeOptions} value={draft.size} onChange={setSize} />
        </View>
      ) : null}

      {!draft.simple && facts.length > 0 ? (
        <View style={styles.facts}>
          <FieldLabel label={t('profile_hub.show')} />
          {facts.map((f) => (
            <SwitchRow
              key={f.key}
              iosIcon="circle.fill"
              androidIcon="fiber-manual-record"
              title={t(f.labelKey)}
              subtitle={f.hintKey ? t(f.hintKey) : undefined}
              value={draft.facts[f.key] !== false}
              onValueChange={(v) => setFact(f.key, v)}
              native={false}
            />
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          onRemove(draft);
          onClose();
        }}
        activeOpacity={0.85}
        style={[styles.remove, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
      >
        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color={RED_HUE[resolvedMode]} />
        <Text style={[styles.removeText, { color: RED_HUE[resolvedMode] }]}>{t('profile_hub.remove_favorite')}</Text>
      </TouchableOpacity>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  simple: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderRadius: 13, borderWidth: 1 },
  simpleBody: { flex: 1, minWidth: 0 },
  simpleTitle: { fontFamily: fonts.display.semibold, fontSize: 14 },
  simpleSub: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  preview: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 10, gap: 6 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  facts: { gap: 8 },
  remove: { height: 47, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  removeText: { fontFamily: fonts.body.semibold, fontSize: 15 },
  done: { height: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  doneText: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
