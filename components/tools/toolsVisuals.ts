/**
 * The Tools Kit (s79) — every color the Tools pages use lives HERE, nowhere
 * else (the gameVisuals/quizVisuals/tipsVisuals discipline).
 *
 * Two color families with different rules:
 * - FAMILY accents (tile tints, icons): guides follows the THEME tint on
 *   purpose (the "house" family wears the house color, so it goes blue on the
 *   Ocean themes with everything else that is tint-driven); the other four are
 *   fixed hues borrowed from their own kits (game azure, quiz violet, tips
 *   emerald incl. its deep-light rule, rewards gold w/ amber-700 light ink).
 * - ASSISTANT hues are FIXED across themes (Steve's lockdown call after the
 *   theme-tinted flame rendered blue on Ocean): kitchen hot flame orange,
 *   bartender azure, host violet.
 *
 * HERO_GRADIENTS are fixed-dark surfaces — text on them is literal white and
 * eyebrows take the literal ember (#FFB07A), never theme tokens (the rulebook's
 * ember rule).
 */

export type ToolsScheme = 'light' | 'dark';

export type FamilyKey = 'guides' | 'game' | 'quiz' | 'tips' | 'rewards';

/** Fixed family accents; 'guides' is intentionally absent — use colors.tint. */
export const FAMILY_ACCENTS: Record<Exclude<FamilyKey, 'guides'>, Record<ToolsScheme, string>> = {
  game: { dark: '#3B82F6', light: '#2563EB' },
  quiz: { dark: '#7C5CE0', light: '#6D28D9' },
  tips: { dark: '#10A56F', light: '#087A52' },
  rewards: { dark: '#F59E0B', light: '#B45309' },
};

export type AssistantKey = 'kitchen' | 'bartender' | 'host';

export const ASSISTANT_HUES: Record<AssistantKey, Record<ToolsScheme, string>> = {
  kitchen: { dark: '#FF6B1A', light: '#E8590C' },
  bartender: { dark: '#3B82F6', light: '#2563EB' },
  host: { dark: '#5B5BD6', light: '#4A46B4' },
};

/** Tinted-glass tile wash (the r3 lockdown finish): accent at these alphas. */
export const TILE_BG_ALPHA: Record<ToolsScheme, number> = { dark: 0.11, light: 0.09 };
export const TILE_BORDER_ALPHA: Record<ToolsScheme, number> = { dark: 0.28, light: 0.24 };

/** Fixed-dark hero gradients (2–3 stops, 135°; quiz = the tri-role signature). */
export const HERO_GRADIENTS = {
  guides: ['#7C2D12', '#F97316'],
  game: ['#1D3E8F', '#5C8DF0'],
  quiz: ['#0D9488', '#4C5FC7', '#7C5CE0'],
  tips: ['#065F46', '#10B981'],
  rewards: ['#B45309', '#F59E0B'],
  slate: ['#2E333C', '#4A515D'],
} as const;

export type HeroGradientKey = keyof typeof HERO_GRADIENTS;

/** Ember eyebrow on fixed-dark surfaces — literal, never colors.ember. */
export const HERO_EYEBROW_INK = '#FFB07A';
export const HERO_TITLE_INK = '#FFFFFF';
export const HERO_SUB_INK = 'rgba(255,255,255,0.82)';
export const HERO_CHIP_BG = 'rgba(255,255,255,0.17)';
export const HERO_CHIP_BORDER = 'rgba(255,255,255,0.34)';
export const HERO_CARD_BORDER = 'rgba(255,255,255,0.16)';
export const HERO_WATERMARK_INK = 'rgba(255,255,255,0.13)';

/** Rotisserie timing (Steve's lockdown): step ~6s, idle-resume ~9s. */
export const HERO_ADVANCE_MS = 6000;
export const HERO_RESUME_MS = 9000;
