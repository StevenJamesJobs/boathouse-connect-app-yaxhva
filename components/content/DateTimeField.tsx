import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { FieldLabel, Hint } from '@/components/content/FormKit';
import { fonts } from '@/constants/fonts';

interface DateTimeFieldProps {
  label: string;
  /** Rendered as the label's trailing note ("optional"). */
  labelTrailing?: string;
  value: Date | null;
  onChange: (next: Date | null) => void;
  /** Shown in the date segment while empty. */
  placeholder: string;
  hint?: string;
  /** Seed when the field is empty and the user opens a picker (defaults to the next whole hour). */
  seed?: Date;
  minimumDate?: Date;
}

/**
 * DateTimeField — the Content Kit's glass date row (MINTED s80: the app had no
 * glass-era date input; the pre-glass editors drew hard-white pickers).
 *
 * One 43pt r13 glass row: calendar glyph + date · hairline · mono time · ✕.
 * iOS: the row opens a nested GlassSheet carrying the themed system SPINNER
 * (date+time) with a Done footer — deterministic hit area, no overlay tricks
 * (the invisible-compact-picker overlay only sized to its own pill and missed
 * taps on the row text, s80 smoke). Android: the standard DateTimePickerAndroid
 * dialogs — same library, no Modal.
 */
export default function DateTimeField({
  label,
  labelTrailing,
  value,
  onChange,
  placeholder,
  hint,
  seed,
  minimumDate,
}: DateTimeFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [seedDate] = useState(() => seed ?? nextWholeHour());
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet edits a draft so Cancel/✕ leaves the field untouched.
  const [draft, setDraft] = useState<Date>(value ?? seedDate);
  const locale = language === 'es' ? 'es' : 'en-US';

  const dateText = value ? value.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) : placeholder;
  const timeText = value ? value.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '— —';

  const setDatePart = (picked: Date) => {
    const base = value ?? seedDate;
    const next = new Date(base);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    onChange(next);
  };
  const setTimePart = (picked: Date) => {
    const base = value ?? seedDate;
    const next = new Date(base);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(next);
  };

  const openAndroid = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value: value ?? seedDate,
      mode,
      minimumDate: mode === 'date' ? minimumDate : undefined,
      onChange: (e: DateTimePickerEvent, picked?: Date) => {
        if (e.type !== 'set' || !picked) return;
        if (mode === 'date') setDatePart(picked);
        else setTimePart(picked);
      },
    });
  };

  const openIos = () => {
    setDraft(value ?? seedDate);
    setSheetOpen(true);
  };
  const open = (mode: 'date' | 'time') => (Platform.OS === 'android' ? openAndroid(mode) : openIos());

  return (
    <View>
      <FieldLabel label={label} trailing={labelTrailing} />
      <View style={styles.row}>
        <Pressable style={styles.dateSeg} onPress={() => open('date')}>
          <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={16} color={colors.primary} />
          <Text style={[styles.dateText, !value && { color: colors.textSecondary }]} numberOfLines={1}>
            {dateText}
          </Text>
        </Pressable>
        <Pressable style={[styles.timeSeg, { borderLeftColor: colors.hairline }]} onPress={() => open('time')}>
          <Text style={[styles.timeText, !value && { color: colors.textSecondary }]}>{timeText}</Text>
        </Pressable>
        {!!value && (
          <Pressable
            style={[styles.clear, { borderLeftColor: colors.hairline }]}
            onPress={() => onChange(null)}
            hitSlop={6}
          >
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={14} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {!!hint && <Hint>{hint}</Hint>}

      {Platform.OS === 'ios' && (
        <GlassSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={label}
          scroll={false}
          footer={
            <View style={styles.footerRow}>
              <Pressable style={[styles.footerBtn, styles.footerBtnGlass]} onPress={() => setSheetOpen(false)}>
                <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.footerBtn, styles.footerBtnPrimary]}
                onPress={() => {
                  onChange(new Date(draft));
                  setSheetOpen(false);
                }}
              >
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('content_editor.done')}</Text>
              </Pressable>
            </View>
          }
        >
          <View style={styles.spinnerWrap}>
            <DateTimePicker
              value={draft}
              mode="datetime"
              display="spinner"
              minuteInterval={5}
              minimumDate={minimumDate}
              themeVariant={isDark ? 'dark' : 'light'}
              locale={locale}
              onChange={(_e, picked) => picked && setDraft(picked)}
              style={styles.spinner}
            />
          </View>
        </GlassSheet>
      )}
    </View>
  );
}

function nextWholeHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: 43,
      borderRadius: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      overflow: 'hidden',
    },
    dateSeg: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 13,
      minHeight: 43,
    },
    dateText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 14, color: colors.text },
    timeSeg: {
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderLeftWidth: StyleSheet.hairlineWidth + 0.5,
      minHeight: 43,
    },
    timeText: { fontFamily: fonts.mono.medium, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
    clear: {
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth + 0.5,
    },
    spinnerWrap: {
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
      overflow: 'hidden',
      alignItems: 'center',
    },
    spinner: { width: '100%', height: 200 },
    footerRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
    footerBtn: {
      flex: 1,
      height: 47,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    footerBtnGlass: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
    footerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
    footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
  });
