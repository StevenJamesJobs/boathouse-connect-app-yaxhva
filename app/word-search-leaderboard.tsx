/**
 * Word Search Leaderboard
 * Top 20 per category, 5 swipeable tabs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import {
  WORD_SEARCH_CATEGORIES,
  WORD_SEARCH_CATEGORY_INFO,
  WordSearchCategory,
  WordSearchLeaderboardEntry,
} from '@/types/game';

const SCREEN_WIDTH = Dimensions.get('window').width;
const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

const CATEGORY_LABELS: Record<WordSearchCategory, string> = {
  weekly_specials: 'Weekly\nSpecials',
  lunch: 'Lunch',
  dinner: 'Dinner',
  happy_hour: 'Happy\nHour',
  libations: 'Libations',
};

export default function WordSearchLeaderboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const pagerRef = useRef<FlatList>(null);

  const [activeCategory, setActiveCategory] = useState<WordSearchCategory>('weekly_specials');
  const [boards, setBoards] = useState<Record<string, WordSearchLeaderboardEntry[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const fetchLeaderboard = useCallback(async (cat: WordSearchCategory) => {
    if (boards[cat]) return; // already loaded
    setLoading((prev) => ({ ...prev, [cat]: true }));
    const { data, error } = await supabase.rpc('get_word_search_leaderboard', {
      p_category: cat,
      p_limit: 20,
    });
    setLoading((prev) => ({ ...prev, [cat]: false }));
    if (!error && data) {
      setBoards((prev) => ({ ...prev, [cat]: data as WordSearchLeaderboardEntry[] }));
    } else {
      setBoards((prev) => ({ ...prev, [cat]: [] }));
    }
  }, [boards]);

  useEffect(() => {
    fetchLeaderboard('weekly_specials');
  }, []);

  const handleTabPress = (cat: WordSearchCategory) => {
    setActiveCategory(cat);
    const index = WORD_SEARCH_CATEGORIES.indexOf(cat);
    pagerRef.current?.scrollToIndex({ index, animated: true });
    fetchLeaderboard(cat);
  };

  const handleSwipe = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const cat = WORD_SEARCH_CATEGORIES[idx];
    if (cat && cat !== activeCategory) {
      setActiveCategory(cat);
      fetchLeaderboard(cat);
    }
  };

  const renderEntry = ({ item, index }: { item: WordSearchLeaderboardEntry; index: number }) => {
    const isMe = item.user_id === user?.id;
    const rank = index + 1;
    return (
      <View
        style={[
          styles.entry,
          { backgroundColor: isMe ? colors.primary + '15' : colors.card },
          isMe && { borderColor: colors.primary, borderWidth: 1.5 },
        ]}
      >
        <Text style={styles.rank}>
          {rank <= 3 ? RANK_EMOJIS[rank - 1] : `${rank}.`}
        </Text>
        {item.profile_picture_url ? (
          <Image source={{ uri: item.profile_picture_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {item.name?.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={styles.entryText}>
          <Text style={[styles.entryName, { color: isMe ? colors.primary : colors.text }]} numberOfLines={1}>
            {item.name} {isMe ? '(You)' : ''}
          </Text>
          <Text style={[styles.entryGames, { color: colors.textSecondary }]}>
            {item.games_played} puzzle{item.games_played !== 1 ? 's' : ''} completed
          </Text>
        </View>
        <Text style={[styles.entryScore, { color: colors.primary }]}>{item.best_score}</Text>
      </View>
    );
  };

  const renderPage = useCallback(
    ({ item: cat }: { item: WordSearchCategory }) => {
      const entries = boards[cat] ?? [];
      const isLoading = loading[cat];
      return (
        <View style={{ width: SCREEN_WIDTH }}>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No scores yet!</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                Be the first to complete a {cat.replace(/_/g, ' ')} puzzle.
              </Text>
              <TouchableOpacity
                style={[styles.beFirstBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/word-search-game')}
              >
                <Text style={styles.beFirstBtnText}>Play Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(e) => e.user_id}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      );
    },
    [boards, loading, colors]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>🏆 Word Search Scores</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category Tab Selector */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <FlatList
          data={WORD_SEARCH_CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.tabContent}
          renderItem={({ item: cat }) => {
            const info = WORD_SEARCH_CATEGORY_INFO[cat];
            const isActive = cat === activeCategory;
            return (
              <TouchableOpacity
                style={[
                  styles.tab,
                  isActive && { backgroundColor: colors.primary + '18', borderColor: colors.primary },
                  !isActive && { borderColor: 'transparent' },
                ]}
                onPress={() => handleTabPress(cat)}
              >
                <IconSymbol
                  ios_icon_name={info.icon.ios as any}
                  android_material_icon_name={info.icon.android as any}
                  size={14}
                  color={isActive ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? colors.primary : colors.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Pager */}
      <FlatList
        ref={pagerRef}
        data={WORD_SEARCH_CATEGORIES}
        keyExtractor={(c) => c}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleSwipe}
        getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        style={{ flex: 1 }}
      />
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
  tabBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  tabContent: { paddingHorizontal: 12, gap: 6 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    minWidth: 70,
  },
  tabText: { fontSize: 11, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  listContent: { padding: 16, gap: 10, paddingBottom: 40 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    boxShadow: '0px 1px 4px rgba(0,0,0,0.1)',
    elevation: 2,
  },
  rank: { fontSize: 16, width: 28, textAlign: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  entryText: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '700' },
  entryGames: { fontSize: 12, marginTop: 2 },
  entryScore: { fontSize: 18, fontWeight: '800' },
  loadingBox: { padding: 40, alignItems: 'center' },
  emptyBox: { padding: 40, alignItems: 'center', gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  beFirstBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  beFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
