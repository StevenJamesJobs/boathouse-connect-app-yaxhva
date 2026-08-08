import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * Generic "Order Position" picker — a bottom sheet of numbered rows (1-based) for
 * jumping an item to an exact slot within its list. Ported from menu-editor's
 * inline positionPicker so the bartender recipe editors (Phase 2) can reuse it.
 * Strings (title/subtitle) are passed in already-interpolated, keeping it
 * i18n-agnostic. `onApply` receives a 1-based position.
 *
 * Rides on the shared GlassSheet so it slides, scrims and measures identically
 * to the sheets it is opened from — it was the last white sheet left over six
 * editors. `subtitle` goes in GlassSheet's PINNED slot, not the scroll body:
 * it names the item being moved, and three callers list a whole collection, so
 * in the body it would scroll out of view exactly when it is still needed.
 */
interface OrderPositionModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  count: number;
  currentIndex: number; // 0-based
  onClose: () => void;
  onApply: (newPos: number) => void; // 1-based
}

export default function OrderPositionModal({
  visible,
  title,
  subtitle,
  count,
  currentIndex,
  onClose,
  onApply,
}: OrderPositionModalProps) {
  const colors = useThemeColors();

  return (
    <GlassSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {Array.from({ length: count }, (_, i) => i + 1).map((pos) => {
        const isCurrent = pos - 1 === currentIndex;
        return (
          <Pressable
            key={pos}
            onPress={() => onApply(pos)}
            style={[
              styles.row,
              {
                // Tint wash rather than a solid fill so the current slot reads
                // as selected against both the light and the dark glass.
                backgroundColor: isCurrent ? colors.primary + '2E' : colors.surface,
                borderColor: isCurrent ? colors.primary + '6B' : colors.surfaceBorder,
              },
            ]}
          >
            <Text style={[styles.pos, { color: isCurrent ? colors.primary : colors.text }]}>
              {pos}
            </Text>
            {isCurrent && (
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={17}
                color={colors.primary}
              />
            )}
          </Pressable>
        );
      })}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    // 48pt tall — matches GlassActionSheet's row, clears the 44pt target.
    paddingVertical: 14,
    borderRadius: 13,
    // Constant on every row (not only the current one) so selecting a slot
    // never nudges the column by a border width.
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // Mono: the digits are tabular, so 1 and 10 sit on the same left edge all
  // the way down the column.
  pos: { flex: 1, fontFamily: fonts.mono.medium, fontSize: 15 },
});
