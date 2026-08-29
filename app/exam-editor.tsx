/**
 * Exam editor — s77 lockdown rebuild (the three-state morph):
 *
 *   · NO QUIZ  → the composer (count console + source/photo/difficulty dials,
 *                default $ value, time limit, blank-quiz path, ⓘ legend).
 *   · DRAFT    → glass settings console (collapsible) + Questions as a fold +
 *                side-by-side add buttons + Preview/Start-over + Activate.
 *   · ACTIVE   → the role-gradient live console PINNED outside the scroll
 *                (countdown · vitals · Pause/Preview/Close/New in the 2×2),
 *                Questions folded read-only, Tracker fold with its ring.
 *   · PAUSED   → morphs back editable: PAUSED pill + RESUME chip in the glass
 *                console, questions unlocked, sticky Resume dock.
 *
 * All lifecycle RPCs, the s61 hybrid bilingual modals, the storage-broker
 * photo path and the anti-cheat surfaces are inherited unchanged.
 */

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
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import GlassActionSheet from '@/components/GlassActionSheet';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  generateQuizQuestions,
  generatePhotoQuestion,
  getCurrentWeekKey,
  getExamTypeName,
} from '@/utils/exam/questionGenerator';
import type { ExamType, GeneratedQuestion, QuizSource } from '@/utils/exam/questionGenerator';
import { useTranslationSection } from '@/components/TranslationSection';
import { formatTime } from '@/utils/exam/examEngine';
import { activateExamWithDefaults } from '@/utils/exam/examActions';
import { bothLanguages } from '@/utils/notificationHelpers';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import QuizComposer, { ComposerResult } from '@/components/quiz/QuizComposer';
import { CATEGORY_OPTIONS, sourceForQuestion, questionCategoryLabel } from '@/utils/exam/questionCategory';
import QuizSettingsConsole from '@/components/quiz/QuizSettingsConsole';
import QuizLiveConsole from '@/components/quiz/QuizLiveConsole';
import QuestionCard, { EditorQuestion } from '@/components/quiz/QuestionCard';
import QuizFold from '@/components/quiz/QuizFold';
import ShineButton from '@/components/quiz/ShineButton';
import ProgressRing from '@/components/ProgressRing';
import { QUIZ_VISUALS } from '@/components/quiz/quizVisuals';
import { fonts } from '@/constants/fonts';

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

type ExamQuestion = EditorQuestion;

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

const TIME_PRESETS = [60, 105, 120, 180, 240, 300, 360, 420, 480, 0];

export default function ExamEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n: i18nHook } = useTranslation();
  const isSpanish = i18nHook.language === 'es';
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const currencyName = organization.reward_currency_name;
  const params = useLocalSearchParams<{ type: string; tab: string }>();
  const examType = (params.type || 'server') as ExamType;
  const visual = QUIZ_VISUALS[examType];

  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [completionData, setCompletionData] = useState<CompletionEntry[]>([]);
  const [defaultBucksValue, setDefaultBucksValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // The morph's fold states.
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [trackerOpen, setTrackerOpen] = useState(params.tab === 'tracker');

  // Modals / sheets
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showAddBonus, setShowAddBonus] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [showValueSheet, setShowValueSheet] = useState(false);
  const [valueSheetText, setValueSheetText] = useState('');
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [regenQuestion, setRegenQuestion] = useState<ExamQuestion | null>(null);
  const [timeLimit, setTimeLimit] = useState(300);

  // Custom question form state (s61 hybrid bilingual authoring)
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
  const [customBucksValue, setCustomBucksValue] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Category-tag picker — 'assign' relabels a question; 'regen' regenerates
  // from the picked category's pool (MOD·REGEN lockdown).
  const [categoryPickerForQuestion, setCategoryPickerForQuestion] = useState<ExamQuestion | null>(null);
  const [catPickerMode, setCatPickerMode] = useState<'assign' | 'regen'>('assign');
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [showCloseDatePicker, setShowCloseDatePicker] = useState(false);
  const [showCloseTimePicker, setShowCloseTimePicker] = useState(false);
  const [closeAt, setCloseAt] = useState<Date | null>(null);
  const [notifyOnActivate, setNotifyOnActivate] = useState(false);
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  // Countdown tick — re-render each second while a live close_at counts down.
  const [, setCountdownTick] = useState(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);

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

  // ─── Data ───────────────────────────────────────────────────────────────

  const fetchDefaultValue = async (examId: string) => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.rpc('get_exam_default_bucks_value', {
        p_actor_id: user.id, p_exam_id: examId,
      });
      setDefaultBucksValue(typeof data === 'number' ? data : null);
    } catch {
      setDefaultBucksValue(null);
    }
  };

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
        // The morph's default fold posture per state.
        if (exam.status === 'active') {
          setQuestionsOpen(false);
          setTrackerOpen(params.tab === 'tracker');
        } else {
          setQuestionsOpen(true);
        }
        await fetchQuestions(exam.id);
        await fetchDefaultValue(exam.id);
        if (exam.status === 'active' || exam.status === 'paused') {
          await fetchCompletionData(exam.id);
        }
      } else {
        setCurrentExam(null);
        setQuestions([]);
        setCloseAt(null);
        setNotifyOnActivate(false);
        setRewardsEnabled(true);
        setDefaultBucksValue(null);
      }
    } catch (err) {
      console.error('Error fetching exam:', err);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examType, user?.id]);

  // Tick a countdown re-render once per second while a close_at is active.
  useEffect(() => {
    if (!closeAt || !currentExam || currentExam.status === 'closed' || currentExam.status === 'paused') {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdownTick(n => (n + 1) % 1_000_000);
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

  // ─── Composer → create + generate ───────────────────────────────────────

  const applyComposerSettings = async (examId: string, opts: ComposerResult) => {
    if (!user?.id) return;
    await supabase.rpc('update_exam_settings', {
      p_actor_id: user.id, p_exam_id: examId, p_time_limit_seconds: opts.timeLimitSeconds,
    });
    if (opts.defaultBucksValue != null) {
      await supabase.rpc('set_exam_default_bucks_value', {
        p_actor_id: user.id, p_exam_id: examId, p_value: opts.defaultBucksValue,
      });
    }
  };

  const createExamShell = async (actorId: string): Promise<Exam> => {
    const { data: examRows, error: examError } = await supabase.rpc('create_exam', {
      p_actor_id: actorId,
      p_exam_type: examType,
      p_cycle_key: getCurrentWeekKey(),
    });
    if (examError) throw examError;
    const exam = (examRows as Exam[])?.[0];
    if (!exam) throw new Error(t('exam_editor.no_data_returned'));
    return exam;
  };

  const handleGenerate = async (opts: ComposerResult) => {
    if (!user?.id) return;
    setGenerating(true);
    try {
      const exam = await createExamShell(user.id);
      await applyComposerSettings(exam.id, opts);

      const generated = await generateQuizQuestions(
        examType, exam.cycle_key, opts.count, organizationId ?? '', user.id,
        { sources: opts.sources, photoCount: opts.photoCount, difficulty: opts.difficulty },
      );
      const questionsToInsert = generated.map((q) => ({
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
      // Server assigns question_order (1-based) + org; extra keys are ignored.
      const { error } = await supabase.rpc('create_exam_questions', {
        p_actor_id: user.id,
        p_exam_id: exam.id,
        p_questions: questionsToInsert,
      });
      if (error) throw error;

      setCurrentExam({ ...exam, time_limit_seconds: opts.timeLimitSeconds });
      setTimeLimit(opts.timeLimitSeconds);
      setDefaultBucksValue(opts.defaultBucksValue);
      setQuestionsOpen(true);
      await fetchQuestions(exam.id);
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err, t('exam_editor.failed_generate')));
      console.error('Generate error:', err);
    }
    setGenerating(false);
  };

  const handleStartBlank = async (opts: ComposerResult) => {
    if (!user?.id) return;
    setGenerating(true);
    try {
      const exam = await createExamShell(user.id);
      await applyComposerSettings(exam.id, opts);
      setCurrentExam({ ...exam, time_limit_seconds: opts.timeLimitSeconds });
      setTimeLimit(opts.timeLimitSeconds);
      setDefaultBucksValue(opts.defaultBucksValue);
      setQuestions([]);
      setQuestionsOpen(true);
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err, t('exam_editor.failed_generate')));
    }
    setGenerating(false);
  };

  // ─── Settings ───────────────────────────────────────────────────────────

  const handleUpdateTimeLimit = async (newSeconds: number) => {
    if (!currentExam || !user?.id) return;
    setTimeLimit(newSeconds);
    await supabase.rpc('update_exam_settings', {
      p_actor_id: user?.id, p_exam_id: currentExam.id, p_time_limit_seconds: newSeconds,
    });
  };

  const handleSaveDefaultValue = async () => {
    if (!currentExam || !user?.id) return;
    const trimmed = valueSheetText.trim();
    const next = trimmed === '' ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    setShowValueSheet(false);
    try {
      const { error } = await supabase.rpc('set_exam_default_bucks_value', {
        p_actor_id: user.id, p_exam_id: currentExam.id, p_value: next,
      });
      if (error) throw error;
      setDefaultBucksValue(next);
      // The Rewards toggle follows the value (Steve's smoke round): $0 means
      // this quiz pays nothing → flip rewards off; any paying value → on.
      const shouldReward = next !== 0;
      if (shouldReward !== rewardsEnabled) {
        handleToggleRewardsEnabled(shouldReward);
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err));
    }
  };

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

  // ─── Lifecycle ──────────────────────────────────────────────────────────

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
            setActionBusy(true);
            try {
              const effective = await activateExamWithDefaults({
                actorId: user.id,
                organizationId: organizationId ?? null,
                examId: currentExam.id,
                examType,
                notifyOnActivate,
                closeAt,
              });
              setCloseAt(effective);
              setNotifyOnActivate(false);
              await fetchCurrentExam();
              Alert.alert(t('exam_editor.activated_title'), t('exam_editor.activated_msg'));
            } catch (err: any) {
              console.error('Activate error:', err);
              Alert.alert(t('common.error'), translateServerError(err));
            }
            setActionBusy(false);
          },
        },
      ]
    );
  };

  const setStatus = async (status: 'active' | 'paused' | 'closed', clearAfter = false) => {
    if (!currentExam || !user?.id) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc('set_exam_status', {
        p_actor_id: user?.id, p_exam_id: currentExam.id, p_status: status,
      });
      if (error) throw error;
      if (clearAfter) {
        setCurrentExam(null);
        setQuestions([]);
        setCompletionData([]);
        setDefaultBucksValue(null);
      } else {
        await fetchCurrentExam();
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err));
    }
    setActionBusy(false);
  };

  const handlePause = () => {
    Alert.alert(t('exam_editor.pause_quiz'), t('exam_editor.pause_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exam_editor.pause_btn'), onPress: () => setStatus('paused') },
    ]);
  };

  const handleResume = () => {
    Alert.alert(t('exam_editor.resume_quiz'), t('exam_editor.resume_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exam_editor.resume_btn'), onPress: () => setStatus('active') },
    ]);
  };

  const handleClose = () => {
    Alert.alert(t('exam_editor.close_quiz'), t('exam_editor.close_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.close'), style: 'destructive', onPress: () => setStatus('closed', true) },
    ]);
  };

  const handleResetAndNew = () => {
    if (!user?.id) return;
    Alert.alert(t('exam_editor.reset_new_quiz'), t('exam_editor.reset_new_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('exam_editor.reset_btn'),
        style: 'destructive',
        onPress: async () => {
          if (currentExam) {
            await setStatus('closed', true);
          }
        },
      },
    ]);
  };

  const handlePreview = () => {
    if (!currentExam || questions.length === 0) return;
    router.push(`/exam-play?examId=${currentExam.id}&preview=true`);
  };

  // ─── Questions ──────────────────────────────────────────────────────────

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

  const handleDeleteQuestion = (question: ExamQuestion) => {
    if (!user?.id) return;
    Alert.alert(t('exam_editor.delete_q_title'), t('exam_editor.delete_q_msg'), [
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
    ]);
  };

  // Regenerate one question — optionally pinned to a source pool. A photo
  // question with no pin regenerates as a fresh photo question (the classic
  // behavior); a pinned regen always draws text templates from that pool.
  const handleRefreshQuestion = async (
    question: ExamQuestion,
    pin?: { source: QuizSource; clearLabel?: boolean },
  ) => {
    if (!currentExam || !user?.id) return;
    setRefreshingQuestionId(question.id);
    try {
      let newQuestion: GeneratedQuestion | null = null;
      if (!pin && question.question_image_url) {
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
        const cycleKey = currentExam.cycle_key + '-refresh-' + Date.now().toString(36);
        const generated = await generateQuizQuestions(
          examType, cycleKey, 5, organizationId ?? '', user.id,
          pin ? { sources: [pin.source], photoCount: 0 } : {},
        );
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
            // A pinned regen shows its new source honestly — drop any override.
            ...(pin?.clearLabel ? { category_label: null } : {}),
          },
        });
        if (error) {
          Alert.alert(t('common.error'), translateServerError(error));
        } else {
          await fetchQuestions(currentExam.id);
        }
      } else {
        Alert.alert(t('common.error'), t('exam_editor.failed_refresh'));
      }
    } catch (err) {
      console.error('Refresh question error:', err);
      Alert.alert(t('common.error'), t('exam_editor.failed_refresh'));
    }
    setRefreshingQuestionId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion || !user?.id) return;
    // Fill/refresh the other language per the s61 staleness rules; sending the
    // _es keys explicitly (value or null) keeps stale Spanish from surviving.
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

  // ─── Image picker / upload for picture questions ────────────────────────
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

  const getSourceLabel = (q: ExamQuestion) => questionCategoryLabel(q, t);

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
              // Gated RPC: deletes the result + dismissals and claws back bucks.
              const { error: resetError } = await supabase.rpc('reset_user_exam_attempt', {
                p_exam_id: currentExam.id,
                p_user_id: entry.user_id,
                p_organization_id: organizationId,
                p_actor_id: user?.id,
              });
              if (resetError) throw resetError;
              await fetchCompletionData(currentExam.id);

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
                // Log to the shade — visible only to managers/owners and the
                // cleared user (retake_granted), never the whole org.
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

  // ─── Derived ────────────────────────────────────────────────────────────

  const completedCount = completionData.filter(e => e.has_completed).length;
  const totalEmployees = completionData.length;
  const paidTotal = completionData.reduce((sum, e) => sum + (e.has_completed ? e.bucks_awarded : 0), 0);
  const scored = completionData.filter(e => e.has_completed && e.total_questions > 0);
  const avgPct = scored.length > 0
    ? Math.round((scored.reduce((s, e) => s + e.correct_count / e.total_questions, 0) / scored.length) * 100)
    : null;
  const bonusQ = questions.find(q => q.is_bonus);

  const consoleSummary = (() => {
    const parts: string[] = [];
    parts.push(t('weekly_quizzes.question_count_short', { count: questions.length }));
    parts.push(timeLimit === 0 ? '∞' : formatTime(timeLimit));
    if (closeAt) {
      parts.push(t('exam_editor.sum_closes', {
        date: closeAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      }));
    }
    return parts.join(' · ');
  })();

  const payoutLine = (() => {
    if (!rewardsEnabled) return null;
    const base = defaultBucksValue ?? 1;
    const max = questions.filter(q => !q.is_bonus).length * base + (bonusQ?.bonus_bucks_value ?? 0);
    return t('exam_editor.payout_line_max', { max });
  })();

  // The split explainer under the Rewards chip (Steve's smoke-2 note): the
  // plain-English rule, plus the concrete 2-/3-quiz per-answer math so a
  // first-time O/M sees exactly what the split does.
  const fmtSplit = (n: number) => (n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`);
  const splitNote = (() => {
    if (!rewardsEnabled) return null;
    const base = defaultBucksValue ?? 1;
    if (base <= 0) return null;
    return `${t('exam_editor.split_note')} ${t('exam_editor.split_note_math', {
      base: fmtSplit(base),
      two: fmtSplit(base / 2),
      three: fmtSplit(base / 3),
    })}`;
  })();

  // Plain dollar number everywhere — the split story lives on the Rewards
  // line only (Steve's smoke ruling). Unset = the $1 base.
  const valueLabel = `$${defaultBucksValue ?? 1}`;

  const closeAtLabel = closeAt
    ? closeAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : t('exam_editor.set_datetime');

  // ─── Render pieces ──────────────────────────────────────────────────────

  const renderTrackerRows = () => (
    <>
      {completionData.map(entry => (
        <View key={entry.user_id} style={[styles.trow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          {entry.profile_picture_url ? (
            <StorageImage source={{ uri: entry.profile_picture_url }} style={styles.tavImage} />
          ) : (
            <View style={[styles.tav, { backgroundColor: visual.accent + '33' }]}>
              <Text style={[styles.tavText, { color: visual.accent }]}>
                {entry.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.tbd}>
            <Text style={[styles.tnm, { color: colors.text }]} numberOfLines={1}>{entry.name}</Text>
            <Text style={[styles.tjb, { color: colors.textSecondary }]} numberOfLines={1}>{entry.job_title}</Text>
          </View>
          {entry.has_completed ? (
            <>
              <View style={styles.tsc}>
                <Text style={styles.tscScore}>{entry.correct_count}/{entry.total_questions}</Text>
                <Text style={styles.tscBucks}>+${entry.bucks_awarded}</Text>
              </View>
              <View style={styles.tchips}>
                <TouchableOpacity
                  style={[styles.tchip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={() => router.push(`/exam-answer-review?examId=${currentExam?.id}&userId=${entry.user_id}` as any)}
                >
                  <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={10} color={visual.accent} />
                  <Text style={[styles.tchipText, { color: visual.accent }]}>{t('common.view')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tchip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={() => handleResetUserQuiz(entry)}
                >
                  <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={10} color={visual.accent} />
                  <Text style={[styles.tchipText, { color: visual.accent }]}>{t('exam_editor.retake_btn')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.notTaken}>
              <Text style={styles.notTakenText}>{t('exam_editor.not_taken').toUpperCase()}</Text>
            </View>
          )}
        </View>
      ))}
      {completionData.length === 0 && (
        <Text style={[styles.emptyTracker, { color: colors.textSecondary }]}>
          {t('exam_editor.no_employees')}
        </Text>
      )}
    </>
  );

  const renderQuestionsFold = (editable: boolean, locked: boolean) => (
    <QuizFold
      title={t('exam_editor.questions')}
      iosIcon="list.bullet"
      androidIcon="format-list-bulleted"
      iconColor={locked ? colors.textSecondary : visual.accent}
      meta={
        locked
          ? t('exam_editor.locked_while_live', { count: questions.length })
          : String(questions.length + (bonusQ ? 0 : 0))
      }
      open={questionsOpen}
      onToggle={() => setQuestionsOpen(o => !o)}
    >
      {questions.map(q => (
        <QuestionCard
          key={q.id}
          question={q}
          categoryLabel={getSourceLabel(q)}
          accent={visual.accent}
          defaultBucksValue={defaultBucksValue}
          editable={editable}
          locked={locked}
          refreshing={refreshingQuestionId === q.id}
          isSpanish={isSpanish}
          onPressCategory={() => { setCatPickerMode('assign'); setCategoryPickerForQuestion(q); }}
          onRefresh={() => setRegenQuestion(q)}
          onEdit={() => setEditingQuestion(q)}
          onDelete={() => handleDeleteQuestion(q)}
        />
      ))}
      {questions.length === 0 && (
        <Text style={[styles.emptyTracker, { color: colors.textSecondary }]}>
          {t('exam_editor.no_questions_yet')}
        </Text>
      )}
      {locked && questions.length > 0 && (
        <Text style={[styles.lockedNote, { color: colors.textSecondary }]}>
          {t('exam_editor.locked_note')}
        </Text>
      )}
      {editable && (
        // The add buttons live INSIDE the Questions fold, at its foot — right
        // where new questions land (Steve's smoke round).
        <View style={[styles.btnRow, styles.addRowInFold]}>
          <TouchableOpacity
            style={[styles.dashBtn, { borderColor: visual.accent + '73', backgroundColor: visual.accent + '12' }]}
            onPress={() => { resetCustomForm(); setShowAddCustom(true); }}
          >
            <IconSymbol ios_icon_name="plus.circle" android_material_icon_name="add-circle-outline" size={15} color={visual.accent} />
            <Text style={[styles.dashText, { color: visual.accent }]}>{t('exam_editor.add_custom_short')}</Text>
          </TouchableOpacity>
          {!bonusQ && (
            <TouchableOpacity
              style={[styles.dashBtn, { borderColor: '#F59E0B80', backgroundColor: '#F59E0B14' }]}
              onPress={() => { resetCustomForm(); setShowAddBonus(true); }}
            >
              <IconSymbol ios_icon_name="star.circle" android_material_icon_name="stars" size={15} color="#F59E0B" />
              <Text style={[styles.dashText, { color: '#F59E0B' }]}>{t('exam_editor.add_bonus_short')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </QuizFold>
  );

  const trackerRing = (
    <ProgressRing
      pct={totalEmployees > 0 ? (completedCount / totalEmployees) * 100 : 0}
      size={38}
      stroke={4}
      color={visual.accent}
      trackColor={colors.glassBorder}
    >
      <Text style={[styles.ringLabel, { color: colors.text }]}>
        {completedCount}/{totalEmployees}
      </Text>
    </ProgressRing>
  );

  // ─── Early exits ────────────────────────────────────────────────────────

  const headerTitle = t('weekly_quizzes.type_quiz_title', { type: getExamTypeName(examType, isSpanish) });

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={headerTitle} eyebrow={t('weekly_quizzes.title')} />
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
        <AmbientGlow />
        <ScreenHeader title={headerTitle} eyebrow={t('weekly_quizzes.title')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={visual.accent} />
        </View>
      </View>
    );
  }

  const status = currentExam?.status;
  const isLive = status === 'active';
  const isDraftish = status === 'draft' || status === 'paused';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AmbientGlow />
      <ScreenHeader
        title={headerTitle}
        eyebrow={t('weekly_quizzes.title')}
        right={
          !currentExam ? (
            <TouchableOpacity
              style={[styles.infoChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={() => setShowInfoSheet(true)}
            >
              <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info-outline" size={17} color={visual.accent} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* The pinned live console — native chrome outside the scroll (ED·LIVE). */}
      {currentExam && isLive && (
        <View style={styles.pinnedConsole}>
          <QuizLiveConsole
            examType={examType}
            closeAt={closeAt}
            questionCount={questions.length}
            completedCount={completedCount}
            totalEmployees={totalEmployees}
            avgPct={avgPct}
            paidTotal={paidTotal}
            busy={actionBusy}
            onPause={handlePause}
            onPreview={handlePreview}
            onCloseQuiz={handleClose}
            onNewQuiz={handleResetAndNew}
          />
        </View>
      )}

      <ScrollView
        // The paused state's sticky Resume dock floats over the tail — give
        // the scroll enough runway that Close/New clear it (Steve's smoke
        // round: they were hiding behind the dock).
        contentContainerStyle={[styles.contentContainer, status === 'paused' && styles.pausedRunway]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── No quiz: the composer ── */}
        {!currentExam && (
          <QuizComposer
            examType={examType}
            currencyName={currencyName}
            generating={generating}
            onGenerate={handleGenerate}
            onStartBlank={handleStartBlank}
          />
        )}

        {/* ── Draft / paused: settings console + editable questions ── */}
        {currentExam && isDraftish && (
          <>
            <QuizSettingsConsole
              examType={examType}
              status={status as 'draft' | 'paused'}
              open={consoleOpen}
              onToggleOpen={() => setConsoleOpen(o => !o)}
              summary={consoleSummary}
              timeLimitLabel={timeLimit === 0 ? t('exam_editor.no_limit') : formatTime(timeLimit)}
              onPressTimeLimit={() => setShowTimeSheet(true)}
              closeAtLabel={closeAtLabel}
              onPressCloseAt={() => setShowCloseDatePicker(true)}
              valueLabel={valueLabel}
              onPressValue={() => {
                setValueSheetText(String(defaultBucksValue ?? 1));
                setShowValueSheet(true);
              }}
              notifyOnActivate={notifyOnActivate}
              onToggleNotify={handleToggleNotifyOnActivate}
              rewardsEnabled={rewardsEnabled}
              onToggleRewards={handleToggleRewardsEnabled}
              payoutLine={payoutLine}
              splitNote={splitNote}
              editable={status === 'draft'}
              onResume={status === 'paused' ? handleResume : undefined}
            />

            {renderQuestionsFold(true, false)}

            {status === 'paused' && (
              <QuizFold
                title={t('exam_editor.tracker_fold')}
                iosIcon="person.2"
                androidIcon="people-outline"
                iconColor={visual.accent}
                open={trackerOpen}
                onToggle={() => setTrackerOpen(o => !o)}
                headerExtra={trackerRing}
              >
                {renderTrackerRows()}
              </QuizFold>
            )}

            {status === 'draft' && (
              <>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.quietBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                    onPress={handlePreview}
                  >
                    <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={13} color={colors.text} />
                    <Text style={[styles.quietText, { color: colors.text }]}>{t('exam_editor.preview_btn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quietBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                    onPress={handleResetAndNew}
                  >
                    <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={13} color={colors.textSecondary} />
                    <Text style={[styles.quietText, { color: colors.textSecondary }]}>{t('exam_editor.start_over')}</Text>
                  </TouchableOpacity>
                </View>
                <ShineButton
                  label={t('exam_editor.activate_quiz')}
                  gradient={['#0B7A5C', '#12A97F']}
                  iosIcon="checkmark.circle"
                  androidIcon="check-circle-outline"
                  loading={actionBusy}
                  onPress={handleActivate}
                />
              </>
            )}

            {status === 'paused' && (
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.quietBtn, { backgroundColor: colors.glass, borderColor: '#EF444466' }]}
                  onPress={handleClose}
                >
                  <IconSymbol ios_icon_name="xmark.circle" android_material_icon_name="cancel" size={13} color="#EF4444" />
                  <Text style={[styles.quietText, { color: '#EF4444' }]}>{t('exam_editor.close_btn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quietBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={handleResetAndNew}
                >
                  <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={13} color={colors.textSecondary} />
                  <Text style={[styles.quietText, { color: colors.textSecondary }]}>{t('exam_editor.new_quiz_btn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ── Live: locked questions + tracker under the pinned console ── */}
        {currentExam && isLive && (
          <>
            {renderQuestionsFold(false, true)}
            <QuizFold
              title={t('exam_editor.tracker_fold')}
              iosIcon="person.2"
              androidIcon="people-outline"
              iconColor={visual.accent}
              open={trackerOpen}
              onToggle={() => setTrackerOpen(o => !o)}
              headerExtra={trackerRing}
            >
              {renderTrackerRows()}
            </QuizFold>
          </>
        )}
      </ScrollView>

      {/* The paused state's sticky Resume dock (ED·PAUSED lockdown). */}
      {currentExam && status === 'paused' && (
        <View style={[styles.dock, { backgroundColor: colors.background }]}>
          <ShineButton
            label={t('exam_editor.resume_quiz')}
            gradient={['#0B7A5C', '#12A97F']}
            iosIcon="play.fill"
            androidIcon="play-arrow"
            loading={actionBusy}
            onPress={handleResume}
          />
        </View>
      )}

      {/* ── Add Custom / Bonus Question Modal ── */}
      <Modal visible={showAddCustom || showAddBonus} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={[styles.grabber, { backgroundColor: colors.glassBorder }]} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: showAddBonus ? '#F59E0B' : colors.text }]}>
                  {showAddBonus ? t('exam_editor.add_bonus_question') : t('exam_editor.add_custom_question')}
                </Text>
                <TouchableOpacity onPress={() => { setShowAddCustom(false); setShowAddBonus(false); }}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 320 }} keyboardShouldPersistTaps="handled">
                {/* Value + photo share one row (MOD lockdown). */}
                <View style={styles.valuePhotoRow}>
                  <View style={styles.valueHalf}>
                    <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                      {showAddBonus
                        ? t('exam_editor.bonus_bucks_value', { currency: currencyName })
                        : t('exam_editor.currency_value', { currency: currencyName })}
                    </Text>
                    <TextInput
                      style={[
                        styles.valueInput,
                        { backgroundColor: colors.background, color: showAddBonus ? '#F59E0B' : visual.accent, borderColor: showAddBonus ? '#F59E0B' : colors.border },
                      ]}
                      value={showAddBonus ? bonusBucksValue : customBucksValue}
                      onChangeText={showAddBonus ? setBonusBucksValue : setCustomBucksValue}
                      keyboardType="numeric"
                      placeholder={
                        showAddBonus
                          ? '5'
                          : defaultBucksValue != null
                            ? `$${defaultBucksValue} · ${t('exam_editor.quiz_default')}`
                            : t('exam_editor.default_ph')
                      }
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.valueHalf}>
                    <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.photo_optional')}</Text>
                    {customImageUrl ? (
                      <View style={styles.photoMiniRow}>
                        <StorageImage source={{ uri: customImageUrl }} style={styles.photoMini} resizeMode="cover" />
                        <TouchableOpacity onPress={() => setCustomImageUrl(null)} style={styles.photoMiniRemove}>
                          <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.photoBtn, { backgroundColor: visual.accent + '14', borderColor: visual.accent + '66' }]}
                        onPress={handleAttachPhotoToCustomForm}
                        disabled={uploadingImage}
                      >
                        <IconSymbol ios_icon_name="photo" android_material_icon_name="photo" size={14} color={visual.accent} />
                        <Text style={[styles.photoBtnText, { color: visual.accent }]}>
                          {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.add_photo')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {showAddBonus && (
                  <Text style={[styles.oneShotNote, { color: colors.textSecondary }]}>
                    {t('exam_editor.bonus_one_shot')}
                  </Text>
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
                            customCorrect === letter
                              ? { backgroundColor: '#10B981' }
                              : { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
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

                <ShineButton
                  label={showAddBonus ? t('exam_editor.add_bonus_question') : t('exam_editor.add_question_btn')}
                  gradient={showAddBonus ? ['#B45309', '#F59E0B'] : visual.gradient}
                  onPress={() => handleAddCustom(showAddBonus)}
                  style={styles.modalSave}
                />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Edit Question Modal ── */}
      <Modal visible={!!editingQuestion} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0} style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={[styles.grabber, { backgroundColor: colors.glassBorder }]} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('exam_editor.edit_question')}</Text>
                <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {editingQuestion && (
                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 320 }} keyboardShouldPersistTaps="handled">
                  <View style={styles.valuePhotoRow}>
                    <View style={styles.valueHalf}>
                      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                        {editingQuestion.is_bonus
                          ? t('exam_editor.bonus_bucks_value', { currency: currencyName })
                          : t('exam_editor.currency_value', { currency: currencyName })}
                      </Text>
                      <TextInput
                        style={[
                          styles.valueInput,
                          {
                            backgroundColor: colors.background,
                            color: editingQuestion.is_bonus ? '#F59E0B' : visual.accent,
                            borderColor: editingQuestion.is_bonus ? '#F59E0B' : colors.border,
                          },
                        ]}
                        value={
                          editingQuestion.is_bonus
                            ? String(editingQuestion.bonus_bucks_value || 5)
                            : editingQuestion.bucks_value == null ? '' : String(editingQuestion.bucks_value)
                        }
                        onChangeText={(v) => {
                          if (editingQuestion.is_bonus) {
                            setEditingQuestion({ ...editingQuestion, bonus_bucks_value: parseInt(v) || 0 });
                          } else {
                            const trimmed = v.trim();
                            if (trimmed === '') {
                              setEditingQuestion({ ...editingQuestion, bucks_value: null });
                            } else {
                              const n = parseInt(trimmed);
                              setEditingQuestion({ ...editingQuestion, bucks_value: Number.isNaN(n) ? null : n });
                            }
                          }
                        }}
                        keyboardType="numeric"
                        placeholder={
                          editingQuestion.is_bonus
                            ? '5'
                            : defaultBucksValue != null
                              ? `$${defaultBucksValue} · ${t('exam_editor.quiz_default')}`
                              : t('exam_editor.default_ph')
                        }
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                    <View style={styles.valueHalf}>
                      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('exam_editor.photo_optional')}</Text>
                      {editingQuestion.question_image_url ? (
                        <View style={styles.photoMiniRow}>
                          <StorageImage source={{ uri: editingQuestion.question_image_url }} style={styles.photoMini} resizeMode="cover" />
                          <TouchableOpacity onPress={handleRemovePhotoFromEditingQuestion} style={styles.photoMiniRemove}>
                            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.photoBtn, { backgroundColor: visual.accent + '14', borderColor: visual.accent + '66' }]}
                          onPress={handleAttachPhotoToEditingQuestion}
                          disabled={uploadingImage}
                        >
                          <IconSymbol ios_icon_name="photo" android_material_icon_name="photo" size={14} color={visual.accent} />
                          <Text style={[styles.photoBtnText, { color: visual.accent }]}>
                            {uploadingImage ? t('exam_editor.uploading') : t('exam_editor.add_photo')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

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
                              editingQuestion.correct_option === letter
                                ? { backgroundColor: '#10B981' }
                                : { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
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

                  <ShineButton
                    label={t('exam_editor.save_changes')}
                    gradient={visual.gradient}
                    onPress={handleSaveEdit}
                    style={styles.modalSave}
                  />
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Regenerate sheet (MOD·REGEN) ── */}
      <GlassActionSheet
        visible={!!regenQuestion}
        onClose={() => setRegenQuestion(null)}
        title={t('exam_editor.regen_title', { n: regenQuestion?.question_order ?? '' })}
        subtitle={regenQuestion ? getSourceLabel(regenQuestion) : undefined}
        actions={
          regenQuestion
            ? [
                ...(sourceForQuestion(regenQuestion)
                  ? [{
                      key: 'same',
                      label: t('exam_editor.regen_same'),
                      iosIcon: 'arrow.clockwise',
                      androidIcon: 'refresh',
                      onPress: () => {
                        const q = regenQuestion;
                        const src = q ? sourceForQuestion(q) : null;
                        if (q && src) handleRefreshQuestion(q, { source: src });
                      },
                    }]
                  : []),
                {
                  key: 'pick',
                  label: t('exam_editor.regen_pick'),
                  iosIcon: 'square.grid.2x2',
                  androidIcon: 'grid-view',
                  onPress: () => {
                    const q = regenQuestion;
                    if (q) {
                      setCatPickerMode('regen');
                      setCategoryPickerForQuestion(q);
                    }
                  },
                },
                {
                  key: 'surprise',
                  label: t('exam_editor.regen_surprise'),
                  iosIcon: 'wand.and.stars',
                  androidIcon: 'auto-awesome',
                  onPress: () => {
                    const q = regenQuestion;
                    if (q) handleRefreshQuestion(q);
                  },
                },
              ]
            : []
        }
      />

      {/* ── Category Picker (assign or regen) ── */}
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
              {catPickerMode === 'regen'
                ? t('exam_editor.regen_pick')
                : t('exam_editor.question_category')}
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
                        isCurrent && { backgroundColor: visual.accent + '15' },
                      ]}
                      onPress={() => {
                        if (!q) return;
                        if (catPickerMode === 'regen') {
                          setCategoryPickerForQuestion(null);
                          handleRefreshQuestion(q, { source: opt.source, clearLabel: true });
                        } else {
                          // If selection matches the derived label, clear the override.
                          const newLabel = q.source_table === opt.sourceTable ? null : opt.label;
                          handleUpdateCategoryLabel(q, newLabel);
                        }
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                        {t(opt.labelKey)}
                      </Text>
                      {isCurrent && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={visual.accent} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                {catPickerMode === 'assign' && (
                  <TouchableOpacity
                    style={[styles.categoryRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      const q = categoryPickerForQuestion;
                      setCustomCategoryText(q?.category_label || '');
                      setShowCustomCategoryInput(true);
                    }}
                  >
                    <Text style={{ color: visual.accent, fontSize: 15, fontWeight: '600' }}>
                      {t('common.custom_option')}
                    </Text>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={visual.accent} />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                  {t('exam_editor.custom_category')}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={customCategoryText}
                  onChangeText={setCustomCategoryText}
                  placeholder={t('exam_editor.custom_category_ph')}
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.modalPlainBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => {
                      setShowCustomCategoryInput(false);
                      setCustomCategoryText('');
                    }}
                  >
                    <Text style={[styles.modalPlainText, { color: colors.text }]}>{t('common.back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPlainBtn, { backgroundColor: visual.accent }]}
                    onPress={() => {
                      const q = categoryPickerForQuestion;
                      if (!q) return;
                      const trimmed = customCategoryText.trim();
                      handleUpdateCategoryLabel(q, trimmed || null);
                    }}
                  >
                    <Text style={[styles.modalPlainText, { color: '#FFF' }]}>{t('common.save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Time limit sheet ── */}
      <GlassSheet
        visible={showTimeSheet}
        onClose={() => setShowTimeSheet(false)}
        title={t('exam_editor.time_limit')}
      >
        <View style={styles.presetWrap}>
          {TIME_PRESETS.map(secs => {
            const on = timeLimit === secs;
            return (
              <TouchableOpacity
                key={secs}
                style={[
                  styles.preset,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  on && { backgroundColor: visual.accent, borderColor: visual.accent },
                ]}
                onPress={() => {
                  setShowTimeSheet(false);
                  handleUpdateTimeLimit(secs);
                }}
              >
                <Text style={[styles.presetText, { color: on ? '#FFFFFF' : colors.text }]}>
                  {secs === 0 ? '∞' : formatTime(secs)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassSheet>

      {/* ── Default value sheet ── */}
      <GlassSheet
        visible={showValueSheet}
        onClose={() => setShowValueSheet(false)}
        title={t('exam_editor.value_sheet_title', { currency: currencyName })}
      >
        <Text style={[styles.valueSheetHint, { color: colors.textSecondary }]}>
          {t('exam_editor.value_sheet_hint')}
        </Text>
        <View style={styles.valueSheetRow}>
          <Text style={[styles.valueSheetDollar, { color: visual.accent }]}>$</Text>
          <TextInput
            style={[styles.valueSheetInput, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: visual.accent }]}
            value={valueSheetText}
            onChangeText={(v) => setValueSheetText(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="1"
            placeholderTextColor={colors.textSecondary}
            autoFocus
          />
          {[0, 1, 2, 5].map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.preset, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={() => setValueSheetText(String(v))}
            >
              <Text style={[styles.presetText, { color: colors.text }]}>${v}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ShineButton
          label={t('common.save')}
          gradient={visual.gradient}
          onPress={handleSaveDefaultValue}
          style={{ marginTop: 14 }}
        />
      </GlassSheet>

      {/* ── ⓘ How generation works ── */}
      <GlassSheet
        visible={showInfoSheet}
        onClose={() => setShowInfoSheet(false)}
        title={t('exam_editor.info_title')}
      >
        {([
          ['list.bullet', 'format-list-bulleted', 'info_questions'],
          ['square.grid.2x2', 'grid-view', 'info_sources'],
          ['photo', 'photo', 'info_photos'],
          ['star', 'star-border', 'info_difficulty'],
          ['dollarsign.circle', 'attach-money', 'info_value'],
          ['timer', 'timer', 'info_time'],
        ] as const).map(([ios, android, key]) => (
          <View key={key} style={[styles.infoRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name={ios as any} android_material_icon_name={android as any} size={15} color={visual.accent} />
            <Text style={[styles.infoText, { color: colors.text }]}>{t(`exam_editor.${key}`)}</Text>
          </View>
        ))}
        <ShineButton
          label={t('exam_editor.got_it')}
          gradient={visual.gradient}
          onPress={() => setShowInfoSheet(false)}
          style={{ marginTop: 10 }}
        />
      </GlassSheet>

      {/* iOS Close-At Date Picker */}
      {Platform.OS === 'ios' && showCloseDatePicker && (
        <Modal visible transparent animationType="fade">
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerContainer, { backgroundColor: colors.card }]}>
              <View style={styles.datePickerHeader}>
                {closeAt && (
                  <TouchableOpacity onPress={() => { setShowCloseDatePicker(false); handleUpdateCloseAt(null); }}>
                    <Text style={[styles.datePickerDone, { color: colors.textSecondary }]}>{t('common.clear')}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => { setShowCloseDatePicker(false); setShowCloseTimePicker(true); }}>
                  <Text style={[styles.datePickerDone, { color: visual.accent }]}>{t('exam_editor.picker_next_time')}</Text>
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
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setShowCloseTimePicker(false)}>
                  <Text style={[styles.datePickerDone, { color: visual.accent }]}>{t('exam_editor.picker_done')}</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 },
  pausedRunway: { paddingBottom: 210 },
  addRowInFold: { marginTop: 4, marginBottom: 2, paddingHorizontal: 2 },
  pinnedConsole: { paddingHorizontal: 16, paddingBottom: 10 },
  infoChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dashBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 11,
  },
  dashText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  quietBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 10,
  },
  quietText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 88,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },

  // Tracker
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    padding: 11,
    marginBottom: 7,
    marginTop: 3,
  },
  tav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tavImage: { width: 34, height: 34, borderRadius: 17 },
  tavText: { fontFamily: fonts.body.semibold, fontSize: 14 },
  tbd: { flex: 1, minWidth: 0 },
  tnm: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  tjb: { fontFamily: fonts.body.regular, fontSize: 10, marginTop: 1 },
  tsc: { alignItems: 'flex-end' },
  tscScore: { fontFamily: fonts.mono.semibold, fontSize: 12.5, color: '#10B981' },
  tscBucks: { fontFamily: fonts.mono.semibold, fontSize: 9.5, color: '#10B981', opacity: 0.85 },
  tchips: { gap: 4, marginLeft: 2 },
  tchip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tchipText: { fontFamily: fonts.body.semibold, fontSize: 9.5 },
  notTaken: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(239,68,68,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.32)',
  },
  notTakenText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.6, color: '#EF4444' },
  emptyTracker: { textAlign: 'center', fontFamily: fonts.body.regular, fontSize: 12.5, paddingVertical: 16 },
  lockedNote: { fontFamily: fonts.body.regular, fontSize: 10.5, fontStyle: 'italic', paddingHorizontal: 2 },
  ringLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { maxHeight: '88%' },
  modalContent: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 40 },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontFamily: fonts.display.semibold, fontSize: 18 },
  modalScroll: { maxHeight: 520 },
  formLabel: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  valuePhotoRow: { flexDirection: 'row', gap: 10 },
  valueHalf: { flex: 1 },
  valueInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.mono.semibold,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
  },
  photoBtnText: { fontFamily: fonts.body.semibold, fontSize: 12 },
  photoMiniRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoMini: { width: 64, height: 40, borderRadius: 8, backgroundColor: '#00000010' },
  photoMiniRemove: { padding: 4 },
  oneShotNote: { fontFamily: fonts.body.regular, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
  optionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  correctToggle: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  correctToggleText: { fontSize: 11, fontWeight: '700' },
  modalSave: { marginTop: 16, marginBottom: 20 },
  modalPlainBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalPlainText: { fontFamily: fonts.body.semibold, fontSize: 15 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Sheets
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  preset: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  presetText: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  valueSheetHint: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  valueSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  valueSheetDollar: { fontFamily: fonts.mono.semibold, fontSize: 20 },
  valueSheetInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: fonts.mono.semibold,
    fontSize: 17,
    minWidth: 72,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 6,
  },
  infoText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17 },

  // Close-at pickers
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePickerContainer: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000020',
  },
  datePickerDone: { fontSize: 16, fontWeight: '600' },
});
