/**
 * Small shared pieces of the Tips & Checkouts kit (s78): the chip row, the
 * stepper, the steps rail, and the money field. Kept together — each is a few
 * dozen lines and they always travel as a set across the family's sheets and
 * ritual steps.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { fonts } from '@/constants/fonts';

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export interface ChipOption {
  key: string;
  label: string;
  iosIcon?: string;
  androidIcon?: string;
}

export function ChipRow({
  options,
  selectedKeys,
  onToggle,
}: {
  options: ChipOption[];
  /**
   * Selected keys — pass one for single-select rows, several for multi-select
   * (weather can be Sunny + Hot + Humid at once, Steve's punch-round call).
   * The caller owns the toggle semantics; every chip stays optional.
   */
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((opt) => {
        const on = selectedKeys.includes(opt.key);
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onToggle(opt.key)}
            style={[
              styles.chip,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              on && { backgroundColor: `${accent}24`, borderColor: `${accent}80` },
            ]}
          >
            {!!opt.iosIcon && !!opt.androidIcon && (
              <IconSymbol
                ios_icon_name={opt.iosIcon}
                android_material_icon_name={opt.androidIcon}
                size={14}
                color={on ? accent : colors.textSecondary}
              />
            )}
            <Text
              style={[
                styles.chipText,
                { color: on ? accent : colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

export function TipsStepper({
  value,
  step = 1,
  min = 0,
  onChange,
}: {
  value: number;
  step?: number;
  min?: number;
  onChange: (next: number) => void;
}) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  // The value is TYPEABLE too (Steve's punch-round call: nobody taps + 42
  // times for covers). The draft mirrors `value` except while the user types,
  // so − / + keep working off the committed number.
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft !== null ? draft : `${value}`;
  const allowDecimal = step % 1 !== 0;
  // Commit on EVERY keystroke — a blur-time commit loses the typed number
  // when the user taps Save while the keyboard is still up (sheet taps are
  // keyboardShouldPersistTaps). The draft only shapes what's displayed.
  const typeCommit = (text: string) => {
    const cleaned = allowDecimal ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');
    setDraft(cleaned);
    const parsed = allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
    onChange(Number.isFinite(parsed) ? Math.max(min, parsed) : min);
  };
  const nudge = (dir: 1 | -1) => {
    // Float-safe for the 0.5-step hours stepper.
    const next = Math.max(min, Math.round((value + dir * step) * 100) / 100);
    setDraft(null);
    onChange(next);
  };
  return (
    <View style={[styles.stepper, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <TouchableOpacity onPress={() => nudge(-1)} hitSlop={10}>
        <IconSymbol ios_icon_name="minus" android_material_icon_name="remove" size={16} color={accent} />
      </TouchableOpacity>
      <TextInput
        style={[styles.stepperValue, { color: colors.text }]}
        value={shown}
        onChangeText={typeCommit}
        onFocus={() => setDraft(value ? `${value}` : '')}
        onBlur={() => setDraft(null)}
        keyboardType={allowDecimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
      />
      <TouchableOpacity onPress={() => nudge(1)} hitSlop={10}>
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={accent} />
      </TouchableOpacity>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Steps rail (the ritual's five dots)                                 */
/* ------------------------------------------------------------------ */

export function StepsRail({ labels, current }: { labels: string[]; current: number }) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={styles.rail}>
      {labels.map((label, i) => {
        const done = i < current;
        const cur = i === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && <View style={[styles.railLine, { backgroundColor: colors.hairline }]} />}
            <View style={styles.railStep}>
              <View
                style={[
                  styles.railDot,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  done && { backgroundColor: `${accent}2A`, borderColor: accent },
                  cur && { backgroundColor: accent, borderColor: accent },
                ]}
              >
                {done ? (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color={accent} />
                ) : (
                  <Text
                    style={[
                      styles.railNum,
                      { color: cur ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.railLabel,
                  { color: cur ? accent : colors.textSecondary },
                  cur && styles.railLabelCur,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Money field                                                         */
/* ------------------------------------------------------------------ */

/** Keeps only digits and a single dot — the house decimal-pad cleaner. */
export function cleanMoneyText(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
}

export function MoneyField({
  value,
  onChangeText,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.moneyField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Text style={[styles.moneyCur, { color: colors.textSecondary }]}>$</Text>
      <TextInput
        style={[styles.moneyInput, { color: colors.text }]}
        value={value}
        onChangeText={(text) => onChangeText(cleanMoneyText(text))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
      />
    </View>
  );
}

export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 7, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
    height: 22,
  },
  rail: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingHorizontal: 2 },
  railStep: { flex: 1, alignItems: 'center', gap: 4 },
  // Sits at dot-centre height (dot 22 → centre 11) between the dots.
  railLine: { height: 1.5, flexBasis: 10, flexShrink: 1, marginTop: 11 },
  railDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railNum: { fontFamily: fonts.mono.semibold, fontSize: 10 },
  railLabel: { fontFamily: fonts.mono.medium, fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  railLabelCur: { fontFamily: fonts.mono.semibold },
  moneyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    height: 48,
    flex: 1,
  },
  moneyCur: { fontFamily: fonts.mono.semibold, fontSize: 15 },
  moneyInput: {
    flex: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    height: 48,
    paddingVertical: 0,
  },
});
