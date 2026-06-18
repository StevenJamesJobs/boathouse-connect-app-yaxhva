import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Compact pill button for a screen header's top-right corner. Used to jump
 * between an Assistant/page and its Editor (managers/owners only).
 */
export default function HeaderNavButton({
  label,
  iconIos,
  iconAndroid,
  onPress,
}: {
  label: string;
  iconIos: string;
  iconAndroid: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.btn, { backgroundColor: colors.primary + '18' }]}
    >
      <IconSymbol ios_icon_name={iconIos} android_material_icon_name={iconAndroid} size={15} color={colors.primary} />
      <Text style={[styles.txt, { color: colors.primary }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  txt: { fontSize: 13, fontWeight: '700' },
});
