import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeColorSet,
  ThemePaletteId,
  ThemeMode,
  themePalettes,
} from '@/styles/commonStyles';
import { IS_MCLOONES } from '@/constants/buildVariant';

const PALETTE_STORAGE_KEY = '@app_theme_palette';
const MODE_STORAGE_KEY = '@app_theme_mode';

// Locked redesign defaults: MyResto → Moonstone Dark, Boathouse → Ocean Dark.
const DEFAULT_PALETTE: ThemePaletteId = IS_MCLOONES ? 'ocean' : 'moonstone';
const DEFAULT_MODE: ThemeMode = 'dark';

interface ThemeContextType {
  palette: ThemePaletteId;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  colors: ThemeColorSet;
  setPalette: (palette: ThemePaletteId) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  palette: DEFAULT_PALETTE,
  mode: DEFAULT_MODE,
  resolvedMode: 'dark',
  colors: themePalettes[DEFAULT_PALETTE].dark,
  setPalette: async () => {},
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePaletteId>(DEFAULT_PALETTE);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PALETTE_STORAGE_KEY),
      AsyncStorage.getItem(MODE_STORAGE_KEY),
    ]).then(([savedPalette, savedMode]) => {
      if (savedPalette) {
        if (savedPalette in themePalettes) {
          setPaletteState(savedPalette as ThemePaletteId);
        } else {
          // The redesign regressed the old 14-theme set down to 2. A saved
          // palette that no longer exists (e.g. 'winterchill') falls back to
          // the variant default AND is rewritten so it normalizes once.
          setPaletteState(DEFAULT_PALETTE);
          AsyncStorage.setItem(PALETTE_STORAGE_KEY, DEFAULT_PALETTE).catch(() => {});
        }
      }
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
        setModeState(savedMode);
      }
    });
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'auto' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : mode;

  const colors = themePalettes[palette][resolvedMode];

  const setPalette = async (newPalette: ThemePaletteId) => {
    setPaletteState(newPalette);
    await AsyncStorage.setItem(PALETTE_STORAGE_KEY, newPalette);
  };

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(MODE_STORAGE_KEY, newMode);
  };

  return (
    <ThemeContext.Provider value={{ palette, mode, resolvedMode, colors, setPalette, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
