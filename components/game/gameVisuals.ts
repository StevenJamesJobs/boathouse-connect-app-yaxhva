/**
 * The games' shared color language (s75, grown s76) — one source for the
 * per-GAME accents (hub tiles, editor rows), the per-CATEGORY accents that
 * repeat across games (food = sky, libations = azure, wine = indigo,
 * prices = navy), and the s76 PLAY-KIT surfaces: the fixed-dark
 * console gradients, the theme-aware board gradients, and the word-search
 * capsule palettes. Screens map their local mode/category keys onto these so
 * a palette tweak or a new category is a one-file change.
 *
 * Consoles are FIXED-DARK surfaces in both themes (the rulebook's ember rule:
 * literal white text on them, never theme tokens). Boards are THEME-AWARE:
 * pick `board.dark` / `board.light` from the active scheme.
 */
export interface GameVisual {
  accent: string;
  gradient: readonly [string, string];
}

/** s76 play-kit surface set for one game. */
export interface GamePlayVisual {
  /** Fixed-dark console card gradient (3 stops, 135°) — same in both themes. */
  console: readonly [string, string, string];
  /** Theme-aware board gradients (150°): dark scheme / light scheme. */
  board: {
    dark: readonly [string, string, string];
    light: readonly [string, string, string];
  };
  /** Board letter / on-board ink color per scheme (word search, memory board chrome). */
  boardInk: { dark: string; light: string };
}

// The Blues set (Steve, s75): one scale, light→dark — sky → azure → royal
// indigo → navy. Games and categories take steps on the scale; accents sit a
// step deeper than the gradients so colored text reads on light-theme cards.
export const GAME_VISUALS = {
  word_search: { accent: '#0EA5E9', gradient: ['#0B5E86', '#41B4E8'] },
  memory: { accent: '#3B82F6', gradient: ['#1D3E8F', '#5C8DF0'] },
  picture_this: { accent: '#5B5BD6', gradient: ['#28246E', '#6663E0'] },
} as const satisfies Record<string, GameVisual>;

export const CATEGORY_VISUALS = {
  food: { accent: '#0EA5E9', gradient: ['#0B5E86', '#41B4E8'] },
  libations: { accent: '#3B82F6', gradient: ['#1D3E8F', '#5C8DF0'] },
  wine: { accent: '#5B5BD6', gradient: ['#28246E', '#6663E0'] },
  menu_prices: { accent: '#4C5FC7', gradient: ['#101A45', '#3D4E9E'] },
} as const satisfies Record<string, GameVisual>;

// ─── s76 play-kit surfaces (locked in the round-4 mockups) ───────────────────

export const PLAY_VISUALS = {
  word_search: {
    console: ['#06354D', '#0B5E86', '#1180B4'],
    board: {
      dark: ['#052A3E', '#083D5A', '#0B5E86'],
      light: ['#E9F4FC', '#D6EAF9', '#C2E1F7'],
    },
    boardInk: { dark: '#EAF6FF', light: '#0B3550' },
  },
  memory: {
    console: ['#122557', '#1D3E8F', '#3A63C4'],
    board: {
      dark: ['#0F1B45', '#1D3E8F', '#2E52AE'],
      light: ['#E7EDFC', '#D5DFFA', '#C2D2F7'],
    },
    boardInk: { dark: '#EAF0FF', light: '#16255C' },
  },
  picture_this: {
    console: ['#191646', '#28246E', '#4A46B4'],
    board: {
      dark: ['#141034', '#28246E', '#3D39A0'],
      light: ['#ECEAFB', '#DCD9F8', '#C9C6F4'],
    },
    boardInk: { dark: '#ECEAFF', light: '#241F66' },
  },
} as const satisfies Record<keyof typeof GAME_VISUALS, GamePlayVisual>;

/**
 * Word-search found-word capsule palettes — cycled per word. Dark boards get
 * the airy pastels (rendered at low opacity with a soft glow); light boards
 * get deeper hues (WS·B lockdown: no ring, slightly deeper fill + soft glow).
 */
export const WS_CAPSULE_COLORS = {
  dark: ['#7DE3FF', '#5EEAD4', '#A5B4FC', '#93C5FD', '#C4B5FD', '#86EFAC'],
  light: ['#0284C7', '#0D9488', '#6366F1', '#2563EB', '#7C3AED', '#059669'],
} as const;

/** In-progress drag capsule outline per scheme (word search). */
export const WS_DRAG_OUTLINE = { dark: '#FFFFFF', light: '#0B5E86' } as const;

// ─── Fixed-dark-surface literals (ember-rule class: never theme tokens) ──────

/** Lives hearts on consoles — filled / empty. */
export const HEART_FULL = '#FF7A93';
export const HEART_EMPTY = 'rgba(255,255,255,0.35)';
/** Trophy/bonus gold — matches the hub's trophy chrome. */
export const BONUS_GOLD = '#F59E0B';
/** Gold variants that read on dark glass (toast pill, streak chip). */
export const BONUS_GOLD_SOFT = '#FFC968';
/** Muted label ink on consoles. */
export const CONSOLE_MUTED = 'rgba(255,255,255,0.66)';
/** Chip/pill fill + border on consoles. */
export const CONSOLE_CHIP_BG = 'rgba(8,10,14,0.32)';
export const CONSOLE_CHIP_BORDER = 'rgba(255,255,255,0.18)';

/** Memory face eyebrow inks (primary = wine/ingredient side, match = entree/dish side). */
export const MEM_SUB_PRIMARY = '#41B4E8';
export const MEM_SUB_MATCH = '#8FA8E8';
