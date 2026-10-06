import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * ContentFadeMask — the s89 "fade-behind" rail: an ALPHA mask over a scrolling
 * surface so its content dissolves to nothing as it slides up under a pinned
 * capsule / chip row, instead of being clipped (a hard cut) or hidden behind a
 * bar (which covered the AmbientGlow — Steve's whole complaint).
 *
 *   y < from            → invisible (mask alpha 0)
 *   from ≤ y ≤ to       → fading in (alpha 0 → 1)
 *   y > to              → fully visible
 *
 * `from` is the pinned row's BOTTOM EDGE in the masked view's own coordinates
 * (Steve's pick: "to the pill's bottom edge" — nothing ever sits behind a
 * pill), `to` = from + FADE (28pt). The mask is STATIC at the collapsed
 * geometry: at rest the content sits far below it (the pages pad by the OPEN
 * chrome height), so the fade only ever touches cards once the band has
 * parked. The glow lives in the portal layout BEHIND the masked view, so it
 * is never touched. Only the content is masked — the chrome overlay stays a
 * sibling above it.
 *
 * `from <= 0` (nothing measured yet) renders the children unmasked.
 */
export const FADE_LENGTH = 28;

export interface ContentFadeMaskProps {
  from: number;
  to?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export default function ContentFadeMask({ from, to, style, children }: ContentFadeMaskProps) {
  const end = to ?? from + FADE_LENGTH;
  const maskElement = useMemo(
    () => (
      <View style={styles.maskRoot} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']}
          locations={[0, 1]}
          style={[styles.ramp, { top: from, height: Math.max(1, end - from) }]}
        />
        <View style={[styles.solid, { top: end }]} />
      </View>
    ),
    [from, end],
  );

  if (!(from > 0)) {
    return <View style={[styles.fill, style]}>{children}</View>;
  }

  return (
    <MaskedView style={[styles.fill, style]} maskElement={maskElement}>
      {children}
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  maskRoot: { flex: 1, backgroundColor: 'transparent' },
  ramp: { position: 'absolute', left: 0, right: 0 },
  solid: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
});
