import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembered quick-play setup per game+category (s76 Hub·A lockdown): the
 * category card's Play button launches straight into the last-played
 * difficulty/mode; the ⚙ chip beside it reopens the picker sheet, whose final
 * pick becomes the new remembered setup. First run (nothing stored) shows a
 * plain Play that opens the sheet once.
 *
 * Device-local by design (AsyncStorage, like the award-cutoff pattern) — a
 * player's groove is a per-device convenience, not org data.
 */
export interface QuickSetup {
  /** Absent for memory (difficulty auto-continues from get_my_game_stats). */
  difficulty?: string;
  playMode: string;
}

const keyFor = (game: string, category: string) => `@game_setup:${game}:${category}`;

export async function loadQuickSetup(game: string, category: string): Promise<QuickSetup | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(game, category));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.playMode !== 'string') return null;
    return parsed as QuickSetup;
  } catch {
    return null;
  }
}

export async function saveQuickSetup(game: string, category: string, setup: QuickSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(game, category), JSON.stringify(setup));
  } catch {
    // Convenience cache only — losing it just means the sheet shows once more.
  }
}
