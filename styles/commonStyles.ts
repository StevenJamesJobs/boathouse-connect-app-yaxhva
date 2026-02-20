
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
}

export type ThemePaletteId =
  | 'ocean'
  | 'classic'
  | 'sunset'
  | 'forest'
  | 'midnight'
  | 'clean'
  | 'ruby'
  | 'emerald';

export type ThemeMode = 'light' | 'dark';

export interface ThemePalette {
  light: ThemeColorSet;
  dark: ThemeColorSet;
  label: string;
  previewColors: string[];
}

export const themePalettes: Record<ThemePaletteId, ThemePalette> = {
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
      tabBarInactive: '#7A95B0',
      accent: '#3498DB',
      darkText: '#FFFFFF',
      darkSecondaryText: '#A8B8D8',
    },
  },
  classic: {
    label: 'Classic',
    previewColors: ['#D4AF37', '#F5E6A8', '#2C2C2C', '#F5F5F0'],
    light: {
      background: '#F5F5F0',
      text: '#2C2C2C',
      textSecondary: '#6B6B6B',
      primary: '#D4AF37',
      primaryLight: '#E8CC6E',
      card: '#FFFFFF',
      highlight: '#F5E6A8',
      border: '#D4C9A8',
      tabBarBackground: '#F0EDE4',
      tabBarActive: '#D4AF37',
      tabBarInactive: '#8A8470',
      accent: '#B8972E',
      darkText: '#2C2C2C',
      darkSecondaryText: '#6B6B6B',
    },
    dark: {
      background: '#1C1A16',
      text: '#F5F0E0',
      textSecondary: '#BDB6A0',
      primary: '#D4AF37',
      primaryLight: '#E8CC6E',
      card: '#2C2820',
      highlight: '#3D3828',
      border: '#4A4435',
      tabBarBackground: '#1C1A16',
      tabBarActive: '#D4AF37',
      tabBarInactive: '#8A8070',
      accent: '#E8CC6E',
      darkText: '#F5F0E0',
      darkSecondaryText: '#BDB6A0',
    },
  },
  sunset: {
    label: 'Sunset',
    previewColors: ['#E65100', '#FF8A65', '#FFE0B2', '#FFF3E0'],
    light: {
      background: '#FFF3E0',
      text: '#3E2723',
      textSecondary: '#6D4C41',
      primary: '#E65100',
      primaryLight: '#FF8A65',
      card: '#FFFFFF',
      highlight: '#FFE0B2',
      border: '#FFCC80',
      tabBarBackground: '#FFF0DB',
      tabBarActive: '#E65100',
      tabBarInactive: '#9A7A60',
      accent: '#FF6D00',
      darkText: '#3E2723',
      darkSecondaryText: '#6D4C41',
    },
    dark: {
      background: '#2A1810',
      text: '#FFF3E0',
      textSecondary: '#FFCC80',
      primary: '#FF8A65',
      primaryLight: '#FFAB91',
      card: '#3E2518',
      highlight: '#4E3020',
      border: '#5D3A28',
      tabBarBackground: '#2A1810',
      tabBarActive: '#FF8A65',
      tabBarInactive: '#9A7A68',
      accent: '#FF6D00',
      darkText: '#FFF3E0',
      darkSecondaryText: '#FFCC80',
    },
  },
  forest: {
    label: 'Forest',
    previewColors: ['#2E7D32', '#66BB6A', '#A5D6A7', '#E8F5E9'],
    light: {
      background: '#E8F5E9',
      text: '#1B3A1C',
      textSecondary: '#4A6B4C',
      primary: '#2E7D32',
      primaryLight: '#66BB6A',
      card: '#FFFFFF',
      highlight: '#A5D6A7',
      border: '#A5D6A7',
      tabBarBackground: '#DCF0DD',
      tabBarActive: '#2E7D32',
      tabBarInactive: '#6A8A6C',
      accent: '#43A047',
      darkText: '#1B3A1C',
      darkSecondaryText: '#4A6B4C',
    },
    dark: {
      background: '#162118',
      text: '#E8F5E9',
      textSecondary: '#A5D6A7',
      primary: '#66BB6A',
      primaryLight: '#81C784',
      card: '#243028',
      highlight: '#2E3E30',
      border: '#385A3C',
      tabBarBackground: '#162118',
      tabBarActive: '#66BB6A',
      tabBarInactive: '#6A9A70',
      accent: '#43A047',
      darkText: '#E8F5E9',
      darkSecondaryText: '#A5D6A7',
    },
  },
  midnight: {
    label: 'Midnight',
    previewColors: ['#5C6BC0', '#9FA8DA', '#C5CAE9', '#E8EAF6'],
    light: {
      background: '#E8EAF6',
      text: '#1A237E',
      textSecondary: '#4A4E8A',
      primary: '#5C6BC0',
      primaryLight: '#9FA8DA',
      card: '#FFFFFF',
      highlight: '#C5CAE9',
      border: '#B0B8D6',
      tabBarBackground: '#DDE0F2',
      tabBarActive: '#5C6BC0',
      tabBarInactive: '#7A7E9A',
      accent: '#7986CB',
      darkText: '#1A237E',
      darkSecondaryText: '#4A4E8A',
    },
    dark: {
      background: '#141628',
      text: '#E8EAF6',
      textSecondary: '#9FA8DA',
      primary: '#7986CB',
      primaryLight: '#9FA8DA',
      card: '#232542',
      highlight: '#2E305A',
      border: '#3C3F6E',
      tabBarBackground: '#141628',
      tabBarActive: '#7986CB',
      tabBarInactive: '#6A6E90',
      accent: '#5C6BC0',
      darkText: '#E8EAF6',
      darkSecondaryText: '#9FA8DA',
    },
  },
  clean: {
    label: 'Clean',
    previewColors: ['#546E7A', '#90A4AE', '#CFD8DC', '#FAFAFA'],
    light: {
      background: '#FAFAFA',
      text: '#263238',
      textSecondary: '#607D8B',
      primary: '#546E7A',
      primaryLight: '#90A4AE',
      card: '#FFFFFF',
      highlight: '#CFD8DC',
      border: '#CFD8DC',
      tabBarBackground: '#F5F5F5',
      tabBarActive: '#546E7A',
      tabBarInactive: '#8A949A',
      accent: '#78909C',
      darkText: '#263238',
      darkSecondaryText: '#607D8B',
    },
    dark: {
      background: '#1A1E22',
      text: '#ECEFF1',
      textSecondary: '#90A4AE',
      primary: '#78909C',
      primaryLight: '#B0BEC5',
      card: '#263238',
      highlight: '#37474F',
      border: '#455A64',
      tabBarBackground: '#1A1E22',
      tabBarActive: '#78909C',
      tabBarInactive: '#607078',
      accent: '#546E7A',
      darkText: '#ECEFF1',
      darkSecondaryText: '#90A4AE',
    },
  },
  ruby: {
    label: 'Ruby',
    previewColors: ['#C62828', '#EF5350', '#EF9A9A', '#FFEBEE'],
    light: {
      background: '#FFEBEE',
      text: '#3C1010',
      textSecondary: '#7B3A3A',
      primary: '#C62828',
      primaryLight: '#EF5350',
      card: '#FFFFFF',
      highlight: '#EF9A9A',
      border: '#E0A0A0',
      tabBarBackground: '#FFE0E0',
      tabBarActive: '#C62828',
      tabBarInactive: '#9A6A6A',
      accent: '#E53935',
      darkText: '#3C1010',
      darkSecondaryText: '#7B3A3A',
    },
    dark: {
      background: '#2A1214',
      text: '#FFEBEE',
      textSecondary: '#EF9A9A',
      primary: '#EF5350',
      primaryLight: '#E57373',
      card: '#3E1C1E',
      highlight: '#4E2426',
      border: '#6E3436',
      tabBarBackground: '#2A1214',
      tabBarActive: '#EF5350',
      tabBarInactive: '#8A5A5C',
      accent: '#C62828',
      darkText: '#FFEBEE',
      darkSecondaryText: '#EF9A9A',
    },
  },
  emerald: {
    label: 'Emerald',
    previewColors: ['#00897B', '#4DB6AC', '#80CBC4', '#E0F2F1'],
    light: {
      background: '#E0F2F1',
      text: '#004D40',
      textSecondary: '#4A7C75',
      primary: '#00897B',
      primaryLight: '#4DB6AC',
      card: '#FFFFFF',
      highlight: '#80CBC4',
      border: '#B2DFDB',
      tabBarBackground: '#D4EDEB',
      tabBarActive: '#00897B',
      tabBarInactive: '#5A8A84',
      accent: '#26A69A',
      darkText: '#004D40',
      darkSecondaryText: '#4A7C75',
    },
    dark: {
      background: '#0E2220',
      text: '#E0F2F1',
      textSecondary: '#80CBC4',
      primary: '#4DB6AC',
      primaryLight: '#80CBC4',
      card: '#1C3430',
      highlight: '#264D48',
      border: '#356560',
      tabBarBackground: '#0E2220',
      tabBarActive: '#4DB6AC',
      tabBarInactive: '#5A8A82',
      accent: '#00897B',
      darkText: '#E0F2F1',
      darkSecondaryText: '#80CBC4',
    },
  },
};

export const THEME_PALETTE_IDS: ThemePaletteId[] = [
  'ocean', 'classic', 'sunset', 'forest',
  'midnight', 'clean', 'ruby', 'emerald',
];

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
