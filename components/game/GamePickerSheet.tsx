import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * The pre-game option sheet (s75): difficulty and play-mode steps rendered as
 * a bottom GlassSheet instead of the old centered Modals. The SCREEN owns the
 * step state — a multi-step flow keeps one mounted sheet and swaps
 * options/title per step.
 *
 * `dismissOnPick` decides the handoff: a terminal pick (play mode chosen)
 * rides the defer handoff so navigation never fires during the dismissal (the
 * freeze class); a step pick (difficulty chosen) leaves the sheet open and
 * just reports up.
 */
export interface GamePickerOption {
  key: string;
  label: string;
  desc?: string;
  /** Accent for the label + border wash; defaults to the theme tint. */
  color?: string;
}

interface GamePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: GamePickerOption[];
  onPick: (key: string) => void;
  /** true = pick closes the sheet and defers onPick past the dismissal. */
  dismissOnPick: boolean;
  /** Optional in-sheet back link (step 2 → step 1). */
  backLabel?: string;
  onBack?: () => void;
}

export default function GamePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  onPick,
  dismissOnPick,
  backLabel,
  onBack,
}: GamePickerSheetProps) {
  const colors = useThemeColors();
  const { defer, onDismiss } = useSheetHandoff(onClose);

  return (
    <GlassSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} onDismiss={onDismiss}>
      {options.map((o) => {
        const accent = o.color ?? colors.tint;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (dismissOnPick) defer(() => onPick(o.key));
              else onPick(o.key);
            }}
            style={[styles.option, { backgroundColor: accent + '14', borderColor: accent + '55' }]}
          >
            <Text style={[styles.optionLabel, { color: accent }]}>{o.label}</Text>
            {!!o.desc && (
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{o.desc}</Text>
            )}
          </Pressable>
        );
      })}
      {!!backLabel && !!onBack && (
        <Pressable onPress={onBack} style={styles.backRow}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>{backLabel}</Text>
        </Pressable>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    borderRadius: 13,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 9,
    gap: 3,
  },
  optionLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
  },
  optionDesc: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  backRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    fontFamily: fonts.body.medium,
    fontSize: 13,
  },
});
