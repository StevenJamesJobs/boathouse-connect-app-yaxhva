import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime } from '@/utils/exam/examEngine';
import BottomNavBar from '@/components/BottomNavBar';
import { useTranslation } from 'react-i18next';

const EXAM_TYPE = 'server'; // Bussers/Runners take the Server quiz

interface ActiveExam {
  id: string;
  time_limit_seconds: number;
  status: string;
}

interface ExamResult {
  correct_count: number;
  total_questions: number;
  bucks_awarded: number;
  exam_id: string;
}

export default function WeeklyQuizScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';

  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [questionCount, setQuestionCount] = useState(0);

  const fetchExamStatus = useCallback(async () => {
    setLoading(true);
    try {
      // Get active server exam
      const { data: examData } = await (supabase
        .from('exams' as any) as any)
        .select('id, time_limit_seconds, status')
        .eq('exam_type', EXAM_TYPE)
        .eq('status', 'active')
        .order('activated_at', { ascending: false })
        .limit(1);

      if (examData && examData.length > 0) {
        const exam = examData[0] as ActiveExam;
        setActiveExam(exam);

        // Get question count
        const { count } = await (supabase
          .from('exam_questions' as any) as any)
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', exam.id);
        setQuestionCount(count || 0);

        // Check if user already took it
        if (user?.id) {
          const { data: resultData } = await (supabase
            .from('exam_results' as any) as any)
            .select('correct_count, total_questions, bucks_awarded, exam_id')
            .eq('exam_id', exam.id)
            .eq('user_id', user.id)
            .limit(1);

          if (resultData && resultData.length > 0) {
            setExamResult(resultData[0] as ExamResult);
          } else {
            setExamResult(null);
          }
        }
      } else {
        setActiveExam(null);
        setExamResult(null);
      }
    } catch (err) {
      console.error('Error fetching exam status:', err);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchExamStatus();
  }, [fetchExamStatus]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{isSpanish ? 'Exámenes Semanales' : 'Weekly Quizzes'}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : !activeExam ? (
          <View style={[styles.examEmptyCard, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="doc.questionmark.fill" android_material_icon_name="quiz" size={48} color={colors.primary} />
            <Text style={[styles.examEmptyTitle, { color: colors.text }]}>{isSpanish ? 'No Hay Examen Disponible' : 'No Quiz Available'}</Text>
            <Text style={[styles.examEmptyDesc, { color: colors.textSecondary }]}>
              {isSpanish ? '¡No hay un examen activo en este momento. Vuelve pronto!' : "There's no active quiz right now. Check back soon!"}
            </Text>
          </View>
        ) : examResult ? (
          /* Quiz completed — show score */
          <View style={[styles.examCompletedCard, { backgroundColor: colors.card }]}>
            <View style={styles.examCompletedHeader}>
              <IconSymbol ios_icon_name="checkmark.seal.fill" android_material_icon_name="verified" size={32} color="#10B981" />
              <Text style={[styles.examCompletedTitle, { color: colors.text }]}>{isSpanish ? 'Examen Completado' : 'Quiz Completed'}</Text>
            </View>
            <View style={[styles.examScoreRow, { backgroundColor: colors.background }]}>
              <Text style={[styles.examScoreLabel, { color: colors.textSecondary }]}>{isSpanish ? 'Puntuación' : 'Score'}</Text>
              <Text style={[styles.examScoreValue, { color: colors.primary }]}>
                {examResult.correct_count}/{examResult.total_questions}
              </Text>
            </View>
            <View style={[styles.examScoreRow, { backgroundColor: colors.background }]}>
              <Text style={[styles.examScoreLabel, { color: colors.textSecondary }]}>{isSpanish ? 'Ganados' : 'Earned'}</Text>
              <Text style={[styles.examBucksValue, { color: '#10B981' }]}>
                +${examResult.bucks_awarded} McLoone's Bucks
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.reviewButton, { borderColor: colors.primary }]}
              onPress={() => router.push(`/exam-results?examId=${examResult.exam_id}&correctCount=${examResult.correct_count}&totalQuestions=${examResult.total_questions}&standardCorrect=${examResult.correct_count}&bonusCorrect=false&bonusBucksValue=0&totalBucks=${examResult.bucks_awarded}&timeSeconds=0&isTimedOut=false&preview=false`)}
            >
              <IconSymbol ios_icon_name="doc.text.magnifyingglass" android_material_icon_name="pageview" size={18} color={colors.primary} />
              <Text style={[styles.reviewButtonText, { color: colors.primary }]}>{isSpanish ? 'Revisar Respuestas' : 'Review Answers'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Active quiz — take it */
          <View style={[styles.examActiveCard, { backgroundColor: colors.card }]}>
            <View style={[styles.examActiveBadge, { backgroundColor: '#10B98120' }]}>
              <View style={[styles.examActiveDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.examActiveBadgeText}>{isSpanish ? 'Examen Activo' : 'Active Quiz'}</Text>
            </View>
            <Text style={[styles.examActiveTitle, { color: colors.text }]}>{isSpanish ? 'Examen Semanal' : 'Weekly Quiz'}</Text>
            <View style={styles.examInfoRow}>
              <IconSymbol ios_icon_name="questionmark.circle" android_material_icon_name="help-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.examInfoText, { color: colors.textSecondary }]}>{questionCount} {isSpanish ? 'Preguntas' : 'Questions'}</Text>
            </View>
            <View style={styles.examInfoRow}>
              <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={18} color={colors.textSecondary} />
              <Text style={[styles.examInfoText, { color: colors.textSecondary }]}>
                {activeExam.time_limit_seconds > 0
                  ? (isSpanish ? `Límite de Tiempo: ${formatTime(activeExam.time_limit_seconds)}` : `Time Limit: ${formatTime(activeExam.time_limit_seconds)}`)
                  : (isSpanish ? 'Sin Límite de Tiempo' : 'No Time Limit')}
              </Text>
            </View>
            <View style={styles.examInfoRow}>
              <IconSymbol ios_icon_name="dollarsign.circle" android_material_icon_name="attach-money" size={18} color="#10B981" />
              <Text style={[styles.examInfoText, { color: '#10B981' }]}>{isSpanish ? 'Gana $1 por respuesta correcta' : 'Earn $1 per correct answer'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.takeQuizButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/exam-play?examId=${activeExam.id}`)}
            >
              <Text style={styles.takeQuizButtonText}>{isSpanish ? 'Tomar Examen' : 'Take Quiz'}</Text>
              <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
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
  examEmptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examEmptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  examEmptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  examCompletedCard: {
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examCompletedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  examCompletedTitle: { fontSize: 20, fontWeight: 'bold' },
  examScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  examScoreLabel: { fontSize: 14 },
  examScoreValue: { fontSize: 18, fontWeight: 'bold' },
  examBucksValue: { fontSize: 16, fontWeight: '700' },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  reviewButtonText: { fontSize: 15, fontWeight: '600' },
  examActiveCard: {
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    gap: 6,
  },
  examActiveDot: { width: 8, height: 8, borderRadius: 4 },
  examActiveBadgeText: { color: '#10B981', fontSize: 13, fontWeight: '700' },
  examActiveTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  examInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  examInfoText: { fontSize: 14 },
  takeQuizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
    gap: 8,
  },
  takeQuizButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
