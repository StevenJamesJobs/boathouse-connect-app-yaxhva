/**
 * Quiz player — s77 lockdown rebuild on the Picture This! magazine template:
 * a FULL-BLEED hero (the photo, or the role-gradient board with the question
 * set big as typography) with the frosted console strip glued to its top edge
 * carrying the quiz vitals — question count · countdown · Bucks banked — and
 * the glass question panel riding the photo. Answers are the PT adaptive
 * tiles (2×2 grid for short options, rows for long). Correct answers pop the
 * gold GameToast down from the console with the Bucks banked.
 *
 * EVERY anti-cheat surface is inherited unchanged: server-anchored wall-clock
 * timer (start_exam_attempt), background timeout enforcement, back-blocking,
 * the already-completed redirect, and the offline outbox (a queued submit
 * counts as TAKEN). New (s77): the quiz-level default value feeds scoring and
 * the intro copy, and the BONUS ONE-SHOT rule — a multi-quiz employee who
 * already answered a bonus in another live quiz never sees a second one.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  BackHandler,
  AppState,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import {
  ExamQuestion,
  ExamState,
  createExamState,
  startExam,
  selectOption,
  submitAnswer,
  handleTimeout,
  calculateResults,
  getCurrentQuestion,
  formatTime,
  formatCountdown,
  getCountdownUrgency,
} from '@/utils/exam/examEngine';
import { getExamTypeName, type ExamType } from '@/utils/exam/questionGenerator';
import { getEligibleQuizTypes } from '@/app/weekly-quizzes';
import { refreshAllUnreadQuizReward } from '@/hooks/useUnreadQuizReward';
import { refreshAllUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { enqueuePendingSubmit, getPendingSubmit, removePendingSubmit } from '@/utils/exam/pendingSubmits';
import GameToast from '@/components/game/GameToast';
import GameConfetti from '@/components/game/GameConfetti';
import MoneyRain from '@/components/quiz/MoneyRain';
import ShineButton from '@/components/quiz/ShineButton';
import { questionCategoryLabel } from '@/utils/exam/questionCategory';
import { QUIZ_VISUALS, quizRole, CONSOLE_COUNTDOWN_GOLD } from '@/components/quiz/quizVisuals';
import { fonts } from '@/constants/fonts';

type Phase = 'loading' | 'intro' | 'playing' | 'feedback' | 'completed';

// The adaptive-answers rule: every option this short → 2×2 tiles; anything
// longer falls back to full-width rows. Tighter than PT's 28 — quiz answers
// (ingredients, wine names) run long, and a truncated answer is unanswerable
// (Steve's smoke catch).
const GRID_MAX_CHARS = 16;

/** "$2" for whole amounts, "$0.33" for split fractions. */
function fmtBucks(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function ExamPlayScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const { user, refreshUser } = useAuth();
  const { organizationId, organization } = useOrganization();
  const currencyName = organization.reward_currency_name;
  const params = useLocalSearchParams<{ examId: string; preview: string }>();
  const examId = params.examId || '';
  const isPreview = params.preview === 'true';

  const [phase, setPhase] = useState<Phase>('loading');
  const [examState, setExamState] = useState<ExamState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300);
  const [examType, setExamType] = useState('');
  const [closeAt, setCloseAt] = useState<Date | null>(null);
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  const [defaultBucksValue, setDefaultBucksValue] = useState<number | null>(null);
  const [, setCountdownTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [consoleH, setConsoleH] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Multi-quiz reward split: a user eligible for N quizzes earns $1/N per
  // correct standard question UNLESS the manager set a quiz-level default
  // (which, like per-question values, pays in full). Bonus always pays full.
  const eligibleQuizCount = Math.max(1, getEligibleQuizTypes(user?.jobTitles || []).length);
  const rewardPerCorrect = 1 / eligibleQuizCount;
  // The quiz default (or the $1 base) splits across a member's quizzes —
  // the split story lives on the editor's Rewards line (Steve's smoke ruling).
  const effectivePerCorrect = (defaultBucksValue ?? 1) * rewardPerCorrect;

  const role = quizRole(examType);
  const visual = QUIZ_VISUALS[role];

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const examStateRef = useRef<ExamState | null>(null);
  const examStartedAtRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    examStateRef.current = examState;
  }, [examState]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Countdown tick for close_at display on the intro screen
  useEffect(() => {
    if (!closeAt || phase !== 'intro') return;
    const interval = setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [closeAt, phase]);

  // Block back navigation during an active quiz (Android hardware back;
  // the iOS gesture is blocked in _layout.tsx)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'playing' || phase === 'feedback') {
        return true; // Block back
      }
      return false; // Allow back during loading, intro, completed
    });
    return () => backHandler.remove();
  }, [phase]);

  // AppState listener: recalculate the timer when the app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && examStartedAtRef.current && timeLimitSeconds > 0) {
        const currentPhase = phaseRef.current;
        if (currentPhase === 'playing' || currentPhase === 'feedback') {
          const elapsed = Math.floor((Date.now() - examStartedAtRef.current) / 1000);
          const remaining = timeLimitSeconds - elapsed;

          if (remaining <= 0) {
            // Time expired while the app was in the background
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeRemaining(0);
            const currentState = examStateRef.current;
            if (currentState && currentState.phase !== 'completed') {
              const timedOutState = handleTimeout(currentState);
              setExamState(timedOutState);
              setPhase('completed');
              if (!isPreview) {
                submitResults(timedOutState);
              }
            }
          } else {
            setTimeRemaining(remaining);
          }
        }
      }
    });
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLimitSeconds, isPreview]);

  useEffect(() => {
    loadExam();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The s77 bonus one-shot: if this member is eligible for MULTIPLE quizzes
  // and has already taken (or has queued offline) another live quiz that
  // contained a bonus question, this quiz's bonus never appears for them —
  // answered anywhere, right or wrong, is answered everywhere.
  const bonusAlreadySeen = async (thisExamType: string): Promise<boolean> => {
    if (!user?.id) return false;
    const otherTypes = getEligibleQuizTypes(user.jobTitles || []).filter(
      (tp) => tp !== thisExamType,
    );
    for (const otherType of otherTypes) {
      try {
        const { data: examRows } = await supabase.rpc('get_exam', {
          p_actor_id: user.id,
          p_exam_type: otherType,
          p_statuses: ['active', 'paused'],
        });
        const other = examRows?.[0];
        if (!other) continue;

        const { data: resultRows } = await supabase.rpc('get_my_exam_result', {
          p_actor_id: user.id,
          p_exam_id: other.id,
        });
        const taken =
          (resultRows && resultRows.length > 0 && resultRows[0].completed_at) ||
          (await getPendingSubmit(user.id, other.id)) != null;
        if (!taken) continue;

        const { data: otherQs } = await supabase.rpc('get_exam_questions', {
          p_actor_id: user.id,
          p_exam_id: other.id,
        });
        if (otherQs && otherQs.some((q: any) => q.is_bonus)) return true;
      } catch {
        // Best-effort: a failed check never blocks the quiz itself.
      }
    }
    return false;
  };

  const loadExam = async () => {
    if (!user?.id) {
      router.back();
      return;
    }
    try {
      const { data: examRows, error: examError } = await supabase.rpc('get_exam', {
        p_actor_id: user?.id,
        p_exam_id: examId,
      });
      const examData = examRows?.[0];

      if (examError || !examData) {
        console.error('Failed to load exam:', examError);
        router.back();
        return;
      }

      setExamType(examData.exam_type);
      setTimeLimitSeconds(examData.time_limit_seconds);
      setTimeRemaining(examData.time_limit_seconds);
      if (examData.close_at) {
        setCloseAt(new Date(examData.close_at));
      }
      // rewards_enabled defaults to true if the column is missing (older quizzes)
      setRewardsEnabled(examData.rewards_enabled !== false);

      // Quiz-level default value (s77) — additive reader, best-effort.
      try {
        const { data: dv } = await supabase.rpc('get_exam_default_bucks_value', {
          p_actor_id: user.id, p_exam_id: examId,
        });
        setDefaultBucksValue(typeof dv === 'number' ? dv : null);
      } catch {
        setDefaultBucksValue(null);
      }

      // Anti-cheat: detect already-completed / already-queued attempts
      if (!isPreview && user?.id) {
        const { data: existingResults } = await supabase.rpc('get_my_exam_result', {
          p_actor_id: user.id,
          p_exam_id: examId,
        });
        const existingResult = existingResults?.[0];

        if (existingResult?.completed_at) {
          Alert.alert(
            t('exam_play.done_title'),
            t('exam_play.done_body'),
            [{ text: t('common.ok'), onPress: () => router.back() }]
          );
          return;
        }

        // A queued offline submission also counts as taken — replaying the
        // quiz with already-revealed answers is the retake loophole this closes.
        if (await getPendingSubmit(user.id, examId)) {
          Alert.alert(
            t('exam_play.done_title'),
            t('exam_play.offline_saved_body'),
            [{ text: t('common.ok'), onPress: () => router.back() }]
          );
          return;
        }
      }

      const { data: questionsData, error: questionsError } = await supabase.rpc('get_exam_questions', {
        p_actor_id: user?.id,
        p_exam_id: examId,
      });

      if (questionsError || !questionsData || questionsData.length === 0) {
        console.error('Failed to load questions:', questionsError);
        router.back();
        return;
      }

      let playQuestions = questionsData as ExamQuestion[];
      if (!isPreview && playQuestions.some((q) => q.is_bonus)) {
        if (await bonusAlreadySeen(examData.exam_type)) {
          playQuestions = playQuestions.filter((q) => !q.is_bonus);
        }
      }
      if (playQuestions.length === 0) {
        router.back();
        return;
      }

      const state = createExamState(playQuestions);
      setExamState({ ...state, phase: 'intro' });
      setPhase('intro');
    } catch (err) {
      console.error('Load exam error:', err);
      router.back();
    }
  };

  // Start timer — wall-clock time prevents the backgrounding exploit
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      if (!examStartedAtRef.current) return;
      const elapsed = Math.floor((Date.now() - examStartedAtRef.current) / 1000);
      const remaining = timeLimitSeconds - elapsed;

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeRemaining(0);
        const currentState = examStateRef.current;
        if (currentState && currentState.phase !== 'completed') {
          const timedOutState = handleTimeout(currentState);
          setExamState(timedOutState);
          setPhase('completed');
          if (!isPreview) {
            submitResults(timedOutState);
          }
        }
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);
  };

  // Handle start — registers server-side started_at to prevent force-close exploit
  const handleStart = async () => {
    if (!examState) return;

    if (!isPreview && user?.id) {
      try {
        const { data, error } = await supabase.rpc('start_exam_attempt', {
          p_exam_id: examId,
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
        });

        if (error) {
          console.error('start_exam_attempt error:', error);
          Alert.alert(t('common.error'), t('exam_play.err_start_body'));
          return;
        }

        const attempt = Array.isArray(data) ? data[0] : data;

        if (attempt?.is_completed) {
          Alert.alert(
            t('exam_play.done_title'),
            t('exam_play.done_body'),
            [{ text: t('common.ok'), onPress: () => router.back() }]
          );
          return;
        }

        // Wall-clock start from the server timestamp
        if (attempt?.started_at) {
          const serverStartMs = new Date(attempt.started_at).getTime();

          // Resumed attempt (started more than 5 seconds ago)?
          const elapsed = Math.floor((Date.now() - serverStartMs) / 1000);
          if (elapsed > 5 && timeLimitSeconds > 0) {
            const remaining = timeLimitSeconds - elapsed;
            if (remaining <= 0) {
              // Time expired while they were away — auto-submit as timed out
              const timedOutState = handleTimeout(examState);
              setExamState(timedOutState);
              setPhase('completed');
              submitResults(timedOutState);
              return;
            }
            setTimeRemaining(remaining);
          }

          examStartedAtRef.current = serverStartMs;
        } else {
          examStartedAtRef.current = Date.now();
        }
      } catch (err) {
        console.error('start_exam_attempt exception:', err);
        Alert.alert(t('common.error'), t('exam_play.err_start_body'));
        return;
      }
    } else {
      // Preview mode — local time only
      examStartedAtRef.current = Date.now();
    }

    const started = startExam(examState);
    setExamState(started);
    setPhase('playing');
    if (timeLimitSeconds > 0) {
      startTimer();
    }
  };

  const handleSelectOption = (option: 'A' | 'B' | 'C' | 'D') => {
    if (!examState || phase !== 'playing') return;
    const updated = selectOption(examState, option);
    setExamState(updated);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  const bucksForQuestion = (q: ExamQuestion): number => {
    if (!rewardsEnabled) return 0;
    if (q.is_bonus) return q.bonus_bucks_value || 0;
    // Per-question overrides pay full; the fallback carries the split.
    return typeof q.bucks_value === 'number' ? q.bucks_value : effectivePerCorrect;
  };

  const handleNext = () => {
    if (!examState || !examState.selectedOption) return;

    const currentQ = getCurrentQuestion(examState);
    if (!currentQ) return;

    const isCorrect = examState.selectedOption === currentQ.correct_option;
    setPhase('feedback');

    try {
      Haptics.notificationAsync(
        isCorrect ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {}

    // The gold toast pops from the console when a correct answer banks Bucks.
    if (isCorrect && !isPreview) {
      const earned = bucksForQuestion(currentQ);
      if (earned > 0) {
        setToast(t('exam_play.toast_banked', { amount: fmtBucks(earned) }));
      }
    }

    // After the feedback beat, advance
    setTimeout(() => {
      const submitted = submitAnswer(examState);
      setExamState(submitted);

      if (submitted.phase === 'completed') {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase('completed');
        if (!isPreview) {
          submitResults(submitted);
        }
      } else {
        setPhase('playing');
      }
    }, 800);
  };

  const submitResults = async (state: ExamState) => {
    if (!user?.id || submitting) return;
    setSubmitting(true);

    const results = calculateResults(state, rewardPerCorrect, rewardsEnabled, defaultBucksValue);
    const submitArgs = {
      p_exam_id: examId,
      p_user_id: user.id,
      p_answers: JSON.stringify(state.answers),
      p_correct_count: results.correctCount,
      p_total_questions: results.totalQuestions,
      p_bucks_awarded: results.totalBucksAwarded,
      p_time_seconds: results.timeSeconds,
      p_is_timed_out: state.isTimedOut,
      p_organization_id: organizationId ?? undefined,
    };

    try {
      const { error } = await supabase.rpc('submit_exam_and_award_bucks', submitArgs);
      // supabase-js resolves RPC failures into `error` (no throw) — surface it.
      if (error) throw error;

      // A retry/flush may have queued this attempt earlier — clear it.
      removePendingSubmit(user.id, examId);
      // Refresh user to update the reward-currency balance
      await refreshUser();
      // Light up the Rewards-tab badge — a quiz reward is now waiting.
      refreshAllUnreadQuizReward();
      // ...and clear the unread-QUIZ badge so the tab bars / Tools tile /
      // BadgeSyncer counts don't sit stale until their next 30s poll.
      refreshAllUnreadQuizzes();
    } catch (err) {
      console.error('Submit results error:', err);
      // Park the exact payload in the offline outbox: the quiz now counts as
      // TAKEN and these first-attempt answers auto-submit on reconnect —
      // closing the offline retake loophole.
      await enqueuePendingSubmit(user.id, examId, submitArgs);
      Alert.alert(
        t('exam_play.offline_title'),
        t('exam_play.offline_body'),
        [
          { text: t('common.retry'), onPress: () => submitResults(state) },
          { text: t('common.ok'), style: 'cancel' },
        ],
      );
    }
    setSubmitting(false);
  };

  const handleViewResults = () => {
    if (!examState) return;
    const results = calculateResults(examState, rewardPerCorrect, rewardsEnabled, defaultBucksValue);
    // In preview mode there is no exam_results row to read, so the in-memory
    // answers ride the URL for exam-results' per-question badges.
    const previewAnswersParam = isPreview
      ? `&previewAnswers=${encodeURIComponent(JSON.stringify(examState.answers))}`
      : '';
    router.replace(
      `/exam-results?examId=${examId}&correctCount=${results.correctCount}&totalQuestions=${results.totalQuestions}&standardCorrect=${results.standardCorrect}&bonusCorrect=${results.bonusCorrect}&bonusBucksValue=${results.bonusBucksValue}&totalBucks=${results.totalBucksAwarded}&timeSeconds=${results.timeSeconds}&isTimedOut=${examState.isTimedOut}&preview=${isPreview}${previewAnswersParam}`
    );
  };

  // Running banked total for the console chip.
  const bankedSoFar = useMemo(() => {
    if (!examState || isPreview || !rewardsEnabled) return 0;
    let sum = 0;
    examState.answers.forEach((answer, index) => {
      const q = examState.questions[index];
      if (q && answer.is_correct) sum += bucksForQuestion(q);
    });
    return sum;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examState?.answers.length, rewardsEnabled, defaultBucksValue]);

  if (phase === 'loading' || !examState) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={visual.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const currentQuestion = getCurrentQuestion(examState);
  const isTimeLow = timeLimitSeconds > 0 && timeRemaining <= 30;
  const typeName = getExamTypeName((examType || 'server') as ExamType, isSpanish);
  const quizTitle = t('weekly_quizzes.type_quiz_title', { type: typeName });

  // ── INTRO — the threshold (START·FINAL) ──────────────────────────────────
  if (phase === 'intro') {
    const msRemaining = closeAt ? closeAt.getTime() - Date.now() : null;
    const urgency = msRemaining != null ? getCountdownUrgency(msRemaining) : null;
    const closesColor =
      urgency === 'red' ? '#EF4444' : urgency === 'amber' ? '#F59E0B' : colors.text;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.introContent} showsVerticalScrollIndicator={false}>
          {isPreview && (
            <View style={styles.previewPill}>
              <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={11} color="#F59E0B" />
              <Text style={styles.previewPillText}>{t('exam_play.preview_pill').toUpperCase()}</Text>
            </View>
          )}

          <View style={[styles.startCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.startRing}>
              <LinearGradient
                colors={[visual.gradient[0], visual.gradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <IconSymbol ios_icon_name="graduationcap.fill" android_material_icon_name="school" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.startTitle, { color: colors.text }]}>{quizTitle}</Text>
            <Text style={[styles.startSub, { color: colors.textSecondary }]}>
              {t('exam_play.q_count', { count: examState.questions.length }).toUpperCase()}
              {' · '}
              {(timeLimitSeconds > 0
                ? t('exam_play.limit_chip', { time: formatTime(timeLimitSeconds) })
                : t('exam_play.no_limit_chip')
              ).toUpperCase()}
            </Text>

            {msRemaining != null && (
              <View style={[styles.infoRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <IconSymbol ios_icon_name="hourglass" android_material_icon_name="hourglass-empty" size={14} color={closesColor} />
                <Text style={[styles.infoRowText, { color: closesColor }]}>
                  {t('exam_play.closes_line', { time: formatCountdown(msRemaining, isSpanish) })}
                </Text>
              </View>
            )}

            {rewardsEnabled && effectivePerCorrect > 0 && (
              <View style={[styles.infoRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={14} color="#10B981" />
                <Text style={[styles.infoRowText, { color: colors.text }]}>
                  {t('exam_play.earn_line', { amount: fmtBucks(effectivePerCorrect), currency: currencyName })}
                </Text>
              </View>
            )}

            {eligibleQuizCount > 1 && rewardsEnabled && effectivePerCorrect > 0 && (
              <Text style={[styles.splitNote, { color: colors.textSecondary }]}>
                {t('exam_play.earn_split_note', { count: eligibleQuizCount })}
              </Text>
            )}

            <View style={[styles.rules, { borderTopColor: colors.hairline }]}>
              <View style={styles.rule}>
                <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={13} color={visual.accent} />
                <Text style={[styles.ruleText, { color: colors.textSecondary }]}>
                  {timeLimitSeconds > 0 ? t('exam_play.rule_one_way_timed') : t('exam_play.rule_one_way')}
                </Text>
              </View>
              <View style={styles.rule}>
                <IconSymbol ios_icon_name="lock.shield" android_material_icon_name="shield" size={13} color={visual.accent} />
                <Text style={[styles.ruleText, { color: colors.textSecondary }]}>
                  {t('exam_play.rule_privacy')}
                </Text>
              </View>
            </View>
          </View>

          <ShineButton
            label={t('exam_play.start_btn')}
            gradient={visual.gradient}
            iosIcon="arrow.right"
            androidIcon="arrow-forward"
            onPress={handleStart}
          />
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('exam_play.cancel_link')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── COMPLETED (brief, before results) ────────────────────────────────────
  if (phase === 'completed') {
    const results = calculateResults(examState, rewardPerCorrect, rewardsEnabled, defaultBucksValue);
    // The first thing they see after finishing earns the celebration too
    // (Steve's smoke round) — same locked rules as the results screen:
    // ≥$1 banked → money rain; otherwise confetti above 50%.
    const donePct = results.totalQuestions > 0
      ? Math.round((results.correctCount / results.totalQuestions) * 100)
      : 0;
    const doneRained = !isPreview && results.totalBucksAwarded >= 1;
    const doneConfetti = !doneRained && donePct > 50;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {doneRained && <MoneyRain />}
        {doneConfetti && (
          <GameConfetti visual={{ accent: visual.accent, gradient: visual.gradient }} count={70} />
        )}
        <View style={styles.completedContent}>
          {examState.isTimedOut && (
            <View style={styles.timeoutBanner}>
              <IconSymbol ios_icon_name="clock.badge.exclamationmark.fill" android_material_icon_name="timer-off" size={20} color="#FFF" />
              <Text style={styles.timeoutBannerText}>{t('exam_play.times_up')}</Text>
            </View>
          )}

          <View style={[styles.completedCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={[styles.completedTitle, { color: colors.text }]}>{t('exam_play.completed_title')}</Text>
            <View style={[styles.scoreCircle, { borderColor: visual.accent }]}>
              <Text style={[styles.scoreNumber, { color: visual.accent }]}>
                {results.correctCount}/{results.totalQuestions}
              </Text>
            </View>
            {!isPreview && results.totalBucksAwarded > 0 && (
              <View style={styles.bucksEarned}>
                <Text style={styles.bucksEarnedText}>+${results.totalBucksAwarded} {currencyName}</Text>
              </View>
            )}
            {submitting && (
              <ActivityIndicator size="small" color={visual.accent} style={{ marginTop: 12 }} />
            )}
          </View>

          <ShineButton
            label={t('exam_play.view_results')}
            gradient={visual.gradient}
            disabled={submitting}
            onPress={handleViewResults}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── PLAYING / FEEDBACK — the magazine ────────────────────────────────────
  const hasPhoto = !!currentQuestion?.question_image_url;
  const useGrid = !!currentQuestion &&
    (['A', 'B', 'C', 'D'] as const).every((letter) => {
      const key = `option_${letter.toLowerCase()}` as keyof ExamQuestion;
      const esKey = `${key}_es` as keyof ExamQuestion;
      const txt = (isSpanish && (currentQuestion[esKey] as string | null)) || (currentQuestion[key] as string);
      return (txt ?? '').length <= GRID_MAX_CHARS;
    });
  const questionText = currentQuestion
    ? (isSpanish && currentQuestion.question_text_es) || currentQuestion.question_text
    : '';
  const boardColors = visual.board[resolvedMode];
  const boardInk = visual.boardInk[resolvedMode];
  // The category chip on the hero (Steve's smoke round) — bonus questions
  // already wear the gold pill, so they skip the chip.
  const catLabel = currentQuestion && !currentQuestion.is_bonus
    ? questionCategoryLabel(currentQuestion, t)
    : null;

  const renderAnswer = (letter: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQuestion) return null;
    const key = `option_${letter.toLowerCase()}` as keyof ExamQuestion;
    const esKey = `${key}_es` as keyof ExamQuestion;
    const optionText =
      (isSpanish && (currentQuestion[esKey] as string | null)) ||
      (currentQuestion[key] as string);
    const isSelected = examState.selectedOption === letter;
    const showFeedback = phase === 'feedback';
    const isCorrectOption = letter === currentQuestion.correct_option;

    let borderColor = colors.surfaceBorder;
    let bg: string | undefined;
    let textColor = colors.text;
    let letterColor = visual.accent;
    let dim = false;

    if (showFeedback) {
      if (isCorrectOption) {
        borderColor = '#10B981';
        bg = 'rgba(16,185,129,0.11)';
        textColor = '#10B981';
        letterColor = '#10B981';
      } else if (isSelected) {
        borderColor = '#EF4444';
        bg = 'rgba(239,68,68,0.10)';
        textColor = '#EF4444';
        letterColor = '#EF4444';
      } else {
        dim = true;
      }
    } else if (isSelected) {
      borderColor = visual.accent;
      bg = visual.accent + '14';
      textColor = visual.accent;
    }

    return (
      <TouchableOpacity
        key={letter}
        style={[
          useGrid ? styles.ansTile : styles.ansRow,
          { backgroundColor: bg ?? colors.surface, borderColor },
          dim && { opacity: 0.5 },
        ]}
        onPress={() => handleSelectOption(letter)}
        disabled={phase === 'feedback'}
        activeOpacity={0.75}
      >
        <View style={[styles.letterChip, { backgroundColor: letterColor + '22' }]}>
          <Text style={[styles.letterChipText, { color: letterColor }]}>{letter}</Text>
        </View>
        <Text
          style={[
            useGrid ? styles.ansTileText : styles.ansRowText,
            { color: textColor },
          ]}
          numberOfLines={useGrid ? 3 : undefined}
        >
          {optionText}
        </Text>
        {showFeedback && isCorrectOption && (
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={19} color="#10B981" style={useGrid ? styles.tileFbIcon : undefined} />
        )}
        {showFeedback && isSelected && !isCorrectOption && (
          <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={19} color="#EF4444" style={useGrid ? styles.tileFbIcon : undefined} />
        )}
      </TouchableOpacity>
    );
  };

  const consoleStrip = (
    <View style={styles.ovcon} onLayout={(e) => setConsoleH(e.nativeEvent.layout.height)}>
      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: visual.console[0] + '6E' }]} />
      <View style={styles.ovRow}>
        <Text style={styles.ovStat}>
          Q{examState.currentIndex + 1}
          <Text style={styles.ovStatSmall}>/{examState.questions.length}</Text>
        </Text>
        {timeLimitSeconds > 0 ? (
          <View style={styles.ovTimer}>
            <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={13} color={isTimeLow ? '#FFB4B4' : 'rgba(255,255,255,0.8)'} />
            <Text style={[styles.ovTimerText, isTimeLow && { color: '#FFB4B4' }]}>
              {formatTime(timeRemaining)}
            </Text>
          </View>
        ) : (
          <View style={styles.ovTimer}>
            <IconSymbol ios_icon_name="infinity" android_material_icon_name="all-inclusive" size={15} color="rgba(255,255,255,0.8)" />
          </View>
        )}
        {!isPreview && rewardsEnabled ? (
          <Text style={styles.ovStat}>
            <Text style={styles.ovStatSmall}>$ </Text>
            {bankedSoFar % 1 === 0 ? bankedSoFar : bankedSoFar.toFixed(2)}
          </Text>
        ) : (
          <View style={styles.ovStatSpacer} />
        )}
      </View>
      <View style={styles.ovMeter}>
        <LinearGradient
          colors={[CONSOLE_COUNTDOWN_GOLD, '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.ovMeterFill, { width: `${(examState.currentIndex / examState.questions.length) * 100}%` }]}
        />
        {[25, 50, 75].map((pct) => (
          <View key={pct} style={[styles.ovMeterTick, { left: `${pct}%` }]} />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Slim header — deliberately NO back control: a live quiz is locked in. */}
      <View style={styles.playHeader}>
        <View style={styles.playHeaderSpacer} />
        <View style={styles.playHeaderMid}>
          <Text style={[styles.playEyebrow, { color: colors.tint }]}>
            {t('weekly_quizzes.title').toUpperCase()}
          </Text>
          <Text style={[styles.playTitle, { color: colors.text }]} numberOfLines={1}>
            {quizTitle}
          </Text>
        </View>
        <View style={[styles.shieldChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="lock.shield" android_material_icon_name="shield" size={15} color={visual.accent} />
        </View>
      </View>

      {isPreview && (
        <View style={styles.previewStrip}>
          <Text style={styles.previewStripText}>{t('exam_play.preview_pill').toUpperCase()}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.playContent} showsVerticalScrollIndicator={false}>
        {currentQuestion && (
          <>
            {/* ── The full-bleed hero (PT geometry) ── */}
            <View style={[styles.hero, hasPhoto ? styles.heroPhoto : styles.heroBoard]}>
              {hasPhoto ? (
                <StorageImage
                  source={{ uri: currentQuestion.question_image_url! }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={[boardColors[0], boardColors[1], boardColors[2]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}

              {consoleStrip}

              {/* The gold toast pops down from the console. */}
              <View style={[styles.toastAnchor, { top: consoleH + 8 }]}>
                <GameToast message={toast} onDone={() => setToast(null)} />
              </View>

              {hasPhoto ? (
                <View style={styles.qPanel}>
                  <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,14,16,0.38)' }]} />
                  {catLabel && (
                    <View style={styles.qPanelChip}>
                      <Text style={styles.qPanelChipText}>{catLabel}</Text>
                    </View>
                  )}
                  <Text style={styles.qPanelText}>{questionText}</Text>
                </View>
              ) : (
                <View style={styles.heroQ} pointerEvents="none">
                  {catLabel && (
                    <View style={[styles.heroChip, { borderColor: boardInk + '59' }]}>
                      <Text style={[styles.heroChipText, { color: boardInk }]}>{catLabel}</Text>
                    </View>
                  )}
                  <Text style={[styles.heroQText, { color: boardInk }]}>{questionText}</Text>
                  {currentQuestion.is_bonus && (
                    <View style={styles.bonusPill}>
                      <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={11} color="#F59E0B" />
                      <Text style={styles.bonusPillText}>
                        {t('exam_play.bonus_chip', { amount: currentQuestion.bonus_bucks_value ?? 0 })}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {hasPhoto && currentQuestion.is_bonus && (
                <View style={[styles.bonusPill, styles.bonusPillOverPhoto]}>
                  <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={11} color="#F59E0B" />
                  <Text style={styles.bonusPillText}>
                    {t('exam_play.bonus_chip', { amount: currentQuestion.bonus_bucks_value ?? 0 })}
                  </Text>
                </View>
              )}
            </View>

            {/* ── Answers — deterministic 2×2 pairs, or full-width rows ── */}
            <View style={styles.answers}>
              {useGrid ? (
                <>
                  <View style={styles.ansPair}>
                    {renderAnswer('A')}
                    {renderAnswer('B')}
                  </View>
                  <View style={styles.ansPair}>
                    {renderAnswer('C')}
                    {renderAnswer('D')}
                  </View>
                </>
              ) : (
                (['A', 'B', 'C', 'D'] as const).map(renderAnswer)
              )}

              {phase === 'playing' && (
                <TouchableOpacity
                  style={[
                    styles.nextBtn,
                    examState.selectedOption
                      ? { backgroundColor: visual.accent }
                      : { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
                  ]}
                  onPress={handleNext}
                  disabled={!examState.selectedOption}
                >
                  <Text style={[styles.nextBtnText, { color: examState.selectedOption ? '#FFFFFF' : colors.textSecondary }]}>
                    {examState.currentIndex >= examState.questions.length - 1
                      ? t('exam_play.submit')
                      : t('exam_play.next')}
                  </Text>
                  <IconSymbol
                    ios_icon_name="arrow.right"
                    android_material_icon_name="arrow-forward"
                    size={18}
                    color={examState.selectedOption ? '#FFFFFF' : colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Intro / threshold ──
  introContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  previewPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 5,
    marginBottom: 12,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
  },
  previewPillText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, color: '#F59E0B' },
  startCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  startRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  startTitle: { fontFamily: fonts.display.bold, fontSize: 23, textAlign: 'center' },
  startSub: { fontFamily: fonts.mono.semibold, fontSize: 10.5, letterSpacing: 0.6, marginTop: 5, marginBottom: 16, textAlign: 'center' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    width: '100%',
    marginBottom: 6,
  },
  infoRowText: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12.5 },
  splitNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 6,
  },
  rules: { width: '100%', borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  cancelLink: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: fonts.body.regular, fontSize: 13.5 },

  // ── Play header ──
  playHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
  },
  playHeaderSpacer: { width: 38 },
  playHeaderMid: { flex: 1, alignItems: 'center' },
  playEyebrow: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.6 },
  playTitle: { fontFamily: fonts.display.bold, fontSize: 19, marginTop: 1 },
  shieldChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStrip: {
    alignItems: 'center',
    paddingVertical: 5,
    backgroundColor: '#F59E0B',
  },
  previewStripText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1, color: '#FFFFFF' },
  playContent: { paddingBottom: 28 },

  // ── Hero (full-bleed, PT geometry: no side margins, console on top edge) ──
  hero: { overflow: 'hidden', marginBottom: 14 },
  heroPhoto: { aspectRatio: 0.96, backgroundColor: '#241A14' },
  heroBoard: { aspectRatio: 1.25 },
  ovcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  ovRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ovStat: {
    fontFamily: fonts.mono.semibold,
    fontSize: 14,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    minWidth: 52,
  },
  ovStatSmall: { fontSize: 9.5, color: 'rgba(255,255,255,0.6)' },
  ovStatSpacer: { minWidth: 52 },
  ovTimer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ovTimerText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 19,
    letterSpacing: 0.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  ovMeter: {
    marginTop: 9,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'visible',
  },
  ovMeterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  ovMeterTick: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 8,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  toastAnchor: { position: 'absolute', left: 0, right: 0, zIndex: 6, alignItems: 'center' },

  // Photo question panel (fixed-dark glass over the image — literals by design)
  qPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    zIndex: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    overflow: 'hidden',
  },
  qPanelText: { fontFamily: fonts.body.semibold, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  qPanelChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  qPanelChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  heroChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    marginBottom: 9,
    borderWidth: 1,
  },
  heroChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    letterSpacing: 0.9,
  },

  // No-photo: the question IS the hero
  heroQ: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '46%',
    transform: [{ translateY: -30 }],
    zIndex: 3,
  },
  heroQText: {
    fontFamily: fonts.display.bold,
    fontSize: 23,
    lineHeight: 29,
  },
  bonusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
  },
  bonusPillOverPhoto: {
    position: 'absolute',
    left: 14,
    bottom: 72,
    zIndex: 4,
    backgroundColor: 'rgba(16,14,20,0.6)',
    marginTop: 0,
  },
  bonusPillText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.7, color: '#F59E0B' },

  // ── Answers ──
  answers: { paddingHorizontal: 16 },
  ansPair: { flexDirection: 'row', gap: 9, marginBottom: 9 },
  ansTile: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 1.5,
    padding: 11,
    minHeight: 76,
    gap: 7,
  },
  ansTileText: { fontFamily: fonts.body.semibold, fontSize: 12.5, lineHeight: 16 },
  tileFbIcon: { position: 'absolute', top: 8, right: 8 },
  ansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 9,
  },
  ansRowText: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 13.5, lineHeight: 18 },
  letterChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterChipText: { fontFamily: fonts.mono.semibold, fontSize: 12 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    paddingVertical: 15,
    marginTop: 16,
  },
  nextBtnText: { fontFamily: fonts.body.semibold, fontSize: 15.5 },

  // ── Completed ──
  completedContent: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  timeoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: '#EF4444',
  },
  timeoutBannerText: { fontFamily: fonts.body.semibold, fontSize: 15, color: '#FFFFFF' },
  completedCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  completedTitle: { fontFamily: fonts.display.bold, fontSize: 23, marginBottom: 20 },
  scoreCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  scoreNumber: { fontFamily: fonts.mono.semibold, fontSize: 29 },
  bucksEarned: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(16,185,129,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.36)',
  },
  bucksEarnedText: { fontFamily: fonts.body.semibold, fontSize: 18, color: '#10B981' },
});
