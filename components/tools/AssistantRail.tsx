/**
 * AssistantRail (s79 lockdown, V4) — the assistants band: ONE glass capsule,
 * segmented, hairline dividers, shared verbatim by O/M and employees (the whole
 * point of the wave's unification fix — membership varies, treatment never).
 * Icon hues are FIXED across themes (kitchen flame orange / bartender azure /
 * host violet — Steve's call after the theme-tinted flame went blue on Ocean).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { ASSISTANT_HUES, AssistantKey } from '@/components/tools/toolsVisuals';

export interface AssistantRailItem {
  key: AssistantKey;
  label: string;
  iosIcon: string;
  androidIcon: string;
  onPress: () => void;
}

export default function AssistantRail({ items }: { items: AssistantRailItem[] }) {
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const scheme = mode === 'dark' ? 'dark' : 'light';

  if (items.length === 0) return null;

  return (
    <View style={[styles.rail, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      {items.map((item, i) => (
        <TouchableOpacity
          key={item.key}
          onPress={item.onPress}
          activeOpacity={0.7}
          style={[styles.seg, i > 0 && [styles.segDivider, { borderLeftColor: colors.border }]]}
        >
          <IconSymbol
            ios_icon_name={item.iosIcon as any}
            android_material_icon_name={item.androidIcon as any}
            size={16}
            color={ASSISTANT_HUES[item.key][scheme]}
          />
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
    flexDirection: 'row',
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  segDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: fonts.body.semibold,
    fontSize: 11.5,
    flexShrink: 1,
  },
});
