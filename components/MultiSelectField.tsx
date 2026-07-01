import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * MultiSelectField — a compact glass dropdown for assigning multiple values
 * (e.g. job titles). Replaces the tall always-open checkbox lists in the
 * employee forms: a trigger button shows the current selection ("N selected" /
 * chips) and opens a glass bottom-sheet with a checkbox list + Done.
 */
interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  title?: string;
}

export default function MultiSelectField({ options, selected, onChange, placeholder, title }: Props) {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
  };

  const summary =
    selected.length === 0
      ? placeholder || t('multi_select.placeholder', 'Select…')
      : selected.join(', ');

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        {selected.length === 0 ? (
          <Text style={[styles.triggerPlaceholder, { color: colors.textSecondary }]} numberOfLines={1}>
            {summary}
          </Text>
        ) : (
          <View style={styles.chipRow}>
            {selected.map((s) => (
              <View key={s} style={[styles.chip, { backgroundColor: colors.tint + '1F', borderColor: colors.tint + '3D' }]}>
                <Text style={[styles.chipText, { color: colors.tint }]}>{s}</Text>
              </View>
            ))}
          </View>
        )}
        <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrimWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <GlassCard variant="glass" radius={24} intensity={40} style={styles.sheet}>
            <View style={styles.grab} />
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{title || t('multi_select.title', 'Select')}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={19} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('multi_select.no_options', 'No options available')}</Text>
              ) : (
                options.map((opt) => {
                  const on = selected.includes(opt);
                  return (
                    <TouchableOpacity key={opt} style={styles.row} onPress={() => toggle(opt)} activeOpacity={0.7}>
                      <View style={[styles.check, { borderColor: on ? colors.tint : colors.surfaceBorder, backgroundColor: on ? colors.tint : 'transparent' }]}>
                        {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.fireText} />}
                      </View>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.done, { backgroundColor: colors.primary }]} onPress={() => setOpen(false)} activeOpacity={0.85}>
              <Text style={[styles.doneText, { color: colors.fireText }]}>
                {t('multi_select.done', 'Done')}{selected.length > 0 ? ` (${selected.length})` : ''}
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 46,
    },
    triggerPlaceholder: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 14,
    },
    chipRow: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 9,
      borderWidth: 1,
    },
    chipText: {
      fontFamily: fonts.body.semibold,
      fontSize: 12,
    },
    scrimWrap: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(10, 9, 8, 0.55)',
    },
    sheet: {
      padding: 16,
      paddingTop: 12,
      maxHeight: '75%',
    },
    grab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.hairline,
      marginBottom: 12,
    },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sheetTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 17,
    },
    list: {
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      fontFamily: fonts.body.medium,
      fontSize: 15,
    },
    empty: {
      fontFamily: fonts.body.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 24,
    },
    done: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    doneText: {
      fontFamily: fonts.display.bold,
      fontSize: 15,
    },
  });
