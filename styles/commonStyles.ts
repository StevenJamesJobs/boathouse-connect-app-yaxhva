
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
  | 'midnight'
  | 'clean'
  | 'emerald'
  | 'blackgold'
  | 'neonnoir'
  | 'urbanloft'
  | 'stonepath'
  | 'watermelon'
  | 'cappuccino'
  | 'winterchill'
  | 'wildflower'
  | 'autumn'
  | 'summer';

export type ThemeMode = 'light' | 'dark' | 'auto';

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
  blackgold: {
    label: 'Black & Gold',
    previewColors: ['#D4AF37', '#F5D97A', '#111827', '#F8F5ED'],
    light: {
      background: '#F8F5ED',
      text: '#1A1810',
      textSecondary: '#6B6350',
      primary: '#B8972E',
      primaryLight: '#D4AF37',
      card: '#FFFFFF',
      highlight: '#F0E6C8',
      border: '#D8CEB0',
      tabBarBackground: '#F2EEE4',
      tabBarActive: '#B8972E',
      tabBarInactive: '#8A8070',
      accent: '#D4AF37',
      darkText: '#1A1810',
      darkSecondaryText: '#6B6350',
    },
    dark: {
      background: '#0C0C0C',
      text: '#F5F0E0',
      textSecondary: '#B8A88A',
      primary: '#D4AF37',
      primaryLight: '#F5D97A',
      card: '#1A1810',
      highlight: '#2A2418',
      border: '#3A3428',
      tabBarBackground: '#0C0C0C',
      tabBarActive: '#D4AF37',
      tabBarInactive: '#6A6050',
      accent: '#F5D97A',
      darkText: '#F5F0E0',
      darkSecondaryText: '#B8A88A',
    },
  },
  neonnoir: {
    label: 'Neon Noir',
    previewColors: ['#2CFF05', '#BF00FF', '#2D2D2D', '#0A0A0A'],
    light: {
      background: '#F2F0F8',
      text: '#1A1A28',
      textSecondary: '#5A5A70',
      primary: '#1DB504',
      primaryLight: '#6AE850',
      card: '#FFFFFF',
      highlight: '#D8FFD0',
      border: '#C8C8D8',
      tabBarBackground: '#EAE8F2',
      tabBarActive: '#1DB504',
      tabBarInactive: '#7A7A90',
      accent: '#9B00D0',
      darkText: '#1A1A28',
      darkSecondaryText: '#5A5A70',
    },
    dark: {
      background: '#0A0A0A',
      text: '#E8E8F0',
      textSecondary: '#9A9AAE',
      primary: '#2CFF05',
      primaryLight: '#7AFF60',
      card: '#1A1A22',
      highlight: '#1A2A1A',
      border: '#2D2D3A',
      tabBarBackground: '#0A0A0A',
      tabBarActive: '#2CFF05',
      tabBarInactive: '#6A6A78',
      accent: '#BF00FF',
      darkText: '#E8E8F0',
      darkSecondaryText: '#9A9AAE',
    },
  },
  urbanloft: {
    label: 'Urban Loft',
    previewColors: ['#A35E47', '#9C9A9A', '#464646', '#F0EDEA'],
    light: {
      background: '#F0EDEA',
      text: '#1C1A18',
      textSecondary: '#6A6460',
      primary: '#A35E47',
      primaryLight: '#C07B65',
      card: '#FFFFFF',
      highlight: '#E8D8D0',
      border: '#C8C0B8',
      tabBarBackground: '#EAE6E2',
      tabBarActive: '#A35E47',
      tabBarInactive: '#8A8480',
      accent: '#464646',
      darkText: '#1C1A18',
      darkSecondaryText: '#6A6460',
    },
    dark: {
      background: '#141210',
      text: '#E8E4E0',
      textSecondary: '#9C9A9A',
      primary: '#C07B65',
      primaryLight: '#D89880',
      card: '#242018',
      highlight: '#342820',
      border: '#464646',
      tabBarBackground: '#141210',
      tabBarActive: '#C07B65',
      tabBarInactive: '#7A7470',
      accent: '#9C9A9A',
      darkText: '#E8E4E0',
      darkSecondaryText: '#9C9A9A',
    },
  },
  stonepath: {
    label: 'Stone Path',
    previewColors: ['#A49A87', '#A5A58D', '#968F83', '#E8E5DF'],
    light: {
      background: '#F2EFEA',
      text: '#2A2620',
      textSecondary: '#7A7468',
      primary: '#7A7060',
      primaryLight: '#A49A87',
      card: '#FFFFFF',
      highlight: '#E8E5DF',
      border: '#D0CAC0',
      tabBarBackground: '#ECE9E4',
      tabBarActive: '#7A7060',
      tabBarInactive: '#A09888',
      accent: '#A5A58D',
      darkText: '#2A2620',
      darkSecondaryText: '#7A7468',
    },
    dark: {
      background: '#1A1814',
      text: '#E8E5DF',
      textSecondary: '#A49A87',
      primary: '#A49A87',
      primaryLight: '#B8AE9A',
      card: '#2A2620',
      highlight: '#3A3428',
      border: '#4A4438',
      tabBarBackground: '#1A1814',
      tabBarActive: '#A49A87',
      tabBarInactive: '#6A6458',
      accent: '#A5A58D',
      darkText: '#E8E5DF',
      darkSecondaryText: '#A49A87',
    },
  },
  watermelon: {
    label: 'Watermelon Splash',
    previewColors: ['#FC6C85', '#89F336', '#4A4A4A', '#ADEBB3'],
    light: {
      background: '#FFF5F6',
      text: '#2A2A2A',
      textSecondary: '#6A6A6A',
      primary: '#E85A72',
      primaryLight: '#FC6C85',
      card: '#FFFFFF',
      highlight: '#FFDCE2',
      border: '#E8D0D4',
      tabBarBackground: '#FFF0F2',
      tabBarActive: '#E85A72',
      tabBarInactive: '#9A8A8E',
      accent: '#5AC040',
      darkText: '#2A2A2A',
      darkSecondaryText: '#6A6A6A',
    },
    dark: {
      background: '#141214',
      text: '#F8F0F0',
      textSecondary: '#B8A0A4',
      primary: '#FC6C85',
      primaryLight: '#FF90A0',
      card: '#241E20',
      highlight: '#342428',
      border: '#4A3A3E',
      tabBarBackground: '#141214',
      tabBarActive: '#FC6C85',
      tabBarInactive: '#8A7A7E',
      accent: '#89F336',
      darkText: '#F8F0F0',
      darkSecondaryText: '#B8A0A4',
    },
  },
  cappuccino: {
    label: 'Cappuccino',
    previewColors: ['#705E46', '#D6B588', '#C6C0B9', '#F5F0EA'],
    light: {
      background: '#F5F0EA',
      text: '#2A2218',
      textSecondary: '#7A6B58',
      primary: '#705E46',
      primaryLight: '#A08868',
      card: '#FFFFFF',
      highlight: '#E8DDD0',
      border: '#D0C8B8',
      tabBarBackground: '#F0EBE4',
      tabBarActive: '#705E46',
      tabBarInactive: '#A09888',
      accent: '#D6B588',
      darkText: '#2A2218',
      darkSecondaryText: '#7A6B58',
    },
    dark: {
      background: '#1A1410',
      text: '#F0EAE0',
      textSecondary: '#C6C0B9',
      primary: '#D6B588',
      primaryLight: '#E0C898',
      card: '#2A2218',
      highlight: '#3A3028',
      border: '#4A3E30',
      tabBarBackground: '#1A1410',
      tabBarActive: '#D6B588',
      tabBarInactive: '#8A7A68',
      accent: '#A08868',
      darkText: '#F0EAE0',
      darkSecondaryText: '#C6C0B9',
    },
  },
  winterchill: {
    label: 'Winter Chill',
    previewColors: ['#4F7C82', '#93B1B5', '#B8E3E9', '#EEF6F8'],
    light: {
      background: '#EEF6F8',
      text: '#142828',
      textSecondary: '#4A6A6E',
      primary: '#4F7C82',
      primaryLight: '#78A0A8',
      card: '#FFFFFF',
      highlight: '#B8E3E9',
      border: '#A8CCD0',
      tabBarBackground: '#E6F0F2',
      tabBarActive: '#4F7C82',
      tabBarInactive: '#7A9498',
      accent: '#93B1B5',
      darkText: '#142828',
      darkSecondaryText: '#4A6A6E',
    },
    dark: {
      background: '#0B2E33',
      text: '#E0F0F2',
      textSecondary: '#93B1B5',
      primary: '#78A0A8',
      primaryLight: '#B8E3E9',
      card: '#143A40',
      highlight: '#1A4A50',
      border: '#2A5A60',
      tabBarBackground: '#0B2E33',
      tabBarActive: '#78A0A8',
      tabBarInactive: '#5A7A80',
      accent: '#4F7C82',
      darkText: '#E0F0F2',
      darkSecondaryText: '#93B1B5',
    },
  },
  wildflower: {
    label: 'Wildflower Meadow',
    previewColors: ['#FDB813', '#82C8E5', '#7CFC00', '#FBF9E7'],
    light: {
      background: '#FDFCF2',
      text: '#2A2A1A',
      textSecondary: '#6A6A50',
      primary: '#D9A010',
      primaryLight: '#FDB813',
      card: '#FFFFFF',
      highlight: '#FBF9E7',
      border: '#E8E4C8',
      tabBarBackground: '#FAF8EC',
      tabBarActive: '#D9A010',
      tabBarInactive: '#8A8A70',
      accent: '#82C8E5',
      darkText: '#2A2A1A',
      darkSecondaryText: '#6A6A50',
    },
    dark: {
      background: '#141410',
      text: '#F8F6E8',
      textSecondary: '#C8C0A0',
      primary: '#FDB813',
      primaryLight: '#FFD060',
      card: '#222218',
      highlight: '#2A2818',
      border: '#3A3828',
      tabBarBackground: '#141410',
      tabBarActive: '#FDB813',
      tabBarInactive: '#7A7A60',
      accent: '#82C8E5',
      darkText: '#F8F6E8',
      darkSecondaryText: '#C8C0A0',
    },
  },
  autumn: {
    label: 'Autumn Leaves',
    previewColors: ['#FFB343', '#DB9A39', '#B37E2E', '#614419'],
    light: {
      background: '#FFF8EE',
      text: '#2A2010',
      textSecondary: '#6A5A40',
      primary: '#B37E2E',
      primaryLight: '#DB9A39',
      card: '#FFFFFF',
      highlight: '#FFE8C0',
      border: '#E0CCA8',
      tabBarBackground: '#FFF4E4',
      tabBarActive: '#B37E2E',
      tabBarInactive: '#9A8A68',
      accent: '#FFB343',
      darkText: '#2A2010',
      darkSecondaryText: '#6A5A40',
    },
    dark: {
      background: '#1A1408',
      text: '#F8F0E0',
      textSecondary: '#C8B088',
      primary: '#DB9A39',
      primaryLight: '#FFB343',
      card: '#2A2010',
      highlight: '#3A2C18',
      border: '#4A3C20',
      tabBarBackground: '#1A1408',
      tabBarActive: '#DB9A39',
      tabBarInactive: '#8A7A58',
      accent: '#FFB343',
      darkText: '#F8F0E0',
      darkSecondaryText: '#C8B088',
    },
  },
  summer: {
    label: 'Summer Breeze',
    previewColors: ['#FFEB3B', '#F88379', '#82C8E5', '#E6D8C4'],
    light: {
      background: '#FFFEF5',
      text: '#2A2820',
      textSecondary: '#6A6458',
      primary: '#E07868',
      primaryLight: '#F88379',
      card: '#FFFFFF',
      highlight: '#FFF8D0',
      border: '#E6D8C4',
      tabBarBackground: '#FFFCEE',
      tabBarActive: '#E07868',
      tabBarInactive: '#9A8A78',
      accent: '#82C8E5',
      darkText: '#2A2820',
      darkSecondaryText: '#6A6458',
    },
    dark: {
      background: '#141210',
      text: '#FFF8F0',
      textSecondary: '#C8B8A8',
      primary: '#F88379',
      primaryLight: '#FFA098',
      card: '#242018',
      highlight: '#342820',
      border: '#4A3E30',
      tabBarBackground: '#141210',
      tabBarActive: '#F88379',
      tabBarInactive: '#8A7A70',
      accent: '#82C8E5',
      darkText: '#FFF8F0',
      darkSecondaryText: '#C8B8A8',
    },
  },
};

export const THEME_PALETTE_IDS: ThemePaletteId[] = [
  'ocean', 'midnight', 'clean', 'emerald',
  'blackgold', 'neonnoir', 'urbanloft', 'stonepath',
  'watermelon', 'cappuccino', 'winterchill',
  'wildflower', 'autumn', 'summer',
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
