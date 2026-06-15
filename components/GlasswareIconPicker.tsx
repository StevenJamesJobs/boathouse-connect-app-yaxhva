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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { IconSymbol } from './IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  GLASSWARE_OPTIONS,
  GLASSWARE_ICONS,
  GLASSWARE_FALLBACK_ICON,
  type GlasswareIconDef,
} from '@/constants/glassware';

// Visual glassware picker: a tappable trigger (current glass icon + value) that
// opens a grid of the preset glasses, each with its own icon. A trailing
// "Custom…" cell reveals a free-text field for glassware not in the preset list.
// Self-contained (owns its modal state) so it drops in for a SelectField +
// SimpleSelectPicker pair. Glyphs come from two bundled @expo/vector-icons
// families (MaterialCommunityIcons + FontAwesome5 solid) — no new dependency.

const COLUMNS = 3;

// Render a glassware glyph from whichever bundled icon family owns it.
export function GlasswareGlyph({
  name,
  size,
  color,
}: {
  name: string;
  size: number;
  color: string;
}) {
  const def: GlasswareIconDef = GLASSWARE_ICONS[name] || GLASSWARE_FALLBACK_ICON;
  if (def.family === 'fa5') {
    // All glassware FA5 glyphs live in the free "solid" set.
    return <FontAwesome5 name={def.glyph as any} size={size} color={color} solid />;
  }
  return <MaterialCommunityIcons name={def.glyph as any} size={size} color={color} />;
}

interface GlasswareIconPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Modal header + trigger placeholder. */
  title: string;
  placeholder?: string;
  /** Localized "Custom…" cell label. */
  customLabel: string;
  /** Placeholder for the custom text input. */
  customPlaceholder?: string;
}

export default function GlasswareIconPicker({
  value,
  onChange,
  title,
  placeholder,
  customLabel,
  customPlaceholder,
}: GlasswareIconPickerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const isPreset = (v: string) => (GLASSWARE_OPTIONS as readonly string[]).includes(v);

  useEffect(() => {
    if (!open) return;
    const preset = isPreset(value);
    setCustomMode(!!value && !preset);
    setCustomText(preset ? '' : value);
  }, [open, value]);

  const choose = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };
  const saveCustom = () => {
    const v = customText.trim();
    if (!v) return;
    onChange(v);
    setOpen(false);
  };

  // Build explicit rows (no flexWrap with bordered cells — see feedback_ui_patterns).
  const rows: string[][] = [];
  for (let i = 0; i < GLASSWARE_OPTIONS.length; i += COLUMNS) {
    rows.push((GLASSWARE_OPTIONS as readonly string[]).slice(i, i + COLUMNS));
  }

  return (
    <>
      {/* Trigger */}
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        {value ? (
          <GlasswareGlyph name={value} size={20} color={colors.primary} />
        ) : null}
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder, value && { marginLeft: 10 }]} numberOfLines={1}>
          {value || placeholder || ''}
        </Text>
        <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                  <TouchableOpacity style={styles.backBtn} onPress={() => setCustomMode(false)}>
                    <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, !customText.trim() && { opacity: 0.5 }]}
                    onPress={saveCustom}
                    disabled={!customText.trim()}
                  >
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                {rows.map((row, ri) => (
                  <View key={ri} style={styles.gridRow}>
                    {row.map((opt) => {
                      const isCurrent = opt === value;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.cell, isCurrent && styles.cellActive]}
                          onPress={() => choose(opt)}
                          activeOpacity={0.8}
                        >
                          <GlasswareGlyph name={opt} size={34} color={isCurrent ? colors.primary : colors.text} />
                          <Text style={[styles.cellText, isCurrent && styles.cellTextActive]} numberOfLines={2}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* pad short final row so cells keep their width */}
                    {row.length < COLUMNS &&
                      Array.from({ length: COLUMNS - row.length }).map((_, i) => (
                        <View key={`pad${i}`} style={styles.cellSpacer} />
                      ))}
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.customRow}
                  onPress={() => { setCustomText(''); setCustomMode(true); }}
                  activeOpacity={0.8}
                >
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={16} color={colors.primary} />
                  <Text style={styles.customRowText} numberOfLines={1}>{customLabel}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    // Trigger (mirrors SimpleSelectPicker's SelectField)
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    fieldText: { flex: 1, fontSize: 16, color: colors.text, paddingRight: 8 },
    fieldPlaceholder: { color: colors.textSecondary },

    // Modal sheet
    container: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '70%',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 24,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, paddingRight: 12 },
    scroll: { flexGrow: 0 },

    // Grid
    gridRow: { flexDirection: 'row', marginBottom: 10 },
    cell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 6,
      marginHorizontal: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 86,
    },
    cellActive: { borderColor: colors.primary, backgroundColor: colors.primary + '1F' },
    cellSpacer: { flex: 1, marginHorizontal: 4 },
    cellText: { marginTop: 8, fontSize: 12, color: colors.text, textAlign: 'center' },
    cellTextActive: { color: colors.primary, fontWeight: '600' },

    // Custom row + input
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: 4,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary,
    },
    customRowText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
    customWrap: { paddingTop: 4 },
    customInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    customActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
    backBtn: { padding: 10, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    confirmBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  });
