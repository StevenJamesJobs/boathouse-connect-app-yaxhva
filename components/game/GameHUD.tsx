import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from 'react-i18next';
import { formatTime, getElapsedSeconds } from '@/utils/game/gameEngine';

interface GameHUDProps {
  lives: number;
  maxLives: number;
  score: number;
  difficulty: number;
  startTime: number;
  isComplete: boolean;
  matchedCount: number;
  totalPairs: number;
}

export default function GameHUD({
  lives,
  maxLives,
  score,
  difficulty,
  startTime,
  isComplete,
  matchedCount,
  totalPairs,
}: GameHUDProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isComplete) return;
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isComplete]);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {/* Top row: Lives and Timer */}
      <View style={styles.topRow}>
        {/* Lives */}
        <View style={styles.livesContainer}>
          {Array.from({ length: maxLives }).map((_, i) => (
            <Text key={i} style={styles.heartIcon}>
              {i < lives ? '❤️' : '🖤'}
            </Text>
          ))}
        </View>

        {/* Timer */}
        <Text style={[styles.timerText, { color: colors.textSecondary }]}>
          {formatTime(elapsed)}
        </Text>
      </View>

      {/* Bottom row: Score, Difficulty, Progress */}
      <View style={styles.bottomRow}>
        <View style={[styles.chip, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.chipLabel, { color: colors.primary }]}>
            {t('memory_game.score')}
          </Text>
          <Text style={[styles.chipValue, { color: colors.text }]}>
            {score.toLocaleString()}
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.chipLabel, { color: colors.primary }]}>
            {t('memory_game.difficulty')}
          </Text>
          <Text style={[styles.chipValue, { color: colors.text }]}>
            {difficulty}
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.chipLabel, { color: colors.primary }]}>
            {t('memory_game.pairs')}
          </Text>
          <Text style={[styles.chipValue, { color: colors.text }]}>
            {matchedCount}/{totalPairs}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  livesContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  heartIcon: {
    fontSize: 18,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});
