/**
 * GameToast — the s76 milestone toast: a slim glass pill with gold mono text
 * that pops DOWN from the chrome above it (Picture This: the over-photo
 * console) and melts away. Replaces the old amber box everywhere.
 *
 * Render it absolutely under the console; it animates itself in/out whenever
 * `message` changes and calls onDone after the dwell.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { BONUS_GOLD_SOFT } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

const DWELL_MS = 1900;

export default function GameToast({
  message,
  onDone,
}: {
  message: string | null;
  onDone: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 9 }),
      Animated.delay(DWELL_MS),
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pill,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
          ],
        },
      ]}
    >
      <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={12} color={BONUS_GOLD_SOFT} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Fixed-dark glass (it hangs over the photo) — literals by design.
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '88%',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: 'rgba(16,14,40,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.55)',
    boxShadow: '0 8px 22px -10px rgba(0,0,0,0.5)',
    zIndex: 20,
  },
  text: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: BONUS_GOLD_SOFT,
  },
});
