// cocktails.ingredients is a TEXT column whose modern rows hold a
// JSON-stringified [{amount, ingredient}] array (same shape as
// libation_recipes' JSONB — the recipe editors write it that way), while some
// legacy rows may still be newline text like "4 oz. ginger beer\r\n0.25 oz. lime".
// Feeding the raw string into word/tile builders shows JSON braces and amounts
// on-screen — always parse through here first.

export interface CocktailIngredient {
  amount: string;
  ingredient: string;
}

export function parseCocktailIngredients(raw: string | null | undefined): CocktailIngredient[] {
  if (!raw) return [];
  const text = String(raw).trim();
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr
          .map((e: any) => ({
            amount: String(e?.amount ?? '').trim(),
            ingredient: String(e?.ingredient ?? '').trim(),
          }))
          .filter((e) => e.ingredient.length > 0);
      }
    } catch {
      // fall through to the legacy text parser
    }
  }
  // Legacy newline/comma text: strip measurement prefixes per line.
  return text
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('*'))
    .map((l) => ({
      amount: '',
      ingredient: l
        .replace(/^(float\s+)?[\d.\/\s]*\s*(oz\.?|ounces?|dash(es)?|splash|tsp|tbsp|cups?|parts?|ml|cl)?\.?\s+/i, '')
        .trim(),
    }))
    .filter((e) => e.ingredient.length > 0);
}

/** The cocktail's headline ingredient: prefer the one matching alcohol_type
 *  (e.g. "Vodka" -> "Vodka"), else the first listed, else the type itself. */
export function pickMainCocktailIngredient(ings: CocktailIngredient[], alcoholType: string): string {
  if (ings.length === 0) return alcoholType || '';
  if (alcoholType) {
    const byType = ings.find((i) => i.ingredient.toLowerCase().includes(alcoholType.toLowerCase()));
    if (byType) return byType.ingredient;
  }
  return ings[0].ingredient;
}
