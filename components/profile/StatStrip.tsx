/**
 * The three-cell stat strip on My Hub. Each cell: a display-bold number (with an optional
 * mono small), a mono eyebrow, a chevron. `expanded` draws the pointer notch under the cell
 * (the Team cell) and swaps the chevron to "up".
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { STAT_RADIUS, hexToRgba } from './profileVisuals';

export interface StatCellProps {
  big: string;
  small?: string;
  eyebrow: string;
  /** hex for the big number; defaults to the text colour */
  ink?: string;
  /** hex accent for the expanded state (fill/border/notch) */
  accent?: string;
  chevron?: 'right' | 'down' | 'up';
  expanded?: boolean;
  onPress?: () => void;
}

export function StatCell({ big, small, eyebrow, ink, accent, chevron = 'right', expanded = false, onPress }: StatCellProps) {
  const colors = useThemeColors();
  const acc = accent ?? colors.tint;
  const chevIos = chevron === 'right' ? 'chevron.right' : chevron === 'down' ? 'chevron.down' : 'chevron.up';
  const chevAnd = chevron === 'right' ? 'chevron-right' : chevron === 'down' ? 'expand-more' : 'expand-less';
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.cell,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        expanded && { backgroundColor: hexToRgba(acc, 0.12), borderColor: hexToRgba(acc, 0.42) },
      ]}
    >
      <Text style={[styles.big, { color: ink ?? colors.text }]} numberOfLines={1}>
        {big}
        {small ? <Text style={[styles.small, { color: colors.textSecondary }]}> {small}</Text> : null}
      </Text>
      <Text style={[styles.eyebrow, { color: colors.textSecondary }]} numberOfLines={1}>
        {eyebrow}
      </Text>
      <View style={styles.chev}>
        <IconSymbol ios_icon_name={chevIos} android_material_icon_name={chevAnd} size={13} color={colors.textSecondary} />
      </View>
      {expanded && (
        <View
          pointerEvents="none"
          style={[styles.notch, { backgroundColor: colors.background, borderColor: hexToRgba(acc, 0.42) }]}
        />
      )}
    </TouchableOpacity>
  );
}

export default function StatStrip({ children }: { children: React.ReactNode }) {
  return <View style={styles.strip}>{children}</View>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1, minWidth: 0, borderRadius: STAT_RADIUS, borderWidth: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 9, gap: 3,
    position: 'relative',
  },
  big: { fontFamily: fonts.display.bold, fontSize: 19, letterSpacing: -0.4, lineHeight: 22 },
  small: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 0 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  chev: { position: 'absolute', top: 8, right: 8 },
  notch: {
    position: 'absolute', bottom: -6, left: '50%', marginLeft: -5, width: 10, height: 10, borderRightWidth: 1, borderBottomWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
});
