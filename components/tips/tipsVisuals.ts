/**
 * The Tips & Checkouts color language (s78) — one source for the family's
 * Emerald "money" scale, exactly the games'/quizzes' pattern (gameVisuals owns
 * the Blues, quizVisuals owns the role hues, this file owns Emerald). Locked
 * in the s78 mockup round: greener than the quiz-Server teal, gold reserved
 * for save-to-tracker moments, and the owe=red / owed=green verdict semantics
 * the old calculator trained everyone on.
 *
 * Consoles are FIXED-DARK surfaces in both themes (the rulebook's ember rule:
 * literal white/pale text on them, never theme tokens). The settled results
 * slab swaps the whole gradient to the red scale when the user owes the house
 * — Steve's round-3 note — and stays emerald when the house owes them.
 */

export interface TipsVisual {
  /** Colored text/chips on theme surfaces — one step deeper than the gradient. */
  accent: string;
  /** Deeper accent for light schemes (light themes need more depth for text). */
  accentLight: string;
  /** Two-stop tile/CTA gradient, dark→light along the 135° diagonal. */
  gradient: readonly [string, string];
  /** Fixed-dark live-console gradient (3 stops, 155°) — same in both themes. */
  console: readonly [string, string, string];
  /** Pale ink for de-emphasized text on the emerald console. */
  consoleInk: string;
}

export const TIPS_VISUALS: TipsVisual = {
  accent: '#10A56F',
  accentLight: '#087A52',
  gradient: ['#065F46', '#10B981'],
  console: ['#032E22', '#065F46', '#0B8F63'],
  consoleInk: '#D9FBEC',
};

/** Settled-results slab when the user OWES the house (round-3 lockdown). */
export const TIPS_CONSOLE_OWE: readonly [string, string, string] = [
  '#38090B',
  '#7F1D1D',
  '#B03030',
];

/** Verdict text on the fixed-dark slabs (literal inks — ember rule). */
export const TIPS_VERDICT_INK = {
  owe: '#FFD2C4',
  owed: '#C8F7DF',
} as const;

/** Ember eyebrow on fixed-dark consoles (the house rule's literal). */
export const TIPS_CONSOLE_EMBER = '#FFB07A';

/**
 * The Journal button's own hue (Steve's punch-round call: it must stand apart
 * from the emerald and the greys). Indigo — deliberately off the quiz roles'
 * navy (#4C5FC7) and violet (#7C5CE0). Light themes take the deeper step.
 */
export const TIPS_JOURNAL_ACCENT = { dark: '#6366F1', light: '#4F46E5' } as const;
