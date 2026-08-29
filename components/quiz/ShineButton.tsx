/**
 * ShineButton — the s77 big-CTA treatment: a two-stop gradient button with the
 * traveling light stripe (Steve's round-2 note: every large gradient CTA gets
 * the shine — Generate, Activate, Resume, Save Changes, Add Bonus, Take Quiz,
 * Start Quiz). The stripe is a native-driver translateX loop inside the
 * button's own overflow clip, so it never costs layout.
 */

import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';

export interface ShineButtonProps {
  label: string;
  /** Two-stop gradient, dark→light (135°). */
  gradient: readonly [string, string];
  onPress: () => void;
  iosIcon?: string;
  androidIcon?: string;
  disabled?: boolean;
  /** Replaces the label with a spinner (button stays pressable-disabled). */
  loading?: boolean;
  style?: ViewStyle;
}

export default function ShineButton({
  label,
  gradient,
  onPress,
  iosIcon,
  androidIcon,
  disabled,
  loading,
  style,
}: ShineButtonProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = React.useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(anim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.btn, disabled && { opacity: 0.55 }, style]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.stripe,
            {
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-70, width + 70],
                  }),
                },
                { rotate: '18deg' },
              ],
            },
          ]}
        />
      )}
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={styles.row}>
          {!!iosIcon && !!androidIcon && (
            <IconSymbol
              ios_icon_name={iosIcon as any}
              android_material_icon_name={androidIcon as any}
              size={17}
              color="#FFFFFF"
            />
          )}
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 50,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontFamily: fonts.body.semibold,
    fontSize: 15.5,
    color: '#FFFFFF',
  },
  stripe: {
    position: 'absolute',
    // Anchor at the left edge — without this the stripe's static position is
    // mid-button (after the label), so the sweep started from the middle
    // (Steve's smoke catch).
    left: 0,
    top: -24,
    bottom: -24,
    width: 38,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
});
