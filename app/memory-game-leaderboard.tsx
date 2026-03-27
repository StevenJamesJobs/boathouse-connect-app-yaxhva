import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { GameMode, PlayMode, GAME_MODE_INFO, LeaderboardEntry } from '@/types/game';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

export default function MemoryGameLeaderboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [activePlayMode, setActivePlayMode] = useState<PlayMode>('lives');
  const [activeMode, setActiveMode] = useState<GameMode>('wine_pairings');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [activeMode, activePlayMode]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)('get_game_leaderboard', {
        p_game_mode: activeMode,
        p_limit: 20,
        p_play_mode: activePlayMode,
      });

      if (!error && data) {
        setEntries(data as LeaderboardEntry[]);
      } else {
        setEntries([]);
      }
    } catch (e) {
      console.error('Error loading leaderboard:', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const playModes: { key: PlayMode; label: string }[] = [
    { key: 'lives', label: '❤️ ' + t('memory_game.lives_mode') },
    { key: 'timed', label: '⏱ ' + t('memory_game.timed_mode') },
  ];

  const modes: GameMode[] = ['wine_pairings', 'ingredients_dishes', 'cocktail_ingredients'];
  const modeLabels: Record<GameMode, string> = {
    wine_pairings: t('memory_game.mode_wine_short'),
    ingredients_dishes: t('memory_game.mode_ingredients_short'),
    cocktail_ingredients: t('memory_game.mode_cocktails_short'),
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return null;
    }
  };

  const renderEntry = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const rank = index + 1;
    const isCurrentUser = user?.id === item.user_id;
    const rankIcon = getRankIcon(rank);

    return (
      <View
        style={[
          styles.entryRow,
          { backgroundColor: isCurrentUser ? colors.primary + '10' : colors.card },
          isCurrentUser && { borderColor: colors.primary, borderWidth: 1 },
        ]}
      >
        {/* Rank */}
        <View style={styles.rankContainer}>
          {rankIcon ? (
            <Text style={styles.rankEmoji}>{rankIcon}</Text>
          ) : (
            <Text style={[styles.rankNumber, { color: colors.textSecondary }]}>
              {rank}
            </Text>
          )}
        </View>

        {/* Avatar */}
        {item.profile_picture_url ? (
          <Image source={{ uri: item.profile_picture_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '30' }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}

        {/* Name + Games Played */}
        <View style={styles.nameContainer}>
          <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
            {isCurrentUser ? ` (${t('memory_game.you')})` : ''}
          </Text>
          <Text style={[styles.gamesPlayed, { color: colors.textSecondary }]}>
            {item.games_played} {t('memory_game.games')}
          </Text>
        </View>

        {/* Best Score */}
        <Text style={[styles.bestScore, { color: colors.primary }]}>
          {item.best_score.toLocaleString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('memory_game.leaderboard_title')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Play Mode Toggle */}
      <View style={[styles.playModeToggle, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {playModes.map(pm => (
          <TouchableOpacity
            key={pm.key}
            style={[
              styles.playModeTab,
              activePlayMode === pm.key && { backgroundColor: colors.primary, borderRadius: 8 },
            ]}
            onPress={() => setActivePlayMode(pm.key)}
          >
            <Text
              style={[
                styles.playModeTabText,
                { color: colors.textSecondary },
                activePlayMode === pm.key && { color: '#fff', fontWeight: '700' },
              ]}
            >
              {pm.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Game Mode Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {modes.map(m => (
          <TouchableOpacity
            key={m}
            style={[
              styles.tab,
              activeMode === m && { backgroundColor: colors.primary + '20', borderRadius: 8 },
            ]}
            onPress={() => setActiveMode(m)}
          >
            <Text
              style={[
                styles.tabText,
                { color: colors.textSecondary },
                activeMode === m && { color: colors.primary, fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {modeLabels[m]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Leaderboard List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('memory_game.no_scores_yet')}
          </Text>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/memory-game-play?mode=${activeMode}&difficulty=1&play_mode=${activePlayMode}`)}
          >
            <Text style={styles.playButtonText}>
              {t('memory_game.be_first')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={item => item.user_id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  playModeToggle: {
    flexDirection: 'row',
    padding: 8,
    gap: 4,
    borderBottomWidth: 1,
  },
  playModeTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRadius: 8,
  },
  playModeTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 8,
    gap: 4,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  playButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
  },
  rankEmoji: {
    fontSize: 20,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  gamesPlayed: {
    fontSize: 11,
    marginTop: 2,
  },
  bestScore: {
    fontSize: 16,
    fontWeight: '800',
  },
});
