
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
import { formatTime } from '@/utils/exam/examEngine';

const EXAM_TYPE = 'bartender';

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

export default function BartenderAssistantScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const isSpanish = i18n.language === 'es';
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'exams'>('encyclopedia');
  const [examLoading, setExamLoading] = useState(false);
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [questionCount, setQuestionCount] = useState(0);

  const fetchExamStatus = useCallback(async () => {
    setExamLoading(true);
    try {
      // Get active exam for this type
      const { data: examData } = await supabase
        .from('exams')
        .select('id, time_limit_seconds, status')
        .eq('exam_type', EXAM_TYPE)
        .eq('status', 'active')
        .order('activated_at', { ascending: false })
        .limit(1);

      if (examData && examData.length > 0) {
        const exam = examData[0] as ActiveExam;
        setActiveExam(exam);

        // Get question count
        const { count } = await supabase
          .from('exam_questions')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', exam.id);
        setQuestionCount(count || 0);

        // Check if user already took it
        if (user?.id) {
          const { data: resultData } = await supabase
            .from('exam_results')
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
    setExamLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'exams') {
      fetchExamStatus();
    }
  }, [activeTab, fetchExamStatus]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('bartender_assistant.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'encyclopedia' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'encyclopedia' && { color: colors.text }]}>
              {t('bartender_assistant.encyclopedia')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'exams' && { color: colors.text }]}>
              {t('bartender_assistant.bar_exams')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Checklists Section - MOVED FROM BARTENDER BINDER */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="checklist"
                  android_material_icon_name="checklist"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.checklists')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.checklists_desc')}
                  </Text>
                </View>
              </View>
              
              {/* Opening Checklist */}
              <TouchableOpacity 
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/bartender-opening-checklist')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_assistant.opening_checklist')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Closing Checklist */}
              <TouchableOpacity 
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/bartender-closing-checklist')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_assistant.closing_checklist')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Libation Recipes Section */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/libation-recipes')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.libation_recipes')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.libation_recipes_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Cocktails A-Z Section */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/cocktails-az')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="list.bullet"
                  android_material_icon_name="format-list-bulleted"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.cocktails_az')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.cocktails_az_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Purees & Simple Syrups Recipes Section - NOW MATCHES COCKTAILS A-Z DESIGN */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/puree-syrup-recipes')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="drop.fill"
                  android_material_icon_name="opacity"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.purees_syrups')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.purees_syrups_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {examLoading ? (
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
                <Text style={[styles.examActiveTitle, { color: colors.text }]}>{isSpanish ? 'Examen Semanal del Bartender' : 'Bartender Weekly Quiz'}</Text>
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
          </>
        )}
      </ScrollView>
      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  subCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subCardText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontStyle: 'italic',
  },
  // Exam styles
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
