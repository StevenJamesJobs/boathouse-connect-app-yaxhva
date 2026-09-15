import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeColorSet,
  ThemePalette,
  ThemePaletteId,
  PresetPaletteId,
  ThemeMode,
  themePalettes,
} from '@/styles/commonStyles';
import { IS_MCLOONES } from '@/constants/buildVariant';
import {
  CUSTOM_ACCENT_KEY,
  CustomAccent,
  buildCustomPalette,
  parseCustomAccent,
} from '@/utils/theme/customAccent';

const PALETTE_STORAGE_KEY = '@app_theme_palette';
const MODE_STORAGE_KEY = '@app_theme_mode';

// Locked redesign defaults: MyResto → Moonstone Dark, Boathouse → Ocean Dark.
const DEFAULT_PALETTE: PresetPaletteId = IS_MCLOONES ? 'ocean' : 'moonstone';
const DEFAULT_MODE: ThemeMode = 'dark';

interface ThemeContextType {
  palette: ThemePaletteId;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  colors: ThemeColorSet;
  /** The palette object in force (a preset, or the derived custom one). */
  activePalette: ThemePalette;
  /** The saved custom accent, if any (kept even while a preset is selected). */
  customAccent: CustomAccent | null;
  setPalette: (palette: ThemePaletteId) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Save a custom accent AND select it. */
  setCustomAccent: (accent: CustomAccent) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  palette: DEFAULT_PALETTE,
  mode: DEFAULT_MODE,
  resolvedMode: 'dark',
  colors: themePalettes[DEFAULT_PALETTE].dark,
  activePalette: themePalettes[DEFAULT_PALETTE],
  customAccent: null,
  setPalette: async () => {},
  setMode: async () => {},
  setCustomAccent: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePaletteId>(DEFAULT_PALETTE);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [customAccent, setCustomAccentState] = useState<CustomAccent | null>(null);
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PALETTE_STORAGE_KEY),
      AsyncStorage.getItem(MODE_STORAGE_KEY),
      AsyncStorage.getItem(CUSTOM_ACCENT_KEY),
    ]).then(([savedPalette, savedMode, savedCustom]) => {
      const custom = parseCustomAccent(savedCustom);
      if (custom) setCustomAccentState(custom);
      if (savedPalette) {
        if (savedPalette in themePalettes || (savedPalette === 'custom' && custom)) {
          setPaletteState(savedPalette as ThemePaletteId);
        } else {
          // A saved palette that no longer exists (the pre-glass 14, or 'custom'
          // with no accent record) falls back to the variant default AND is
          // rewritten so it normalizes once.
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

  const activePalette = useMemo<ThemePalette>(() => {
    if (palette === 'custom') {
      return customAccent ? buildCustomPalette(customAccent) : themePalettes[DEFAULT_PALETTE];
    }
    return themePalettes[palette];
  }, [palette, customAccent]);

  const colors = activePalette[resolvedMode];

  const setPalette = async (newPalette: ThemePaletteId) => {
    if (newPalette === 'custom' && !customAccent) return; // nothing to select yet
    setPaletteState(newPalette);
    await AsyncStorage.setItem(PALETTE_STORAGE_KEY, newPalette);
  };

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(MODE_STORAGE_KEY, newMode);
  };

  const setCustomAccent = async (accent: CustomAccent) => {
    setCustomAccentState(accent);
    setPaletteState('custom');
    await AsyncStorage.multiSet([
      [CUSTOM_ACCENT_KEY, JSON.stringify(accent)],
      [PALETTE_STORAGE_KEY, 'custom'],
    ]);
  };

  return (
    <ThemeContext.Provider
      value={{ palette, mode, resolvedMode, colors, activePalette, customAccent, setPalette, setMode, setCustomAccent }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
