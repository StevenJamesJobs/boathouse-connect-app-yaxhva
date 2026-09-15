import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import type { MessageFilter } from './messageVisuals';

export interface FilterChip {
  key: MessageFilter;
  label: string;
  /** The mono count bubble (Unread 3 · Files 7). */
  count?: number;
  iosIcon?: string;
  androidIcon?: string;
}

/**
 * The horizontal chip rail under the header: All · Unread (n) · Sent · Files (n) ·
 * Groups. 32pt glass chips; the active one wears the tint at 16% fill, a tint 40%
 * border and tint ink (the mockup's `.chip.on`).
 */
export default function FilterRail({
  chips,
  value,
  onChange,
}: {
  chips: FilterChip[];
  value: MessageFilter;
  onChange: (next: MessageFilter) => void;
}) {
  const colors = useThemeColors();
  const { width: screenW } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const boxes = useRef<Record<string, { x: number; w: number }>>({});

  // Keep the active chip in view — a swipe on the body can select a chip that sits past
  // the right edge (Groups / Files on narrow phones).
  useEffect(() => {
    const b = boxes.current[value];
    if (!b || !scrollRef.current) return;
    const target = Math.max(0, b.x + b.w / 2 - screenW / 2);
    scrollRef.current.scrollTo({ x: target, animated: true });
  }, [value, screenW]);

  const onChipLayout = (key: string) => (e: LayoutChangeEvent) => {
    boxes.current[key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.scroll}
    >
      {chips.map((chip) => {
        const on = chip.key === value;
        const ink = on ? colors.tint : colors.text;
        return (
          <Pressable
            key={chip.key}
            onLayout={onChipLayout(chip.key)}
            onPress={() => onChange(chip.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              styles.chip,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              on && { backgroundColor: colors.tint + '29', borderColor: colors.tint + '66' },
            ]}
          >
            {!!chip.iosIcon && !!chip.androidIcon && (
              <IconSymbol
                ios_icon_name={chip.iosIcon}
                android_material_icon_name={chip.androidIcon}
                size={13}
                color={on ? colors.tint : colors.textSecondary}
              />
            )}
            <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
              {chip.label}
            </Text>
            {typeof chip.count === 'number' && chip.count > 0 && (
              <Text style={[styles.count, { color: on ? colors.tint : colors.textSecondary }, on && styles.countOn]}>
                {chip.count}
              </Text>
            )}
          </Pressable>
        );
      })}
      <View style={{ width: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 12,
  },
  chip: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  count: { fontFamily: fonts.mono.medium, fontSize: 10 },
  countOn: { opacity: 0.85 },
});
