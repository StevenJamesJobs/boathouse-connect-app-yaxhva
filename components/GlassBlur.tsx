import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * GlassBlur — the kit's blur surface, one component for both platforms.
 *
 * iOS: expo-blur's BlurView, the real frosted glass.
 *
 * Android: expo-blur 57 only blurs a *sibling* `BlurTargetView`, never the tree
 * the view sits in, and without a target it paints nothing but the caller's
 * fill — so a 6 %-white glass tint over a scrim let whole pages bleed through
 * sheets, tab bars and headers (the s85 Android walk). Here Android gets a
 * near-opaque base in the theme's card colour UNDER the caller's fill instead:
 * the ambient glow still reads faintly through it, content behind it does not.
 * `tint="dark"` on a light theme (photo washes, play consoles) keeps a fixed
 * dark base; `androidBase` overrides the base outright.
 *
 * Same props as BlurView (`intensity`, `tint`, `style`, children) — swap the
 * import and nothing else changes.
 */
export interface GlassBlurProps {
  intensity?: number;
  tint?: BlurViewProps['tint'];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Android only: explicit base colour under the caller's fill. */
  androidBase?: string;
  /** Android only: opacity of that base (default 0.95). */
  androidBaseAlpha?: number;
}

const FIXED_DARK_BASE = '#14171C';
const FIXED_LIGHT_BASE = '#F2F3F5';
const RADIUS_KEYS = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
] as const;

/** `#RGB` / `#RRGGBB` (/ `#RRGGBBAA`, alpha replaced) → rgba(); other strings pass through. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function GlassBlur({
  intensity,
  tint = 'default',
  style,
  children,
  androidBase,
  androidBaseAlpha = 0.95,
}: GlassBlurProps) {
  const { colors, resolvedMode } = useAppTheme();

  if (Platform.OS !== 'android') {
    return (
      <BlurView intensity={intensity} tint={tint} style={style}>
        {children}
      </BlurView>
    );
  }

  const isDark = resolvedMode === 'dark';
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const callerFill = flat.backgroundColor;
  const baseColor =
    androidBase ??
    (tint === 'dark' && !isDark
      ? FIXED_DARK_BASE
      : tint === 'light' && isDark
        ? FIXED_LIGHT_BASE
        : colors.card);
  const radii: ViewStyle = {};
  for (const key of RADIUS_KEYS) {
    if (flat[key] != null) (radii as Record<string, unknown>)[key] = flat[key];
  }

  return (
    <View style={[style, { backgroundColor: withAlpha(baseColor, androidBaseAlpha) }]}>
      {callerFill != null && callerFill !== 'transparent' && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, radii, { backgroundColor: callerFill as string }]}
        />
      )}
      {children}
    </View>
  );
}
