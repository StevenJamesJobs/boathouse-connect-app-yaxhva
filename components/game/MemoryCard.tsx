/**
 * MemoryCard — s76 lockdown restyle. The joker is gone: card backs wear the
 * memory-Blues gradient with a diagonal sheen and the ORG's identity (logo
 * when set, monogram ring fallback) over its name. Faces are paper-light in
 * both themes (they sit on the gradient board) with colored eyebrow labels
 * per card side. The 3D flip is unchanged.
 *
 * Back/face colors are fixed-surface literals by design (ember rule); the
 * hues come from gameVisuals.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { StorageImage } from '@/components/StorageImage';
import { CardData } from '@/types/game';
import {
  GAME_VISUALS,
  MEM_SUB_PRIMARY,
  MEM_SUB_MATCH,
} from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

interface MemoryCardProps {
  card: CardData;
  isFlipped: boolean;
  isMatched: boolean;
  /** The match beat: both pair cards are up — flash the border green. */
  isMatchFlash?: boolean;
  onPress: () => void;
  size: number;
  disabled: boolean;
  orgName: string;
  orgLogoUrl: string | null;
}

const FLIP_DURATION = 350;

export default function MemoryCard({
  card,
  isFlipped,
  isMatched,
  isMatchFlash,
  onPress,
  size,
  disabled,
  orgName,
  orgLogoUrl,
}: MemoryCardProps) {
  const colors = useThemeColors();
  const rotation = useSharedValue(0);
  const flash = useSharedValue(0);

  // Two quick green pulses during the match beat.
  useEffect(() => {
    if (isMatchFlash) {
      flash.value = 0;
      flash.value = withTiming(1, { duration: 130 }, () => {
        flash.value = withTiming(0.45, { duration: 130 }, () => {
          flash.value = withTiming(1, { duration: 130 });
        });
      });
    } else {
      flash.value = 0;
    }
  }, [isMatchFlash]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
  }));

  useEffect(() => {
    rotation.value = withTiming(isFlipped || isMatched ? 180 : 0, {
      duration: FLIP_DURATION,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isFlipped, isMatched]);

  // Card back (face-down): visible when rotation < 90
  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value < 90 ? 1 : 0,
    };
  });

  // Card face (face-up text): visible when rotation >= 90
  const faceAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [180, 360]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value >= 90 ? 1 : 0,
    };
  });

  // Determine font size based on card size and text length
  const getFontSize = (text: string) => {
    if (text.length > 40) return Math.max(11, size * 0.1);
    if (text.length > 25) return Math.max(12, size * 0.11);
    if (text.length > 15) return Math.max(13, size * 0.12);
    return Math.max(14, size * 0.14);
  };

  const [gradA, gradB] = GAME_VISUALS.memory.gradient;
  const subColor = card.cardType === 'primary' ? MEM_SUB_PRIMARY : MEM_SUB_MATCH;
  const logoSize = Math.min(38, size * 0.42);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || isMatched}
      style={[styles.container, { width: size, height: size * 1.3 }]}
    >
      {/* Card back — org-branded gradient */}
      <Animated.View
        style={[styles.card, { width: size, height: size * 1.3 }, backAnimatedStyle]}
      >
        <LinearGradient
          colors={[gradA, gradB]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Diagonal sheen */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.14)', 'transparent']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
        {orgLogoUrl ? (
          <View style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
            <StorageImage source={{ uri: orgLogoUrl }} style={styles.logoImg} />
          </View>
        ) : (
          <View style={[styles.monoRing, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
            <Text style={[styles.monoInitial, { fontSize: logoSize * 0.42 }]}>
              {(orgName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.orgName} numberOfLines={1}>
          {orgName}
        </Text>
      </Animated.View>

      {/* Card face */}
      <Animated.View
        style={[
          styles.card,
          styles.face,
          { width: size, height: size * 1.3 },
          isMatched
            ? { borderColor: GAME_VISUALS.memory.gradient[1], borderWidth: 1.5, opacity: 0.62 }
            : { borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1 },
          isFlipped && !isMatched && { borderColor: colors.tint, borderWidth: 1.5 },
          faceAnimatedStyle,
        ]}
      >
        {card.displaySubtext && (
          <Text
            style={[
              styles.subtextLabel,
              { color: subColor, fontSize: Math.max(8, size * 0.078) },
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
              fontSize: getFontSize(card.displayText),
              lineHeight: getFontSize(card.displayText) * 1.3,
            },
          ]}
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {card.displayText}
        </Text>

        {/* The green match flash — a pulsing ring over the face. */}
        {isMatchFlash && (
          <Animated.View pointerEvents="none" style={[styles.matchFlash, flashStyle]} />
        )}
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
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  // Paper face on the gradient board — deliberately light in both themes so
  // the flipped cards read instantly (the round-3 card-table lesson).
  face: {
    backgroundColor: 'rgba(244,246,248,0.94)',
  },
  logoWrap: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#FFFFFF',
  },
  logoImg: { width: '100%', height: '100%' },
  monoRing: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monoInitial: {
    fontFamily: fonts.display.bold,
    color: '#FFFFFF',
  },
  orgName: {
    position: 'absolute',
    bottom: 5,
    left: 4,
    right: 4,
    textAlign: 'center',
    fontFamily: fonts.mono.semibold,
    fontSize: 6.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
  },
  subtextLabel: {
    fontFamily: fonts.mono.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  cardText: {
    fontWeight: '700',
    textAlign: 'center',
    color: '#1A2030',
  },
  matchFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.10)',
    boxShadow: '0 0 12px -2px rgba(16,185,129,0.7)',
  },
});
