/**
 * Custom accent (s84 Appearance) — ONE hue on ONE neutral base, derived into a full
 * ThemeColorSet pair at runtime. Bounded on purpose: the slider only moves the accent
 * family (tint / ember / primary / blue / glow); the neutrals (text, glass, surfaces,
 * hairlines) come verbatim from a preset so a custom theme can never pull itself apart,
 * and the ink on filled accents follows the house rule (dark ink in dark mode, white in
 * light mode — every preset does the same).
 *
 * Saved on the device only (`@app_theme_custom`), beside the theme id and mode.
 */
import {
  PresetPaletteId,
  ThemeColorSet,
  ThemePalette,
  themePalettes,
} from '@/styles/commonStyles';

export type NeutralBase = 'graphite' | 'navy' | 'espresso' | 'onyx' | 'slate' | 'ivory';

export interface CustomAccent {
  /** 0–360 */
  hue: number;
  base: NeutralBase;
  /** The preset the slider was seeded from (label only; null = free). */
  seed: PresetPaletteId | null;
}

export const CUSTOM_ACCENT_KEY = '@app_theme_custom';
export const NEUTRAL_BASES: NeutralBase[] = ['graphite', 'navy', 'espresso', 'onyx', 'slate', 'ivory'];

/** Which preset each base borrows its neutrals from (the three "derived" bases patch on top). */
const BASE_SOURCE: Record<NeutralBase, PresetPaletteId> = {
  graphite: 'moonstone',
  navy: 'ocean',
  espresso: 'ember',
  onyx: 'moonstone',
  slate: 'moonstone',
  ivory: 'moonstone',
};

/**
 * Per-base overrides on top of the borrowed preset neutrals. Onyx pushes Moonstone's dark set
 * to true black; Slate lifts it to a cool mid-grey; Ivory is a warm white in BOTH modes (the
 * "always light" base — its accents therefore use the light tone, see `toneOf`).
 */
const BASE_PATCH: Partial<Record<NeutralBase, { light?: Partial<NeutralSet>; dark?: Partial<NeutralSet> }>> = {
  onyx: {
    dark: {
      background: '#000000',
      card: '#101114',
      highlight: '#17181C',
      border: '#202227',
      tabBarBackground: '#000000',
      glass: 'rgba(255,255,255,0.06)',
      glassBorder: 'rgba(255,255,255,0.11)',
      surface: 'rgba(255,255,255,0.045)',
      navTint: 'rgba(0,0,0,0.42)',
      thumbPlaceholder: '#141518',
    },
  },
  slate: {
    dark: {
      background: '#2B3039',
      card: '#363C46',
      highlight: '#3D4450',
      border: '#465060',
      tabBarBackground: '#2B3039',
      textSecondary: '#AEB6BF',
      tabBarInactive: '#AEB6BF',
      darkSecondaryText: '#AEB6BF',
      glass: 'rgba(255,255,255,0.08)',
      glassBorder: 'rgba(255,255,255,0.14)',
      surface: 'rgba(255,255,255,0.06)',
      navTint: 'rgba(43,48,57,0.42)',
      thumbPlaceholder: '#3B424D',
    },
  },
  ivory: {
    light: {
      background: '#F6F2EA',
      card: '#FFFFFF',
      highlight: '#EFEAE0',
      border: '#DDD6C9',
      tabBarBackground: '#F1ECE2',
      text: '#2A2620',
      textSecondary: '#7A736A',
      darkText: '#2A2620',
      darkSecondaryText: '#7A736A',
      tabBarInactive: '#958D81',
      thumbPlaceholder: '#E6E0D4',
    },
    dark: {
      background: '#F6F2EA',
      card: '#FFFFFF',
      highlight: '#EFEAE0',
      border: '#DDD6C9',
      tabBarBackground: '#F1ECE2',
      text: '#2A2620',
      textSecondary: '#7A736A',
      darkText: '#2A2620',
      darkSecondaryText: '#7A736A',
      tabBarInactive: '#958D81',
      glass: 'rgba(255,255,255,0.62)',
      glassBorder: 'rgba(255,255,255,0.88)',
      surface: 'rgba(255,255,255,0.66)',
      surfaceBorder: 'rgba(0,0,0,0.07)',
      hairline: 'rgba(0,0,0,0.07)',
      navTint: 'rgba(255,255,255,0.50)',
      sheen: 'rgba(255,255,255,0.92)',
      thumbPlaceholder: '#E6E0D4',
    },
  },
};

/** The accent tone a base wants in a mode — Ivory is light in both. */
export function toneOf(base: NeutralBase, mode: 'light' | 'dark'): 'light' | 'dark' {
  return base === 'ivory' ? 'light' : mode;
}

/** The tokens that are NOT accent — copied from the base preset. */
const NEUTRAL_KEYS = [
  'background', 'text', 'textSecondary', 'card', 'highlight', 'border',
  'tabBarBackground', 'tabBarInactive', 'darkText', 'darkSecondaryText',
  'glass', 'glassBorder', 'surface', 'surfaceBorder', 'hairline', 'navTint', 'sheen',
  'thumbPlaceholder',
] as const;

type NeutralSet = Pick<ThemeColorSet, (typeof NEUTRAL_KEYS)[number]>;

export function clampHue(h: number): number {
  const n = Number.isFinite(h) ? Math.round(h) : 0;
  return ((n % 360) + 360) % 360;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = clampHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function rgbaOf(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type AccentKeys = Pick<
  ThemeColorSet,
  'primary' | 'primaryLight' | 'accent' | 'tabBarActive' | 'tint' | 'ember' | 'fireText' | 'blue' | 'blueText' | 'glowA' | 'glowB'
>;

/** The accent family for one hue in one mode. */
export function accentTokens(hue: number, mode: 'light' | 'dark'): AccentKeys {
  const h = clampHue(hue);
  const h2 = clampHue(h + 28); // the badge "blue" sits a step around the wheel
  if (mode === 'dark') {
    const tint = hslToHex(h, 86, 60);
    const blue = hslToHex(h2, 62, 66);
    return {
      primary: tint,
      primaryLight: hslToHex(h, 86, 70),
      accent: tint,
      tabBarActive: tint,
      tint,
      ember: hslToHex(h, 90, 76),
      fireText: hslToHex(h, 55, 9),
      blue,
      blueText: hslToHex(h2, 70, 86),
      glowA: rgbaOf(tint, 0.3),
      glowB: rgbaOf(blue, 0.13),
    };
  }
  const tint = hslToHex(h, 72, 42);
  const blue = hslToHex(h2, 60, 50);
  return {
    primary: tint,
    primaryLight: hslToHex(h, 70, 54),
    accent: tint,
    tabBarActive: tint,
    tint,
    ember: hslToHex(h, 70, 34),
    fireText: '#FFFFFF',
    blue,
    blueText: hslToHex(h2, 70, 24),
    glowA: rgbaOf(tint, 0.16),
    glowB: rgbaOf(blue, 0.11),
  };
}

function neutralsOf(base: NeutralBase, mode: 'light' | 'dark'): NeutralSet {
  const src = themePalettes[BASE_SOURCE[base]][mode];
  const out = {} as NeutralSet;
  for (const k of NEUTRAL_KEYS) (out as any)[k] = src[k];
  return { ...out, ...(BASE_PATCH[base]?.[mode] ?? {}) };
}

/** A full ThemePalette for a custom accent — drop-in for a preset. */
export function buildCustomPalette(c: CustomAccent): ThemePalette {
  const hue = clampHue(c.hue);
  const dark: ThemeColorSet = { ...neutralsOf(c.base, 'dark'), ...accentTokens(hue, toneOf(c.base, 'dark')) };
  const light: ThemeColorSet = { ...neutralsOf(c.base, 'light'), ...accentTokens(hue, toneOf(c.base, 'light')) };
  return {
    label: 'Custom',
    hue,
    previewColors: [dark.tint, dark.ember, dark.blue, dark.background],
    light,
    dark,
  };
}

/** Which base a preset's neutrals come from — used when a preset chip seeds the editor. */
export function baseForPreset(id: PresetPaletteId): NeutralBase {
  if (id === 'ocean') return 'navy';
  if (id === 'ember') return 'espresso';
  return 'graphite';
}

export function parseCustomAccent(raw: string | null | undefined): CustomAccent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const base: NeutralBase = NEUTRAL_BASES.includes(v.base) ? v.base : 'graphite';
    const seed: PresetPaletteId | null = v.seed && v.seed in themePalettes ? v.seed : null;
    return { hue: clampHue(Number(v.hue)), base, seed };
  } catch {
    return null;
  }
}
