/**
 * WordSearchWordList
 * Displays the list of words to find, grouped by menu item.
 * Found words get a strikethrough + checkmark.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { WordSearchWord } from '@/types/game';

interface WordSearchWordListProps {
  words: WordSearchWord[];
  foundWordIds: string[];
  scrollable?: boolean;
}

export default function WordSearchWordList({
  words,
  foundWordIds,
  scrollable = false,
}: WordSearchWordListProps) {
  const colors = useThemeColors();

  // Group words by itemName
  const grouped = useMemo(() => {
    const map = new Map<string, WordSearchWord[]>();
    for (const word of words) {
      if (!map.has(word.itemName)) map.set(word.itemName, []);
      map.get(word.itemName)!.push(word);
    }
    return Array.from(map.entries());
  }, [words]);

  const totalWords = words.length;
  const foundCount = words.filter((w) => foundWordIds.includes(w.id)).length;

  const content = (
    <View style={styles.container}>
      {/* Progress summary */}
      <View style={[styles.progressRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          Words Found:{' '}
          <Text style={[styles.progressCount, { color: colors.primary }]}>
            {foundCount}/{totalWords}
          </Text>
        </Text>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          💡 Search for the bold key word in each ingredient
        </Text>
      </View>

      {/* Grouped word list */}
      {grouped.map(([itemName, itemWords]) => {
        const allFound = itemWords.every((w) => foundWordIds.includes(w.id));
        return (
          <View key={itemName} style={[styles.group, { borderColor: colors.border }]}>
            {/* Item name header */}
            <View
              style={[
                styles.groupHeader,
                {
                  backgroundColor: allFound
                    ? colors.primary + '20'
                    : colors.highlight,
                },
              ]}
            >
              <Text
                style={[
                  styles.groupTitle,
                  { color: allFound ? colors.primary : colors.text },
                ]}
                numberOfLines={1}
              >
                {allFound ? '✓ ' : ''}{itemName}
              </Text>
            </View>

            {/* Ingredient words */}
            <View style={styles.wordGrid}>
              {itemWords.map((word) => {
                const isFound = foundWordIds.includes(word.id);
                // Show the search keyword hint if the display label differs
                const showKeyword = word.displayLabel.toUpperCase() !== word.searchWord;
                return (
                  <View
                    key={word.id}
                    style={[
                      styles.wordChip,
                      {
                        backgroundColor: isFound
                          ? colors.primary + '18'
                          : colors.background,
                        borderColor: isFound ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.wordText,
                        {
                          color: isFound ? colors.primary : colors.textSecondary,
                          textDecorationLine: isFound ? 'line-through' : 'none',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {isFound ? '✓ ' : ''}{word.displayLabel}
                    </Text>
                    {showKeyword && !isFound && (
                      <Text
                        style={[
                          styles.keywordHint,
                          { color: colors.primary },
                        ]}
                        numberOfLines={1}
                      >
                        find: {word.searchWord}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  container: {
    gap: 8,
  },
  progressRow: {
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressCount: {
    fontWeight: '700',
    fontSize: 14,
  },
  group: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
  },
  wordChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wordText: {
    fontSize: 12,
    fontWeight: '500',
  },
  keywordHint: {
    fontSize: 10,
    fontWeight: '700',
    fontStyle: 'italic',
    marginTop: 1,
  },
  hintText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
});
