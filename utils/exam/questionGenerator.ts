import { supabase } from '@/app/integrations/supabase/client';
import { stripFormattingTags } from '@/components/FormattedText';

// Types
export type ExamType = 'server' | 'bartender' | 'host';

export interface GeneratedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  source_type: 'auto';
  source_table: string;
  // Optional picture-question image (menu_items.thumbnail_url)
  question_image_url?: string | null;
  // Spanish translations
  question_text_es?: string;
  option_a_es?: string;
  option_b_es?: string;
  option_c_es?: string;
  option_d_es?: string;
}

// Seeded random number generator (mulberry32)
function seededRandom(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Create a numeric seed from a string
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

// Seeded shuffle
function seededShuffle<T>(array: T[], rng: () => number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Pick N random items from array using seeded RNG
function seededPick<T>(array: T[], count: number, rng: () => number): T[] {
  if (count >= array.length) return seededShuffle(array, rng);
  return seededShuffle(array, rng).slice(0, count);
}

// Pick N wrong answers from a pool, excluding the correct answer
function pickWrongAnswers(pool: string[], correct: string, count: number, rng: () => number): string[] {
  const filtered = pool.filter(item => item !== correct && item.trim().length > 0);
  return seededPick(filtered, count, rng);
}

// Shuffle options and return them with the correct option letter
// Also shuffles a parallel Spanish options array in the same order
function shuffleOptionsWithEs(
  correct: string,
  wrongs: string[],
  correctEs: string,
  wrongsEs: string[],
  rng: () => number,
): {
  options: [string, string, string, string];
  optionsEs: [string, string, string, string];
  correctLetter: 'A' | 'B' | 'C' | 'D';
} {
  const allEn = [correct, ...wrongs.slice(0, 3)];
  const allEs = [correctEs, ...wrongsEs.slice(0, 3)];

  // Generate shuffle indices
  const indices = [0, 1, 2, 3];
  const shuffledIndices = seededShuffle(indices, rng);

  const shuffledEn = shuffledIndices.map(i => allEn[i]);
  const shuffledEs = shuffledIndices.map(i => allEs[i]);

  const correctIndex = shuffledIndices.indexOf(0); // 0 is the correct answer's original index
  const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  return {
    options: shuffledEn as [string, string, string, string],
    optionsEs: shuffledEs as [string, string, string, string],
    correctLetter: letters[correctIndex],
  };
}

// Legacy shuffle (no Spanish) - kept for compatibility
function shuffleOptions(
  correct: string,
  wrongs: string[],
  rng: () => number,
): { options: [string, string, string, string]; correctLetter: 'A' | 'B' | 'C' | 'D' } {
  const all = [correct, ...wrongs.slice(0, 3)];
  const shuffled = seededShuffle(all, rng);
  const correctIndex = shuffled.indexOf(correct);
  const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  return {
    options: shuffled as [string, string, string, string],
    correctLetter: letters[correctIndex],
  };
}

// =============================================
// SPANISH TRANSLATION HELPERS
// =============================================

// Common subcategory translations
const SUBCATEGORY_ES: Record<string, string> = {
  'Appetizers': 'Aperitivos',
  'Soups': 'Sopas',
  'Salads': 'Ensaladas',
  'Sandwiches': 'Sándwiches',
  'Burgers': 'Hamburguesas',
  'Entrees': 'Platos Principales',
  'Entrées': 'Platos Principales',
  'Pasta': 'Pasta',
  'Seafood': 'Mariscos',
  'Steaks': 'Bistecs',
  'Sides': 'Acompañamientos',
  'Desserts': 'Postres',
  'Kids': 'Niños',
  'Kids Menu': 'Menú Infantil',
  'Starters': 'Entradas',
  'Flatbreads': 'Pan Plano',
  'Raw Bar': 'Barra de Crudo',
  'Brunch': 'Brunch',
  'Lunch': 'Almuerzo',
  'Dinner': 'Cena',
};

function translateSubcategory(subcat: string): string {
  return SUBCATEGORY_ES[subcat] || subcat;
}

// =============================================
// DATA FETCHERS
// =============================================

interface MenuItem {
  id: string;
  name: string;
  name_es: string | null;
  description: string | null;
  description_es?: string | null;
  price: string;
  category: string;
  subcategory: string | null;
  is_gluten_free: boolean;
  is_vegetarian: boolean;
  available_for_lunch: boolean;
  available_for_dinner: boolean;
  thumbnail_url?: string | null;
}

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  ingredients: string | null;
}

interface LibationRecipe {
  id: string;
  name: string;
  category: string;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[] | null;
}

interface WinePairing {
  wine: string;
  entree: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  category_name: string;
  checklist_type: string;
}

async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, name_es, description, price, category, subcategory, is_gluten_free, is_vegetarian, available_for_lunch, available_for_dinner')
    .eq('is_active', true)
    .in('category', ['Lunch', 'Dinner']);

  if (error || !data) return [];
  return data as MenuItem[];
}

// Pool of items with thumbnails for picture questions — broader than
// fetchMenuItems: includes Libations and Wine so bartender/server/host
// quizzes can all pull imagery. Only returns rows with a non-null
// thumbnail_url.
async function fetchMenuItemsWithImages(): Promise<MenuItem[]> {
  const { data, error } = await (supabase
    .from('menu_items') as any)
    .select('id, name, name_es, description, description_es, price, category, subcategory, is_gluten_free, is_vegetarian, available_for_lunch, available_for_dinner, thumbnail_url')
    .eq('is_active', true)
    .in('category', ['Lunch', 'Dinner', 'Libations', 'Wine'])
    .not('thumbnail_url', 'is', null);

  if (error || !data) return [];
  return (data as MenuItem[]).filter(
    (m) => !!m.thumbnail_url && m.thumbnail_url.trim().length > 0
  );
}

async function fetchCocktails(): Promise<Cocktail[]> {
  const { data, error } = await supabase
    .from('cocktails')
    .select('id, name, alcohol_type, ingredients')
    .eq('is_active', true);

  if (error || !data) return [];
  return data as Cocktail[];
}

async function fetchLibationRecipes(): Promise<LibationRecipe[]> {
  const { data, error } = await supabase
    .from('libation_recipes')
    .select('id, name, category, glassware, garnish, ingredients')
    .eq('is_active', true);

  if (error || !data) return [];
  return data as LibationRecipe[];
}

async function fetchWinePairings(): Promise<WinePairing[]> {
  const { data, error } = await supabase
    .from('wine_pairings' as any)
    .select('wine, entree')
    .eq('is_active', true);

  if (error || !data) return [];
  return data as WinePairing[];
}

async function fetchHostChecklistItems(): Promise<ChecklistItem[]> {
  const { data: categories } = await supabase
    .from('checklist_categories')
    .select('id, name, checklist_type')
    .eq('is_active', true);

  if (!categories || categories.length === 0) return [];

  const { data: items } = await supabase
    .from('checklist_items')
    .select('id, text, category_id')
    .eq('is_active', true);

  if (!items) return [];

  const catMap = new Map(categories.map((c: any) => [c.id, { name: c.name, type: c.checklist_type }]));
  return items.map((item: any) => {
    const cat = catMap.get(item.category_id);
    return {
      id: item.id,
      text: item.text,
      category_name: cat?.name || 'Unknown',
      checklist_type: cat?.type || 'unknown',
    };
  }).filter((item: ChecklistItem) => item.category_name !== 'Unknown');
}

async function fetchBartenderChecklistItems(): Promise<ChecklistItem[]> {
  const { data: categories } = await supabase
    .from('bartender_checklist_categories')
    .select('id, name, checklist_type')
    .eq('is_active', true);

  if (!categories || categories.length === 0) return [];

  const { data: items } = await supabase
    .from('bartender_checklist_items')
    .select('id, text, category_id')
    .eq('is_active', true);

  if (!items) return [];

  const catMap = new Map(categories.map((c: any) => [c.id, { name: c.name, type: c.checklist_type }]));
  return items.map((item: any) => {
    const cat = catMap.get(item.category_id);
    return {
      id: item.id,
      text: item.text,
      category_name: cat?.name || 'Unknown',
      checklist_type: cat?.type || 'unknown',
    };
  }).filter((item: ChecklistItem) => item.category_name !== 'Unknown');
}

// =============================================
// QUESTION TEMPLATE GENERATORS
// =============================================

type QuestionCandidate = GeneratedQuestion & { templateId: string };

function menuPriceQuestion(items: MenuItem[], rng: () => number): QuestionCandidate | null {
  const withPrice = items.filter(i => i.price && i.price.trim().length > 0);
  if (withPrice.length < 4) return null;

  const target = seededPick(withPrice, 1, rng)[0];
  const otherPrices = withPrice
    .filter(i => i.id !== target.id && i.price !== target.price)
    .map(i => i.price);
  const uniquePrices = [...new Set(otherPrices)];
  if (uniquePrices.length < 3) return null;

  const wrongs = seededPick(uniquePrices, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.price, wrongs, rng);

  const nameEs = target.name_es || target.name;

  return {
    question_text: `What is the price of ${target.name}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'menu_items',
    templateId: 'menu_price',
    // Prices are the same in both languages
    question_text_es: `¿Cuál es el precio de ${nameEs}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function menuCategoryQuestion(items: MenuItem[], rng: () => number): QuestionCandidate | null {
  const withSubcat = items.filter(i => i.subcategory && i.subcategory.trim().length > 0);
  if (withSubcat.length < 4) return null;

  const target = seededPick(withSubcat, 1, rng)[0];
  const otherSubcats = [...new Set(
    withSubcat.filter(i => i.subcategory !== target.subcategory).map(i => i.subcategory!)
  )];
  if (otherSubcats.length < 3) return null;

  const wrongs = seededPick(otherSubcats, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.subcategory!, wrongs, rng);

  const nameEs = target.name_es || target.name;
  const optionsEs = options.map(o => translateSubcategory(o));

  return {
    question_text: `Which section of the menu does ${target.name} belong to?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'menu_items',
    templateId: 'menu_category',
    question_text_es: `¿A qué sección del menú pertenece ${nameEs}?`,
    option_a_es: optionsEs[0],
    option_b_es: optionsEs[1],
    option_c_es: optionsEs[2],
    option_d_es: optionsEs[3],
  };
}

function menuGlutenFreeQuestion(items: MenuItem[], rng: () => number): QuestionCandidate | null {
  const gfItems = items.filter(i => i.is_gluten_free);
  const nonGfItems = items.filter(i => !i.is_gluten_free);
  if (gfItems.length < 1 || nonGfItems.length < 3) return null;

  const correct = seededPick(gfItems, 1, rng)[0];
  const wrongItems = seededPick(nonGfItems, 3, rng);
  const wrongs = wrongItems.map(i => i.name);
  const { options, correctLetter } = shuffleOptions(correct.name, wrongs, rng);

  // Build Spanish options in same order
  const allItemsMap = new Map([correct, ...wrongItems].map(i => [i.name, i.name_es || i.name]));
  const optionsEs = options.map(o => allItemsMap.get(o) || o);

  return {
    question_text: 'Which of the following dishes is gluten-free?',
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'menu_items',
    templateId: 'menu_gluten_free',
    question_text_es: '¿Cuál de los siguientes platos es libre de gluten?',
    option_a_es: optionsEs[0],
    option_b_es: optionsEs[1],
    option_c_es: optionsEs[2],
    option_d_es: optionsEs[3],
  };
}

function menuVegetarianQuestion(items: MenuItem[], rng: () => number): QuestionCandidate | null {
  const vegItems = items.filter(i => i.is_vegetarian);
  const nonVegItems = items.filter(i => !i.is_vegetarian);
  if (vegItems.length < 1 || nonVegItems.length < 3) return null;

  const correct = seededPick(vegItems, 1, rng)[0];
  const wrongItems = seededPick(nonVegItems, 3, rng);
  const wrongs = wrongItems.map(i => i.name);
  const { options, correctLetter } = shuffleOptions(correct.name, wrongs, rng);

  const allItemsMap = new Map([correct, ...wrongItems].map(i => [i.name, i.name_es || i.name]));
  const optionsEs = options.map(o => allItemsMap.get(o) || o);

  return {
    question_text: 'Which of the following dishes is vegetarian?',
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'menu_items',
    templateId: 'menu_vegetarian',
    question_text_es: '¿Cuál de los siguientes platos es vegetariano?',
    option_a_es: optionsEs[0],
    option_b_es: optionsEs[1],
    option_c_es: optionsEs[2],
    option_d_es: optionsEs[3],
  };
}

function cocktailSpiritQuestion(cocktails: Cocktail[], rng: () => number): QuestionCandidate | null {
  const withType = cocktails.filter(c => c.alcohol_type && c.alcohol_type.trim().length > 0);
  if (withType.length < 4) return null;

  const target = seededPick(withType, 1, rng)[0];
  const otherTypes = [...new Set(
    withType.filter(c => c.alcohol_type !== target.alcohol_type).map(c => c.alcohol_type)
  )];
  if (otherTypes.length < 3) return null;

  const wrongs = seededPick(otherTypes, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.alcohol_type, wrongs, rng);

  // Spirit/cocktail names are universal — same in both languages
  return {
    question_text: `What is the main spirit in the ${target.name}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'cocktails',
    templateId: 'cocktail_spirit',
    question_text_es: `¿Cuál es el licor principal en el ${target.name}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function libationGlasswareQuestion(recipes: LibationRecipe[], rng: () => number): QuestionCandidate | null {
  const withGlass = recipes.filter(r => r.glassware && r.glassware.trim().length > 0);
  if (withGlass.length < 4) return null;

  const target = seededPick(withGlass, 1, rng)[0];
  const otherGlass = [...new Set(
    withGlass.filter(r => r.glassware !== target.glassware).map(r => r.glassware!)
  )];
  if (otherGlass.length < 3) return null;

  const wrongs = seededPick(otherGlass, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.glassware!, wrongs, rng);

  // Glassware names are industry terms — same in both languages
  return {
    question_text: `What glassware is used for the ${target.name}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'libation_recipes',
    templateId: 'libation_glassware',
    question_text_es: `¿Qué cristalería se usa para el ${target.name}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function libationGarnishQuestion(recipes: LibationRecipe[], rng: () => number): QuestionCandidate | null {
  const withGarnish = recipes.filter(r => r.garnish && r.garnish.trim().length > 0);
  if (withGarnish.length < 4) return null;

  const target = seededPick(withGarnish, 1, rng)[0];
  const otherGarnish = [...new Set(
    withGarnish.filter(r => r.garnish !== target.garnish).map(r => r.garnish!)
  )];
  if (otherGarnish.length < 3) return null;

  const wrongs = seededPick(otherGarnish, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.garnish!, wrongs, rng);

  // Garnish names are industry terms — same in both languages
  return {
    question_text: `What garnish goes on the ${target.name}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'libation_recipes',
    templateId: 'libation_garnish',
    question_text_es: `¿Qué guarnición lleva el ${target.name}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function winePairingQuestion(pairings: WinePairing[], rng: () => number): QuestionCandidate | null {
  if (pairings.length < 4) return null;

  const target = seededPick(pairings, 1, rng)[0];
  const otherWines = [...new Set(
    pairings.filter(p => p.wine !== target.wine).map(p => p.wine)
  )];
  if (otherWines.length < 3) return null;

  const wrongs = seededPick(otherWines, 3, rng);
  const { options, correctLetter } = shuffleOptions(target.wine, wrongs, rng);

  // Wine and entree names are proper nouns — same in both languages
  return {
    question_text: `Which wine pairs with ${target.entree}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'wine_pairings',
    templateId: 'wine_pairing',
    question_text_es: `¿Qué vino va con ${target.entree}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function checklistQuestion(items: ChecklistItem[], checklistLabel: string, rng: () => number): QuestionCandidate | null {
  if (items.length < 4) return null;

  const types = [...new Set(items.map(i => i.checklist_type))];
  if (types.length < 1) return null;

  const targetType = seededPick(types, 1, rng)[0];
  const typeItems = items.filter(i => i.checklist_type === targetType);
  const otherItems = items.filter(i => i.checklist_type !== targetType);

  if (typeItems.length < 1 || otherItems.length < 3) return null;

  const correct = seededPick(typeItems, 1, rng)[0];
  const wrongs = seededPick(otherItems, 3, rng).map(i => i.text);
  const { options, correctLetter } = shuffleOptions(correct.text, wrongs, rng);

  const typeLabel = targetType === 'opening' ? 'Opening' : targetType === 'closing' ? 'Closing' : 'Running Side Work';
  const typeLabelEs = targetType === 'opening' ? 'Apertura' : targetType === 'closing' ? 'Cierre' : 'Trabajo Lateral';
  const checklistLabelEs = checklistLabel === 'Bartender' ? 'Bartender' : 'Host';

  return {
    question_text: `Which of these is part of the ${checklistLabel} ${typeLabel} Checklist?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: checklistLabel === 'Bartender' ? 'bartender_checklist_items' : 'checklist_items',
    templateId: 'checklist_item',
    // Checklist items are operational tasks — keep English options, translate the question frame
    question_text_es: `¿Cuál de estos es parte del Checklist de ${typeLabelEs} del ${checklistLabelEs}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

function libationIngredientQuestion(recipes: LibationRecipe[], rng: () => number): QuestionCandidate | null {
  const withIngredients = recipes.filter(
    r => r.ingredients && Array.isArray(r.ingredients) && r.ingredients.length > 0
  );
  if (withIngredients.length < 4) return null;

  const target = seededPick(withIngredients, 1, rng)[0];
  const correctIngredient = target.ingredients![0].ingredient;

  const otherIngredients = [...new Set(
    withIngredients
      .filter(r => r.id !== target.id)
      .flatMap(r => (r.ingredients || []).map(i => i.ingredient))
      .filter(i => i !== correctIngredient)
  )];
  if (otherIngredients.length < 3) return null;

  const wrongs = seededPick(otherIngredients, 3, rng);
  const { options, correctLetter } = shuffleOptions(correctIngredient, wrongs, rng);

  // Ingredient names are industry terms — same in both languages
  return {
    question_text: `Which of these is an ingredient in the ${target.name}?`,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'libation_recipes',
    templateId: 'libation_ingredient',
    question_text_es: `¿Cuál de estos es un ingrediente en el ${target.name}?`,
    option_a_es: options[0],
    option_b_es: options[1],
    option_c_es: options[2],
    option_d_es: options[3],
  };
}

// =============================================
// PICTURE QUESTION TEMPLATE
// =============================================

// Extract candidate ingredient words from a description. We split on commas
// and the word "with", trim, strip any formatting tags, drop obvious noise
// (empty strings, pure numbers, very short words). Order-preserved.
function extractIngredientsFromDescription(description: string): string[] {
  const cleaned = stripFormattingTags(description);
  const parts = cleaned
    .split(/,|\bwith\b|\band\b|\./i)
    .map(p => p.trim())
    .map(p => p.replace(/^(served|topped|tossed|drizzled|finished|with|and)\s+/i, '').trim())
    .filter(p => p.length >= 3 && p.length <= 40)
    .filter(p => !/^\d+$/.test(p));
  // De-dupe while preserving order
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

function menuPhotoQuestion(
  pool: MenuItem[],
  rng: () => number,
  excludeIds: Set<string> = new Set(),
): QuestionCandidate | null {
  const usable = pool.filter(m => !excludeIds.has(m.id));
  if (usable.length < 4) return null;

  const target = seededPick(usable, 1, rng)[0];
  if (!target.thumbnail_url) return null;
  const nameEs = target.name_es || target.name;

  // Decide which sub-form to use based on available data, weighted by RNG.
  // Order of preference: name > ingredient > dietary flag.
  const canDoName = usable.filter(m => m.category === target.category && m.id !== target.id).length >= 3;
  const ingredients = target.description ? extractIngredientsFromDescription(target.description) : [];
  const canDoIngredient =
    ingredients.length >= 1 &&
    usable.filter(m => m.id !== target.id && m.description && extractIngredientsFromDescription(m.description).length > 0).length >= 3;
  const canDoDietary =
    (target.is_vegetarian || target.is_gluten_free) &&
    usable.filter(m => m.id !== target.id).length >= 1;

  const options: Array<'name' | 'ingredient' | 'dietary'> = [];
  if (canDoName) options.push('name');
  if (canDoIngredient) options.push('ingredient');
  if (canDoDietary) options.push('dietary');
  if (options.length === 0) return null;

  const form = options[Math.floor(rng() * options.length)];

  // ─── Form 1: Dish/drink name ────────────────────────────────────────
  if (form === 'name') {
    const siblings = usable.filter(m => m.category === target.category && m.id !== target.id);
    const wrongItems = seededPick(siblings, 3, rng);
    const wrongs = wrongItems.map(i => i.name);
    const { options: opts, correctLetter } = shuffleOptions(target.name, wrongs, rng);
    const nameMap = new Map([target, ...wrongItems].map(i => [i.name, i.name_es || i.name]));
    const optsEs = opts.map(o => nameMap.get(o) || o);

    return {
      question_text: 'What is this item called?',
      option_a: opts[0],
      option_b: opts[1],
      option_c: opts[2],
      option_d: opts[3],
      correct_option: correctLetter,
      source_type: 'auto',
      source_table: 'menu_items',
      templateId: 'menu_photo_name',
      question_image_url: target.thumbnail_url,
      question_text_es: '¿Cómo se llama este platillo?',
      option_a_es: optsEs[0],
      option_b_es: optsEs[1],
      option_c_es: optsEs[2],
      option_d_es: optsEs[3],
    };
  }

  // ─── Form 2: Ingredient ─────────────────────────────────────────────
  if (form === 'ingredient') {
    const correctIngredient = ingredients[Math.floor(rng() * ingredients.length)];
    const otherItems = usable.filter(
      m => m.id !== target.id && m.description && extractIngredientsFromDescription(m.description).length > 0,
    );
    const otherIngredients = [
      ...new Set(
        otherItems
          .flatMap(m => extractIngredientsFromDescription(m.description || ''))
          .filter(i => i.toLowerCase() !== correctIngredient.toLowerCase()),
      ),
    ];
    if (otherIngredients.length < 3) return null;

    const wrongs = seededPick(otherIngredients, 3, rng);
    const { options: opts, correctLetter } = shuffleOptions(correctIngredient, wrongs, rng);

    return {
      question_text: `Which of these is an ingredient in this ${target.name}?`,
      option_a: opts[0],
      option_b: opts[1],
      option_c: opts[2],
      option_d: opts[3],
      correct_option: correctLetter,
      source_type: 'auto',
      source_table: 'menu_items',
      templateId: 'menu_photo_ingredient',
      question_image_url: target.thumbnail_url,
      question_text_es: `¿Cuál de estos es un ingrediente de este ${nameEs}?`,
      option_a_es: opts[0],
      option_b_es: opts[1],
      option_c_es: opts[2],
      option_d_es: opts[3],
    };
  }

  // ─── Form 3: Dietary flag (Yes/No/Depends/Unknown) ──────────────────
  // Alternate randomly between vegetarian and gluten-free based on what's known.
  const useVeg = target.is_vegetarian && (!target.is_gluten_free || rng() < 0.5);
  const flagQuestionEn = useVeg ? 'Is this item vegetarian?' : 'Is this item gluten-free?';
  const flagQuestionEs = useVeg ? '¿Este platillo es vegetariano?' : '¿Este platillo es libre de gluten?';
  const correctAnswer = 'Yes'; // We only use this form when the item has the flag set
  const correctAnswerEs = 'Sí';

  const answerPool = ['No', 'Depends on preparation', 'Not listed'];
  const answerPoolEs = ['No', 'Depende de la preparación', 'No indicado'];
  const { options: opts, correctLetter } = shuffleOptions(correctAnswer, answerPool, rng);
  // Map EN answers back to ES in the shuffled order
  const enToEs = new Map<string, string>([
    [correctAnswer, correctAnswerEs],
    ...answerPool.map((en, idx) => [en, answerPoolEs[idx]] as [string, string]),
  ]);
  const optsEs = opts.map(o => enToEs.get(o) || o);

  return {
    question_text: flagQuestionEn,
    option_a: opts[0],
    option_b: opts[1],
    option_c: opts[2],
    option_d: opts[3],
    correct_option: correctLetter,
    source_type: 'auto',
    source_table: 'menu_items',
    templateId: 'menu_photo_dietary',
    question_image_url: target.thumbnail_url,
    question_text_es: flagQuestionEs,
    option_a_es: optsEs[0],
    option_b_es: optsEs[1],
    option_c_es: optsEs[2],
    option_d_es: optsEs[3],
  };
}

// Exported so exam-editor's per-question refresh can regenerate a picture
// question against a filtered pool (excluding the item currently shown).
export async function generatePhotoQuestion(
  excludeMenuItemIds: string[] = [],
  seed?: string,
): Promise<GeneratedQuestion | null> {
  const pool = await fetchMenuItemsWithImages();
  const rng = seededRandom(hashString(seed || `photo-${Date.now()}-${Math.random()}`));
  const q = menuPhotoQuestion(pool, rng, new Set(excludeMenuItemIds));
  if (!q) return null;
  const { templateId, ...rest } = q;
  return rest;
}

// =============================================
// MAIN GENERATOR
// =============================================

export async function generateQuizQuestions(
  examType: ExamType,
  cycleKey: string,
  questionCount: number = 5,
): Promise<GeneratedQuestion[]> {
  const seedStr = `${cycleKey}-${examType}`;
  const rng = seededRandom(hashString(seedStr));

  // Fetch all data sources
  const menuItems = await fetchMenuItems();
  const photoPool = await fetchMenuItemsWithImages();

  // Build candidate pool based on exam type
  const candidates: QuestionCandidate[] = [];

  // ─── Picture question slots (1-in-5 ratio) ──────────────────────────
  // Reserve Math.max(1, round(count/5)) slots for picture questions.
  // Gracefully downgrades to 0 if the image pool is too small.
  const reservedPhotoSlots = Math.max(1, Math.round(questionCount / 5));
  const usedPhotoItemIds = new Set<string>();
  let photoSlotsFilled = 0;
  for (let i = 0; i < reservedPhotoSlots; i++) {
    const q = menuPhotoQuestion(photoPool, rng, usedPhotoItemIds);
    if (!q) {
      if (photoSlotsFilled < reservedPhotoSlots) {
        console.warn(
          `[questionGenerator] Picture pool too small — filled ${photoSlotsFilled}/${reservedPhotoSlots} photo slots, falling back to text questions.`,
        );
      }
      break;
    }
    // Track the underlying menu_item so we don't re-use it this quiz.
    // We identify it by matching thumbnail_url in the pool.
    const usedItem = photoPool.find(m => m.thumbnail_url === q.question_image_url && !usedPhotoItemIds.has(m.id));
    if (usedItem) usedPhotoItemIds.add(usedItem.id);
    candidates.push(q);
    photoSlotsFilled++;
  }

  // Menu questions — available for all exam types
  const menuGenerators = [
    () => menuPriceQuestion(menuItems, rng),
    () => menuCategoryQuestion(menuItems, rng),
    () => menuGlutenFreeQuestion(menuItems, rng),
    () => menuVegetarianQuestion(menuItems, rng),
  ];

  // Libation/cocktail questions — Server and Bartender only
  if (examType === 'server' || examType === 'bartender') {
    const cocktails = await fetchCocktails();
    const libations = await fetchLibationRecipes();
    const winePairings = await fetchWinePairings();

    menuGenerators.push(
      () => cocktailSpiritQuestion(cocktails, rng),
      () => libationGlasswareQuestion(libations, rng),
      () => libationGarnishQuestion(libations, rng),
      () => winePairingQuestion(winePairings, rng),
      () => libationIngredientQuestion(libations, rng),
    );
  }

  // Checklist questions — Bartender and Host
  if (examType === 'bartender') {
    const checklistItems = await fetchBartenderChecklistItems();
    menuGenerators.push(() => checklistQuestion(checklistItems, 'Bartender', rng));
  } else if (examType === 'host') {
    const checklistItems = await fetchHostChecklistItems();
    menuGenerators.push(() => checklistQuestion(checklistItems, 'Host', rng));
  }

  // Shuffle generators for variety
  const shuffledGenerators = seededShuffle(menuGenerators, rng);

  // Generate candidates, ensuring no duplicate templates
  const usedTemplates = new Set<string>();
  const usedSourceTables = new Map<string, number>();

  for (const gen of shuffledGenerators) {
    if (candidates.length >= questionCount) break;

    const q = gen();
    if (!q) continue;

    // Skip if we already used this template
    if (usedTemplates.has(q.templateId)) continue;

    // Skip if we already have 2 questions from this source table
    const sourceCount = usedSourceTables.get(q.source_table) || 0;
    if (sourceCount >= 2) continue;

    usedTemplates.add(q.templateId);
    usedSourceTables.set(q.source_table, sourceCount + 1);
    candidates.push(q);
  }

  // If we still need more questions, relax the template uniqueness constraint
  if (candidates.length < questionCount) {
    for (const gen of shuffledGenerators) {
      if (candidates.length >= questionCount) break;
      const q = gen();
      if (!q) continue;
      // Just check for exact duplicate question text
      if (candidates.some(c => c.question_text === q.question_text)) continue;
      candidates.push(q);
    }
  }

  // Strip templateId from output
  return candidates.slice(0, questionCount).map(({ templateId, ...rest }) => rest);
}

// Get display name for exam type
export function getExamTypeName(examType: ExamType, isSpanish = false): string {
  if (isSpanish) {
    switch (examType) {
      case 'server': return 'Servidor';
      case 'bartender': return 'Bartender';
      case 'host': return 'Anfitrión';
    }
  }
  switch (examType) {
    case 'server': return 'Server';
    case 'bartender': return 'Bartender';
    case 'host': return 'Host';
  }
}

// Get current ISO week key (e.g., "2026-W14")
export function getCurrentWeekKey(): string {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + yearStart.getDay()) / 7);
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
