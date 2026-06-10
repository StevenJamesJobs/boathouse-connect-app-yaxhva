/**
 * Picture This! question generator
 *
 * Loads menu_items pools per category, generates multiple-choice questions
 * for each (category, difficulty) combination, and enforces distractor
 * uniqueness rules. Pure functions — no UI side effects.
 */

import { supabase } from '@/app/integrations/supabase/client';
import { parseIngredients, hasParseableIngredients } from './ingredientParser';
import { resolveGameSourceOrgId } from './gameSource';
import { fetchMenuCategoryResolver } from '@/utils/categoryNames';

export type PictureThisCategory = 'food' | 'libations' | 'wine' | 'menu_prices';
export type PictureThisDifficulty = 'easy' | 'medium' | 'hard' | 'only';
export type PictureThisPlayMode = 'lives' | 'timed';

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  thumbnail_url: string | null;
  price: string | null;
  glass_price: string | null;
  bottle_price: string | null;
  member_bottle_price: string | null;
  location: string | null;
  display_order: number | null;
}

export type PriceType = 'glass' | 'bottle' | 'member';

export interface QuestionChoice {
  text: string;
  isCorrect: boolean;
}

export interface PictureThisQuestion {
  itemId: string;
  itemName: string;
  imageUrl: string;
  prompt: string;
  // Translation key + params for the prompt — when present, the play screen
  // renders `t(promptKey, promptParams)` so Spanish-preferred users see a
  // translated question. Falls back to `prompt` when absent.
  promptKey?: string;
  promptParams?: Record<string, string>;
  choices: QuestionChoice[]; // length 4
  correctIndex: number;
  // When true, the play screen hides the item name overlay (used for Wine
  // Medium where the player is supposed to identify the wine themselves).
  hideItemName?: boolean;
  // Display extras (for review screen)
  reviewDescription?: string;
  reviewLocation?: string | null;
  // Internal metadata
  category: PictureThisCategory;
  difficulty: PictureThisDifficulty;
}

const PRICE_RANGES = {
  glass: { min: 12, max: 30 },
  bottle: { min: 16, max: 280 },
  member: { min: 35, max: 110 },
  food: { min: 5, max: 42 },
  libation: { min: 6, max: 20 },
};

// ─── Pool loaders ──────────────────────────────────────────────────────────
export async function loadPool(category: PictureThisCategory, organizationId: string, useSampleData: boolean): Promise<MenuItem[]> {
  const sourceOrgId = await resolveGameSourceOrgId(organizationId, useSampleData);

  // Resolve the source org's CURRENT built-in category names by system_key so
  // renamed categories still pool correctly; fall back to the canonical literal.
  const resolver = await fetchMenuCategoryResolver(sourceOrgId);
  const namesOr = (key: string, fallback: string): string[] => {
    const n = resolver.namesForKeys([key]);
    return n.length ? n : [fallback];
  };
  const lunchN = namesOr('cat.lunch', 'Lunch');
  const dinnerN = namesOr('cat.dinner', 'Dinner');
  const wsN = namesOr('cat.weekly_specials', 'Weekly Specials');
  const libN = namesOr('cat.libations', 'Libations');
  const wineN = namesOr('cat.wine', 'Wine');

  let query = (supabase.from('menu_items') as any)
    .select(
      'id, name, description, category, subcategory, thumbnail_url, price, glass_price, bottle_price, member_bottle_price, location, display_order'
    )
    .eq('is_active', true)
    .not('thumbnail_url', 'is', null);
  query = query.eq('organization_id', sourceOrgId);

  if (category === 'food') {
    query = query.in('category', [...lunchN, ...dinnerN, ...wsN]);
  } else if (category === 'libations') {
    query = query.in('category', libN);
  } else if (category === 'wine') {
    query = query.in('category', wineN);
  } else if (category === 'menu_prices') {
    query = query.in('category', [...lunchN, ...dinnerN, ...wsN, ...libN, ...wineN]);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error('[pictureThisGenerator] Pool load error:', error);
    return [];
  }
  let items = data as MenuItem[];

  // Exclude the Weekly Specials summary card (display_order = 0)
  const wsSet = new Set(wsN);
  items = items.filter(i => !(wsSet.has(i.category) && i.display_order === 0));

  // Within Libations, keep only recipe-backed (cocktail-fed) subcategories —
  // this excludes Draft Beer / Bottle & Cans (and any other non-cocktail sub)
  // from ingredient/price games, resolved by the is_cocktail_fed flag (renames-safe).
  const libSet = new Set(libN);
  const cocktailFed = new Set(resolver.cocktailFedSubNames);
  items = items.filter(
    i => !(libSet.has(i.category) && !(i.subcategory != null && cocktailFed.has(i.subcategory)))
  );

  // For ingredient-based categories, require parseable ingredients
  if (category === 'food' || category === 'libations') {
    items = items.filter(i => hasParseableIngredients(i.description, 3));
  }

  return items;
}

/** Resolve the source org's current Wine/Libations names for the price game's
 *  per-item classification (used by generateMenuPrice via generateQuestion). */
export async function resolvePriceCategoryNames(
  organizationId: string,
  useSampleData: boolean,
): Promise<{ wineNames: string[]; libationNames: string[] }> {
  const sourceOrgId = await resolveGameSourceOrgId(organizationId, useSampleData);
  const resolver = await fetchMenuCategoryResolver(sourceOrgId);
  const wineNames = resolver.namesForKeys(['cat.wine']);
  const libationNames = resolver.namesForKeys(['cat.libations']);
  return {
    wineNames: wineNames.length ? wineNames : ['Wine'],
    libationNames: libationNames.length ? libationNames : ['Libations'],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

function buildChoices(correct: string, distractors: string[]): { choices: QuestionChoice[]; correctIndex: number } {
  const all = [correct, ...distractors].slice(0, 4);
  const shuffled = shuffle(all);
  const correctIndex = shuffled.indexOf(correct);
  return {
    choices: shuffled.map(text => ({ text, isCorrect: text === correct })),
    correctIndex,
  };
}

function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/\$/g, '').match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Random whole-dollar amount within range [min, max], excluding any forbidden
 * amounts (other in-pool prices for the same price type).
 */
function generateDistractorPrice(
  min: number,
  max: number,
  forbidden: Set<number>,
  alsoExclude: Set<number>,
): number | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    const amt = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!forbidden.has(amt) && !alsoExclude.has(amt)) return amt;
  }
  // Fallback: scan for any free amount
  for (let amt = min; amt <= max; amt++) {
    if (!forbidden.has(amt) && !alsoExclude.has(amt)) return amt;
  }
  return null;
}

// ─── FOOD / LIBATIONS — Easy (1 ingredient) ───────────────────────────────
export function generateIngredientEasy(
  item: MenuItem,
  pool: MenuItem[],
  category: PictureThisCategory,
): PictureThisQuestion | null {
  const myIngs = parseIngredients(item.description);
  if (myIngs.length < 1 || !item.thumbnail_url) return null;
  const correct = myIngs[Math.floor(Math.random() * myIngs.length)];

  const myLower = new Set(myIngs.map(i => i.toLowerCase()));
  const otherIngs = pool
    .filter(p => p.id !== item.id)
    .flatMap(p => parseIngredients(p.description))
    .filter(i => !myLower.has(i.toLowerCase()));

  // Dedup case-insensitively
  const seen = new Set<string>();
  const uniqOther = otherIngs.filter(i => {
    const k = i.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniqOther.length < 3) return null;

  const distractors = pickN(uniqOther, 3);
  const { choices, correctIndex } = buildChoices(correct, distractors);
  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: `Which of these is an ingredient in the ${item.name.trim()}?`,
    promptKey: 'picture_this:prompt_ingredient_easy',
    promptParams: { item: item.name.trim() },
    choices,
    correctIndex,
    reviewDescription: item.description ?? undefined,
    category,
    difficulty: 'easy',
  };
}

// ─── FOOD / LIBATIONS — Medium (2 ingredients) ────────────────────────────
export function generateIngredientMedium(
  item: MenuItem,
  pool: MenuItem[],
  category: PictureThisCategory,
): PictureThisQuestion | null {
  const myIngs = parseIngredients(item.description);
  if (myIngs.length < 2 || !item.thumbnail_url) return null;

  const myLower = new Set(myIngs.map(i => i.toLowerCase()));
  const otherIngs = Array.from(
    new Set(
      pool
        .filter(p => p.id !== item.id)
        .flatMap(p => parseIngredients(p.description))
        .filter(i => !myLower.has(i.toLowerCase())),
    ),
  );
  if (otherIngs.length < 4) return null;

  // Correct: pick 2 of my ingredients
  const [c1, c2] = pickN(myIngs, 2);
  const correctText = `${c1}, ${c2}`;

  // Distractors: 3 wrong pairs. Strategy:
  //   - 1 pair: (correct1, wrong)
  //   - 1 pair: (correct2, wrong) — uses different correct
  //   - 1 pair: (wrong, wrong)
  const others = shuffle(otherIngs);
  const used = new Set<string>();
  const takeOther = (n: number): string[] => {
    const picked: string[] = [];
    for (const o of others) {
      if (used.has(o.toLowerCase())) continue;
      picked.push(o);
      used.add(o.toLowerCase());
      if (picked.length === n) break;
    }
    return picked;
  };
  const w1 = takeOther(1)[0];
  const w2 = takeOther(1)[0];
  const ww = takeOther(2);
  if (!w1 || !w2 || ww.length < 2) return null;

  const distractors = [
    `${c1}, ${w1}`,
    `${c2}, ${w2}`,
    `${ww[0]}, ${ww[1]}`,
  ];

  const { choices, correctIndex } = buildChoices(correctText, distractors);
  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: `Which two ingredients are in the ${item.name.trim()}?`,
    promptKey: 'picture_this:prompt_ingredient_medium',
    promptParams: { item: item.name.trim() },
    choices,
    correctIndex,
    reviewDescription: item.description ?? undefined,
    category,
    difficulty: 'medium',
  };
}

// ─── FOOD / LIBATIONS — Hard (full ingredient list) ───────────────────────
export function generateIngredientHard(
  item: MenuItem,
  pool: MenuItem[],
  category: PictureThisCategory,
): PictureThisQuestion | null {
  const myIngs = parseIngredients(item.description);
  if (myIngs.length < 3 || !item.thumbnail_url) return null;

  const myLower = new Set(myIngs.map(i => i.toLowerCase()));
  const otherIngs = Array.from(
    new Set(
      pool
        .filter(p => p.id !== item.id)
        .flatMap(p => parseIngredients(p.description))
        .filter(i => !myLower.has(i.toLowerCase())),
    ),
  );
  if (otherIngs.length < 6) return null;

  const correctText = myIngs.join(', ');

  // 3 wrong variants: each swaps 1-2 of the correct ingredients for distractors.
  const distractors: string[] = [];
  const usedSwapCombos = new Set<string>();
  let attempts = 0;
  while (distractors.length < 3 && attempts < 30) {
    attempts++;
    const swapCount = Math.random() < 0.5 ? 1 : 2;
    const swapIndices = pickN([...Array(myIngs.length).keys()], Math.min(swapCount, myIngs.length));
    const replacements = pickN(otherIngs, swapIndices.length);
    if (replacements.length < swapIndices.length) continue;
    const variant = [...myIngs];
    swapIndices.forEach((idx, i) => {
      variant[idx] = replacements[i];
    });
    const variantText = variant.join(', ');
    if (variantText === correctText) continue;
    if (usedSwapCombos.has(variantText)) continue;
    usedSwapCombos.add(variantText);
    distractors.push(variantText);
  }
  if (distractors.length < 3) return null;

  const { choices, correctIndex } = buildChoices(correctText, distractors);
  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: `Which is the correct ingredient list for the ${item.name.trim()}?`,
    promptKey: 'picture_this:prompt_ingredient_hard',
    promptParams: { item: item.name.trim() },
    choices,
    correctIndex,
    reviewDescription: item.description ?? undefined,
    category,
    difficulty: 'hard',
  };
}

// ─── WINE — Medium (Name + Location) ──────────────────────────────────────
export function generateWineMedium(item: MenuItem, pool: MenuItem[]): PictureThisQuestion | null {
  if (!item.thumbnail_url || !item.location) return null;
  const others = pool.filter(p => p.id !== item.id && p.location);
  if (others.length < 3) return null;

  const correctText = `${item.name.trim()} — ${item.location}`;

  // 3 wrong: alternating correct-name/wrong-location and wrong-name/correct-location
  const wrongLocs = pickN(
    others.filter(o => o.location !== item.location).map(o => o.location!),
    2,
  );
  const wrongNames = pickN(
    others.filter(o => o.name.trim() !== item.name.trim()).map(o => o.name.trim()),
    2,
  );

  const distractors: string[] = [];
  if (wrongLocs[0]) distractors.push(`${item.name.trim()} — ${wrongLocs[0]}`);
  if (wrongNames[0]) distractors.push(`${wrongNames[0]} — ${item.location}`);
  if (wrongLocs[1] && wrongNames[1]) {
    distractors.push(`${wrongNames[1]} — ${wrongLocs[1]}`);
  } else if (wrongLocs[1]) {
    distractors.push(`${item.name.trim()} — ${wrongLocs[1]}`);
  } else if (wrongNames[1]) {
    distractors.push(`${wrongNames[1]} — ${item.location}`);
  }

  // Dedup against correct
  const filtered = distractors.filter(d => d !== correctText);
  if (filtered.length < 3) return null;

  const { choices, correctIndex } = buildChoices(correctText, filtered.slice(0, 3));
  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: `Which name and location matches this wine?`,
    promptKey: 'picture_this:prompt_wine_medium',
    choices,
    correctIndex,
    hideItemName: true,
    reviewDescription: item.description ?? undefined,
    reviewLocation: item.location,
    category: 'wine',
    difficulty: 'medium',
  };
}

// ─── WINE — Hard (price by type) ──────────────────────────────────────────
export function generateWineHard(item: MenuItem, pool: MenuItem[]): PictureThisQuestion | null {
  if (!item.thumbnail_url) return null;

  // Pick a price type the wine actually has
  const availableTypes: PriceType[] = [];
  if (parsePrice(item.glass_price) !== null) availableTypes.push('glass');
  if (parsePrice(item.bottle_price) !== null) availableTypes.push('bottle');
  if (parsePrice(item.member_bottle_price) !== null) availableTypes.push('member');
  if (availableTypes.length === 0) return null;
  const priceType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

  const correct =
    priceType === 'glass' ? parsePrice(item.glass_price) :
    priceType === 'bottle' ? parsePrice(item.bottle_price) :
    parsePrice(item.member_bottle_price);
  if (correct === null) return null;

  // Forbidden distractor amounts: ANY other wine's price for this type
  const forbidden = new Set<number>();
  for (const w of pool) {
    if (w.id === item.id) continue;
    const v =
      priceType === 'glass' ? parsePrice(w.glass_price) :
      priceType === 'bottle' ? parsePrice(w.bottle_price) :
      parsePrice(w.member_bottle_price);
    if (v !== null) forbidden.add(v);
  }
  forbidden.add(correct);

  const range = PRICE_RANGES[priceType];
  const used = new Set<number>([correct]);
  const distractorAmts: number[] = [];
  while (distractorAmts.length < 3) {
    const amt = generateDistractorPrice(range.min, range.max, forbidden, used);
    if (amt === null) return null;
    used.add(amt);
    distractorAmts.push(amt);
  }

  const correctText = `$${correct}`;
  const distractors = distractorAmts.map(a => `$${a}`);
  const promptType = priceType === 'glass' ? 'glass' : priceType === 'bottle' ? 'bottle' : 'member bottle';
  const { choices, correctIndex } = buildChoices(correctText, distractors);

  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: `What is the ${promptType} price for ${item.name.trim()}?`,
    promptKey: priceType === 'glass'
      ? 'picture_this:prompt_price_glass'
      : priceType === 'bottle'
      ? 'picture_this:prompt_price_bottle'
      : 'picture_this:prompt_price_member',
    promptParams: { item: item.name.trim() },
    choices,
    correctIndex,
    reviewDescription: item.description ?? undefined,
    reviewLocation: item.location,
    category: 'wine',
    difficulty: 'hard',
  };
}

// ─── MENU PRICES — single difficulty across food / libations / wine ───────
export function generateMenuPrice(item: MenuItem, pool: MenuItem[], libationNames: string[] = ['Libations']): PictureThisQuestion | null {
  if (!item.thumbnail_url) return null;

  // Determine type bucket. Wine is detected STRUCTURALLY (only wine rows carry
  // glass/bottle/member prices), so it survives a renamed Wine category;
  // libations resolve by the org's current Libations name(s).
  const itemIsWine = (it: MenuItem) =>
    parsePrice(it.glass_price) !== null || parsePrice(it.bottle_price) !== null || parsePrice(it.member_bottle_price) !== null;
  const libSet = new Set(libationNames);
  const isWine = itemIsWine(item);
  const isLibation = !isWine && libSet.has(item.category);

  let correct: number | null = null;
  let priceType: PriceType | 'price' = 'price';
  let promptText = `What is the price for ${item.name.trim()}?`;
  let promptKey = 'picture_this:prompt_price';
  let promptParams: Record<string, string> = { item: item.name.trim() };

  if (isWine) {
    const availableTypes: PriceType[] = [];
    if (parsePrice(item.glass_price) !== null) availableTypes.push('glass');
    if (parsePrice(item.bottle_price) !== null) availableTypes.push('bottle');
    if (parsePrice(item.member_bottle_price) !== null) availableTypes.push('member');
    if (availableTypes.length === 0) return null;
    priceType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    correct =
      priceType === 'glass' ? parsePrice(item.glass_price) :
      priceType === 'bottle' ? parsePrice(item.bottle_price) :
      parsePrice(item.member_bottle_price);
    const promptLabel = priceType === 'glass' ? 'glass' : priceType === 'bottle' ? 'bottle' : 'member bottle';
    promptText = `What is the ${promptLabel} price for ${item.name.trim()}?`;
    promptKey = priceType === 'glass'
      ? 'picture_this:prompt_price_glass'
      : priceType === 'bottle'
      ? 'picture_this:prompt_price_bottle'
      : 'picture_this:prompt_price_member';
    promptParams = { item: item.name.trim() };
  } else {
    correct = parsePrice(item.price);
    promptText = `What is the price for ${item.name.trim()}?`;
    promptKey = 'picture_this:prompt_price';
    promptParams = { item: item.name.trim() };
  }
  if (correct === null) return null;

  // Forbidden: any in-pool item with the same matching price-of-type
  const forbidden = new Set<number>([correct]);
  let range: { min: number; max: number };

  if (isWine && priceType !== 'price') {
    range = PRICE_RANGES[priceType];
    for (const w of pool) {
      if (w.id === item.id || !itemIsWine(w)) continue;
      const v =
        priceType === 'glass' ? parsePrice(w.glass_price) :
        priceType === 'bottle' ? parsePrice(w.bottle_price) :
        parsePrice(w.member_bottle_price);
      if (v !== null) forbidden.add(v);
    }
  } else if (isLibation) {
    range = PRICE_RANGES.libation;
    for (const o of pool) {
      if (o.id === item.id) continue;
      if (!libSet.has(o.category)) continue;
      const v = parsePrice(o.price);
      if (v !== null) forbidden.add(v);
    }
  } else {
    range = PRICE_RANGES.food;
    for (const o of pool) {
      if (o.id === item.id) continue;
      if (itemIsWine(o) || libSet.has(o.category)) continue;
      const v = parsePrice(o.price);
      if (v !== null) forbidden.add(v);
    }
  }

  const used = new Set<number>([correct]);
  const distractorAmts: number[] = [];
  while (distractorAmts.length < 3) {
    const amt = generateDistractorPrice(range.min, range.max, forbidden, used);
    if (amt === null) return null;
    used.add(amt);
    distractorAmts.push(amt);
  }

  const { choices, correctIndex } = buildChoices(`$${correct}`, distractorAmts.map(a => `$${a}`));
  return {
    itemId: item.id,
    itemName: item.name,
    imageUrl: item.thumbnail_url,
    prompt: promptText,
    promptKey,
    promptParams,
    choices,
    correctIndex,
    reviewDescription: item.description ?? undefined,
    reviewLocation: item.location,
    category: 'menu_prices',
    difficulty: 'only',
  };
}

// ─── Top-level dispatcher ─────────────────────────────────────────────────
export function generateQuestion(
  item: MenuItem,
  pool: MenuItem[],
  category: PictureThisCategory,
  difficulty: PictureThisDifficulty,
  libationNames: string[] = ['Libations'],
): PictureThisQuestion | null {
  if (category === 'food' || category === 'libations') {
    if (difficulty === 'easy') return generateIngredientEasy(item, pool, category);
    if (difficulty === 'medium') return generateIngredientMedium(item, pool, category);
    if (difficulty === 'hard') return generateIngredientHard(item, pool, category);
    return null;
  }
  if (category === 'wine') {
    if (difficulty === 'medium') return generateWineMedium(item, pool);
    if (difficulty === 'hard') return generateWineHard(item, pool);
    return null;
  }
  if (category === 'menu_prices') {
    return generateMenuPrice(item, pool, libationNames);
  }
  return null;
}

/**
 * Pick the next item to use as the question subject. Tracks served IDs so we
 * don't repeat until the pool is exhausted, then reshuffle.
 */
export class QuestionItemPicker {
  private remaining: MenuItem[];
  private full: MenuItem[];
  private lastId: string | null = null;

  constructor(pool: MenuItem[]) {
    this.full = pool;
    this.remaining = shuffle(pool);
  }

  next(): MenuItem | null {
    if (this.full.length === 0) return null;
    if (this.remaining.length === 0) {
      this.remaining = shuffle(this.full);
    }
    let idx = 0;
    // Avoid the same item back-to-back when possible
    if (this.remaining.length > 1 && this.remaining[0].id === this.lastId) {
      idx = 1;
    }
    const item = this.remaining.splice(idx, 1)[0];
    this.lastId = item.id;
    return item;
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────
export const BASE_POINTS: Record<PictureThisCategory, Record<PictureThisDifficulty, number>> = {
  food: { easy: 10, medium: 20, hard: 35, only: 0 },
  libations: { easy: 10, medium: 20, hard: 35, only: 0 },
  wine: { easy: 0, medium: 25, hard: 40, only: 0 },
  menu_prices: { easy: 0, medium: 0, hard: 0, only: 50 },
};

export function pointsPerCorrect(
  category: PictureThisCategory,
  difficulty: PictureThisDifficulty,
  playMode: PictureThisPlayMode,
): number {
  const base = BASE_POINTS[category][difficulty];
  if (playMode === 'timed') return Math.round(base * 0.8);
  return base;
}

export const STARTING_LIVES: Record<PictureThisDifficulty, number> = {
  easy: 3,
  medium: 4,
  hard: 5,
  only: 4, // Menu Prices uses Medium-equivalent lives
};

export const TIMED_SECONDS = 120;

/**
 * Lives-mode milestone bonus (called at every correct answer).
 * Returns { bonusPoints, restoreLife } applicable for this milestone.
 */
export function milestoneBonus(questionsCorrect: number): { bonusPoints: number; restoreLife: boolean } {
  if (questionsCorrect <= 0) return { bonusPoints: 0, restoreLife: false };
  if (questionsCorrect % 10 === 0) {
    // 10, 20, 30… → +50/+100/+150 + restore
    return { bonusPoints: 25 * questionsCorrect / 5, restoreLife: true };
  }
  if (questionsCorrect % 5 === 0) {
    // 5, 15, 25… → +25/+75/+125
    return { bonusPoints: 25 * questionsCorrect / 5, restoreLife: false };
  }
  return { bonusPoints: 0, restoreLife: false };
}
