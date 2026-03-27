/**
 * Word Search Data Adapters
 * Fetches ingredient data from Supabase for each category and returns
 * structured word lists ready to be passed to the puzzle generator.
 */

import { supabase } from '@/app/integrations/supabase/client';
import { WordSearchCategory, WordSearchDifficulty } from '@/types/game';
import {
  extractIngredientWords,
  extractLibationWords,
  getDifficultyConfig,
} from '@/utils/game/wordSearchEngine';

export interface RawWordItem {
  searchWord: string;
  displayLabel: string;
  itemName: string;
}

// ─── Category → DB Query ──────────────────────────────────────────────────────

/**
 * Fetch raw word items for a given category + difficulty.
 * Returns an array ready for generateWordSearchPuzzle().
 */
export async function getWordsForCategory(
  category: WordSearchCategory,
  difficulty: WordSearchDifficulty
): Promise<RawWordItem[]> {
  const config = getDifficultyConfig(difficulty);

  switch (category) {
    case 'weekly_specials':
      return fetchMenuItemWords('Weekly Specials', config.itemCount);
    case 'lunch':
      return fetchMenuItemWords('Lunch', config.itemCount);
    case 'dinner':
      return fetchMenuItemWords('Dinner', config.itemCount);
    case 'happy_hour':
      return fetchMenuItemWords('Happy Hour', config.itemCount);
    case 'libations':
      return fetchLibationWords(config.itemCount);
    default:
      return [];
  }
}

// ─── Food Category Fetcher ────────────────────────────────────────────────────

async function fetchMenuItemWords(
  category: string,
  itemCount: number
): Promise<RawWordItem[]> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('name, description')
      .eq('is_active', true)
      .eq('category', category)
      .not('description', 'is', null);

    if (error || !data || data.length === 0) {
      return getFallbackWords();
    }

    // Shuffle and pick N items based on difficulty
    const shuffled = shuffleItems(data);
    const picked = shuffled.slice(0, itemCount);

    const allWords: RawWordItem[] = [];
    for (const item of picked) {
      if (!item.description) continue;
      const words = extractIngredientWords(item.description, item.name);
      allWords.push(...words);
    }

    const deduped = deduplicateWords(allWords);
    if (deduped.length < 4) return getFallbackWords();
    return deduped;
  } catch {
    return getFallbackWords();
  }
}

// ─── Libations Fetcher ────────────────────────────────────────────────────────

async function fetchLibationWords(itemCount: number): Promise<RawWordItem[]> {
  try {
    // Primary: libation_recipes (JSONB ingredients — cleanest data)
    const { data: recipes, error: recipeError } = await supabase
      .from('libation_recipes')
      .select('name, ingredients, category')
      .eq('is_active', true)
      .not('ingredients', 'is', null);

    // Secondary: menu_items with Libations category
    const { data: menuLibations, error: menuError } = await supabase
      .from('menu_items')
      .select('name, description')
      .eq('is_active', true)
      .eq('category', 'Libations')
      .not('description', 'is', null);

    const allWords: RawWordItem[] = [];

    // Add from libation_recipes (JSONB — cleanest)
    if (!recipeError && recipes && recipes.length > 0) {
      const shuffled = shuffleItems(recipes);
      const picked = shuffled.slice(0, itemCount);
      for (const recipe of picked) {
        if (!recipe.ingredients) continue;
        const ingArray = Array.isArray(recipe.ingredients)
          ? (recipe.ingredients as Array<{ amount: string; ingredient: string }>)
          : [];
        const words = extractLibationWords(ingArray, recipe.name);
        allWords.push(...words);
      }
    }

    // Supplement with menu_items libations descriptions
    if (!menuError && menuLibations && menuLibations.length > 0 && allWords.length < 4) {
      const shuffled = shuffleItems(menuLibations);
      const supplement = shuffled.slice(0, itemCount);
      for (const item of supplement) {
        if (!item.description) continue;
        const words = extractIngredientWords(item.description, item.name);
        allWords.push(...words);
      }
    }

    const deduped = deduplicateWords(allWords);
    if (deduped.length < 4) return getFallbackLibationWords();
    return deduped;
  } catch {
    return getFallbackLibationWords();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleItems<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deduplicateWords(words: RawWordItem[]): RawWordItem[] {
  const seen = new Set<string>();
  return words.filter((w) => {
    if (seen.has(w.searchWord)) return false;
    seen.add(w.searchWord);
    return true;
  });
}

// ─── Fallback Data ────────────────────────────────────────────────────────────

function getFallbackWords(): RawWordItem[] {
  return [
    { searchWord: 'ROMAINE', displayLabel: 'Romaine', itemName: 'Classic Caesar' },
    { searchWord: 'PARMESAN', displayLabel: 'Parmesan', itemName: 'Classic Caesar' },
    { searchWord: 'CROUTON', displayLabel: 'Crouton', itemName: 'Classic Caesar' },
    { searchWord: 'AVOCADO', displayLabel: 'Avocado', itemName: 'Chicken Cobb' },
    { searchWord: 'BACON', displayLabel: 'Bacon', itemName: 'Chicken Cobb' },
    { searchWord: 'TOMATO', displayLabel: 'Tomato', itemName: 'Chicken Cobb' },
    { searchWord: 'ARUGULA', displayLabel: 'Arugula', itemName: 'Steak & Burrata' },
    { searchWord: 'APPLE', displayLabel: 'Apple', itemName: 'Steak & Burrata' },
  ];
}

function getFallbackLibationWords(): RawWordItem[] {
  return [
    { searchWord: 'VODKA', displayLabel: 'Vodka', itemName: 'Espresso Martini' },
    { searchWord: 'ESPRESSO', displayLabel: 'Espresso', itemName: 'Espresso Martini' },
    { searchWord: 'CHAMBORD', displayLabel: 'Chambord', itemName: 'French Martini' },
    { searchWord: 'PINEAPPLE', displayLabel: 'Pineapple', itemName: 'French Martini' },
    { searchWord: 'PROSECCO', displayLabel: 'Prosecco', itemName: 'Berry Bubbly' },
    { searchWord: 'BLUEBERRY', displayLabel: 'Blueberry', itemName: 'Berry Bubbly' },
    { searchWord: 'AMARETTO', displayLabel: 'Amaretto', itemName: 'Amaretto Sour' },
    { searchWord: 'LEMON', displayLabel: 'Lemon Juice', itemName: 'Amaretto Sour' },
  ];
}
