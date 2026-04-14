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
import WeeklyQuizCard, { WeeklyQuizCardResult } from '@/components/WeeklyQuizCard';

type ExamType = 'server' | 'bartender' | 'host';

interface ActiveExam {
  id: string;
  time_limit_seconds: number;
  status: string;
}

interface QuizEntry {
  examType: ExamType;
  titleLabel: string;
  activeExam: ActiveExam | null;
  result: WeeklyQuizCardResult | null;
  questionCount: number;
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

export default function WeeklyQuizzesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizEntry[]>([]);

  const labelForType = useCallback(
    (type: ExamType): string => {
      if (type === 'server') return t('weekly_quizzes.server_title');
      if (type === 'bartender') return t('weekly_quizzes.bartender_title');
      return t('weekly_quizzes.host_title');
    },
    [t]
  );

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const eligibleTypes = getEligibleQuizTypes(user?.jobTitles || []);
      const entries: QuizEntry[] = [];

      for (const examType of eligibleTypes) {
        const titleLabel = labelForType(examType);

        // Get active exam for this type
        const { data: examData } = await (supabase.from('exams' as any) as any)
          .select('id, time_limit_seconds, status')
          .eq('exam_type', examType)
          .eq('status', 'active')
          .order('activated_at', { ascending: false })
          .limit(1);

        if (!examData || examData.length === 0) {
          entries.push({ examType, titleLabel, activeExam: null, result: null, questionCount: 0 });
          continue;
        }

        const exam = examData[0] as ActiveExam;

        // Get question count
        const { count } = await (supabase.from('exam_questions' as any) as any)
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', exam.id);

        // Check for existing result
        let result: WeeklyQuizCardResult | null = null;
        if (user?.id) {
          const { data: resultData } = await (supabase.from('exam_results' as any) as any)
            .select('correct_count, total_questions, bucks_awarded, exam_id')
            .eq('exam_id', exam.id)
            .eq('user_id', user.id)
            .limit(1);
          if (resultData && resultData.length > 0) {
            result = resultData[0] as WeeklyQuizCardResult;
          }
        }

        entries.push({
          examType,
          titleLabel,
          activeExam: exam,
          result,
          questionCount: count || 0,
        });
      }

      setQuizzes(entries);
    } catch (err) {
      console.error('Error fetching weekly quizzes:', err);
    }
    setLoading(false);
  }, [user?.id, user?.jobTitles, labelForType]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const handleTakeQuiz = (examId: string) => {
    router.push(`/exam-play?examId=${examId}` as any);
  };

  const handleReviewAnswers = (result: WeeklyQuizCardResult) => {
    router.push(
      `/exam-results?examId=${result.exam_id}&correctCount=${result.correct_count}&totalQuestions=${result.total_questions}&standardCorrect=${result.correct_count}&bonusCorrect=false&bonusBucksValue=0&totalBucks=${result.bucks_awarded}&timeSeconds=0&isTimedOut=false&preview=false` as any
    );
  };

  const noEligibleRoles = !loading && quizzes.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('weekly_quizzes.title')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('weekly_quizzes.subtitle')}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : noEligibleRoles ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <IconSymbol
              ios_icon_name="doc.questionmark.fill"
              android_material_icon_name="quiz"
              size={48}
              color={colors.primary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('weekly_quizzes.empty_title')}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              {t('weekly_quizzes.empty_desc')}
            </Text>
          </View>
        ) : (
          quizzes.map((q) => (
            <WeeklyQuizCard
              key={q.examType}
              titleLabel={q.titleLabel}
              activeExam={q.activeExam}
              result={q.result}
              questionCount={q.questionCount}
              onTakeQuiz={handleTakeQuiz}
              onReviewAnswers={handleReviewAnswers}
            />
          ))
        )}
      </ScrollView>
      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  placeholder: { width: 40 },
  scrollView: { flex: 1 },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
