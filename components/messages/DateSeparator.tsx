import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * The weighted date-group separator (M3): tint mono eyebrow · mono count · a
 * hairline that runs to the edge · 16pt of air above (6 for the first) — twice
 * the row gap, so the eye lands on the break before the next name.
 */
export default function DateSeparator({ label, count, first = false }: { label: string; count: number; first?: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.wrap, first && styles.first]}>
      <Text style={[styles.eyebrow, { color: colors.tint }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{count}</Text>
      <View style={[styles.line, { backgroundColor: colors.hairline }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  first: { paddingTop: 6 },
  // Bumped from 9.5 / 9 (Steve's round 3): the group break should read at a glance, not as a caption.
  eyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  count: { fontFamily: fonts.mono.semibold, fontSize: 11.5 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
