/**
 * The Schedule kit's colours — ONLY here (the games/quiz/tips/tools/content rule).
 *
 * The family accent is the THEME TINT (a house family, like Guides and the Content
 * kit): everything branded reads `colors.tint` / `colors.primary` at the call site.
 * What lives here are the fixed status hues (light/dark pairs so text on glass
 * stays legible in the light themes), the AM/PM day-part hues the roster has
 * always used, and the tinted-glass tile alphas the Tools kit locked (s79).
 */
export const SCHEDULE_HUES = {
  /** waiting on a manager */
  pending: { dark: '#F59E0B', light: '#B45309' },
  /** approved / picked-up / completed */
  ok: { dark: '#10A56F', light: '#087A52' },
  /** denied / failed */
  bad: { dark: '#EF4444', light: '#DC2626' },
  /** the roster's day parts (unchanged from the pre-glass roster) */
  am: { dark: '#FF9800', light: '#E8890B' },
  pm: { dark: '#7C4DFF', light: '#6D3FE0' },
} as const;

export type ScheduleHueKey = keyof typeof SCHEDULE_HUES;

export function scheduleHue(key: ScheduleHueKey, isDark: boolean): string {
  return isDark ? SCHEDULE_HUES[key].dark : SCHEDULE_HUES[key].light;
}

/** request / release statuses → hue key (muted statuses return null: use textSecondary) */
export function statusHueKey(status: string | null | undefined): ScheduleHueKey | null {
  switch (status) {
    case 'pending':
    case 'open':
    case 'claimed':
      return 'pending';
    case 'approved':
    case 'completed':
      return 'ok';
    case 'denied':
    case 'failed':
      return 'bad';
    default:
      return null;
  }
}

/** Tinted-glass tile finish (the Tools kit's locked numbers, s79). */
export const TILE_BG_ALPHA = { dark: 0.11, light: 0.09 } as const;
export const TILE_BORDER_ALPHA = { dark: 0.28, light: 0.24 } as const;

/** Approvals history is capped server-side at the last 50 decided rows, 30-day sweep. */
export const APPROVAL_HISTORY_PAGE = 10;

/** Flip card: the back face shows at most this many available shifts before "See all". */
export const AVAILABLE_BACK_ROWS = 4;
