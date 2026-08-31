/**
 * Remembered checkout setup (s78) — the quickSetup pattern applied to the
 * Checkouts ritual: after the first settle, the user's tip-out positions +
 * percentages, declare %, and last mode come back pre-loaded ("remembered" in
 * the locked mockups). Percentages can be changed anytime; saving a settle
 * updates the memory. Device-local by design — a server's tip-out habits are a
 * per-device convenience, not org data.
 *
 * Also stashes TODAY's settled checkout so the Log Shift sheet can offer its
 * one-tap import row. The stash is keyed by local day and only ever offers the
 * CURRENT day's checkout (the locked empty-day contract: past days log with
 * the manual fields).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TipOutLine } from './checkoutMath';
import type { CheckoutSnapshot } from './journal';

export interface CheckoutPrefs {
  declarePct: number;
  tipOuts: TipOutLine[];
  mode: 'solo' | 'pooled';
}

const PREFS_KEY = '@tips_checkout_prefs:v1';
const STASH_KEY = '@tips_last_checkout:v1';

/** First-run declare default; tip-out rows now SEED from the org's job titles
 * (Busser → Runner → Bartender, whichever exist — Steve's punch-round call),
 * so there is no hardcoded position list here anymore. */
export const DEFAULT_DECLARE_PCT = 0.12;

/** null = nothing remembered yet — the caller seeds from the org's roles. */
export async function loadCheckoutPrefs(): Promise<CheckoutPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tipOuts) || typeof parsed.declarePct !== 'number') {
      return null;
    }
    return {
      declarePct: parsed.declarePct,
      tipOuts: parsed.tipOuts.filter(
        (l: TipOutLine) => l && typeof l.title === 'string' && typeof l.pct === 'number',
      ),
      mode: parsed.mode === 'pooled' ? 'pooled' : 'solo',
    };
  } catch {
    return null;
  }
}

export async function saveCheckoutPrefs(prefs: CheckoutPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Convenience memory only — losing it just means re-picking percentages.
  }
}

interface CheckoutStash {
  date: string; // local 'YYYY-MM-DD'
  snapshot: CheckoutSnapshot;
}

/** Called when a checkout settles (reaches results) — import-row fuel. */
export async function stashTodayCheckout(date: string, snapshot: CheckoutSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(STASH_KEY, JSON.stringify({ date, snapshot } satisfies CheckoutStash));
  } catch {
    // The import row simply won't offer — manual fields still work.
  }
}

/** Returns the stashed checkout ONLY when it belongs to the given local day. */
export async function loadStashedCheckout(date: string): Promise<CheckoutSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutStash;
    if (!parsed || parsed.date !== date || !parsed.snapshot) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}
