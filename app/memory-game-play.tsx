/**
 * Menu Memory Play — the s76 lockdown screen.
 * ScreenHeader + slim memory console (LEVEL · timer · score / hearts · pair
 * rail) + the persistent FlipDock (fixed height, never unmounts — the board
 * never shifts) over the theme-aware gradient board with org-branded card
 * backs. A match merges the dock into a chip that flies into the next rail
 * slot; a lit slot taps to PEEK its pair back into the dock. Results ride the
 * shared GameResults sheet (split header, standing + chase, confetti on
 * wins).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { notifyLeaderboardPassed } from '@/utils/notificationHelpers';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { IconSymbol } from '@/components/IconSymbol';
import { GameMode, GameState, CardData, PlayMode, GAME_MODE_INFO } from '@/types/game';
import {
  getDifficultyConfig,
  getMaxDifficulty,
  getElapsedSeconds,
} from '@/utils/game/gameEngine';
import { processTimeout } from '@/utils/game/gameEngine';
import { generateCards } from '@/utils/game/gameDataAdapters';
import { fetchStanding, BoardStanding } from '@/utils/game/standing';
import MemoryGameBoard from '@/components/game/MemoryGameBoard';
import FlipDock, { DockCard, FlipDockState } from '@/components/game/FlipDock';
import PlayConsole, { ConsoleTimer, ConsoleStat, ConsoleTag, HeartsRow, PairRail, railSlotCenter } from '@/components/game/PlayConsole';
import GameResults, { ResultsFold } from '@/components/game/GameResults';
import { PLAY_VISUALS, HEART_FULL } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

const FLY_DURATION = 420;

export default function MemoryGamePlayScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const scheme = resolvedMode === 'dark' ? 'dark' : 'light';
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const params = useLocalSearchParams<{ mode: string; difficulty: string; play_mode: string }>();

  const mode = (params.mode || 'wine_pairings') as GameMode;
  const playMode = (params.play_mode || 'lives') as PlayMode;
  const difficultyLevel = parseInt(params.difficulty || '1', 10);
  const difficultyConfig = getDifficultyConfig(difficultyLevel);
  const isTimed = playMode === 'timed';

  const [cards, setCards] = useState<CardData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gameKey, setGameKey] = useState(0); // for restarting

  const [elapsed, setElapsed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(difficultyConfig.timeLimitSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // ─── Standing / personal best (mode = the board category) ────────────────
  const [prevBest, setPrevBest] = useState(0);
  const [rankBefore, setRankBefore] = useState<number | null>(null);
  const [standingAfter, setStandingAfter] = useState<BoardStanding | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [standing, statsRes] = await Promise.all([
        fetchStanding(user.id, 'memory', mode),
        supabase.rpc('get_my_game_category_stats', { p_actor_id: user.id, p_game: 'memory' }),
      ]);
      if (cancelled) return;
      if (standing) setRankBefore(standing.rank);
      const row = (statsRes.data || []).find((r: any) => r.category === mode);
      if (row) setPrevBest(Number(row.score));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, mode]);

  // ─── Load cards on mount or restart ──────────────────────────────────────
  useEffect(() => {
    loadCards();
  }, [gameKey]);

  const loadCards = async () => {
    if (!user?.id) return;
    setLoading(true);
    setShowResults(false);
    setStandingAfter(null);
    scoreSavedRef.current = false;
    setElapsed(0);
    setTimeRemaining(difficultyConfig.timeLimitSeconds);
    setPeekIndex(null);
    try {
      const generatedCards = await generateCards(mode, difficultyConfig.totalPairs, organizationId ?? '', organization.games_use_sample_data, user.id);
      setCards(generatedCards);
    } catch (e) {
      console.error('Error generating cards:', e);
    } finally {
      setLoading(false);
    }
  };

  // ─── Clocks ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.isComplete || loading) return;
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(gameState.startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState?.startTime, gameState?.isComplete, loading]);

  useEffect(() => {
    if (!isTimed || !gameState || gameState.isComplete || loading) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          const currentState = gameStateRef.current;
          if (currentState && !currentState.isComplete) {
            const timeoutState = processTimeout(currentState);
            setGameState(timeoutState);
            handleGameComplete(timeoutState);
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimed, gameState?.startTime, gameState?.isComplete, loading]);

  // ─── The dock (persistent) + fly-to-rail choreography ────────────────────
  const [peekIndex, setPeekIndex] = useState<number | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flying, setFlying] = useState<{ label: string; targetIndex: number } | null>(null);
  const flyPos = useRef(new RNAnimated.ValueXY({ x: 0, y: 0 })).current;
  const flyScale = useRef(new RNAnimated.Value(1)).current;
  const dockWrapRef = useRef<View>(null);
  const railWrapRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const prevMatchedCount = useRef(0);

  const flippedCards: CardData[] =
    gameState?.flippedIndices.map((i) => gameState.cards[i]).filter(Boolean) ?? [];

  const toDockCard = (card: CardData): DockCard => ({
    sub: card.displaySubtext,
    text: card.displayText,
    side: card.cardType === 'primary' ? 'primary' : 'match',
  });

  // Live flips override a peek instantly.
  useEffect(() => {
    if (flippedCards.length > 0 && peekIndex !== null) dismissPeek();
  }, [flippedCards.length]);

  const isPairMatch =
    flippedCards.length === 2 && flippedCards[0].pairId === flippedCards[1].pairId;

  let dockState: FlipDockState = 'idle';
  let dockLeft: DockCard | null = null;
  let dockRight: DockCard | null = null;

  if (peekIndex !== null && gameState && flippedCards.length === 0) {
    const pairId = gameState.matchedPairIds[peekIndex];
    const primary = gameState.cards.find((c) => c.pairId === pairId && c.cardType === 'primary');
    const match = gameState.cards.find((c) => c.pairId === pairId && c.cardType === 'match');
    dockState = 'peek';
    dockLeft = primary ? toDockCard(primary) : null;
    dockRight = match ? toDockCard(match) : null;
  } else if (flippedCards.length === 1) {
    dockState = 'pending';
    dockLeft = toDockCard(flippedCards[0]);
  } else if (flippedCards.length === 2) {
    dockState = isPairMatch ? 'match' : 'miss';
    dockLeft = toDockCard(flippedCards[0]);
    dockRight = toDockCard(flippedCards[1]);
  }

  // A new matched pair → the merged chip flies from the dock into its slot.
  useEffect(() => {
    const count = gameState?.matchedPairIds.length ?? 0;
    if (count > prevMatchedCount.current && gameState && !gameState.isComplete) {
      const pairId = gameState.matchedPairIds[count - 1];
      const primary = gameState.cards.find((c) => c.pairId === pairId && c.cardType === 'primary');
      launchFly(primary?.displayText ?? '', count - 1);
    }
    prevMatchedCount.current = count;
  }, [gameState?.matchedPairIds.length]);

  const launchFly = (label: string, targetIndex: number) => {
    const dock = dockWrapRef.current;
    const rail = railWrapRef.current;
    const root = rootRef.current;
    if (!dock || !rail || !root) return;
    dock.measureLayout(
      root as any,
      (dx, dy, dw, dh) => {
        rail.measureLayout(
          root as any,
          (rx, ry, _rw, rh) => {
            const { offsetX, slotSize } = railSlotCenter(difficultyConfig.totalPairs, targetIndex);
            flyPos.setValue({ x: dx + dw / 2, y: dy + dh / 2 });
            flyScale.setValue(1);
            setFlying({ label, targetIndex });
            RNAnimated.parallel([
              RNAnimated.timing(flyPos, {
                toValue: { x: rx + offsetX, y: ry + rh / 2 },
                duration: FLY_DURATION,
                easing: RNEasing.inOut(RNEasing.quad),
                useNativeDriver: false,
              }),
              RNAnimated.timing(flyScale, {
                toValue: slotSize / 40,
                duration: FLY_DURATION,
                easing: RNEasing.in(RNEasing.quad),
                useNativeDriver: false,
              }),
            ]).start(() => {
              setFlying(null);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            });
          },
          () => setFlying(null),
        );
      },
      () => setFlying(null),
    );
  };

  const handleSlotPeek = (index: number) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeekIndex(index);
    peekTimer.current = setTimeout(() => setPeekIndex(null), 2500);
  };

  const dismissPeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeekIndex(null);
  };

  useEffect(() => () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  // ─── Game lifecycle ──────────────────────────────────────────────────────
  const handleGameStateChange = useCallback((state: GameState) => {
    setGameState(state);
  }, []);

  const scoreSavedRef = useRef(false);

  const handleGameComplete = useCallback(async (finalState: GameState) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (finalState.isWin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setShowResults(true);

    if (user?.id && !scoreSavedRef.current) {
      scoreSavedRef.current = true;
      setSaving(true);
      try {
        const elapsedFinal = getElapsedSeconds(finalState.startTime);
        // Self-submit RPC: the player is the actor, org derived server-side.
        await supabase.rpc('submit_memory_game_score', {
          p_actor_id: user.id,
          p_game_mode: mode,
          p_play_mode: playMode,
          p_difficulty: difficultyLevel,
          p_score: finalState.score,
          p_time_seconds: elapsedFinal,
          p_pairs_matched: finalState.matchedPairIds.length,
          p_total_pairs: difficultyConfig.totalPairs,
          p_lives_remaining: playMode === 'lives' ? finalState.lives : 0,
          p_completed: finalState.isWin,
        });
        if (finalState.isWin && finalState.score > 0) {
          notifyLeaderboardPassed(user.id, finalState.score, user.name, organizationId ?? undefined);
        }
        const after = await fetchStanding(user.id, 'memory', mode);
        setStandingAfter(after);
      } catch (e) {
        console.error('Error saving score:', e);
      } finally {
        setSaving(false);
      }
    }
  }, [user?.id, mode, playMode, difficultyLevel, difficultyConfig.totalPairs]);

  const handlePlayAgain = () => {
    setGameKey((prev) => prev + 1);
  };

  const handleNextDifficulty = () => {
    const next = Math.min(difficultyLevel + 1, getMaxDifficulty());
    router.replace(`/memory-game-play?mode=${mode}&difficulty=${next}&play_mode=${playMode}`);
  };

  // ─── Pairs for the review folds ──────────────────────────────────────────
  const getAllPairs = () => {
    if (!gameState) return [];
    const pairs: { primary: string; match: string; isMatched: boolean }[] = [];
    const seenPairIds = new Set<string>();
    for (const card of gameState.cards) {
      if (seenPairIds.has(card.pairId)) continue;
      seenPairIds.add(card.pairId);
      const primary = gameState.cards.find((c) => c.pairId === card.pairId && c.cardType === 'primary');
      const match = gameState.cards.find((c) => c.pairId === card.pairId && c.cardType === 'match');
      if (primary && match) {
        pairs.push({
          primary: primary.displayText,
          match: match.displayText,
          isMatched: gameState.matchedPairIds.includes(card.pairId),
        });
      }
    }
    return pairs;
  };

  const modeTitle = t(GAME_MODE_INFO[mode].titleKey);
  const isWin = !!gameState?.isWin;
  const finalScore = gameState?.score ?? 0;
  const isPB = isWin && prevBest > 0 && finalScore > prevBest;
  const isFirstScore = isWin && prevBest === 0;
  const resultTitle = isWin
    ? isPB
      ? t('game_results:new_personal_best')
      : t('memory_game.you_won')
    : isTimed
      ? t('word_search:times_up')
      : t('memory_game.game_over');

  const chase = standingAfter?.isTop
    ? ('top' as const)
    : standingAfter?.rank != null && standingAfter.gapToAbove != null
      ? { gapPts: standingAfter.gapToAbove, toRank: standingAfter.rank - 1 }
      : null;

  const matchedPairs = getAllPairs().filter((p) => p.isMatched);
  const missedPairs = getAllPairs().filter((p) => !p.isMatched);

  const boardVisual = PLAY_VISUALS.memory.board[scheme];
  const lives = gameState?.lives ?? difficultyConfig.startingLives;
  const matchedCount = gameState?.matchedPairIds.length ?? 0;
  const railLit = matchedCount - (flying ? 1 : 0);

  if (loading || !cards) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('memory_game.hub_title')} eyebrow={modeTitle} />
        <View style={styles.loadingBody}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('memory_game.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View ref={rootRef} style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('memory_game.hub_title')}
        eyebrow={modeTitle}
        onBack={() => router.back()}
        right={
          <View style={[styles.modeChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol
              ios_icon_name={isTimed ? 'clock.fill' : 'heart.fill'}
              android_material_icon_name={isTimed ? 'schedule' : 'favorite'}
              size={16}
              color={isTimed ? PLAY_VISUALS.memory.console[2] : HEART_FULL}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PlayConsole game="memory">
          <View style={styles.consoleRow}>
            <ConsoleTag text={t('memory_game.level_tag', { level: difficultyLevel })} />
            <ConsoleTimer seconds={isTimed ? timeRemaining : elapsed} warn={isTimed && timeRemaining <= 15} size={22} />
            <ConsoleStat iosIcon="star" androidIcon="star" value={(gameState?.score ?? 0).toLocaleString()} />
          </View>
          <View style={styles.consoleRow2}>
            {playMode === 'lives' ? (
              <HeartsRow lives={lives} max={difficultyConfig.startingLives} />
            ) : (
              <ConsoleTag text={t('memory_game.timed_mode')} />
            )}
            <View ref={railWrapRef} collapsable={false}>
              <PairRail
                total={difficultyConfig.totalPairs}
                lit={railLit}
                landingIndex={flying?.targetIndex ?? null}
                peekIndex={peekIndex}
                onSlotPress={handleSlotPeek}
              />
            </View>
          </View>
        </PlayConsole>

        <View ref={dockWrapRef} collapsable={false}>
          <FlipDock
            left={dockLeft}
            right={dockRight}
            state={dockState}
            peekLabel={
              peekIndex !== null
                ? t('memory_game.dock_peek_tag', { number: peekIndex + 1 })
                : undefined
            }
            onDismissPeek={dismissPeek}
          />
        </View>

        {/* The theme-aware gradient board with org-branded backs. */}
        <View style={styles.boardShell}>
          <LinearGradient
            colors={[boardVisual[0], boardVisual[1], boardVisual[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <MemoryGameBoard
            key={gameKey}
            cards={cards}
            difficulty={difficultyConfig}
            playMode={playMode}
            timeRemaining={isTimed ? timeRemaining : undefined}
            orgName={organization?.name ?? ''}
            orgLogoUrl={organization?.logo_url ?? null}
            onGameStateChange={handleGameStateChange}
            onMatch={() => {}}
            onMismatch={() => {}}
            onGraceMismatch={() => {}}
            onGameComplete={handleGameComplete}
          />
        </View>
      </ScrollView>

      {/* The merged pair chip mid-flight to its rail slot. */}
      {flying && (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.flyChip,
            {
              transform: [
                { translateX: RNAnimated.subtract(flyPos.x, 70) },
                { translateY: RNAnimated.subtract(flyPos.y, 14) },
                { scale: flyScale },
              ],
            },
          ]}
        >
          <Text style={styles.flyText} numberOfLines={1}>
            {flying.label} ✓
          </Text>
        </RNAnimated.View>
      )}

      <GameResults
        visible={showResults}
        game="memory"
        title={resultTitle}
        score={finalScore}
        meta={`${modeTitle} · ${t('memory_game.level_short', { level: difficultyLevel })} · ${isTimed ? t('memory_game.timed_mode') : t('memory_game.lives_mode')}`}
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
        boardLabel={t('game_results:board_label', { name: modeTitle })}
        celebrate={isWin}
        saving={saving}
        statRows={[
          {
            label: t('memory_game.pairs_matched'),
            value: `${matchedCount}/${difficultyConfig.totalPairs}`,
          },
          playMode === 'lives'
            ? { label: t('memory_game.lives_remaining'), value: String(gameState?.lives ?? 0) }
            : { label: t('memory_game.time_remaining'), value: `${timeRemaining}s` },
          {
            label: t('memory_game.time_elapsed'),
            value: gameState ? `${getElapsedSeconds(gameState.startTime)}s` : '0s',
          },
          ...(!isPB && prevBest > 0
            ? [{ label: t('game_results:your_best'), value: prevBest.toLocaleString() }]
            : []),
        ]}
        playAgainLabel={t('memory_game.play_again')}
        onPlayAgain={handlePlayAgain}
        extraAction={
          isWin && difficultyLevel < getMaxDifficulty()
            ? { label: t('memory_game.next_level'), onPress: handleNextDifficulty }
            : undefined
        }
        viewBoardLabel={t('game_results:view_board')}
        onViewBoard={() => router.replace('/master-leaderboard?tab=memory')}
        backLabel={t('game_results:back_to_game', { name: t('memory_game.hub_title') })}
        onBack={() => router.replace('/menu-memory-game')}
        onGameHub={() => router.replace('/game-hub')}
      >
        {missedPairs.length > 0 && (
          <ResultsFold
            iconIos="xmark"
            iconAndroid="close"
            iconColor="#EF4444"
            title={t('game_results:review_these')}
            count={missedPairs.length}
            initiallyOpen
          >
            {missedPairs.map((pair, i) => (
              <PairReviewRow key={i} primary={pair.primary} match={pair.match} matched={false} />
            ))}
          </ResultsFold>
        )}
        <ResultsFold
          iconIos="checkmark"
          iconAndroid="check"
          iconColor="#10B981"
          title={t('memory_game.your_matches')}
          count={`${matchedPairs.length}/${difficultyConfig.totalPairs}`}
          initiallyOpen={missedPairs.length === 0}
        >
          {matchedPairs.map((pair, i) => (
            <PairReviewRow key={i} primary={pair.primary} match={pair.match} matched />
          ))}
        </ResultsFold>
      </GameResults>
    </View>
  );
}

function PairReviewRow({ primary, match, matched }: { primary: string; match: string; matched: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.reviewRow, { borderTopColor: colors.hairline }]}>
      <IconSymbol
        ios_icon_name={matched ? 'checkmark' : 'xmark'}
        android_material_icon_name={matched ? 'check' : 'close'}
        size={13}
        color={matched ? '#10B981' : '#EF4444'}
      />
      <Text style={[styles.reviewPrimary, { color: matched ? colors.text : colors.textSecondary }]} numberOfLines={1}>
        {primary}
      </Text>
      <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={11} color={colors.textSecondary} />
      <Text style={[styles.reviewMatch, { color: matched ? colors.text : colors.textSecondary }]} numberOfLines={1}>
        {match}
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 10,
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
  consoleRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 9,
  },
  boardShell: {
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(120,140,190,0.28)',
    boxShadow: '0 12px 30px -16px rgba(0,0,0,0.45)',
  },
  flyChip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 140,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 40,
    boxShadow: '0 4px 14px -4px rgba(16,185,129,0.6)',
  },
  flyText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: '#10B981',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewPrimary: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: fonts.body.semibold,
    textAlign: 'right',
  },
  reviewMatch: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: fonts.body.semibold,
  },
});
