/**
 * Picture This! Gameplay
 * Loads category pool, generates questions on the fly, runs Lives or Timed
 * mode, writes score on completion, shows end-of-game review.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  Animated as RNAnimated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import { notifyLeaderboardPassed } from '@/utils/notificationHelpers';
import { useOrganization } from '@/contexts/OrganizationContext';
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

const LIVES_QUESTION_CAP = 40;
const TIMED_METER_TARGET = 50;
const COMPLETION_BONUS = 500;
const PERFECT_RUN_BONUS = 1000;
const STREAK_BONUS_PER_TIER = 25;

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
  const [scoreSaved, setScoreSaved] = useState(false);
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const meterAnim = useRef(new RNAnimated.Value(0)).current;

  const totalScore = score + bonusPoints + completionBonus + perfectBonus;
  const meterTarget = playMode === 'lives' ? LIVES_QUESTION_CAP : TIMED_METER_TARGET;
  const meterMilestones = useMemo(() => {
    const arr: number[] = [];
    for (let i = 5; i <= meterTarget; i += 5) arr.push(i);
    return arr;
  }, [meterTarget]);

  // Animate meter fill
  useEffect(() => {
    const pct = Math.min(1, questionsCorrect / meterTarget);
    RNAnimated.timing(meterAnim, {
      toValue: pct,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [questionsCorrect, meterTarget, meterAnim]);

  // ─── Load pool ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPoolError(null);
      try {
        if (category === 'menu_prices') {
          const { libationNames } = await resolvePriceCategoryNames(organizationId ?? '', organization.games_use_sample_data);
          if (!cancelled) libationNamesRef.current = libationNames;
        }
        const data = await loadPool(category, organizationId ?? '', organization.games_use_sample_data);
        if (cancelled) return;
        if (data.length < 4) {
          setPoolError('Not enough menu items in this category to play. Try a different category.');
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
          setPoolError('Could not load menu items. Check your connection.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

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

  // ─── Milestone toast ────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setMilestoneToast(msg);
    toastAnim.setValue(0);
    RNAnimated.sequence([
      RNAnimated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 7 }),
      RNAnimated.delay(1800),
      RNAnimated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setMilestoneToast(null);
    });
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
      showToast(parts.join(' • '));
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
  // Sync ref to latest finishGame on every render so the timer can call current logic.
  // (Defined here so it captures the ref above; assignment runs each render below.)
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
      const finalTotalScore = score + bonusPoints + extraCompletion + extraPerfect;
      const finalCorrect = questionsCorrect;
      const elapsed = playMode === 'timed' ? TIMED_SECONDS - timeRemaining : undefined;

      await (supabase.from('picture_this_scores') as any).insert({
        user_id: user.id,
        organization_id: organizationId,
        category,
        difficulty,
        play_mode: playMode,
        score: finalTotalScore,
        questions_correct: finalCorrect,
        questions_total: history.length,
        bonus_points: bonusPoints + extraCompletion + extraPerfect,
        time_seconds: elapsed,
        lives_remaining: playMode === 'lives' ? lives : 0,
        completed: true,
      });
      setScoreSaved(true);

      if (finalTotalScore > 0) {
        notifyLeaderboardPassed(
          user.id,
          finalTotalScore,
          `${user.name} passed you on the leaderboard!`,
          'A new Picture This! score just bumped them above you.',
          organizationId,
        );
      }
    } catch (err) {
      console.error('[PictureThis] save score error:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, category, difficulty, playMode, score, bonusPoints, currentStreak, questionsCorrect, timeRemaining, lives, history.length]);

  // Keep ref in sync with the latest finishGame on every render
  finishGameRef.current = finishGame;

  // ─── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('picture_this:loading_items')}</Text>
      </View>
    );
  }

  if (poolError) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.errorEmoji}>📷</Text>
        <Text style={[styles.errorTitle, { color: colors.text }]}>{t('picture_this:cant_start')}</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{poolError}</Text>
        <TouchableOpacity
          style={[styles.errorBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.back()}
        >
          <Text style={styles.errorBtnText}>{t('picture_this:back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentQuestion) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const accuracy = history.length > 0
    ? Math.round((history.filter(h => h.wrongAttempts.length === 0).length / history.length) * 100)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t(CATEGORY_LABEL_KEY[category])}
        </Text>
        <View style={[styles.modeBadge, { backgroundColor: playMode === 'timed' ? '#F5A62330' : colors.primary + '20' }]}>
          <Text style={{ fontSize: 16, color: playMode === 'timed' ? '#F5A623' : colors.primary }}>
            {playMode === 'timed' ? '⏱' : '❤️'}
          </Text>
        </View>
      </View>

      {/* HUD */}
      <View style={[styles.hud, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {playMode === 'lives' ? (
          <View style={styles.hudCell}>
            <Text style={styles.hudLabel}>{t('picture_this:hud_lives')}</Text>
            <Text style={[styles.hudValue, { color: lives <= 1 ? '#EF4444' : colors.text }]}>
              {'❤️'.repeat(lives)}{'🖤'.repeat(Math.max(0, startingLives - lives))}
            </Text>
          </View>
        ) : (
          <View style={styles.hudCell}>
            <Text style={styles.hudLabel}>{t('picture_this:hud_time')}</Text>
            <Text style={[styles.hudValue, { color: timeRemaining <= 15 ? '#EF4444' : colors.text }]}>
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </Text>
          </View>
        )}
        <View style={styles.hudCell}>
          <Text style={styles.hudLabel}>{t('picture_this:hud_score')}</Text>
          <Text style={[styles.hudValue, { color: colors.primary }]}>{totalScore.toLocaleString()}</Text>
        </View>
        <View style={styles.hudCell}>
          <Text style={styles.hudLabel}>{t('picture_this:hud_correct')}</Text>
          <Text style={[styles.hudValue, { color: colors.text }]}>
            {playMode === 'lives' ? `${questionsCorrect} / ${LIVES_QUESTION_CAP}` : questionsCorrect}
          </Text>
        </View>
      </View>

      {/* Milestone meter */}
      <View style={[styles.meterWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {currentStreak >= 5 && (
          <Text style={styles.streakBadge}>{t('picture_this:streak_badge', { count: currentStreak })}</Text>
        )}
        <View style={[styles.meterTrack, { backgroundColor: colors.border + '60' }]}>
          <RNAnimated.View
            style={[
              styles.meterFill,
              {
                backgroundColor: colors.primary,
                width: meterAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
          {meterMilestones.map(m => {
            const passed = questionsCorrect >= m;
            const isLifeTier = playMode === 'lives' && m % 10 === 0;
            const left = `${(m / meterTarget) * 100}%`;
            return (
              <View key={m} style={[styles.meterTickWrap, { left: left as any }]} pointerEvents="none">
                {isLifeTier ? (
                  <Text style={[styles.meterTickHeart, { opacity: passed ? 1 : 0.45 }]}>❤️</Text>
                ) : (
                  <View style={[
                    styles.meterTickDot,
                    { backgroundColor: passed ? '#fff' : colors.textSecondary },
                  ]} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.playArea}>
        {/* Item name (hidden for Wine Medium) */}
        {!currentQuestion.hideItemName && (
          <Text style={[styles.itemNameLabel, { color: colors.text }]} numberOfLines={2}>
            {currentQuestion.itemName}
          </Text>
        )}

        {/* Image */}
        <View style={[styles.imageBox, { backgroundColor: colors.card }]}>
          {!imgLoaded && (
            <View style={styles.imgLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          <Image
            source={{ uri: currentQuestion.imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />
        </View>

        <Text style={[styles.prompt, { color: colors.text }]}>
          {currentQuestion.promptKey
            ? t(currentQuestion.promptKey, currentQuestion.promptParams || {})
            : currentQuestion.prompt}
        </Text>

        {/* Choices */}
        <View style={styles.choices}>
          {currentQuestion.choices.map((choice, idx) => {
            const isWrong = currentWrongs.includes(idx);
            const isRevealed = revealedCorrect && choice.isCorrect;
            const dim = revealedCorrect && !choice.isCorrect;
            const bg = isRevealed ? '#10B98125' : isWrong ? '#EF444415' : colors.card;
            const border = isRevealed ? '#10B981' : isWrong ? '#EF4444' : colors.border;
            const textColor = isRevealed ? '#10B981' : isWrong ? '#EF4444' : colors.text;
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.choiceBtn,
                  { backgroundColor: bg, borderColor: border, opacity: dim ? 0.55 : 1 },
                ]}
                onPress={() => handleAnswer(idx)}
                disabled={isWrong || revealedCorrect}
                activeOpacity={0.75}
              >
                <Text style={[styles.choiceText, { color: textColor }]}>
                  {choice.text}
                </Text>
                {isRevealed && (
                  <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={20} color="#10B981" />
                )}
                {isWrong && (
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color="#EF4444" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Milestone toast */}
      {milestoneToast && (
        <RNAnimated.View
          style={[
            styles.toast,
            { backgroundColor: '#F59E0B', opacity: toastAnim, transform: [{ scale: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
          ]}
        >
          <Text style={styles.toastText}>{milestoneToast}</Text>
        </RNAnimated.View>
      )}

      {/* Results modal — fixed header + score, scrollable review, sticky bottom buttons */}
      <Modal visible={showResults} transparent animationType="fade" onRequestClose={() => router.back()}>
        <View style={styles.modalOverlay}>
          <View style={[styles.resultsCard, { backgroundColor: colors.card }]}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultEmoji}>
                {endReason === 'completed'
                  ? (perfectBonus > 0 ? '🏆' : '🎉')
                  : (questionsCorrect > 0 ? '🎉' : '💔')}
              </Text>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {endReason === 'completed'
                  ? (perfectBonus > 0 ? t('picture_this:results_perfect') : t('picture_this:results_complete'))
                  : (playMode === 'timed' ? t('picture_this:results_times_up') : t('picture_this:results_game_over'))}
              </Text>

              <View style={[styles.scoreBox, { backgroundColor: colors.background }]}>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:questions_correct')}</Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>{questionsCorrect}</Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:accuracy')}</Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>{accuracy}%</Text>
                </View>
                {bestStreak > 0 && (
                  <View style={styles.scoreRow}>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:best_streak')}</Text>
                    <Text style={[styles.scoreValue, { color: colors.text }]}>{bestStreak}</Text>
                  </View>
                )}
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:base_points')}</Text>
                  <Text style={[styles.scoreValue, { color: colors.text }]}>{score.toLocaleString()}</Text>
                </View>
                {bonusPoints > 0 && (
                  <View style={styles.scoreRow}>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:bonus_points')}</Text>
                    <Text style={[styles.scoreValue, { color: '#F59E0B' }]}>+{bonusPoints.toLocaleString()}</Text>
                  </View>
                )}
                {completionBonus > 0 && (
                  <View style={styles.scoreRow}>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:completion_bonus')}</Text>
                    <Text style={[styles.scoreValue, { color: '#F59E0B' }]}>+{completionBonus.toLocaleString()}</Text>
                  </View>
                )}
                {perfectBonus > 0 && (
                  <View style={styles.scoreRow}>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('picture_this:perfect_bonus')}</Text>
                    <Text style={[styles.scoreValue, { color: '#F59E0B' }]}>+{perfectBonus.toLocaleString()}</Text>
                  </View>
                )}
                <View style={[styles.scoreRow, styles.totalRow]}>
                  <Text style={[styles.totalLabel, { color: colors.primary }]}>{t('picture_this:total_score')}</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>{totalScore.toLocaleString()}</Text>
                </View>
              </View>

              {!scoreSaved && user?.id && (
                <View style={styles.savingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.savingText, { color: colors.textSecondary }]}>{t('picture_this:saving_score')}</Text>
                </View>
              )}
            </View>

            {/* Scrollable review */}
            {history.length > 0 ? (
              <ScrollView
                style={styles.reviewScroll}
                contentContainerStyle={styles.reviewScrollContent}
                showsVerticalScrollIndicator
              >
                <Text style={[styles.reviewTitle, { color: colors.text }]}>{t('picture_this:review_title')}</Text>
                {history.map((entry, i) => {
                  const correctIdx = entry.question.correctIndex;
                  const correctText = entry.question.choices[correctIdx].text;
                  const gotItRightFirstTry = entry.wrongAttempts.length === 0;
                  return (
                    <View key={i} style={[styles.reviewItem, { borderBottomColor: colors.border }]}>
                      <Image source={{ uri: entry.question.imageUrl }} style={styles.reviewThumb} />
                      <View style={styles.reviewBody}>
                        <Text style={[styles.reviewName, { color: colors.text }]} numberOfLines={1}>
                          {entry.question.itemName}
                        </Text>
                        <Text style={[styles.reviewPrompt, { color: colors.textSecondary }]} numberOfLines={2}>
                          {entry.question.promptKey
                            ? t(entry.question.promptKey, entry.question.promptParams || {})
                            : entry.question.prompt}
                        </Text>
                        <View style={styles.reviewAnswerRow}>
                          <Text style={styles.reviewCheckmark}>
                            {gotItRightFirstTry ? '✅' : '⚠️'}
                          </Text>
                          <Text style={[styles.reviewAnswer, { color: '#10B981' }]} numberOfLines={2}>
                            {correctText}
                          </Text>
                        </View>
                        {entry.wrongAttempts.length > 0 && (
                          <Text style={[styles.reviewWrong, { color: '#EF4444' }]} numberOfLines={1}>
                            ✗ {entry.wrongAttempts.map(idx => entry.question.choices[idx].text).join(' • ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {/* Sticky bottom buttons */}
            <View style={[styles.actionButtons, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.replace({
                  pathname: '/picture-this-play',
                  params: { category, difficulty, playMode },
                })}
              >
                <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="replay" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>{t('picture_this:play_again')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => router.replace('/picture-this-leaderboard')}
              >
                <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji-events" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>{t('picture_this:view_leaderboard')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => router.replace('/picture-this-game')}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{t('picture_this:back_to_hub')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {endReason === 'completed' && (
            <View style={styles.confettiOverlay} pointerEvents="none">
              <ConfettiCannon
                count={180}
                origin={{ x: -10, y: 0 }}
                fadeOut
                autoStart
                fallSpeed={2800}
                explosionSpeed={400}
              />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorEmoji: { fontSize: 48 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 12 },
  errorBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4, width: 40 },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  modeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hud: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#888', marginBottom: 2 },
  hudValue: { fontSize: 16, fontWeight: '700' },

  meterWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  streakBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    textAlign: 'right',
    marginBottom: 4,
  },
  meterTrack: {
    height: 14,
    borderRadius: 999,
    overflow: 'visible',
    position: 'relative',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
  },
  meterTickWrap: {
    position: 'absolute',
    top: -2,
    width: 18,
    marginLeft: -9,
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
  },
  meterTickDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  meterTickHeart: {
    fontSize: 14,
    lineHeight: 16,
  },

  playArea: { padding: 16, paddingBottom: 40 },
  imageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
    elevation: 4,
  },
  imgLoading: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  image: { width: '100%', height: '100%' },
  prompt: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  choices: { gap: 10 },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    gap: 10,
  },
  choiceText: { fontSize: 15, fontWeight: '600', flex: 1 },

  toast: {
    position: 'absolute',
    top: 140,
    left: 24,
    right: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(0,0,0,0.25)',
    elevation: 6,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  confettiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  resultsCard: {
    width: '100%',
    maxWidth: 460,
    flex: 1,
    maxHeight: '92%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  resultsHeader: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 6,
    alignItems: 'center',
  },
  resultEmoji: { fontSize: 44, marginBottom: 4 },
  resultTitle: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  scoreBox: { width: '100%', borderRadius: 10, padding: 12, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  scoreLabel: { fontSize: 13 },
  scoreValue: { fontSize: 13, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#ddd', marginTop: 4, paddingTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },

  reviewScroll: { flex: 1, width: '100%' },
  reviewScrollContent: { paddingHorizontal: 18, paddingVertical: 8, paddingBottom: 12 },
  reviewTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  reviewItem: {
    flexDirection: 'row',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewThumb: { width: 60, height: 60, borderRadius: 8 },
  reviewBody: { flex: 1, gap: 2 },
  reviewName: { fontSize: 13, fontWeight: '700' },
  reviewPrompt: { fontSize: 11, lineHeight: 14 },
  reviewAnswerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  reviewCheckmark: { fontSize: 12 },
  reviewAnswer: { fontSize: 12, fontWeight: '600', flex: 1 },
  reviewWrong: { fontSize: 11, marginTop: 1 },

  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  savingText: { fontSize: 12 },

  actionButtons: {
    width: '100%',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 10, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },

  // Item name above the image (suppressed for Wine Medium via hideItemName)
  itemNameLabel: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
});
