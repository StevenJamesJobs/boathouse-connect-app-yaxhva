import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Switch,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateQuizQuestions, generatePhotoQuestion, getCurrentWeekKey, getExamTypeName } from '@/utils/exam/questionGenerator';
import type { ExamType } from '@/utils/exam/questionGenerator';
import { formatTime, formatCountdown, getCountdownUrgency } from '@/utils/exam/examEngine';
import { sendCustomNotification } from '@/utils/notificationHelpers';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

interface Exam {
  id: string;
  exam_type: string;
  cycle_key: string;
  status: 'draft' | 'active' | 'closed';
  time_limit_seconds: number;
  created_by: string;
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
  close_at: string | null;
  notify_on_activate: boolean | null;
}

interface ExamQuestion {
  id: string;
  exam_id: string;
  question_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  is_bonus: boolean;
  bonus_bucks_value: number | null;
  source_type: 'auto' | 'custom' | 'bonus';
  source_table: string | null;
  question_image_url?: string | null;
}

interface CompletionEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  job_title: string;
  has_completed: boolean;
  correct_count: number;
  total_questions: number;
  bucks_awarded: number;
}

type ActiveSection = 'questions' | 'tracker';

export default function ExamEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ type: string }>();
  const examType = (params.type || 'server') as ExamType;

  const [activeSection, setActiveSection] = useState<ActiveSection>('questions');
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [completionData, setCompletionData] = useState<CompletionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showAddBonus, setShowAddBonus] = useState(false);
  const [timeLimit, setTimeLimit] = useState(300);
  const [questionCount, setQuestionCount] = useState(5);

  // Custom question form state
  const [customText, setCustomText] = useState('');
  const [customA, setCustomA] = useState('');
  const [customB, setCustomB] = useState('');
  const [customC, setCustomC] = useState('');
  const [customD, setCustomD] = useState('');
  const [customCorrect, setCustomCorrect] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [bonusBucksValue, setBonusBucksValue] = useState('5');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Close-at scheduling + Notify Staff toggle
  const [closeAt, setCloseAt] = useState<Date | null>(null);
  const [notifyOnActivate, setNotifyOnActivate] = useState(false);
  const [showCloseDatePicker, setShowCloseDatePicker] = useState(false);
  const [showCloseTimePicker, setShowCloseTimePicker] = useState(false);
  // Countdown tick state — forces re-render every second while a close_at is set
  const [countdownTick, setCountdownTick] = useState(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCurrentExam = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-close any active exams whose close_at has passed. Fire-and-forget
      // — if it fails we still show the (now slightly stale) data below.
      try {
        await (supabase.rpc as any)('close_expired_exams');
      } catch (cleanupErr) {
        console.warn('close_expired_exams cleanup failed:', cleanupErr);
      }

      // Get the most recent draft or active exam for this type
      const { data, error } = await (supabase
        .from('exams' as any) as any)
        .select('*')
        .eq('exam_type', examType)
        .in('status', ['draft', 'active'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const exam = data[0] as Exam;
        setCurrentExam(exam);
        setTimeLimit(exam.time_limit_seconds);
        setCloseAt(exam.close_at ? new Date(exam.close_at) : null);
        setNotifyOnActivate(Boolean(exam.notify_on_activate));
        await fetchQuestions(exam.id);
        if (exam.status === 'active') {
          await fetchCompletionData(exam.id);
        }
      } else {
        setCurrentExam(null);
        setQuestions([]);
        setCloseAt(null);
        setNotifyOnActivate(false);
      }
    } catch (err) {
      console.error('Error fetching exam:', err);
    }
    setLoading(false);
  }, [examType]);

  // Tick a countdown re-render once per second while a close_at is active,
  // so the "Closes in …" label updates live.
  useEffect(() => {
    if (!closeAt || !currentExam || currentExam.status === 'closed') {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdownTick(t => (t + 1) % 1_000_000);
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [closeAt, currentExam?.status]);

  const fetchQuestions = async (examId: string) => {
    const { data, error } = await (supabase
      .from('exam_questions' as any) as any)
      .select('*')
      .eq('exam_id', examId)
      .order('question_order');

    if (!error && data) {
      setQuestions(data as ExamQuestion[]);
    }
  };

  const fetchCompletionData = async (examId: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_exam_completion_status', {
        p_exam_id: examId,
        p_exam_type: examType,
      });

      if (!error && data) {
        setCompletionData(data as CompletionEntry[]);
      }
    } catch (err) {
      console.error('Error fetching completion data:', err);
    }
  };

  useEffect(() => {
    fetchCurrentExam();
  }, [fetchCurrentExam]);

  // Generate new quiz
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const cycleKey = getCurrentWeekKey();

      // Create the exam record
      const { data: examData, error: examError } = await (supabase
        .from('exams' as any) as any)
        .insert({
          exam_type: examType,
          cycle_key: cycleKey,
          status: 'draft',
          time_limit_seconds: 300,
          created_by: user?.id,
        })
        .select()
        .single();

      if (examError) {
        // If duplicate cycle_key, generate a unique one
        if (examError.message?.includes('duplicate') || examError.message?.includes('unique')) {
          const uniqueKey = `${cycleKey}-${Date.now().toString(36)}`;
          const { data: retryData, error: retryError } = await (supabase
            .from('exams' as any) as any)
            .insert({
              exam_type: examType,
              cycle_key: uniqueKey,
              status: 'draft',
              time_limit_seconds: 300,
              created_by: user?.id,
            })
            .select()
            .single();

          if (retryError) throw retryError;
          if (!retryData) throw new Error('No data returned');

          const exam = retryData as Exam;
          await generateAndSaveQuestions(exam.id, uniqueKey);
          setCurrentExam(exam);
          setTimeLimit(exam.time_limit_seconds);
          await fetchQuestions(exam.id);
        } else {
          throw examError;
        }
      } else if (examData) {
        const exam = examData as Exam;
        await generateAndSaveQuestions(exam.id, cycleKey);
        setCurrentExam(exam);
        setTimeLimit(exam.time_limit_seconds);
        await fetchQuestions(exam.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate quiz');
      console.error('Generate error:', err);
    }
    setGenerating(false);
  };

  const generateAndSaveQuestions = async (examId: string, cycleKey: string) => {
    const generatedQuestions = await generateQuizQuestions(examType, cycleKey, questionCount);

    const questionsToInsert = generatedQuestions.map((q, index) => ({
      exam_id: examId,
      question_order: index + 1,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      is_bonus: false,
      bonus_bucks_value: null,
      source_type: q.source_type,
      source_table: q.source_table,
      question_text_es: q.question_text_es || null,
      option_a_es: q.option_a_es || null,
      option_b_es: q.option_b_es || null,
      option_c_es: q.option_c_es || null,
      option_d_es: q.option_d_es || null,
      question_image_url: q.question_image_url || null,
    }));

    const { error } = await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
    if (error) throw error;
  };

  // Update time limit
  const handleUpdateTimeLimit = async (newSeconds: number) => {
    if (!currentExam) return;
    setTimeLimit(newSeconds);
    await (supabase.from('exams' as any) as any).update({ time_limit_seconds: newSeconds }).eq('id', currentExam.id);
  };

  // Activate quiz
  const handleActivate = () => {
    if (!currentExam || questions.length === 0) {
      Alert.alert('Error', 'No questions to activate. Generate or add questions first.');
      return;
    }

    Alert.alert(
      'Activate Quiz',
      `This will make the ${getExamTypeName(examType)} Weekly Quiz live for all employees. Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            try {
              // Close any previously active exam of this type
              await (supabase
                .from('exams' as any) as any)
                .update({ status: 'closed', closed_at: new Date().toISOString() })
                .eq('exam_type', examType)
                .eq('status', 'active');

              // Default close_at = 7 days from now at 23:59 local if unset
              let effectiveCloseAt = closeAt;
              if (!effectiveCloseAt) {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                d.setHours(23, 59, 0, 0);
                effectiveCloseAt = d;
                setCloseAt(d);
              }

              // Activate current exam
              await (supabase
                .from('exams' as any) as any)
                .update({
                  status: 'active',
                  activated_at: new Date().toISOString(),
                  close_at: effectiveCloseAt.toISOString(),
                  // Reset the notify flag after activation so re-activation
                  // requires re-arming and we don't double-notify on reopen.
                  notify_on_activate: false,
                })
                .eq('id', currentExam.id);

              // Fire push if the manager armed the toggle
              if (notifyOnActivate) {
                try {
                  const jobTitlesByType: Record<string, string[]> = {
                    server: ['Server', 'Lead Server', 'Busser', 'Runner'],
                    bartender: ['Bartender'],
                    host: ['Host'],
                  };
                  const targetJobTitles = jobTitlesByType[examType] || [];
                  const examTypeLabel = getExamTypeName(examType);
                  await sendCustomNotification(
                    'New Weekly Quiz Available',
                    `Your ${examTypeLabel} quiz is live — tap to take it.`,
                    {
                      destination: 'weekly-quizzes',
                      exam_id: currentExam.id,
                      job_titles: targetJobTitles,
                    }
                  );
                } catch (pushErr) {
                  // Non-fatal: activation still succeeded.
                  console.error('Notify Staff push failed:', pushErr);
                }
              }

              setNotifyOnActivate(false);
              await fetchCurrentExam();
              Alert.alert('Quiz Activated', 'The quiz is now live for employees!');
            } catch (err) {
              console.error('Activate error:', err);
            }
          },
        },
      ]
    );
  };

  // Persist a new close_at value (draft or active)
  const handleUpdateCloseAt = async (next: Date | null) => {
    if (!currentExam) return;
    setCloseAt(next);
    try {
      await (supabase
        .from('exams' as any) as any)
        .update({ close_at: next ? next.toISOString() : null })
        .eq('id', currentExam.id);
    } catch (err) {
      console.error('Update close_at error:', err);
    }
  };

  // Persist the Notify Staff toggle (draft only)
  const handleToggleNotifyOnActivate = async (next: boolean) => {
    if (!currentExam || currentExam.status !== 'draft') return;
    setNotifyOnActivate(next);
    try {
      await (supabase
        .from('exams' as any) as any)
        .update({ notify_on_activate: next })
        .eq('id', currentExam.id);
    } catch (err) {
      console.error('Toggle notify_on_activate error:', err);
    }
  };

  // Close quiz
  const handleClose = () => {
    if (!currentExam) return;

    Alert.alert(
      'Close Quiz',
      'This will close the current quiz. Employees who haven\'t taken it will no longer be able to.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            await (supabase
              .from('exams' as any) as any)
              .update({ status: 'closed', closed_at: new Date().toISOString() })
              .eq('id', currentExam.id);

            setCurrentExam(null);
            setQuestions([]);
            setCompletionData([]);
          },
        },
      ]
    );
  };

  // Reset and start new
  const handleResetAndNew = () => {
    Alert.alert(
      'Reset & New Quiz',
      'This will close the current quiz and start fresh. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (currentExam) {
              await (supabase
                .from('exams' as any) as any)
                .update({ status: 'closed', closed_at: new Date().toISOString() })
                .eq('id', currentExam.id);
            }
            setCurrentExam(null);
            setQuestions([]);
            setCompletionData([]);
          },
        },
      ]
    );
  };

  // Add custom question
  const handleAddCustom = async (isBonus: boolean = false) => {
    if (!currentExam) return;
    if (!customText.trim() || !customA.trim() || !customB.trim() || !customC.trim() || !customD.trim()) {
      Alert.alert('Error', 'Please fill in the question and all four options.');
      return;
    }

    const nextOrder = questions.length > 0 ? Math.max(...questions.map(q => q.question_order)) + 1 : 1;
    const bonusValue = isBonus ? parseInt(bonusBucksValue) || 5 : null;

    const { error } = await (supabase.from('exam_questions' as any) as any).insert({
      exam_id: currentExam.id,
      question_order: nextOrder,
      question_text: customText.trim(),
      option_a: customA.trim(),
      option_b: customB.trim(),
      option_c: customC.trim(),
      option_d: customD.trim(),
      correct_option: customCorrect,
      is_bonus: isBonus,
      bonus_bucks_value: bonusValue,
      source_type: isBonus ? 'bonus' : 'custom',
      source_table: null,
      question_image_url: customImageUrl,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      resetCustomForm();
      setShowAddCustom(false);
      setShowAddBonus(false);
      await fetchQuestions(currentExam.id);
    }
  };

  // Delete question
  const handleDeleteQuestion = (question: ExamQuestion) => {
    Alert.alert(
      'Delete Question',
      'Are you sure you want to delete this question?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await (supabase.from('exam_questions' as any) as any).delete().eq('id', question.id);
            if (currentExam) await fetchQuestions(currentExam.id);
          },
        },
      ]
    );
  };

  // Refresh single question — regenerate just one question
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);

  const handleRefreshQuestion = async (question: ExamQuestion) => {
    if (!currentExam) return;
    setRefreshingQuestionId(question.id);
    try {
      // If the current question has an image, regenerate another photo
      // question against the same pool (this yields a fresh item + prompt).
      // Otherwise fall back to the text-template batch path below.
      let newQuestion = null as any;
      if (question.question_image_url) {
        const photo = await generatePhotoQuestion(
          [],
          `${currentExam.cycle_key}-photo-refresh-${question.id}-${Date.now()}`,
        );
        if (photo && photo.question_text !== question.question_text) {
          newQuestion = photo;
        }
      }

      if (!newQuestion) {
        // Generate a batch of questions and pick one that's different from the current
        const cycleKey = currentExam.cycle_key + '-refresh-' + Date.now().toString(36);
        const generated = await generateQuizQuestions(examType, cycleKey, 5);

        // Find one that doesn't duplicate existing questions
        const existingTexts = new Set(questions.map(q => q.question_text));
        newQuestion = generated.find(q => !existingTexts.has(q.question_text)) || generated[0];
      }

      if (newQuestion) {
        const { error } = await (supabase
          .from('exam_questions' as any) as any)
          .update({
            question_text: newQuestion.question_text,
            option_a: newQuestion.option_a,
            option_b: newQuestion.option_b,
            option_c: newQuestion.option_c,
            option_d: newQuestion.option_d,
            correct_option: newQuestion.correct_option,
            source_type: newQuestion.source_type,
            source_table: newQuestion.source_table,
            question_text_es: newQuestion.question_text_es || null,
            option_a_es: newQuestion.option_a_es || null,
            option_b_es: newQuestion.option_b_es || null,
            option_c_es: newQuestion.option_c_es || null,
            option_d_es: newQuestion.option_d_es || null,
            question_image_url: newQuestion.question_image_url ?? null,
          })
          .eq('id', question.id);

        if (error) {
          Alert.alert('Error', error.message);
        } else {
          await fetchQuestions(currentExam.id);
        }
      }
    } catch (err) {
      console.error('Refresh question error:', err);
      Alert.alert('Error', 'Failed to refresh question');
    }
    setRefreshingQuestionId(null);
  };

  // Save edited question
  const handleSaveEdit = async () => {
    if (!editingQuestion) return;

    const { error } = await (supabase
      .from('exam_questions' as any) as any)
      .update({
        question_text: editingQuestion.question_text,
        option_a: editingQuestion.option_a,
        option_b: editingQuestion.option_b,
        option_c: editingQuestion.option_c,
        option_d: editingQuestion.option_d,
        correct_option: editingQuestion.correct_option,
        bonus_bucks_value: editingQuestion.bonus_bucks_value,
        question_image_url: editingQuestion.question_image_url ?? null,
      })
      .eq('id', editingQuestion.id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEditingQuestion(null);
      if (currentExam) await fetchQuestions(currentExam.id);
    }
  };

  // Preview quiz
  const handlePreview = () => {
    if (!currentExam || questions.length === 0) return;
    router.push(`/exam-play?examId=${currentExam.id}&preview=true`);
  };

  const resetCustomForm = () => {
    setCustomText('');
    setCustomA('');
    setCustomB('');
    setCustomC('');
    setCustomD('');
    setCustomCorrect('A');
    setBonusBucksValue('5');
    setCustomImageUrl(null);
  };

  // ─── Image picker / upload for picture questions ───────────────────
  // Reuses the menu-editor pattern: pick via ImagePicker → base64 →
  // Uint8Array → upload to the 'menu-items' bucket under the
  // quiz-questions/ subfolder → return the public URL.
  const pickAndUploadQuizImage = async (): Promise<string | null> => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'We need photo library access to attach an image.');
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return null;

      setUploadingImage(true);
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);

      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `quiz-questions/${Date.now()}.${ext}`;
      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'webp') contentType = 'image/webp';

      const { error } = await supabase.storage
        .from('menu-items')
        .upload(fileName, byteArray, { contentType, upsert: false });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('menu-items').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err: any) {
      console.error('Quiz image upload error:', err);
      Alert.alert('Upload Failed', err?.message || 'Could not upload image.');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAttachPhotoToCustomForm = async () => {
    const url = await pickAndUploadQuizImage();
    if (url) setCustomImageUrl(url);
  };

  const handleAttachPhotoToEditingQuestion = async () => {
    if (!editingQuestion) return;
    const url = await pickAndUploadQuizImage();
    if (url) setEditingQuestion({ ...editingQuestion, question_image_url: url });
  };

  const handleRemovePhotoFromEditingQuestion = () => {
    if (!editingQuestion) return;
    setEditingQuestion({ ...editingQuestion, question_image_url: null });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return '#F59E0B';
      case 'active': return '#10B981';
      case 'closed': return '#EF4444';
      default: return colors.textSecondary;
    }
  };

  const getSourceLabel = (q: ExamQuestion) => {
    if (q.source_type === 'bonus') return 'BONUS';
    if (q.source_type === 'custom') return 'CUSTOM';
    return (q.source_table || 'auto').replace(/_/g, ' ').toUpperCase();
  };

  // Reset a specific user's quiz result so they can retake
  const handleResetUserQuiz = (entry: CompletionEntry) => {
    if (!currentExam) return;

    Alert.alert(
      'Allow Retake',
      `This will reset ${entry.name}'s quiz result and allow them to retake the quiz. Their McLoone's Bucks from this quiz will NOT be revoked. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete their exam result (including started_at record)
              await (supabase
                .from('exam_results' as any) as any)
                .delete()
                .eq('exam_id', currentExam.id)
                .eq('user_id', entry.user_id);

              // Also delete any reward dismissals for this result
              await (supabase
                .from('exam_reward_dismissals' as any) as any)
                .delete()
                .eq('user_id', entry.user_id);

              // Refresh tracker data
              await fetchCompletionData(currentExam.id);
              Alert.alert('Success', `${entry.name} can now retake the quiz.`);
            } catch (err) {
              console.error('Reset user quiz error:', err);
              Alert.alert('Error', 'Failed to reset quiz result.');
            }
          },
        },
      ]
    );
  };

  const completedCount = completionData.filter(e => e.has_completed).length;
  const totalEmployees = completionData.length;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{getExamTypeName(examType)} Quiz Editor</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{getExamTypeName(examType)} Quiz Editor</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Selector (only show when there's an active exam) */}
      {currentExam?.status === 'active' && (
        <View style={styles.tabWrapper}>
          <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.tab, activeSection === 'questions' && { backgroundColor: colors.highlight }]}
              onPress={() => setActiveSection('questions')}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeSection === 'questions' && { color: colors.text }]}>
                Questions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeSection === 'tracker' && { backgroundColor: colors.highlight }]}
              onPress={() => { setActiveSection('tracker'); if (currentExam) fetchCompletionData(currentExam.id); }}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeSection === 'tracker' && { color: colors.text }]}>
                Tracker ({completedCount}/{totalEmployees})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* No Exam State */}
        {!currentExam && (
          <>
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <IconSymbol ios_icon_name="doc.questionmark.fill" android_material_icon_name="quiz" size={48} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Quiz</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                Generate a new weekly quiz to get started. Questions will be auto-created from menu data, recipes, and more.
              </Text>
            </View>

            {/* Question Count Selector */}
            <View style={[styles.questionCountCard, { backgroundColor: colors.card }]}>
              <View style={styles.timeLimitHeader}>
                <IconSymbol ios_icon_name="number.circle.fill" android_material_icon_name="format-list-numbered" size={22} color={colors.primary} />
                <Text style={[styles.timeLimitTitle, { color: colors.text }]}>Number of Questions</Text>
              </View>
              <Text style={[styles.timeLimitDisplay, { color: colors.primary }]}>{questionCount}</Text>
              <View style={styles.timeLimitButtons}>
                {[5, 10, 15, 20, 25, 30].map(count => (
                  <TouchableOpacity
                    key={count}
                    style={[
                      styles.timeLimitOption,
                      { backgroundColor: questionCount === count ? colors.primary : colors.background, borderColor: colors.border },
                    ]}
                    onPress={() => setQuestionCount(count)}
                  >
                    <Text style={[
                      styles.timeLimitOptionText,
                      { color: questionCount === count ? '#FFF' : colors.text },
                    ]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customCountRow}>
                <Text style={[styles.customCountLabel, { color: colors.textSecondary }]}>Custom:</Text>
                <TextInput
                  style={[styles.customCountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  keyboardType="number-pad"
                  value={String(questionCount)}
                  onChangeText={(val) => {
                    const num = parseInt(val);
                    if (!isNaN(num) && num >= 1 && num <= 100) setQuestionCount(num);
                    else if (val === '') setQuestionCount(5);
                  }}
                  maxLength={3}
                  placeholder="5"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.generateButton, { backgroundColor: colors.primary }]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <IconSymbol ios_icon_name="wand.and.stars" android_material_icon_name="auto-awesome" size={22} color="#FFF" />
                  <Text style={styles.generateButtonText}>Generate {questionCount} Questions</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Exam Exists */}
        {currentExam && activeSection === 'questions' && (
          <>
            {/* Status Card */}
            <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
              <View style={styles.statusRow}>
                <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentExam.status) + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(currentExam.status) }]}>
                    {currentExam.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Questions</Text>
                <Text style={[styles.statusValue, { color: colors.text }]}>{questions.length}</Text>
              </View>

              {/* Closes At row — editable while draft or active */}
              {currentExam.status !== 'closed' && (
                <TouchableOpacity
                  style={styles.statusRow}
                  onPress={() => setShowCloseDatePicker(true)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Closes At</Text>
                  <View style={styles.closeAtRight}>
                    {closeAt ? (
                      (() => {
                        const msRemaining = closeAt.getTime() - Date.now();
                        const urgency = getCountdownUrgency(msRemaining);
                        const color =
                          urgency === 'red' ? '#EF4444'
                          : urgency === 'amber' ? '#F59E0B'
                          : urgency === 'expired' ? '#9CA3AF'
                          : colors.text;
                        return (
                          <>
                            <Text style={[styles.statusValue, { color }]}>
                              {formatCountdown(msRemaining)}
                            </Text>
                            <Text style={[styles.closeAtDate, { color: colors.textSecondary }]}>
                              {closeAt.toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </Text>
                          </>
                        );
                      })()
                    ) : (
                      <Text style={[styles.statusValue, { color: colors.primary }]}>Set date/time</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              {closeAt && currentExam.status !== 'closed' && (
                <View style={styles.closeAtActions}>
                  <TouchableOpacity
                    style={[styles.closeAtClearBtn, { borderColor: colors.border }]}
                    onPress={() => handleUpdateCloseAt(null)}
                  >
                    <Text style={[styles.closeAtClearText, { color: colors.textSecondary }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Notify Staff toggle — draft only */}
              {currentExam.status === 'draft' && (
                <View style={styles.statusRow}>
                  <View style={styles.notifyLabelCol}>
                    <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Notify Staff</Text>
                    <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>
                      Send a push notification when activated
                    </Text>
                  </View>
                  <Switch
                    value={notifyOnActivate}
                    onValueChange={handleToggleNotifyOnActivate}
                    trackColor={{ false: colors.border, true: colors.primary + '80' }}
                    thumbColor={notifyOnActivate ? colors.primary : '#F4F3F4'}
                  />
                </View>
              )}
            </View>

            {/* Time Limit */}
            <View style={[styles.timeLimitCard, { backgroundColor: colors.card }]}>
              <View style={styles.timeLimitHeader}>
                <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={22} color={colors.primary} />
                <Text style={[styles.timeLimitTitle, { color: colors.text }]}>Time Limit</Text>
              </View>
              <Text style={[styles.timeLimitDisplay, { color: colors.primary }]}>
                {timeLimit === 0 ? 'No Limit' : formatTime(timeLimit)}
              </Text>
              <View style={styles.timeLimitButtons}>
                {[60, 105, 120, 180, 240, 300, 360, 420, 480, 0].map(secs => (
                  <TouchableOpacity
                    key={secs}
                    style={[
                      styles.timeLimitOption,
                      { backgroundColor: timeLimit === secs ? colors.primary : colors.background, borderColor: colors.border },
                    ]}
                    onPress={() => handleUpdateTimeLimit(secs)}
                    disabled={currentExam.status === 'active'}
                  >
                    <Text style={[
                      styles.timeLimitOptionText,
                      { color: timeLimit === secs ? '#FFF' : colors.text },
                    ]}>
                      {secs === 0 ? '∞' : formatTime(secs)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Questions List */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Questions</Text>
            {questions.map((q, index) => (
              <View
                key={q.id}
                style={[
                  styles.questionCard,
                  { backgroundColor: colors.card },
                  q.is_bonus && { borderWidth: 2, borderColor: '#F59E0B' },
                ]}
              >
                <View style={styles.questionHeader}>
                  <View style={styles.questionNumberContainer}>
                    <Text style={[styles.questionNumber, { color: colors.primary }]}>Q{q.question_order}</Text>
                    <View style={[styles.sourceChip, { backgroundColor: q.is_bonus ? '#F59E0B20' : colors.primary + '15' }]}>
                      <Text style={[styles.sourceChipText, { color: q.is_bonus ? '#F59E0B' : colors.primary }]}>
                        {getSourceLabel(q)}
                      </Text>
                    </View>
                    {q.is_bonus && (
                      <View style={[styles.sourceChip, { backgroundColor: '#F59E0B20' }]}>
                        <Text style={[styles.sourceChipText, { color: '#F59E0B' }]}>
                          ${q.bonus_bucks_value}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.questionActions}>
                    {currentExam.status === 'draft' && (
                      <>
                        {q.source_type === 'auto' && (
                          <TouchableOpacity
                            onPress={() => handleRefreshQuestion(q)}
                            style={styles.actionButton}
                            disabled={refreshingQuestionId === q.id}
                          >
                            {refreshingQuestionId === q.id ? (
                              <ActivityIndicator size={16} color={colors.primary} />
                            ) : (
                              <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={18} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => setEditingQuestion(q)} style={styles.actionButton}>
                          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteQuestion(q)} style={styles.actionButton}>
                          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
                {q.question_image_url && (
                  <Image
                    source={{ uri: q.question_image_url }}
                    style={styles.questionCardImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={[styles.questionText, { color: colors.text }]}>{q.question_text}</Text>
                <View style={styles.optionsList}>
                  {(['A', 'B', 'C', 'D'] as const).map(letter => {
                    const optionText = q[`option_${letter.toLowerCase()}` as keyof ExamQuestion] as string;
                    const isCorrect = q.correct_option === letter;
                    return (
                      <View
                        key={letter}
                        style={[
                          styles.optionRow,
                          isCorrect && { backgroundColor: '#10B98115' },
                        ]}
                      >
                        <Text style={[
                          styles.optionLetter,
                          { color: isCorrect ? '#10B981' : colors.textSecondary },
                          isCorrect && { fontWeight: 'bold' },
                        ]}>
                          {letter}.
                        </Text>
                        <Text style={[
                          styles.optionText,
                          { color: isCorrect ? '#10B981' : colors.text },
                          isCorrect && { fontWeight: '600' },
                        ]}>
                          {optionText}
                        </Text>
                        {isCorrect && (
                          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={16} color="#10B981" />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Add Buttons (draft only) */}
            {currentExam.status === 'draft' && (
              <>
                <TouchableOpacity
                  style={[styles.addQuestionButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                  onPress={() => { resetCustomForm(); setShowAddCustom(true); }}
                >
                  <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
                  <Text style={[styles.addQuestionText, { color: colors.primary }]}>Add Custom Question</Text>
                </TouchableOpacity>

                {!questions.some(q => q.is_bonus) && (
                  <TouchableOpacity
                    style={[styles.addQuestionButton, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B' }]}
                    onPress={() => { resetCustomForm(); setShowAddBonus(true); }}
                  >
                    <IconSymbol ios_icon_name="star.circle.fill" android_material_icon_name="stars" size={20} color="#F59E0B" />
                    <Text style={[styles.addQuestionText, { color: '#F59E0B' }]}>Add Bonus Question</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Action Buttons */}
            <View style={styles.actionSection}>
              {currentExam.status === 'draft' && (
                <>
                  <TouchableOpacity
                    style={[styles.previewButton, { borderColor: colors.primary }]}
                    onPress={handlePreview}
                  >
                    <IconSymbol ios_icon_name="eye.fill" android_material_icon_name="preview" size={20} color={colors.primary} />
                    <Text style={[styles.previewButtonText, { color: colors.primary }]}>Preview Quiz</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.activateButton, { backgroundColor: '#10B981' }]}
                    onPress={handleActivate}
                  >
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={22} color="#FFF" />
                    <Text style={styles.activateButtonText}>Activate Quiz</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentExam.status === 'active' && (
                <TouchableOpacity
                  style={[styles.closeButton, { borderColor: '#EF4444' }]}
                  onPress={handleClose}
                >
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color="#EF4444" />
                  <Text style={[styles.closeButtonText, { color: '#EF4444' }]}>Close Quiz</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.resetButton, { borderColor: colors.textSecondary }]}
                onPress={handleResetAndNew}
              >
                <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={18} color={colors.textSecondary} />
                <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>Reset & New Quiz</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Completion Tracker */}
        {currentExam && activeSection === 'tracker' && (
          <>
            <View style={[styles.trackerSummary, { backgroundColor: colors.card }]}>
              <Text style={[styles.trackerSummaryText, { color: colors.text }]}>
                {completedCount} of {totalEmployees} completed
              </Text>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: '#10B981', width: totalEmployees > 0 ? `${(completedCount / totalEmployees) * 100}%` : '0%' },
                  ]}
                />
              </View>
            </View>

            {completionData.map(entry => (
              <View key={entry.user_id} style={[styles.trackerRow, { backgroundColor: colors.card }]}>
                <View style={styles.trackerAvatar}>
                  {entry.profile_picture_url ? (
                    <Image source={{ uri: entry.profile_picture_url }} style={styles.trackerAvatarImage} />
                  ) : (
                    <View style={[styles.trackerAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.trackerAvatarInitial, { color: colors.primary }]}>
                        {entry.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.trackerInfo}>
                  <Text style={[styles.trackerName, { color: colors.text }]}>{entry.name}</Text>
                  <Text style={[styles.trackerJob, { color: colors.textSecondary }]}>{entry.job_title}</Text>
                </View>
                {entry.has_completed ? (
                  <View style={styles.trackerResultContainer}>
                    <View style={styles.trackerResult}>
                      <Text style={[styles.trackerScore, { color: '#10B981' }]}>
                        {entry.correct_count}/{entry.total_questions}
                      </Text>
                      <Text style={[styles.trackerBucks, { color: '#10B981' }]}>
                        +${entry.bucks_awarded}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.retakeButton, { borderColor: colors.primary }]}
                      onPress={() =>
                        router.push(
                          `/exam-answer-review?examId=${currentExam.id}&userId=${entry.user_id}` as any
                        )
                      }
                    >
                      <IconSymbol ios_icon_name="doc.text.magnifyingglass" android_material_icon_name="pageview" size={12} color={colors.primary} />
                      <Text style={[styles.retakeButtonText, { color: colors.primary }]}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retakeButton, { borderColor: colors.primary }]}
                      onPress={() => handleResetUserQuiz(entry)}
                    >
                      <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={12} color={colors.primary} />
                      <Text style={[styles.retakeButtonText, { color: colors.primary }]}>Retake</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.notTakenBadge, { backgroundColor: '#EF444420' }]}>
                    <Text style={styles.notTakenText}>Not Taken</Text>
                  </View>
                )}
              </View>
            ))}

            {completionData.length === 0 && (
              <Text style={[styles.emptyTrackerText, { color: colors.textSecondary }]}>
                No employees found for this quiz type.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Custom Question Modal */}
      <Modal visible={showAddCustom || showAddBonus} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {showAddBonus ? 'Add Bonus Question' : 'Add Custom Question'}
                </Text>
                <TouchableOpacity onPress={() => { setShowAddCustom(false); setShowAddBonus(false); }}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                {showAddBonus && (
                  <View style={styles.bonusValueRow}>
                    <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Bonus Bucks Value</Text>
                    <TextInput
                      style={[styles.bonusInput, { backgroundColor: colors.background, color: '#F59E0B', borderColor: '#F59E0B' }]}
                      value={bonusBucksValue}
                      onChangeText={setBonusBucksValue}
                      keyboardType="numeric"
                      placeholder="5"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                )}

                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Photo (optional)</Text>
                {customImageUrl ? (
                  <View style={styles.photoPreviewRow}>
                    <Image source={{ uri: customImageUrl }} style={styles.photoPreview} resizeMode="cover" />
                    <View style={styles.photoPreviewButtons}>
                      <TouchableOpacity
                        style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                        onPress={handleAttachPhotoToCustomForm}
                        disabled={uploadingImage}
                      >
                        <Text style={[styles.photoButtonText, { color: colors.primary }]}>
                          {uploadingImage ? 'Uploading…' : 'Change Photo'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoButton, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                        onPress={() => setCustomImageUrl(null)}
                        disabled={uploadingImage}
                      >
                        <Text style={[styles.photoButtonText, { color: '#EF4444' }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary, alignSelf: 'flex-start' }]}
                    onPress={handleAttachPhotoToCustomForm}
                    disabled={uploadingImage}
                  >
                    <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="photo" size={16} color={colors.primary} />
                    <Text style={[styles.photoButtonText, { color: colors.primary, marginLeft: 6 }]}>
                      {uploadingImage ? 'Uploading…' : 'Add Photo'}
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Question</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={customText}
                  onChangeText={setCustomText}
                  placeholder="Enter your question..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                {(['A', 'B', 'C', 'D'] as const).map(letter => {
                  const value = letter === 'A' ? customA : letter === 'B' ? customB : letter === 'C' ? customC : customD;
                  const setter = letter === 'A' ? setCustomA : letter === 'B' ? setCustomB : letter === 'C' ? setCustomC : setCustomD;
                  return (
                    <View key={letter}>
                      <View style={styles.optionLabelRow}>
                        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Option {letter}</Text>
                        <TouchableOpacity
                          style={[
                            styles.correctToggle,
                            customCorrect === letter && { backgroundColor: '#10B981' },
                            customCorrect !== letter && { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
                          ]}
                          onPress={() => setCustomCorrect(letter)}
                        >
                          <Text style={[styles.correctToggleText, { color: customCorrect === letter ? '#FFF' : colors.textSecondary }]}>
                            {customCorrect === letter ? 'Correct' : 'Set Correct'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={value}
                        onChangeText={setter}
                        placeholder={`Option ${letter}...`}
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.modalSaveButton, { backgroundColor: showAddBonus ? '#F59E0B' : colors.primary }]}
                  onPress={() => handleAddCustom(showAddBonus)}
                >
                  <Text style={styles.modalSaveText}>
                    {showAddBonus ? 'Add Bonus Question' : 'Add Question'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit Question Modal */}
      <Modal visible={!!editingQuestion} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Question</Text>
                <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {editingQuestion && (
                <ScrollView style={styles.modalScroll}>
                  {editingQuestion.is_bonus && (
                    <View style={styles.bonusValueRow}>
                      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Bonus Bucks Value</Text>
                      <TextInput
                        style={[styles.bonusInput, { backgroundColor: colors.background, color: '#F59E0B', borderColor: '#F59E0B' }]}
                        value={String(editingQuestion.bonus_bucks_value || 5)}
                        onChangeText={(v) => setEditingQuestion({ ...editingQuestion, bonus_bucks_value: parseInt(v) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                  )}

                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Photo (optional)</Text>
                  {editingQuestion.question_image_url ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: editingQuestion.question_image_url }} style={styles.photoPreview} resizeMode="cover" />
                      <View style={styles.photoPreviewButtons}>
                        <TouchableOpacity
                          style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                          onPress={handleAttachPhotoToEditingQuestion}
                          disabled={uploadingImage}
                        >
                          <Text style={[styles.photoButtonText, { color: colors.primary }]}>
                            {uploadingImage ? 'Uploading…' : 'Change Photo'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.photoButton, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                          onPress={handleRemovePhotoFromEditingQuestion}
                          disabled={uploadingImage}
                        >
                          <Text style={[styles.photoButtonText, { color: '#EF4444' }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary, alignSelf: 'flex-start' }]}
                      onPress={handleAttachPhotoToEditingQuestion}
                      disabled={uploadingImage}
                    >
                      <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="photo" size={16} color={colors.primary} />
                      <Text style={[styles.photoButtonText, { color: colors.primary, marginLeft: 6 }]}>
                        {uploadingImage ? 'Uploading…' : 'Add Photo'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Question</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    value={editingQuestion.question_text}
                    onChangeText={(v) => setEditingQuestion({ ...editingQuestion, question_text: v })}
                    multiline
                  />

                  {(['A', 'B', 'C', 'D'] as const).map(letter => {
                    const key = `option_${letter.toLowerCase()}` as keyof ExamQuestion;
                    return (
                      <View key={letter}>
                        <View style={styles.optionLabelRow}>
                          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Option {letter}</Text>
                          <TouchableOpacity
                            style={[
                              styles.correctToggle,
                              editingQuestion.correct_option === letter && { backgroundColor: '#10B981' },
                              editingQuestion.correct_option !== letter && { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
                            ]}
                            onPress={() => setEditingQuestion({ ...editingQuestion, correct_option: letter })}
                          >
                            <Text style={[styles.correctToggleText, { color: editingQuestion.correct_option === letter ? '#FFF' : colors.textSecondary }]}>
                              {editingQuestion.correct_option === letter ? 'Correct' : 'Set Correct'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={editingQuestion[key] as string}
                          onChangeText={(v) => setEditingQuestion({ ...editingQuestion, [key]: v })}
                        />
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.modalSaveButton, { backgroundColor: colors.primary }]}
                    onPress={handleSaveEdit}
                  >
                    <Text style={styles.modalSaveText}>Save Changes</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* iOS Close-At Date Picker */}
      {Platform.OS === 'ios' && showCloseDatePicker && (
        <Modal visible transparent animationType="fade">
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerContainer, { backgroundColor: colors.card }]}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => { setShowCloseDatePicker(false); setShowCloseTimePicker(true); }}>
                  <Text style={[styles.datePickerDone, { color: colors.primary }]}>Next: Time</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={closeAt || (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  d.setHours(23, 59, 0, 0);
                  return d;
                })()}
                mode="date"
                display="spinner"
                textColor={colors.text}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) {
                    const base = closeAt ? new Date(closeAt) : (() => {
                      const d = new Date();
                      d.setHours(23, 59, 0, 0);
                      return d;
                    })();
                    base.setFullYear(selectedDate.getFullYear());
                    base.setMonth(selectedDate.getMonth());
                    base.setDate(selectedDate.getDate());
                    handleUpdateCloseAt(base);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'ios' && showCloseTimePicker && (
        <Modal visible transparent animationType="fade">
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerContainer, { backgroundColor: colors.card }]}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowCloseTimePicker(false)}>
                  <Text style={[styles.datePickerDone, { color: colors.primary }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={closeAt || new Date()}
                mode="time"
                display="spinner"
                textColor={colors.text}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
                onChange={(_event, selectedTime) => {
                  if (selectedTime) {
                    const base = closeAt ? new Date(closeAt) : new Date();
                    base.setHours(selectedTime.getHours());
                    base.setMinutes(selectedTime.getMinutes());
                    base.setSeconds(0, 0);
                    handleUpdateCloseAt(base);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}
      {/* Android native Close-At Pickers */}
      {Platform.OS === 'android' && showCloseDatePicker && (
        <DateTimePicker
          value={closeAt || (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            d.setHours(23, 59, 0, 0);
            return d;
          })()}
          mode="date"
          display="default"
          onChange={(_event, selectedDate) => {
            setShowCloseDatePicker(false);
            if (selectedDate) {
              const base = closeAt ? new Date(closeAt) : (() => {
                const d = new Date();
                d.setHours(23, 59, 0, 0);
                return d;
              })();
              base.setFullYear(selectedDate.getFullYear());
              base.setMonth(selectedDate.getMonth());
              base.setDate(selectedDate.getDate());
              handleUpdateCloseAt(base);
              // Chain into the time picker
              setTimeout(() => setShowCloseTimePicker(true), 200);
            }
          }}
        />
      )}
      {Platform.OS === 'android' && showCloseTimePicker && (
        <DateTimePicker
          value={closeAt || new Date()}
          mode="time"
          display="default"
          onChange={(_event, selectedTime) => {
            setShowCloseTimePicker(false);
            if (selectedTime) {
              const base = closeAt ? new Date(closeAt) : new Date();
              base.setHours(selectedTime.getHours());
              base.setMinutes(selectedTime.getMinutes());
              base.setSeconds(0, 0);
              handleUpdateCloseAt(base);
            }
          }}
        />
      )}

      <BottomNavBar activeTab="manage" />
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  placeholder: { width: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabWrapper: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  tabText: { fontSize: 14, fontWeight: '600' },
  contentContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  // Empty state
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  generateButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  // Status card
  statusCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statusLabel: { fontSize: 14 },
  statusValue: { fontSize: 14, fontWeight: '600' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  // Time limit
  timeLimitCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  timeLimitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timeLimitTitle: { fontSize: 16, fontWeight: 'bold' },
  timeLimitDisplay: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', marginVertical: 8 },
  timeLimitButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  timeLimitOption: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  timeLimitOptionText: { fontSize: 14, fontWeight: '600' },

  // Question Count
  questionCountCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  customCountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
    gap: 8,
  },
  customCountLabel: { fontSize: 14, fontWeight: '500' as const },
  customCountInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '600' as const,
    width: 60,
    textAlign: 'center' as const,
  },

  // Questions
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  questionCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  questionNumberContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionNumber: { fontSize: 16, fontWeight: 'bold' },
  sourceChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  sourceChipText: { fontSize: 10, fontWeight: '700' },
  questionActions: { flexDirection: 'row', gap: 4 },
  actionButton: { padding: 6 },
  questionText: { fontSize: 15, fontWeight: '600', marginBottom: 10, lineHeight: 20 },
  optionsList: { gap: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, gap: 8 },
  optionLetter: { fontSize: 14, width: 20 },
  optionText: { flex: 1, fontSize: 14 },

  // Add question buttons
  addQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 14,
    marginBottom: 12,
    gap: 8,
  },
  addQuestionText: { fontSize: 15, fontWeight: '600' },

  // Action buttons
  actionSection: { marginTop: 16, gap: 12 },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  previewButtonText: { fontSize: 16, fontWeight: '600' },
  activateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  activateButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  closeButtonText: { fontSize: 16, fontWeight: '600' },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  resetButtonText: { fontSize: 14, fontWeight: '600' },

  // Completion tracker
  trackerSummary: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  trackerSummaryText: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  trackerAvatar: { marginRight: 12 },
  trackerAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  trackerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  trackerAvatarInitial: { fontSize: 18, fontWeight: 'bold' },
  trackerInfo: { flex: 1 },
  trackerName: { fontSize: 15, fontWeight: '600' },
  trackerJob: { fontSize: 12, marginTop: 2 },
  trackerResultContainer: { alignItems: 'flex-end', gap: 6 },
  trackerResult: { alignItems: 'flex-end' },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  retakeButtonText: { fontSize: 11, fontWeight: '600' },
  trackerScore: { fontSize: 16, fontWeight: 'bold' },
  trackerBucks: { fontSize: 13, fontWeight: '600' },
  notTakenBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  notTakenText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  emptyTrackerText: { textAlign: 'center', fontSize: 14, marginTop: 40 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { maxHeight: '85%' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalScroll: { maxHeight: 500 },
  formLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  optionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  correctToggle: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  correctToggleText: { fontSize: 11, fontWeight: '700' },
  bonusValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bonusInput: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: 'bold',
    width: 80,
    textAlign: 'center',
  },
  modalSaveButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  modalSaveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Picture questions
  questionCardImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#00000010',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  photoPreview: {
    width: 96,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#00000010',
  },
  photoPreviewButtons: { flex: 1, gap: 6 },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  photoButtonText: { fontSize: 13, fontWeight: '600' },

  // Closes At / Notify Staff / Date picker
  closeAtRight: { alignItems: 'flex-end' },
  closeAtDate: { fontSize: 11, marginTop: 2 },
  closeAtActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  closeAtClearBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closeAtClearText: { fontSize: 12, fontWeight: '600' },
  notifyLabelCol: { flex: 1, paddingRight: 12 },
  notifyDesc: { fontSize: 11, marginTop: 2 },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000020',
  },
  datePickerDone: { fontSize: 16, fontWeight: '600' },
});
