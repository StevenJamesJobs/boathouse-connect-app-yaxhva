/**
 * Game Hub — the s75 "M1 Stacked" layout.
 * Player card (you: rank + total) → Arcade tiles that expand into each game's
 * top-3 board card → the podium + View Full Leaderboard at the floor.
 * Manager/owner get the ⚙ Game Hub menu (Editor / Rewards / Reset Scores).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from "expo-router/react-navigation";
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { isManagerOrOwner } from '@/utils/roles';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { MessageBadge } from '@/components/MessageBadge';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GameHubHeaderAction from '@/components/game/GameHubHeaderAction';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import GameSquareTile from '@/components/game/GameSquareTile';
import GameBoardCard, { GameBoardRow } from '@/components/game/GameBoardCard';
import { GAME_VISUALS } from '@/components/game/gameVisuals';
import { fetchMasterTop } from '@/utils/game/boards';
import { formatPlayedLine } from '@/utils/game/scoreLine';
import { fonts } from '@/constants/fonts';

type GameKey = 'word_search' | 'memory' | 'picture_this';

interface GameDef {
  key: GameKey;
  titleKey: string;
  descKey: string;
  iosIcon: string;
  androidIcon: string;
  accent: string;
  gradient: readonly [string, string];
  route: string;
  boardRpc: keyof Database['public']['Functions'];
  isPremium?: boolean;
}

const GAMES: GameDef[] = [
  // Free game first — base users get a playable game up top; the two premium
  // tiles sit beside it with their locks visible.
  {
    key: 'word_search',
    titleKey: 'game_hub_cards:word_search_title',
    descKey: 'game_hub_cards:word_search_desc',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    accent: GAME_VISUALS.word_search.accent,
    gradient: GAME_VISUALS.word_search.gradient,
    route: '/word-search-game',
    boardRpc: 'get_master_leaderboard_word_search_actor',
  },
  {
    key: 'memory',
    titleKey: 'game_hub_cards:memory_title',
    descKey: 'game_hub_cards:memory_desc',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    accent: GAME_VISUALS.memory.accent,
    gradient: GAME_VISUALS.memory.gradient,
    route: '/menu-memory-game',
    boardRpc: 'get_master_leaderboard_memory_actor',
    isPremium: true,
  },
  {
    key: 'picture_this',
    titleKey: 'game_hub_cards:picture_this_title',
    descKey: 'game_hub_cards:picture_this_desc',
    iosIcon: 'photo.fill',
    androidIcon: 'photo-camera',
    accent: GAME_VISUALS.picture_this.accent,
    gradient: GAME_VISUALS.picture_this.gradient,
    route: '/picture-this-game',
    boardRpc: 'get_master_leaderboard_picture_this_actor',
    isPremium: true,
  },
];

interface LeaderEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  total_score: number;
  games_played: number;
}

interface MySummary {
  total_score: number;
  overall_rank: number | null;
  players_total: number;
  memory_score: number;
  memory_games: number;
  word_search_score: number;
  word_search_games: number;
  picture_this_score: number;
  picture_this_games: number;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function SectionLabel({ label, count }: { label: string; count?: number }) {
  const colors = useThemeColors();
  return (
    <View style={styles.zlabel}>
      <Text style={[styles.zlabelText, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.hairline }]} />
      {count !== undefined && (
        <Text style={[styles.zlabelText, { color: colors.textSecondary }]}>{count}</Text>
      )}
    </View>
  );
}

export default function GameHubScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const { open: openMiniProfile } = useMiniProfile();
  const { unreadCount: unreadLeaderboardCount } = useUnreadLeaderboardPasses();

  const [topLeaders, setTopLeaders] = useState<LeaderEntry[] | null>(null);
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [expanded, setExpanded] = useState<GameKey | null>(null);
  const [boards, setBoards] = useState<Partial<Record<GameKey, GameBoardRow[]>>>({});

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let cancelled = false;
      (async () => {
        const [leadersRes, summaryRes] = await Promise.all([
          supabase.rpc('get_master_leaderboard_overall_actor', { p_actor_id: user.id, p_limit: 3 }),
          supabase.rpc('get_my_game_summary', { p_actor_id: user.id }),
        ]);
        if (cancelled) return;
        // On error KEEP the previous values — a transient failure must not
        // paint an authoritative "no scores yet" over a board that has scores.
        if (!leadersRes.error && leadersRes.data) setTopLeaders(leadersRes.data);
        const row = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
        if (!summaryRes.error && row) setSummary(row as MySummary);
        // Scores change while we're away — drop cached boards so an open tile refetches.
        setBoards({});
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  // Lazy board fetch for the expanded tile (top-3 of that game's master board).
  useEffect(() => {
    if (!expanded || !user?.id || boards[expanded]) return;
    const game = GAMES.find((g) => g.key === expanded)!;
    let cancelled = false;
    (async () => {
      // null = fetch failed: keep whatever the cache holds (spinner if nothing)
      // rather than rendering a false empty board.
      const rows = await fetchMasterTop(user.id, game.boardRpc);
      if (cancelled || !rows) return;
      setBoards((prev) => ({ ...prev, [expanded]: rows }));
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, user?.id, boards]);

  const handleTilePress = (game: GameDef) => {
    const isLocked = game.isPremium && !hasPremium;
    if (isLocked) {
      if (!isManagerOrOwner(user)) {
        // Employees can't purchase — no upsell, just a friendly nudge.
        Alert.alert(
          t('common:feature_locked_title'),
          `${t('common:feature_locked_desc')}\n\n${t('game_hub_ui:locked_joke')}`,
          [{ text: t('common:ok') }]
        );
        return;
      }
      // Locked + manager/owner falls through: the game screen itself shows
      // the sales-copy gate — a better pitch than an alert.
      router.push(game.route as any);
      return;
    }
    setExpanded((prev) => (prev === game.key ? null : game.key));
  };

  const myGameLine = (game: GameDef): string => {
    if (!summary) return '…';
    // MySummary field names are exactly `${game.key}_score` / `${game.key}_games`.
    const score = summary[`${game.key}_score` as keyof MySummary] as number;
    const games = summary[`${game.key}_games` as keyof MySummary] as number;
    return formatPlayedLine(t, score, games);
  };

  const expandedGame = expanded ? GAMES.find((g) => g.key === expanded) : null;

  // Podium column order: 2nd · 1st · 3rd (missing places just don't render).
  const podium = topLeaders
    ? [
        { leader: topLeaders[1], place: 1 },
        { leader: topLeaders[0], place: 0 },
        { leader: topLeaders[2], place: 2 },
      ].filter((p): p is { leader: LeaderEntry; place: number } => !!p.leader)
    : [];

  // Managers get the settings menu; employees on the hub get nothing (the
  // shared component also serves the game pages, where employees get a
  // jump-home pill instead).
  const navMenu = isManagerOrOwner(user) ? <GameHubHeaderAction context="hub" /> : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('game_hub_ui:title')}
        eyebrow={t('game_hub_ui:eyebrow')}
        right={navMenu}
        rightWide={!!navMenu}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Player card — you: photo · name · rank · total */}
        <View style={[styles.playerCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          {user?.profilePictureUrl ? (
            <StorageImage source={{ uri: user.profilePictureUrl }} style={styles.playerAvatar} />
          ) : (
            <View style={[styles.playerAvatarPlaceholder, { backgroundColor: colors.tint + '2E' }]}>
              <Text style={[styles.playerInitial, { color: colors.tint }]}>
                {(user?.name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.playerWho}>
            <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={[styles.playerRank, { color: colors.textSecondary }]} numberOfLines={1}>
              {summary
                ? summary.overall_rank
                  ? t('game_hub_ui:rank_line', {
                      rank: summary.overall_rank,
                      total: summary.players_total,
                    })
                  : t('game_hub_ui:rank_none')
                : '…'}
            </Text>
          </View>
          <View style={styles.playerTotals}>
            <Text style={[styles.playerTotal, { color: colors.tint }]}>
              {summary ? Number(summary.total_score).toLocaleString() : '—'}
            </Text>
            <Text style={[styles.playerTotalLabel, { color: colors.textSecondary }]}>
              {t('game_hub_ui:total_label')}
            </Text>
          </View>
        </View>

        {/* Games shelf */}
        <SectionLabel label={t('game_hub_ui:games_label')} count={GAMES.length} />
        <View style={styles.shelf}>
          {GAMES.map((game) => (
            <GameSquareTile
              key={game.key}
              label={t(game.titleKey)}
              iosIcon={game.iosIcon}
              androidIcon={game.androidIcon}
              gradient={game.gradient}
              selected={expanded === game.key}
              locked={game.isPremium && !hasPremium}
              onPress={() => handleTilePress(game)}
            />
          ))}
        </View>

        {expandedGame && (
          <GameBoardCard
            accent={expandedGame.accent}
            iosIcon={expandedGame.iosIcon}
            androidIcon={expandedGame.androidIcon}
            title={t(expandedGame.titleKey)}
            desc={t(expandedGame.descKey)}
            rows={boards[expandedGame.key] ?? null}
            emptyText={t('game_hub_ui:no_scores')}
            youLabel={t('game_hub_ui:your_score')}
            youValue={myGameLine(expandedGame)}
            playLabel={t('game_hub_ui:play')}
            onPlay={() => router.push(expandedGame.route as any)}
            onRowPress={openMiniProfile}
          />
        )}

        {/* Podium — the overall board closes the page */}
        <SectionLabel label={t('game_hub_ui:leaderboard_title')} />
        {topLeaders && topLeaders.length === 0 ? (
          <View style={[styles.emptyBoard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={styles.emptyBoardEmoji}>🏆</Text>
            <Text style={[styles.emptyBoardText, { color: colors.textSecondary }]}>
              {t('game_hub_ui:no_scores')}
            </Text>
          </View>
        ) : (
          <View style={styles.podium}>
            {podium.map(({ leader, place }) => (
              <TouchableOpacity
                key={leader.user_id}
                style={styles.podiumCol}
                onPress={() => openMiniProfile(leader.user_id)}
                activeOpacity={0.75}
              >
                {leader.profile_picture_url ? (
                  <StorageImage
                    source={{ uri: leader.profile_picture_url }}
                    style={[styles.podiumAvatar, { borderColor: colors.glassBorder }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.podiumAvatar,
                      styles.podiumAvatarPlaceholder,
                      { backgroundColor: colors.tint + '2E', borderColor: colors.glassBorder },
                    ]}
                  >
                    <Text style={[styles.podiumInitial, { color: colors.tint }]}>
                      {(leader.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                  {(leader.name || '').split(' ')[0]}
                </Text>
                <Text style={[styles.podiumScore, { color: colors.tint }]}>
                  {leader.total_score.toLocaleString()}
                </Text>
                <View
                  style={[
                    styles.podiumBlock,
                    { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                    place === 0 ? styles.blockFirst : place === 1 ? styles.blockSecond : styles.blockThird,
                  ]}
                >
                  <Text style={styles.podiumMedal}>{RANK_MEDALS[place]}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/master-leaderboard')}
          activeOpacity={0.75}
        >
          <Text style={styles.viewAllText}>{t('game_hub_ui:view_full_leaderboard')}</Text>
          {unreadLeaderboardCount > 0 && (
            <View style={{ marginLeft: 2 }}>
              <MessageBadge count={unreadLeaderboardCount} size="small" />
            </View>
          )}
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={15}
            color="#F59E0B"
          />
        </TouchableOpacity>
      </ScrollView>

      <BottomNavBar activeTab="tools" />
      <JoltOverlay role={isManagerOrOwner(user) ? 'manager' : 'employee'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 140,
  },

  // Player card
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  playerAvatar: { width: 52, height: 52, borderRadius: 26 },
  playerAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInitial: { fontSize: 20, fontFamily: fonts.display.bold },
  playerWho: { flex: 1, minWidth: 0 },
  playerName: { fontFamily: fonts.display.bold, fontSize: 17 },
  playerRank: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  playerTotals: { alignItems: 'flex-end' },
  playerTotal: { fontFamily: fonts.mono.semibold, fontSize: 21 },
  playerTotalLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Section labels
  zlabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  zlabelText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  zlabelLine: { flex: 1, height: StyleSheet.hairlineWidth },

  // Shelf
  shelf: { flexDirection: 'row', gap: 9 },

  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  podiumCol: { flex: 1, maxWidth: 112, alignItems: 'center', gap: 5 },
  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  podiumAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  podiumInitial: { fontSize: 16, fontFamily: fonts.display.bold },
  podiumName: { fontFamily: fonts.body.semibold, fontSize: 11.5, maxWidth: '100%' },
  podiumScore: { fontFamily: fonts.mono.semibold, fontSize: 12 },
  podiumBlock: {
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    paddingTop: 6,
  },
  blockFirst: { height: 84 },
  blockSecond: { height: 60 },
  blockThird: { height: 46 },
  podiumMedal: { fontSize: 15 },

  // Empty board
  emptyBoard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    paddingVertical: 22,
    gap: 6,
    marginBottom: 10,
  },
  emptyBoardEmoji: { fontSize: 32 },
  emptyBoardText: { fontSize: 13, fontStyle: 'italic' },

  // View full leaderboard — the trophy amber reads on both themes (same
  // literal the old hub used).
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  viewAllText: {
    color: '#F59E0B',
    fontFamily: fonts.body.semibold,
    fontSize: 13.5,
  },
});
