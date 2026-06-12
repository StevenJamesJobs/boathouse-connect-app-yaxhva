import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Generic "Order Position" picker — a bottom sheet of numbered rows (1-based) for
 * jumping an item to an exact slot within its list. Ported from menu-editor's
 * inline positionPicker so the bartender recipe editors (Phase 2) can reuse it.
 * Strings (title/subtitle) are passed in already-interpolated, keeping it
 * i18n-agnostic. `onApply` receives a 1-based position.
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.positionSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={28}
                color="#666666"
              />
            </TouchableOpacity>
          </View>
          {!!subtitle && <Text style={styles.positionSubtitle}>{subtitle}</Text>}
          <ScrollView style={styles.positionScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            {Array.from({ length: count }, (_, i) => i + 1).map((pos) => {
              const isCurrent = pos - 1 === currentIndex;
              return (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.positionRow,
                    isCurrent && {
                      backgroundColor: colors.primary + '22',
                      borderWidth: 1,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => onApply(pos)}
                >
                  <Text style={[styles.positionRowText, isCurrent && { color: colors.primary }]}>
                    {pos}
                  </Text>
                  {isCurrent && (
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={18}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  positionSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  positionSubtitle: {
    fontSize: 14,
    color: '#666666',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  positionScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 8,
  },
  positionRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
});
