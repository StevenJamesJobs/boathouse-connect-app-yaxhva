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

// Consolidated 2026-07: the old weekly_specials/lunch/dinner/happy_hour food
// categories collapsed into one whole-menu "Dishes & Ingredients" pool, and
// libations gained the Cocktails A-Z recipes — org menus are custom-category
// shaped, so per-meal splits no longer map to anything real.
export type WordSearchCategory = 'dishes_ingredients' | 'libations_ingredients';

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
  dishes_ingredients: {
    labelKey: 'word_search.cat_dishes_ingredients',
    descKey: 'word_search.cat_dishes_ingredients_desc',
    icon: { ios: 'fork.knife', android: 'restaurant' },
    color: '#10B981',
  },
  libations_ingredients: {
    labelKey: 'word_search.cat_libations_ingredients',
    descKey: 'word_search.cat_libations_ingredients_desc',
    icon: { ios: 'wineglass.fill', android: 'local-bar' },
    color: '#8B5CF6',
  },
};

export const WORD_SEARCH_CATEGORIES: WordSearchCategory[] = [
  'dishes_ingredients',
  'libations_ingredients',
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
