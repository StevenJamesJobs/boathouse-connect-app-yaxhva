/**
 * The Quizzes & Exams color language (s77) — one source for the per-ROLE
 * accents, exactly the games' pattern (gameVisuals owns the Blues; this file
 * owns the quiz scales). Steve's round-2 lockdown: each role wears its own
 * hue — Server teal · Bartender navy · Host violet — across the manager hub,
 * the editor, the composer, play, results and the employee shelf.
 *
 * Consoles are FIXED-DARK surfaces in both themes (the rulebook's ember rule:
 * literal white text on them, never theme tokens). Boards — the no-photo play
 * hero — are THEME-AWARE: pick `board.dark` / `board.light` from the active
 * scheme, with `boardInk` as the on-board text color.
 */

export type ExamRole = 'server' | 'bartender' | 'host';

export interface QuizVisual {
  /** Colored text/chips on theme surfaces — one step deeper than the gradient. */
  accent: string;
  /** Two-stop tile/CTA gradient, dark→light along the 150° diagonal. */
  gradient: readonly [string, string];
  /** Fixed-dark live-console gradient (3 stops, 135°) — same in both themes. */
  console: readonly [string, string, string];
  /** Theme-aware no-photo hero gradients (150°): dark scheme / light scheme. */
  board: {
    dark: readonly [string, string, string];
    light: readonly [string, string, string];
  };
  /** Question-typography ink on the board, per scheme. */
  boardInk: { dark: string; light: string };
}

export const QUIZ_VISUALS: Record<ExamRole, QuizVisual> = {
  server: {
    accent: '#0D9488',
    gradient: ['#0A5B51', '#17A896'],
    console: ['#04332E', '#0A5B51', '#11857A'],
    board: {
      dark: ['#032B26', '#0A5B51', '#0E7466'],
      light: ['#E7F6F3', '#D2EEE8', '#BCE5DC'],
    },
    boardInk: { dark: '#EAFFF9', light: '#053A33' },
  },
  bartender: {
    accent: '#4C5FC7',
    gradient: ['#25348C', '#5B6FD8'],
    console: ['#101A45', '#25348C', '#3D4E9E'],
    board: {
      dark: ['#0D1638', '#25348C', '#33438F'],
      light: ['#EAEDFA', '#D8DDF6', '#C5CDF2'],
    },
    boardInk: { dark: '#EAF0FF', light: '#141F5C' },
  },
  host: {
    accent: '#7C5CE0',
    gradient: ['#4527A0', '#8B6FF0'],
    console: ['#251161', '#4527A0', '#6A48D8'],
    board: {
      dark: ['#1D0D4C', '#4527A0', '#5636B8'],
      light: ['#EFEAFB', '#E0D8F8', '#CFC3F4'],
    },
    boardInk: { dark: '#F0EAFF', light: '#2A1766' },
  },
};

/** Exam-status semantics — shared by the hub tiles, consoles and pills. */
export const QUIZ_STATUS_COLORS: Record<'draft' | 'active' | 'paused' | 'closed', string> = {
  draft: '#F59E0B',
  active: '#10B981',
  paused: '#F59E0B',
  closed: '#EF4444',
};

/** The roles' glyphs (the pre-glass hub's icon set, kept). */
export const EXAM_ROLE_ICONS: Record<ExamRole, { ios: string; android: string }> = {
  server: { ios: 'tray.full.fill', android: 'room-service' },
  bartender: { ios: 'wineglass.fill', android: 'local-bar' },
  host: { ios: 'person.2.fill', android: 'people' },
};

/** Safe cast for exam_type strings coming off the wire. */
export function quizRole(examType: string | null | undefined): ExamRole {
  return examType === 'bartender' || examType === 'host' ? examType : 'server';
}

/** The live-console's "time left" gold — matches the play kit's low-time tint. */
export const CONSOLE_COUNTDOWN_GOLD = '#FFD48A';
