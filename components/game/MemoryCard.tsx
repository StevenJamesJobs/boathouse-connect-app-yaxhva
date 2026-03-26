import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/hooks/useThemeColors';
import { CardData } from '@/types/game';

interface MemoryCardProps {
  card: CardData;
  isFlipped: boolean;
  isMatched: boolean;
  onPress: () => void;
  size: number;
  disabled: boolean;
}

const FLIP_DURATION = 350;

export default function MemoryCard({
  card,
  isFlipped,
  isMatched,
  onPress,
  size,
  disabled,
}: MemoryCardProps) {
  const colors = useThemeColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withTiming(isFlipped || isMatched ? 180 : 0, {
      duration: FLIP_DURATION,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isFlipped, isMatched]);

  // Card back (face-down): visible when rotation < 90
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value < 90 ? 1 : 0,
    };
  });

  // Card front (face-up text): visible when rotation >= 90
  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [180, 360]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value >= 90 ? 1 : 0,
    };
  });

  const cardBackColor = isMatched
    ? (colors.primary + '40')
    : colors.card;

  const matchedBorder = isMatched
    ? { borderColor: colors.primary, borderWidth: 2 }
    : { borderColor: colors.border, borderWidth: 1 };

  // Determine font size based on card size and text length
  const getFontSize = (text: string) => {
    if (text.length > 25) return Math.max(9, size * 0.08);
    if (text.length > 15) return Math.max(10, size * 0.1);
    return Math.max(11, size * 0.12);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || isMatched}
      style={[styles.container, { width: size, height: size * 1.3 }]}
    >
      {/* Card Back (face-down) */}
      <Animated.View
        style={[
          styles.card,
          {
            width: size,
            height: size * 1.3,
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
          frontAnimatedStyle,
        ]}
      >
        <View style={styles.cardBackPattern}>
          <Text style={styles.cardBackIcon}>🃏</Text>
        </View>
      </Animated.View>

      {/* Card Front (face-up) */}
      <Animated.View
        style={[
          styles.card,
          styles.cardFront,
          {
            width: size,
            height: size * 1.3,
            backgroundColor: cardBackColor,
          },
          matchedBorder,
          backAnimatedStyle,
        ]}
      >
        {card.displaySubtext && (
          <Text
            style={[
              styles.subtextLabel,
              {
                color: colors.primary,
                fontSize: Math.max(8, size * 0.07),
              },
            ]}
            numberOfLines={1}
          >
            {card.displaySubtext}
          </Text>
        )}
        <Text
          style={[
            styles.cardText,
            {
              color: colors.text,
              fontSize: getFontSize(card.displayText),
            },
          ]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {card.displayText}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 4,
  },
  card: {
    position: 'absolute',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    borderWidth: 1,
  },
  cardFront: {
    // Front face styles
  },
  cardBackPattern: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackIcon: {
    fontSize: 28,
    opacity: 0.8,
  },
  subtextLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  cardText: {
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
});
