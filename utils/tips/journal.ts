/**
 * The Tips Tracker journal (s78) — the on-device data layer.
 *
 * STORAGE IS DEVICE-LOCAL BY DESIGN (Steve's lockdown call): tips are personal
 * income, so entries live in AsyncStorage under a single versioned key and
 * never touch the shared DB. Cloud backup, if it ever comes, arrives after the
 * session-token phase as an opt-in — nothing here may assume a server.
 *
 * The model, per the locked mockups:
 *  - an entry belongs to a SHIFT, not a day — a double is two entries that the
 *    Journal rolls up under one day total;
 *  - `tips` (take-home) + `extraCashTips` (table cash the checkout never saw)
 *    SUM into the day's tips — the number the graphs count; both parts are
 *    kept so either can be edited later;
 *  - shift/weather values are canonical keys (display strings are t()'d in the
 *    screens — the translation architecture's data-stays-canonical rule);
 *  - a saved checkout keeps its full snapshot for the "Checkout details" view.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PooledResult, SoloInputs, SoloResult, PooledInputs } from './checkoutMath';

export type ShiftSlot =
  | 'am'
  | 'mid'
  | 'pm'
  | 'double'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'late';

export type WeatherKey =
  | 'sun'
  | 'cloud'
  | 'rain'
  | 'snow'
  | 'wind'
  | 'cold'
  | 'humid'
  | 'hot';

export const SHIFT_SLOTS: readonly ShiftSlot[] = [
  'am',
  'mid',
  'pm',
  'double',
  'breakfast',
  'lunch',
  'dinner',
  'late',
];

/** Multi-select (Sunny + Hot + Humid is a real Tuesday) — punch-round add. */
export const WEATHER_KEYS: readonly WeatherKey[] = [
  'sun',
  'cloud',
  'rain',
  'snow',
  'wind',
  'cold',
  'humid',
  'hot',
];

export interface CheckoutSnapshot {
  mode: 'solo' | 'pooled';
  solo?: { inputs: SoloInputs; result: SoloResult };
  pooled?: { inputs: PooledInputs; result: PooledResult };
  settledAt: number;
}

export interface ShiftEntry {
  id: string;
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  createdAt: number;
  updatedAt: number;
  /** Take-home tips (pre-fills from the checkout where the math can know it). */
  tips: number;
  /** Steve's round-3 field: table cash outside the checkout. Sums into the day. */
  extraCashTips: number;
  sales?: number;
  tippedOut?: number;
  hours?: number;
  tables?: number;
  covers?: number;
  shift?: ShiftSlot;
  weather?: WeatherKey[];
  /** Free text — "Patio · tables 21–24". */
  location?: string;
  checkout?: CheckoutSnapshot;
}

const STORE_KEY = '@tips_journal:v1';

export function entryTotalTips(entry: ShiftEntry): number {
  return (entry.tips || 0) + (entry.extraCashTips || 0);
}

export function makeEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Local-time day key — never toISOString (UTC shifts the date overnight). */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export async function loadEntries(): Promise<ShiftEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ShiftEntry =>
          !!e && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.tips === 'number',
      )
      .map((entry) => {
        // Pre-multi-select entries stored weather as a single string.
        const legacy = entry.weather as unknown;
        if (typeof legacy === 'string') return { ...entry, weather: [legacy as WeatherKey] };
        return entry;
      });
  } catch {
    return [];
  }
}

async function persist(entries: ShiftEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

export async function saveEntry(entry: ShiftEntry): Promise<ShiftEntry[]> {
  const entries = await loadEntries();
  const at = entries.findIndex((e) => e.id === entry.id);
  const stamped = { ...entry, updatedAt: Date.now() };
  if (at >= 0) entries[at] = stamped;
  else entries.push(stamped);
  entries.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  await persist(entries);
  return entries;
}

export async function deleteEntry(id: string): Promise<ShiftEntry[]> {
  const entries = (await loadEntries()).filter((e) => e.id !== id);
  await persist(entries);
  return entries;
}

/* ------------------------------------------------------------------ */
/* Aggregation — pure helpers over a loaded entry list.                */
/* ------------------------------------------------------------------ */

export function entriesForDay(entries: ShiftEntry[], key: string): ShiftEntry[] {
  return entries.filter((e) => e.date === key);
}

export interface DayRollup {
  date: string;
  entries: ShiftEntry[];
  tips: number;
  hours: number;
}

export function rollupByDay(entries: ShiftEntry[]): Map<string, DayRollup> {
  const map = new Map<string, DayRollup>();
  for (const entry of entries) {
    let day = map.get(entry.date);
    if (!day) {
      day = { date: entry.date, entries: [], tips: 0, hours: 0 };
      map.set(entry.date, day);
    }
    day.entries.push(entry);
    day.tips += entryTotalTips(entry);
    day.hours += entry.hours || 0;
  }
  return map;
}

export interface RangeSummary {
  tips: number;
  hours: number;
  sales: number;
  tippedOut: number;
  shiftCount: number;
  /** tips ÷ hours, null when no hours were logged. */
  perHour: number | null;
  /** Mean of per-entry tips÷sales across entries that recorded sales. */
  avgTipPct: number | null;
  /** Highest single DAY (rolled up — a double counts as one day). */
  bestDay: DayRollup | null;
}

/** from/to are inclusive local day keys. */
export function summarizeRange(entries: ShiftEntry[], from: string, to: string): RangeSummary {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);
  const summary: RangeSummary = {
    tips: 0,
    hours: 0,
    sales: 0,
    tippedOut: 0,
    shiftCount: inRange.length,
    perHour: null,
    avgTipPct: null,
    bestDay: null,
  };
  let pctSum = 0;
  let pctCount = 0;
  for (const entry of inRange) {
    summary.tips += entryTotalTips(entry);
    summary.hours += entry.hours || 0;
    summary.sales += entry.sales || 0;
    summary.tippedOut += entry.tippedOut || 0;
    if (entry.sales && entry.sales > 0) {
      pctSum += entryTotalTips(entry) / entry.sales;
      pctCount += 1;
    }
  }
  if (summary.hours > 0) summary.perHour = summary.tips / summary.hours;
  if (pctCount > 0) summary.avgTipPct = pctSum / pctCount;
  for (const day of rollupByDay(inRange).values()) {
    if (!summary.bestDay || day.tips > summary.bestDay.tips) summary.bestDay = day;
  }
  return summary;
}

/* Restaurant weeks run Monday–Sunday (the locked dashboard's "AUG 24–30"). */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  out.setDate(out.getDate() - shift);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

export type TrackerPeriod = 'week' | 'month' | 'quarter' | 'year';

export interface PeriodRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

/** Current period + the equal previous window (the "vs last" comparisons). */
export function periodRange(period: TrackerPeriod, today: Date): PeriodRange {
  if (period === 'week') {
    const start = startOfWeek(today);
    return {
      from: dateKey(start),
      to: dateKey(addDays(start, 6)),
      prevFrom: dateKey(addDays(start, -7)),
      prevTo: dateKey(addDays(start, -1)),
    };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: dateKey(start), to: dateKey(end), prevFrom: dateKey(prevStart), prevTo: dateKey(prevEnd) };
  }
  if (period === 'quarter') {
    const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const prevEnd = new Date(today.getFullYear(), today.getMonth() - 2, 0);
    return { from: dateKey(start), to: dateKey(end), prevFrom: dateKey(prevStart), prevTo: dateKey(prevEnd) };
  }
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  const prevStart = new Date(today.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(today.getFullYear() - 1, 11, 31);
  return { from: dateKey(start), to: dateKey(end), prevFrom: dateKey(prevStart), prevTo: dateKey(prevEnd) };
}

export interface ChartBar {
  /** Short axis label — screens map period buckets through t() where needed. */
  label: string;
  tips: number;
  /** Same bucket in the previous window (the ghost bar); null = not shown. */
  prevTips: number | null;
  /** First day of the bucket — tap-through into the Journal. */
  fromDate: string;
}

/**
 * Chart buckets per the locked mapping: WK = 7 nights (ghost = last week),
 * MO = day-by-day, 3M = 13 Monday-weeks, YR = 12 months (ghost = last year).
 */
export function chartBars(entries: ShiftEntry[], period: TrackerPeriod, today: Date): ChartBar[] {
  const dayTips = new Map<string, number>();
  for (const entry of entries) {
    dayTips.set(entry.date, (dayTips.get(entry.date) || 0) + entryTotalTips(entry));
  }
  const sumRange = (from: Date, to: Date): number => {
    let total = 0;
    const fromKey = dateKey(from);
    const toKey = dateKey(to);
    for (const [key, tips] of dayTips) {
      if (key >= fromKey && key <= toKey) total += tips;
    }
    return total;
  };

  if (period === 'week') {
    const start = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const prev = addDays(day, -7);
      return {
        label: 'MTWTFSS'[i],
        tips: dayTips.get(dateKey(day)) || 0,
        prevTips: dayTips.get(dateKey(prev)) || 0,
        fromDate: dateKey(day),
      };
    });
  }
  if (period === 'month') {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = new Date(today.getFullYear(), today.getMonth(), i + 1);
      return {
        label: `${i + 1}`,
        tips: dayTips.get(dateKey(day)) || 0,
        prevTips: null,
        fromDate: dateKey(day),
      };
    });
  }
  if (period === 'quarter') {
    const thisWeek = startOfWeek(today);
    return Array.from({ length: 13 }, (_, i) => {
      const weekStart = addDays(thisWeek, (i - 12) * 7);
      return {
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
        tips: sumRange(weekStart, addDays(weekStart, 6)),
        prevTips: null,
        fromDate: dateKey(weekStart),
      };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const monthStart = new Date(today.getFullYear(), i, 1);
    const monthEnd = new Date(today.getFullYear(), i + 1, 0);
    const prevStart = new Date(today.getFullYear() - 1, i, 1);
    const prevEnd = new Date(today.getFullYear() - 1, i + 1, 0);
    return {
      label: 'JFMAMJJASOND'[i],
      tips: sumRange(monthStart, monthEnd),
      prevTips: sumRange(prevStart, prevEnd),
      fromDate: dateKey(monthStart),
    };
  });
}
