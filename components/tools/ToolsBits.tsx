/**
 * Small shared pieces of the Tools Kit (s79): the mono section rule and the
 * family-colored attention pulse (the Manage cockpit's setup-glow grammar,
 * generalized — any tile with a waiting badge pulses in ITS OWN family color,
 * Steve's r2 call).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export function SectionRule({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.rule}>
      <Text style={[styles.ruleLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <View style={[styles.ruleLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

/**
 * Native-driven glow ring over a tile that has something waiting. Pure opacity
 * loop (never layout) — the manage.tsx AttentionPulse, parameterized by color.
 */
export function AttentionRing({ active, color, radius = 16 }: { active: boolean; color: string; radius?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 950, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 950, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  if (!active) return null;
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { borderRadius: radius, borderColor: color, shadowColor: color, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  ruleLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  ruleLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  pulse: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
