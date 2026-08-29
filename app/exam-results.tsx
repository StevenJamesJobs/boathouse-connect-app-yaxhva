/**
 * Quiz results — s77 lockdown rebuild on the GameResults grammar, minus the
 * leaderboard (quiz scores are private): split header (score or +$ left,
 * type · rate · clock right), the honest stat box, the banked pill, and the
 * misses-first ResultsFolds with the never-truncating green correct line.
 *
 * Celebrations (Steve's locked rules): a quiz that banked **$1 or more**
 * rains green dollars (MoneyRain); a no-Bucks quiz (rewards off, $0 values,
 * or preview) gets the games' confetti — but only above 50% correct.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/utils/exam/examEngine';
import { getExamTypeName, type ExamType } from '@/utils/exam/questionGenerator';
import { ResultsFold } from '@/components/game/GameResults';
import GameConfetti from '@/components/game/GameConfetti';
import MoneyRain from '@/components/quiz/MoneyRain';
import ShineButton from '@/components/quiz/ShineButton';
import { QUIZ_VISUALS, quizRole } from '@/components/quiz/quizVisuals';
import { fonts } from '@/constants/fonts';

interface QuestionReview {
  id: string;
  question_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  is_bonus: boolean;
  bonus_bucks_value: number | null;
  user_answer: string | null;
  is_correct: boolean;
  question_image_url?: string | null;
  question_text_es?: string | null;
  option_a_es?: string | null;
  option_b_es?: string | null;
  option_c_es?: string | null;
  option_d_es?: string | null;
}

export default function ExamResultsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const currencyName = organization.reward_currency_name;
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const params = useLocalSearchParams<{
    examId: string;
    correctCount: string;
    totalQuestions: string;
    standardCorrect: string;
    bonusCorrect: string;
    bonusBucksValue: string;
    totalBucks: string;
    timeSeconds: string;
    isTimedOut: string;
    preview: string;
    previewAnswers: string;
  }>();

  const examId = params.examId || '';
  const correctCount = parseInt(params.correctCount || '0');
  const totalQuestions = parseInt(params.totalQuestions || '0');
  const bonusCorrect = params.bonusCorrect === 'true';
  const bonusBucksValue = parseInt(params.bonusBucksValue || '0');
  const totalBucks = parseInt(params.totalBucks || '0');
  const timeSeconds = parseInt(params.timeSeconds || '0');
  const isTimedOut = params.isTimedOut === 'true';
  const isPreview = params.preview === 'true';

  const [questions, setQuestions] = useState<QuestionReview[]>([]);
  const [examType, setExamType] = useState('server');
  const [loading, setLoading] = useState(true);

  const visual = QUIZ_VISUALS[quizRole(examType)];
  const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  // Locked celebration rules: ≥$1 banked → money rain; otherwise confetti,
  // but only when they cleared half the quiz.
  const rained = !isPreview && totalBucks >= 1;
  const confetti = !rained && pct > 50;

  useEffect(() => {
    loadQuestionReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadQuestionReview = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const { data: examRows } = await supabase.rpc('get_exam', {
        p_actor_id: user.id, p_exam_id: examId,
      });
      if (examRows?.[0]?.exam_type) setExamType(examRows[0].exam_type);

      const { data: questionsData } = await supabase.rpc('get_exam_questions', {
        p_actor_id: user.id,
        p_exam_id: examId,
      });
      if (!questionsData) {
        setLoading(false);
        return;
      }

      // Answers from exam_results (real attempt) or the URL (preview mode —
      // the manager never wrote to the DB).
      let userAnswers: any[] = [];
      if (isPreview) {
        if (params.previewAnswers) {
          try {
            userAnswers = JSON.parse(decodeURIComponent(params.previewAnswers));
          } catch (e) {
            console.warn('Failed to parse previewAnswers param', e);
          }
        }
      } else {
        const { data: resultData, error: resultError } = await supabase.rpc('get_my_exam_result', {
          p_actor_id: user.id,
          p_exam_id: examId,
        });
        if (resultError) {
          console.warn('exam-results: failed to load answers', resultError);
        } else if (resultData?.[0]?.answers) {
          userAnswers = typeof resultData[0].answers === 'string'
            ? JSON.parse(resultData[0].answers)
            : resultData[0].answers;
        }
      }

      const reviewQuestions: QuestionReview[] = questionsData.map((q) => {
        const answer = userAnswers.find((a: any) => a.question_id === q.id);
        // Belt-and-suspenders: preview mode derives is_correct if it was lost.
        const derivedCorrect =
          isPreview && answer?.selected_option
            ? answer.selected_option === q.correct_option
            : false;
        return {
          ...q,
          correct_option: q.correct_option as 'A' | 'B' | 'C' | 'D',
          user_answer: answer?.selected_option || null,
          is_correct: answer?.is_correct ?? derivedCorrect,
        };
      });

      setQuestions(reviewQuestions);
    } catch (err) {
      console.error('Load review error:', err);
    }
    setLoading(false);
  };

  const handleDone = () => {
    // exam-play REPLACES itself with this screen, so the stack beneath is the
    // Quizzes & Exams page (employee) or the editor/hub (manager preview) —
    // one back lands exactly there. The old double-back overshot to Tools
    // (Steve's smoke catch).
    router.back();
  };

  const optionText = (q: QuestionReview, letter: string | null): string => {
    if (!letter) return '—';
    const key = `option_${letter.toLowerCase()}` as keyof QuestionReview;
    const esKey = `${key}_es` as keyof QuestionReview;
    return ((isSpanish && (q[esKey] as string | null)) || (q[key] as string)) ?? '—';
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={visual.accent} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const misses = questions.filter((q) => !q.is_correct);
  const corrects = questions.filter((q) => q.is_correct);
  const standardCorrectCount = corrects.filter((q) => !q.is_bonus).length;
  const standardBucks = totalBucks - (bonusCorrect ? bonusBucksValue : 0);
  const typeName = getExamTypeName(quizRole(examType) as ExamType, isSpanish);

  const reviewRow = (q: QuestionReview) => {
    const questionText = (isSpanish && q.question_text_es) || q.question_text;
    return (
      <View key={q.id} style={[styles.revItem, { borderTopColor: colors.hairline }]}>
        {q.question_image_url ? (
          <StorageImage source={{ uri: q.question_image_url }} style={styles.revThumb} />
        ) : null}
        <View style={styles.revBody}>
          <View style={styles.revTitleRow}>
            <Text style={[styles.revName, { color: colors.text }]} numberOfLines={2}>
              {questionText}
            </Text>
            {q.is_bonus && (
              <View style={styles.bonusChip}>
                <Text style={styles.bonusChipText}>{t('exam_results.bonus_tag').toUpperCase()}</Text>
              </View>
            )}
          </View>
          {q.is_correct ? (
            <Text style={styles.revCorrect}>{optionText(q, q.correct_option)}</Text>
          ) : (
            <>
              {/* The miss line may truncate; the bold-green correct answer
                  gets its own fully-wrapping line so it can never be cut. */}
              <Text style={[styles.revMiss, { color: colors.textSecondary }]} numberOfLines={2}>
                {t('exam_results.you_said', { answer: optionText(q, q.user_answer) })}
              </Text>
              <Text style={styles.revCorrect}>→ {optionText(q, q.correct_option)}</Text>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          {rained && <MoneyRain />}
          {confetti && <GameConfetti visual={{ accent: visual.accent, gradient: visual.gradient }} count={70} />}
          <View style={styles.cardInner}>
            {isPreview && (
              <View style={styles.previewBanner}>
                <Text style={styles.previewBannerText}>{t('exam_results.preview_banner').toUpperCase()}</Text>
              </View>
            )}
            {isTimedOut && (
              <View style={styles.timeoutBanner}>
                <IconSymbol ios_icon_name="clock.badge.exclamationmark.fill" android_material_icon_name="timer-off" size={17} color="#EF4444" />
                <Text style={styles.timeoutText}>{t('exam_results.timeout_banner')}</Text>
              </View>
            )}

            {/* ── Split header ── */}
            <View style={styles.split}>
              <View style={[styles.avatar, rained && styles.avatarMoney]}>
                <IconSymbol
                  ios_icon_name={rained ? 'dollarsign' : 'graduationcap.fill'}
                  android_material_icon_name={rained ? 'attach-money' : 'school'}
                  size={22}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.lcol}>
                <Text style={[styles.title, { color: colors.text }]}>{t('exam_results.complete_title')}</Text>
                {rained ? (
                  <Text style={styles.scoreMoney}>+${totalBucks}</Text>
                ) : (
                  <Text style={[styles.score, { color: visual.accent }]}>
                    {correctCount}/{totalQuestions}
                  </Text>
                )}
              </View>
              <View style={styles.rcol}>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('weekly_quizzes.type_quiz_title', { type: typeName }).toUpperCase()}
                </Text>
                {rained ? (
                  <Text style={[styles.rstat, { color: colors.text }]}>
                    {correctCount}/{totalQuestions} · {pct}%
                  </Text>
                ) : (
                  <Text style={[styles.rstat, { color: pct > 50 ? '#10B981' : colors.text }]}>
                    {t('exam_results.pct_correct', { pct })}
                  </Text>
                )}
                <Text style={[styles.rstat, { color: colors.textSecondary }]}>
                  {t('exam_results.on_clock', { time: formatTime(timeSeconds) })}
                </Text>
              </View>
            </View>

            {/* ── Stat box ── */}
            <View style={[styles.statBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              {rained ? (
                <>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                      {t('exam_results.standard_row', { count: standardCorrectCount })}
                    </Text>
                    <Text style={[styles.statValue, { color: '#10B981' }]}>+${standardBucks}</Text>
                  </View>
                  {bonusBucksValue > 0 && (
                    <View style={styles.statRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('exam_results.bonus_row')}</Text>
                      <Text style={[styles.statValue, { color: bonusCorrect ? '#F59E0B' : '#EF4444' }]}>
                        {bonusCorrect ? `+$${bonusBucksValue}` : '$0'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('exam_results.missed_row')}</Text>
                    <Text style={[styles.statValue, { color: misses.length > 0 ? '#EF4444' : colors.text }]}>
                      {misses.length}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('exam_results.correct_row')}</Text>
                    <Text style={[styles.statValue, { color: '#10B981' }]}>{correctCount}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('exam_results.missed_row')}</Text>
                    <Text style={[styles.statValue, { color: misses.length > 0 ? '#EF4444' : colors.text }]}>
                      {misses.length}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('exam_results.time_row')}</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{formatTime(timeSeconds)}</Text>
                  </View>
                </>
              )}
            </View>

            {rained && (
              <View style={styles.bankedPill}>
                <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={14} color="#10B981" />
                <Text style={styles.bankedText}>
                  {t('exam_results.banked_pill', { amount: totalBucks, currency: currencyName })}
                </Text>
              </View>
            )}

            {/* ── Review folds — misses first (the s76 grammar) ── */}
            {misses.length > 0 && (
              <ResultsFold
                iconIos="xmark"
                iconAndroid="close"
                iconColor="#EF4444"
                title={t('exam_results.review_these')}
                count={misses.length}
                initiallyOpen
              >
                {misses.map(reviewRow)}
              </ResultsFold>
            )}
            {corrects.length > 0 && (
              <ResultsFold
                iconIos="checkmark"
                iconAndroid="check"
                iconColor="#10B981"
                title={t('exam_results.correct_fold')}
                count={corrects.length}
                initiallyOpen={misses.length === 0}
              >
                {corrects.map(reviewRow)}
              </ResultsFold>
            )}

            <ShineButton
              label={t('exam_results.done')}
              gradient={visual.gradient}
              onPress={handleDone}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 40 },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardInner: { padding: 16, position: 'relative' },

  previewBanner: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 5,
    marginBottom: 12,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
  },
  previewBannerText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, color: '#F59E0B' },
  timeoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    padding: 11,
    marginBottom: 12,
    backgroundColor: 'rgba(239,68,68,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  timeoutText: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 11.5, color: '#EF4444' },

  split: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    overflow: 'hidden',
  },
  avatarMoney: { backgroundColor: '#0B7A5C' },
  lcol: { flex: 1.1, minWidth: 0 },
  title: { fontFamily: fonts.display.bold, fontSize: 16.5, lineHeight: 20 },
  score: { fontFamily: fonts.mono.semibold, fontSize: 24, marginTop: 3 },
  scoreMoney: { fontFamily: fonts.mono.semibold, fontSize: 24, marginTop: 3, color: '#10B981' },
  rcol: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  meta: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 1 },
  rstat: { fontFamily: fonts.mono.semibold, fontSize: 12 },

  statBox: {
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 5,
    marginBottom: 12,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statLabel: { fontFamily: fonts.body.regular, fontSize: 12.5 },
  statValue: { fontFamily: fonts.mono.semibold, fontSize: 13 },

  bankedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 12,
    backgroundColor: 'rgba(16,185,129,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.36)',
  },
  bankedText: { fontFamily: fonts.body.semibold, fontSize: 13.5, color: '#10B981' },

  revItem: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    alignItems: 'flex-start',
  },
  revThumb: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#00000018' },
  revBody: { flex: 1, minWidth: 0 },
  revTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  revName: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 11.5, lineHeight: 15 },
  bonusChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(245,158,11,0.16)',
  },
  bonusChipText: { fontFamily: fonts.mono.semibold, fontSize: 7.5, letterSpacing: 0.6, color: '#F59E0B' },
  revMiss: { fontFamily: fonts.body.regular, fontSize: 10.5, marginTop: 2 },
  revCorrect: { fontFamily: fonts.body.semibold, fontSize: 10.5, color: '#10B981', marginTop: 2 },
});
