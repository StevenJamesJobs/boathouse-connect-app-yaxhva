/**
 * QuizSettingsConsole — the draft/paused glass console (ED·DRAFT/ED·PAUSED
 * lockdown): the editor's whole top stack — status, count, close-at, time
 * limit, per-correct default, both toggles — folded into one collapsible
 * card. The header collapses to a one-line summary; when the quiz is PAUSED
 * a green RESUME chip rides beside the pill (Steve's round-3 note).
 *
 * The chips only report intent — the screen owns the sheets/pickers and the
 * RPCs. `editable` is the draft gate: paused shows time/value/notify/rewards
 * dimmed (the server locks nothing here, but mid-quiz fairness does).
 */

import React from 'react';
import {
  LayoutAnimation,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { QUIZ_VISUALS, QUIZ_STATUS_COLORS } from '@/components/quiz/quizVisuals';
import type { ExamType } from '@/utils/exam/questionGenerator';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

interface QuizSettingsConsoleProps {
  examType: ExamType;
  status: 'draft' | 'paused';
  open: boolean;
  onToggleOpen: () => void;
  /** One-line collapsed summary ("12 Qs · 5:00 · closes Sun 11:59p"). */
  summary: string;
  timeLimitLabel: string;
  onPressTimeLimit: () => void;
  closeAtLabel: string;
  onPressCloseAt: () => void;
  valueLabel: string;
  onPressValue: () => void;
  notifyOnActivate: boolean;
  onToggleNotify: (next: boolean) => void;
  rewardsEnabled: boolean;
  onToggleRewards: (next: boolean) => void;
  /** The honest max-payout math line under Award Bucks (null hides it). */
  payoutLine: string | null;
  /**
   * The multi-quiz split explainer under the Rewards chip (Steve's smoke-2
   * note): always states that per-correct amounts may split, with the
   * concrete 2-/3-quiz math when the quiz pays. Null hides it.
   */
  splitNote?: string | null;
  /** Draft only — paused dims everything but Closes. */
  editable: boolean;
  /** Paused: the header RESUME chip. */
  onResume?: () => void;
}

export default function QuizSettingsConsole({
  examType,
  status,
  open,
  onToggleOpen,
  summary,
  timeLimitLabel,
  onPressTimeLimit,
  closeAtLabel,
  onPressCloseAt,
  valueLabel,
  onPressValue,
  notifyOnActivate,
  onToggleNotify,
  rewardsEnabled,
  onToggleRewards,
  payoutLine,
  splitNote,
  editable,
  onResume,
}: QuizSettingsConsoleProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const visual = QUIZ_VISUALS[examType];
  const statusColor = QUIZ_STATUS_COLORS[status];

  const handleToggleOpen = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleOpen();
  };

  const chip = (opts: {
    key: string;
    iosIcon: string;
    androidIcon: string;
    label: string;
    value: string;
    onPress?: () => void;
    disabled?: boolean;
    trailing?: React.ReactNode;
    fullWidth?: boolean;
  }) => (
    <TouchableOpacity
      key={opts.key}
      style={[
        styles.chip,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        opts.fullWidth && styles.chipFull,
        opts.disabled && { opacity: 0.5 },
      ]}
      onPress={opts.onPress}
      disabled={!opts.onPress || opts.disabled}
      activeOpacity={0.75}
    >
      <IconSymbol
        ios_icon_name={opts.iosIcon as any}
        android_material_icon_name={opts.androidIcon as any}
        size={13}
        color={visual.accent}
      />
      <View style={styles.chipBody}>
        <Text style={[styles.chipLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {opts.label.toUpperCase()}
        </Text>
        <Text style={[styles.chipValue, { color: colors.text }]} numberOfLines={2}>
          {opts.value}
        </Text>
      </View>
      {opts.trailing}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.console, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <TouchableOpacity style={styles.header} onPress={handleToggleOpen} activeOpacity={0.75}>
        <View style={[styles.pill, { backgroundColor: statusColor + '20', borderColor: statusColor + '55' }]}>
          <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.pillText, { color: statusColor }]}>
            {t(status === 'draft' ? 'exam_editor.status_draft' : 'exam_editor.status_paused').toUpperCase()}
          </Text>
        </View>
        {status === 'paused' && onResume && (
          <TouchableOpacity style={styles.resumeChip} onPress={onResume} activeOpacity={0.75}>
            <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={10} color="#10B981" />
            <Text style={styles.resumeText}>{t('exam_editor.resume_btn').toUpperCase()}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={1}>
          {summary}
        </Text>
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={15}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.grid}>
            {chip({
              key: 'time',
              iosIcon: 'timer', androidIcon: 'timer',
              label: t('exam_editor.time_limit'),
              value: timeLimitLabel,
              onPress: onPressTimeLimit,
              disabled: !editable,
            })}
            {chip({
              key: 'closes',
              iosIcon: 'calendar', androidIcon: 'event',
              label: t('exam_editor.closes_at'),
              value: closeAtLabel,
              onPress: onPressCloseAt,
            })}
            {chip({
              key: 'value',
              iosIcon: 'dollarsign.circle', androidIcon: 'attach-money',
              label: t('exam_editor.per_correct'),
              value: valueLabel,
              onPress: onPressValue,
              disabled: !editable,
            })}
            {chip({
              key: 'notify',
              iosIcon: 'bell', androidIcon: 'notifications-none',
              label: t('exam_editor.notify_staff'),
              value: t('exam_editor.notify_on_activate_short'),
              disabled: !editable,
              trailing: (
                <Switch
                  value={notifyOnActivate}
                  onValueChange={onToggleNotify}
                  disabled={!editable}
                  trackColor={{ false: colors.border, true: visual.accent + '80' }}
                  thumbColor={notifyOnActivate ? visual.accent : '#F4F3F4'}
                  style={styles.switch}
                />
              ),
            })}
          </View>
          {chip({
            key: 'rewards',
            iosIcon: 'star', androidIcon: 'star-border',
            label: t('exam_editor.award_bucks_label'),
            value: payoutLine ?? t('exam_editor.rewards_off_line'),
            disabled: !editable,
            fullWidth: true,
            trailing: (
              <Switch
                value={rewardsEnabled}
                onValueChange={onToggleRewards}
                disabled={!editable}
                trackColor={{ false: colors.border, true: visual.accent + '80' }}
                thumbColor={rewardsEnabled ? visual.accent : '#F4F3F4'}
                style={styles.switch}
              />
            ),
          })}
          {!!splitNote && (
            <Text style={[styles.splitNote, { color: colors.textSecondary }]}>
              {splitNote}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  console: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 46,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.8 },
  resumeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.42)',
  },
  resumeText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.6, color: '#10B981' },
  summary: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
  },
  body: { paddingHorizontal: 13, paddingBottom: 13, paddingTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 48,
  },
  chipFull: { flexBasis: '100%', marginTop: 7 },
  chipBody: { flex: 1, minWidth: 0 },
  chipLabel: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.8 },
  chipValue: { fontFamily: fonts.body.semibold, fontSize: 11.5, marginTop: 1 },
  switch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginLeft: 4 },
  splitNote: {
    fontFamily: fonts.body.regular,
    fontSize: 10,
    fontStyle: 'italic',
    lineHeight: 14,
    marginTop: 7,
    paddingHorizontal: 2,
  },
});
