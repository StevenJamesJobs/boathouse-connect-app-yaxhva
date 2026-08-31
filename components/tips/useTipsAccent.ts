import { useAppTheme } from '@/contexts/ThemeContext';
import { TIPS_JOURNAL_ACCENT, TIPS_VISUALS } from '@/components/tips/tipsVisuals';

/**
 * The family accent for the ACTIVE scheme — light themes take the deeper
 * emerald so tinted text keeps contrast (the games' "one step deeper for
 * light-theme text" rule, resolved once here instead of at every call site).
 */
export function useTipsAccent(): string {
  const { resolvedMode } = useAppTheme();
  return resolvedMode === 'dark' ? TIPS_VISUALS.accent : TIPS_VISUALS.accentLight;
}

/** The Journal button's indigo, scheme-resolved the same way. */
export function useJournalAccent(): string {
  const { resolvedMode } = useAppTheme();
  return resolvedMode === 'dark' ? TIPS_JOURNAL_ACCENT.dark : TIPS_JOURNAL_ACCENT.light;
}
