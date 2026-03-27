/**
 * WordSearchHUD
 * Header display showing category, difficulty, timer, score, and word progress.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { WordSearchCategory, WordSearchDifficulty, WordSearchPlayMode } from '@/types/game';
import { formatTime } from '@/utils/game/wordSearchEngine';

interface WordSearchHUDProps {
  category: WordSearchCategory;
  difficulty: WordSearchDifficulty;
  playMode: WordSearchPlayMode;
  score: number;
  wordsFound: number;
  totalWords: number;
  timeLimitSeconds: number;    // 0 for free mode (counts up)
  isComplete: boolean;
  onTimeExpired?: () => void;
  onTick?: (secondsElapsed: number) => void;
}

const CATEGORY_LABELS: Record<WordSearchCategory, string> = {
  weekly_specials: 'Weekly Specials',
  lunch: 'Lunch',
  dinner: 'Dinner',
  happy_hour: 'Happy Hour',
  libations: 'Libations',
};

const DIFFICULTY_LABELS: Record<WordSearchDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const DIFFICULTY_COLORS: Record<WordSearchDifficulty, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
};

export default function WordSearchHUD({
  category,
  difficulty,
  playMode,
  score,
  wordsFound,
  totalWords,
  timeLimitSeconds,
  isComplete,
  onTimeExpired,
  onTick,
}: WordSearchHUDProps) {
  const colors = useThemeColors();
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    if (isComplete) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const next = secondsRef.current + 1;
      secondsRef.current = next;
      setSecondsElapsed(next);

      // Notify parent (safe — outside state updater)
      onTick?.(next);

      // Timed mode: check expiry
      if (playMode === 'timed' && timeLimitSeconds > 0 && next >= timeLimitSeconds) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onTimeExpired?.();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isComplete, playMode, timeLimitSeconds]);

  const isTimed = playMode === 'timed' && timeLimitSeconds > 0;
  const displaySeconds = isTimed
    ? Math.max(0, timeLimitSeconds - secondsElapsed)
    : secondsElapsed;
  const timeStr = formatTime(displaySeconds);

  const isLowTime = isTimed && displaySeconds <= 30;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {/* Row 1: Category + Difficulty */}
      <View style={styles.topRow}>
        <Text style={[styles.categoryLabel, { color: colors.text }]} numberOfLines={1}>
          {CATEGORY_LABELS[category]}
        </Text>
        <View style={[styles.diffPill, { backgroundColor: DIFFICULTY_COLORS[difficulty] + '22' }]}>
          <Text style={[styles.diffText, { color: DIFFICULTY_COLORS[difficulty] }]}>
            {DIFFICULTY_LABELS[difficulty]}
          </Text>
        </View>
        <View style={[styles.modePill, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.modeText, { color: colors.primary }]}>
            {playMode === 'timed' ? '⏱ Timed' : '🔓 Free'}
          </Text>
        </View>
      </View>

      {/* Row 2: Timer + Score + Progress */}
      <View style={styles.statsRow}>
        <View style={[styles.statChip, { backgroundColor: (isLowTime ? '#EF4444' : colors.primary) + '15' }]}>
          <Text style={[styles.statLabel, { color: isLowTime ? '#EF4444' : colors.primary }]}>
            {isTimed ? '⏱' : '⏲'} {timeStr}
          </Text>
        </View>

        <View style={[styles.statChip, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.statLabel, { color: colors.primary }]}>
            ⭐ {score}
          </Text>
        </View>

        <View style={[styles.statChip, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.statLabel, { color: colors.primary }]}>
            🔤 {wordsFound}/{totalWords}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  diffPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  diffText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modePill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
