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
  Modal,
  Switch,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { generateQuizQuestions, generatePhotoQuestion, getCurrentWeekKey, getExamTypeName } from '@/utils/exam/questionGenerator';
import type { ExamType, GeneratedQuestion } from '@/utils/exam/questionGenerator';
import { useTranslationSection } from '@/components/TranslationSection';
import { formatTime, formatCountdown, getCountdownUrgency } from '@/utils/exam/examEngine';
import { sendCustomNotification, bothLanguages } from '@/utils/notificationHelpers';
import i18n from '@/i18n';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';

interface Exam {
  id: string;
  exam_type: string;
  cycle_key: string;
  status: 'draft' | 'active' | 'paused' | 'closed';
  time_limit_seconds: number;
  created_by: string;
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
  close_at: string | null;
  notify_on_activate: boolean | null;
  rewards_enabled: boolean | null;
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
  bucks_value: number | null;
  category_label: string | null;
  source_type: 'auto' | 'custom' | 'bonus';
  source_table: string | null;
  question_image_url?: string | null;
  question_text_es?: string | null;
  option_a_es?: string | null;
  option_b_es?: string | null;
  option_c_es?: string | null;
  option_d_es?: string | null;
}

// label = the EN-canonical value persisted into exam_questions.category_label
// (stored data stays English); labelKey translates the DISPLAY only.
const CATEGORY_OPTIONS: { label: string; labelKey: string; sourceTable: string | null }[] = [
  { label: 'Menu Items', labelKey: 'exam_editor.cat_menu_items', sourceTable: 'menu_items' },
  { label: 'Wine Pairings', labelKey: 'exam_editor.cat_wine_pairings', sourceTable: 'wine_pairings' },
  { label: 'Libation Recipes', labelKey: 'exam_editor.cat_libation_recipes', sourceTable: 'recipes' },
  { label: 'Check List Items', labelKey: 'exam_editor.cat_checklist_items', sourceTable: 'checklist_items' },
  { label: 'Menu Category', labelKey: 'exam_editor.cat_menu_category', sourceTable: 'menu_category' },
];

const STATUS_LABEL_KEYS: Record<Exam['status'], string> = {
  draft: 'exam_editor.status_draft',
  active: 'exam_editor.status_active',
  paused: 'exam_editor.status_paused',
  closed: 'exam_editor.status_closed',
};

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
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const currencyName = organization.reward_currency_name;
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
  const [customTextEs, setCustomTextEs] = useState('');
  const [customAEs, setCustomAEs] = useState('');
  const [customBEs, setCustomBEs] = useState('');
  const [customCEs, setCustomCEs] = useState('');
  const [customDEs, setCustomDEs] = useState('');
  const [bonusBucksValue, setBonusBucksValue] = useState('5');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Close-at scheduling + Notify Staff toggle + No Rewards toggle
  const [closeAt, setCloseAt] = useState<Date | null>(null);
  const [notifyOnActivate, setNotifyOnActivate] = useState(false);
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  const [customBucksValue, setCustomBucksValue] = useState('');

  // Category-tag picker state for editing a question's category_label
  const [categoryPickerForQuestion, setCategoryPickerForQuestion] = useState<ExamQuestion | null>(null);
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [showCloseDatePicker, setShowCloseDatePicker] = useState(false);
  const [showCloseTimePicker, setShowCloseTimePicker] = useState(false);
  // Countdown tick state — forces re-render every second while a close_at is set
  const [countdownTick, setCountdownTick] = useState(0);

  // Hybrid bilingual authoring (s61): custom/bonus + edit modals bind the
  // device language; the shared section previews and resolves the other side.
  const addTranslation = useTranslationSection({
    fields: [
      { key: 'question', labelKey: 'translation_section:field_question', enValue: customText, esValue: customTextEs, setEnValue: setCustomText, setEsValue: setCustomTextEs, multiline: true },
      { key: 'option_a', labelKey: 'translation_section:field_option_a', enValue: customA, esValue: customAEs, setEnValue: setCustomA, setEsValue: setCustomAEs },
      { key: 'option_b', labelKey: 'translation_section:field_option_b', enValue: customB, esValue: customBEs, setEnValue: setCustomB, setEsValue: setCustomBEs },
      { key: 'option_c', labelKey: 'translation_section:field_option_c', enValue: customC, esValue: customCEs, setEnValue: setCustomC, setEsValue: setCustomCEs },
      { key: 'option_d', labelKey: 'translation_section:field_option_d', enValue: customD, esValue: customDEs, setEnValue: setCustomD, setEsValue: setCustomDEs },
    ],
    sessionKey: 'custom-add',
    active: showAddCustom || showAddBonus,
  });
  const editTranslation = useTranslationSection({
    fields: [
      { key: 'question', labelKey: 'translation_section:field_question', enValue: editingQuestion?.question_text ?? '', esValue: editingQuestion?.question_text_es ?? '', setEnValue: (v) => setEditingQuestion(prev => prev ? { ...prev, question_text: v } : prev), setEsValue: (v) => setEditingQuestion(prev => prev ? { ...prev, question_text_es: v } : prev), multiline: true },
      { key: 'option_a', labelKey: 'translation_section:field_option_a', enValue: editingQuestion?.option_a ?? '', esValue: editingQuestion?.option_a_es ?? '', setEnValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_a: v } : prev), setEsValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_a_es: v } : prev) },
      { key: 'option_b', labelKey: 'translation_section:field_option_b', enValue: editingQuestion?.option_b ?? '', esValue: editingQuestion?.option_b_es ?? '', setEnValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_b: v } : prev), setEsValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_b_es: v } : prev) },
      { key: 'option_c', labelKey: 'translation_section:field_option_c', enValue: editingQuestion?.option_c ?? '', esValue: editingQuestion?.option_c_es ?? '', setEnValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_c: v } : prev), setEsValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_c_es: v } : prev) },
      { key: 'option_d', labelKey: 'translation_section:field_option_d', enValue: editingQuestion?.option_d ?? '', esValue: editingQuestion?.option_d_es ?? '', setEnValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_d: v } : prev), setEsValue: (v) => setEditingQuestion(prev => prev ? { ...prev, option_d_es: v } : prev) },
    ],
    sessionKey: editingQuestion ? `edit:${editingQuestion.id}` : 'none',
    active: !!editingQuestion,
  });
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCurrentExam = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      // Auto-close any active exams whose close_at has passed. Fire-and-forget
      // — if it fails we still show the (now slightly stale) data below.
      try {
        await supabase.rpc('close_expired_exams_actor', { p_actor_id: user.id });
      } catch (cleanupErr) {
        console.warn('close_expired_exams cleanup failed:', cleanupErr);
      }

      // Get the most recent draft/active/paused exam for this type (org-scoped server-side)
      const { data, error } = await supabase.rpc('get_exam', {
        p_actor_id: user?.id,
        p_exam_type: examType,
        p_statuses: ['draft', 'active', 'paused'],
      });

      if (!error && data && data.length > 0) {
        const exam = data[0] as Exam;
        setCurrentExam(exam);
        setTimeLimit(exam.time_limit_seconds);
        setCloseAt(exam.close_at ? new Date(exam.close_at) : null);
        setNotifyOnActivate(Boolean(exam.notify_on_activate));
        setRewardsEnabled(exam.rewards_enabled !== false);
        await fetchQuestions(exam.id);
        if (exam.status === 'active' || exam.status === 'paused') {
          await fetchCompletionData(exam.id);
        }
      } else {
        setCurrentExam(null);
        setQuestions([]);
        setCloseAt(null);
        setNotifyOnActivate(false);
        setRewardsEnabled(true);
      }
    } catch (err) {
      console.error('Error fetching exam:', err);
    }
    setLoading(false);
  }, [examType, user?.id]);

  // Tick a countdown re-render once per second while a close_at is active,
  // so the "Closes in …" label updates live.
  useEffect(() => {
    if (!closeAt || !currentExam || currentExam.status === 'closed' || currentExam.status === 'paused') {
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
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_exam_questions', {
      p_actor_id: user?.id,
      p_exam_id: examId,
    });

    if (!error && data) {
      setQuestions(data as ExamQuestion[]);
    }
  };

  const fetchCompletionData = async (examId: string) => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_exam_completion_status_actor', {
        p_exam_id: examId,
        p_exam_type: examType,
        p_actor_id: user.id,
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
    if (!user?.id) return;
    setGenerating(true);
    try {
      const cycleKey = getCurrentWeekKey();

      // Create the exam record (server derives org, gates manager/owner, and does the
      // unique-cycle_key suffix retry internally — returns the row with its final cycle_key)
      const { data: examRows, error: examError } = await supabase.rpc('create_exam', {
        p_actor_id: user?.id,
        p_exam_type: examType,
        p_cycle_key: cycleKey,
      });

      if (examError) throw examError;
      const exam = (examRows as Exam[])?.[0];
      if (!exam) throw new Error(t('exam_editor.no_data_returned'));

      await generateAndSaveQuestions(exam.id, exam.cycle_key);
      setCurrentExam(exam);
      setTimeLimit(exam.time_limit_seconds);
      await fetchQuestions(exam.id);
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err, t('exam_editor.failed_generate')));
      console.error('Generate error:', err);
    }
    setGenerating(false);
  };

  const generateAndSaveQuestions = async (examId: string, cycleKey: string) => {
    if (!user?.id) return;
    const generatedQuestions = await generateQuizQuestions(examType, cycleKey, questionCount, organizationId ?? '', user.id);

    const questionsToInsert = generatedQuestions.map((q, index) => ({
      exam_id: examId,
      organization_id: organizationId,
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

    // Server assigns question_order (1-based) + org; extra keys in the objects are ignored.
    const { error } = await supabase.rpc('create_exam_questions', {
      p_actor_id: user.id,
      p_exam_id: examId,
      p_questions: questionsToInsert,
    });
    if (error) throw error;
  };

  // Update time limit
  const handleUpdateTimeLimit = async (newSeconds: number) => {
    if (!currentExam || !user?.id) return;
    setTimeLimit(newSeconds);
    await supabase.rpc('update_exam_settings', {
      p_actor_id: user?.id, p_exam_id: currentExam.id, p_time_limit_seconds: newSeconds,
    });
  };

  // Activate quiz
  const handleActivate = () => {
    if (!user?.id) return;
    if (!currentExam || questions.length === 0) {
      Alert.alert(t('common.error'), t('exam_editor.no_questions_activate'));
      return;
    }

    Alert.alert(
      t('exam_editor.activate_quiz'),
      t('exam_editor.activate_msg', { type: getExamTypeName(examType, isSpanish) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.activate_btn'),
          onPress: async () => {
            try {
              // Default close_at = 7 days from now at 23:59 local if unset
              let effectiveCloseAt = closeAt;
              if (!effectiveCloseAt) {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                d.setHours(23, 59, 0, 0);
                effectiveCloseAt = d;
                setCloseAt(d);
              }

              // Atomic: server closes any other active exam of this type, then activates
              // this one (activated_at + close_at + notify reset) — one call.
              await supabase.rpc('activate_exam', {
                p_actor_id: user?.id,
                p_exam_id: currentExam.id,
                p_close_at: effectiveCloseAt.toISOString(),
              });

              // Fire push if the manager armed the toggle
              if (notifyOnActivate) {
                try {
                  const jobTitlesByType: Record<string, string[]> = {
                    server: ['Server', 'Lead Server', 'Busser', 'Runner'],
                    bartender: ['Bartender'],
                    host: ['Host'],
                  };
                  const targetJobTitles = jobTitlesByType[examType] || [];
                  const quizTitle = bothLanguages('notifications.quiz_live_title');
                  // Body interpolates the language-specific quiz-type name, so
                  // the two copies are built individually.
                  const quizBodyEn = i18n.t('notifications.quiz_live_body', { lng: 'en', type: getExamTypeName(examType) });
                  const quizBodyEs = i18n.t('notifications.quiz_live_body', { lng: 'es', type: getExamTypeName(examType, true) });
                  await sendCustomNotification(
                    quizTitle.en,
                    quizBodyEn,
                    {
                      destination: 'weekly-quizzes',
                      exam_id: currentExam.id,
                      job_titles: targetJobTitles,
                    },
                    organizationId ?? undefined,
                    quizTitle.es,
                    quizBodyEs
                  );
                } catch (pushErr) {
                  // Non-fatal: activation still succeeded.
                  console.error('Notify Staff push failed:', pushErr);
                }
              }

              setNotifyOnActivate(false);
              await fetchCurrentExam();
              Alert.alert(t('exam_editor.activated_title'), t('exam_editor.activated_msg'));
            } catch (err) {
              console.error('Activate error:', err);
            }
          },
        },
      ]
    );
  };

  const handlePause = () => {
    if (!currentExam || !user?.id) return;
    Alert.alert(
      t('exam_editor.pause_quiz'),
      t('exam_editor.pause_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.pause_btn'),
          onPress: async () => {
            await supabase.rpc('set_exam_status', {
              p_actor_id: user?.id, p_exam_id: currentExam.id, p_status: 'paused',
            });
            await fetchCurrentExam();
          },
        },
      ]
    );
  };

  const handleResume = () => {
    if (!currentExam || !user?.id) return;
    Alert.alert(
      t('exam_editor.resume_quiz'),
      t('exam_editor.resume_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.resume_btn'),
          onPress: async () => {
            await supabase.rpc('set_exam_status', {
              p_actor_id: user?.id, p_exam_id: currentExam.id, p_status: 'active',
            });
            await fetchCurrentExam();
          },
        },
      ]
    );
  };

  // Persist a new close_at value (draft or active)
  const handleUpdateCloseAt = async (next: Date | null) => {
    if (!currentExam || !user?.id) return;
    setCloseAt(next);
    try {
      await supabase.rpc('update_exam_settings', {
        p_actor_id: user?.id,
        p_exam_id: currentExam.id,
        p_close_at: next ? next.toISOString() : undefined,
        p_clear_close_at: !next,
      });
    } catch (err) {
      console.error('Update close_at error:', err);
    }
  };

  // Persist the No Rewards toggle (draft only). When false, no Bucks awarded
  // for this quiz regardless of per-question values.
  const handleToggleRewardsEnabled = async (next: boolean) => {
    if (!currentExam || currentExam.status !== 'draft' || !user?.id) return;
    setRewardsEnabled(next);
    setCurrentExam({ ...currentExam, rewards_enabled: next });
    try {
      await supabase.rpc('update_exam_settings', {
        p_actor_id: user?.id, p_exam_id: currentExam.id, p_rewards_enabled: next,
      });
    } catch (err) {
      console.error('Toggle rewards_enabled error:', err);
    }
  };

  // Persist a question's category_label override
  const handleUpdateCategoryLabel = async (q: ExamQuestion, newLabel: string | null) => {
    setCategoryPickerForQuestion(null);
    setShowCustomCategoryInput(false);
    setCustomCategoryText('');
    if (!user?.id) return;
    try {
      await supabase.rpc('update_exam_question', {
        p_actor_id: user.id, p_question_id: q.id, p_fields: { category_label: newLabel },
      });
      setQuestions(prev =>
        prev.map(qq => (qq.id === q.id ? { ...qq, category_label: newLabel } : qq))
      );
    } catch (err) {
      console.error('Update category_label error:', err);
      Alert.alert(t('common.error'), t('exam_editor.failed_update_category'));
    }
  };

  // Persist the Notify Staff toggle (draft only)
  const handleToggleNotifyOnActivate = async (next: boolean) => {
    if (!currentExam || currentExam.status !== 'draft' || !user?.id) return;
    setNotifyOnActivate(next);
    try {
      await supabase.rpc('update_exam_settings', {
        p_actor_id: user?.id, p_exam_id: currentExam.id, p_notify_on_activate: next,
      });
    } catch (err) {
      console.error('Toggle notify_on_activate error:', err);
    }
  };

  // Close quiz
  const handleClose = () => {
    if (!currentExam || !user?.id) return;

    Alert.alert(
      t('exam_editor.close_quiz'),
      t('exam_editor.close_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.close'),
          style: 'destructive',
          onPress: async () => {
            await supabase.rpc('set_exam_status', {
              p_actor_id: user?.id, p_exam_id: currentExam.id, p_status: 'closed',
            });

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
    if (!user?.id) return;
    Alert.alert(
      t('exam_editor.reset_new_quiz'),
      t('exam_editor.reset_new_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.reset_btn'),
          style: 'destructive',
          onPress: async () => {
            if (currentExam) {
              await supabase.rpc('set_exam_status', {
                p_actor_id: user?.id, p_exam_id: currentExam.id, p_status: 'closed',
              });
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
    if (!currentExam || !user?.id) return;
    const authorText = isSpanish ? customTextEs : customText;
    const authorA = isSpanish ? customAEs : customA;
    const authorB = isSpanish ? customBEs : customB;
    const authorC = isSpanish ? customCEs : customC;
    const authorD = isSpanish ? customDEs : customD;
    if (!authorText.trim() || !authorA.trim() || !authorB.trim() || !authorC.trim() || !authorD.trim()) {
      Alert.alert(t('common.error'), t('exam_editor.fill_all_fields'));
      return;
    }

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await addTranslation.resolveOnSave();
    if (!resolved) return;

    const nextOrder = questions.length > 0 ? Math.max(...questions.map(q => q.question_order)) + 1 : 1;
    const bonusValue = isBonus ? parseInt(bonusBucksValue) || 5 : null;
    const trimmedCustomBucks = customBucksValue.trim();
    const customBucks = !isBonus && trimmedCustomBucks !== ''
      ? (Number.isNaN(parseInt(trimmedCustomBucks)) ? null : parseInt(trimmedCustomBucks))
      : null;

    // Server appends after the current max order + derives org.
    const { error } = await supabase.rpc('add_exam_question', {
      p_actor_id: user.id,
      p_exam_id: currentExam.id,
      p_question: {
        question_text: resolved.question.en.trim(),
        option_a: resolved.option_a.en.trim(),
        option_b: resolved.option_b.en.trim(),
        option_c: resolved.option_c.en.trim(),
        option_d: resolved.option_d.en.trim(),
        correct_option: customCorrect,
        is_bonus: isBonus,
        bonus_bucks_value: bonusValue,
        bucks_value: customBucks,
        source_type: isBonus ? 'bonus' : 'custom',
        source_table: null,
        question_image_url: customImageUrl,
        question_text_es: resolved.question.es.trim() || null,
        option_a_es: resolved.option_a.es.trim() || null,
        option_b_es: resolved.option_b.es.trim() || null,
        option_c_es: resolved.option_c.es.trim() || null,
        option_d_es: resolved.option_d.es.trim() || null,
      },
    });

    if (error) {
      Alert.alert(t('common.error'), translateServerError(error));
    } else {
      resetCustomForm();
      setShowAddCustom(false);
      setShowAddBonus(false);
      await fetchQuestions(currentExam.id);
    }
  };

  // Delete question
  const handleDeleteQuestion = (question: ExamQuestion) => {
    if (!user?.id) return;
    Alert.alert(
      t('exam_editor.delete_q_title'),
      t('exam_editor.delete_q_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.rpc('delete_exam_question', {
              p_actor_id: user?.id, p_question_id: question.id,
            });
            if (currentExam) await fetchQuestions(currentExam.id);
          },
        },
      ]
    );
  };

  // Refresh single question — regenerate just one question
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);

  const handleRefreshQuestion = async (question: ExamQuestion) => {
    if (!currentExam || !user?.id) return;
    setRefreshingQuestionId(question.id);
    try {
      // If the current question has an image, regenerate another photo
      // question against the same pool (this yields a fresh item + prompt).
      // Otherwise fall back to the text-template batch path below.
      let newQuestion: GeneratedQuestion | null = null;
      if (question.question_image_url) {
        const photo = await generatePhotoQuestion(
          organizationId ?? '',
          [],
          `${currentExam.cycle_key}-photo-refresh-${question.id}-${Date.now()}`,
          user.id,
        );
        if (photo && photo.question_text !== question.question_text) {
          newQuestion = photo;
        }
      }

      if (!newQuestion) {
        // Generate a batch of questions and pick one that's different from the current
        const cycleKey = currentExam.cycle_key + '-refresh-' + Date.now().toString(36);
        const generated = await generateQuizQuestions(examType, cycleKey, 5, organizationId ?? '', user.id);

        // Find one that doesn't duplicate existing questions
        const existingTexts = new Set(questions.map(q => q.question_text));
        newQuestion = generated.find(q => !existingTexts.has(q.question_text)) || generated[0];
      }

      if (newQuestion) {
        const { error } = await supabase.rpc('update_exam_question', {
          p_actor_id: user.id,
          p_question_id: question.id,
          p_fields: {
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
          },
        });

        if (error) {
          Alert.alert(t('common.error'), translateServerError(error));
        } else {
          await fetchQuestions(currentExam.id);
        }
      }
    } catch (err) {
      console.error('Refresh question error:', err);
      Alert.alert(t('common.error'), t('exam_editor.failed_refresh'));
    }
    setRefreshingQuestionId(null);
  };

  // Save edited question
  const handleSaveEdit = async () => {
    if (!editingQuestion || !user?.id) return;

    // Fill/refresh the other language per the s61 staleness rules (may ask
    // once). Sending the _es keys explicitly (value or null) also fixes the
    // stale-Spanish defect: an EN edit no longer leaves old ES text live.
    const resolved = await editTranslation.resolveOnSave();
    if (!resolved) return;

    const { error } = await supabase.rpc('update_exam_question', {
      p_actor_id: user.id,
      p_question_id: editingQuestion.id,
      p_fields: {
        question_text: resolved.question.en.trim(),
        option_a: resolved.option_a.en.trim(),
        option_b: resolved.option_b.en.trim(),
        option_c: resolved.option_c.en.trim(),
        option_d: resolved.option_d.en.trim(),
        correct_option: editingQuestion.correct_option,
        bonus_bucks_value: editingQuestion.bonus_bucks_value,
        bucks_value: editingQuestion.bucks_value,
        question_image_url: editingQuestion.question_image_url ?? null,
        question_text_es: resolved.question.es.trim() || null,
        option_a_es: resolved.option_a.es.trim() || null,
        option_b_es: resolved.option_b.es.trim() || null,
        option_c_es: resolved.option_c.es.trim() || null,
        option_d_es: resolved.option_d.es.trim() || null,
      },
    });

    if (error) {
      Alert.alert(t('common.error'), translateServerError(error));
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
    setCustomTextEs('');
    setCustomAEs('');
    setCustomBEs('');
    setCustomCEs('');
    setCustomDEs('');
    setCustomA('');
    setCustomB('');
    setCustomC('');
    setCustomD('');
    setCustomCorrect('A');
    setBonusBucksValue('5');
    setCustomBucksValue('');
    setCustomImageUrl(null);
  };

  // ─── Image picker / upload for picture questions ───────────────────
  // Pick via ImagePicker → upload through the storage broker → return
  // the public URL.
  const pickAndUploadQuizImage = async (): Promise<string | null> => {
    if (!user?.id) return null;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('exam_editor.permission_title'), t('exam_editor.permission_msg'));
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
      const publicUrl = await brokerUploadImage('quiz_question_image', uri, user.id);
      if (!publicUrl) throw new Error(t('exam_editor.upload_failed_msg'));
      return publicUrl;
    } catch (err: any) {
      console.error('Quiz image upload error:', err);
      Alert.alert(t('exam_editor.upload_failed_title'), translateServerError(err, t('exam_editor.upload_failed_msg')));
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
      case 'paused': return '#F59E0B';
      case 'closed': return '#EF4444';
      default: return colors.textSecondary;
    }
  };

  const getSourceLabel = (q: ExamQuestion) => {
    if (q.category_label) {
      // Stored labels are EN-canonical; translate display when it matches a
      // known option, custom manager-typed labels render as typed.
      const known = CATEGORY_OPTIONS.find(o => o.label === q.category_label);
      return (known ? t(known.labelKey) : q.category_label).toUpperCase();
    }
    if (q.source_type === 'bonus') return t('exam_editor.source_bonus').toUpperCase();
    if (q.source_type === 'custom') return t('exam_editor.source_custom').toUpperCase();
    // Auto-chips read like the category picker: any known source_table shows its
    // picker label (recipes → LIBATION RECIPES, checklist_items → CHECK LIST ITEMS);
    // unknown tables and null fall back to the raw slug.
    const bySource = CATEGORY_OPTIONS.find(o => o.sourceTable === q.source_table);
    if (bySource) return t(bySource.labelKey).toUpperCase();
    return (q.source_table || 'auto').replace(/_/g, ' ').toUpperCase();
  };

  // Reset a specific user's quiz result so they can retake
  const handleResetUserQuiz = (entry: CompletionEntry) => {
    if (!user?.id || !currentExam || !organizationId) return;
    const actorId = user.id;

    Alert.alert(
      t('exam_editor.retake_title'),
      t('exam_editor.retake_msg', { name: entry.name, currency: currencyName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exam_editor.reset_btn'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Reset via gated RPC: deletes the result + dismissals and claws back awarded bucks
              const { error: resetError } = await supabase.rpc('reset_user_exam_attempt', {
                p_exam_id: currentExam.id,
                p_user_id: entry.user_id,
                p_organization_id: organizationId,
                p_actor_id: user?.id,
              });
              if (resetError) throw resetError;

              // Refresh tracker data
              await fetchCompletionData(currentExam.id);

              // Push the user a "you've been cleared" notification — uses the
              // existing send-push-notification edge function with userIds filter.
              try {
                const take2Title = bothLanguages('notifications.take2_title');
                const take2Body = bothLanguages('notifications.take2_body');
                const shadeBody = bothLanguages('notifications.take2_shade_body', { name: entry.name });
                await supabase.functions.invoke('send-push-notification', {
                  body: {
                    actor_id: user?.id,
                    userIds: [entry.user_id],
                    notificationType: 'custom',
                    title: take2Title.en,
                    body: take2Body.en,
                    title_es: take2Title.es,
                    body_es: take2Body.es,
                    data: {
                      destination: 'weekly-quizzes',
                      exam_id: currentExam.id,
                    },
                    organization_id: organizationId,
                  },
                });
                // Log to the shade — visible only to managers/owners and the cleared
                // user (retake_granted), never the whole org. Spanish copy rides
                // data.title_es/body_es for the dropdown's viewer-language pick.
                await supabase.rpc('create_notification', {
                  p_actor_id: actorId,
                  p_title: take2Title.en,
                  p_body: shadeBody.en,
                  p_data: {
                    title_es: take2Title.es,
                    body_es: shadeBody.es,
                    notificationType: 'retake_granted',
                    destination: 'weekly-quizzes',
                    exam_id: currentExam.id,
                    targetUserId: entry.user_id,
                  },
                });
              } catch (pushErr) {
                console.error('Retake push failed:', pushErr);
              }

              Alert.alert(t('common.success'), t('exam_editor.retake_success_msg', { name: entry.name }));
            } catch (err) {
              console.error('Reset user quiz error:', err);
              Alert.alert(t('common.error'), t('exam_editor.failed_reset_result'));
            }
          },
        },
      ]
    );
  };

  const completedCount = completionData.filter(e => e.has_completed).length;
  const totalEmployees = completionData.length;

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('exam_editor.title', { type: getExamTypeName(examType, isSpanish) })}</Text>
          <View style={styles.placeholder} />
        </View>
        <PremiumGate
          desc={t('weekly_quizzes.premium_desc')}
          bullets={[t('weekly_quizzes.premium_b1'), t('weekly_quizzes.premium_b2'), t('weekly_quizzes.premium_b3')]}
          footer={t('weekly_quizzes.premium_footer')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('exam_editor.title', { type: getExamTypeName(examType, isSpanish) })}</Text>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('exam_editor.title', { type: getExamTypeName(examType, isSpanish) })}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Selector (only show when there's an active exam) */}
      {(currentExam?.status === 'active' || currentExam?.status === 'paused') && (
        <View style={styles.tabWrapper}>
          <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.tab, activeSection === 'questions' && { backgroundColor: colors.highlight }]}
              onPress={() => setActiveSection('questions')}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeSection === 'questions' && { color: colors.text }]}>
                {t('exam_editor.questions')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeSection === 'tracker' && { backgroundColor: colors.highlight }]}
              onPress={() => { setActiveSection('tracker'); if (currentExam) fetchCompletionData(currentExam.id); }}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeSection === 'tracker' && { color: colors.text }]}>
                {t('exam_editor.tab_tracker', { done: completedCount, total: totalEmployees })}
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
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('exam_editor.no_active_title')}</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                {t('exam_editor.no_active_desc')}
              </Text>
            </View>

            {/* Question Count Selector */}
            <View style={[styles.questionCountCard, { backgroundColor: colors.card }]}>
              <View style={styles.timeLimitHeader}>
                <IconSymbol ios_icon_name="number.circle.fill" android_material_icon_name="format-list-numbered" size={22} color={colors.primary} />
                <Text style={[styles.timeLimitTitle, { color: colors.text }]}>{t('exam_editor.number_of_questions')}</Text>
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
                      { color: questionCount === count ? colors.fireText : colors.text },
                    ]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customCountRow}>
                <Text style={[styles.customCountLabel, { color: colors.textSecondary }]}>{t('exam_editor.custom_label')}</Text>
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
                <ActivityIndicator color={colors.fireText} />
              ) : (
                <>
                  <IconSymbol ios_icon_name="wand.and.stars" android_material_icon_name="auto-awesome" size={22} color={colors.fireText} />
                  <Text style={[styles.generateButtonText, { color: colors.fireText }]}>{t('exam_editor.generate_btn', { count: questionCount })}</Text>
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
                <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('exam_editor.status_label')}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentExam.status) + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(currentExam.status) }]}>
                    {t(STATUS_LABEL_KEYS[currentExam.status]).toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('exam_editor.questions')}</Text>
                <Text style={[styles.statusValue, { color: colors.text }]}>{questions.length}</Text>
              </View>

              {/* Closes At row — editable while draft or active */}
              {currentExam.status !== 'closed' && (
                <TouchableOpacity
                  style={styles.statusRow}
                  onPress={() => setShowCloseDatePicker(true)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('exam_editor.closes_at')}</Text>
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
                              {formatCountdown(msRemaining, isSpanish)}
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
                      <Text style={[styles.statusValue, { color: colors.primary }]}>{t('exam_editor.set_datetime')}</Text>
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
                    <Text style={[styles.closeAtClearText, { color: colors.textSecondary }]}>{t('common.clear')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Notify Staff toggle — draft only */}
              {currentExam.status === 'draft' && (
                <View style={styles.statusRow}>
                  <View style={styles.notifyLabelCol}>
                    <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('exam_editor.notify_staff')}</Text>
                    <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>
                      {t('exam_editor.notify_staff_desc')}
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

              {/* No Rewards toggle — draft only. Off = no reward currency awarded for this quiz. */}
              {currentExam.status === 'draft' && (
                <View style={styles.statusRow}>
                  <View style={styles.notifyLabelCol}>
                    <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('exam_editor.award_currency', { currency: currencyName })}</Text>
                    <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>
                      {t('exam_editor.award_currency_desc')}
                    </Text>
                  </View>
                  <Switch
                    value={rewardsEnabled}
                    onValueChange={handleToggleRewardsEnabled}
                    trackColor={{ false: colors.border, true: colors.primary + '80' }}
                    thumbColor={rewardsEnabled ? colors.primary : '#F4F3F4'}
                  />
                </View>
              )}
            </View>

            {/* Time Limit */}
            <View style={[styles.timeLimitCard, { backgroundColor: colors.card }]}>
              <View style={styles.timeLimitHeader}>
                <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={22} color={colors.primary} />
                <Text style={[styles.timeLimitTitle, { color: colors.text }]}>{t('exam_editor.time_limit')}</Text>
              </View>
              <Text style={[styles.timeLimitDisplay, { color: colors.primary }]}>
                {timeLimit === 0 ? t('exam_editor.no_limit') : formatTime(timeLimit)}
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
                    disabled={currentExam.status === 'active' || currentExam.status === 'paused'}
                  >
                    <Text style={[
                      styles.timeLimitOptionText,
                      { color: timeLimit === secs ? colors.fireText : colors.text },
                    ]}>
                      {secs === 0 ? '∞' : formatTime(secs)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Questions List */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('exam_editor.questions')}</Text>
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
                    <Text style={[styles.questionNumber, { color: colors.primary }]}>{t('exam_editor.q_number', { n: q.question_order })}</Text>
                    <TouchableOpacity
                      style={[styles.sourceChip, { backgroundColor: q.is_bonus ? '#F59E0B20' : colors.primary + '15' }]}
                      onPress={() => {
                        if ((currentExam.status === 'draft' || currentExam.status === 'paused') && !q.is_bonus) {
                          setCategoryPickerForQuestion(q);
                        }
                      }}
                      disabled={(currentExam.status !== 'draft' && currentExam.status !== 'paused') || q.is_bonus}
                    >
                      <Text style={[styles.sourceChipText, { color: q.is_bonus ? '#F59E0B' : colors.primary }]}>
                        {getSourceLabel(q)}
                      </Text>
                      {(currentExam.status === 'draft' || currentExam.status === 'paused') && !q.is_bonus && (
                        <IconSymbol
                          ios_icon_name="chevron.down"
                          android_material_icon_name="expand-more"
                          size={10}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                    {q.is_bonus && (
                      <View style={[styles.sourceChip, { backgroundColor: '#F59E0B20' }]}>
                        <Text style={[styles.sourceChipText, { color: '#F59E0B' }]}>
                          ${q.bonus_bucks_value}
                        </Text>
                      </View>
                    )}
                    {!q.is_bonus && typeof q.bucks_value === 'number' && (
                      <View style={[styles.sourceChip, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.sourceChipText, { color: colors.primary }]}>
                          ${q.bucks_value}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.questionActions}>
                    {(currentExam.status === 'draft' || currentExam.status === 'paused') && (
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
                  <StorageImage
                    source={{ uri: q.question_image_url }}
                    style={styles.questionCardImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={[styles.questionText, { color: colors.text }]}>{isSpanish && q.question_text_es ? q.question_text_es : q.question_text}</Text>
                <View style={styles.optionsList}>
                  {(['A', 'B', 'C', 'D'] as const).map(letter => {
                    const optionEs = q[`option_${letter.toLowerCase()}_es` as keyof ExamQuestion] as string | null | undefined;
                    const optionText = isSpanish && optionEs ? optionEs : (q[`option_${letter.toLowerCase()}` as keyof ExamQuestion] as string);
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

            {/* Add Buttons (draft or paused) */}
            {(currentExam.status === 'draft' || currentExam.status === 'paused') && (
              <>
                <TouchableOpacity
                  style={[styles.addQuestionButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                  onPress={() => { resetCustomForm(); setShowAddCustom(true); }}
                >
                  <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
                  <Text style={[styles.addQuestionText, { color: colors.primary }]}>{t('exam_editor.add_custom_question')}</Text>
                </TouchableOpacity>

                {!questions.some(q => q.is_bonus) && (
                  <TouchableOpacity
                    style={[styles.addQuestionButton, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B' }]}
                    onPress={() => { resetCustomForm(); setShowAddBonus(true); }}
                  >
                    <IconSymbol ios_icon_name="star.circle.fill" android_material_icon_name="stars" size={20} color="#F59E0B" />
                    <Text style={[styles.addQuestionText, { color: '#F59E0B' }]}>{t('exam_editor.add_bonus_question')}</Text>
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
                    <Text style={[styles.previewButtonText, { color: colors.primary }]}>{t('exam_editor.preview_quiz')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.activateButton, { backgroundColor: '#10B981' }]}
                    onPress={handleActivate}
                  >
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={22} color="#FFF" />
                    <Text style={styles.activateButtonText}>{t('exam_editor.activate_quiz')}</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentExam.status === 'active' && (
                <>
                  <TouchableOpacity
                    style={[styles.pauseButton, { backgroundColor: '#F59E0B' }]}
                    onPress={handlePause}
                  >
                    <IconSymbol ios_icon_name="pause.circle.fill" android_material_icon_name="pause-circle-filled" size={22} color="#FFF" />
                    <Text style={styles.pauseButtonText}>{t('exam_editor.pause_quiz')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.closeButton, { borderColor: '#EF4444' }]}
                    onPress={handleClose}
                  >
                    <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color="#EF4444" />
                    <Text style={[styles.closeButtonText, { color: '#EF4444' }]}>{t('exam_editor.close_quiz')}</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentExam.status === 'paused' && (
                <>
                  <TouchableOpacity
                    style={[styles.activateButton, { backgroundColor: '#10B981' }]}
                    onPress={handleResume}
                  >
                    <IconSymbol ios_icon_name="play.circle.fill" android_material_icon_name="play-circle-filled" size={22} color="#FFF" />
                    <Text style={styles.activateButtonText}>{t('exam_editor.resume_quiz')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.closeButton, { borderColor: '#EF4444' }]}
                    onPress={handleClose}
                  >
                    <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color="#EF4444" />
                    <Text style={[styles.closeButtonText, { color: '#EF4444' }]}>{t('exam_editor.close_quiz')}</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.resetButton, { borderColor: colors.textSecondary }]}
                onPress={handleResetAndNew}
              >
                <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={18} color={colors.textSecondary} />
                <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>{t('exam_editor.reset_new_quiz')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Completion Tracker */}
        {currentExam && activeSection === 'tracker' && (
          <>
            <View style={[styles.trackerSummary, { backgroundColor: colors.card }]}>
              <Text style={[styles.trackerSummaryText, { color: colors.text }]}>
                {t('exam_editor.completed_ratio', { done: completedCount, total: totalEmployees })}
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
                    <StorageImage source={{ uri: entry.profile_picture_url }} style={styles.trackerAvatarImage} />
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
                      <Text style={[styles.retakeButtonText, { color: colors.primary }]}>{t('common.view')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retakeButton, { borderColor: colors.primary }]}
                      onPress={() => handleResetUserQuiz(entry)}
                    >
                      <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={12} color={colors.primary} />
                      <Text style={[styles.retakeButtonText, { color: colors.primary }]}>{t('exam_editor.retake_btn')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.notTakenBadge, { backgroundColor: '#EF444420' }]}>
                    <Text style={styles.notTakenText}>{t('exam_editor.not_taken')}</Text>
                  </View>
                )}
              </View>
            ))}

            {completionData.length === 0 && (
              <Text style={[styles.emptyTrackerText, { color: colors.textSecondary }]}>
                {t('exam_editor.no_employees')}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Custom Question Modal */}
      <Modal visible={showAddCustom || showAddBonus} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {showAddBonus ? t('exam_editor.add_bonus_question') : t('exam_editor.add_custom_question')}
                </Text>
                <TouchableOpacity onPress={() => { setShowAddCustom(false); setShowAddBonus(false); }}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 320 }} keyboardShouldPersistTaps="handled">
                {showAddBonus ? (
                  <View style={styles.bonusValueRow}>
                    <View style={{ flex: 1 }}><Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.bonus_bucks_value', { currency: currencyName })}</Text></View>
                    <TextInput
                      style={[styles.bonusInput, { backgroundColor: colors.background, color: '#F59E0B', borderColor: '#F59E0B' }]}
                      value={bonusBucksValue}
                      onChangeText={setBonusBucksValue}
                      keyboardType="numeric"
                      placeholder="5"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                ) : (
                  <View style={styles.bonusValueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.currency_value', { currency: currencyName })}</Text>
                      <Text style={[styles.notifyDesc, { color: colors.textSecondary, marginTop: 2 }]}>
                        {t('exam_editor.leave_blank_default')}
                      </Text>
                    </View>
                    <TextInput
                      style={[styles.bonusInput, { backgroundColor: colors.background, color: colors.primary, borderColor: colors.primary }]}
                      value={customBucksValue}
                      onChangeText={setCustomBucksValue}
                      keyboardType="numeric"
                      placeholder={t('exam_editor.default_ph')}
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                )}

                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.photo_optional')}</Text>
                {customImageUrl ? (
                  <View style={styles.photoPreviewRow}>
                    <StorageImage source={{ uri: customImageUrl }} style={styles.photoPreview} resizeMode="cover" />
                    <View style={styles.photoPreviewButtons}>
                      <TouchableOpacity
                        style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                        onPress={handleAttachPhotoToCustomForm}
                        disabled={uploadingImage}
                      >
                        <Text style={[styles.photoButtonText, { color: colors.primary }]}>
                          {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.change_photo')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoButton, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                        onPress={() => setCustomImageUrl(null)}
                        disabled={uploadingImage}
                      >
                        <Text style={[styles.photoButtonText, { color: '#EF4444' }]}>{t('exam_editor.remove')}</Text>
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
                      {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.add_photo')}
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.question_label')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={isSpanish ? customTextEs : customText}
                  onChangeText={isSpanish ? setCustomTextEs : setCustomText}
                  placeholder={t('exam_editor.enter_question_ph')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                {(['A', 'B', 'C', 'D'] as const).map(letter => {
                  const value = isSpanish
                    ? (letter === 'A' ? customAEs : letter === 'B' ? customBEs : letter === 'C' ? customCEs : customDEs)
                    : (letter === 'A' ? customA : letter === 'B' ? customB : letter === 'C' ? customC : customD);
                  const setter = isSpanish
                    ? (letter === 'A' ? setCustomAEs : letter === 'B' ? setCustomBEs : letter === 'C' ? setCustomCEs : setCustomDEs)
                    : (letter === 'A' ? setCustomA : letter === 'B' ? setCustomB : letter === 'C' ? setCustomC : setCustomD);
                  return (
                    <View key={letter}>
                      <View style={styles.optionLabelRow}>
                        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.option_letter', { letter })}</Text>
                        <TouchableOpacity
                          style={[
                            styles.correctToggle,
                            customCorrect === letter && { backgroundColor: '#10B981' },
                            customCorrect !== letter && { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
                          ]}
                          onPress={() => setCustomCorrect(letter)}
                        >
                          <Text style={[styles.correctToggleText, { color: customCorrect === letter ? '#FFF' : colors.textSecondary }]}>
                            {customCorrect === letter ? t('exam_editor.correct') : t('exam_editor.set_correct')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={value}
                        onChangeText={setter}
                        placeholder={t('exam_editor.option_letter_ph', { letter })}
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  );
                })}

                {addTranslation.element}

                <TouchableOpacity
                  style={[styles.modalSaveButton, { backgroundColor: showAddBonus ? '#F59E0B' : colors.primary }]}
                  onPress={() => handleAddCustom(showAddBonus)}
                >
                  <Text style={[styles.modalSaveText, !showAddBonus && { color: colors.fireText }]}>
                    {showAddBonus ? t('exam_editor.add_bonus_question') : t('exam_editor.add_question_btn')}
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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('exam_editor.edit_question')}</Text>
                <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {editingQuestion && (
                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 320 }} keyboardShouldPersistTaps="handled">
                  {editingQuestion.is_bonus ? (
                    <View style={styles.bonusValueRow}>
                      <View style={{ flex: 1 }}><Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.bonus_bucks_value', { currency: currencyName })}</Text></View>
                      <TextInput
                        style={[styles.bonusInput, { backgroundColor: colors.background, color: '#F59E0B', borderColor: '#F59E0B' }]}
                        value={String(editingQuestion.bonus_bucks_value || 5)}
                        onChangeText={(v) => setEditingQuestion({ ...editingQuestion, bonus_bucks_value: parseInt(v) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>
                  ) : (
                    <View style={styles.bonusValueRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.currency_value', { currency: currencyName })}</Text>
                        <Text style={[styles.notifyDesc, { color: colors.textSecondary, marginTop: 2 }]}>
                          {t('exam_editor.leave_blank_default')}
                        </Text>
                      </View>
                      <TextInput
                        style={[styles.bonusInput, { backgroundColor: colors.background, color: colors.primary, borderColor: colors.primary }]}
                        value={
                          editingQuestion.bucks_value === null || editingQuestion.bucks_value === undefined
                            ? ''
                            : String(editingQuestion.bucks_value)
                        }
                        onChangeText={(v) => {
                          const trimmed = v.trim();
                          if (trimmed === '') {
                            setEditingQuestion({ ...editingQuestion, bucks_value: null });
                          } else {
                            const n = parseInt(trimmed);
                            setEditingQuestion({ ...editingQuestion, bucks_value: Number.isNaN(n) ? null : n });
                          }
                        }}
                        keyboardType="numeric"
                        placeholder={t('exam_editor.default_ph')}
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  )}

                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.photo_optional')}</Text>
                  {editingQuestion.question_image_url ? (
                    <View style={styles.photoPreviewRow}>
                      <StorageImage source={{ uri: editingQuestion.question_image_url }} style={styles.photoPreview} resizeMode="cover" />
                      <View style={styles.photoPreviewButtons}>
                        <TouchableOpacity
                          style={[styles.photoButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                          onPress={handleAttachPhotoToEditingQuestion}
                          disabled={uploadingImage}
                        >
                          <Text style={[styles.photoButtonText, { color: colors.primary }]}>
                            {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.change_photo')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.photoButton, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                          onPress={handleRemovePhotoFromEditingQuestion}
                          disabled={uploadingImage}
                        >
                          <Text style={[styles.photoButtonText, { color: '#EF4444' }]}>{t('exam_editor.remove')}</Text>
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
                        {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.add_photo')}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.question_label')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    value={isSpanish ? (editingQuestion.question_text_es ?? '') : editingQuestion.question_text}
                    onChangeText={(v) => setEditingQuestion(prev => prev ? { ...prev, [isSpanish ? 'question_text_es' : 'question_text']: v } : prev)}
                    multiline
                  />

                  {(['A', 'B', 'C', 'D'] as const).map(letter => {
                    const key = (isSpanish ? `option_${letter.toLowerCase()}_es` : `option_${letter.toLowerCase()}`) as keyof ExamQuestion;
                    return (
                      <View key={letter}>
                        <View style={styles.optionLabelRow}>
                          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.option_letter', { letter })}</Text>
                          <TouchableOpacity
                            style={[
                              styles.correctToggle,
                              editingQuestion.correct_option === letter && { backgroundColor: '#10B981' },
                              editingQuestion.correct_option !== letter && { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
                            ]}
                            onPress={() => setEditingQuestion({ ...editingQuestion, correct_option: letter })}
                          >
                            <Text style={[styles.correctToggleText, { color: editingQuestion.correct_option === letter ? '#FFF' : colors.textSecondary }]}>
                              {editingQuestion.correct_option === letter ? t('exam_editor.correct') : t('exam_editor.set_correct')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={(editingQuestion[key] as string | null | undefined) ?? ''}
                          onChangeText={(v) => setEditingQuestion(prev => prev ? { ...prev, [key]: v } : prev)}
                        />
                      </View>
                    );
                  })}

                  {editTranslation.element}

                  <TouchableOpacity
                    style={[styles.modalSaveButton, { backgroundColor: colors.primary }]}
                    onPress={handleSaveEdit}
                  >
                    <Text style={[styles.modalSaveText, { color: colors.fireText }]}>{t('exam_editor.save_changes')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Category Picker Modal — for editing a question's category_label */}
      <Modal
        visible={!!categoryPickerForQuestion}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCategoryPickerForQuestion(null);
          setShowCustomCategoryInput(false);
          setCustomCategoryText('');
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <TouchableOpacity
            style={styles.datePickerOverlay}
            activeOpacity={1}
            onPress={() => {
              setCategoryPickerForQuestion(null);
              setShowCustomCategoryInput(false);
              setCustomCategoryText('');
            }}
          >
          <View
            style={[styles.datePickerContainer, { backgroundColor: colors.card, padding: 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 12 }]}>
              {t('exam_editor.question_category')}
            </Text>
            {!showCustomCategoryInput ? (
              <>
                {CATEGORY_OPTIONS.map((opt) => {
                  const q = categoryPickerForQuestion;
                  const isCurrent =
                    q && (q.category_label
                      ? q.category_label === opt.label
                      : q.source_table === opt.sourceTable);
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.categoryRow,
                        { borderBottomColor: colors.border },
                        isCurrent && { backgroundColor: colors.primary + '15' },
                      ]}
                      onPress={() => {
                        if (!q) return;
                        // If selection matches the derived label, clear the override.
                        const newLabel = q.source_table === opt.sourceTable ? null : opt.label;
                        handleUpdateCategoryLabel(q, newLabel);
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                        {t(opt.labelKey)}
                      </Text>
                      {isCurrent && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.categoryRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    const q = categoryPickerForQuestion;
                    setCustomCategoryText(q?.category_label || '');
                    setShowCustomCategoryInput(true);
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                    {t('common.custom_option')}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron-right"
                    size={16}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </>
            ) : (
              <View>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                  {t('exam_editor.custom_category')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={customCategoryText}
                  onChangeText={setCustomCategoryText}
                  placeholder={t('exam_editor.custom_category_ph')}
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => {
                      setShowCustomCategoryInput(false);
                      setCustomCategoryText('');
                    }}
                  >
                    <Text style={[styles.modalSaveText, { color: colors.text }]}>{t('common.back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, { flex: 1, backgroundColor: colors.primary }]}
                    onPress={() => {
                      const q = categoryPickerForQuestion;
                      if (!q) return;
                      const trimmed = customCategoryText.trim();
                      handleUpdateCategoryLabel(q, trimmed || null);
                    }}
                  >
                    <Text style={[styles.modalSaveText, { color: colors.fireText }]}>{t('common.save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* iOS Close-At Date Picker */}
      {Platform.OS === 'ios' && showCloseDatePicker && (
        <Modal visible transparent animationType="fade">
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerContainer, { backgroundColor: colors.card }]}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => { setShowCloseDatePicker(false); setShowCloseTimePicker(true); }}>
                  <Text style={[styles.datePickerDone, { color: colors.primary }]}>{t('exam_editor.picker_next_time')}</Text>
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
                  <Text style={[styles.datePickerDone, { color: colors.primary }]}>{t('exam_editor.picker_done')}</Text>
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
  sourceChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  pauseButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
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
