import { CardData, DifficultyConfig, GameState, GameMode, PlayMode } from '@/types/game';

// Difficulty configurations
export const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  { level: 1, gridRows: 2, gridCols: 3, totalPairs: 3, startingLives: 7, timeLimitSeconds: 45 },
  { level: 2, gridRows: 2, gridCols: 4, totalPairs: 4, startingLives: 6, timeLimitSeconds: 60 },
  { level: 3, gridRows: 3, gridCols: 4, totalPairs: 6, startingLives: 6, timeLimitSeconds: 90 },
  { level: 4, gridRows: 4, gridCols: 4, totalPairs: 8, startingLives: 5, timeLimitSeconds: 120 },
  { level: 5, gridRows: 4, gridCols: 5, totalPairs: 10, startingLives: 5, timeLimitSeconds: 180 },
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
  playMode: PlayMode = 'lives',
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
    seenCardIds: [],
    playMode,
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
  timeRemaining?: number,
): GameState {
  const newMatchedPairIds = [...state.matchedPairIds, pairId];
  const matchScore = 100 * difficulty;
  const newScore = state.score + matchScore;
  const totalPairs = state.cards.length / 2;
  const isWin = newMatchedPairIds.length === totalPairs;

  // Track seen cards
  const card1Id = state.cards[state.flippedIndices[0]]?.id;
  const card2Id = state.cards[state.flippedIndices[1]]?.id;
  const newSeenCardIds = [...state.seenCardIds];
  if (card1Id && !newSeenCardIds.includes(card1Id)) newSeenCardIds.push(card1Id);
  if (card2Id && !newSeenCardIds.includes(card2Id)) newSeenCardIds.push(card2Id);

  let finalScore = newScore;
  if (isWin) {
    if (state.playMode === 'timed' && timeRemaining != null) {
      // Time bonus for timed mode
      finalScore += timeRemaining * 10 * difficulty;
    } else {
      // Lives bonus for lives mode
      finalScore += state.lives * 50 * difficulty;
    }
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
    seenCardIds: newSeenCardIds,
  };
}

// Check if a mismatch is a grace mismatch (at least one card never seen before)
export function isGraceMismatch(state: GameState, index1: number, index2: number): boolean {
  if (state.playMode !== 'lives') return false;
  const card1 = state.cards[index1];
  const card2 = state.cards[index2];
  // Grace: at least one card has never been seen before
  return !state.seenCardIds.includes(card1.id) || !state.seenCardIds.includes(card2.id);
}

// Process a grace mismatch — does NOT cost a life, but tracks seen cards
export function processGraceMismatch(state: GameState): GameState {
  const card1Id = state.cards[state.flippedIndices[0]]?.id;
  const card2Id = state.cards[state.flippedIndices[1]]?.id;
  const newSeenCardIds = [...state.seenCardIds];
  if (card1Id && !newSeenCardIds.includes(card1Id)) newSeenCardIds.push(card1Id);
  if (card2Id && !newSeenCardIds.includes(card2Id)) newSeenCardIds.push(card2Id);

  return {
    ...state,
    flippedIndices: [],
    moveCount: state.moveCount + 1,
    isProcessing: false,
    seenCardIds: newSeenCardIds,
  };
}

// Process a mismatch result and return new game state
export function processMismatch(state: GameState): GameState {
  const newLives = state.lives - 1;
  const isGameOver = state.playMode === 'lives' && newLives <= 0;

  // Track seen cards
  const card1Id = state.cards[state.flippedIndices[0]]?.id;
  const card2Id = state.cards[state.flippedIndices[1]]?.id;
  const newSeenCardIds = [...state.seenCardIds];
  if (card1Id && !newSeenCardIds.includes(card1Id)) newSeenCardIds.push(card1Id);
  if (card2Id && !newSeenCardIds.includes(card2Id)) newSeenCardIds.push(card2Id);

  return {
    ...state,
    flippedIndices: [],
    lives: state.playMode === 'lives' ? newLives : state.lives,
    moveCount: state.moveCount + 1,
    isComplete: isGameOver,
    isWin: false,
    isProcessing: false,
    seenCardIds: newSeenCardIds,
  };
}

// Process a timeout (timed mode game over)
export function processTimeout(state: GameState): GameState {
  return {
    ...state,
    isComplete: true,
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
