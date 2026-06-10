import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { CATEGORY_COLOR_PALETTE } from '@/constants/categoryColors';

interface CategoryColorPickerProps {
  visible: boolean;
  value: string;
  title: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

const COLUMNS = 4;

// Controlled bottom-sheet swatch picker for a menu category's accent color (D4).
// Rows are rendered explicitly (no flexWrap) to match MenuIconPicker and avoid
// the bordered-cell ghost-gap issue (feedback_ui_patterns).
export default function CategoryColorPicker({ visible, value, title, onSelect, onClose }: CategoryColorPickerProps) {
  const colors = useThemeColors();

  const rows: string[][] = [];
  for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i += COLUMNS) {
    rows.push(CATEGORY_COLOR_PALETTE.slice(i, i + COLUMNS));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.grid}>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                {row.map((color) => {
                  const selected = color.toLowerCase() === (value || '').toLowerCase();
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.cell, { borderColor: selected ? colors.text : colors.border }]}
                      onPress={() => {
                        onSelect(color);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.swatch, { backgroundColor: color }]}>
                        {selected && (
                          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
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
}

const styles = StyleSheet.create({
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
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
  },
  cellSpacer: { flex: 1 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
