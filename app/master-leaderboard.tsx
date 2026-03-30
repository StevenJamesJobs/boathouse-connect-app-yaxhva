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
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

type LeaderboardTab = 'overall' | 'memory' | 'word_search';

interface MasterLeaderboardEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  total_score: number;
  games_played: number;
}

const TABS: { key: LeaderboardTab; label: string; icon: { ios: string; android: string } }[] = [
  { key: 'overall', label: 'Overall', icon: { ios: 'trophy.fill', android: 'emoji-events' } },
  { key: 'memory', label: 'Memory', icon: { ios: 'gamecontroller.fill', android: 'sports-esports' } },
  { key: 'word_search', label: 'Word Search', icon: { ios: 'textformat.abc', android: 'spellcheck' } },
];

const RPC_MAP: Record<LeaderboardTab, string> = {
  overall: 'get_master_leaderboard_overall',
  memory: 'get_master_leaderboard_memory',
  word_search: 'get_master_leaderboard_word_search',
};

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export default function MasterLeaderboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<LeaderboardTab>('overall');
  const [entries, setEntries] = useState<MasterLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (tab: LeaderboardTab) => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)(RPC_MAP[tab], { p_limit: 20 });
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
  }, []);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const handleTabPress = (tab: LeaderboardTab) => {
    if (tab !== activeTab) setActiveTab(tab);
  };

  const renderEntry = ({ item, index }: { item: MasterLeaderboardEntry; index: number }) => {
    const rank = index + 1;
    const isMe = item.user_id === user?.id;

    return (
      <View
        style={[
          styles.entry,
          { backgroundColor: isMe ? colors.primary + '12' : colors.card },
          isMe && { borderColor: colors.primary, borderWidth: 1.5 },
        ]}
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
      </View>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>🏆 Leaderboard</Text>
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
                color={isActive ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? '#FFFFFF' : colors.textSecondary },
                  isActive && { fontWeight: '700' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subtitle */}
      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {activeTab === 'overall'
            ? 'Total points from all games combined'
            : activeTab === 'memory'
            ? 'Total points from Menu Memory Game'
            : 'Total points from Word Search puzzles'}
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
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No scores yet!</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Play some games to climb the leaderboard.
          </Text>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/game-hub')}
          >
            <Text style={styles.playBtnText}>Play Now</Text>
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
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
