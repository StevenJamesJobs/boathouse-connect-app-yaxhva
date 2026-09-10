import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { AttentionRing } from '@/components/tools/ToolsBits';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface SegTab<T extends string> {
  key: T;
  label: string;
  /** the mono count bubble (Recent uploads (6) · Time off (2)) */
  count?: number;
  iosIcon?: string;
  androidIcon?: string;
  /** wears the AttentionRing while something waits behind it */
  live?: boolean;
}

/**
 * The tinted-glass segmented tabs — app/menu-upload.tsx's seg (glass track,
 * primary+'2E' active fill, blue count bubble) extracted for the schedule family:
 * Upload | Recent uploads · Matched | Unmatched · Time off | Pick up | History ·
 * the flip card's Upcoming | Available (where a tab can pulse).
 */
export default function ScheduleSegTabs<T extends string>({
  tabs,
  value,
  onChange,
  small = false,
}: {
  tabs: SegTab<T>[];
  value: T;
  onChange: (key: T) => void;
  /** the in-card variant (30pt segments) */
  small?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.seg, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, small && styles.segSmall]}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.half, small && styles.halfSmall, on && { backgroundColor: colors.primary + '2E' }]}
          >
            {!!tab.iosIcon && !!tab.androidIcon && (
              <IconSymbol
                ios_icon_name={tab.iosIcon}
                android_material_icon_name={tab.androidIcon}
                size={13}
                color={on ? colors.primary : colors.textSecondary}
              />
            )}
            <Text style={[styles.label, { color: on ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
              {tab.label}
            </Text>
            {typeof tab.count === 'number' && tab.count > 0 && (
              <View style={[styles.bubble, { backgroundColor: colors.blue + '38' }]}>
                <Text style={[styles.bubbleText, { color: colors.blueText }]}>{tab.count > 99 ? '99+' : tab.count}</Text>
              </View>
            )}
            <AttentionRing active={!!tab.live && !on} color={colors.primary} radius={small ? 8 : 10} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  segSmall: { borderRadius: 11 },
  half: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  halfSmall: { paddingVertical: 6, borderRadius: 8 },
  label: { fontFamily: fonts.display.semibold, fontSize: 12.5, flexShrink: 1 },
  bubble: { minWidth: 17, height: 16, borderRadius: 8, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontFamily: fonts.mono.semibold, fontSize: 9 },
});
