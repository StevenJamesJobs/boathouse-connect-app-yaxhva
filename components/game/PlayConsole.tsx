/**
 * PlayConsole — the s76 in-game scoreboard shell and its pieces. A FIXED-DARK
 * game-gradient card in both themes (the tile grown into chrome), so every
 * color in here is a literal from gameVisuals — never a theme token (the
 * rulebook's ember rule).
 *
 * Composition per game:
 *   word_search — one row: timer · score · found
 *   memory      — row1: level · timer · score / row2: hearts · pair rail
 *   picture_this— the over-photo variant lives in the play screen (blur);
 *                 it reuses HeartsRow/ConsoleStat/MilestoneMeter from here.
 */

import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import {
  PLAY_VISUALS,
  HEART_FULL,
  HEART_EMPTY,
  CONSOLE_MUTED,
  CONSOLE_CHIP_BG,
  CONSOLE_CHIP_BORDER,
  BONUS_GOLD_SOFT,
} from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

type GameKey = keyof typeof PLAY_VISUALS;

export default function PlayConsole({
  game,
  children,
  style,
}: {
  game: GameKey;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const [c0, c1, c2] = PLAY_VISUALS[game].console;
  return (
    <View style={[styles.shell, style]}>
      <LinearGradient
        colors={[c0, c1, c2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** Mono countdown/elapsed timer; warn tints it toward the low-time gold. */
export function ConsoleTimer({
  seconds,
  warn,
  size = 19,
}: {
  seconds: number;
  warn?: boolean;
  size?: number;
}) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return (
    <View style={styles.timerWrap}>
      <IconSymbol
        ios_icon_name="clock"
        android_material_icon_name="schedule"
        size={Math.round(size * 0.75)}
        color="rgba(255,255,255,0.75)"
      />
      <Text style={[styles.timerText, { fontSize: size }, warn && { color: BONUS_GOLD_SOFT }]}>
        {m}:{s.toString().padStart(2, '0')}
      </Text>
    </View>
  );
}

/** Icon + mono value stat ("★ 1,350" / "6/9"). */
export function ConsoleStat({
  iosIcon,
  androidIcon,
  value,
  suffix,
  size = 14,
}: {
  iosIcon?: string;
  androidIcon?: string;
  value: string;
  suffix?: string;
  size?: number;
}) {
  return (
    <View style={styles.statWrap}>
      {!!iosIcon && !!androidIcon && (
        <IconSymbol
          ios_icon_name={iosIcon as any}
          android_material_icon_name={androidIcon as any}
          size={size - 1}
          color="rgba(255,255,255,0.85)"
        />
      )}
      <Text style={[styles.statText, { fontSize: size }]}>
        {value}
        {!!suffix && <Text style={styles.statSuffix}>{suffix}</Text>}
      </Text>
    </View>
  );
}

/** Lives hearts — drawn glyphs, never emoji. */
export function HeartsRow({ lives, max, size = 16 }: { lives: number; max: number; size?: number }) {
  return (
    <View style={styles.hearts}>
      {Array.from({ length: max }).map((_, i) => (
        <IconSymbol
          key={i}
          ios_icon_name={i < lives ? 'heart.fill' : 'heart'}
          android_material_icon_name={i < lives ? 'favorite' : 'favorite-border'}
          size={size}
          color={i < lives ? HEART_FULL : HEART_EMPTY}
        />
      ))}
    </View>
  );
}

/** Tiny uppercase mono tag (LEVEL 3). */
export function ConsoleTag({ text }: { text: string }) {
  return <Text style={styles.tag}>{text}</Text>;
}

/**
 * The memory pair rail — one slot per pair, lit as they land; a lit slot is
 * tappable (the peek). `landingIndex` renders the gold mid-landing glow while
 * the merge chip flies in.
 */
export function PairRail({
  total,
  lit,
  landingIndex,
  peekIndex,
  onSlotPress,
}: {
  total: number;
  lit: number;
  landingIndex?: number | null;
  peekIndex?: number | null;
  onSlotPress?: (index: number) => void;
}) {
  // High levels run to 10 pairs — slots shrink so the rail shares its row
  // with the hearts without wrapping.
  const slotSize = total > 7 ? 18 : 24;
  const gap = total > 7 ? 4 : 5;
  const iconSize = total > 7 ? 9 : 11;
  return (
    <View style={[styles.rail, { gap }]}>
      {Array.from({ length: total }).map((_, i) => {
        const isLit = i < lit;
        const isLanding = landingIndex === i;
        const isPeeking = peekIndex === i;
        return (
          <TouchableOpacity
            key={i}
            disabled={!isLit || !onSlotPress}
            onPress={() => onSlotPress?.(i)}
            activeOpacity={0.7}
            hitSlop={4}
            style={[
              styles.slot,
              { width: slotSize, height: slotSize, borderRadius: slotSize / 3 },
              isLit && styles.slotLit,
              isLanding && styles.slotLanding,
              isPeeking && styles.slotPeeking,
            ]}
          >
            <IconSymbol
              ios_icon_name={isPeeking ? 'eye.fill' : isLit ? 'checkmark' : 'heart'}
              android_material_icon_name={isPeeking ? 'visibility' : isLit ? 'check' : 'favorite-border'}
              size={iconSize}
              color={isPeeking ? BONUS_GOLD_SOFT : isLit ? '#FFFFFF' : 'rgba(255,255,255,0.28)'}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Rail slot geometry for the fly-to-rail animation (kept beside PairRail). */
export function railSlotCenter(total: number, index: number): { offsetX: number; slotSize: number } {
  const slotSize = total > 7 ? 18 : 24;
  const gap = total > 7 ? 4 : 5;
  return { offsetX: index * (slotSize + gap) + slotSize / 2, slotSize };
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0 10px 26px -14px rgba(0,0,0,0.55)',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerText: {
    fontFamily: fonts.mono.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  statWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    fontFamily: fonts.mono.semibold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  statSuffix: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  hearts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tag: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: CONSOLE_MUTED,
  },
  rail: {
    flexDirection: 'row',
    gap: 5,
  },
  slot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONSOLE_CHIP_BORDER,
    backgroundColor: CONSOLE_CHIP_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLit: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: '#9DC0FF',
    boxShadow: '0 0 10px -2px rgba(157,192,255,0.7)',
  },
  slotLanding: {
    borderColor: BONUS_GOLD_SOFT,
    boxShadow: '0 0 12px -1px rgba(255,212,138,0.85)',
  },
  slotPeeking: {
    borderColor: BONUS_GOLD_SOFT,
  },
});
