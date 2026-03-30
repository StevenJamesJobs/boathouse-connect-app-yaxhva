/**
 * Word Search Play Screen
 * The main game screen: HUD + interactive grid + scrollable word list.
 * Shows win/loss modals with full word review.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import {
  GridCell,
  WordSearchCategory,
  WordSearchDifficulty,
  WordSearchPlayMode,
  WordSearchPuzzle,
  WordSearchWord,
} from '@/types/game';
import {
  generateWordSearchPuzzle,
  getTimeLimitSeconds,
  calculateWordSearchScore,
  getDifficultyConfig,
} from '@/utils/game/wordSearchEngine';
import { getWordsForCategory } from '@/utils/game/wordSearchDataAdapters';
import WordSearchGrid from '@/components/game/WordSearchGrid';
import WordSearchWordList from '@/components/game/WordSearchWordList';
import WordSearchHUD from '@/components/game/WordSearchHUD';

type GamePhase = 'loading' | 'playing' | 'won' | 'lost';

export default function WordSearchPlayScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    category: WordSearchCategory;
    difficulty: WordSearchDifficulty;
    playMode: WordSearchPlayMode;
  }>();

  const category = params.category ?? 'lunch';
  const difficulty = params.difficulty ?? 'easy';
  const playMode = params.playMode ?? 'free';

  const [phase, setPhase] = useState<GamePhase>('loading');
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle | null>(null);
  const [selectedCells, setSelectedCells] = useState<GridCell[]>([]);
  const [foundWordIds, setFoundWordIds] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const scoreSavedRef = useRef(false);

  const timeLimitSeconds = playMode === 'timed' ? getTimeLimitSeconds(difficulty) : 0;

  // ─── Load puzzle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const rawWords = await getWordsForCategory(category, difficulty);
      if (cancelled) return;
      const generated = generateWordSearchPuzzle(rawWords, difficulty);
      setPuzzle(generated);
      setPhase('playing');
    }
    load();
    return () => { cancelled = true; };
  }, [category, difficulty]);

  // ─── Word found ───────────────────────────────────────────────────────────────
  const handleWordFound = useCallback((wordId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setFoundWordIds((prev) => {
      const next = [...prev, wordId];
      // Check if all words found
      if (puzzle && next.length === puzzle.words.length) {
        setPhase('won');
      }
      return next;
    });
    setScore((prev) => prev + 10);
  }, [puzzle]);

  // ─── Timer callbacks ──────────────────────────────────────────────────────────
  const handleTick = useCallback((secs: number) => {
    setElapsedSeconds(secs);
  }, []);

  const handleTimeExpired = useCallback(() => {
    if (phase !== 'playing') return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPhase('lost');
  }, [phase]);

  // ─── Save score ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if ((phase === 'won' || phase === 'lost') && puzzle && user && !scoreSavedRef.current) {
      scoreSavedRef.current = true;
      const timeRemaining = timeLimitSeconds > 0 ? Math.max(0, timeLimitSeconds - elapsedSeconds) : 0;
      const finalScore = phase === 'won'
        ? calculateWordSearchScore(foundWordIds.length, timeRemaining, playMode)
        : score;

      supabase.from('word_search_scores').insert({
        user_id: user.id,
        category,
        difficulty,
        play_mode: playMode,
        score: finalScore,
        words_found: foundWordIds.length,
        total_words: puzzle.words.length,
        time_seconds: elapsedSeconds,
        completed: phase === 'won',
      }).then(() => {});
    }
  }, [phase]);

  // ─── Restart ──────────────────────────────────────────────────────────────────
  const handleRestart = async () => {
    scoreSavedRef.current = false;
    setPhase('loading');
    setFoundWordIds([]);
    setScore(0);
    setElapsedSeconds(0);
    setSelectedCells([]);
    const rawWords = await getWordsForCategory(category, difficulty);
    const generated = generateWordSearchPuzzle(rawWords, difficulty);
    setPuzzle(generated);
    setPhase('playing');
  };

  // ─── Result modal content ─────────────────────────────────────────────────────
  const renderResultModal = () => {
    if (!puzzle || (phase !== 'won' && phase !== 'lost')) return null;

    const isWin = phase === 'won';
    const timeRemaining = timeLimitSeconds > 0 ? Math.max(0, timeLimitSeconds - elapsedSeconds) : 0;
    const finalScore = isWin
      ? calculateWordSearchScore(foundWordIds.length, timeRemaining, playMode)
      : score;
    const timeBonus = isWin && playMode === 'timed' ? timeRemaining * 2 : 0;

    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <Text style={styles.resultEmoji}>{isWin ? '🎉' : '⏰'}</Text>
            <Text style={[styles.resultTitle, { color: colors.text }]}>
              {isWin ? 'Puzzle Complete!' : "Time's Up!"}
            </Text>
            <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
              {isWin
                ? 'Great work finding all the ingredients!'
                : `You found ${foundWordIds.length} of ${puzzle.words.length} words`}
            </Text>

            {/* Score breakdown */}
            <View style={[styles.scoreBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <ScoreRow label="Words Found" value={`${foundWordIds.length} × 10`} color={colors.primary} />
              {playMode === 'timed' && isWin && (
                <ScoreRow label="Time Bonus" value={`+${timeBonus}`} color="#10B981" />
              )}
              <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
              <ScoreRow label="Total Score" value={String(finalScore)} color={colors.primary} bold />
            </View>

            {/* Word review */}
            <View style={[styles.reviewBox, { borderColor: colors.border }]}>
              <Text style={[styles.reviewTitle, { color: colors.text }]}>Word Review</Text>
              <ScrollView style={styles.reviewScroll} showsVerticalScrollIndicator={false}>
                {puzzle.words.map((word) => {
                  const wasFound = foundWordIds.includes(word.id);
                  return (
                    <View key={word.id} style={styles.reviewRow}>
                      <Text style={[styles.reviewCheck, { color: wasFound ? '#10B981' : '#EF4444' }]}>
                        {wasFound ? '✓' : '✗'}
                      </Text>
                      <Text style={[styles.reviewWordLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                        {word.displayLabel}
                      </Text>
                      <Text style={[styles.reviewSearchWord, { color: wasFound ? colors.primary : colors.textSecondary }]}>
                        {word.searchWord}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* Action buttons */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleRestart}
            >
              <Text style={styles.actionBtnText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => {
                setPhase('loading');
                router.replace('/word-search-game');
              }}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Back to Categories</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Loading state ────────────────────────────────────────────────────────────
  if (phase === 'loading' || !puzzle) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Building your puzzle...</Text>
      </View>
    );
  }

  // ─── Game screen ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HUD */}
      <WordSearchHUD
        category={category}
        difficulty={difficulty}
        playMode={playMode}
        score={score}
        wordsFound={foundWordIds.length}
        totalWords={puzzle.words.length}
        timeLimitSeconds={timeLimitSeconds}
        isComplete={phase !== 'playing'}
        onTimeExpired={handleTimeExpired}
        onTick={handleTick}
      />

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backChip, { backgroundColor: colors.card }]}
        onPress={() => router.replace('/word-search-game')}
      >
        <Text style={[styles.backChipText, { color: colors.textSecondary }]}>← Categories</Text>
      </TouchableOpacity>

      {/* Grid — does not scroll, sized to content */}
      <View style={styles.gridContainer}>
        <WordSearchGrid
          puzzle={puzzle}
          selectedCells={selectedCells}
          foundWordIds={foundWordIds}
          onSelectionChange={setSelectedCells}
          onWordFound={handleWordFound}
          disabled={phase !== 'playing'}
        />
      </View>

      {/* Word List — takes remaining space and scrolls */}
      <View style={[styles.wordListContainer, { borderTopColor: colors.border }]}>
        <WordSearchWordList
          words={puzzle.words}
          foundWordIds={foundWordIds}
          scrollable
        />
      </View>

      {/* Result modal */}
      {renderResultModal()}
    </View>
  );
}

function ScoreRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={[styles.scoreLabel, bold && styles.scoreLabelBold]}>{label}</Text>
      <Text style={[styles.scoreValue, { color }, bold && styles.scoreValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 15 },
  backChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backChipText: { fontSize: 13, fontWeight: '500' },
  gridContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  wordListContainer: {
    flex: 1,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    minHeight: 120,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  resultCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.25)',
    elevation: 12,
  },
  resultEmoji: { fontSize: 42, textAlign: 'center' },
  resultTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  resultSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scoreBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: { fontSize: 13, color: '#888' },
  scoreLabelBold: { fontWeight: '700', fontSize: 14, color: '#555' },
  scoreValue: { fontSize: 14, fontWeight: '600' },
  scoreValueBold: { fontSize: 16, fontWeight: '800' },
  scoreDivider: { height: 1, marginVertical: 2 },
  reviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  reviewScroll: { maxHeight: 160, paddingHorizontal: 12, paddingBottom: 8 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  reviewCheck: { fontSize: 14, fontWeight: '700', width: 18 },
  reviewWordLabel: { flex: 1, fontSize: 12 },
  reviewSearchWord: { fontSize: 12, fontWeight: '700' },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
