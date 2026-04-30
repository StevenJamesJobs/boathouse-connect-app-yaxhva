/**
 * WordSearchHUD
 * Header display showing category, difficulty, timer, score, and word progress.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
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
  onBack?: () => void;
}

const CATEGORY_LABEL_KEYS: Record<WordSearchCategory, string> = {
  weekly_specials: 'word_search_hud:cat_weekly_specials',
  lunch: 'word_search_hud:cat_lunch',
  dinner: 'word_search_hud:cat_dinner',
  happy_hour: 'word_search_hud:cat_happy_hour',
  libations: 'word_search_hud:cat_libations',
};

const DIFFICULTY_LABEL_KEYS: Record<WordSearchDifficulty, string> = {
  easy: 'word_search_hud:diff_easy',
  medium: 'word_search_hud:diff_medium',
  hard: 'word_search_hud:diff_hard',
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
  onBack,
}: WordSearchHUDProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
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
      {/* Row 1: Back + Category + Difficulty */}
      <View style={styles.topRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={10}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={22}
              color={colors.text}
            />
          </TouchableOpacity>
        )}
        <Text style={[styles.categoryLabel, { color: colors.text }]} numberOfLines={1}>
          {t(CATEGORY_LABEL_KEYS[category])}
        </Text>
        <View style={[styles.diffPill, { backgroundColor: DIFFICULTY_COLORS[difficulty] + '22' }]}>
          <Text style={[styles.diffText, { color: DIFFICULTY_COLORS[difficulty] }]}>
            {t(DIFFICULTY_LABEL_KEYS[difficulty])}
          </Text>
        </View>
        <View style={[styles.modePill, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.modeText, { color: colors.primary }]}>
            {playMode === 'timed' ? t('word_search_hud:mode_timed') : t('word_search_hud:mode_free')}
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
  backButton: {
    paddingRight: 4,
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
