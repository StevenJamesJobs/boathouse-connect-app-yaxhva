/**
 * Word Search Play — the s76 lockdown screen.
 * ScreenHeader + WS console (timer · score · found) over the theme-aware
 * gradient board with capsule highlights, per-dish word trays below, and the
 * shared GameResults sheet (split header, board standing + chase line,
 * confetti on wins/personal bests).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { notifyLeaderboardPassed } from '@/utils/notificationHelpers';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { IconSymbol } from '@/components/IconSymbol';
import {
  GridCell,
  WordSearchCategory,
  WordSearchDifficulty,
  WordSearchPlayMode,
  WordSearchPuzzle,
} from '@/types/game';
import {
  generateWordSearchPuzzle,
  getTimeLimitSeconds,
  calculateWordSearchScore,
  POINTS_PER_WORD,
  TIMED_BONUS_PER_SECOND,
  DIFFICULTY_MULTIPLIER,
} from '@/utils/game/wordSearchEngine';
import { getWordsForCategory } from '@/utils/game/wordSearchDataAdapters';
import { fetchStanding, BoardStanding } from '@/utils/game/standing';
import WordSearchGrid from '@/components/game/WordSearchGrid';
import WordTrays from '@/components/game/WordTrays';
import PlayConsole, { ConsoleTimer, ConsoleStat } from '@/components/game/PlayConsole';
import GameResults, { ResultsFold } from '@/components/game/GameResults';
import { PLAY_VISUALS } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

type GamePhase = 'loading' | 'playing' | 'won' | 'lost';

const BOARD_PAD = 10; // matches WordSearchGrid's sizing constant

export default function WordSearchPlayScreen() {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const scheme = resolvedMode === 'dark' ? 'dark' : 'light';
  const router = useRouter();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    category: WordSearchCategory;
    difficulty: WordSearchDifficulty;
    playMode: WordSearchPlayMode;
  }>();

  const category = params.category ?? 'dishes_ingredients';
  const difficulty = params.difficulty ?? 'easy';
  const playMode = params.playMode ?? 'free';
  const isTimed = playMode === 'timed';
  const timeLimitSeconds = isTimed ? getTimeLimitSeconds(difficulty) : 0;

  const [phase, setPhase] = useState<GamePhase>('loading');
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle | null>(null);
  const [selectedCells, setSelectedCells] = useState<GridCell[]>([]);
  const [foundWordIds, setFoundWordIds] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const scoreSavedRef = useRef(false);

  // Board standing for the results header — captured before play, refreshed
  // after the score lands (the run is what moves the board).
  const [prevBest, setPrevBest] = useState(0);
  const [rankBefore, setRankBefore] = useState<number | null>(null);
  const [standingAfter, setStandingAfter] = useState<BoardStanding | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [standing, statsRes] = await Promise.all([
        fetchStanding(user.id, 'word_search', category),
        supabase.rpc('get_my_game_category_stats', { p_actor_id: user.id, p_game: 'word_search' }),
      ]);
      if (cancelled) return;
      if (standing) setRankBefore(standing.rank);
      const row = (statsRes.data || []).find((r: any) => r.category === category);
      if (row) setPrevBest(Number(row.score));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, category]);

  // ─── Load puzzle ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      const rawWords = await getWordsForCategory(category, difficulty, organizationId ?? '', organization.games_use_sample_data, user.id);
      if (cancelled) return;
      setPuzzle(generateWordSearchPuzzle(rawWords, difficulty));
      setPhase('playing');
    }
    load();
    return () => { cancelled = true; };
  }, [category, difficulty, user?.id]);

  // ─── Clock (single source — the console just renders it) ─────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (isTimed && next >= timeLimitSeconds) {
          clearInterval(interval);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setPhase('lost');
          return timeLimitSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, isTimed, timeLimitSeconds]);

  // ─── Word found ──────────────────────────────────────────────────────────
  const handleWordFound = useCallback((wordId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFoundWordIds((prev) => {
      const next = [...prev, wordId];
      if (puzzle && next.length === puzzle.words.length) {
        setPhase('won');
      }
      return next;
    });
    setScore((prev) => prev + Math.round(POINTS_PER_WORD * DIFFICULTY_MULTIPLIER[difficulty]));
  }, [puzzle, difficulty]);

  // ─── Save score + refresh standing ───────────────────────────────────────
  const timeRemaining = isTimed ? Math.max(0, timeLimitSeconds - elapsedSeconds) : 0;
  const finalScore = phase === 'won'
    ? calculateWordSearchScore(foundWordIds.length, timeRemaining, playMode, difficulty)
    : score;

  useEffect(() => {
    if ((phase === 'won' || phase === 'lost') && puzzle && user && !scoreSavedRef.current) {
      scoreSavedRef.current = true;
      setSaving(true);
      // Self-submit RPC: the player is the actor, org derived server-side.
      supabase.rpc('submit_word_search_score', {
        p_actor_id: user.id,
        p_category: category,
        p_difficulty: difficulty,
        p_play_mode: playMode,
        p_score: finalScore,
        p_words_found: foundWordIds.length,
        p_total_words: puzzle.words.length,
        p_time_seconds: elapsedSeconds,
        p_completed: phase === 'won',
      }).then(async () => {
        if (phase === 'won' && finalScore > 0) {
          notifyLeaderboardPassed(user.id, finalScore, user.name, organizationId ?? undefined);
        }
        const after = await fetchStanding(user.id, 'word_search', category);
        setStandingAfter(after);
        setSaving(false);
      });
    }
  }, [phase]);

  // ─── Restart ─────────────────────────────────────────────────────────────
  const handleRestart = async () => {
    if (!user?.id) return;
    scoreSavedRef.current = false;
    setPhase('loading');
    setFoundWordIds([]);
    setScore(0);
    setElapsedSeconds(0);
    setSelectedCells([]);
    setStandingAfter(null);
    const rawWords = await getWordsForCategory(category, difficulty, organizationId ?? '', organization.games_use_sample_data, user.id);
    setPuzzle(generateWordSearchPuzzle(rawWords, difficulty));
    setPhase('playing');
  };

  // ─── Results derivation ──────────────────────────────────────────────────
  const isWin = phase === 'won';
  const isPB = isWin && prevBest > 0 && finalScore > prevBest;
  const isFirstScore = isWin && prevBest === 0;
  const celebrate = isWin; // win = full completion; PB implies win here
  const resultTitle = !isWin
    ? t('word_search:times_up')
    : isPB
      ? t('game_results:new_personal_best')
      : t('word_search:puzzle_complete');

  const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
  const pointsPerWord = Math.round(POINTS_PER_WORD * multiplier);
  const timeBonus = isWin && isTimed ? Math.round(timeRemaining * TIMED_BONUS_PER_SECOND * multiplier) : 0;

  const missedWords = puzzle ? puzzle.words.filter((w) => !foundWordIds.includes(w.id)) : [];
  const foundWords = puzzle ? puzzle.words.filter((w) => foundWordIds.includes(w.id)) : [];

  // Review stays organized by DISH (Steve's study note) — each fold groups
  // its words under the menu item they belong to.
  const groupByItem = (words: typeof missedWords) => {
    const map = new Map<string, typeof missedWords>();
    for (const w of words) {
      if (!map.has(w.itemName)) map.set(w.itemName, []);
      map.get(w.itemName)!.push(w);
    }
    return Array.from(map.entries());
  };

  const chase = standingAfter?.isTop
    ? ('top' as const)
    : standingAfter?.rank != null && standingAfter.gapToAbove != null
      ? { gapPts: standingAfter.gapToAbove, toRank: standingAfter.rank - 1 }
      : null;

  const categoryLabel = t(`word_search:cat_${category}`);
  const meta = `${categoryLabel} · ${t(`word_search:difficulty_${difficulty}`)} · ${t(`word_search:play_mode_${playMode}`)}`;

  const boardVisual = PLAY_VISUALS.word_search.board[scheme];

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (phase === 'loading' || !puzzle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('word_search:hub_title')} eyebrow={categoryLabel} />
        <View style={styles.loadingBody}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('word_search:building_puzzle')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('word_search:hub_title')}
        eyebrow={`${categoryLabel} · ${t(`word_search:difficulty_${difficulty}`)}`}
        onBack={() => router.replace('/word-search-game')}
        right={
          <View style={[styles.modeChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol
              ios_icon_name={isTimed ? 'clock.fill' : 'infinity'}
              android_material_icon_name={isTimed ? 'schedule' : 'all-inclusive'}
              size={16}
              color={PLAY_VISUALS.word_search.console[2]}
            />
          </View>
        }
      />

      {/* FROZEN column — no page scroll: a board drag must never move the
          page under the finger (the s76 smoke bug). Only the tray pager
          scrolls, horizontally, in its own region below. */}
      <View style={styles.content}>
        <PlayConsole game="word_search">
          <View style={styles.consoleRow}>
            <ConsoleTimer
              seconds={isTimed ? timeRemaining : elapsedSeconds}
              warn={isTimed && timeRemaining <= 30}
            />
            <ConsoleStat iosIcon="star" androidIcon="star" value={score.toLocaleString()} />
            <ConsoleStat
              iosIcon="textformat.abc"
              androidIcon="spellcheck"
              value={String(foundWordIds.length)}
              suffix={`/${puzzle.words.length}`}
            />
          </View>
        </PlayConsole>

        {/* The theme-aware gradient board — capsules + floating letters inside. */}
        <View style={styles.boardShell}>
          <LinearGradient
            colors={[boardVisual[0], boardVisual[1], boardVisual[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <WordSearchGrid
            puzzle={puzzle}
            selectedCells={selectedCells}
            foundWordIds={foundWordIds}
            onSelectionChange={setSelectedCells}
            onWordFound={handleWordFound}
            disabled={phase !== 'playing'}
          />
        </View>

        <View style={styles.trayRegion}>
          <WordTrays words={puzzle.words} foundWordIds={foundWordIds} />
        </View>
      </View>

      <GameResults
        visible={phase === 'won' || phase === 'lost'}
        game="word_search"
        title={resultTitle}
        score={finalScore}
        meta={meta}
        deltaChip={
          isPB
            ? t('game_results:vs_best_delta', { delta: (finalScore - prevBest).toLocaleString() })
            : isFirstScore
              ? t('game_results:first_score')
              : undefined
        }
        rankBefore={rankBefore}
        rankAfter={standingAfter?.rank ?? null}
        chase={chase}
        boardLabel={t('game_results:board_label', { name: categoryLabel })}
        celebrate={celebrate}
        saving={saving}
        statRows={[
          {
            label: t('word_search:words_found'),
            value: `${foundWordIds.length} × ${pointsPerWord}`,
          },
          ...(timeBonus > 0
            ? [{ label: t('word_search:time_bonus'), value: `+${timeBonus.toLocaleString()}`, color: '#10B981' }]
            : []),
          ...(!isPB && prevBest > 0
            ? [{ label: t('game_results:your_best'), value: prevBest.toLocaleString() }]
            : []),
        ]}
        playAgainLabel={t('word_search:play_again')}
        onPlayAgain={handleRestart}
        viewBoardLabel={t('game_results:view_board')}
        onViewBoard={() => router.replace('/master-leaderboard?tab=word_search')}
        backLabel={t('game_results:back_to_game', { name: t('word_search:hub_title') })}
        onBack={() => router.replace('/word-search-game')}
        onGameHub={() => router.replace('/game-hub')}
      >
        {missedWords.length > 0 && (
          <ResultsFold
            iconIos="xmark"
            iconAndroid="close"
            iconColor="#EF4444"
            title={t('game_results:review_these')}
            count={missedWords.length}
            initiallyOpen
          >
            {groupByItem(missedWords).map(([itemName, words]) => (
              <React.Fragment key={itemName}>
                <DishHeaderRow name={itemName} />
                {words.map((word) => (
                  <WordReviewRow key={word.id} label={word.displayLabel} word={word.searchWord} found={false} />
                ))}
              </React.Fragment>
            ))}
          </ResultsFold>
        )}
        <ResultsFold
          iconIos="checkmark"
          iconAndroid="check"
          iconColor="#10B981"
          title={t('word_search:words_found')}
          count={`${foundWords.length}/${puzzle.words.length}`}
          initiallyOpen={missedWords.length === 0}
        >
          {groupByItem(foundWords).map(([itemName, words]) => (
            <React.Fragment key={itemName}>
              <DishHeaderRow name={itemName} />
              {words.map((word) => (
                <WordReviewRow key={word.id} label={word.displayLabel} word={word.searchWord} found />
              ))}
            </React.Fragment>
          ))}
        </ResultsFold>
      </GameResults>
    </View>
  );
}

function DishHeaderRow({ name }: { name: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.dishHeader, { borderTopColor: colors.hairline }]}>
      <Text style={[styles.dishHeaderText, { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function WordReviewRow({ label, word, found }: { label: string; word: string; found: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.reviewRow, { borderTopColor: colors.hairline }]}>
      <IconSymbol
        ios_icon_name={found ? 'checkmark' : 'xmark'}
        android_material_icon_name={found ? 'check' : 'close'}
        size={13}
        color={found ? '#10B981' : '#EF4444'}
      />
      <Text style={[styles.reviewLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.reviewWord, { color: found ? PLAY_VISUALS.word_search.console[2] : colors.textSecondary }]}>
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { fontSize: 15 },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 18,
    gap: 10,
  },
  trayRegion: {
    flex: 1,
    minHeight: 110,
  },
  modeChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  boardShell: {
    borderRadius: 16,
    padding: BOARD_PAD,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(120,150,180,0.25)',
    boxShadow: '0 12px 30px -16px rgba(0,0,0,0.45)',
  },
  dishHeader: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dishHeaderText: {
    fontFamily: fonts.display.semibold,
    fontSize: 12.5,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
  },
  reviewWord: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
  },
});
