/**
 * Picture This! Gameplay — the s76 lockdown screen.
 * The photo runs full-bleed under the header; the console lays over its top
 * edge as frosted glass (the photo blurs beneath), the item name + question
 * live in a thin-bordered glass panel on the image, milestone toasts pop down
 * from the console as gold glass pills, and answers sit in a 2×2 grid with
 * the PT-gradient wash (falling back to rows when any option runs long).
 * Results ride the shared GameResults sheet; on this game the board
 * accumulates, so every completed run banks points and the celebration is
 * rank movement (plus full completions).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import { notifyLeaderboardPassed } from '@/utils/notificationHelpers';
import { useOrganization } from '@/contexts/OrganizationContext';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { HeartsRow } from '@/components/game/PlayConsole';
import GameToast from '@/components/game/GameToast';
import GameResults, { ResultsFold } from '@/components/game/GameResults';
import { fetchStanding, BoardStanding } from '@/utils/game/standing';
import {
  PLAY_VISUALS,
  GAME_VISUALS,
  HEART_FULL,
  BONUS_GOLD,
  BONUS_GOLD_SOFT,
} from '@/components/game/gameVisuals';
import {
  PictureThisCategory,
  PictureThisDifficulty,
  PictureThisPlayMode,
  PictureThisQuestion,
  MenuItem,
  loadPool,
  generateQuestion,
  resolvePriceCategoryNames,
  QuestionItemPicker,
  pointsPerCorrect,
  STARTING_LIVES,
  TIMED_SECONDS,
  milestoneBonus,
} from '@/utils/game/pictureThisGenerator';
import { fetchOwnWineVisible } from '@/utils/game/wineVisibility';
import { fonts } from '@/constants/fonts';

const LIVES_QUESTION_CAP = 40;
const TIMED_METER_TARGET = 50;
const COMPLETION_BONUS = 500;
const PERFECT_RUN_BONUS = 1000;
const STREAK_BONUS_PER_TIER = 25;
const GRID_MAX_CHARS = 28;

type EndReason = 'lives' | 'time' | 'exhausted' | 'completed';

interface AnsweredQuestion {
  question: PictureThisQuestion;
  firstSelectedIndex: number; // index of the first answer the player chose
  wrongAttempts: number[]; // indices the player chose wrongly before getting it right
}

const CATEGORY_LABEL_KEY: Record<PictureThisCategory, string> = {
  food: 'picture_this:cat_food',
  libations: 'picture_this:cat_libations',
  wine: 'picture_this:cat_wine',
  menu_prices: 'picture_this:cat_menu_prices',
};

const DIFF_LABEL_KEY: Record<PictureThisDifficulty, string> = {
  easy: 'picture_this:diff_easy',
  medium: 'picture_this:diff_medium',
  hard: 'picture_this:diff_hard',
  only: 'picture_this:diff_expert',
};

export default function PictureThisPlayScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const params = useLocalSearchParams<{ category: string; difficulty: string; playMode: string }>();

  const category = (params.category || 'food') as PictureThisCategory;
  const difficulty = (params.difficulty || 'easy') as PictureThisDifficulty;
  const playMode = (params.playMode || 'lives') as PictureThisPlayMode;

  const startingLives = STARTING_LIVES[difficulty];
  const pointsPer = pointsPerCorrect(category, difficulty, playMode);

  const [pool, setPool] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);

  const pickerRef = useRef<QuestionItemPicker | null>(null);
  // Source org's current Libations name(s) for the price game's classification.
  const libationNamesRef = useRef<string[]>(['Libations']);
  const [currentQuestion, setCurrentQuestion] = useState<PictureThisQuestion | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Game state
  const [lives, setLives] = useState(startingLives);
  const [score, setScore] = useState(0);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [questionsCorrect, setQuestionsCorrect] = useState(0);
  const [history, setHistory] = useState<AnsweredQuestion[]>([]);
  const [currentWrongs, setCurrentWrongs] = useState<number[]>([]);
  const [firstSelectedThisQ, setFirstSelectedThisQ] = useState<number | null>(null);
  const [revealedCorrect, setRevealedCorrect] = useState(false);

  const [timeRemaining, setTimeRemaining] = useState(TIMED_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const [showResults, setShowResults] = useState(false);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [completionBonus, setCompletionBonus] = useState(0);
  const [perfectBonus, setPerfectBonus] = useState(0);
  const [saving, setSaving] = useState(false);
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const [consoleH, setConsoleH] = useState(64);

  // Board standing — the PT board ACCUMULATES, so every run moves it.
  const [rankBefore, setRankBefore] = useState<number | null>(null);
  const [standingAfter, setStandingAfter] = useState<BoardStanding | null>(null);

  const totalScore = score + bonusPoints + completionBonus + perfectBonus;
  const meterTarget = playMode === 'lives' ? LIVES_QUESTION_CAP : TIMED_METER_TARGET;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchStanding(user.id, 'picture_this', category).then((standing) => {
      if (!cancelled && standing) setRankBefore(standing.rank);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, category]);

  // ─── Load pool ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      setPoolError(null);
      try {
        if (category === 'menu_prices') {
          const { libationNames } = await resolvePriceCategoryNames(organizationId ?? '', organization.games_use_sample_data, user.id);
          if (!cancelled) libationNamesRef.current = libationNames;
        }
        // Own-org wine visibility keeps hidden wine lists out of the
        // Menu Prices pool (the wine tile itself is gated on the hub screen).
        const wineVisible = category === 'menu_prices'
          ? await fetchOwnWineVisible(user.id, organization?.menu_category_scope === 'per_menu')
          : true;
        const data = await loadPool(category, organizationId ?? '', organization.games_use_sample_data, user.id, wineVisible);
        if (cancelled) return;
        if (data.length < 4) {
          setPoolError(t('picture_this:not_enough_items'));
          setLoading(false);
          return;
        }
        setPool(data);
        pickerRef.current = new QuestionItemPicker(data);
        // Generate first question
        nextQuestion(data);
      } catch (err) {
        console.error('[PictureThis] pool load error:', err);
        if (!cancelled) {
          setPoolError(t('picture_this:load_failed'));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, user?.id]);

  // Keep finishGame stable across renders via a ref so the timer's setInterval
  // always invokes the latest version (which reads the latest state).
  const finishGameRef = useRef<(reason: EndReason) => void>(() => {});

  // ─── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playMode !== 'timed' || loading || showResults) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          finishGameRef.current('time');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode, loading, showResults]);

  // ─── Question generation ────────────────────────────────────────────────
  const nextQuestion = (poolOverride?: MenuItem[]) => {
    const pickPool = poolOverride ?? pool;
    if (!pickPool || !pickerRef.current) return;
    setCurrentWrongs([]);
    setFirstSelectedThisQ(null);
    setRevealedCorrect(false);
    setImgLoaded(false);

    let q: PictureThisQuestion | null = null;
    for (let i = 0; i < 30 && !q; i++) {
      const item = pickerRef.current.next();
      if (!item) break;
      q = generateQuestion(item, pickPool, category, difficulty, libationNamesRef.current);
    }

    if (!q) {
      // Couldn't generate — end game gracefully
      finishGame('exhausted');
      return;
    }
    setCurrentQuestion(q);
    if (loading) setLoading(false);
  };

  // ─── Answer handler ─────────────────────────────────────────────────────
  const handleAnswer = (idx: number) => {
    if (!currentQuestion || revealedCorrect) return;

    const isCorrect = idx === currentQuestion.correctIndex;

    if (firstSelectedThisQ === null) {
      setFirstSelectedThisQ(idx);
    }

    if (!isCorrect) {
      setCurrentWrongs(prev => prev.includes(idx) ? prev : [...prev, idx]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Any wrong attempt breaks the streak (in either mode)
      setCurrentStreak(0);

      if (playMode === 'lives') {
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) {
          // Record this question (player ran out of lives mid-question)
          setHistory(prev => [
            ...prev,
            {
              question: currentQuestion,
              firstSelectedIndex: firstSelectedThisQ ?? idx,
              wrongAttempts: currentWrongs.includes(idx) ? currentWrongs : [...currentWrongs, idx],
            },
          ]);
          finishGame('lives');
          return;
        }
      }
      return;
    }

    // Correct
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRevealedCorrect(true);
    const newCorrect = questionsCorrect + 1;
    setScore(prev => prev + pointsPer);
    setQuestionsCorrect(newCorrect);

    // Streak: only counts if no wrong attempts on this question
    const cleanQuestion = currentWrongs.length === 0;
    const newStreak = cleanQuestion ? currentStreak + 1 : 0;
    setCurrentStreak(newStreak);
    if (newStreak > bestStreak) setBestStreak(newStreak);

    // Milestone bonus — applies to BOTH modes (life restore gated to lives below)
    const { bonusPoints: milestoneBp, restoreLife } = milestoneBonus(newCorrect);
    let toastBp = 0;
    let lifeAdded = false;
    if (milestoneBp > 0) {
      setBonusPoints(prev => prev + milestoneBp);
      toastBp += milestoneBp;
    }
    if (playMode === 'lives' && restoreLife && lives < startingLives) {
      setLives(prev => Math.min(startingLives, prev + 1));
      lifeAdded = true;
    }

    // Streak bonus — every 5 in a row → +25
    let streakBp = 0;
    if (newStreak > 0 && newStreak % 5 === 0) {
      streakBp = STREAK_BONUS_PER_TIER;
      setBonusPoints(prev => prev + streakBp);
    }

    // Toast — merge milestone + streak + life messages
    if (toastBp > 0 || streakBp > 0) {
      const parts: string[] = [];
      if (toastBp > 0) parts.push(t('picture_this:toast_correct', { count: newCorrect, points: toastBp }));
      if (streakBp > 0) parts.push(t('picture_this:toast_streak', { count: newStreak, points: streakBp }));
      if (lifeAdded) parts.push(t('picture_this:toast_life'));
      setMilestoneToast(parts.join(' · '));
    }

    // Record + advance
    setHistory(prev => [
      ...prev,
      {
        question: currentQuestion,
        firstSelectedIndex: firstSelectedThisQ ?? idx,
        wrongAttempts: currentWrongs,
      },
    ]);

    // Lives-mode 40-question hard cap → completion
    if (playMode === 'lives' && newCorrect >= LIVES_QUESTION_CAP) {
      setTimeout(() => {
        finishGame('completed');
      }, 800);
      return;
    }

    setTimeout(() => {
      nextQuestion();
    }, 800);
  };

  // ─── Finish + save ──────────────────────────────────────────────────────
  const finishGame = useCallback(async (reason: EndReason) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setEndReason(reason);

    // Completion bonuses (Lives mode, reached 40 correct)
    let extraCompletion = 0;
    let extraPerfect = 0;
    if (reason === 'completed') {
      extraCompletion = COMPLETION_BONUS;
      setCompletionBonus(COMPLETION_BONUS);
      // Perfect run = 40 correct with no wrong attempt ever (current streak still 40)
      if (currentStreak >= LIVES_QUESTION_CAP) {
        extraPerfect = PERFECT_RUN_BONUS;
        setPerfectBonus(PERFECT_RUN_BONUS);
      }
    }

    setShowResults(true);

    if (!user?.id) return;

    try {
      setSaving(true);
      const finalTotalScore = score + bonusPoints + extraCompletion + extraPerfect;
      const finalCorrect = questionsCorrect;
      const elapsed = playMode === 'timed' ? TIMED_SECONDS - timeRemaining : undefined;

      // Self-submit RPC: the player is the actor, org derived server-side.
      // p_completed is deliberately TRUE for every finished run — the PT board
      // accumulates, and timed runs always end by the clock.
      await supabase.rpc('submit_picture_this_score', {
        p_actor_id: user.id,
        p_category: category,
        p_difficulty: difficulty,
        p_play_mode: playMode,
        p_score: finalTotalScore,
        p_questions_correct: finalCorrect,
        p_questions_total: history.length,
        p_bonus_points: bonusPoints + extraCompletion + extraPerfect,
        p_time_seconds: elapsed,
        p_lives_remaining: playMode === 'lives' ? lives : 0,
        p_completed: true,
      });

      if (finalTotalScore > 0) {
        notifyLeaderboardPassed(user.id, finalTotalScore, user.name, organizationId ?? undefined);
      }
      const after = await fetchStanding(user.id, 'picture_this', category);
      setStandingAfter(after);
    } catch (err) {
      console.error('[PictureThis] save score error:', err);
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, category, difficulty, playMode, score, bonusPoints, currentStreak, questionsCorrect, timeRemaining, lives, history.length]);

  // Keep ref in sync with the latest finishGame on every render
  finishGameRef.current = finishGame;

  // ─── Render ─────────────────────────────────────────────────────────────
  const categoryLabel = t(CATEGORY_LABEL_KEY[category]);
  const stripEmoji = (s: string) => s.replace(/^[^A-Za-zÀ-ÿ¿¡]+/, '');
  const diffLabel = stripEmoji(t(DIFF_LABEL_KEY[difficulty]));

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('picture_this:hub_title')} eyebrow={categoryLabel} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GAME_VISUALS.picture_this.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('picture_this:loading_items')}</Text>
        </View>
      </View>
    );
  }

  if (poolError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('picture_this:hub_title')} eyebrow={categoryLabel} />
        <View style={styles.center}>
          <IconSymbol ios_icon_name="photo" android_material_icon_name="photo-camera" size={44} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>{t('picture_this:cant_start')}</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{poolError}</Text>
          <TouchableOpacity
            style={[styles.errorBtn, { backgroundColor: GAME_VISUALS.picture_this.accent }]}
            onPress={() => router.back()}
          >
            <Text style={styles.errorBtnText}>{t('picture_this:back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!currentQuestion) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={GAME_VISUALS.picture_this.accent} />
      </View>
    );
  }

  const accuracy = history.length > 0
    ? Math.round((history.filter(h => h.wrongAttempts.length === 0).length / history.length) * 100)
    : 0;

  const useGrid = currentQuestion.choices.every((c) => c.text.length <= GRID_MAX_CHARS);
  const promptText = currentQuestion.promptKey
    ? t(currentQuestion.promptKey, currentQuestion.promptParams || {})
    : currentQuestion.prompt;

  const chase = standingAfter?.isTop
    ? ('top' as const)
    : standingAfter?.rank != null && standingAfter.gapToAbove != null
      ? { gapPts: standingAfter.gapToAbove, toRank: standingAfter.rank - 1 }
      : null;
  const rankImproved =
    rankBefore != null && standingAfter?.rank != null && standingAfter.rank < rankBefore;
  const celebrate = endReason === 'completed' || rankImproved;

  const resultTitle =
    endReason === 'completed'
      ? perfectBonus > 0
        ? t('picture_this:results_perfect')
        : t('picture_this:results_complete')
      : rankImproved
        ? t('game_results:moved_up')
        : playMode === 'timed'
          ? t('picture_this:results_times_up')
          : t('picture_this:results_game_over')

  const wrongOnes = history.filter((h) => h.wrongAttempts.length > 0);
  const cleanOnes = history.filter((h) => h.wrongAttempts.length === 0);

  const renderChoice = (choice: { text: string; isCorrect: boolean }, idx: number) => {
    const isWrong = currentWrongs.includes(idx);
    const isRevealed = revealedCorrect && choice.isCorrect;
    const dim = revealedCorrect && !choice.isCorrect;
    const stateStyle = isRevealed
      ? styles.choiceRight
      : isWrong
        ? styles.choiceWrong
        : null;
    const letterColor = isRevealed ? '#10B981' : isWrong ? '#EF4444' : GAME_VISUALS.picture_this.accent;
    return (
      <TouchableOpacity
        key={idx}
        style={[
          useGrid ? styles.choiceTile : styles.choiceRow,
          { backgroundColor: colors.surface, borderColor: colors.glassBorder },
          stateStyle,
          dim && { opacity: 0.55 },
        ]}
        onPress={() => handleAnswer(idx)}
        disabled={isWrong || revealedCorrect}
        activeOpacity={0.75}
      >
        {/* The PT-gradient wash — under the text, gone once a state color wins. */}
        {!isRevealed && !isWrong && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.choiceWash]} />
        )}
        <View style={[styles.letterChip, { backgroundColor: letterColor + '24' }, useGrid && styles.letterChipTile]}>
          <Text style={[styles.letterChipText, { color: letterColor }]}>
            {String.fromCharCode(65 + idx)}
          </Text>
        </View>
        <Text
          style={[
            useGrid ? styles.choiceTileText : styles.choiceRowText,
            { color: isRevealed ? '#10B981' : isWrong ? '#EF4444' : colors.text },
          ]}
          numberOfLines={useGrid ? 2 : 3}
        >
          {choice.text}
        </Text>
        {!useGrid && isRevealed && (
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={19} color="#10B981" />
        )}
        {!useGrid && isWrong && (
          <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={19} color="#EF4444" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('picture_this:hub_title')}
        eyebrow={`${categoryLabel} · ${diffLabel}`}
        onBack={() => router.back()}
        right={
          <View style={[styles.modeChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol
              ios_icon_name={playMode === 'timed' ? 'clock.fill' : 'heart.fill'}
              android_material_icon_name={playMode === 'timed' ? 'schedule' : 'favorite'}
              size={16}
              color={playMode === 'timed' ? PLAY_VISUALS.picture_this.console[2] : HEART_FULL}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The hero: full-bleed photo, frosted console over its top ───── */}
        <View style={styles.hero}>
          {!imgLoaded && (
            <View style={styles.imgLoading}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
          <StorageImage
            source={{ uri: currentQuestion.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />

          {/* Frosted console — the photo blurs beneath it. */}
          <View style={styles.overconsole} onLayout={(e) => setConsoleH(e.nativeEvent.layout.height)}>
            <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.consoleTintOverlay]} />
            <View style={styles.consoleRow}>
              {playMode === 'lives' ? (
                <HeartsRow lives={lives} max={startingLives} size={14} />
              ) : (
                <Text style={[styles.consoleTimer, timeRemaining <= 15 && { color: BONUS_GOLD_SOFT }]}>
                  {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </Text>
              )}
              <View style={styles.consoleStat}>
                <IconSymbol ios_icon_name="star" android_material_icon_name="star" size={12} color="rgba(255,255,255,0.85)" />
                <Text style={styles.consoleStatText}>{totalScore.toLocaleString()}</Text>
              </View>
              <Text style={styles.consoleStatText}>
                {questionsCorrect}
                {playMode === 'lives' && <Text style={styles.consoleSuffix}>/{LIVES_QUESTION_CAP}</Text>}
              </Text>
              {currentStreak >= 3 && (
                <View style={styles.streakPill}>
                  <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={10} color={BONUS_GOLD_SOFT} />
                  <Text style={styles.streakText}>×{currentStreak}</Text>
                </View>
              )}
            </View>
            <MilestoneMeter progress={questionsCorrect} target={meterTarget} showHearts={playMode === 'lives'} />
          </View>

          {/* Milestone toast — pops down from the console, over the photo. */}
          <View style={[styles.toastAnchor, { top: consoleH + 8 }]}>
            <GameToast message={milestoneToast} onDone={() => setMilestoneToast(null)} />
          </View>

          {/* Name + question — thin-bordered glass panel on the image. */}
          <View style={styles.namePanel}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.panelTintOverlay]} />
            {!currentQuestion.hideItemName && (
              <Text style={styles.nameText} numberOfLines={2}>
                {currentQuestion.itemName}
              </Text>
            )}
            <Text style={styles.questionText} numberOfLines={2}>
              {promptText}
            </Text>
          </View>
        </View>

        {/* ── Answers ────────────────────────────────────────────────────── */}
        <View style={useGrid ? styles.choiceGrid : styles.choiceList}>
          {currentQuestion.choices.map((choice, idx) => renderChoice(choice, idx))}
        </View>
      </ScrollView>

      <GameResults
        visible={showResults}
        game="picture_this"
        title={resultTitle}
        score={totalScore}
        meta={`${categoryLabel} · ${diffLabel} · ${playMode === 'timed' ? t('picture_this:mode_timed') : t('picture_this:mode_lives')}`}
        deltaChip={t('game_results:banked', { points: totalScore.toLocaleString() })}
        rankBefore={rankBefore}
        rankAfter={standingAfter?.rank ?? null}
        chase={chase}
        boardLabel={t('game_results:board_label', { name: categoryLabel })}
        celebrate={celebrate}
        saving={saving}
        statRows={[
          { label: t('picture_this:questions_correct'), value: String(questionsCorrect) },
          { label: t('picture_this:accuracy'), value: `${accuracy}%` },
          ...(bestStreak > 0 ? [{ label: t('picture_this:best_streak'), value: String(bestStreak) }] : []),
          { label: t('picture_this:base_points'), value: score.toLocaleString() },
          ...(bonusPoints > 0
            ? [{ label: t('picture_this:bonus_points'), value: `+${bonusPoints.toLocaleString()}`, color: BONUS_GOLD }]
            : []),
          ...(completionBonus > 0
            ? [{ label: t('picture_this:completion_bonus'), value: `+${completionBonus.toLocaleString()}`, color: BONUS_GOLD }]
            : []),
          ...(perfectBonus > 0
            ? [{ label: t('picture_this:perfect_bonus'), value: `+${perfectBonus.toLocaleString()}`, color: BONUS_GOLD }]
            : []),
        ]}
        playAgainLabel={t('picture_this:play_again')}
        onPlayAgain={() => router.replace({ pathname: '/picture-this-play', params: { category, difficulty, playMode } })}
        viewBoardLabel={t('game_results:view_board')}
        onViewBoard={() => router.replace('/master-leaderboard?tab=picture_this')}
        backLabel={t('game_results:back_to_game', { name: t('picture_this:hub_title') })}
        onBack={() => router.replace('/picture-this-game')}
        onGameHub={() => router.replace('/game-hub')}
      >
        {wrongOnes.length > 0 && (
          <ResultsFold
            iconIos="xmark"
            iconAndroid="close"
            iconColor="#EF4444"
            title={t('game_results:review_these')}
            count={wrongOnes.length}
            initiallyOpen
          >
            {wrongOnes.map((entry, i) => (
              <QuestionReviewRow key={i} entry={entry} t={t} />
            ))}
          </ResultsFold>
        )}
        {cleanOnes.length > 0 && (
          <ResultsFold
            iconIos="checkmark"
            iconAndroid="check"
            iconColor="#10B981"
            title={t('game_results:correct_fold')}
            count={cleanOnes.length}
            initiallyOpen={wrongOnes.length === 0}
          >
            {cleanOnes.map((entry, i) => (
              <QuestionReviewRow key={i} entry={entry} t={t} />
            ))}
          </ResultsFold>
        )}
      </GameResults>
    </View>
  );
}

/** The diamond-node milestone meter (hearts mark life-restore tiers). */
function MilestoneMeter({ progress, target, showHearts }: { progress: number; target: number; showHearts: boolean }) {
  const nodes: number[] = [];
  for (let m = 5; m <= target; m += 5) nodes.push(m);
  const pct = Math.min(1, progress / target);
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${pct * 100}%` }]} />
      {nodes.map((m) => {
        const hit = progress >= m;
        const isLife = showHearts && m % 10 === 0;
        return (
          <View key={m} style={[styles.meterNodeWrap, { left: `${(m / target) * 100}%` }]} pointerEvents="none">
            {isLife ? (
              <View style={[styles.meterLife, hit && { backgroundColor: HEART_FULL }]}>
                <IconSymbol ios_icon_name="heart.fill" android_material_icon_name="favorite" size={7} color="#FFFFFF" />
              </View>
            ) : (
              <View style={[styles.meterDiamond, hit && styles.meterDiamondHit]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function QuestionReviewRow({ entry, t }: { entry: AnsweredQuestion; t: (k: string, o?: any) => string }) {
  const colors = useThemeColors();
  const correctText = entry.question.choices[entry.question.correctIndex].text;
  const clean = entry.wrongAttempts.length === 0;
  return (
    <View style={[styles.reviewItem, { borderTopColor: colors.hairline }]}>
      <StorageImage source={{ uri: entry.question.imageUrl }} style={styles.reviewThumb} />
      <View style={styles.reviewBody}>
        <Text style={[styles.reviewName, { color: colors.text }]} numberOfLines={1}>
          {entry.question.itemName}
        </Text>
        {clean ? (
          <Text style={[styles.reviewAnswer, { color: '#10B981' }]}>{correctText}</Text>
        ) : (
          <>
            {/* The miss list may truncate; the bold-green correct answer gets
                its own fully-wrapping line so it can never be cut off. */}
            <Text style={[styles.reviewAnswer, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('game_results:you_said_wrong', {
                wrong: entry.wrongAttempts.map((idx) => entry.question.choices[idx].text).join(', '),
              })}
            </Text>
            <Text style={[styles.reviewAnswer, styles.reviewCorrect]}>→ {correctText}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorTitle: { fontSize: 18, fontFamily: fonts.display.semibold },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 12 },
  errorBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.body.semibold },
  modeChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 28,
  },

  // ── Hero ──────────────────────────────────────────────────────────────
  hero: {
    aspectRatio: 0.96,
    backgroundColor: '#241A14',
    overflow: 'hidden',
    marginBottom: 12,
  },
  imgLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Fixed-dark chrome over the photo — literals by design (ember rule).
  overconsole: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  consoleTintOverlay: {
    backgroundColor: 'rgba(16,14,40,0.42)',
  },
  consoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  consoleTimer: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  consoleStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  consoleStatText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  consoleSuffix: {
    fontSize: 9.5,
    color: 'rgba(255,255,255,0.6)',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(8,10,14,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,212,138,0.4)',
  },
  streakText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
    color: BONUS_GOLD_SOFT,
  },
  toastAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 5,
    alignItems: 'center',
  },
  namePanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    zIndex: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 13,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  panelTintOverlay: {
    backgroundColor: 'rgba(10,14,22,0.5)',
  },
  nameText: {
    fontFamily: fonts.display.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  questionText: {
    fontSize: 12,
    fontFamily: fonts.body.semibold,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 3,
  },

  // ── Meter ─────────────────────────────────────────────────────────────
  meterTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 9,
    marginHorizontal: 2,
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: '#8B88F0',
  },
  meterNodeWrap: {
    position: 'absolute',
    top: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterDiamond: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ rotate: '45deg' }],
  },
  meterDiamondHit: {
    backgroundColor: '#B9B7FF',
  },
  meterLife: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Answers ───────────────────────────────────────────────────────────
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  choiceList: {
    gap: 8,
    paddingHorizontal: 16,
  },
  choiceTile: {
    flexBasis: '48%',
    flexGrow: 1,
    aspectRatio: 1.5,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    overflow: 'hidden',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 52,
    overflow: 'hidden',
  },
  choiceWash: {
    backgroundColor: 'rgba(91,91,214,0.10)',
  },
  choiceRight: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  choiceWrong: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.07)',
  },
  letterChip: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterChipTile: {
    position: 'absolute',
    top: 7,
    left: 7,
    width: 20,
    height: 20,
    borderRadius: 7,
  },
  letterChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  choiceTileText: {
    fontSize: 13.5,
    fontFamily: fonts.body.semibold,
    textAlign: 'center',
  },
  choiceRowText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: fonts.body.semibold,
  },

  // ── Review rows ───────────────────────────────────────────────────────
  reviewItem: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  reviewThumb: { width: 36, height: 36, borderRadius: 8 },
  reviewBody: { flex: 1, minWidth: 0 },
  reviewName: { fontSize: 12, fontFamily: fonts.body.semibold },
  reviewAnswer: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  reviewCorrect: {
    fontFamily: fonts.body.semibold,
    fontWeight: '700',
    color: '#10B981',
  },
});
