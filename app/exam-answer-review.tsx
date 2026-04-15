import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/utils/exam/examEngine';
import QuestionReviewList, { QuestionReviewEntry } from '@/components/QuestionReviewList';

interface AnswerRecord {
  question_id: string;
  selected_option: 'A' | 'B' | 'C' | 'D';
  is_correct: boolean;
}

export default function ExamAnswerReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const params = useLocalSearchParams<{ examId: string; userId: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<{ name: string; profile_picture_url: string | null } | null>(null);
  const [questions, setQuestions] = useState<QuestionReviewEntry[]>([]);
  const [summary, setSummary] = useState<{
    correct_count: number;
    total_questions: number;
    bucks_awarded: number;
    time_seconds: number;
    is_timed_out: boolean;
  } | null>(null);

  useEffect(() => {
    // Manager-only guard
    if (user && user.role !== 'manager') {
      router.back();
      return;
    }
    if (!params.examId || !params.userId) {
      router.back();
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.examId, params.userId, user?.role]);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Fetch questions
      const { data: qData, error: qError } = await (supabase
        .from('exam_questions' as any) as any)
        .select('*')
        .eq('exam_id', params.examId)
        .order('question_order');

      if (qError) {
        console.error('exam-answer-review: failed to load questions', qError);
        setLoadError(qError.message || 'Failed to load questions.');
        return;
      }

      // Fetch result
      const { data: rData, error: rError } = await (supabase
        .from('exam_results' as any) as any)
        .select('answers, correct_count, total_questions, bucks_awarded, time_seconds, is_timed_out')
        .eq('exam_id', params.examId)
        .eq('user_id', params.userId)
        .maybeSingle();

      if (rError) {
        console.error('exam-answer-review: failed to load result', rError);
        setLoadError(rError.message || 'Failed to load result.');
        return;
      }

      // Fetch user
      const { data: uData, error: uError } = await supabase
        .from('users')
        .select('name, profile_picture_url')
        .eq('id', params.userId as string)
        .maybeSingle();

      if (uError) {
        console.error('exam-answer-review: failed to load user', uError);
        setLoadError(uError.message || 'Failed to load user.');
        return;
      }

      if (uData) {
        setTargetUser({
          name: (uData as any).name,
          profile_picture_url: (uData as any).profile_picture_url || null,
        });
      }

      if (rData) {
        setSummary({
          correct_count: (rData as any).correct_count,
          total_questions: (rData as any).total_questions,
          bucks_awarded: (rData as any).bucks_awarded,
          time_seconds: (rData as any).time_seconds,
          is_timed_out: (rData as any).is_timed_out,
        });
      }

      // `answers` is declared JSONB but can come back as either a parsed array
      // or a JSON string depending on the client path. exam-results.tsx handles
      // both shapes — mirror that here (plus Array.isArray belt-and-suspenders).
      const answersByQuestionId: Record<string, AnswerRecord> = {};
      const rawAnswers = (rData as any)?.answers;
      let answersArray: AnswerRecord[] = [];
      if (Array.isArray(rawAnswers)) {
        answersArray = rawAnswers;
      } else if (typeof rawAnswers === 'string') {
        try {
          const parsed = JSON.parse(rawAnswers);
          if (Array.isArray(parsed)) answersArray = parsed;
        } catch (parseErr) {
          console.warn('exam-answer-review: failed to parse answers JSON', parseErr);
        }
      }
      answersArray.forEach((a) => {
        answersByQuestionId[a.question_id] = a;
      });

      const reviewEntries: QuestionReviewEntry[] = ((qData as any[]) || []).map((q) => {
        const answer = answersByQuestionId[q.id];
        return {
          id: q.id,
          question_order: q.question_order,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          is_bonus: q.is_bonus,
          bonus_bucks_value: q.bonus_bucks_value,
          question_image_url: q.question_image_url || null,
          question_text_es: q.question_text_es || null,
          option_a_es: q.option_a_es || null,
          option_b_es: q.option_b_es || null,
          option_c_es: q.option_c_es || null,
          option_d_es: q.option_d_es || null,
          user_answer: answer?.selected_option || null,
          is_correct: answer?.is_correct ?? false,
        };
      });

      setQuestions(reviewEntries);
    } catch (err) {
      console.error('Failed to load exam answer review:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
          {isSpanish ? 'Revisión de Respuestas' : 'Answer Review'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User + score header */}
        <View style={[styles.userCard, { backgroundColor: colors.card }]}>
          {targetUser?.profile_picture_url ? (
            <Image source={{ uri: targetUser.profile_picture_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }]}>
              <IconSymbol
                ios_icon_name="person.fill"
                android_material_icon_name="person"
                size={32}
                color={colors.primary}
              />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {targetUser?.name || '—'}
            </Text>
            {summary && (
              <>
                <Text style={[styles.scoreLine, { color: colors.text }]}>
                  {summary.correct_count}/{summary.total_questions}{' '}
                  <Text style={{ color: '#10B981' }}>· ${summary.bucks_awarded}</Text>
                </Text>
                <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
                  {isSpanish ? 'Tiempo' : 'Time'}: {formatTime(summary.time_seconds)}
                  {summary.is_timed_out ? (isSpanish ? ' · Tiempo agotado' : ' · Timed out') : ''}
                </Text>
              </>
            )}
          </View>
        </View>

        {loadError ? (
          <View style={[styles.emptyCard, { backgroundColor: '#EF444415', borderColor: '#EF4444', borderWidth: 1 }]}>
            <Text style={[styles.emptyText, { color: '#EF4444' }]}>
              {isSpanish ? 'Error al cargar las respuestas:' : 'Failed to load answers:'}
            </Text>
            <Text style={[styles.emptyText, { color: '#EF4444', marginTop: 4 }]}>
              {loadError}
            </Text>
          </View>
        ) : summary ? (
          <QuestionReviewList questions={questions} />
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isSpanish ? 'Este usuario no ha completado el examen.' : 'This user has not completed the quiz.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 14,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  scoreLine: { fontSize: 15, fontWeight: '700' },
  metaLine: { fontSize: 12, marginTop: 2 },
  emptyCard: {
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
