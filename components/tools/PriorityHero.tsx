/**
 * PriorityHero (s79 lockdown) — the compact rotisserie: a swipeable, snapping
 * card carousel that auto-advances every ~6s, pauses the moment the user
 * touches or swipes it, resumes after ~9s idle, and loops back to the first
 * card for another pass (Steve's locked motion spec). Renders nothing with an
 * empty deck; a single card renders static (no dots, no timer).
 *
 * Cards are FIXED-DARK gradient surfaces: literal white inks + the literal
 * ember eyebrow (the rulebook rule) — the only gradients on the Tools page.
 *
 * Honors reduce-motion: when the OS asks for reduced motion the rotisserie
 * does not auto-advance (swiping still works).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import {
  HERO_ADVANCE_MS,
  HERO_CARD_BORDER,
  HERO_CHIP_BG,
  HERO_CHIP_BORDER,
  HERO_EYEBROW_INK,
  HERO_GRADIENTS,
  HERO_RESUME_MS,
  HERO_SUB_INK,
  HERO_TITLE_INK,
  HERO_WATERMARK_INK,
  HeroGradientKey,
} from '@/components/tools/toolsVisuals';

export interface PriorityCard {
  key: string;
  gradient: HeroGradientKey;
  iosIcon: string;
  androidIcon: string;
  eyebrow: string;
  title: string;
  sub: string;
  onPress: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const H_PAD = 16;
const CARD_GAP = 8;
// 87% of the content width — the next card peeks, which is the swipe affordance.
const CARD_WIDTH = Math.round((SCREEN_WIDTH - H_PAD * 2) * 0.87);
const SNAP = CARD_WIDTH + CARD_GAP;

export default function PriorityHero({ cards }: { cards: PriorityCard[] }) {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  // Timestamp before which the rotisserie must not advance (touch pauses it).
  const pausedUntilRef = useRef(0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) reduceMotionRef.current = v;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (cards.length < 2) return;
    const timer = setInterval(() => {
      if (reduceMotionRef.current) return;
      if (Date.now() < pausedUntilRef.current) return;
      const next = (indexRef.current + 1) % cards.length;
      scrollRef.current?.scrollTo({ x: next * SNAP, animated: true });
      // Momentum from scrollTo does not always fire onMomentumScrollEnd on
      // Android — track the target eagerly so the loop math never stalls.
      indexRef.current = next;
      setIndex(next);
    }, HERO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [cards.length]);

  const pause = useCallback(() => {
    pausedUntilRef.current = Date.now() + HERO_RESUME_MS;
  }, []);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    indexRef.current = i;
    setIndex(i);
  }, []);

  if (cards.length === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        contentContainerStyle={styles.track}
        onTouchStart={pause}
        onScrollBeginDrag={pause}
        onMomentumScrollEnd={(e) => {
          pause();
          onMomentumEnd(e);
        }}
        scrollEventThrottle={16}
      >
        {cards.map((card) => (
          <TouchableOpacity
            key={card.key}
            activeOpacity={0.85}
            onPress={card.onPress}
            style={styles.cardPress}
          >
            <LinearGradient
              colors={HERO_GRADIENTS[card.gradient] as unknown as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.watermark} pointerEvents="none">
                <IconSymbol
                  ios_icon_name={card.iosIcon as any}
                  android_material_icon_name={card.androidIcon as any}
                  size={78}
                  color={HERO_WATERMARK_INK}
                />
              </View>
              <View style={styles.cardLeft}>
                <Text style={styles.eyebrow} numberOfLines={1}>
                  {card.eyebrow.toUpperCase()}
                </Text>
                <Text style={styles.title} numberOfLines={1}>
                  {card.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {card.sub}
                </Text>
              </View>
              <View style={styles.goChip}>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={13}
                  color={HERO_TITLE_INK}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {cards.length > 1 && (
        <View style={styles.dots}>
          {cards.map((card, i) => (
            <View
              key={card.key}
              style={[
                styles.dot,
                { backgroundColor: colors.border },
                i === index && [styles.dotOn, { backgroundColor: colors.tint }],
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    gap: CARD_GAP,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  cardPress: {
    width: CARD_WIDTH,
  },
  card: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: HERO_CARD_BORDER,
    minHeight: 94,
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -10,
    bottom: -18,
  },
  cardLeft: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.6,
    color: HERO_EYEBROW_INK,
  },
  title: {
    fontFamily: fonts.display.bold,
    fontSize: 16.5,
    letterSpacing: -0.35,
    color: HERO_TITLE_INK,
    marginTop: 4,
    marginBottom: 3,
  },
  sub: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: HERO_SUB_INK,
  },
  goChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HERO_CHIP_BG,
    borderWidth: 1,
    borderColor: HERO_CHIP_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginTop: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotOn: {
    width: 14,
  },
});
