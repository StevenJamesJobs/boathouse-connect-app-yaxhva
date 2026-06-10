import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { MENU_ICON_OPTIONS } from '@/constants/menuIcons';

interface MenuIconPickerProps {
  label: string;
  value: string;
  onChange: (sf: string) => void;
  // compact: render just a square icon button (no label / "Tap to change" row),
  // for placing inline next to a text field.
  compact?: boolean;
}

const COLUMNS = 4;

// Owner-facing icon chooser: shows the current icon and opens a grid of the
// curated MENU_ICON_OPTIONS. Renders rows explicitly (no flexWrap) to avoid
// the bordered-cell ghost-gap issue noted in feedback_ui_patterns.
export default function MenuIconPicker({ label, value, onChange, compact }: MenuIconPickerProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);

  const rows: typeof MENU_ICON_OPTIONS[] = [];
  for (let i = 0; i < MENU_ICON_OPTIONS.length; i += COLUMNS) {
    rows.push(MENU_ICON_OPTIONS.slice(i, i + COLUMNS));
  }

  const pickerModal = (
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.grid}>
              {rows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.row}>
                  {row.map((opt) => {
                    const selected = opt.sf === value;
                    return (
                      <TouchableOpacity
                        key={opt.sf}
                        style={[
                          styles.cell,
                          { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.highlight : colors.card },
                        ]}
                        onPress={() => {
                          onChange(opt.sf);
                          setOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <IconSymbol ios_icon_name={opt.sf} android_material_icon_name={opt.sf} size={26} color={colors.primary} />
                        <Text style={[styles.cellLabel, { color: colors.textSecondary }]} numberOfLines={1}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {/* pad the last row so cells keep their width */}
                  {row.length < COLUMNS &&
                    Array.from({ length: COLUMNS - row.length }).map((_, i) => (
                      <View key={`pad-${i}`} style={styles.cellSpacer} />
                    ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
  );

  if (compact) {
    return (
      <View>
        <TouchableOpacity
          style={[styles.compactTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setOpen(true)}
          activeOpacity={0.7}
          accessibilityLabel={label}
        >
          <IconSymbol ios_icon_name={value} android_material_icon_name={value} size={24} color={colors.primary} />
        </TouchableOpacity>
        {pickerModal}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <IconSymbol ios_icon_name={value} android_material_icon_name={value} size={22} color={colors.primary} />
        <Text style={[styles.triggerText, { color: colors.textSecondary }]}>Tap to change</Text>
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      {pickerModal}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  triggerText: { flex: 1, fontSize: 14 },
  compactTrigger: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  grid: { padding: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  cellSpacer: { flex: 1 },
  cellLabel: { fontSize: 11 },
});
