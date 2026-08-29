/**
 * MoneyRain — the Bucks-quiz celebration (s77 lockdown): green dollar glyphs
 * raining over the results card whenever an award of $1 or more lands — the
 * games' confetti, translated into money. GameConfetti's cannon shoots shapes,
 * not glyphs, so this is its sibling: N absolutely-positioned mono "$" drops
 * on native-driver transform loops (translateY + slight spin), randomized
 * per-mount so no two rains repeat.
 *
 * Mount inside the results screen root; it brings its own absoluteFill
 * pointerEvents:none layer. Render only when bucksAwarded >= 1.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { fonts } from '@/constants/fonts';

const GREENS = ['#10B981', '#34D399', '#059669'];

interface DropSpec {
  x: number;        // horizontal position, 0..1 of width
  size: number;     // font size
  duration: number; // fall duration ms
  delay: number;    // stagger ms
  spin: number;     // end rotation deg (small ±)
  color: string;
  opacity: number;
}

function Drop({ spec, height }: { spec: DropSpec; height: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: spec.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Snap back invisibly for the next pass.
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, spec.delay, spec.duration]);

  return (
    <Animated.Text
      style={[
        styles.glyph,
        {
          left: `${spec.x * 100}%`,
          fontSize: spec.size,
          color: spec.color,
          opacity: anim.interpolate({
            inputRange: [0, 0.06, 0.85, 1],
            outputRange: [0, spec.opacity, spec.opacity, 0],
          }),
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-40, height + 40],
              }),
            },
            {
              rotate: anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', `${spec.spin}deg`],
              }),
            },
          ],
        },
      ]}
    >
      $
    </Animated.Text>
  );
}

export default function MoneyRain({ count = 16 }: { count?: number }) {
  const { height } = useWindowDimensions();

  // Randomized once per mount — stable across re-renders.
  const drops = useMemo<DropSpec[]>(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * 0.94,
        size: 12 + Math.random() * 9,
        duration: 2800 + Math.random() * 2200,
        delay: Math.random() * 2600,
        spin: (Math.random() - 0.5) * 260,
        color: GREENS[Math.floor(Math.random() * GREENS.length)],
        opacity: 0.55 + Math.random() * 0.4,
      })),
    [count],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map((spec, i) => (
        <Drop key={i} spec={spec} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    position: 'absolute',
    top: 0,
    fontFamily: fonts.mono.semibold,
  },
});
