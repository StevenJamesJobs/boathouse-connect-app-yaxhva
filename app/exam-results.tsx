import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime } from '@/utils/exam/examEngine';
import { useTranslation } from 'react-i18next';
import QuestionReviewList from '@/components/QuestionReviewList';

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
  // Spanish fields
  question_text_es?: string;
  option_a_es?: string;
  option_b_es?: string;
  option_c_es?: string;
  option_d_es?: string;
}

export default function ExamResultsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { i18n } = useTranslation();
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
  const standardCorrect = parseInt(params.standardCorrect || '0');
  const bonusCorrect = params.bonusCorrect === 'true';
  const bonusBucksValue = parseInt(params.bonusBucksValue || '0');
  const totalBucks = parseInt(params.totalBucks || '0');
  const timeSeconds = parseInt(params.timeSeconds || '0');
  const isTimedOut = params.isTimedOut === 'true';
  const isPreview = params.preview === 'true';

  const [questions, setQuestions] = useState<QuestionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<any[]>([]);

  useEffect(() => {
    loadQuestionReview();
  }, []);

  const loadQuestionReview = async () => {
    try {
      // Fetch questions
      const { data: questionsData } = await (supabase
        .from('exam_questions' as any) as any)
        .select('*')
        .eq('exam_id', examId)
        .order('question_order');

      if (!questionsData) {
        setLoading(false);
        return;
      }

      // Try to load user's answers from exam_results (real attempt) or from
      // query param (preview mode — manager hasn't written to the DB).
      let userAnswers: any[] = [];
      if (isPreview) {
        if (params.previewAnswers) {
          try {
            userAnswers = JSON.parse(decodeURIComponent(params.previewAnswers));
          } catch (e) {
            console.warn('Failed to parse previewAnswers param', e);
          }
        }
      } else if (user?.id) {
        const { data: resultData, error: resultError } = await (supabase
          .from('exam_results' as any) as any)
          .select('answers')
          .eq('exam_id', examId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (resultError) {
          console.warn('exam-results: failed to load answers', resultError);
        } else if (resultData?.answers) {
          userAnswers = typeof resultData.answers === 'string'
            ? JSON.parse(resultData.answers)
            : resultData.answers;
        }
      }

      setAnswers(userAnswers);

      // Build review data
      const reviewQuestions: QuestionReview[] = questionsData.map((q: any, index: number) => {
        const answer = userAnswers.find((a: any) => a.question_id === q.id);
        // Belt-and-suspenders: if preview mode somehow lost is_correct, derive it
        // from the selected option matching the correct option on the question row.
        const derivedCorrect =
          isPreview && answer?.selected_option
            ? answer.selected_option === q.correct_option
            : false;
        return {
          ...q,
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
    router.back();
    router.back(); // Go back past exam-play to the assistant screen
  };

  const getScoreColor = () => {
    const pct = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    if (pct >= 0.8) return '#10B981';
    if (pct >= 0.6) return '#F59E0B';
    return '#EF4444';
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={[styles.headerTitle, { color: colors.text }]}>{isSpanish ? 'Resultados del Examen' : 'Quiz Results'}</Text>

        {isPreview && (
          <View style={[styles.previewBanner, { backgroundColor: '#F59E0B' }]}>
            <Text style={styles.previewBannerText}>{isSpanish ? 'Modo Vista Previa — sin recompensas' : 'Preview Mode — no rewards awarded'}</Text>
          </View>
        )}

        {isTimedOut && (
          <View style={[styles.timeoutBanner, { backgroundColor: '#EF444420' }]}>
            <IconSymbol ios_icon_name="clock.badge.exclamationmark.fill" android_material_icon_name="timer-off" size={20} color="#EF4444" />
            <Text style={styles.timeoutText}>{isSpanish ? 'Se acabó el tiempo — preguntas sin responder marcadas como incorrectas' : 'Time ran out — unanswered questions marked wrong'}</Text>
          </View>
        )}

        {/* Score Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <View style={[styles.scoreCircle, { borderColor: getScoreColor() }]}>
            <Text style={[styles.scoreNumber, { color: getScoreColor() }]}>
              {correctCount}/{totalQuestions}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatTime(timeSeconds)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{isSpanish ? 'Tiempo' : 'Time'}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>${standardCorrect}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{isSpanish ? 'Estándar' : 'Standard'}</Text>
            </View>
            {bonusBucksValue > 0 && (
              <>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: bonusCorrect ? '#F59E0B' : '#EF4444' }]}>
                    {bonusCorrect ? `+$${bonusBucksValue}` : '$0'}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{isSpanish ? 'Bonificación' : 'Bonus'}</Text>
                </View>
              </>
            )}
          </View>

          {!isPreview && (
            <View style={[styles.totalBucksRow, { backgroundColor: '#10B98115' }]}>
              <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={22} color="#10B981" />
              <Text style={styles.totalBucksText}>{isSpanish ? `+$${totalBucks} McLoone's Bucks Ganados!` : `+$${totalBucks} McLoone's Bucks Earned!`}</Text>
            </View>
          )}
        </View>

        {/* Question Review */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{isSpanish ? 'Revisión de Preguntas' : 'Question Review'}</Text>

        <QuestionReviewList questions={questions as any} />

        {/* Done Button */}
        <TouchableOpacity
          style={[styles.doneButton, { backgroundColor: colors.primary }]}
          onPress={handleDone}
        >
          <Text style={styles.doneButtonText}>{isSpanish ? 'Listo' : 'Done'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },

  headerTitle: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

  previewBanner: {
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  previewBannerText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  timeoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  timeoutText: { color: '#EF4444', fontSize: 13, fontWeight: '600', flex: 1 },

  // Summary card
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
    elevation: 5,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scoreNumber: { fontSize: 28, fontWeight: '800' },

  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statItem: { alignItems: 'center', paddingHorizontal: 16 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 30 },

  totalBucksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  totalBucksText: { color: '#10B981', fontSize: 17, fontWeight: '700' },

  // Question review
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  reviewCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  resultBadgeText: { fontSize: 12, fontWeight: '700' },
  bonusChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  bonusChipText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },
  reviewQuestionNum: { fontSize: 13, fontWeight: '600' },
  reviewQuestionText: { fontSize: 15, fontWeight: '600', marginBottom: 10, lineHeight: 21 },
  reviewQuestionImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#00000010',
  },
  reviewOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, gap: 6 },
  reviewOptionLetter: { fontSize: 13, width: 18, fontWeight: '600' },
  reviewOptionText: { flex: 1, fontSize: 13 },
  yourAnswerTag: { fontSize: 10, fontWeight: '700', fontStyle: 'italic' },

  // Done button
  doneButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  doneButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
