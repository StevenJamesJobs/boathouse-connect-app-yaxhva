/**
 * Game Hub
 * Player-facing hub screen with cards for Memory Game, Word Search,
 * and a Leaderboard preview showing the top 3 overall leaders.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useFocusEffect } from '@react-navigation/native';

interface GameCard {
  title: string;
  description: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
}

interface LeaderboardEntry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  total_score: number;
  games_played: number;
}

const GAME_CARDS: GameCard[] = [
  {
    title: 'Menu Memory Game',
    description: 'Match wine pairings, ingredients & dishes, and cocktails across multiple difficulty levels',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/menu-memory-game',
    color: '#6366F1',
  },
  {
    title: 'Word Search',
    description: 'Find hidden menu items, ingredients, and specials in word search puzzles',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-game',
    color: '#10B981',
  },
];

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export default function GameHubScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [topLeaders, setTopLeaders] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchTopLeaders = async () => {
        setLoadingLeaders(true);
        try {
          const { data, error } = await (supabase.rpc as any)('get_master_leaderboard_overall', {
            p_limit: 3,
          });
          if (!error && data) {
            setTopLeaders(data as LeaderboardEntry[]);
          }
        } catch (err) {
          console.error('Error fetching top leaders:', err);
        }
        setLoadingLeaders(false);
      };
      fetchTopLeaders();
    }, [])
  );

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Game Hub</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Test your knowledge of the menu with fun, interactive games.
        </Text>

        {GAME_CARDS.map((card) => (
          <TouchableOpacity
            key={card.route}
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() => router.push(card.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.iconContainer, { backgroundColor: card.color + '18' }]}>
              <IconSymbol
                ios_icon_name={card.iosIcon as any}
                android_material_icon_name={card.androidIcon as any}
                size={30}
                color={card.color}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{card.description}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        {/* Leaderboard Card with Top 3 Preview */}
        <View style={[styles.leaderboardCard, { backgroundColor: colors.card }]}>
          <View style={styles.leaderboardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: '#F59E0B18' }]}>
              <Text style={styles.trophyIcon}>🏆</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Leaderboard</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>Top players across all games</Text>
            </View>
          </View>

          {/* Top 3 Preview */}
          {loadingLeaders ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : topLeaders.length > 0 ? (
            <View style={styles.top3Container}>
              {topLeaders.map((leader, index) => (
                <View key={leader.user_id} style={[styles.leaderRow, { borderTopColor: colors.border }]}>
                  <Text style={styles.rankMedal}>{RANK_MEDALS[index]}</Text>
                  {leader.profile_picture_url ? (
                    <Image source={{ uri: leader.profile_picture_url }} style={styles.leaderAvatar} />
                  ) : (
                    <View style={[styles.leaderAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.leaderInitial, { color: colors.primary }]}>
                        {leader.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.leaderName, { color: colors.text }]} numberOfLines={1}>
                    {leader.name}
                  </Text>
                  <Text style={[styles.leaderScore, { color: colors.primary }]}>
                    {leader.total_score.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.noScoresText, { color: colors.textSecondary }]}>
              No scores yet — be the first!
            </Text>
          )}

          {/* View Full Leaderboard Button */}
          <TouchableOpacity
            style={[styles.viewAllBtn, { backgroundColor: '#F59E0B15' }]}
            onPress={() => router.push('/master-leaderboard')}
            activeOpacity={0.7}
          >
            <Text style={[styles.viewAllText, { color: '#F59E0B' }]}>View Full Leaderboard</Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color="#F59E0B" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  trophyIcon: { fontSize: 28 },

  // Leaderboard card
  leaderboardCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  leaderboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  top3Container: {
    marginTop: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  rankMedal: { fontSize: 20, width: 28, textAlign: 'center' },
  leaderAvatar: { width: 36, height: 36, borderRadius: 18 },
  leaderAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderInitial: { fontSize: 16, fontWeight: 'bold' },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '600' },
  leaderScore: { fontSize: 15, fontWeight: '800' },
  noScoresText: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    marginVertical: 12,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  viewAllText: { fontSize: 14, fontWeight: '700' },
});
