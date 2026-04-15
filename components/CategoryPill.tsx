import React from 'react';
import { TouchableOpacity, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';

interface CategoryPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  size?: 'lg' | 'sm';
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Shared category / subcategory pill. Used by the public MenuDisplay and the
 * manager Menu Editor so both surfaces stay visually aligned.
 *
 * - `size="lg"` → category pills (padding 20/10, radius 20, font 14).
 *   Selected state uses `colors.primary` + white text.
 * - `size="sm"` → subcategory pills (padding 16/8, radius 16, font 12).
 *   Selected state uses `colors.highlight` + `colors.text`.
 *
 * Both variants carry the same soft shadow as the public menu so the editor
 * stops feeling flatter than the rest of the app.
 */
export default function CategoryPill({
  label,
  selected,
  onPress,
  size = 'lg',
  onLayout,
}: CategoryPillProps) {
  const colors = useThemeColors();
  const isLg = size === 'lg';

  const baseStyle = isLg ? styles.lg : styles.sm;
  const textStyle = isLg ? styles.lgText : styles.smText;

  const selectedBg = isLg ? colors.primary : colors.highlight;
  const selectedText = isLg ? '#FFFFFF' : colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLayout={onLayout}
      style={[
        baseStyle,
        { backgroundColor: selected ? selectedBg : colors.card },
      ]}
    >
      <Text
        style={[
          textStyle,
          { color: selected ? selectedText : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  lg: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  lgText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  smText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
