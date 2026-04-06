import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  BackHandler,
  AppState,
  Alert,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import * as Haptics from 'expo-haptics';
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
  getAnswerStatuses,
  formatTime,
} from '@/utils/exam/examEngine';
import { getExamTypeName } from '@/utils/exam/questionGenerator';
import { useTranslation } from 'react-i18next';

type Phase = 'loading' | 'intro' | 'playing' | 'feedback' | 'completed';

export default function ExamPlayScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const { user, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ examId: string; preview: string }>();
  const examId = params.examId || '';
  const isPreview = params.preview === 'true';

  const [phase, setPhase] = useState<Phase>('loading');
  const [examState, setExamState] = useState<ExamState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300);
  const [examType, setExamType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);

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

  // Block back navigation during active quiz (Android hardware back + iOS gesture blocked in _layout.tsx)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'playing' || phase === 'feedback') {
        return true; // Block back
      }
      return false; // Allow back during loading, intro, completed
    });
    return () => backHandler.remove();
  }, [phase]);

  // AppState listener: recalculate timer when app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && examStartedAtRef.current && timeLimitSeconds > 0) {
        const currentPhase = phaseRef.current;
        if (currentPhase === 'playing' || currentPhase === 'feedback') {
          const elapsed = Math.floor((Date.now() - examStartedAtRef.current) / 1000);
          const remaining = timeLimitSeconds - elapsed;

          if (remaining <= 0) {
            // Time expired while app was in background
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
  }, [timeLimitSeconds, isPreview]);

  // Load exam data
  useEffect(() => {
    loadExam();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadExam = async () => {
    try {
      // Fetch exam info
      const { data: examData, error: examError } = await (supabase
        .from('exams' as any) as any)
        .select('*')
        .eq('id', examId)
        .single();

      if (examError || !examData) {
        console.error('Failed to load exam:', examError);
        router.back();
        return;
      }

      setExamType(examData.exam_type);
      setTimeLimitSeconds(examData.time_limit_seconds);
      setTimeRemaining(examData.time_limit_seconds);

      // Check for existing attempt (anti-cheat: detect already completed or already started)
      if (!isPreview && user?.id) {
        const { data: existingResult } = await (supabase
          .from('exam_results' as any) as any)
          .select('id, completed_at, correct_count, started_at')
          .eq('exam_id', examId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingResult?.completed_at && existingResult?.correct_count > 0) {
          // Already completed — redirect back
          Alert.alert(
            isSpanish ? 'Examen Completado' : 'Quiz Already Completed',
            isSpanish ? 'Ya completaste este examen.' : 'You have already completed this quiz.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        }
      }

      // Fetch questions
      const { data: questionsData, error: questionsError } = await (supabase
        .from('exam_questions' as any) as any)
        .select('*')
        .eq('exam_id', examId)
        .order('question_order');

      if (questionsError || !questionsData || questionsData.length === 0) {
        console.error('Failed to load questions:', questionsError);
        router.back();
        return;
      }

      const state = createExamState(questionsData as ExamQuestion[]);
      setExamState({ ...state, phase: 'intro' });
      setPhase('intro');
    } catch (err) {
      console.error('Load exam error:', err);
      router.back();
    }
  };

  // Start timer — uses wall-clock time to prevent backgrounding exploit
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      if (!examStartedAtRef.current) return;
      const elapsed = Math.floor((Date.now() - examStartedAtRef.current) / 1000);
      const remaining = timeLimitSeconds - elapsed;

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeRemaining(0);
        // Time's up
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

  // Handle start quiz — registers server-side started_at to prevent force-close exploit
  const handleStart = async () => {
    if (!examState) return;

    if (!isPreview && user?.id) {
      try {
        const { data, error } = await (supabase.rpc as any)('start_exam_attempt', {
          p_exam_id: examId,
          p_user_id: user.id,
        });

        if (error) {
          console.error('start_exam_attempt error:', error);
          Alert.alert(
            isSpanish ? 'Error' : 'Error',
            isSpanish ? 'No se pudo iniciar el examen. Inténtalo de nuevo.' : 'Could not start the quiz. Please try again.'
          );
          return;
        }

        const attempt = Array.isArray(data) ? data[0] : data;

        if (attempt?.is_completed) {
          Alert.alert(
            isSpanish ? 'Examen Completado' : 'Quiz Already Completed',
            isSpanish ? 'Ya completaste este examen.' : 'You have already completed this quiz.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        }

        // Set the wall-clock start time from the server timestamp
        if (attempt?.started_at) {
          const serverStartMs = new Date(attempt.started_at).getTime();

          // Check if this is a resumed attempt (started_at is more than 5 seconds ago)
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
            // Resume with reduced time
            setTimeRemaining(remaining);
          }

          examStartedAtRef.current = serverStartMs;
        } else {
          examStartedAtRef.current = Date.now();
        }
      } catch (err) {
        console.error('start_exam_attempt exception:', err);
        Alert.alert(
          isSpanish ? 'Error' : 'Error',
          isSpanish ? 'No se pudo iniciar el examen. Inténtalo de nuevo.' : 'Could not start the quiz. Please try again.'
        );
        return;
      }
    } else {
      // Preview mode — just use local time
      examStartedAtRef.current = Date.now();
    }

    const started = startExam(examState);
    setExamState(started);
    setPhase('playing');
    if (timeLimitSeconds > 0) {
      startTimer();
    }
  };

  // Handle option selection
  const handleSelectOption = (option: 'A' | 'B' | 'C' | 'D') => {
    if (!examState || phase !== 'playing') return;
    const updated = selectOption(examState, option);
    setExamState(updated);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  // Handle next/submit
  const handleNext = () => {
    if (!examState || !examState.selectedOption) return;

    const currentQ = getCurrentQuestion(examState);
    if (!currentQ) return;

    const isCorrect = examState.selectedOption === currentQ.correct_option;
    setFeedbackCorrect(isCorrect);
    setPhase('feedback');

    try {
      Haptics.notificationAsync(
        isCorrect ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {}

    // After brief feedback delay, advance
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

  // Submit results to DB
  const submitResults = async (state: ExamState) => {
    if (!user?.id || submitting) return;
    setSubmitting(true);

    try {
      const results = calculateResults(state);

      await (supabase.rpc as any)('submit_exam_and_award_bucks', {
        p_exam_id: examId,
        p_user_id: user.id,
        p_answers: JSON.stringify(state.answers),
        p_correct_count: results.correctCount,
        p_total_questions: results.totalQuestions,
        p_bucks_awarded: results.totalBucksAwarded,
        p_time_seconds: results.timeSeconds,
        p_is_timed_out: state.isTimedOut,
      });

      // Refresh user to update McLoone's Bucks balance
      await refreshUser();
    } catch (err) {
      console.error('Submit results error:', err);
    }
    setSubmitting(false);
  };

  // Navigate to results
  const handleViewResults = () => {
    if (!examState) return;
    const results = calculateResults(examState);
    router.replace(
      `/exam-results?examId=${examId}&correctCount=${results.correctCount}&totalQuestions=${results.totalQuestions}&standardCorrect=${results.standardCorrect}&bonusCorrect=${results.bonusCorrect}&bonusBucksValue=${results.bonusBucksValue}&totalBucks=${results.totalBucksAwarded}&timeSeconds=${results.timeSeconds}&isTimedOut=${examState.isTimedOut}&preview=${isPreview}`
    );
  };

  if (phase === 'loading' || !examState) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const currentQuestion = getCurrentQuestion(examState);
  const answerStatuses = getAnswerStatuses(examState);
  const isTimeLow = timeLimitSeconds > 0 && timeRemaining <= 30;

  // INTRO SCREEN
  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.introContent}>
          {isPreview && (
            <View style={[styles.previewBanner, { backgroundColor: '#F59E0B' }]}>
              <IconSymbol ios_icon_name="eye.fill" android_material_icon_name="preview" size={18} color="#FFF" />
              <Text style={styles.previewBannerText}>{isSpanish ? 'Modo Vista Previa — los resultados no se guardarán' : 'Preview Mode — results will not be saved'}</Text>
            </View>
          )}

          <View style={[styles.introCard, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="doc.text.fill" android_material_icon_name="quiz" size={56} color={colors.primary} />
            <Text style={[styles.introTitle, { color: colors.text }]}>
              {isSpanish ? `Examen Semanal del ${getExamTypeName(examType as any, true)}` : `${getExamTypeName(examType as any)} Weekly Quiz`}
            </Text>
            <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>
              {examState.questions.length} {isSpanish ? 'Preguntas' : 'Questions'}
            </Text>

            <View style={[styles.introInfoRow, { backgroundColor: colors.background }]}>
              <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={20} color={colors.primary} />
              <Text style={[styles.introInfoText, { color: colors.text }]}>
                {timeLimitSeconds > 0
                  ? (isSpanish ? `Límite de Tiempo: ${formatTime(timeLimitSeconds)}` : `Time Limit: ${formatTime(timeLimitSeconds)}`)
                  : (isSpanish ? 'Sin Límite de Tiempo — toma tu tiempo' : 'No Time Limit — take your time')}
              </Text>
            </View>

            <View style={[styles.introInfoRow, { backgroundColor: colors.background }]}>
              <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={20} color="#10B981" />
              <Text style={[styles.introInfoText, { color: colors.text }]}>
                {isSpanish ? 'Gana $1 McLoone\'s Buck por respuesta correcta' : 'Earn $1 McLoone\'s Buck per correct answer'}
              </Text>
            </View>

            <View style={[styles.introInfoRow, { backgroundColor: colors.background }]}>
              <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={20} color="#F59E0B" />
              <Text style={[styles.introInfoText, { color: colors.text }]}>
                {timeLimitSeconds > 0
                  ? (isSpanish
                    ? 'No puedes volver a preguntas anteriores y el reloj seguirá corriendo una vez que comiences'
                    : 'You cannot go back to previous questions and the clock will continue to run once you start')
                  : (isSpanish
                    ? 'No puedes volver a preguntas anteriores'
                    : 'You cannot go back to previous questions')}
              </Text>
            </View>

            <View style={[styles.introInfoRow, { backgroundColor: colors.background }]}>
              <IconSymbol ios_icon_name="lock.shield.fill" android_material_icon_name="shield" size={20} color={colors.primary} />
              <Text style={[styles.introInfoText, { color: colors.text }]}>
                {isSpanish
                  ? 'No te preocupes, tus compañeros no podrán ver tus resultados'
                  : "Don't worry, your teammates will not be able to view your test scores"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            onPress={handleStart}
          >
            <Text style={styles.startButtonText}>{isSpanish ? 'Comenzar Examen' : 'Start Quiz'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{isSpanish ? 'Cancelar' : 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // COMPLETED SCREEN (brief before navigating to results)
  if (phase === 'completed') {
    const results = calculateResults(examState);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.completedContent}>
          {examState.isTimedOut && (
            <View style={[styles.timeoutBanner, { backgroundColor: '#EF4444' }]}>
              <IconSymbol ios_icon_name="clock.badge.exclamationmark.fill" android_material_icon_name="timer-off" size={22} color="#FFF" />
              <Text style={styles.timeoutBannerText}>{isSpanish ? '¡Se Acabó el Tiempo!' : "Time's Up!"}</Text>
            </View>
          )}

          <View style={[styles.completedCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.completedTitle, { color: colors.text }]}>{isSpanish ? '¡Examen Completo!' : 'Quiz Complete!'}</Text>

            <View style={[styles.scoreCircle, { borderColor: colors.primary }]}>
              <Text style={[styles.scoreNumber, { color: colors.primary }]}>
                {results.correctCount}/{results.totalQuestions}
              </Text>
            </View>

            <View style={[styles.bucksEarned, { backgroundColor: '#10B98115' }]}>
              <Text style={styles.bucksEarnedText}>+${results.totalBucksAwarded} McLoone's Bucks</Text>
            </View>

            {submitting && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.viewResultsButton, { backgroundColor: colors.primary }]}
            onPress={handleViewResults}
            disabled={submitting}
          >
            <Text style={styles.viewResultsText}>{isSpanish ? 'Ver Resultados Completos' : 'View Full Results'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // PLAYING / FEEDBACK SCREEN
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {isPreview && (
        <View style={[styles.previewBanner, { backgroundColor: '#F59E0B' }]}>
          <Text style={styles.previewBannerText}>{isSpanish ? 'Modo Vista Previa' : 'Preview Mode'}</Text>
        </View>
      )}

      {/* Top Bar: Progress indicators + Timer */}
      <View style={[styles.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.indicatorRow}>
          {answerStatuses.map((status, index) => {
            const isCurrent = index === examState.currentIndex && phase !== 'feedback';
            const question = examState.questions[index];
            return (
              <View
                key={index}
                style={[
                  styles.indicator,
                  status === 'correct' && styles.indicatorCorrect,
                  status === 'wrong' && styles.indicatorWrong,
                  status === 'unanswered' && { backgroundColor: colors.border },
                  isCurrent && { borderWidth: 2, borderColor: colors.primary },
                  question.is_bonus && { borderWidth: 2, borderColor: '#F59E0B' },
                ]}
              />
            );
          })}
        </View>

        {timeLimitSeconds > 0 ? (
          <View style={[styles.timerContainer, isTimeLow && styles.timerLow]}>
            <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={18} color={isTimeLow ? '#EF4444' : colors.primary} />
            <Text style={[styles.timerText, { color: isTimeLow ? '#EF4444' : colors.primary }]}>
              {formatTime(timeRemaining)}
            </Text>
          </View>
        ) : (
          <View style={styles.timerContainer}>
            <IconSymbol ios_icon_name="infinity" android_material_icon_name="all-inclusive" size={18} color={colors.primary} />
            <Text style={[styles.timerText, { color: colors.primary }]}>{isSpanish ? 'Sin Límite' : 'No Limit'}</Text>
          </View>
        )}
      </View>

      {/* Question Content */}
      {currentQuestion && (
        <View style={styles.questionContainer}>
          {/* Question number + bonus badge */}
          <View style={styles.questionMeta}>
            <Text style={[styles.questionCounter, { color: colors.textSecondary }]}>
              {isSpanish ? `Pregunta ${examState.currentIndex + 1} de ${examState.questions.length}` : `Question ${examState.currentIndex + 1} of ${examState.questions.length}`}
            </Text>
            {currentQuestion.is_bonus && (
              <View style={[styles.bonusBadge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.bonusBadgeText}>BONUS +${currentQuestion.bonus_bucks_value}</Text>
              </View>
            )}
          </View>

          {/* Question card */}
          <View style={[
            styles.questionCard,
            { backgroundColor: colors.card },
            currentQuestion.is_bonus && { borderWidth: 2, borderColor: '#F59E0B' },
          ]}>
            <Text style={[styles.questionText, { color: colors.text }]}>
              {isSpanish && (currentQuestion as any).question_text_es ? (currentQuestion as any).question_text_es : currentQuestion.question_text}
            </Text>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {(['A', 'B', 'C', 'D'] as const).map(letter => {
              const optionKey = `option_${letter.toLowerCase()}` as keyof ExamQuestion;
              const optionKeyEs = `${optionKey}_es`;
              const optionText = (isSpanish && (currentQuestion as any)[optionKeyEs]) ? (currentQuestion as any)[optionKeyEs] : currentQuestion[optionKey] as string;
              const isSelected = examState.selectedOption === letter;
              const showFeedback = phase === 'feedback';
              const isCorrectOption = letter === currentQuestion.correct_option;

              let optionBg = colors.card;
              let optionBorder = colors.border;
              let textColor = colors.text;

              if (showFeedback) {
                if (isCorrectOption) {
                  optionBg = '#10B98120';
                  optionBorder = '#10B981';
                  textColor = '#10B981';
                } else if (isSelected && !isCorrectOption) {
                  optionBg = '#EF444420';
                  optionBorder = '#EF4444';
                  textColor = '#EF4444';
                }
              } else if (isSelected) {
                optionBg = colors.primary + '15';
                optionBorder = colors.primary;
                textColor = colors.primary;
              }

              return (
                <TouchableOpacity
                  key={letter}
                  style={[styles.optionCard, { backgroundColor: optionBg, borderColor: optionBorder }]}
                  onPress={() => handleSelectOption(letter)}
                  disabled={phase === 'feedback'}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionLetterCircle, { backgroundColor: isSelected ? colors.primary : colors.background, borderColor: optionBorder }]}>
                    <Text style={[styles.optionLetterText, { color: isSelected ? '#FFF' : colors.textSecondary }]}>{letter}</Text>
                  </View>
                  <Text style={[styles.optionCardText, { color: textColor }]} numberOfLines={3}>{optionText}</Text>
                  {showFeedback && isCorrectOption && (
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={22} color="#10B981" />
                  )}
                  {showFeedback && isSelected && !isCorrectOption && (
                    <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={22} color="#EF4444" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Next Button */}
          {phase === 'playing' && (
            <TouchableOpacity
              style={[
                styles.nextButton,
                { backgroundColor: examState.selectedOption ? colors.primary : colors.border },
              ]}
              onPress={handleNext}
              disabled={!examState.selectedOption}
            >
              <Text style={[styles.nextButtonText, { color: examState.selectedOption ? '#FFF' : colors.textSecondary }]}>
                {examState.currentIndex >= examState.questions.length - 1
                  ? (isSpanish ? 'Enviar' : 'Submit')
                  : (isSpanish ? 'Siguiente' : 'Next')}
              </Text>
              <IconSymbol
                ios_icon_name="arrow.right"
                android_material_icon_name="arrow-forward"
                size={20}
                color={examState.selectedOption ? '#FFF' : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Preview banner
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  previewBannerText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  indicatorRow: { flexDirection: 'row', gap: 6, flex: 1 },
  indicator: { width: 24, height: 8, borderRadius: 4 },
  indicatorCorrect: { backgroundColor: '#10B981' },
  indicatorWrong: { backgroundColor: '#EF4444' },
  timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 12 },
  timerLow: {},
  timerText: { fontSize: 18, fontWeight: 'bold' },

  // Intro
  introContent: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  introCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
    elevation: 5,
  },
  introTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 20, marginBottom: 4 },
  introSubtitle: { fontSize: 16, marginBottom: 24 },
  introInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 8,
  },
  introInfoText: { fontSize: 14, flex: 1 },
  startButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  startButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  cancelLink: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 16 },

  // Question content
  questionContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  questionMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  questionCounter: { fontSize: 14, fontWeight: '600' },
  bonusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  bonusBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  questionCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  questionText: { fontSize: 18, fontWeight: '600', lineHeight: 26 },

  // Options
  optionsContainer: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  optionLetterCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterText: { fontSize: 16, fontWeight: '700' },
  optionCardText: { flex: 1, fontSize: 15, lineHeight: 20 },

  // Next button
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
    marginBottom: 32,
    gap: 8,
  },
  nextButtonText: { fontSize: 17, fontWeight: '700' },

  // Completed
  completedContent: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  timeoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
  },
  timeoutBannerText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  completedCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
    elevation: 5,
  },
  completedTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  scoreNumber: { fontSize: 32, fontWeight: '800' },
  bucksEarned: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  bucksEarnedText: { color: '#10B981', fontSize: 20, fontWeight: '700' },
  viewResultsButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  viewResultsText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
