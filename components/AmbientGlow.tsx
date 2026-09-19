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
/** "rgba(r,g,b,a)" → the same colour at alpha 0 (hex / unknown formats fall back to 'transparent'). */
function clear(color: string): string {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(color);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},0)` : 'transparent';
}

export default function AmbientGlow({ front }: { front?: boolean } = {}) {
  const colors = useThemeColors();
  // Fade each glow to ITS OWN colour at alpha 0: 'transparent' is rgba(0,0,0,0), which
  // Android interpolates through dark — a visible ring at every blob's edge (s86).
  const clearA = clear(colors.glowA);
  const clearB = clear(colors.glowB);
  return (
    <View style={styles.wrap} pointerEvents="none">
      {/* `front` (s86, the pre-login family): a wider crown plus a low counter-glow, so the
          glass has something to sit on when the page is mostly empty ground. */}
      {front && (
        <>
          <LinearGradient
            colors={[colors.glowA, clearA]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 0.9 }}
            style={[styles.blob, { top: -70, right: -90, width: 520, height: 480 }]}
          />
          <LinearGradient
            colors={[colors.glowA, clearA]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0.9, y: 0 }}
            style={[styles.blob, { bottom: -120, left: -80, width: 480, height: 420, opacity: 0.75 }]}
          />
        </>
      )}
      {/* Top-right (glowA) — doubled for strength */}
      <LinearGradient
        colors={[colors.glowA, clearA]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.05, y: 1 }}
        style={[styles.blob, { top: -40, right: -50, width: 400, height: 380 }]}
      />
      <LinearGradient
        colors={[colors.glowA, clearA]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={[styles.blob, { top: -30, right: -30, width: 320, height: 300 }]}
      />
      {/* Top-left (glowB) — doubled for strength */}
      <LinearGradient
        colors={[colors.glowB, clearB]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[styles.blob, { top: -30, left: -60, width: 340, height: 320 }]}
      />
      <LinearGradient
        colors={[colors.glowB, clearB]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.blob, { top: -20, left: -40, width: 260, height: 240 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
  },
});
