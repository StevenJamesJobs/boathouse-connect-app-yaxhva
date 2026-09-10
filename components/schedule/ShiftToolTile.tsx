import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { AttentionRing } from '@/components/tools/ToolsBits';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { TILE_BG_ALPHA, TILE_BORDER_ALPHA } from '@/components/schedule/scheduleVisuals';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

/**
 * The Shift Tools tile (s83, Design A's tiles): tinted glass in the theme tint —
 * family icon top-left, chevron top-right, display title, one-line sub. `wide`
 * lays it as a row with a big count on the right (the O/M Approvals tile) and
 * `pulse` wears the AttentionRing while something waits.
 */
export default function ShiftToolTile({
  iosIcon,
  androidIcon,
  title,
  sub,
  onPress,
  wide = false,
  big,
  pulse = false,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  sub: string;
  onPress: () => void;
  wide?: boolean;
  big?: number;
  pulse?: boolean;
}) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const bg = hexToRgba(colors.primary, isDark ? TILE_BG_ALPHA.dark : TILE_BG_ALPHA.light);
  const border = hexToRgba(colors.primary, isDark ? TILE_BORDER_ALPHA.dark : TILE_BORDER_ALPHA.light);
  return (
    <Pressable onPress={onPress} style={[styles.tile, wide ? styles.wide : styles.half, { backgroundColor: bg, borderColor: border }]}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={wide ? 22 : 20} color={colors.primary} />
      <View style={[styles.body, wide && styles.bodyWide]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>{sub}</Text>
      </View>
      {wide && typeof big === 'number' ? (
        <Text style={[styles.big, { color: colors.primary }]}>{big}</Text>
      ) : (
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} style={styles.chev} />
      )}
      <AttentionRing active={pulse} color={colors.primary} radius={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'relative', borderRadius: 16, padding: 12, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  half: { flex: 1, minHeight: 84, justifyContent: 'space-between' },
  wide: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { marginTop: 8 },
  bodyWide: { flex: 1, marginTop: 0 },
  title: { fontFamily: fonts.display.semibold, fontSize: 15 },
  sub: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  big: { fontFamily: fonts.display.bold, fontSize: 26, lineHeight: 30 },
  chev: { position: 'absolute', top: 12, right: 12 },
});
