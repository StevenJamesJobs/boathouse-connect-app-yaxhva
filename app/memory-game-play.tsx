import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { GameMode, GameState, CardData } from '@/types/game';
import {
  getDifficultyConfig,
  getMaxDifficulty,
  getElapsedSeconds,
  getModeName,
} from '@/utils/game/gameEngine';
import { generateCards } from '@/utils/game/gameDataAdapters';
import MemoryGameBoard from '@/components/game/MemoryGameBoard';
import GameHUD from '@/components/game/GameHUD';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

export default function MemoryGamePlayScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode: string; difficulty: string }>();

  const mode = (params.mode || 'wine_pairings') as GameMode;
  const difficultyLevel = parseInt(params.difficulty || '1', 10);
  const difficultyConfig = getDifficultyConfig(difficultyLevel);

  const [cards, setCards] = useState<CardData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [gameKey, setGameKey] = useState(0); // for restarting

  // Load cards on mount or restart
  useEffect(() => {
    loadCards();
  }, [gameKey]);

  const loadCards = async () => {
    setLoading(true);
    setShowResults(false);
    setScoreSaved(false);
    try {
      const generatedCards = await generateCards(mode, difficultyConfig.totalPairs);
      setCards(generatedCards);
    } catch (e) {
      console.error('Error generating cards:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleGameStateChange = useCallback((state: GameState) => {
    setGameState(state);
  }, []);

  const handleMatch = useCallback(() => {
    // Additional match feedback can go here
  }, []);

  const handleMismatch = useCallback(() => {
    // Additional mismatch feedback can go here
  }, []);

  const handleGameComplete = useCallback(async (finalState: GameState) => {
    // Haptic for game end
    if (finalState.isWin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    setShowResults(true);

    // Save score to database
    if (user?.id) {
      try {
        const elapsed = getElapsedSeconds(finalState.startTime);
        await (supabase.from('game_scores') as any).insert({
          user_id: user.id,
          game_mode: mode,
          difficulty: difficultyLevel,
          score: finalState.score,
          time_seconds: elapsed,
          pairs_matched: finalState.matchedPairIds.length,
          total_pairs: difficultyConfig.totalPairs,
          lives_remaining: finalState.lives,
          completed: finalState.isWin,
        });
        setScoreSaved(true);
      } catch (e) {
        console.error('Error saving score:', e);
      }
    }
  }, [user?.id, mode, difficultyLevel, difficultyConfig.totalPairs]);

  const handlePlayAgain = () => {
    setGameKey(prev => prev + 1);
  };

  const handleNextDifficulty = () => {
    const next = Math.min(difficultyLevel + 1, getMaxDifficulty());
    router.replace(`/memory-game-play?mode=${mode}&difficulty=${next}`);
  };

  const handleBackToHub = () => {
    router.back();
  };

  // Extract matched pairs for the review section
  const getMatchedPairs = () => {
    if (!gameState || !cards) return [];
    const pairs: { primary: string; match: string }[] = [];
    const seenPairIds = new Set<string>();

    for (const card of gameState.cards) {
      if (gameState.matchedPairIds.includes(card.pairId) && !seenPairIds.has(card.pairId)) {
        seenPairIds.add(card.pairId);
        const primary = gameState.cards.find(c => c.pairId === card.pairId && c.cardType === 'primary');
        const match = gameState.cards.find(c => c.pairId === card.pairId && c.cardType === 'match');
        if (primary && match) {
          pairs.push({ primary: primary.displayText, match: match.displayText });
        }
      }
    }
    return pairs;
  };

  if (loading || !cards) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('memory_game.loading')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBackToHub} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {getModeName(mode)}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* HUD */}
      <GameHUD
        lives={gameState?.lives ?? difficultyConfig.startingLives}
        maxLives={difficultyConfig.startingLives}
        score={gameState?.score ?? 0}
        difficulty={difficultyLevel}
        startTime={gameState?.startTime ?? Date.now()}
        isComplete={gameState?.isComplete ?? false}
        matchedCount={gameState?.matchedPairIds.length ?? 0}
        totalPairs={difficultyConfig.totalPairs}
      />

      {/* Game Board */}
      <MemoryGameBoard
        key={gameKey}
        cards={cards}
        difficulty={difficultyConfig}
        onGameStateChange={handleGameStateChange}
        onMatch={handleMatch}
        onMismatch={handleMismatch}
        onGameComplete={handleGameComplete}
      />

      {/* Results Modal */}
      <Modal
        visible={showResults}
        transparent
        animationType="fade"
        onRequestClose={handleBackToHub}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.resultsCard, { backgroundColor: colors.card }]}>
              {/* Result Header */}
              <Text style={styles.resultEmoji}>
                {gameState?.isWin ? '🎉' : '💔'}
              </Text>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {gameState?.isWin ? t('memory_game.you_won') : t('memory_game.game_over')}
              </Text>

              {/* Score Breakdown */}
              <View style={[styles.scoreBreakdown, { backgroundColor: colors.background }]}>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
                    {t('memory_game.pairs_matched')}
                  </Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>
                    {gameState?.matchedPairIds.length ?? 0}/{difficultyConfig.totalPairs}
                  </Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
                    {t('memory_game.lives_remaining')}
                  </Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>
                    {gameState?.lives ?? 0}
                  </Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
                    {t('memory_game.time_elapsed')}
                  </Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>
                    {gameState ? `${getElapsedSeconds(gameState.startTime)}s` : '0s'}
                  </Text>
                </View>
                <View style={[styles.scoreRow, styles.totalRow]}>
                  <Text style={[styles.totalLabel, { color: colors.primary }]}>
                    {t('memory_game.total_score')}
                  </Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>
                    {(gameState?.score ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Matched Pairs Review (shown on win) */}
              {gameState?.isWin && (
                <View style={[styles.pairsReview, { backgroundColor: colors.background }]}>
                  <Text style={[styles.pairsReviewTitle, { color: colors.text }]}>
                    {t('memory_game.your_matches')}
                  </Text>
                  {getMatchedPairs().map((pair, i) => (
                    <View
                      key={i}
                      style={[styles.pairRow, { borderBottomColor: colors.border }]}
                    >
                      <Text style={[styles.pairPrimary, { color: colors.primary }]} numberOfLines={2}>
                        {pair.primary}
                      </Text>
                      <Text style={[styles.pairArrow, { color: colors.textSecondary }]}>→</Text>
                      <Text style={[styles.pairMatch, { color: colors.text }]} numberOfLines={2}>
                        {pair.match}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                  onPress={handlePlayAgain}
                >
                  <IconSymbol
                    ios_icon_name="arrow.counterclockwise"
                    android_material_icon_name="replay"
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.actionButtonText}>
                    {t('memory_game.play_again')}
                  </Text>
                </TouchableOpacity>

                {gameState?.isWin && difficultyLevel < getMaxDifficulty() && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary }]}
                    onPress={handleNextDifficulty}
                  >
                    <IconSymbol
                      ios_icon_name="arrow.right"
                      android_material_icon_name="arrow-forward"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.actionButtonText}>
                      {t('memory_game.next_level')}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: colors.border }]}
                  onPress={handleBackToHub}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                    {t('memory_game.back_to_hub')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  // Results Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultsCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  resultEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  scoreBreakdown: {
    width: '100%',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  scoreLabel: {
    fontSize: 13,
  },
  scoreValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    marginTop: 4,
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  actionButtons: {
    width: '100%',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Pairs Review
  pairsReview: {
    width: '100%',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  pairsReviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pairPrimary: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    paddingRight: 6,
  },
  pairArrow: {
    fontSize: 16,
    paddingHorizontal: 4,
  },
  pairMatch: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingLeft: 6,
  },
});
