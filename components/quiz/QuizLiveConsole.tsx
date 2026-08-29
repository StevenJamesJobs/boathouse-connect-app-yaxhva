/**
 * QuizLiveConsole — the s77 live command deck (ED·LIVE lockdown): the
 * role-gradient console that PINS above the editor's scroll while a quiz is
 * active. Carries the countdown, the vitals row (questions · taken · avg ·
 * Bucks paid) and ALL FOUR actions in the 2×2 chip grid — Pause · Preview ·
 * Close · New Quiz (Steve's Live·A call: the bottom edge is where thumbs
 * scroll; the console is deliberate reach).
 *
 * Fixed-dark surface in both themes — every color here is a literal (the
 * ember rule). The parent owns the countdown tick and mounts this OUTSIDE
 * its ScrollView so the pin is native chrome, not scroll-linked morphing.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import {
  QUIZ_VISUALS,
  CONSOLE_COUNTDOWN_GOLD,
} from '@/components/quiz/quizVisuals';
import { formatCountdown, getCountdownUrgency } from '@/utils/exam/examEngine';
import type { ExamType } from '@/utils/exam/questionGenerator';
import { fonts } from '@/constants/fonts';

interface QuizLiveConsoleProps {
  examType: ExamType;
  closeAt: Date | null;
  questionCount: number;
  completedCount: number;
  totalEmployees: number;
  avgPct: number | null;
  paidTotal: number;
  busy?: boolean;
  onPause: () => void;
  onPreview: () => void;
  onCloseQuiz: () => void;
  onNewQuiz: () => void;
}

export default function QuizLiveConsole({
  examType,
  closeAt,
  questionCount,
  completedCount,
  totalEmployees,
  avgPct,
  paidTotal,
  busy,
  onPause,
  onPreview,
  onCloseQuiz,
  onNewQuiz,
}: QuizLiveConsoleProps) {
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const visual = QUIZ_VISUALS[examType];

  const msRemaining = closeAt ? closeAt.getTime() - Date.now() : null;
  const urgency = msRemaining != null ? getCountdownUrgency(msRemaining) : null;
  const countdownColor =
    urgency === 'red' ? '#FFB4B4' : urgency === 'expired' ? 'rgba(255,255,255,0.55)' : CONSOLE_COUNTDOWN_GOLD;

  const stat = (value: string, label: string) => (
    <View style={styles.stat} key={label}>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statLabel}> {label.toUpperCase()}</Text>
      </Text>
    </View>
  );

  const chip = (opts: {
    key: string;
    label: string;
    iosIcon: string;
    androidIcon: string;
    danger?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      key={opts.key}
      style={[styles.chip, opts.danger && styles.chipDanger]}
      onPress={opts.onPress}
      disabled={busy}
      activeOpacity={0.75}
    >
      <IconSymbol
        ios_icon_name={opts.iosIcon as any}
        android_material_icon_name={opts.androidIcon as any}
        size={13}
        color={opts.danger ? '#FFB4B4' : '#FFFFFF'}
      />
      <Text style={[styles.chipText, opts.danger && { color: '#FFB4B4' }]} numberOfLines={1}>
        {opts.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={[visual.console[0], visual.console[1], visual.console[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.row1}>
        <View style={styles.liveDot} />
        <Text style={styles.liveLabel}>{t('exam_editor.live_now').toUpperCase()}</Text>
        {msRemaining != null && (
          <View style={styles.countdown}>
            <IconSymbol
              ios_icon_name="hourglass"
              android_material_icon_name="hourglass-empty"
              size={12}
              color={countdownColor}
            />
            <Text style={[styles.countdownText, { color: countdownColor }]}>
              {formatCountdown(msRemaining, isSpanish)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.statsRow}>
        {stat(String(questionCount), t('exam_editor.con_qs'))}
        {stat(`${completedCount}/${totalEmployees}`, t('exam_editor.con_taken'))}
        {avgPct != null && stat(`${avgPct}%`, t('exam_editor.con_avg'))}
        {stat(`$${paidTotal}`, t('exam_editor.con_paid'))}
      </View>
      <View style={styles.chipGrid}>
        {chip({
          key: 'pause',
          label: t('exam_editor.pause_btn'),
          iosIcon: 'pause.fill', androidIcon: 'pause',
          onPress: onPause,
        })}
        {chip({
          key: 'preview',
          label: t('exam_editor.preview_btn'),
          iosIcon: 'eye.fill', androidIcon: 'visibility',
          onPress: onPreview,
        })}
        {chip({
          key: 'close',
          label: t('exam_editor.close_btn'),
          iosIcon: 'xmark', androidIcon: 'close',
          danger: true,
          onPress: onCloseQuiz,
        })}
        {chip({
          key: 'new',
          label: t('exam_editor.new_quiz_btn'),
          iosIcon: 'arrow.counterclockwise', androidIcon: 'refresh',
          onPress: onNewQuiz,
        })}
      </View>
    </View>
  );
}

// Fixed-dark chrome — literals by design (the ember rule).
const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    padding: 13,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0 12px 30px -14px rgba(0,0,0,0.6)',
  },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34E0A1',
    boxShadow: '0 0 8px rgba(52,224,161,0.9)',
  },
  liveLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.85)',
  },
  countdown: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdownText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 11, flexWrap: 'wrap' },
  stat: {},
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 8.5, color: 'rgba(255,255,255,0.6)' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  chipDanger: {
    borderColor: 'rgba(255,150,150,0.42)',
  },
  chipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12,
    color: '#FFFFFF',
  },
});
