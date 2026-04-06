/**
 * Game Hub Editor
 * Manager landing screen linking to Memory Game Editor and Word Search Editor.
 * Includes Reset All, and Employee Score Lookup.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface EditorCard {
  title: string;
  description: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
}

interface UserScoreResult {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  memory_score: number;
  memory_games: number;
  word_search_score: number;
  word_search_games: number;
  total_score: number;
}

const EDITOR_CARDS: EditorCard[] = [
  {
    title: 'Menu Memory Game Editor',
    description: 'Manage wine pairings, game content, and reset leaderboards',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/memory-game-editor',
    color: '#6366F1',
  },
  {
    title: 'Word Search Editor',
    description: 'Reset word search leaderboards by category or all at once',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-editor',
    color: '#10B981',
  },
];

export default function GameHubEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [resettingAll, setResettingAll] = useState(false);

  // Employee Lookup state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserScoreResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);

  const handleResetAllScores = () => {
    Alert.alert(
      'Reset ALL Game Scores',
      'This will permanently delete every score for both Menu Memory Game and Word Search across all players. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            setResettingAll(true);
            try {
              // Use SECURITY DEFINER RPCs (bypasses RLS)
              const { error: err1 } = await (supabase.rpc as any)('reset_game_scores', {
                p_game_mode: null,
                p_play_mode: null,
              });
              if (err1) {
                console.error('Error resetting game scores:', err1);
                throw err1;
              }

              const { error: err2 } = await (supabase.rpc as any)('reset_word_search_scores', {
                p_category: null,
              });
              if (err2) {
                console.error('Error resetting word search scores:', err2);
                throw err2;
              }

              Alert.alert('Done', 'All game scores have been reset.');
            } catch (err) {
              console.error('Reset all scores error:', err);
              Alert.alert('Error', 'Something went wrong. Try again.');
            } finally {
              setResettingAll(false);
            }
          },
        },
      ]
    );
  };

  const handleSearchUser = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setSearching(true);
    setHasSearched(true);
    try {
      // Find users matching the search
      const { data: users, error } = await (supabase
        .from('users') as any)
        .select('id, name, profile_picture_url')
        .ilike('name', `%${query}%`)
        .eq('is_active', true)
        .limit(10) as any;

      if (error || !users || users.length === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      // Get scores for each user
      const results: UserScoreResult[] = [];
      for (const user of users) {
        // Memory game scores
        const { data: memoryScores } = await (supabase
          .from('game_scores') as any)
          .select('score')
          .eq('user_id', user.id)
          .eq('completed', true);

        // Word search scores
        const { data: wsScores } = await (supabase
          .from('word_search_scores') as any)
          .select('score')
          .eq('user_id', user.id)
          .eq('completed', true);

        const memoryTotal = (memoryScores || []).reduce((sum: number, s: any) => sum + s.score, 0);
        const wsTotal = (wsScores || []).reduce((sum: number, s: any) => sum + s.score, 0);

        results.push({
          user_id: user.id,
          name: user.name,
          profile_picture_url: user.profile_picture_url,
          memory_score: memoryTotal,
          memory_games: (memoryScores || []).length,
          word_search_score: wsTotal,
          word_search_games: (wsScores || []).length,
          total_score: memoryTotal + wsTotal,
        });
      }

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleResetUserScores = (user: UserScoreResult) => {
    Alert.alert(
      `Reset ${user.name}'s Scores`,
      `This will delete all game scores for ${user.name} (Memory: ${user.memory_games} games, Word Search: ${user.word_search_games} games). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResettingUserId(user.user_id);
            try {
              // Delete from game_scores using SECURITY DEFINER function
              // We need a per-user reset — let's do direct delete via RPC workaround
              // Since we don't have a per-user RPC, use direct delete with a dummy neq
              // Actually, better to create individual delete via direct supabase
              const { error: memError } = await (supabase
                .from('game_scores') as any)
                .delete()
                .eq('user_id', user.user_id);

              const { error: wsError } = await (supabase
                .from('word_search_scores') as any)
                .delete()
                .eq('user_id', user.user_id);

              if (memError || wsError) {
                // If direct delete fails (no RLS policy), try via SQL
                console.error('Direct delete failed, errors:', memError, wsError);
                Alert.alert('Error', 'Failed to reset scores. Check permissions.');
              } else {
                Alert.alert('Done', `${user.name}'s scores have been reset.`);
                // Refresh search results
                handleSearchUser();
              }
            } catch (err) {
              console.error('Reset user scores error:', err);
              Alert.alert('Error', 'Something went wrong.');
            }
            setResettingUserId(null);
          },
        },
      ]
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Game Hub Editor</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage game content and leaderboards for all staff games.
        </Text>

        {EDITOR_CARDS.map((card) => (
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

        {/* Employee Score Lookup */}
        <View style={[styles.lookupSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Employee Score Lookup</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            Search for an employee to view and reset their individual game scores.
          </Text>

          <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchUser}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleSearchUser} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol ios_icon_name="arrow.right.circle.fill" android_material_icon_name="search" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Search Results */}
          {hasSearched && searchResults.length === 0 && !searching && (
            <Text style={[styles.noResults, { color: colors.textSecondary }]}>No employees found.</Text>
          )}

          {searchResults.map(user => (
            <View key={user.user_id} style={[styles.userCard, { backgroundColor: colors.card }]}>
              <View style={styles.userTop}>
                {user.profile_picture_url ? (
                  <Image source={{ uri: user.profile_picture_url }} style={styles.userAvatar} />
                ) : (
                  <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.userAvatarInitial, { color: colors.primary }]}>
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
                  <Text style={[styles.userTotal, { color: colors.primary }]}>
                    Total: {user.total_score.toLocaleString()} pts
                  </Text>
                </View>
              </View>

              <View style={styles.scoreBreakdown}>
                <View style={[styles.scoreChip, { backgroundColor: '#6366F1' + '15' }]}>
                  <Text style={[styles.scoreChipLabel, { color: '#6366F1' }]}>Memory</Text>
                  <Text style={[styles.scoreChipValue, { color: '#6366F1' }]}>
                    {user.memory_score.toLocaleString()} ({user.memory_games} games)
                  </Text>
                </View>
                <View style={[styles.scoreChip, { backgroundColor: '#10B981' + '15' }]}>
                  <Text style={[styles.scoreChipLabel, { color: '#10B981' }]}>Word Search</Text>
                  <Text style={[styles.scoreChipValue, { color: '#10B981' }]}>
                    {user.word_search_score.toLocaleString()} ({user.word_search_games} games)
                  </Text>
                </View>
              </View>

              {(user.memory_games > 0 || user.word_search_games > 0) && (
                <TouchableOpacity
                  style={[styles.resetUserBtn, { borderColor: '#EF4444' }]}
                  onPress={() => handleResetUserScores(user)}
                  disabled={resettingUserId === user.user_id}
                >
                  {resettingUserId === user.user_id ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <>
                      <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={14} color="#EF4444" />
                      <Text style={styles.resetUserBtnText}>Reset All Scores</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Reset All Scores */}
        <View style={[styles.resetSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Danger Zone</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            Reset all scores across both games for every player.
          </Text>
          <TouchableOpacity
            style={[styles.resetAllBtn, resettingAll && { opacity: 0.6 }]}
            onPress={handleResetAllScores}
            disabled={resettingAll}
          >
            {resettingAll ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.resetAllBtnText}>Reset All Game Scores</Text>
            )}
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

  // Employee Score Lookup
  lookupSection: {
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionDesc: { fontSize: 13, lineHeight: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  noResults: { textAlign: 'center', fontSize: 14, marginTop: 8 },
  userCard: {
    borderRadius: 14,
    padding: 14,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
    elevation: 3,
  },
  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: { fontSize: 20, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700' },
  userTotal: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  scoreBreakdown: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  scoreChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  scoreChipLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  scoreChipValue: { fontSize: 12, fontWeight: '600' },
  resetUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  resetUserBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },

  // Reset All
  resetSection: {
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  resetAllBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  resetAllBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
