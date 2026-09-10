import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * The ⚙ Schedule chip — the Menu ⚙ chip's twin (38pt glass, gear + label), the
 * top-right action on every schedule page. Extracted once for the family (the
 * menu pages carry four hand-rolled copies; this is the first shared one).
 * Pass `compact` when it shares the header's right slot with a labelled chip
 * (the review page's Save) so the two fit inside `rightWide`.
 */
export default function ScheduleGearChip({ onPress, compact = false }: { onPress: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('schedule_nav.title')}
      style={[
        styles.chip,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        compact && styles.chipCompact,
      ]}
    >
      <IconSymbol ios_icon_name="gearshape.fill" android_material_icon_name="settings" size={15} color={colors.text} />
      {!compact && (
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {t('schedule_nav.chip')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 38,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipCompact: { width: 38, paddingHorizontal: 0, justifyContent: 'center' },
  label: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
});
