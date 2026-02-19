/**
 * Date utility functions for calendar components.
 * All functions use vanilla JS Date — no external date library.
 */

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
};

/** Returns the Sunday (start of week) for the given date. */
export function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns an array of 7 Date objects for the week containing the given date (Sun–Sat). */
export function getWeekDays(date: Date): Date[] {
  const start = getWeekStartDate(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Checks if two dates are the same calendar day (ignoring time). */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** Checks if the given date is today. */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/** Formats a date as "February 2026" using the given locale. */
export function formatMonthYear(date: Date, locale: string): string {
  return date.toLocaleDateString(LOCALE_MAP[locale] || 'en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Returns a short day name like "Sun", "Mon" (locale-aware). */
export function getShortDayName(date: Date, locale: string): string {
  return date.toLocaleDateString(LOCALE_MAP[locale] || 'en-US', {
    weekday: 'short',
  });
}

/**
 * Checks whether an event falls on the target date.
 * - Returns false if startDateTime is null.
 * - For single-day events, checks if start_date_time is on that day.
 * - For multi-day events (with endDateTime), checks if targetDate is in the range.
 */
export function eventFallsOnDate(
  startDateTime: string | null,
  endDateTime: string | null,
  targetDate: Date
): boolean {
  if (!startDateTime) return false;

  const start = new Date(startDateTime);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  if (isSameDay(startDay, targetDay)) return true;

  if (endDateTime) {
    const end = new Date(endDateTime);
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return targetDay >= startDay && targetDay <= endDay;
  }

  return false;
}

/** Returns a new Date offset by the given number of weeks. */
export function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** Returns a new Date offset by the given number of months. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Returns an array of Date objects for a full monthly calendar grid.
 * The grid always starts on Sunday and includes leading/trailing days
 * from adjacent months to fill complete weeks (6 rows x 7 cols = 42 cells).
 */
export function getMonthCalendarDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0=Sunday
  const gridStart = new Date(year, month, 1 - startDay);
  gridStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Checks if a date belongs to the given month. */
export function isSameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month;
}
