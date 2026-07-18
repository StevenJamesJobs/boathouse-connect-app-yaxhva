/**
 * Master Leaderboard
 * 3 tabs: Overall (both games), Menu Memory, Word Search.
 * Shows total accumulated scores per user.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { refreshAllUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { useMiniProfile } from '@/contexts/MiniProfileContext';

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

const RPC_MAP: Record<LeaderboardTab, string> = {
  overall: 'get_master_leaderboard_overall_actor',
  memory: 'get_master_leaderboard_memory_actor',
  word_search: 'get_master_leaderboard_word_search_actor',
  picture_this: 'get_master_leaderboard_picture_this_actor',
};

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export default function MasterLeaderboardScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();

  const [activeTab, setActiveTab] = useState<LeaderboardTab>('overall');
  const [entries, setEntries] = useState<MasterLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (tab: LeaderboardTab) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc(RPC_MAP[tab] as any, { p_limit: 20, p_actor_id: user.id });
      if (!error && data) {
        setEntries(data as MasterLeaderboardEntry[]);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

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

  const handleTabPress = (tab: LeaderboardTab) => {
    if (tab !== activeTab) setActiveTab(tab);
  };

  const renderEntry = ({ item, index }: { item: MasterLeaderboardEntry; index: number }) => {
    const rank = index + 1;
    const isMe = item.user_id === user?.id;

    return (
      <TouchableOpacity
        style={[
          styles.entry,
          { backgroundColor: isMe ? colors.primary + '12' : colors.card },
          isMe && { borderColor: colors.primary, borderWidth: 1.5 },
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
          <Image source={{ uri: item.profile_picture_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}

        {/* Name + Games */}
        <View style={styles.nameBox}>
          <Text style={[styles.name, { color: isMe ? colors.primary : colors.text }]} numberOfLines={1}>
            {item.name}{isMe ? ' (You)' : ''}
          </Text>
          <Text style={[styles.gamesPlayed, { color: colors.textSecondary }]}>
            {item.games_played} game{item.games_played !== 1 ? 's' : ''} completed
          </Text>
        </View>

        {/* Total Score */}
        <Text style={[styles.score, { color: colors.primary }]}>
          {item.total_score.toLocaleString()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('master_leaderboard:title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && { backgroundColor: colors.primary, borderRadius: 10 },
              ]}
              onPress={() => handleTabPress(tab.key)}
            >
              <IconSymbol
                ios_icon_name={tab.icon.ios as any}
                android_material_icon_name={tab.icon.android as any}
                size={14}
                color={isActive ? colors.fireText : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.fireText : colors.textSecondary },
                  isActive && { fontWeight: '700' },
                ]}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subtitle */}
      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {activeTab === 'overall'
            ? t('master_leaderboard:subtitle_overall')
            : activeTab === 'memory'
            ? t('master_leaderboard:subtitle_memory')
            : activeTab === 'word_search'
            ? t('master_leaderboard:subtitle_word')
            : t('master_leaderboard:subtitle_picture')}
        </Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('master_leaderboard:no_scores')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Play some games to climb the leaderboard.
          </Text>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.primary }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  // List
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    boxShadow: '0px 1px 4px rgba(0,0,0,0.1)',
    elevation: 2,
  },
  rankBox: {
    width: 30,
    alignItems: 'center',
  },
  rankEmoji: { fontSize: 20 },
  rankNumber: { fontSize: 16, fontWeight: '700' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  nameBox: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  gamesPlayed: { fontSize: 11, marginTop: 2 },
  score: { fontSize: 18, fontWeight: '800' },
  // States
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  playBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  playBtnText: { fontWeight: '700', fontSize: 14 },
});
