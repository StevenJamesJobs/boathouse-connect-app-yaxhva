/**
 * WordTrays — the s76 word list: FULL-WIDTH snap trays, one per menu item,
 * wearing the word-search glass-gradient wash. A hint line ("search for the
 * bold word…") sits above the rail with a "2/3" swipe counter when there is
 * more than one dish (the smoke-round fit fix — edge-to-edge cards, nothing
 * floating small). Each tray shows its words as chips (found = accent tint +
 * strikethrough, unfound = label with the hidden keyword bolded, or a
 * "find:" hint when the keyword isn't part of the label) and a per-tray
 * progress count; a fully-found tray gets the accent border + check.
 *
 * A chip remounts when its word flips to found (state-keyed), so the entering
 * spring plays exactly once per find.
 */

import React, { useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { WordSearchWord } from '@/types/game';
import { GAME_VISUALS } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

interface WordTraysProps {
  words: WordSearchWord[];
  foundWordIds: string[];
}

const TRAY_GAP = 9;

export default function WordTrays({ words, foundWordIds }: WordTraysProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const accent = GAME_VISUALS.word_search.accent;
  const [gradA, gradB] = GAME_VISUALS.word_search.gradient;
  // Edge-to-edge within the screen's 16px content padding.
  const trayWidth = screenWidth - 32;

  const groups = useMemo(() => {
    const map = new Map<string, WordSearchWord[]>();
    for (const word of words) {
      if (!map.has(word.itemName)) map.set(word.itemName, []);
      map.get(word.itemName)!.push(word);
    }
    return Array.from(map.entries());
  }, [words]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / (trayWidth + TRAY_GAP));
    if (next !== page) setPage(Math.max(0, Math.min(groups.length - 1, next)));
  };

  // The keyword bolded inside the label when it appears there verbatim.
  const renderChipLabel = (word: WordSearchWord, isFound: boolean) => {
    const upper = word.displayLabel.toUpperCase();
    const idx = upper.indexOf(word.searchWord);
    const base = { color: isFound ? accent : colors.textSecondary };
    if (isFound || idx < 0) {
      return (
        <Text style={[styles.chipText, base, isFound && styles.chipFoundText]} numberOfLines={1}>
          {isFound ? word.displayLabel : t('word_search:tray_find_hint', { label: word.displayLabel, word: word.searchWord })}
        </Text>
      );
    }
    return (
      <Text style={[styles.chipText, base]} numberOfLines={1}>
        {word.displayLabel.slice(0, idx)}
        <Text style={[styles.chipKeyword, { color: colors.text }]}>
          {word.displayLabel.slice(idx, idx + word.searchWord.length)}
        </Text>
        {word.displayLabel.slice(idx + word.searchWord.length)}
      </Text>
    );
  };

  return (
    <View>
      {/* Hint + swipe counter */}
      <View style={styles.hintRow}>
        <Text style={[styles.hintText, { color: colors.textSecondary }]} numberOfLines={1}>
          {t('word_search:tray_hint')}
        </Text>
        {groups.length > 1 && (
          <Text style={[styles.counter, { color: accent }]}>
            {page + 1}/{groups.length}
          </Text>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={trayWidth + TRAY_GAP}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={64}
        contentContainerStyle={styles.rail}
      >
        {groups.map(([itemName, itemWords]) => {
          const foundCount = itemWords.filter((w) => foundWordIds.includes(w.id)).length;
          const done = foundCount === itemWords.length;
          return (
            <View
              key={itemName}
              style={[
                styles.tray,
                {
                  width: trayWidth,
                  backgroundColor: colors.surface,
                  borderColor: done ? accent + '99' : colors.surfaceBorder,
                },
              ]}
            >
              {/* The glass-gradient wash under the content. */}
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.wash, { backgroundColor: gradA + '26' }]}
              />
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.washB, { backgroundColor: gradB + '12' }]}
              />
              <View style={styles.trayHead}>
                {done && (
                  <IconSymbol
                    ios_icon_name="checkmark.circle.fill"
                    android_material_icon_name="check-circle"
                    size={14}
                    color={accent}
                  />
                )}
                <Text style={[styles.trayTitle, { color: colors.text }]} numberOfLines={1}>
                  {itemName}
                </Text>
                <Text style={[styles.trayProg, { color: accent }]}>
                  {foundCount}/{itemWords.length}
                </Text>
              </View>
              <View style={styles.chips}>
                {itemWords.map((word) => {
                  const isFound = foundWordIds.includes(word.id);
                  return (
                    <Animated.View
                      // Remounts on the found transition so the pop plays once.
                      key={`${word.id}-${isFound ? 'f' : 'u'}`}
                      entering={isFound ? ZoomIn.springify().damping(12) : undefined}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isFound ? accent + '21' : colors.glass,
                          borderColor: isFound ? accent + '8C' : colors.glassBorder,
                        },
                      ]}
                    >
                      {renderChipLabel(word, isFound)}
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {groups.length > 1 && (
        <View style={styles.dots}>
          {groups.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === page ? accent : colors.glassBorder },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  hintText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontStyle: 'italic',
    fontFamily: fonts.body.regular,
  },
  counter: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  rail: {
    gap: TRAY_GAP,
    paddingVertical: 2,
  },
  tray: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 11,
    overflow: 'hidden',
  },
  wash: {
    borderRadius: 14,
  },
  washB: {
    borderRadius: 14,
    transform: [{ rotate: '180deg' }],
    opacity: 0.8,
  },
  trayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 7,
  },
  trayTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.display.semibold,
    fontSize: 13,
  },
  trayProg: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.body.semibold,
    textAlign: 'center',
  },
  chipFoundText: {
    textDecorationLine: 'line-through',
  },
  chipKeyword: {
    fontFamily: fonts.body.semibold,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
