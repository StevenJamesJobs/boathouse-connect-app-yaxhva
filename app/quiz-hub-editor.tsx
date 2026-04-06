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
import { getExamTypeName } from '@/utils/exam/questionGenerator';
import type { ExamType } from '@/utils/exam/questionGenerator';
import { useFocusEffect } from '@react-navigation/native';

interface ExamSummary {
  id: string;
  exam_type: ExamType;
  status: 'draft' | 'active' | 'closed';
  time_limit_seconds: number;
  questionCount: number;
  completedCount: number;
  totalEmployees: number;
}

const EXAM_TYPES: ExamType[] = ['server', 'bartender', 'host'];

const EXAM_ICONS: Record<ExamType, { ios: string; android: string }> = {
  server: { ios: 'tray.full.fill', android: 'room-service' },
  bartender: { ios: 'wineglass.fill', android: 'local-bar' },
  host: { ios: 'person.2.fill', android: 'people' },
};

export default function QuizHubEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Map<ExamType, ExamSummary | null>>(new Map());

  const fetchAllExams = async () => {
    setLoading(true);
    const examMap = new Map<ExamType, ExamSummary | null>();

    for (const examType of EXAM_TYPES) {
      try {
        // Get the most recent draft or active exam for this type
        const { data, error } = await (supabase
          .from('exams' as any) as any)
          .select('*')
          .eq('exam_type', examType)
          .in('status', ['draft', 'active'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const exam = data[0];

          // Get question count
          const { count: questionCount } = await (supabase
            .from('exam_questions' as any) as any)
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id);

          // Get completion data if active
          let completedCount = 0;
          let totalEmployees = 0;

          if (exam.status === 'active') {
            try {
              const { data: completionData } = await (supabase.rpc as any)('get_exam_completion_status', {
                p_exam_id: exam.id,
                p_exam_type: examType,
              });

              if (completionData) {
                totalEmployees = completionData.length;
                completedCount = completionData.filter((e: any) => e.has_completed).length;
              }
            } catch {}
          }

          examMap.set(examType, {
            id: exam.id,
            exam_type: examType,
            status: exam.status,
            time_limit_seconds: exam.time_limit_seconds,
            questionCount: questionCount || 0,
            completedCount,
            totalEmployees,
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
    setLoading(false);
  };

  // Refresh data when screen comes into focus (returning from exam-editor)
  useFocusEffect(
    useCallback(() => {
      fetchAllExams();
    }, [])
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return '#F59E0B';
      case 'active': return '#10B981';
      case 'closed': return '#EF4444';
      default: return colors.textSecondary;
    }
  };

  const renderExamCard = (examType: ExamType) => {
    const exam = exams.get(examType);
    const icons = EXAM_ICONS[examType];

    return (
      <TouchableOpacity
        key={examType}
        style={[styles.examCard, { backgroundColor: colors.card }]}
        onPress={() => router.push(`/exam-editor?type=${examType}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={[styles.examIconContainer, { backgroundColor: colors.primary + '15' }]}>
            <IconSymbol
              ios_icon_name={icons.ios as any}
              android_material_icon_name={icons.android as any}
              size={28}
              color={colors.primary}
            />
          </View>
          <View style={styles.examInfo}>
            <Text style={[styles.examTitle, { color: colors.text }]}>
              {getExamTypeName(examType)} Quiz
            </Text>
            {exam ? (
              <View style={styles.examMeta}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(exam.status) + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(exam.status) }]}>
                    {exam.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.questionCountText, { color: colors.textSecondary }]}>
                  {exam.questionCount} Q's
                </Text>
              </View>
            ) : (
              <Text style={[styles.noQuizText, { color: colors.textSecondary }]}>
                No active quiz
              </Text>
            )}
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={20}
            color={colors.textSecondary}
          />
        </View>

        {/* Progress bar for active exams */}
        {exam?.status === 'active' && exam.totalEmployees > 0 && (
          <View style={styles.cardBottom}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: '#10B981',
                    width: `${(exam.completedCount / exam.totalEmployees) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {exam.completedCount}/{exam.totalEmployees} completed
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Weekly Quizzes</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Info card */}
            <View style={[styles.infoCard, { backgroundColor: colors.primary + '10' }]}>
              <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={20} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Manage weekly quizzes for all staff roles. Tap a card to create, edit, or activate a quiz.
              </Text>
            </View>

            {/* Exam cards */}
            {EXAM_TYPES.map(renderExamCard)}
          </>
        )}
      </ScrollView>

      <BottomNavBar activeTab="manage" />
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
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 100,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  examCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  examIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examInfo: { flex: 1 },
  examTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 4 },
  examMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  questionCountText: { fontSize: 13 },
  noQuizText: { fontSize: 13, fontStyle: 'italic' },
  cardBottom: { marginTop: 12, gap: 6 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, textAlign: 'right' },
});
