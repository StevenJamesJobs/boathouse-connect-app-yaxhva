// Game type definitions for Menu Memory Game

export type GameMode = 'wine_pairings' | 'ingredients_dishes' | 'cocktail_ingredients';
export type PlayMode = 'lives' | 'timed';

export interface CardData {
  id: string;
  pairId: string;        // matching cards share this
  displayText: string;   // text shown on card face
  displaySubtext?: string;
  cardType: 'primary' | 'match';
}

export interface DifficultyConfig {
  level: number;
  gridRows: number;
  gridCols: number;
  totalPairs: number;
  startingLives: number;
  timeLimitSeconds: number;
}

export interface GameConfig {
  mode: GameMode;
  difficulty: DifficultyConfig;
}

export interface GameState {
  cards: CardData[];
  flippedIndices: number[];
  matchedPairIds: string[];
  lives: number;
  score: number;
  moveCount: number;
  startTime: number;
  isComplete: boolean;
  isWin: boolean;
  isProcessing: boolean; // prevents taps during mismatch animation
  seenCardIds: string[]; // tracks cards flipped at least once (for grace period)
  playMode: PlayMode;
}

export interface GameScore {
  id?: string;
  user_id: string;
  game_mode: GameMode;
  play_mode: PlayMode;
  difficulty: number;
  score: number;
  time_seconds: number;
  pairs_matched: number;
  total_pairs: number;
  lives_remaining: number;
  completed: boolean;
  created_at?: string;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  best_score: number;
  games_played: number;
}

export interface WinePairing {
  wine: string;
  entree: string;
  hint?: string;
}

export interface IngredientDishPair {
  ingredient: string;
  dish: string;
}

export interface CocktailPair {
  ingredient: string;
  cocktail: string;
}

// ─── Word Search Types ────────────────────────────────────────────────────────

export type WordSearchCategory =
  | 'weekly_specials'
  | 'lunch'
  | 'dinner'
  | 'happy_hour'
  | 'libations';

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard';
export type WordSearchPlayMode = 'free' | 'timed';

export interface GridCell {
  row: number;
  col: number;
}

export interface WordSearchWord {
  id: string;
  searchWord: string;       // uppercase, letters only — what's hidden in grid
  displayLabel: string;     // full ingredient phrase shown in word list
  itemName: string;         // which menu item this belongs to
  found: boolean;
  cells: GridCell[];        // positions in the grid this word occupies
  direction: GridCell;      // unit direction vector
}

export interface WordSearchPuzzle {
  grid: string[][];         // 2D letter grid
  words: WordSearchWord[];
  rows: number;
  cols: number;
}

export interface WordSearchGameState {
  puzzle: WordSearchPuzzle;
  selectedCells: GridCell[];
  foundWordIds: string[];
  score: number;
  startTime: number;
  isComplete: boolean;
  timeExpired: boolean;
}

export interface WordSearchScore {
  id?: string;
  user_id: string;
  category: WordSearchCategory;
  difficulty: WordSearchDifficulty;
  play_mode: WordSearchPlayMode;
  score: number;
  words_found: number;
  total_words: number;
  time_seconds: number;
  completed: boolean;
  created_at?: string;
}

export interface WordSearchLeaderboardEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  best_score: number;
  games_played: number;
}

export const WORD_SEARCH_CATEGORY_INFO: Record<
  WordSearchCategory,
  { labelKey: string; descKey: string; icon: { ios: string; android: string }; color: string }
> = {
  weekly_specials: {
    labelKey: 'word_search.cat_weekly_specials',
    descKey: 'word_search.cat_weekly_specials_desc',
    icon: { ios: 'sparkles', android: 'auto-awesome' },
    color: '#F59E0B',
  },
  lunch: {
    labelKey: 'word_search.cat_lunch',
    descKey: 'word_search.cat_lunch_desc',
    icon: { ios: 'sun.max.fill', android: 'wb-sunny' },
    color: '#10B981',
  },
  dinner: {
    labelKey: 'word_search.cat_dinner',
    descKey: 'word_search.cat_dinner_desc',
    icon: { ios: 'moon.stars.fill', android: 'nights-stay' },
    color: '#6366F1',
  },
  happy_hour: {
    labelKey: 'word_search.cat_happy_hour',
    descKey: 'word_search.cat_happy_hour_desc',
    icon: { ios: 'star.fill', android: 'star' },
    color: '#EC4899',
  },
  libations: {
    labelKey: 'word_search.cat_libations',
    descKey: 'word_search.cat_libations_desc',
    icon: { ios: 'wineglass.fill', android: 'local-bar' },
    color: '#8B5CF6',
  },
};

export const WORD_SEARCH_CATEGORIES: WordSearchCategory[] = [
  'weekly_specials',
  'lunch',
  'dinner',
  'happy_hour',
  'libations',
];

// ─── Memory Game Mode Info ────────────────────────────────────────────────────

export const GAME_MODE_INFO: Record<GameMode, { titleKey: string; descKey: string; icon: { ios: string; android: string } }> = {
  wine_pairings: {
    titleKey: 'memory_game.mode_wine_pairings',
    descKey: 'memory_game.mode_wine_pairings_desc',
    icon: { ios: 'wineglass.fill', android: 'wine-bar' },
  },
  ingredients_dishes: {
    titleKey: 'memory_game.mode_ingredients_dishes',
    descKey: 'memory_game.mode_ingredients_dishes_desc',
    icon: { ios: 'fork.knife', android: 'restaurant' },
  },
  cocktail_ingredients: {
    titleKey: 'memory_game.mode_cocktail_ingredients',
    descKey: 'memory_game.mode_cocktail_ingredients_desc',
    icon: { ios: 'cup.and.saucer.fill', android: 'local-bar' },
  },
};
