import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeColorSet,
  ThemePaletteId,
  ThemeMode,
  themePalettes,
} from '@/styles/commonStyles';

const PALETTE_STORAGE_KEY = '@app_theme_palette';
const MODE_STORAGE_KEY = '@app_theme_mode';

interface ThemeContextType {
  palette: ThemePaletteId;
  mode: ThemeMode;
  colors: ThemeColorSet;
  setPalette: (palette: ThemePaletteId) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  palette: 'ocean',
  mode: 'light',
  colors: themePalettes.ocean.light,
  setPalette: async () => {},
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePaletteId>('ocean');
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load saved theme preferences on startup
    Promise.all([
      AsyncStorage.getItem(PALETTE_STORAGE_KEY),
      AsyncStorage.getItem(MODE_STORAGE_KEY),
    ]).then(([savedPalette, savedMode]) => {
      if (savedPalette && savedPalette in themePalettes) {
        setPaletteState(savedPalette as ThemePaletteId);
      }
      if (savedMode === 'light' || savedMode === 'dark') {
        setModeState(savedMode);
      }
    });
  }, []);

  const colors = themePalettes[palette][mode];

  const setPalette = async (newPalette: ThemePaletteId) => {
    setPaletteState(newPalette);
    await AsyncStorage.setItem(PALETTE_STORAGE_KEY, newPalette);
  };

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(MODE_STORAGE_KEY, newMode);
  };

  return (
    <ThemeContext.Provider value={{ palette, mode, colors, setPalette, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
