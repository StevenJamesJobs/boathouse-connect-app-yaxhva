import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { doneHue } from '@/components/content/contentVisuals';
import { fonts } from '@/constants/fonts';

export interface StepDef {
  key: string;
  label: string;
}

interface StepSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  steps: StepDef[];
  /** 0-based current step. */
  step: number;
  onStepChange: (index: number) => void;
  /**
   * Highest step index the user has reached. Steps at or below it (other than
   * the current one) draw as done ✓; edit mode passes `steps.length - 1` so
   * every step is done from the first frame and Review is one tap deep.
   */
  visited: number;
  children: React.ReactNode;
  /** Footer primary on the LAST step ("Post announcement"). */
  primaryLabel: string;
  nextLabel: string;
  backLabel: string;
  cancelLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  primaryDisabled?: boolean;
  /** iOS-only Modal dismissal signal — pass through when handing off to another Modal. */
  onDismiss?: () => void;
}

/**
 * The Content Kit's stepped GlassSheet (s80 lockdown — Steve: "really loving
 * the Steps for all three"). Title + steps rail + footer are PINNED; only the
 * current pane scrolls. Built on GlassSheet with `scroll={false}` so the rail
 * can sit above a body ScrollView of our own — the shrinkable-viewport /
 * unshrinkable-content pair GlassSheet documents.
 *
 * Rail taps and Back jump freely; Next advances. The sheet owns no form state.
 */
export default function StepSheet({
  visible,
  onClose,
  title,
  subtitle,
  steps,
  step,
  onStepChange,
  visited,
  children,
  primaryLabel,
  nextLabel,
  backLabel,
  cancelLabel,
  onPrimary,
  busy,
  primaryDisabled,
  onDismiss,
}: StepSheetProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ok = doneHue(isDark);
  const last = steps.length - 1;
  const isLast = step >= last;
  const progress = last > 0 ? Math.max(0, Math.min(step, last)) / last : 0;

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      scroll={false}
      onDismiss={onDismiss}
      footer={
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.footerBtn, styles.footerBtnBack]}
            onPress={() => (step === 0 ? onClose() : onStepChange(step - 1))}
            disabled={busy}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{step === 0 ? cancelLabel : backLabel}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.footerBtn,
              styles.footerBtnPrimary,
              (busy || (isLast && primaryDisabled)) && styles.footerBtnDisabled,
            ]}
            onPress={() => (isLast ? onPrimary() : onStepChange(step + 1))}
            disabled={busy || (isLast && primaryDisabled)}
          >
            {busy ? (
              <ActivityIndicator color={colors.fireText} />
            ) : (
              <View style={styles.footerBtnInner}>
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]} numberOfLines={1}>
                  {isLast ? primaryLabel : nextLabel}
                </Text>
                {!isLast && (
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron-right"
                    size={15}
                    color={colors.fireText}
                  />
                )}
              </View>
            )}
          </Pressable>
        </View>
      }
    >
      {/* Steps rail — pinned. The progress line sits behind the circles. */}
      <View style={styles.rail}>
        <View style={[styles.railLine, { backgroundColor: colors.hairline }]}>
          <View style={[styles.railLineFill, { backgroundColor: ok, width: `${Math.round(progress * 100)}%` }]} />
        </View>
        {steps.map((s, i) => {
          const isCurrent = i === step;
          const isDone = !isCurrent && (i < step || i <= visited);
          return (
            <Pressable key={s.key} style={styles.step} onPress={() => onStepChange(i)} disabled={busy} hitSlop={4}>
              <View
                style={[
                  styles.stepCircle,
                  { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  isDone && { backgroundColor: ok + '2E', borderColor: ok + '80' },
                  isCurrent && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {isDone ? (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color={ok} />
                ) : (
                  <Text style={[styles.stepNum, { color: isCurrent ? colors.fireText : colors.textSecondary }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.stepLabel, { color: isCurrent ? colors.primary : colors.textSecondary }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The pane. Viewport shrinks, content does not (GlassSheet's rule). */}
      <ScrollView
        style={styles.paneScroll}
        contentContainerStyle={styles.paneContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </GlassSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    rail: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 4,
      position: 'relative',
    },
    railLine: {
      position: 'absolute',
      left: '10%',
      right: '10%',
      top: 12,
      height: 1,
    },
    railLineFill: { height: '100%' },
    step: { flex: 1, alignItems: 'center', gap: 5 },
    stepCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    stepNum: { fontFamily: fonts.mono.semibold, fontSize: 10 },
    stepLabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
    },
    paneScroll: { flexGrow: 0, flexShrink: 1 },
    paneContent: { gap: 12, paddingTop: 6, paddingBottom: 4 },
    footerRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
    footerBtn: {
      flex: 1,
      height: 47,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    footerBtnBack: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
    footerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
    footerBtnDisabled: { opacity: 0.6 },
    footerBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
  });
