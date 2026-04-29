/**
 * Ingredient parser for menu_items.description fields.
 *
 * Used by Picture This! to extract clean comma-separated ingredients from food
 * and libation descriptions. Handles common edge cases:
 *   - Newlines (\n) treated as commas
 *   - Bracketed quantities like "[4] Clams [4] Oysters" stripped
 *   - Lead-in prefixes ("served with", "topped with", "and") stripped
 *   - Markdown formatting tags removed
 *   - Pure numbers, very short tokens, very long tokens filtered out
 */

import { stripFormattingTags } from '@/components/FormattedText';

const PREFIX_RE = /^(served|topped|tossed|drizzled|finished|with|and)\s+/i;
const BRACKET_QTY_RE = /\[\s*\d+\s*\]\s*/g;
const NUMERIC_PREFIX_RE = /^\d+\s*[-–—]\s*/;

export function parseIngredients(description: string | null | undefined): string[] {
  if (!description) return [];
  const cleaned = stripFormattingTags(description)
    .replace(BRACKET_QTY_RE, ' ')
    .replace(/\n+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned
    .split(/,|\bwith\b|\band\b|\./i)
    .map(p => p.trim())
    .map(p => p.replace(PREFIX_RE, '').replace(NUMERIC_PREFIX_RE, '').trim())
    .filter(p => p.length >= 3 && p.length <= 40)
    .filter(p => !/^\d+$/.test(p));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** True if the description yields at least `min` clean ingredients. */
export function hasParseableIngredients(description: string | null | undefined, min = 3): boolean {
  return parseIngredients(description).length >= min;
}
