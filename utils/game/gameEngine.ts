import { CardData, DifficultyConfig, GameState, GameMode } from '@/types/game';

// Difficulty configurations
export const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  { level: 1, gridRows: 2, gridCols: 3, totalPairs: 3, startingLives: 5 },
  { level: 2, gridRows: 2, gridCols: 4, totalPairs: 4, startingLives: 4 },
  { level: 3, gridRows: 3, gridCols: 4, totalPairs: 6, startingLives: 4 },
  { level: 4, gridRows: 4, gridCols: 4, totalPairs: 8, startingLives: 3 },
  { level: 5, gridRows: 4, gridCols: 5, totalPairs: 10, startingLives: 3 },
];

export function getDifficultyConfig(level: number): DifficultyConfig {
  const clamped = Math.max(1, Math.min(level, DIFFICULTY_CONFIGS.length));
  return DIFFICULTY_CONFIGS[clamped - 1];
}

export function getMaxDifficulty(): number {
  return DIFFICULTY_CONFIGS.length;
}

// Fisher-Yates shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Select N random items from an array
export function selectRandom<T>(array: T[], count: number): T[] {
  if (count >= array.length) return shuffleArray(array);
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, count);
}

// Create a pair of cards from primary/match text
export function createCardPair(
  pairId: string,
  primaryText: string,
  matchText: string,
  primarySubtext?: string,
  matchSubtext?: string,
): [CardData, CardData] {
  return [
    {
      id: `${pairId}-primary`,
      pairId,
      displayText: primaryText,
      displaySubtext: primarySubtext,
      cardType: 'primary',
    },
    {
      id: `${pairId}-match`,
      pairId,
      displayText: matchText,
      displaySubtext: matchSubtext,
      cardType: 'match',
    },
  ];
}

// Initialize a new game state
export function createInitialGameState(
  cards: CardData[],
  startingLives: number,
): GameState {
  return {
    cards: shuffleArray(cards),
    flippedIndices: [],
    matchedPairIds: [],
    lives: startingLives,
    score: 0,
    moveCount: 0,
    startTime: Date.now(),
    isComplete: false,
    isWin: false,
    isProcessing: false,
  };
}

// Check if two flipped cards match
export function checkMatch(
  state: GameState,
  index1: number,
  index2: number,
): { isMatch: boolean; pairId: string } {
  const card1 = state.cards[index1];
  const card2 = state.cards[index2];
  return {
    isMatch: card1.pairId === card2.pairId,
    pairId: card1.pairId,
  };
}

// Process a match result and return new game state
export function processMatch(
  state: GameState,
  pairId: string,
  difficulty: number,
): GameState {
  const newMatchedPairIds = [...state.matchedPairIds, pairId];
  const matchScore = 100 * difficulty;
  const newScore = state.score + matchScore;
  const totalPairs = state.cards.length / 2;
  const isWin = newMatchedPairIds.length === totalPairs;

  let finalScore = newScore;
  if (isWin) {
    // Lives bonus
    finalScore += state.lives * 50 * difficulty;
    // Perfect game bonus (no mismatches at all)
    const mismatches = state.moveCount + 1 - newMatchedPairIds.length;
    if (mismatches === 0) {
      finalScore += 500 * difficulty;
    }
  }

  return {
    ...state,
    matchedPairIds: newMatchedPairIds,
    flippedIndices: [],
    score: finalScore,
    moveCount: state.moveCount + 1,
    isComplete: isWin,
    isWin,
    isProcessing: false,
  };
}

// Process a mismatch result and return new game state
export function processMismatch(state: GameState): GameState {
  const newLives = state.lives - 1;
  const isGameOver = newLives <= 0;

  return {
    ...state,
    flippedIndices: [],
    lives: newLives,
    moveCount: state.moveCount + 1,
    isComplete: isGameOver,
    isWin: false,
    isProcessing: false,
  };
}

// Calculate elapsed time in seconds
export function getElapsedSeconds(startTime: number): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

// Format seconds as M:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Get display name for a game mode
export function getModeName(mode: GameMode): string {
  switch (mode) {
    case 'wine_pairings': return 'Wine & Entree Pairings';
    case 'ingredients_dishes': return 'Ingredients & Dishes';
    case 'cocktail_ingredients': return 'Cocktails & Ingredients';
  }
}
