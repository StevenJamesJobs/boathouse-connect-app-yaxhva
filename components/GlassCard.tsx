import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * GlassCard — the Gaussian-blur surface for the redesign.
 *
 * Opt-in: this does NOT replace the 127 screens that read solid `colors.card`.
 * Use `variant="glass"` for the header treatment (--glass/--glassbd in the
 * mockup) and `variant="surface"` for cards/segments (--surf/--surfbd).
 *
 * Android: BlurView uses the dimezis fork via `experimentalBlurMethod`. Pass
 * `solid` to fall back to an opaque `colors.card` surface on low-end devices
 * (BlurView overdraw is the main perf risk) — `card` is intentionally solid.
 */
type GlassVariant = 'glass' | 'surface';

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: GlassVariant;
  intensity?: number;
  radius?: number;
  bordered?: boolean;
  solid?: boolean;
}

export default function GlassCard({
  children,
  style,
  variant = 'surface',
  intensity,
  radius = 16,
  bordered = true,
  solid = false,
}: GlassCardProps) {
  const { colors, resolvedMode } = useAppTheme();

  const fill = variant === 'glass' ? colors.glass : colors.surface;
  const borderColor = variant === 'glass' ? colors.glassBorder : colors.surfaceBorder;
  const blurIntensity = intensity ?? (variant === 'glass' ? 24 : 18);

  const borderStyle: ViewStyle = bordered
    ? { borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor }
    : {};

  // Solid fallback: opaque card, no blur (low-end Android / perf-sensitive callers).
  if (solid) {
    return (
      <View
        style={[
          { backgroundColor: colors.card, borderRadius: radius, overflow: 'hidden' },
          borderStyle,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={blurIntensity}
      tint={resolvedMode === 'dark' ? 'dark' : 'light'}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      style={[
        { borderRadius: radius, overflow: 'hidden', backgroundColor: fill },
        borderStyle,
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}
