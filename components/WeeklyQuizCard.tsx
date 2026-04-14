import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import { formatTime, formatCountdown, getCountdownUrgency } from '@/utils/exam/examEngine';

export interface WeeklyQuizCardResult {
  correct_count: number;
  total_questions: number;
  bucks_awarded: number;
  exam_id: string;
}

export interface WeeklyQuizCardProps {
  titleLabel: string; // e.g. "Server Weekly Quiz" (already localized)
  activeExam: { id: string; time_limit_seconds: number } | null;
  result: WeeklyQuizCardResult | null;
  questionCount: number;
  rewardPerCorrect?: number; // $ per correct standard question (default 1)
  eligibleQuizCount?: number; // total number of weekly quizzes this user is eligible for
  closeAt?: string | null; // ISO timestamp for when the quiz auto-closes
  onTakeQuiz: (examId: string) => void;
  onReviewAnswers: (result: WeeklyQuizCardResult) => void;
}

export default function WeeklyQuizCard({
  titleLabel,
  activeExam,
  result,
  questionCount,
  rewardPerCorrect = 1,
  eligibleQuizCount = 1,
  closeAt = null,
  onTakeQuiz,
  onReviewAnswers,
}: WeeklyQuizCardProps) {
  const colors = useThemeColors();
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';

  // Tick every second while a closeAt is set so the countdown label refreshes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!closeAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [closeAt]);

  // Empty state — no active exam for this type
  if (!activeExam) {
    return (
      <View style={[styles.examEmptyCard, { backgroundColor: colors.card }]}>
        <IconSymbol
          ios_icon_name="doc.questionmark.fill"
          android_material_icon_name="quiz"
          size={40}
          color={colors.primary}
        />
        <Text style={[styles.examEmptyTitle, { color: colors.text }]}>{titleLabel}</Text>
        <Text style={[styles.examEmptyDesc, { color: colors.textSecondary }]}>
          {isSpanish
            ? '¡No hay un examen activo en este momento. Vuelve pronto!'
            : "There's no active quiz right now. Check back soon!"}
        </Text>
      </View>
    );
  }

  // Completed state — user already took it
  if (result) {
    return (
      <View style={[styles.examCompletedCard, { backgroundColor: colors.card }]}>
        <View style={styles.examCompletedHeader}>
          <IconSymbol
            ios_icon_name="checkmark.seal.fill"
            android_material_icon_name="verified"
            size={32}
            color="#10B981"
          />
          <Text style={[styles.examCompletedTitle, { color: colors.text }]} numberOfLines={1}>
            {titleLabel}
          </Text>
        </View>
        <View style={[styles.examScoreRow, { backgroundColor: colors.background }]}>
          <Text style={[styles.examScoreLabel, { color: colors.textSecondary }]}>
            {isSpanish ? 'Puntuación' : 'Score'}
          </Text>
          <Text style={[styles.examScoreValue, { color: colors.primary }]}>
            {result.correct_count}/{result.total_questions}
          </Text>
        </View>
        <View style={[styles.examScoreRow, { backgroundColor: colors.background }]}>
          <Text style={[styles.examScoreLabel, { color: colors.textSecondary }]}>
            {isSpanish ? 'Ganados' : 'Earned'}
          </Text>
          <Text style={[styles.examBucksValue, { color: '#10B981' }]}>
            +${result.bucks_awarded} McLoone&apos;s Bucks
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.reviewButton, { borderColor: colors.primary }]}
          onPress={() => onReviewAnswers(result)}
        >
          <IconSymbol
            ios_icon_name="doc.text.magnifyingglass"
            android_material_icon_name="pageview"
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.reviewButtonText, { color: colors.primary }]}>
            {isSpanish ? 'Revisar Respuestas' : 'Review Answers'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active state — take quiz
  const closeAtDate = closeAt ? new Date(closeAt) : null;
  const msRemaining = closeAtDate ? closeAtDate.getTime() - Date.now() : 0;
  const urgency = closeAtDate ? getCountdownUrgency(msRemaining) : 'normal';
  const countdownColor =
    urgency === 'red' ? '#EF4444'
    : urgency === 'amber' ? '#F59E0B'
    : urgency === 'expired' ? '#9CA3AF'
    : colors.textSecondary;

  return (
    <View style={[styles.examActiveCard, { backgroundColor: colors.card }]}>
      <View style={styles.examActiveRow}>
        <View style={[styles.examActiveBadge, { backgroundColor: '#10B98120' }]}>
          <View style={[styles.examActiveDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.examActiveBadgeText}>
            {isSpanish ? 'Examen Activo' : 'Active Quiz'}
          </Text>
        </View>
        {closeAtDate && (
          <Text style={[styles.closeAtCountdown, { color: countdownColor }]}>
            {isSpanish
              ? `Cierra en ${formatCountdown(msRemaining, true)}`
              : `Closes in ${formatCountdown(msRemaining)}`}
          </Text>
        )}
      </View>
      <Text style={[styles.examActiveTitle, { color: colors.text }]}>{titleLabel}</Text>
      <View style={styles.examInfoRow}>
        <IconSymbol
          ios_icon_name="questionmark.circle"
          android_material_icon_name="help-outline"
          size={18}
          color={colors.textSecondary}
        />
        <Text style={[styles.examInfoText, { color: colors.textSecondary }]}>
          {questionCount} {isSpanish ? 'Preguntas' : 'Questions'}
        </Text>
      </View>
      <View style={styles.examInfoRow}>
        <IconSymbol
          ios_icon_name="timer"
          android_material_icon_name="timer"
          size={18}
          color={colors.textSecondary}
        />
        <Text style={[styles.examInfoText, { color: colors.textSecondary }]}>
          {activeExam.time_limit_seconds > 0
            ? isSpanish
              ? `Límite de Tiempo: ${formatTime(activeExam.time_limit_seconds)}`
              : `Time Limit: ${formatTime(activeExam.time_limit_seconds)}`
            : isSpanish
              ? 'Sin Límite de Tiempo'
              : 'No Time Limit'}
        </Text>
      </View>
      <View style={styles.examInfoRow}>
        <IconSymbol
          ios_icon_name="dollarsign.circle"
          android_material_icon_name="attach-money"
          size={18}
          color="#10B981"
        />
        <Text style={[styles.examInfoText, { color: '#10B981' }]}>
          {isSpanish
            ? `Gana $${rewardPerCorrect.toFixed(2)} por respuesta correcta`
            : `Earn $${rewardPerCorrect.toFixed(2)} per correct answer`}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.takeQuizButton, { backgroundColor: colors.primary }]}
        onPress={() => onTakeQuiz(activeExam.id)}
      >
        <Text style={styles.takeQuizButtonText}>
          {isSpanish ? 'Tomar Examen' : 'Take Quiz'}
        </Text>
        <IconSymbol
          ios_icon_name="arrow.right"
          android_material_icon_name="arrow-forward"
          size={20}
          color="#FFF"
        />
      </TouchableOpacity>
      {eligibleQuizCount > 1 && (
        <Text style={[styles.splitNote, { color: colors.textSecondary }]}>
          {isSpanish
            ? `Tu recompensa por pregunta se divide entre tus ${eligibleQuizCount} exámenes — el máximo semanal sigue siendo el mismo.`
            : `Your reward per question is split across your ${eligibleQuizCount} quizzes — total weekly max stays the same.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  examEmptyCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examEmptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 14, marginBottom: 8, textAlign: 'center' },
  examEmptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  examCompletedCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examCompletedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  examCompletedTitle: { fontSize: 20, fontWeight: 'bold', flex: 1 },
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
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  examActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  examActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  closeAtCountdown: { fontSize: 12, fontWeight: '700' },
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
  splitNote: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});
