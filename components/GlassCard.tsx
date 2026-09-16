import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import GlassBlur from '@/components/GlassBlur';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * GlassCard — the Gaussian-blur surface for the redesign.
 *
 * Opt-in: this does NOT replace the 127 screens that read solid `colors.card`.
 * Use `variant="glass"` for the header treatment (--glass/--glassbd in the
 * mockup) and `variant="surface"` for cards/segments (--surf/--surfbd).
 *
 * Android: NO blur — translucent glass only. expo-blur 57 (SDK 57) only blurs
 * on Android when the BlurView is a *sibling outside* a `BlurTargetView`, which a
 * card inside scrolling content can never be; without a target the native side
 * falls back to 'none' anyway (and `experimentalBlurMethod` is deprecated), so
 * the kit leaves `blurMethod` unset there and relies on the `colors.glass` /
 * `colors.surface` fills. Pass `solid` for an opaque `colors.card` surface on
 * perf-sensitive callers — `card` is intentionally solid.
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
  /** Android only: opacity of the themed base under the tint (GlassBlur default 0.95). */
  androidBaseAlpha?: number;
}

export default function GlassCard({
  children,
  style,
  variant = 'surface',
  intensity,
  radius = 16,
  bordered = true,
  solid = false,
  androidBaseAlpha,
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
    <GlassBlur
      intensity={blurIntensity}
      tint={resolvedMode === 'dark' ? 'dark' : 'light'}
      androidBaseAlpha={androidBaseAlpha}
      style={[
        { borderRadius: radius, overflow: 'hidden', backgroundColor: fill },
        borderStyle,
        style,
      ]}
    >
      {children}
    </GlassBlur>
  );
}
