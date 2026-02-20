import { useAppTheme } from '@/contexts/ThemeContext';
import { ThemeColorSet } from '@/styles/commonStyles';

export function useThemeColors(): ThemeColorSet {
  const { colors } = useAppTheme();
  return colors;
}
