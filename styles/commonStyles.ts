
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

export type ThemePaletteId = 'moonstone' | 'ocean';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemePalette {
  light: ThemeColorSet;
  dark: ThemeColorSet;
  label: string;
  previewColors: string[];
}

export const themePalettes: Record<ThemePaletteId, ThemePalette> = {
  // ── Moonstone — MyResto Connect default (dark). Soft near-white accent
  //    on charcoal, with a warm orange `tint` for branded surfaces. ──────
  moonstone: {
    label: 'Moonstone',
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
};

export const THEME_PALETTE_IDS: ThemePaletteId[] = ['moonstone', 'ocean'];

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
