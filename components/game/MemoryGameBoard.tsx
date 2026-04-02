import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CardData, DifficultyConfig, GameState, PlayMode } from '@/types/game';
import {
  createInitialGameState,
  checkMatch,
  processMatch,
  processMismatch,
  isGraceMismatch,
  processGraceMismatch,
} from '@/utils/game/gameEngine';
import MemoryCard from './MemoryCard';

const MISMATCH_DELAY = 1400;
const CARD_GAP = 8; // total gap between cards
const BOARD_PADDING = 16;

interface MemoryGameBoardProps {
  cards: CardData[];
  difficulty: DifficultyConfig;
  playMode: PlayMode;
  timeRemaining?: number;
  onGameStateChange: (state: GameState) => void;
  onMatch: () => void;
  onMismatch: () => void;
  onGraceMismatch?: () => void;
  onGameComplete: (state: GameState) => void;
}

export default function MemoryGameBoard({
  cards,
  difficulty,
  playMode,
  timeRemaining,
  onGameStateChange,
  onMatch,
  onMismatch,
  onGraceMismatch,
  onGameComplete,
}: MemoryGameBoardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(cards, difficulty.startingLives, playMode)
  );
  const mismatchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate card size based on screen width and grid dimensions
  // Account for board padding + gaps between cards + card's own margin (4px each side)
  const availableWidth = screenWidth - BOARD_PADDING * 2;
  const totalGaps = (difficulty.gridCols - 1) * CARD_GAP + difficulty.gridCols * 8; // 8 = 4px margin each side
  const cardSize = Math.max(Math.floor((availableWidth - totalGaps) / difficulty.gridCols), 60);

  // Notify parent of state changes
  useEffect(() => {
    onGameStateChange(gameState);
  }, [gameState]);

  // Check for game completion
  useEffect(() => {
    if (gameState.isComplete) {
      onGameComplete(gameState);
    }
  }, [gameState.isComplete]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (mismatchTimeout.current) clearTimeout(mismatchTimeout.current);
    };
  }, []);

  const handleCardPress = useCallback(
    (index: number) => {
      // Ignore if processing, card already flipped, or card already matched
      if (gameState.isProcessing || gameState.isComplete) return;
      const card = gameState.cards[index];
      if (gameState.matchedPairIds.includes(card.pairId)) return;
      if (gameState.flippedIndices.includes(index)) return;

      // Haptic on flip
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const newFlipped = [...gameState.flippedIndices, index];

      if (newFlipped.length < 2) {
        // First card flipped
        setGameState(prev => ({ ...prev, flippedIndices: newFlipped }));
      } else if (newFlipped.length === 2) {
        // Two cards flipped — check for match
        setGameState(prev => ({
          ...prev,
          flippedIndices: newFlipped,
          isProcessing: true,
        }));

        const { isMatch, pairId } = checkMatch(
          { ...gameState, flippedIndices: newFlipped },
          newFlipped[0],
          newFlipped[1]
        );

        if (isMatch) {
          // Match found!
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onMatch();

          // Delay so the player sees both cards in the preview bar, then process match
          setTimeout(() => {
            setGameState(prev => processMatch(prev, pairId, difficulty.level, timeRemaining));
          }, 800);
        } else {
          // Check if this is a grace mismatch (at least one unseen card)
          const grace = isGraceMismatch(
            { ...gameState, flippedIndices: newFlipped },
            newFlipped[0],
            newFlipped[1]
          );

          if (grace) {
            // Grace mismatch — lighter haptic, no life lost
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onGraceMismatch?.();
          } else {
            // Real mismatch — error haptic
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            onMismatch();
          }

          mismatchTimeout.current = setTimeout(() => {
            setGameState(prev => grace ? processGraceMismatch(prev) : processMismatch(prev));
          }, MISMATCH_DELAY);
        }
      }
    },
    [gameState, difficulty.level, onMatch, onMismatch]
  );

  // Render grid
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < difficulty.gridRows; r++) {
    const rowCards: React.ReactNode[] = [];
    for (let c = 0; c < difficulty.gridCols; c++) {
      const index = r * difficulty.gridCols + c;
      if (index >= gameState.cards.length) break;

      const card = gameState.cards[index];
      const isFlipped = gameState.flippedIndices.includes(index);
      const isMatched = gameState.matchedPairIds.includes(card.pairId);

      rowCards.push(
        <MemoryCard
          key={card.id}
          card={card}
          isFlipped={isFlipped}
          isMatched={isMatched}
          onPress={() => handleCardPress(index)}
          size={cardSize}
          disabled={gameState.isProcessing || gameState.isComplete}
        />
      );
    }
    rows.push(
      <View key={`row-${r}`} style={styles.row}>
        {rowCards}
      </View>
    );
  }

  return (
    <View style={[styles.board, { padding: BOARD_PADDING }]}>
      {rows}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
