/**
 * Master Leaderboard — s75 glass reskin.
 * 4 tabs: Overall, Menu Memory, Word Search, Picture This! — total accumulated
 * scores per player (top 20), with the viewer's own row highlighted.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { refreshAllUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import { fonts } from '@/constants/fonts';

type LeaderboardTab = 'overall' | 'memory' | 'word_search' | 'picture_this';

interface MasterLeaderboardEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  total_score: number;
  games_played: number;
}

const TABS: { key: LeaderboardTab; labelKey: string; icon: { ios: string; android: string } }[] = [
  { key: 'overall', labelKey: 'master_leaderboard:tab_overall', icon: { ios: 'trophy.fill', android: 'emoji-events' } },
  { key: 'memory', labelKey: 'master_leaderboard:tab_memory', icon: { ios: 'gamecontroller.fill', android: 'sports-esports' } },
  { key: 'word_search', labelKey: 'master_leaderboard:tab_word', icon: { ios: 'textformat.abc', android: 'spellcheck' } },
  { key: 'picture_this', labelKey: 'master_leaderboard:tab_picture', icon: { ios: 'photo.fill', android: 'photo-camera' } },
];

const RPC_MAP = {
  overall: 'get_master_leaderboard_overall_actor',
  memory: 'get_master_leaderboard_memory_actor',
  word_search: 'get_master_leaderboard_word_search_actor',
  picture_this: 'get_master_leaderboard_picture_this_actor',
} as const satisfies Record<LeaderboardTab, keyof Database['public']['Functions']>;

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export default function MasterLeaderboardScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { open: openMiniProfile } = useMiniProfile();
  // Deep links (e.g. the Picture This! end screen) can open straight onto
  // their game's tab.
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: LeaderboardTab = TABS.some((tabDef) => tabDef.key === params.tab)
    ? (params.tab as LeaderboardTab)
    : 'overall';

  const [activeTab, setActiveTab] = useState<LeaderboardTab>(initialTab);
  // Per-tab cache: flipping tabs within a visit reuses fetched boards; focus
  // clears the cache so returning to the screen refetches fresh.
  const [tabBoards, setTabBoards] = useState<Partial<Record<LeaderboardTab, MasterLeaderboardEntry[]>>>({});
  const entries = tabBoards[activeTab];

  const loadData = useCallback(async (tab: LeaderboardTab) => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc(RPC_MAP[tab], { p_limit: 20, p_actor_id: user.id });
      // On error keep whatever the cache holds — never paint a false empty board.
      if (!error && data) {
        setTabBoards((prev) => ({ ...prev, [tab]: data }));
      }
    } catch (err) {
      console.error('[MasterLeaderboard] load error:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!tabBoards[activeTab]) loadData(activeTab);
  }, [activeTab, loadData, tabBoards]);

  useFocusEffect(
    useCallback(() => {
      setTabBoards({});
    }, [])
  );

  // Mark leaderboard as viewed every time the screen gains focus — clears
  // the unread-pass badge across all surfaces (app icon, nav, tile, button).
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        // Pass the user id explicitly — the old no-arg function keyed off auth.uid() (NULL
        // here) and the client even passed p_organization_id, which it never accepted.
        supabase.rpc('mark_leaderboard_viewed', { p_user_id: user.id }).then(() => {
          refreshAllUnreadLeaderboardPasses();
        });
      }
    }, [user?.id])
  );

  const renderEntry = ({ item, index }: { item: MasterLeaderboardEntry; index: number }) => {
    const rank = index + 1;
    const isMe = item.user_id === user?.id;
    const gamesLabel =
      item.games_played === 1
        ? t('master_leaderboard:games_completed_one')
        : t('master_leaderboard:games_completed_n', { n: item.games_played });

    return (
      <TouchableOpacity
        style={[
          styles.entry,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          isMe && { backgroundColor: colors.tint + '14', borderColor: colors.tint + '59' },
        ]}
        onPress={() => openMiniProfile(item.user_id)}
        activeOpacity={0.7}
      >
        {/* Rank */}
        <View style={styles.rankBox}>
          {rank <= 3 ? (
            <Text style={styles.rankEmoji}>{RANK_EMOJIS[rank - 1]}</Text>
          ) : (
            <Text style={[styles.rankNumber, { color: colors.textSecondary }]}>{rank}</Text>
          )}
        </View>

        {/* Avatar */}
        {item.profile_picture_url ? (
          <StorageImage source={{ uri: item.profile_picture_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tint + '2E' }]}>
            <Text style={[styles.avatarInitial, { color: colors.tint }]}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}

        {/* Name + Games */}
        <View style={styles.nameBox}>
          <Text style={[styles.name, { color: isMe ? colors.tint : colors.text }]} numberOfLines={1}>
            {item.name}
            {isMe ? ` (${t('master_leaderboard:you')})` : ''}
          </Text>
          <Text style={[styles.gamesPlayed, { color: colors.textSecondary }]}>{gamesLabel}</Text>
        </View>

        {/* Total Score */}
        <Text style={[styles.score, { color: colors.tint }]}>
          {item.total_score.toLocaleString()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('master_leaderboard:title')} eyebrow={t('game_hub_ui:eyebrow')} />

      {/* Tab chips */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive
                  ? { backgroundColor: colors.tint, borderColor: colors.tint }
                  : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <IconSymbol
                ios_icon_name={tab.icon.ios as any}
                android_material_icon_name={tab.icon.android as any}
                size={13}
                color={isActive ? colors.fireText : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.fireText : colors.textSecondary },
                  isActive && { fontFamily: fonts.body.semibold },
                ]}
                numberOfLines={1}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {activeTab === 'overall'
          ? t('master_leaderboard:subtitle_overall')
          : activeTab === 'memory'
          ? t('master_leaderboard:subtitle_memory')
          : activeTab === 'word_search'
          ? t('master_leaderboard:subtitle_word')
          : t('master_leaderboard:subtitle_picture')}
      </Text>

      {/* List */}
      {!entries ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('master_leaderboard:no_scores')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            {t('master_leaderboard:empty_desc')}
          </Text>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/game-hub')}
          >
            <Text style={[styles.playBtnText, { color: colors.fireText }]}>{t('master_leaderboard:play_now')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.user_id}
          renderItem={renderEntry}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <BottomNavBar activeTab="tools" />
      <JoltOverlay role={isManagerOrOwner(user) ? 'manager' : 'employee'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  tabLabel: {
    fontFamily: fonts.body.medium,
    fontSize: 11,
  },
  subtitle: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 130,
    gap: 9,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 12,
    gap: 10,
  },
  rankBox: { width: 30, alignItems: 'center' },
  rankEmoji: { fontSize: 19 },
  rankNumber: { fontFamily: fonts.mono.semibold, fontSize: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 15, fontFamily: fonts.display.bold },
  nameBox: { flex: 1 },
  name: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  gamesPlayed: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 2 },
  score: { fontFamily: fonts.mono.semibold, fontSize: 16 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 17 },
  emptyDesc: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  playBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  playBtnText: { fontFamily: fonts.body.semibold, fontSize: 14 },
});
