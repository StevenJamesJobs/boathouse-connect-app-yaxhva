import { useAppTheme } from '@/contexts/ThemeContext';

/** True when the resolved theme is dark — the Content Kit's fixed hues take
 *  their light-theme step off this (categoryHue / priorityHue / doneHue). */
export function useIsDarkTheme(): boolean {
  const { resolvedMode } = useAppTheme();
  return resolvedMode === 'dark';
}
