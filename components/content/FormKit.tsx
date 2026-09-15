import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet, Animated, type TextInputProps } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { ThemeColorSet } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

/**
 * The Content Kit's field grammar — the MenuItemEditSheet block (mono-10
 * eyebrow labels · 43pt r13 glass inputs · surface seg control · glass
 * featureRow) lifted into components so the three stepped editors, the
 * attachment field and the review step all draw the same field.
 */

export function useFormStyles(colors: ThemeColorSet) {
  return useMemo(() => createStyles(colors), [colors]);
}

export function FieldLabel({ label, trailing }: { label: string; trailing?: string }) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{label}</Text>
      {!!trailing && <Text style={s.labelTrailing}>{trailing}</Text>}
    </View>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return <Text style={s.hint}>{children}</Text>;
}

export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <View style={s.stepTitleWrap}>
      <Text style={s.stepTitle}>{title}</Text>
      {!!subtitle && <Text style={s.stepSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export const GlassTextInput = forwardRef<TextInput, TextInputProps>(function GlassTextInput(props, ref) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textSecondary}
      {...props}
      style={[s.input, props.multiline && s.textArea, props.style]}
    />
  );
});

export interface SegOption<T extends string> {
  key: T;
  label: string;
  iosIcon?: string;
  androidIcon?: string;
  /** Per-option active fill (the Event / Entertainment hues); defaults to primary. */
  activeColor?: string;
  /** Ink on the active fill; defaults to fireText (white on the hue pair). */
  activeInk?: string;
}

export function SegControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.key === value;
        const fill = o.activeColor ?? colors.primary;
        const ink = on ? (o.activeInk ?? (o.activeColor ? '#FFFFFF' : colors.fireText)) : colors.textSecondary;
        return (
          <Pressable
            key={o.key}
            style={[s.segOpt, on && { backgroundColor: fill }]}
            onPress={() => onChange(o.key)}
          >
            {!!o.iosIcon && !!o.androidIcon && (
              <IconSymbol ios_icon_name={o.iosIcon} android_material_icon_name={o.androidIcon} size={13} color={ink} />
            )}
            <Text style={[s.segLabel, { color: ink }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A JS-drawn switch (46 × 28, tint track when on, animated thumb). Use it where the native
 * `Switch` goes dead: a Modal presented from INSIDE another Modal on iOS renders UISwitch
 * but never delivers its value change (the s84 Tile options sheet inside Edit favorites).
 * Same props as Switch's value / onValueChange.
 */
export function GlassToggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);
  const track = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.surfaceBorder, colors.tint] });
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[toggleStyles.track, { backgroundColor: track, borderColor: colors.glassBorder }]}>
        <Animated.View style={[toggleStyles.thumb, { left, backgroundColor: value ? colors.fireText : colors.card }]} />
      </Animated.View>
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  track: { width: 46, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});

export function SwitchRow({
  iosIcon,
  androidIcon,
  title,
  subtitle,
  value,
  onValueChange,
  native = true,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** false → GlassToggle (required inside a sheet that is itself inside a sheet). */
  native?: boolean;
}) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <View style={s.featureRow}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={18} color={colors.primary} />
      <View style={s.featureRowBody}>
        <Text style={s.featureRowTitle}>{title}</Text>
        {!!subtitle && <Text style={s.featureRowHint}>{subtitle}</Text>}
      </View>
      {native ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
          thumbColor={colors.card}
        />
      ) : (
        <GlassToggle value={value} onValueChange={onValueChange} />
      )}
    </View>
  );
}

/** The featureRow without a control — a live summary line ("Runs 3 days"). */
export function InfoRow({
  iosIcon,
  androidIcon,
  title,
  subtitle,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  subtitle?: string;
}) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <View style={s.featureRow}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={18} color={colors.primary} />
      <View style={s.featureRowBody}>
        <Text style={s.featureRowTitle}>{title}</Text>
        {!!subtitle && <Text style={s.featureRowHint}>{subtitle}</Text>}
      </View>
    </View>
  );
}

/** A select trigger in the input's geometry: leading glyph · value · chevron. */
export function SelectRow({
  iosIcon,
  androidIcon,
  iconColor,
  value,
  placeholder,
  onPress,
}: {
  iosIcon: string;
  androidIcon: string;
  iconColor?: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const s = useFormStyles(colors);
  return (
    <Pressable style={s.selectRow} onPress={onPress}>
      <IconSymbol
        ios_icon_name={iosIcon}
        android_material_icon_name={androidIcon}
        size={17}
        color={iconColor ?? colors.textSecondary}
      />
      <Text style={[s.selectValue, !value && { color: colors.textSecondary }]} numberOfLines={1}>
        {value || placeholder || ''}
      </Text>
      <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    label: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    labelTrailing: {
      marginLeft: 'auto',
      fontFamily: fonts.mono.medium,
      fontSize: 9.5,
      letterSpacing: 0.3,
      color: colors.textSecondary,
      opacity: 0.85,
    },
    hint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 6,
    },
    stepTitleWrap: { gap: 3, marginBottom: 2 },
    stepTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 16,
      letterSpacing: -0.2,
      color: colors.text,
    },
    stepSubtitle: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, color: colors.textSecondary },
    input: {
      minHeight: 43,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontFamily: fonts.body.regular,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    seg: {
      flexDirection: 'row',
      gap: 3,
      padding: 3,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    segOpt: {
      flex: 1,
      flexDirection: 'row',
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segLabel: { fontFamily: fonts.display.semibold, fontSize: 12.5, flexShrink: 1 },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    featureRowBody: { flex: 1, minWidth: 0 },
    featureRowTitle: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.text },
    featureRowHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, color: colors.textSecondary, marginTop: 2 },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 43,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    selectValue: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, color: colors.text },
    twoCol: { flexDirection: 'row', gap: 10 },
    twoColItem: { flex: 1, minWidth: 0 },
  });
