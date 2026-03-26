import { CardData, GameMode } from '@/types/game';
import { createCardPair, selectRandom } from './gameEngine';
import { WINE_PAIRINGS } from './winePairings';
import { supabase } from '@/app/integrations/supabase/client';

// Generate card pairs for a specific game mode and pair count
export async function generateCards(mode: GameMode, pairCount: number): Promise<CardData[]> {
  switch (mode) {
    case 'wine_pairings':
      return await generateWinePairingCards(pairCount);
    case 'ingredients_dishes':
      return await generateIngredientDishCards(pairCount);
    case 'cocktail_ingredients':
      return await generateCocktailCards(pairCount);
  }
}

// Mode 1: Wine & Entree Pairings (from DB with static fallback)
async function generateWinePairingCards(pairCount: number): Promise<CardData[]> {
  // Try fetching from DB first
  try {
    const { data: dbPairings, error } = await supabase
      .from('wine_pairings' as any)
      .select('wine, entree, hint')
      .eq('is_active', true)
      .order('display_order');

    if (!error && dbPairings && dbPairings.length > 0) {
      const selected = selectRandom(dbPairings as any[], pairCount);
      const cards: CardData[] = [];
      selected.forEach((pairing: any, i: number) => {
        const [primary, match] = createCardPair(
          `wine-${i}`,
          pairing.wine,
          pairing.entree,
          'Wine',
          'Entree',
        );
        cards.push(primary, match);
      });
      return cards;
    }
  } catch (e) {
    console.warn('Failed to fetch wine pairings from DB, using fallback:', e);
  }

  // Fallback to static data
  const selected = selectRandom(WINE_PAIRINGS, pairCount);
  const cards: CardData[] = [];
  selected.forEach((pairing, i) => {
    const [primary, match] = createCardPair(
      `wine-${i}`,
      pairing.wine,
      pairing.entree,
      'Wine',
      'Entree',
    );
    cards.push(primary, match);
  });
  return cards;
}

// Mode 2: Ingredients to Dishes (from menu_items table)
async function generateIngredientDishCards(pairCount: number): Promise<CardData[]> {
  const { data: menuItems, error } = await supabase
    .from('menu_items')
    .select('id, name, description')
    .eq('is_active', true)
    .in('category', ['Dinner', 'Lunch'])
    .not('description', 'is', null) as { data: { id: string; name: string; description: string | null }[] | null; error: any };

  if (error || !menuItems || menuItems.length === 0) {
    // Fallback to wine pairings if menu data unavailable
    return generateWinePairingCards(pairCount);
  }

  // Parse descriptions to extract key ingredients
  const pairs = menuItems
    .filter(item => item.description && item.description.length > 5)
    .map(item => ({
      ingredient: extractKeyIngredient(item.description || ''),
      dish: item.name,
      id: item.id,
    }))
    .filter(p => p.ingredient.length > 0);

  const selected = selectRandom(pairs, pairCount);
  const cards: CardData[] = [];

  selected.forEach((pair, i) => {
    const [primary, match] = createCardPair(
      `dish-${i}`,
      pair.ingredient,
      pair.dish,
      'Ingredient',
      'Dish',
    );
    cards.push(primary, match);
  });

  return cards;
}

// Mode 3: Cocktail Ingredients to Cocktails (from cocktails + libation_recipes)
async function generateCocktailCards(pairCount: number): Promise<CardData[]> {
  // Fetch from both tables
  type CocktailRow = { id: string; name: string; ingredients: string | null; alcohol_type: string };
  type LibationRow = { id: string; name: string; ingredients: any; category: string };

  const [cocktailsResult, libationsResult] = await Promise.all([
    supabase
      .from('cocktails')
      .select('id, name, ingredients, alcohol_type')
      .eq('is_active', true) as unknown as { data: CocktailRow[] | null; error: any },
    supabase
      .from('libation_recipes')
      .select('id, name, ingredients, category')
      .eq('is_active', true) as unknown as { data: LibationRow[] | null; error: any },
  ]);

  const allPairs: { ingredient: string; cocktail: string; id: string }[] = [];

  // Process cocktails (ingredients is newline/comma-separated text)
  if (cocktailsResult.data) {
    cocktailsResult.data.forEach(c => {
      const mainIngredient = extractCocktailMainIngredient(c.ingredients || '', c.alcohol_type);
      if (mainIngredient) {
        allPairs.push({ ingredient: mainIngredient, cocktail: c.name.trim(), id: c.id });
      }
    });
  }

  // Process libation recipes (ingredients is JSON array)
  if (libationsResult.data) {
    libationsResult.data.forEach(r => {
      const ingredients = r.ingredients as { amount: string; ingredient: string }[] | null;
      if (ingredients && ingredients.length > 0) {
        // Use the first main spirit/ingredient
        const main = ingredients[0].ingredient.trim();
        allPairs.push({ ingredient: main, cocktail: r.name.trim(), id: r.id });
      }
    });
  }

  if (allPairs.length === 0) {
    return generateWinePairingCards(pairCount);
  }

  const selected = selectRandom(allPairs, pairCount);
  const cards: CardData[] = [];

  selected.forEach((pair, i) => {
    const [primary, match] = createCardPair(
      `cocktail-${i}`,
      pair.ingredient,
      pair.cocktail,
      'Ingredient',
      'Cocktail',
    );
    cards.push(primary, match);
  });

  return cards;
}

// Extract a key ingredient phrase from a menu item description
// Descriptions look like: "Asparagus, roasted red bliss potatoes, housemade tartar sauce"
// We pick the first distinctive item
function extractKeyIngredient(description: string): string {
  // Clean HTML formatting tags
  const clean = description
    .replace(/<[^>]+>/g, '')
    .replace(/\r?\n/g, ', ')
    .trim();

  // Split by comma and pick the most distinctive ingredient
  const parts = clean.split(',').map(s => s.trim()).filter(s => s.length > 2);
  if (parts.length === 0) return '';

  // Try to find a protein or standout ingredient (skip generic sides)
  const genericWords = ['french fries', 'side salad', 'bread', 'butter', 'salt', 'pepper'];
  const distinctive = parts.find(
    p => !genericWords.some(g => p.toLowerCase().includes(g))
  );

  return distinctive || parts[0];
}

// Extract the main spirit from a cocktails ingredients text
// Format: "4 oz. ginger beer \r\n0.25 oz. lime \r\nFloat 2 oz. dark rum"
function extractCocktailMainIngredient(ingredientsText: string, alcoholType: string): string {
  // Parse the newline-separated ingredient list
  const lines = ingredientsText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return alcoholType || '';

  // Try to find the main spirit line (usually has the most volume or is the base)
  for (const line of lines) {
    // Remove measurement prefix (e.g., "2 oz.", "1.5 oz.")
    const cleaned = line
      .replace(/^[\d.]+\s*oz\.?\s*/i, '')
      .replace(/^Float\s+[\d.]+\s*oz\.?\s*/i, '')
      .replace(/^\*optional.*$/i, '')
      .trim();

    if (cleaned.length > 0 && !cleaned.startsWith('*')) {
      return cleaned;
    }
  }

  return alcoholType || '';
}
