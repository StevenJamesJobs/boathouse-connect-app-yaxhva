/**
 * FlipDock — the s76 memory pairing bar. A FIXED-HEIGHT, always-mounted bar
 * above the board: flipped cards fill its halves in place (the board below
 * never shifts — Steve's hard requirement), a match turns it green before the
 * merged chip flies to the pair rail, a miss flashes red and shakes, and a
 * tapped rail slot replays its pair here as the PEEK (gold tag, tap to
 * dismiss). No popovers anywhere.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { MEM_SUB_PRIMARY, MEM_SUB_MATCH, BONUS_GOLD } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

export type FlipDockState = 'idle' | 'pending' | 'match' | 'miss' | 'peek';

export interface DockCard {
  sub?: string;
  text: string;
  side: 'primary' | 'match';
}

interface FlipDockProps {
  left: DockCard | null;
  right: DockCard | null;
  state: FlipDockState;
  /** Peek header ("Peek · Pair 2 · tap to dismiss"). */
  peekLabel?: string;
  onDismissPeek?: () => void;
}

export default function FlipDock({ left, right, state, peekLabel, onDismissPeek }: FlipDockProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const shake = useSharedValue(0);

  useEffect(() => {
    if (state === 'miss') {
      shake.value = withSequence(
        withTiming(-5, { duration: 60 }),
        withTiming(5, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming(4, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
    }
  }, [state]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const borderColor =
    state === 'match'
      ? '#10B981'
      : state === 'miss'
        ? '#EF4444'
        : state === 'peek'
          ? 'rgba(255,212,138,0.6)'
          : colors.glassBorder;

  const vsLabel =
    state === 'match' || state === 'peek'
      ? t('memory_game.dock_pair_yes')
      : state === 'miss'
        ? t('memory_game.dock_pair_no')
        : t('memory_game.dock_pair_q');
  const vsColor = state === 'match' ? '#10B981' : state === 'miss' ? '#EF4444' : state === 'peek' ? BONUS_GOLD : colors.textSecondary;

  const renderHalf = (card: DockCard | null, placeholder: string) => {
    if (!card) {
      return (
        <View style={[styles.empty, { borderColor: colors.glassBorder }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]} numberOfLines={1}>
            {placeholder}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.halfInner}>
        {!!card.sub && (
          <Text
            style={[styles.sub, { color: card.side === 'primary' ? MEM_SUB_PRIMARY : MEM_SUB_MATCH }]}
            numberOfLines={1}
          >
            {card.sub}
          </Text>
        )}
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
          {card.text}
        </Text>
      </View>
    );
  };

  return (
    <Animated.View style={shakeStyle}>
      <TouchableOpacity
        activeOpacity={state === 'peek' ? 0.8 : 1}
        disabled={state !== 'peek'}
        onPress={onDismissPeek}
        style={[
          styles.dock,
          { backgroundColor: colors.glass, borderColor },
          state === 'match' && styles.matchGlow,
        ]}
      >
        {state === 'peek' && !!peekLabel && (
          <View style={[styles.peekTag, { backgroundColor: colors.background }]}>
            <Text style={styles.peekTagText}>{peekLabel}</Text>
          </View>
        )}
        <View style={styles.half}>{renderHalf(left, t('memory_game.dock_flip_first'))}</View>
        <View style={[styles.vs, { borderColor: vsColor === colors.textSecondary ? colors.glassBorder : vsColor }]}>
          <Text style={[styles.vsText, { color: vsColor }]}>{vsLabel}</Text>
        </View>
        <View style={styles.half}>
          {renderHalf(right, left ? t('memory_game.dock_flip_second') : t('memory_game.dock_flip_first'))}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    height: 60,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  matchGlow: {
    boxShadow: '0 0 14px -4px rgba(16,185,129,0.5)',
  },
  half: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfInner: {
    alignItems: 'center',
    width: '100%',
  },
  sub: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 12.5,
    fontFamily: fonts.body.semibold,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 2,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    width: '100%',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10.5,
    fontStyle: 'italic',
    fontFamily: fonts.body.regular,
  },
  vs: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  vsText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
  },
  peekTag: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    left: '50%',
    transform: [{ translateX: -70 }],
    width: 140,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,212,138,0.55)',
    paddingVertical: 2,
    zIndex: 2,
  },
  peekTagText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    letterSpacing: 1,
    color: BONUS_GOLD,
    textAlign: 'center',
  },
});
