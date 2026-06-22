import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * The ambient corner glow behind the Welcome header — the soft gradient that
 * makes the glass pop. RN has no native radial gradient, so we approximate the
 * mockup's `.glow`/`.glow2` blobs with diagonally-faded rounded LinearGradients
 * in the top corners, driven by the theme `glowA` (top-right) / `glowB`
 * (top-left) tokens. Each is doubled to intensify the (often subtle) tokens.
 */
export default function AmbientGlow() {
  const colors = useThemeColors();
  return (
    <View style={styles.wrap} pointerEvents="none">
      {/* Top-right (glowA) — doubled for strength */}
      <LinearGradient
        colors={[colors.glowA, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.05, y: 1 }}
        style={[styles.blob, { top: -40, right: -50, width: 400, height: 380 }]}
      />
      <LinearGradient
        colors={[colors.glowA, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={[styles.blob, { top: -30, right: -30, width: 320, height: 300 }]}
      />
      {/* Top-left (glowB) — doubled for strength */}
      <LinearGradient
        colors={[colors.glowB, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[styles.blob, { top: -30, left: -60, width: 340, height: 320 }]}
      />
      <LinearGradient
        colors={[colors.glowB, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.blob, { top: -20, left: -40, width: 260, height: 240 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
  },
});
