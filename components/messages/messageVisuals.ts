/**
 * Messaging kit visuals (s84). Colours for the family live ONLY here — the screens
 * read `useThemeColors()` for everything themed and these constants for the fixed hues.
 */
export type MsgScheme = 'light' | 'dark';

/** Swipe / action hues (fixed per scheme, never theme-tinted). */
export const MSG_HUES = {
  read: { dark: '#3B82F6', light: '#2563EB' },   // "Mark as read" swipe square (azure)
  delete: { dark: '#EF4444', light: '#DC2626' }, // delete swipe square / destructive rows
  group: { dark: '#3B82F6', light: '#2563EB' },  // group chips in the To row
  file: { dark: '#EF4444', light: '#DC2626' },   // generic file glyph tile (PDF red)
  doc: { dark: '#3B82F6', light: '#2563EB' },    // documents / spreadsheets
  warn: { dark: '#F59E0B', light: '#B45309' },   // the near-full inbox meter
} as const;

export function msgHue(key: keyof typeof MSG_HUES, isDark: boolean): string {
  return MSG_HUES[key][isDark ? 'dark' : 'light'];
}

/** Geometry shared by rows, stacks and bubbles. */
export const AVATAR_ROW = 44;      // list row avatar (single)
export const AVATAR_STACK = 28;    // each face in a 3-stack
export const AVATAR_BUBBLE = 28;   // beside a thread bubble
export const AVATAR_STRIP = 28;    // overlapping row in the participants strip
export const STACK_MAX_FACES = 3;  // then "+N"

/** The inbox cap the server enforces per recipient; the meter strip appears at ≥ INBOX_WARN. */
export const INBOX_CAP = 40;
export const INBOX_WARN = 35;

/** Composer growth: one line up to five, then the field scrolls inside itself. */
export const COMPOSER_MIN_HEIGHT = 42;
export const COMPOSER_MAX_HEIGHT = 117;

/** Attachment limits (unchanged from the pre-glass screens). */
export const MESSAGE_IMAGE_MAX_MB = 5;
export const MESSAGE_FILE_MAX_MB = 10;

export type MessageFilter = 'all' | 'unread' | 'sent' | 'files' | 'groups';

/** Date-group buckets for the list, in display order. */
export type DateBucket = 'today' | 'yesterday' | 'earlier_week' | string; // string = 'YYYY-MM' month key

export function dateBucketOf(iso: string, now: Date = new Date()): DateBucket {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOfDay(now);
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'earlier_week';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Initial for an avatar fallback — first letter of the first word, upper-cased. */
export function initialOf(name: string | null | undefined): string {
  const n = (name || '').trim();
  return n ? n[0].toUpperCase() : '?';
}
