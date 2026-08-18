import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

// Compact single-select picker used by the recipe editors (subcategory, glassware,
// alcohol type) in place of long always-open pill lists. Modeled on the menu
// editor's Order Position modal: a slide-up sheet of tappable rows, the current
// value marked with a checkmark. When `allowCustom` is set, a trailing "Custom…"
// row reveals a free-text entry (for glassware that isn't in the preset list).

interface SimpleSelectPickerProps {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  /** Adds a "Custom…" row that reveals a text field. */
  allowCustom?: boolean;
  /** Label for the "Custom…" row (caller supplies the localized string). */
  customLabel?: string;
  /** Placeholder for the custom text input. */
  customPlaceholder?: string;
}

export default function SimpleSelectPicker({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  allowCustom,
  customLabel,
  customPlaceholder,
}: SimpleSelectPickerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Start in custom mode when the current value isn't one of the preset options.
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const inOptions = options.includes(value);
    setCustomMode(!!allowCustom && !!value && !inOptions);
    setCustomText(inOptions ? '' : value);
  }, [visible, value, options, allowCustom]);

  const choose = (opt: string) => {
    onSelect(opt);
    onClose();
  };
  const saveCustom = () => {
    const v = customText.trim();
    if (!v) return;
    onSelect(v);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <GlassCard variant="glass" radius={26} intensity={32} style={styles.sheet}>
          <View style={[styles.grab, { backgroundColor: colors.glassBorder }]} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {customMode ? (
            <View style={styles.customWrap}>
              <TextInput
                style={styles.customInput}
                value={customText}
                onChangeText={setCustomText}
                placeholder={customPlaceholder}
                placeholderTextColor={colors.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveCustom}
              />
              <View style={styles.customActions}>
                {options.length > 0 && (
                  <TouchableOpacity style={styles.backBtn} onPress={() => setCustomMode(false)}>
                    <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.confirmBtn, !customText.trim() && { opacity: 0.5 }]}
                  onPress={saveCustom}
                  disabled={!customText.trim()}
                >
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color={colors.fireText} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {options.map((opt) => {
                const isCurrent = opt === value;
                return (
                  <TouchableOpacity key={opt} style={[styles.row, isCurrent && styles.rowActive]} onPress={() => choose(opt)}>
                    <Text style={[styles.rowText, isCurrent && styles.rowTextActive]} numberOfLines={1}>{opt}</Text>
                    {isCurrent && (
                      <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {allowCustom && (
                <TouchableOpacity style={[styles.row, styles.customRow]} onPress={() => { setCustomText(''); setCustomMode(true); }}>
                  <Text style={[styles.rowText, styles.customRowText]} numberOfLines={1}>
                    {customLabel || 'Custom…'}
                  </Text>
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The tappable trigger row that opens a SimpleSelectPicker — shows the current
// value (or a placeholder) plus a down-chevron, styled like a form input.
export function SelectField({
  value,
  placeholder,
  onPress,
}: {
  value: string;
  placeholder?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const s = useMemo(() => fieldStyles(colors), [colors]);
  return (
    <TouchableOpacity style={s.field} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.fieldText, !value && s.fieldPlaceholder]} numberOfLines={1}>
        {value || placeholder || ''}
      </Text>
      <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

// Glass-kit field trigger (s73): matches the sheets' formInput geometry so a
// SelectField sits seamlessly among glass TextInputs.
const fieldStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.glass,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      minHeight: 43,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    fieldText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, color: colors.text, paddingRight: 8 },
    fieldPlaceholder: { color: colors.textSecondary },
  });

// Glass-kit sheet (s73): the GlassSheet shell language — glass card, grab
// pill, display-font title, surface-token rows with the primary-wash active
// state (OrderPositionModal's row vocabulary).
const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,10,18,0.55)' },
    sheet: {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomWidth: 0,
      maxHeight: '70%',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 24,
    },
    grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: { flex: 1, fontFamily: fonts.display.bold, fontSize: 19, letterSpacing: -0.2, color: colors.text, paddingRight: 12 },
    scroll: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 13,
      marginBottom: 8,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    rowActive: { borderColor: colors.primary + '6B', backgroundColor: colors.primary + '2E' },
    rowText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 15, color: colors.text, paddingRight: 8 },
    rowTextActive: { color: colors.primary, fontFamily: fonts.body.semibold },
    customRow: { borderStyle: 'dashed', borderColor: colors.primary + '8C' },
    customRowText: { color: colors.primary, fontFamily: fonts.body.semibold },
    customWrap: { paddingTop: 4 },
    customInput: {
      backgroundColor: colors.glass,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontFamily: fonts.body.regular,
      fontSize: 15,
      color: colors.text,
    },
    customActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
    backBtn: {
      padding: 10,
      borderRadius: 11,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    confirmBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center' },
  });
