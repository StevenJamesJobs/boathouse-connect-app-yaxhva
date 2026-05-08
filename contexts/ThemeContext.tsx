import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
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
  resolvedMode: 'light' | 'dark';
  colors: ThemeColorSet;
  setPalette: (palette: ThemePaletteId) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  palette: 'winterchill',
  mode: 'light',
  resolvedMode: 'light',
  colors: themePalettes.winterchill.light,
  setPalette: async () => {},
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePaletteId>('winterchill');
  const [mode, setModeState] = useState<ThemeMode>('light');
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PALETTE_STORAGE_KEY),
      AsyncStorage.getItem(MODE_STORAGE_KEY),
    ]).then(([savedPalette, savedMode]) => {
      if (savedPalette && savedPalette in themePalettes) {
        setPaletteState(savedPalette as ThemePaletteId);
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
