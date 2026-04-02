/**
 * Word Search Engine
 * Handles grid generation, word placement, and scoring logic.
 */

import { GridCell, WordSearchDifficulty, WordSearchPlayMode, WordSearchPuzzle, WordSearchWord } from '@/types/game';

// ─── Difficulty Config ────────────────────────────────────────────────────────

export interface WordSearchDifficultyConfig {
  difficulty: WordSearchDifficulty;
  rows: number;
  cols: number;
  itemCount: number;           // how many menu items to pull
  timeLimitSeconds: number;    // 0 = no limit (free mode uses this too but ignores it)
}

export const WORD_SEARCH_DIFFICULTY_CONFIGS: WordSearchDifficultyConfig[] = [
  { difficulty: 'easy',   rows: 10, cols: 10, itemCount: 1, timeLimitSeconds: 120 },
  { difficulty: 'medium', rows: 12, cols: 12, itemCount: 2, timeLimitSeconds: 180 },
  { difficulty: 'hard',   rows: 15, cols: 15, itemCount: 4, timeLimitSeconds: 240 },
];

export function getDifficultyConfig(difficulty: WordSearchDifficulty): WordSearchDifficultyConfig {
  return WORD_SEARCH_DIFFICULTY_CONFIGS.find((c) => c.difficulty === difficulty)
    ?? WORD_SEARCH_DIFFICULTY_CONFIGS[0];
}

// ─── Stop Words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'with', 'and', 'the', 'from', 'over', 'served', 'fresh', 'house',
  'made', 'your', 'side', 'that', 'this', 'have', 'each', 'our',
  'chef', 'choice', 'style', 'glaze', 'sauce', 'base',
  'top', 'tops', 'topped', 'drizzle', 'drizzled',
  'fried', 'baked', 'grilled', 'roasted', 'braised',
  'sliced', 'diced', 'minced', 'mixed', 'shaved', 'tossed',
]);

// Min word length to include in puzzle
const MIN_WORD_LENGTH = 4;
// Max word length (longer words can be hard to fit in small grids)
const MAX_WORD_LENGTH = 12;

// ─── Word Extraction ──────────────────────────────────────────────────────────

/**
 * From a comma/newline-separated ingredient string, extract individual
 * search words (uppercase, letters only, filtered).
 * Returns objects with searchWord + displayLabel.
 */
export function extractIngredientWords(
  description: string,
  itemName: string
): Array<{ searchWord: string; displayLabel: string; itemName: string }> {
  if (!description?.trim()) return [];

  const phrases = description
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: Array<{ searchWord: string; displayLabel: string; itemName: string }> = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    // Get all meaningful words from this phrase
    const words = phrase
      .split(/[\s\-\/]+/)
      .map((w) => w.replace(/[^a-zA-Z]/g, '').toUpperCase())
      .filter((w) => {
        if (w.length < MIN_WORD_LENGTH) return false;
        if (w.length > MAX_WORD_LENGTH) return false;
        if (STOP_WORDS.has(w.toLowerCase())) return false;
        return true;
      });

    // Pick the longest word from this ingredient phrase as the search target
    if (words.length === 0) continue;
    const searchWord = words.sort((a, b) => b.length - a.length)[0];

    if (seen.has(searchWord)) continue;
    seen.add(searchWord);

    results.push({
      searchWord,
      displayLabel: capitalizePhrase(phrase),
      itemName,
    });
  }

  return results;
}

/**
 * From a JSONB libation_recipes ingredient array, extract search words.
 * Each element: { amount: string, ingredient: string }
 */
export function extractLibationWords(
  ingredients: Array<{ amount: string; ingredient: string }>,
  itemName: string
): Array<{ searchWord: string; displayLabel: string; itemName: string }> {
  const results: Array<{ searchWord: string; displayLabel: string; itemName: string }> = [];
  const seen = new Set<string>();

  for (const item of ingredients) {
    const phrase = item.ingredient?.trim() || '';
    if (!phrase) continue;

    const words = phrase
      .split(/[\s\-\/]+/)
      .map((w) => w.replace(/[^a-zA-Z]/g, '').toUpperCase())
      .filter((w) => {
        if (w.length < MIN_WORD_LENGTH) return false;
        if (w.length > MAX_WORD_LENGTH) return false;
        if (STOP_WORDS.has(w.toLowerCase())) return false;
        return true;
      });

    if (words.length === 0) continue;
    const searchWord = words.sort((a, b) => b.length - a.length)[0];

    if (seen.has(searchWord)) continue;
    seen.add(searchWord);

    results.push({
      searchWord,
      displayLabel: capitalizePhrase(phrase),
      itemName,
    });
  }

  return results;
}

function capitalizePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ─── Grid Generation ──────────────────────────────────────────────────────────

// 4 directions: right, down, diagonal down-right, diagonal down-left
const DIRECTIONS: GridCell[] = [
  { row: 0,  col: 1  },  // right
  { row: 1,  col: 0  },  // down
  { row: 1,  col: 1  },  // diagonal down-right
  { row: 1,  col: -1 },  // diagonal down-left
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Try to place a single word in the grid.
 * Returns the cells used or null if placement failed.
 */
function tryPlaceWord(
  grid: string[][],
  word: string,
  rows: number,
  cols: number
): { cells: GridCell[]; direction: GridCell } | null {
  const directions = shuffleArray(DIRECTIONS);

  for (const dir of directions) {
    // Calculate valid start positions for this direction
    const minRow = dir.row >= 0 ? 0 : word.length - 1;
    const maxRow = dir.row >= 0 ? rows - dir.row * (word.length - 1) - 1 : rows - 1;
    const minCol = dir.col >= 0 ? 0 : word.length - 1;
    const maxCol = dir.col >= 0 ? cols - dir.col * (word.length - 1) - 1 : cols - 1;

    if (maxRow < minRow || maxCol < minCol) continue;

    // Try up to 30 random positions
    for (let attempt = 0; attempt < 30; attempt++) {
      const startRow = randomInt(minRow, maxRow);
      const startCol = randomInt(minCol, maxCol);

      // Check if the word fits
      let fits = true;
      const candidateCells: GridCell[] = [];

      for (let i = 0; i < word.length; i++) {
        const r = startRow + dir.row * i;
        const c = startCol + dir.col * i;
        const existing = grid[r][c];
        if (existing !== '' && existing !== word[i]) {
          fits = false;
          break;
        }
        candidateCells.push({ row: r, col: c });
      }

      if (fits) {
        // Place the word
        for (let i = 0; i < word.length; i++) {
          grid[candidateCells[i].row][candidateCells[i].col] = word[i];
        }
        return { cells: candidateCells, direction: dir };
      }
    }
  }

  return null;
}

/**
 * Generate a complete word search puzzle from raw word data.
 */
export function generateWordSearchPuzzle(
  rawWords: Array<{ searchWord: string; displayLabel: string; itemName: string }>,
  difficulty: WordSearchDifficulty
): WordSearchPuzzle {
  const config = getDifficultyConfig(difficulty);
  const { rows, cols } = config;

  // Initialize empty grid
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));

  // Sort words by length desc (longer words are harder to place, do them first)
  const sortedWords = [...rawWords].sort((a, b) => b.searchWord.length - a.searchWord.length);

  const placedWords: WordSearchWord[] = [];

  for (const raw of sortedWords) {
    const result = tryPlaceWord(grid, raw.searchWord, rows, cols);
    if (result) {
      placedWords.push({
        id: `${raw.searchWord}_${Math.random().toString(36).slice(2, 7)}`,
        searchWord: raw.searchWord,
        displayLabel: raw.displayLabel,
        itemName: raw.itemName,
        found: false,
        cells: result.cells,
        direction: result.direction,
      });
    }
    // If word couldn't be placed, skip it silently
  }

  // Fill empty cells with random letters
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
    }
  }

  return { grid, words: placedWords, rows, cols };
}

// ─── Selection Logic ──────────────────────────────────────────────────────────

/**
 * Given a start cell and current cell, return all cells in a straight line.
 */
export function getSelectionCells(start: GridCell, current: GridCell): GridCell[] {
  if (start.row === current.row && start.col === current.col) {
    return [start];
  }

  const dr = current.row - start.row;
  const dc = current.col - start.col;

  // Determine dominant direction
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  let dirRow: number;
  let dirCol: number;

  if (absDr === 0) {
    // Pure horizontal
    dirRow = 0;
    dirCol = Math.sign(dc);
  } else if (absDc === 0) {
    // Pure vertical
    dirRow = Math.sign(dr);
    dirCol = 0;
  } else if (absDr === absDc) {
    // Perfect diagonal
    dirRow = Math.sign(dr);
    dirCol = Math.sign(dc);
  } else if (absDr > absDc) {
    // More vertical — snap to vertical
    dirRow = Math.sign(dr);
    dirCol = 0;
  } else {
    // More horizontal — snap to horizontal
    dirRow = 0;
    dirCol = Math.sign(dc);
  }

  // Generate cells from start in direction until we reach current's axis
  const cells: GridCell[] = [];
  const steps = Math.max(absDr, absDc);

  for (let i = 0; i <= steps; i++) {
    cells.push({ row: start.row + dirRow * i, col: start.col + dirCol * i });
  }

  return cells;
}

/**
 * Check if selected cells match any unFound word in the puzzle.
 * Returns the matched word id or null.
 */
export function checkWordMatch(
  selectedCells: GridCell[],
  words: WordSearchWord[]
): string | null {
  if (selectedCells.length < MIN_WORD_LENGTH) return null;

  for (const word of words) {
    if (word.found) continue;
    if (word.cells.length !== selectedCells.length) continue;

    // Check forward match
    const forwardMatch = word.cells.every(
      (c, i) => c.row === selectedCells[i].row && c.col === selectedCells[i].col
    );
    // Check reverse match (player dragged backwards)
    const reverseMatch = word.cells.every(
      (c, i) => c.row === selectedCells[word.cells.length - 1 - i].row &&
                 c.col === selectedCells[word.cells.length - 1 - i].col
    );

    if (forwardMatch || reverseMatch) return word.id;
  }

  return null;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export const POINTS_PER_WORD = 50;
export const TIMED_BONUS_PER_SECOND = 5;

export const DIFFICULTY_MULTIPLIER: Record<WordSearchDifficulty, number> = {
  easy: 1.5,
  medium: 3,
  hard: 5,
};

export function calculateWordSearchScore(
  wordsFound: number,
  timeRemaining: number,
  playMode: WordSearchPlayMode,
  difficulty: WordSearchDifficulty
): number {
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
  const wordPoints = Math.round(wordsFound * POINTS_PER_WORD * multiplier);
  const timeBonus = playMode === 'timed' ? Math.round(Math.max(0, timeRemaining) * TIMED_BONUS_PER_SECOND * multiplier) : 0;
  return wordPoints + timeBonus;
}

export function getTimeLimitSeconds(difficulty: WordSearchDifficulty): number {
  return getDifficultyConfig(difficulty).timeLimitSeconds;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
