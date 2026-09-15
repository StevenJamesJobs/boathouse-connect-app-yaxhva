
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

// ── Theme Color System ──────────────────────────────────────────────

export interface ThemeColorSet {
  background: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryLight: string;
  card: string;
  highlight: string;
  border: string;
  tabBarBackground: string;
  tabBarActive: string;
  tabBarInactive: string;
  accent: string;
  darkText: string;
  darkSecondaryText: string;
  // ── Glass redesign tokens (additive; `card` stays SOLID) ───────────
  // Mapped from the locked mockup CSS vars (design-mockups/welcome-myresto.html).
  tint: string;             // branded warm accent — stays orange in Moonstone (--tint)
  ember: string;            // lighter accent / gradient stop (--ember)
  fireText: string;         // text/icon on top of `primary` fills (--fireText)
  blue: string;             // NEW / notification badge bg (--blue)
  blueText: string;         // text on blue badges, "pickup" accents (--bluetext)
  glass: string;            // translucent glass fill for the header (--glass)
  glassBorder: string;      // glass border (--glassbd)
  surface: string;          // translucent card / segment fill (--surf)
  surfaceBorder: string;    // surface border (--surfbd)
  hairline: string;         // row dividers inside glass cards (--hair)
  navTint: string;          // bottom-nav blur tint (--nav)
  sheen: string;            // inset top highlight on nav / glass (--sheen)
  thumbPlaceholder: string; // image / thumbnail placeholder bg (--thumbbg)
  glowA: string;            // ambient corner glow A (--glowA)
  glowB: string;            // ambient corner glow B (--glowB)
}

// s84: six presets on the glass tokens + 'custom' (a hue on a neutral base, derived at
// runtime by utils/theme/customAccent.ts — it has no static entry in themePalettes).
export type PresetPaletteId = 'moonstone' | 'ocean' | 'midnight' | 'emerald' | 'gilded' | 'ember';
export type ThemePaletteId = PresetPaletteId | 'custom';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemePalette {
  light: ThemeColorSet;
  dark: ThemeColorSet;
  label: string;
  previewColors: string[];
  /** The accent's hue (0–360) — the custom-accent slider seeds from it. */
  hue: number;
}

export const themePalettes: Record<PresetPaletteId, ThemePalette> = {
  // ── Moonstone — MyResto Connect default (dark). Soft near-white accent
  //    on charcoal, with a warm orange `tint` for branded surfaces. ──────
  moonstone: {
    label: 'Moonstone',
    hue: 21,
    previewColors: ['#E6EAEE', '#C7CDD2', '#FF7A2F', '#181B21'],
    light: {
      background: '#ECECEE',
      text: '#22262C',
      textSecondary: '#6E747C',
      primary: '#3A4250',
      primaryLight: '#5A6270',
      card: '#FFFFFF',
      highlight: '#E3E3E6',
      border: '#D2D3D7',
      tabBarBackground: '#E6E6E9',
      tabBarActive: '#3A4250',
      tabBarInactive: '#8A9098',
      accent: '#FF7A2F',
      darkText: '#22262C',
      darkSecondaryText: '#6E747C',
      tint: '#FF7A2F',
      ember: '#2A313C',
      fireText: '#FFFFFF',
      blue: '#7E8A94',
      blueText: '#2A313C',
      glass: 'rgba(255,255,255,0.60)',
      glassBorder: 'rgba(255,255,255,0.85)',
      surface: 'rgba(255,255,255,0.64)',
      surfaceBorder: 'rgba(0,0,0,0.07)',
      hairline: 'rgba(0,0,0,0.07)',
      navTint: 'rgba(255,255,255,0.50)',
      sheen: 'rgba(255,255,255,0.92)',
      thumbPlaceholder: '#D8D8DC',
      glowA: 'rgba(58,66,80,0.10)',
      glowB: 'rgba(126,138,148,0.10)',
    },
    dark: {
      background: '#181B21',
      text: '#F4F6F8',
      textSecondary: '#9AA1A8',
      primary: '#E6EAEE',
      primaryLight: '#C7CDD2',
      card: '#232830',
      highlight: '#2A3038',
      border: '#2E343C',
      tabBarBackground: '#181B21',
      tabBarActive: '#E6EAEE',
      tabBarInactive: '#9AA1A8',
      accent: '#FF7A2F',
      darkText: '#F4F6F8',
      darkSecondaryText: '#9AA1A8',
      tint: '#FF7A2F',
      ember: '#C7CDD2',
      fireText: '#1A1E24',
      blue: '#8FA0AC',
      blueText: '#CDD8DF',
      glass: 'rgba(255,255,255,0.07)',
      glassBorder: 'rgba(255,255,255,0.12)',
      surface: 'rgba(255,255,255,0.05)',
      surfaceBorder: 'rgba(255,255,255,0.09)',
      hairline: 'rgba(255,255,255,0.07)',
      navTint: 'rgba(24,27,33,0.42)',
      sheen: 'rgba(255,255,255,0.13)',
      thumbPlaceholder: '#252A31',
      glowA: 'rgba(230,234,238,0.10)',
      glowB: 'rgba(143,160,172,0.10)',
    },
  },
  // ── Ocean — Boathouse Connect default (dark). Existing well-tested base
  //    14 tokens preserved verbatim; glass tokens appended. ───────────────
  ocean: {
    label: 'Ocean',
    hue: 210,
    previewColors: ['#1976D2', '#42A5F5', '#90CAF9', '#E8F4F8'],
    light: {
      background: '#E8F4F8',
      text: '#1A3A52',
      textSecondary: '#4A6B7C',
      primary: '#1976D2',
      primaryLight: '#42A5F5',
      card: '#FFFFFF',
      highlight: '#90CAF9',
      border: '#B0BEC5',
      tabBarBackground: '#d9ebfa',
      tabBarActive: '#1976D2',
      tabBarInactive: '#6A8FAA',
      accent: '#42A5F5',
      darkText: '#1A3A52',
      darkSecondaryText: '#4A6B7C',
      tint: '#1976D2',
      ember: '#1565C0',
      fireText: '#FFFFFF',
      blue: '#42A5F5',
      blueText: '#0D47A1',
      glass: 'rgba(255,255,255,0.62)',
      glassBorder: 'rgba(255,255,255,0.90)',
      surface: 'rgba(255,255,255,0.70)',
      surfaceBorder: 'rgba(13,71,161,0.10)',
      hairline: 'rgba(13,71,161,0.08)',
      navTint: 'rgba(255,255,255,0.52)',
      sheen: 'rgba(255,255,255,0.95)',
      thumbPlaceholder: '#CFE4EC',
      glowA: 'rgba(25,118,210,0.16)',
      glowB: 'rgba(66,165,245,0.12)',
    },
    dark: {
      background: '#1A2332',
      text: '#FFFFFF',
      textSecondary: '#A8B8D8',
      primary: '#4A90E2',
      primaryLight: '#6BADE8',
      card: '#2C3E50',
      highlight: '#5DADE2',
      border: '#34495E',
      tabBarBackground: '#1A2332',
      tabBarActive: '#4A90E2',
      tabBarInactive: '#A8BDD4',
      accent: '#3498DB',
      darkText: '#FFFFFF',
      darkSecondaryText: '#A8B8D8',
      tint: '#5DA0E5',
      ember: '#6BADE8',
      fireText: '#0A1422',
      blue: '#5DADE2',
      blueText: '#BFE3F7',
      glass: 'rgba(255,255,255,0.07)',
      glassBorder: 'rgba(255,255,255,0.13)',
      surface: 'rgba(255,255,255,0.05)',
      surfaceBorder: 'rgba(255,255,255,0.10)',
      hairline: 'rgba(255,255,255,0.08)',
      navTint: 'rgba(26,35,50,0.42)',
      sheen: 'rgba(255,255,255,0.13)',
      thumbPlaceholder: '#2C3E50',
      glowA: 'rgba(74,144,226,0.30)',
      glowB: 'rgba(93,173,226,0.15)',
    },
  },
  // ── Midnight — indigo-violet, revived from the pre-glass set on the glass tokens. ──
  midnight: {
    label: 'Midnight',
    hue: 250,
    previewColors: ['#8C7CFF', '#ABA0FF', '#7FA6FF', '#141628'],
    light: {
      background: '#EEEEF8', text: '#1E1F3A', textSecondary: '#62648A',
      primary: '#5B4FD9', primaryLight: '#7C72E6', card: '#FFFFFF', highlight: '#E2E1F7', border: '#CFCFE6',
      tabBarBackground: '#E6E6F4', tabBarActive: '#5B4FD9', tabBarInactive: '#8587AD', accent: '#5B4FD9',
      darkText: '#1E1F3A', darkSecondaryText: '#62648A',
      tint: '#5B4FD9', ember: '#3F35B3', fireText: '#FFFFFF', blue: '#4C7DE8', blueText: '#1E3F9E',
      glass: 'rgba(255,255,255,0.62)', glassBorder: 'rgba(255,255,255,0.90)',
      surface: 'rgba(255,255,255,0.68)', surfaceBorder: 'rgba(46,49,87,0.10)', hairline: 'rgba(46,49,87,0.08)',
      navTint: 'rgba(255,255,255,0.52)', sheen: 'rgba(255,255,255,0.95)', thumbPlaceholder: '#DCDBEE',
      glowA: 'rgba(91,79,217,0.16)', glowB: 'rgba(76,125,232,0.12)',
    },
    dark: {
      background: '#141628', text: '#F1F1FA', textSecondary: '#A3A6C4',
      primary: '#8C7CFF', primaryLight: '#ABA0FF', card: '#1F2140', highlight: '#2A2D52', border: '#2E3157',
      tabBarBackground: '#141628', tabBarActive: '#8C7CFF', tabBarInactive: '#8B8FB5', accent: '#8C7CFF',
      darkText: '#F1F1FA', darkSecondaryText: '#A3A6C4',
      tint: '#8C7CFF', ember: '#B8AEFF', fireText: '#0F0F26', blue: '#7FA6FF', blueText: '#C8D8FF',
      glass: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.13)',
      surface: 'rgba(255,255,255,0.05)', surfaceBorder: 'rgba(255,255,255,0.10)', hairline: 'rgba(255,255,255,0.08)',
      navTint: 'rgba(20,22,40,0.42)', sheen: 'rgba(255,255,255,0.13)', thumbPlaceholder: '#262948',
      glowA: 'rgba(140,124,255,0.30)', glowB: 'rgba(127,166,255,0.14)',
    },
  },
  // ── Emerald — green on deep teal-black, revived. ──
  emerald: {
    label: 'Emerald',
    hue: 160,
    previewColors: ['#34D399', '#6EE7B7', '#5FB8D8', '#0E2220'],
    light: {
      background: '#EAF6F1', text: '#10312A', textSecondary: '#4E6F66',
      primary: '#0F8A62', primaryLight: '#2FA57E', card: '#FFFFFF', highlight: '#D9EFE6', border: '#BFD8CE',
      tabBarBackground: '#DFF0E8', tabBarActive: '#0F8A62', tabBarInactive: '#6F918A', accent: '#0F8A62',
      darkText: '#10312A', darkSecondaryText: '#4E6F66',
      tint: '#0F8A62', ember: '#0A6A4B', fireText: '#FFFFFF', blue: '#2E8FB0', blueText: '#0F4F66',
      glass: 'rgba(255,255,255,0.62)', glassBorder: 'rgba(255,255,255,0.90)',
      surface: 'rgba(255,255,255,0.70)', surfaceBorder: 'rgba(15,80,60,0.10)', hairline: 'rgba(15,80,60,0.08)',
      navTint: 'rgba(255,255,255,0.52)', sheen: 'rgba(255,255,255,0.95)', thumbPlaceholder: '#D3E6DD',
      glowA: 'rgba(15,138,98,0.16)', glowB: 'rgba(46,143,176,0.12)',
    },
    dark: {
      background: '#0E2220', text: '#ECFDF5', textSecondary: '#97B8AF',
      primary: '#34D399', primaryLight: '#6EE7B7', card: '#16302C', highlight: '#1E3E38', border: '#24463F',
      tabBarBackground: '#0E2220', tabBarActive: '#34D399', tabBarInactive: '#86A79E', accent: '#34D399',
      darkText: '#ECFDF5', darkSecondaryText: '#97B8AF',
      tint: '#34D399', ember: '#86EFC4', fireText: '#062A1F', blue: '#5FB8D8', blueText: '#BFEAF5',
      glass: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.13)',
      surface: 'rgba(255,255,255,0.05)', surfaceBorder: 'rgba(255,255,255,0.10)', hairline: 'rgba(255,255,255,0.08)',
      navTint: 'rgba(14,34,32,0.42)', sheen: 'rgba(255,255,255,0.13)', thumbPlaceholder: '#1E3E38',
      glowA: 'rgba(52,211,153,0.28)', glowB: 'rgba(95,184,216,0.13)',
    },
  },
  // ── Gilded — the old Black & Gold, revived. ──
  gilded: {
    label: 'Gilded',
    hue: 46,
    previewColors: ['#D4AF37', '#F2D67A', '#7FA3B8', '#0C0C0C'],
    light: {
      background: '#F8F5ED', text: '#24201A', textSecondary: '#6E665A',
      primary: '#A88618', primaryLight: '#C9A64A', card: '#FFFFFF', highlight: '#F0E9D6', border: '#DDD4BE',
      tabBarBackground: '#F1ECDF', tabBarActive: '#A88618', tabBarInactive: '#8E8677', accent: '#A88618',
      darkText: '#24201A', darkSecondaryText: '#6E665A',
      tint: '#A88618', ember: '#7D6410', fireText: '#FFFFFF', blue: '#4E7C95', blueText: '#234258',
      glass: 'rgba(255,255,255,0.62)', glassBorder: 'rgba(255,255,255,0.90)',
      surface: 'rgba(255,255,255,0.68)', surfaceBorder: 'rgba(60,50,20,0.10)', hairline: 'rgba(60,50,20,0.08)',
      navTint: 'rgba(255,255,255,0.52)', sheen: 'rgba(255,255,255,0.95)', thumbPlaceholder: '#E6DFCF',
      glowA: 'rgba(168,134,24,0.16)', glowB: 'rgba(78,124,149,0.11)',
    },
    dark: {
      background: '#0C0C0C', text: '#F5F1E6', textSecondary: '#A89F8E',
      primary: '#D4AF37', primaryLight: '#E6C766', card: '#1A1810', highlight: '#262214', border: '#2E2A1C',
      tabBarBackground: '#0C0C0C', tabBarActive: '#D4AF37', tabBarInactive: '#8F877A', accent: '#D4AF37',
      darkText: '#F5F1E6', darkSecondaryText: '#A89F8E',
      tint: '#D4AF37', ember: '#F2D67A', fireText: '#1A1200', blue: '#7FA3B8', blueText: '#C9DEE8',
      glass: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.12)',
      surface: 'rgba(255,255,255,0.045)', surfaceBorder: 'rgba(255,255,255,0.09)', hairline: 'rgba(255,255,255,0.07)',
      navTint: 'rgba(12,12,12,0.42)', sheen: 'rgba(255,255,255,0.13)', thumbPlaceholder: '#242018',
      glowA: 'rgba(212,175,55,0.26)', glowB: 'rgba(127,163,184,0.10)',
    },
  },
  // ── Ember — warm coral on espresso, new for the glass era. ──
  ember: {
    label: 'Ember',
    hue: 12,
    previewColors: ['#FF6B4A', '#FFB07A', '#F0A86C', '#1C1512'],
    light: {
      background: '#F6EEE9', text: '#2B1E18', textSecondary: '#7A675C',
      primary: '#D9482A', primaryLight: '#E8735A', card: '#FFFFFF', highlight: '#F3E0D7', border: '#E0CFC4',
      tabBarBackground: '#F0E4DD', tabBarActive: '#D9482A', tabBarInactive: '#9C8A80', accent: '#D9482A',
      darkText: '#2B1E18', darkSecondaryText: '#7A675C',
      tint: '#D9482A', ember: '#B33A20', fireText: '#FFFFFF', blue: '#C67A2C', blueText: '#6A3D0E',
      glass: 'rgba(255,255,255,0.62)', glassBorder: 'rgba(255,255,255,0.90)',
      surface: 'rgba(255,255,255,0.70)', surfaceBorder: 'rgba(80,40,25,0.10)', hairline: 'rgba(80,40,25,0.08)',
      navTint: 'rgba(255,255,255,0.52)', sheen: 'rgba(255,255,255,0.95)', thumbPlaceholder: '#E9DBD2',
      glowA: 'rgba(217,72,42,0.16)', glowB: 'rgba(198,122,44,0.11)',
    },
    dark: {
      background: '#1C1512', text: '#FBF2EC', textSecondary: '#B5A398',
      primary: '#FF6B4A', primaryLight: '#FF8F76', card: '#2A2018', highlight: '#362A21', border: '#3E3028',
      tabBarBackground: '#1C1512', tabBarActive: '#FF6B4A', tabBarInactive: '#9C8C80', accent: '#FF6B4A',
      darkText: '#FBF2EC', darkSecondaryText: '#B5A398',
      tint: '#FF6B4A', ember: '#FFB07A', fireText: '#2A0F08', blue: '#F0A86C', blueText: '#FFE1C6',
      glass: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.12)',
      surface: 'rgba(255,255,255,0.05)', surfaceBorder: 'rgba(255,255,255,0.09)', hairline: 'rgba(255,255,255,0.07)',
      navTint: 'rgba(28,21,18,0.42)', sheen: 'rgba(255,255,255,0.13)', thumbPlaceholder: '#3A2C24',
      glowA: 'rgba(255,107,74,0.28)', glowB: 'rgba(240,168,108,0.12)',
    },
  },
};

export const THEME_PALETTE_IDS: PresetPaletteId[] = ['moonstone', 'ocean', 'midnight', 'emerald', 'gilded', 'ember'];

// Backward-compatible aliases (map to Ocean palette)
export const employeeColors: ThemeColorSet = themePalettes.ocean.light;
export const managerColors: ThemeColorSet = themePalettes.ocean.dark;

// Utility to convert hex color to rgba string (useful for BlurView backgrounds)
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Splash / Legacy Colors (unchanged) ──────────────────────────────

// Splash Screen Colors
export const splashColors = {
  background: '#FFFFFF',
  primary: '#2C5F8D',
  secondary: '#A7D9ED',
  text: '#2E3B4E',
  textSecondary: '#607B96',
};

// Legacy colors for backward compatibility
export const colors = {
  primary: '#162456',
  secondary: '#193cb8',
  accent: '#64B5F6',
  background: '#101824',
  backgroundAlt: '#162133',
  text: '#e3e3e3',
  grey: '#90CAF9',
  card: '#193cb8',
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: colors.backgroundAlt,
    alignSelf: 'center',
    width: '100%',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.grey,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: "white",
  },
});
