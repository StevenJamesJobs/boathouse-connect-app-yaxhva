/**
 * Quizzes & Exams hub (manager) — s77 lockdown rebuild. The Game Hub grammar
 * grown for training: a shelf of per-role tiles (Server teal · Bartender navy ·
 * Host violet, status dot + word in the foot, dashed "＋ Create Quiz" ghost for
 * a role with no quiz), and ONE detail card that swaps beneath the shelf with
 * the open quiz's vitals — closes-in countdown, question count, time limit,
 * per-correct value, average score, the checklists' ProgressRing (tap → that
 * quiz's tracker) — and a 2×2 quick-action grid wired to the same RPCs the
 * editor uses (activate goes through the shared examActions helper).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from "expo-router/react-navigation";
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { getExamTypeName } from '@/utils/exam/questionGenerator';
import type { ExamType } from '@/utils/exam/questionGenerator';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import ProgressRing from '@/components/ProgressRing';
import QuizTile from '@/components/quiz/QuizTile';
import {
  QUIZ_VISUALS,
  QUIZ_STATUS_COLORS,
  EXAM_ROLE_ICONS,
  CONSOLE_COUNTDOWN_GOLD,
} from '@/components/quiz/quizVisuals';
import { formatCountdown, formatTime, getCountdownUrgency } from '@/utils/exam/examEngine';
import { activateExamWithDefaults } from '@/utils/exam/examActions';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

interface ExamSummary {
  id: string;
  exam_type: ExamType;
  status: 'draft' | 'active' | 'paused' | 'closed';
  time_limit_seconds: number;
  close_at: string | null;
  notify_on_activate: boolean | null;
  questionCount: number;
  completedCount: number;
  totalEmployees: number;
  avgPct: number | null;
  defaultBucksValue: number | null;
}

const EXAM_TYPES: ExamType[] = ['server', 'bartender', 'host'];

const STATUS_LABEL_KEYS: Record<ExamSummary['status'], string> = {
  draft: 'exam_editor.status_draft',
  active: 'exam_editor.status_active',
  paused: 'exam_editor.status_paused',
  closed: 'exam_editor.status_closed',
};

export default function QuizHubEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const colors = useThemeColors();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Map<ExamType, ExamSummary | null>>(new Map());
  const [selectedType, setSelectedType] = useState<ExamType | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [, setCountdownTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAllExams = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const examMap = new Map<ExamType, ExamSummary | null>();

    for (const examType of EXAM_TYPES) {
      try {
        const { data, error } = await supabase.rpc('get_exam', {
          p_actor_id: user.id,
          p_exam_type: examType,
          p_statuses: ['draft', 'active', 'paused'],
        });

        if (!error && data && data.length > 0) {
          const exam = data[0];

          const { data: questionCount } = await supabase.rpc('get_exam_question_count', {
            p_actor_id: user.id,
            p_exam_id: exam.id,
          });

          // The quiz-level default value rides its own additive reader until
          // get_exam's RETURNS TABLE grows the column (a later drop+recreate).
          let defaultBucksValue: number | null = null;
          try {
            const { data: dv } = await supabase.rpc('get_exam_default_bucks_value', {
              p_actor_id: user.id,
              p_exam_id: exam.id,
            });
            defaultBucksValue = typeof dv === 'number' ? dv : null;
          } catch {}

          let completedCount = 0;
          let totalEmployees = 0;
          let avgPct: number | null = null;

          if (exam.status === 'active' || exam.status === 'paused') {
            try {
              const { data: completionData } = await supabase.rpc('get_exam_completion_status_actor', {
                p_exam_id: exam.id,
                p_exam_type: examType,
                p_actor_id: user.id,
              });

              if (completionData) {
                totalEmployees = completionData.length;
                const done = completionData.filter((e) => e.has_completed);
                completedCount = done.length;
                const scored = done.filter((e) => e.total_questions > 0);
                if (scored.length > 0) {
                  avgPct = Math.round(
                    (scored.reduce((sum, e) => sum + e.correct_count / e.total_questions, 0) /
                      scored.length) * 100,
                  );
                }
              }
            } catch {}
          }

          examMap.set(examType, {
            id: exam.id,
            exam_type: examType,
            status: exam.status as ExamSummary['status'],
            time_limit_seconds: exam.time_limit_seconds,
            close_at: exam.close_at,
            notify_on_activate: exam.notify_on_activate,
            questionCount: questionCount || 0,
            completedCount,
            totalEmployees,
            avgPct,
            defaultBucksValue,
          });
        } else {
          examMap.set(examType, null);
        }
      } catch (err) {
        console.error(`Error fetching ${examType} exam:`, err);
        examMap.set(examType, null);
      }
    }

    setExams(examMap);
    // Keep the open card on a role that still has a quiz; default to the first that does.
    setSelectedType((prev) => {
      if (prev && examMap.get(prev)) return prev;
      return EXAM_TYPES.find((tp) => examMap.get(tp)) ?? null;
    });
    setLoading(false);
  }, [user?.id]);

  // Refresh when the screen regains focus (returning from the editor).
  useFocusEffect(
    useCallback(() => {
      fetchAllExams();
    }, [fetchAllExams])
  );

  // Tick the countdown once per second while the open card shows a close_at.
  const selected = selectedType ? exams.get(selectedType) ?? null : null;
  useEffect(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (selected?.close_at && selected.status !== 'draft') {
      tickRef.current = setInterval(() => setCountdownTick((n) => (n + 1) % 1_000_000), 1000);
    }
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [selected?.close_at, selected?.status]);

  const openEditor = (examType: ExamType) =>
    router.push(`/exam-editor?type=${examType}` as any);

  const openTracker = (examType: ExamType) =>
    router.push(`/exam-editor?type=${examType}&tab=tracker` as any);

  const handleTilePress = (examType: ExamType) => {
    const exam = exams.get(examType);
    if (!exam) {
      // Ghost tile: straight into the composer for this role.
      openEditor(examType);
      return;
    }
    setSelectedType((prev) => (prev === examType ? null : examType));
  };

  const runStatusChange = async (exam: ExamSummary, status: 'active' | 'paused' | 'closed') => {
    if (!user?.id) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc('set_exam_status', {
        p_actor_id: user.id, p_exam_id: exam.id, p_status: status,
      });
      if (error) throw error;
      await fetchAllExams();
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err));
    }
    setActionBusy(false);
  };

  const handlePause = (exam: ExamSummary) => {
    Alert.alert(t('exam_editor.pause_quiz'), t('exam_editor.pause_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exam_editor.pause_btn'), onPress: () => runStatusChange(exam, 'paused') },
    ]);
  };

  const handleResume = (exam: ExamSummary) => {
    Alert.alert(t('exam_editor.resume_quiz'), t('exam_editor.resume_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exam_editor.resume_btn'), onPress: () => runStatusChange(exam, 'active') },
    ]);
  };

  const handleClose = (exam: ExamSummary) => {
    Alert.alert(t('exam_editor.close_quiz'), t('exam_editor.close_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.close'), style: 'destructive', onPress: () => runStatusChange(exam, 'closed') },
    ]);
  };

  const handleReset = (exam: ExamSummary) => {
    Alert.alert(t('exam_editor.reset_new_quiz'), t('exam_editor.reset_new_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exam_editor.reset_btn'), style: 'destructive', onPress: () => runStatusChange(exam, 'closed') },
    ]);
  };

  const handleActivate = (exam: ExamSummary) => {
    if (!user?.id) return;
    if (exam.questionCount === 0) {
      Alert.alert(t('common.error'), t('exam_editor.no_questions_activate'));
      return;
    }
    Alert.alert(
      t('exam_editor.activate_quiz'),
      t('exam_editor.activate_msg', { type: getExamTypeName(exam.exam_type, isSpanish) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.activate_btn'),
          onPress: async () => {
            setActionBusy(true);
            try {
              await activateExamWithDefaults({
                actorId: user.id,
                organizationId: organizationId ?? null,
                examId: exam.id,
                examType: exam.exam_type,
                notifyOnActivate: Boolean(exam.notify_on_activate),
                closeAt: exam.close_at ? new Date(exam.close_at) : null,
              });
              await fetchAllExams();
              Alert.alert(t('exam_editor.activated_title'), t('exam_editor.activated_msg'));
            } catch (err: any) {
              Alert.alert(t('common.error'), translateServerError(err));
            }
            setActionBusy(false);
          },
        },
      ]
    );
  };

  const handlePreview = (exam: ExamSummary) => {
    if (exam.questionCount === 0) return;
    router.push(`/exam-play?examId=${exam.id}&preview=true` as any);
  };

  // ─── Pieces ─────────────────────────────────────────────────────────────

  const renderActionButton = (opts: {
    key: string;
    label: string;
    iosIcon: string;
    androidIcon: string;
    color: string;
    tintedBg?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      key={opts.key}
      style={[
        styles.actionBtn,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        opts.tintedBg && { backgroundColor: opts.color + '14', borderColor: opts.color + '66' },
        !opts.tintedBg && opts.color !== colors.text && { borderColor: opts.color + '66' },
      ]}
      onPress={opts.onPress}
      disabled={actionBusy}
      activeOpacity={0.7}
    >
      <IconSymbol
        ios_icon_name={opts.iosIcon as any}
        android_material_icon_name={opts.androidIcon as any}
        size={13}
        color={opts.color}
      />
      <Text style={[styles.actionBtnText, { color: opts.color }]} numberOfLines={1}>
        {opts.label}
      </Text>
    </TouchableOpacity>
  );

  const renderDetailCard = (exam: ExamSummary) => {
    const visual = QUIZ_VISUALS[exam.exam_type];
    const statusColor = QUIZ_STATUS_COLORS[exam.status];
    const msRemaining = exam.close_at ? new Date(exam.close_at).getTime() - Date.now() : null;
    const urgency = msRemaining != null ? getCountdownUrgency(msRemaining) : null;
    const countdownColor =
      urgency === 'red' ? '#EF4444'
      : urgency === 'amber' ? '#F59E0B'
      : urgency === 'expired' ? colors.textSecondary
      : CONSOLE_COUNTDOWN_GOLD;
    const isLive = exam.status === 'active' || exam.status === 'paused';
    const pct = exam.totalEmployees > 0 ? (exam.completedCount / exam.totalEmployees) * 100 : 0;

    return (
      <GlassCard style={styles.detailCard}>
        <View style={styles.detailTop}>
          <View style={styles.detailInfo}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>
              {t('weekly_quizzes.type_quiz_title', { type: getExamTypeName(exam.exam_type, isSpanish) })}
            </Text>
            <View style={styles.detailSub}>
              <View style={[styles.pill, { backgroundColor: statusColor + '20', borderColor: statusColor + '55' }]}>
                <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.pillText, { color: statusColor }]}>
                  {t(STATUS_LABEL_KEYS[exam.status]).toUpperCase()}
                </Text>
              </View>
              {isLive && msRemaining != null && (
                <Text style={[styles.closesIn, { color: countdownColor }]}>
                  {t('weekly_quizzes.closes_in', { time: formatCountdown(msRemaining, isSpanish) })}
                </Text>
              )}
            </View>
            <View style={styles.statline}>
              <View style={styles.stat}>
                <IconSymbol ios_icon_name="list.bullet" android_material_icon_name="format-list-bulleted" size={11} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {t('weekly_quizzes.question_count_short', { count: exam.questionCount })}
                </Text>
              </View>
              <View style={styles.stat}>
                <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={11} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {exam.time_limit_seconds > 0 ? formatTime(exam.time_limit_seconds) : '∞'}
                </Text>
              </View>
              {exam.defaultBucksValue != null && (
                <View style={styles.stat}>
                  <IconSymbol ios_icon_name="dollarsign.circle" android_material_icon_name="attach-money" size={11} color={visual.accent} />
                  <Text style={[styles.statText, { color: visual.accent }]}>${exam.defaultBucksValue}</Text>
                </View>
              )}
              {isLive && exam.avgPct != null && (
                <View style={styles.stat}>
                  <Text style={[styles.statText, { color: colors.textSecondary }]}>
                    {t('weekly_quizzes.avg_short', { pct: exam.avgPct })}
                  </Text>
                </View>
              )}
            </View>
          </View>
          {isLive && (
            <TouchableOpacity onPress={() => openTracker(exam.exam_type)} activeOpacity={0.7}>
              <ProgressRing
                pct={pct}
                size={54}
                stroke={5}
                color={visual.accent}
                trackColor={colors.glassBorder}
              >
                <Text style={[styles.ringLabel, { color: colors.text }]}>
                  {exam.completedCount}/{exam.totalEmployees}
                </Text>
              </ProgressRing>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionGrid}>
          {renderActionButton({
            key: 'edit',
            label: t('weekly_quizzes.open_editor'),
            iosIcon: 'pencil', androidIcon: 'edit',
            color: visual.accent, tintedBg: true,
            onPress: () => openEditor(exam.exam_type),
          })}
          {exam.status === 'active' &&
            renderActionButton({
              key: 'pause',
              label: t('exam_editor.pause_btn'),
              iosIcon: 'pause.circle', androidIcon: 'pause-circle-outline',
              color: '#F59E0B',
              onPress: () => handlePause(exam),
            })}
          {exam.status === 'paused' &&
            renderActionButton({
              key: 'resume',
              label: t('exam_editor.resume_btn'),
              iosIcon: 'play.circle', androidIcon: 'play-circle-outline',
              color: '#10B981',
              onPress: () => handleResume(exam),
            })}
          {exam.status === 'draft' &&
            renderActionButton({
              key: 'preview',
              label: t('exam_editor.preview_btn'),
              iosIcon: 'eye', androidIcon: 'visibility',
              color: colors.text,
              onPress: () => handlePreview(exam),
            })}
          {exam.status === 'draft'
            ? renderActionButton({
                key: 'activate',
                label: t('exam_editor.activate_btn'),
                iosIcon: 'checkmark.circle', androidIcon: 'check-circle-outline',
                color: '#10B981',
                onPress: () => handleActivate(exam),
              })
            : renderActionButton({
                key: 'close',
                label: t('common.close'),
                iosIcon: 'xmark.circle', androidIcon: 'cancel',
                color: '#EF4444',
                onPress: () => handleClose(exam),
              })}
          {renderActionButton({
            key: 'reset',
            label: t('exam_editor.reset_btn'),
            iosIcon: 'arrow.counterclockwise', androidIcon: 'refresh',
            color: colors.textSecondary,
            onPress: () => handleReset(exam),
          })}
        </View>
      </GlassCard>
    );
  };

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('weekly_quizzes.title')} eyebrow={t('weekly_quizzes.hub_eyebrow')} />
        <PremiumGate
          desc={t('weekly_quizzes.premium_desc')}
          bullets={[t('weekly_quizzes.premium_b1'), t('weekly_quizzes.premium_b2'), t('weekly_quizzes.premium_b3')]}
          footer={t('weekly_quizzes.premium_footer')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('weekly_quizzes.title')} eyebrow={t('weekly_quizzes.hub_eyebrow')} />

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {loading && exams.size === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            <View style={[styles.blurb, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <IconSymbol ios_icon_name="graduationcap.fill" android_material_icon_name="school" size={15} color={colors.primary} />
              <Text style={[styles.blurbText, { color: colors.text }]}>
                {t('weekly_quizzes.manage_blurb')}
              </Text>
            </View>

            <View style={styles.shelf}>
              {EXAM_TYPES.map((examType) => {
                const exam = exams.get(examType) ?? null;
                const icons = EXAM_ROLE_ICONS[examType];
                return (
                  <QuizTile
                    key={examType}
                    label={getExamTypeName(examType, isSpanish)}
                    iosIcon={icons.ios}
                    androidIcon={icons.android}
                    gradient={QUIZ_VISUALS[examType].gradient}
                    ghost={!exam}
                    createLabel={t('weekly_quizzes.create_quiz')}
                    status={
                      exam
                        ? { word: t(STATUS_LABEL_KEYS[exam.status]), color: QUIZ_STATUS_COLORS[exam.status] }
                        : undefined
                    }
                    selected={!!exam && selectedType === examType}
                    onPress={() => handleTilePress(examType)}
                  />
                );
              })}
            </View>

            {selected && renderDetailCard(selected)}
          </>
        )}
      </ScrollView>

      <BottomNavBar activeTab="manage" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  blurb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  blurbText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.body.regular },
  shelf: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
  },
  detailCard: { padding: 14, marginBottom: 10 },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  detailInfo: { flex: 1, minWidth: 0 },
  detailTitle: { fontFamily: fonts.display.semibold, fontSize: 16.5 },
  detailSub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
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
  closesIn: { fontFamily: fonts.mono.semibold, fontSize: 10.5 },
  statline: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 9, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontFamily: fonts.mono.semibold, fontSize: 10 },
  ringLabel: { fontFamily: fonts.mono.semibold, fontSize: 10.5 },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 10,
  },
  actionBtnText: { fontFamily: fonts.body.semibold, fontSize: 12 },
});
