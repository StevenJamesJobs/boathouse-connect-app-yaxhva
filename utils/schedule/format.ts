/**
 * Date / time formatting for the Schedule family. Every screen in the family
 * formats the same shift the same way — and through the app locale (the old
 * roster hardcoded 'en-US').
 *
 * Postgres `time` values arrive as "HH:MM:SS" (sometimes "HH:MM"); `date`
 * values as "YYYY-MM-DD". Dates are parsed as LOCAL midnight — never
 * `new Date('YYYY-MM-DD')`, which is UTC and shifts a day west of Greenwich.
 */

export type AppLocale = 'en-US' | 'es';

export function localeFor(language: string | null | undefined): AppLocale {
  return language === 'es' ? 'es' : 'en-US';
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "16:30:00" → minutes since midnight (990). */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "16:30:00" → "4:30 PM" (en) / "16:30" (es). */
export function formatTime(time: string, locale: AppLocale = 'en-US'): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** "4:30 – 10:00 PM" (drops the first meridiem when both sides share it, en only). */
export function formatTimeRange(start: string, end: string, locale: AppLocale = 'en-US'): string {
  const a = formatTime(start, locale);
  const b = formatTime(end, locale);
  if (locale === 'en-US') {
    const am = a.slice(-2);
    const bm = b.slice(-2);
    if ((am === 'AM' || am === 'PM') && am === bm) return `${a.slice(0, -3)} – ${b}`;
  }
  return `${a} – ${b}`;
}

/** "Sat, Sep 20" */
export function formatDateShort(iso: string, locale: AppLocale = 'en-US'): string {
  return parseISODate(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Sat 20" — the compact day for row leads. */
export function formatDayLead(iso: string, locale: AppLocale = 'en-US'): string {
  return parseISODate(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
}

/** "Saturday, September 20, 2026" */
export function formatDateLong(iso: string, locale: AppLocale = 'en-US'): string {
  return parseISODate(iso).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Sep 20" */
export function formatMonthDay(iso: string, locale: AppLocale = 'en-US'): string {
  return parseISODate(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** "Sat, Sep 20" · "Sat, Sep 20 – Wed, Sep 23" */
export function formatDateRange(startIso: string, endIso: string | null | undefined, locale: AppLocale = 'en-US'): string {
  if (!endIso || endIso === startIso) return formatDateShort(startIso, locale);
  return `${formatDateShort(startIso, locale)} – ${formatDateShort(endIso, locale)}`;
}

/** "Sep 14 – Sep 20" (the upload cards' week line). */
export function formatWeekRange(startIso: string, endIso: string, locale: AppLocale = 'en-US'): string {
  return `${formatMonthDay(startIso, locale)} – ${formatMonthDay(endIso, locale)}`;
}

/** Inclusive day count of a range. */
export function daysBetween(startIso: string, endIso: string): number {
  const a = parseISODate(startIso).getTime();
  const b = parseISODate(endIso).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * AM or PM for a shift by its START against the org's cutoff ("12:00:00" by
 * default — the split the roster has always used; Schedule Settings can move it).
 */
export function shiftHalf(startTime: string, cutoff: string | null | undefined): 'AM' | 'PM' {
  const c = cutoff ? minutesOf(cutoff) : 12 * 60;
  return minutesOf(startTime) < c ? 'AM' : 'PM';
}

/** "HH:MM" from a Date (for the time RPC params). */
export function toTimeParam(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Date carrying a "HH:MM[:SS]" time on today's date (for pickers). */
export function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Shift duration in hours, rounded to a half (10:00 PM → 1:00 AM = 3). */
export function shiftHours(start: string, end: string): number {
  let mins = minutesOf(end) - minutesOf(start);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 2) / 2;
}

/** "Just now" / relative stamps live with i18n; this is the mono absolute stamp. */
export function formatStamp(iso: string, locale: AppLocale = 'en-US'): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Initials for the avatar fallback ("Daisy Dukes" → "DD"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
