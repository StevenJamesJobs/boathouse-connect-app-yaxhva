/**
 * Quizzes & Exams (employee) — s77 lockdown rebuild on the arcade-shelf
 * grammar (USR·SHELF/SOLO): per-role tiles (Server teal · Bartender navy ·
 * Host violet; live dot+word, done check-scrim) with ONE detail card swapping
 * beneath — and the one-quiz case solves itself: a single eligible quiz
 * stretches its tile full-width with the card already open.
 *
 * All the standing behavior is inherited: eligibility by job title, the
 * offline-outbox flush (a queued submit counts as TAKEN), the $1/N split for
 * legacy quizzes, and the s77 quiz-level default value when the manager set
 * one.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { flushPendingSubmits, getPendingSubmit, pendingExamIds } from '@/utils/exam/pendingSubmits';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { isManagerOrOwner } from '@/utils/roles';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import QuizTile from '@/components/quiz/QuizTile';
import ShineButton from '@/components/quiz/ShineButton';
import { QUIZ_VISUALS, EXAM_ROLE_ICONS, quizRole } from '@/components/quiz/quizVisuals';
import { formatTime, formatCountdown, getCountdownUrgency } from '@/utils/exam/examEngine';
import { getExamTypeName } from '@/utils/exam/questionGenerator';
import { fonts } from '@/constants/fonts';

type ExamType = 'server' | 'bartender' | 'host';

interface ActiveExam {
  id: string;
  time_limit_seconds: number;
  status: string;
  close_at: string | null;
}

interface QuizResultLite {
  correct_count: number;
  total_questions: number;
  bucks_awarded: number;
  exam_id: string;
}

interface QuizEntry {
  examType: ExamType;
  activeExam: ActiveExam | null;
  result: QuizResultLite | null;
  questionCount: number;
  defaultBucksValue: number | null;
}

export function getEligibleQuizTypes(jobTitles: string[] = []): ExamType[] {
  const types: ExamType[] = [];
  const has = (t: string) => jobTitles.includes(t);
  if (has('Server') || has('Lead Server') || has('Busser') || has('Runner')) {
    types.push('server');
  }
  if (has('Bartender')) {
    types.push('bartender');
  }
  if (has('Host')) {
    types.push('host');
  }
  return types;
}

export function hasAnyQuizEligibleRole(jobTitles: string[] = []): boolean {
  return getEligibleQuizTypes(jobTitles).length > 0;
}

/** "$2" whole, "$0.33" split fractions. */
function fmtBucks(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function WeeklyQuizzesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const colors = useThemeColors();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizEntry[]>([]);
  const [selectedType, setSelectedType] = useState<ExamType | null>(null);
  const [, setCountdownTick] = useState(0);

  const fetchQuizzes = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      // Fire-and-forget cleanup of expired exams (auto-close)
      try {
        await supabase.rpc('close_expired_exams_actor', { p_actor_id: user.id });
      } catch {
        // ignore — cleanup is best-effort
      }

      // Replay any offline-queued submissions first, then treat whatever is
      // still queued as TAKEN below (no fresh attempt while a submit is parked).
      await flushPendingSubmits(user.id);
      const pending = await pendingExamIds(user.id);

      const eligibleTypes = getEligibleQuizTypes(user?.jobTitles || []);
      const entries: QuizEntry[] = [];

      for (const examType of eligibleTypes) {
        const { data: examData } = await supabase.rpc('get_exam', {
          p_actor_id: user?.id,
          p_exam_type: examType,
          p_statuses: ['active', 'paused'],
        });

        if (!examData || examData.length === 0) {
          entries.push({ examType, activeExam: null, result: null, questionCount: 0, defaultBucksValue: null });
          continue;
        }

        const exam = examData[0] as ActiveExam;

        const { data: count } = await supabase.rpc('get_exam_question_count', {
          p_actor_id: user?.id,
          p_exam_id: exam.id,
        });

        // Quiz-level default value (s77) — best-effort additive reader.
        let defaultBucksValue: number | null = null;
        try {
          const { data: dv } = await supabase.rpc('get_exam_default_bucks_value', {
            p_actor_id: user.id, p_exam_id: exam.id,
          });
          defaultBucksValue = typeof dv === 'number' ? dv : null;
        } catch {}

        // Existing result? Only a COMPLETED row counts as taken. A
        // started-but-unsubmitted row must still show "Take Quiz" — UNLESS the
        // submission is parked in the offline outbox, in which case the quiz
        // is taken (re-offering it would be the retake cheat).
        let result: QuizResultLite | null = null;
        if (user?.id) {
          const { data: resultData } = await supabase.rpc('get_my_exam_result', {
            p_actor_id: user.id,
            p_exam_id: exam.id,
          });
          if (resultData && resultData.length > 0 && resultData[0].completed_at) {
            result = resultData[0] as QuizResultLite;
          } else if (pending.has(exam.id)) {
            const queued = await getPendingSubmit(user.id, exam.id);
            if (queued) {
              result = {
                exam_id: exam.id,
                correct_count: queued.payload.p_correct_count ?? 0,
                total_questions: queued.payload.p_total_questions ?? 0,
                bucks_awarded: queued.payload.p_bucks_awarded ?? 0,
              };
            }
          }
        }

        entries.push({
          examType,
          activeExam: exam,
          result,
          questionCount: count || 0,
          defaultBucksValue,
        });
      }

      setQuizzes(entries);
      // Open the most pressing card: the untaken active quiz closing soonest,
      // else the first entry.
      setSelectedType((prev) => {
        if (prev && entries.some((e) => e.examType === prev)) return prev;
        const open = entries
          .filter((e) => e.activeExam && e.activeExam.status === 'active' && !e.result)
          .sort((a, b) => {
            const ta = a.activeExam?.close_at ? new Date(a.activeExam.close_at).getTime() : Infinity;
            const tb = b.activeExam?.close_at ? new Date(b.activeExam.close_at).getTime() : Infinity;
            return ta - tb;
          });
        return open[0]?.examType ?? entries[0]?.examType ?? null;
      });
    } catch (err) {
      console.error('Error fetching quizzes:', err);
    }
    setLoading(false);
  }, [user?.id, user?.jobTitles]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  // Countdown tick while the open card shows a close_at.
  const selected = quizzes.find((q) => q.examType === selectedType) ?? null;
  useEffect(() => {
    if (!selected?.activeExam?.close_at || selected.result) return;
    const interval = setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [selected?.activeExam?.close_at, selected?.result]);

  // Multi-quiz reward split: N quizzes → $1/N per correct for legacy quizzes.
  const eligibleQuizCount = Math.max(1, getEligibleQuizTypes(user?.jobTitles || []).length);
  const rewardPerCorrect = 1 / eligibleQuizCount;

  const handleTakeQuiz = (examId: string) => {
    router.push(`/exam-play?examId=${examId}` as any);
  };

  const handleReviewAnswers = (result: QuizResultLite) => {
    router.push(
      `/exam-results?examId=${result.exam_id}&correctCount=${result.correct_count}&totalQuestions=${result.total_questions}&standardCorrect=${result.correct_count}&bonusCorrect=false&bonusBucksValue=0&totalBucks=${result.bucks_awarded}&timeSeconds=0&isTimedOut=false&preview=false` as any
    );
  };

  const noEligibleRoles = !loading && quizzes.length === 0;
  const solo = quizzes.length === 1;

  const renderDetail = (entry: QuizEntry) => {
    const visual = QUIZ_VISUALS[entry.examType];
    const typeName = getExamTypeName(entry.examType, isSpanish);
    const title = t('weekly_quizzes.type_quiz_title', { type: typeName });

    // No active quiz for this role
    if (!entry.activeExam) {
      return (
        <GlassCard style={styles.detail}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>
            {t('weekly_quizzes.no_active_note')}
          </Text>
        </GlassCard>
      );
    }

    // Taken — score + review
    if (entry.result) {
      return (
        <GlassCard style={styles.detail}>
          <View style={styles.detailHead}>
            <View style={[styles.pill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <IconSymbol ios_icon_name="checkmark.seal.fill" android_material_icon_name="verified" size={12} color="#10B981" />
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>
                {t('weekly_quizzes.completed_pill').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{title}</Text>
          <View style={[styles.scoreBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('weekly_quizzes.score_label')}</Text>
            <Text style={[styles.scoreValue, { color: visual.accent }]}>
              {entry.result.correct_count}/{entry.result.total_questions}
            </Text>
          </View>
          <View style={[styles.scoreBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('weekly_quizzes.earned_label')}</Text>
            <Text style={[styles.scoreValue, { color: '#10B981' }]}>
              +${entry.result.bucks_awarded}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.reviewBtn, { backgroundColor: visual.accent + '12', borderColor: visual.accent + '66' }]}
            onPress={() => handleReviewAnswers(entry.result!)}
          >
            <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={14} color={visual.accent} />
            <Text style={[styles.reviewBtnText, { color: visual.accent }]}>
              {t('weekly_quizzes.review_answers')}
            </Text>
          </TouchableOpacity>
        </GlassCard>
      );
    }

    // Paused
    if (entry.activeExam.status === 'paused') {
      return (
        <GlassCard style={styles.detail}>
          <View style={styles.detailHead}>
            <View style={[styles.pill, { backgroundColor: 'rgba(245,158,11,0.13)', borderColor: 'rgba(245,158,11,0.4)' }]}>
              <IconSymbol ios_icon_name="pause.circle.fill" android_material_icon_name="pause-circle-filled" size={12} color="#F59E0B" />
              <Text style={[styles.pillText, { color: '#F59E0B' }]}>
                {t('weekly_quizzes.paused_pill').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>
            {t('weekly_quizzes.paused_note')}
          </Text>
        </GlassCard>
      );
    }

    // Active — take it. The quiz default (or the $1 base) splits across a
    // member's quizzes — the honest per-answer number is the split one.
    const perCorrect = (entry.defaultBucksValue ?? 1) * rewardPerCorrect;
    const msRemaining = entry.activeExam.close_at
      ? new Date(entry.activeExam.close_at).getTime() - Date.now()
      : null;
    const urgency = msRemaining != null ? getCountdownUrgency(msRemaining) : null;
    const countdownColor =
      urgency === 'red' ? '#EF4444' : urgency === 'amber' ? '#F59E0B' : '#F59E0B';

    return (
      <GlassCard style={styles.detail}>
        <View style={styles.detailHead}>
          <View style={[styles.pill, { backgroundColor: 'rgba(16,185,129,0.13)', borderColor: 'rgba(16,185,129,0.4)' }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.pillText, { color: '#10B981' }]}>
              {t('weekly_quizzes.active_pill').toUpperCase()}
            </Text>
          </View>
          {msRemaining != null && (
            <Text style={[styles.closesIn, { color: countdownColor }]}>
              {t('weekly_quizzes.closes_in', { time: formatCountdown(msRemaining, isSpanish) })}
            </Text>
          )}
        </View>
        <Text style={[styles.detailTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.infoRows}>
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="list.bullet" android_material_icon_name="format-list-bulleted" size={13} color={visual.accent} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {t('weekly_quizzes.q_and_limit', {
                count: entry.questionCount,
                time: entry.activeExam.time_limit_seconds > 0
                  ? formatTime(entry.activeExam.time_limit_seconds)
                  : '∞',
              })}
            </Text>
          </View>
          {perCorrect > 0 && (
            <View style={styles.infoRow}>
              <IconSymbol ios_icon_name="dollarsign.circle" android_material_icon_name="attach-money" size={13} color="#10B981" />
              <Text style={[styles.infoText, { color: '#10B981' }]}>
                {t('weekly_quizzes.earn_per_correct', { amount: fmtBucks(perCorrect) })}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="lock.shield" android_material_icon_name="shield" size={13} color={visual.accent} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {t('weekly_quizzes.one_attempt')}
            </Text>
          </View>
        </View>
        <ShineButton
          label={t('weekly_quizzes.take_quiz')}
          gradient={visual.gradient}
          iosIcon="arrow.right"
          androidIcon="arrow-forward"
          onPress={() => handleTakeQuiz(entry.activeExam!.id)}
        />
        {eligibleQuizCount > 1 && perCorrect > 0 && (
          <Text style={[styles.splitNote, { color: colors.textSecondary }]}>
            {t('exam_play.earn_split_note', { count: eligibleQuizCount })}
          </Text>
        )}
      </GlassCard>
    );
  };

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('weekly_quizzes.title')} eyebrow={t('weekly_quizzes.user_eyebrow')} />
        {isManagerOrOwner(user) ? (
          <PremiumGate
            desc={t('weekly_quizzes.premium_desc')}
            bullets={[t('weekly_quizzes.premium_b1'), t('weekly_quizzes.premium_b2'), t('weekly_quizzes.premium_b3')]}
            footer={t('weekly_quizzes.premium_footer')}
          />
        ) : (
          // Employees can't purchase — no upsell, just a friendly nudge.
          <PremiumGate
            title={t('common.feature_locked_title')}
            desc={t('common.feature_locked_desc')}
            footer={t('weekly_quizzes.locked_joke')}
            showButton={false}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('weekly_quizzes.title')} eyebrow={t('weekly_quizzes.user_eyebrow')} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('weekly_quizzes.subtitle')}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : noEligibleRoles ? (
          <GlassCard style={styles.emptyCard}>
            <IconSymbol
              ios_icon_name="doc.questionmark.fill"
              android_material_icon_name="quiz"
              size={44}
              color={colors.primary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('weekly_quizzes.empty_title')}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              {t('weekly_quizzes.empty_desc')}
            </Text>
          </GlassCard>
        ) : (
          <>
            {/* The shelf: 1 quiz = full-width tile, 2–3 shelve side by side. */}
            <View style={styles.shelf}>
              {quizzes.map((entry) => {
                const icons = EXAM_ROLE_ICONS[entry.examType];
                const live = entry.activeExam && entry.activeExam.status === 'active' && !entry.result;
                const paused = entry.activeExam?.status === 'paused' && !entry.result;
                return (
                  <QuizTile
                    key={entry.examType}
                    label={getExamTypeName(entry.examType, isSpanish)}
                    iosIcon={icons.ios}
                    androidIcon={icons.android}
                    gradient={QUIZ_VISUALS[entry.examType].gradient}
                    done={!!entry.result}
                    status={
                      live
                        ? { word: t('weekly_quizzes.active_pill'), color: '#34E0A1' }
                        : paused
                          ? { word: t('weekly_quizzes.paused_pill'), color: '#FFC24D' }
                          : undefined
                    }
                    selected={selectedType === entry.examType && !solo}
                    aspectRatio={solo ? 2.2 : 1}
                    onPress={() =>
                      setSelectedType((prev) =>
                        prev === entry.examType && !solo ? null : entry.examType,
                      )
                    }
                  />
                );
              })}
            </View>

            {selected && renderDetail(selected)}
          </>
        )}
      </ScrollView>
      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  contentContainer: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  subtitle: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  shelf: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  detail: { padding: 15, marginBottom: 12 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  closesIn: { fontFamily: fonts.mono.semibold, fontSize: 10.5 },
  detailTitle: { fontFamily: fonts.display.bold, fontSize: 19, marginBottom: 10 },
  infoRows: { marginBottom: 12, gap: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12 },
  splitNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 10,
  },
  scoreBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 7,
  },
  scoreLabel: { fontFamily: fonts.body.regular, fontSize: 12 },
  scoreValue: { fontFamily: fonts.mono.semibold, fontSize: 14 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 11,
    marginTop: 3,
  },
  reviewBtnText: { fontFamily: fonts.body.semibold, fontSize: 13 },
  emptyNote: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 18 },
  emptyCard: { padding: 28, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 18, marginTop: 14, marginBottom: 6 },
  emptyDesc: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
