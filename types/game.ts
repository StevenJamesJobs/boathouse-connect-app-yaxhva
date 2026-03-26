// Game type definitions for Menu Memory Game

export type GameMode = 'wine_pairings' | 'ingredients_dishes' | 'cocktail_ingredients';

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
}

export interface GameScore {
  id?: string;
  user_id: string;
  game_mode: GameMode;
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
