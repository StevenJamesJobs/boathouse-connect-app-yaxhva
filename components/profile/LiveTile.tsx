/**
 * A Favorites tile. Square = the CommandTile grammar (icon · title · one live line · badge or
 * chevron); wide = head (icon · eyebrow · ···) + body (big number · facts column · chip).
 * The whole face navigates; only the chip and the ··· do something else. Colours come from
 * the tile's family accent through the tinted-glass alphas.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { AttentionRing } from '@/components/tools/ToolsBits';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import type { FavoriteDef, FavoriteTile, LiveData } from '@/config/favorites';
import { favoriteAccent, hexToRgba, TILE_BG_ALPHA, TILE_BORDER_ALPHA, TILE_RADIUS, SQUARE_MIN_HEIGHT } from './profileVisuals';

interface Props {
  def: FavoriteDef;
  tile: FavoriteTile;
  data: LiveData;
  onPress: (route: string) => void;
  onOptions?: () => void;
  style?: StyleProp<ViewStyle>;
  /** editor previews: no press handling */
  inert?: boolean;
}

export default function LiveTile({ def, tile, data, onPress, onOptions, style, inert }: Props) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { t } = useTranslation();
  const acc = favoriteAccent(def.accent, colors, resolvedMode);
  const bg = hexToRgba(acc, TILE_BG_ALPHA[resolvedMode]);
  const bd = hexToRgba(acc, TILE_BORDER_ALPHA[resolvedMode]);
  const att = def.attention?.(data) ?? null;
  const badge = att?.badge ?? 0;
  const pulse = !!att?.pulse;
  const wide = tile.size === 'wide' && !tile.simple && def.sizes.includes('wide');

  const Wrap: React.ComponentType<any> = inert ? View : TouchableOpacity;
  const wrapProps = inert ? {} : { activeOpacity: 0.85, onPress: () => onPress(def.route) };

  if (!wide) {
    const line = def.line?.(data, t) ?? null;
    return (
      <Wrap {...wrapProps} style={[styles.square, { backgroundColor: bg, borderColor: bd }, style]}>
        <AttentionRing active={pulse} color={acc} radius={TILE_RADIUS} />
        <IconSymbol ios_icon_name={def.iosIcon} android_material_icon_name={def.androidIcon} size={20} color={acc} />
        <View style={styles.squareBody}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {t(def.labelKey)}
          </Text>
          {line ? (
            <Text style={[styles.line, { color: colors.text }]} numberOfLines={1}>
              {line.parts.map((p, i) => (
                <Text key={i} style={p.strong ? { color: acc, fontFamily: fonts.mono.semibold } : undefined}>
                  {p.text}
                </Text>
              ))}
            </Text>
          ) : null}
        </View>
        {badge > 0 ? (
          <View style={[styles.bub, { backgroundColor: acc }]}>
            <Text style={styles.bubText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : (
          <View style={styles.chev}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
          </View>
        )}
      </Wrap>
    );
  }

  const body = def.body?.(data, t) ?? null;
  const kv = (body?.kv ?? []).filter((r) => tile.facts[r.key] !== false).slice(0, 3);
  return (
    <Wrap {...wrapProps} style={[styles.wide, { backgroundColor: bg, borderColor: bd }, style]}>
      <AttentionRing active={pulse} color={acc} radius={TILE_RADIUS} />
      <View style={styles.head}>
        <IconSymbol ios_icon_name={def.iosIcon} android_material_icon_name={def.androidIcon} size={18} color={acc} />
        <Text style={[styles.eyebrow, { color: acc }]} numberOfLines={1}>
          {t(def.labelKey)}
        </Text>
        {onOptions && !inert ? (
          <TouchableOpacity onPress={onOptions} hitSlop={8} style={[styles.opt, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.optText, { color: colors.textSecondary }]}>···</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {body ? (
        <View style={styles.body}>
          <View>
            <Text style={[styles.big, { color: acc }]} numberOfLines={1}>
              {body.big}
            </Text>
            {body.small ? (
              <Text style={[styles.small, { color: colors.textSecondary }]} numberOfLines={1}>
                {body.small}
              </Text>
            ) : null}
          </View>
          <View style={styles.kv}>
            {kv.map((r, i) => (
              <Text key={`${r.key}-${i}`} style={[styles.kvLine, { color: colors.textSecondary }]} numberOfLines={1}>
                {r.label} <Text style={{ color: colors.text, fontFamily: fonts.mono.semibold }}>{r.value}</Text>
              </Text>
            ))}
          </View>
          {body.chip && (tile.facts.logTonight !== false || def.id !== 'tips') ? (
            <TouchableOpacity
              disabled={inert}
              onPress={() => onPress(body.chip!.route ?? def.route)}
              activeOpacity={0.85}
              style={[styles.chip, { backgroundColor: acc }]}
            >
              {body.chip.iosIcon ? (
                <IconSymbol ios_icon_name={body.chip.iosIcon} android_material_icon_name={body.chip.androidIcon || 'chevron-right'} size={13} color="#FFFFFF" />
              ) : null}
              <Text style={styles.chipText} numberOfLines={1}>
                {body.chip.label}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.loading, { color: colors.textSecondary }]}>{t('profile_hub.tile_loading')}</Text>
      )}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  square: { borderRadius: TILE_RADIUS, borderWidth: 1, padding: 12, minHeight: SQUARE_MIN_HEIGHT, justifyContent: 'space-between', position: 'relative' },
  squareBody: { marginTop: 8 },
  title: { fontFamily: fonts.display.semibold, fontSize: 15, lineHeight: 17 },
  line: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 4 },
  bub: { position: 'absolute', top: 10, right: 10, minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bubText: { fontFamily: fonts.mono.semibold, fontSize: 10, color: '#FFFFFF' },
  chev: { position: 'absolute', top: 12, right: 12 },
  wide: { borderRadius: TILE_RADIUS, borderWidth: 1, padding: 12, position: 'relative' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  opt: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optText: { fontFamily: fonts.body.semibold, fontSize: 13, letterSpacing: 1, lineHeight: 15 },
  body: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 8 },
  big: { fontFamily: fonts.display.bold, fontSize: 28, letterSpacing: -0.6, lineHeight: 30 },
  small: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 },
  kv: { flex: 1, minWidth: 0, gap: 3 },
  kvLine: { fontFamily: fonts.mono.medium, fontSize: 10.5 },
  chip: { height: 30, paddingHorizontal: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12, color: '#FFFFFF' },
  loading: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 10 },
});
