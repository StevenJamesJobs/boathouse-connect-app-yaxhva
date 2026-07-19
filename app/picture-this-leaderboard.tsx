/**
 * Picture This! Leaderboard
 * Top 20 by Picture This score, scoped by Play Mode (Lives/Timed) and Category.
 * Test users excluded server-side via get_picture_this_leaderboard_filtered.
 *
 * Note: per-game leaderboard pass notifications are intentionally NOT fired —
 * pass notifications only happen for the master overall leaderboard.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import BottomNavBar from '@/components/BottomNavBar';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { PictureThisCategory, PictureThisPlayMode } from '@/utils/game/pictureThisGenerator';

interface Entry {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  total_score: number;
  games_played: number;
}

interface CategoryTab {
  key: PictureThisCategory;
  labelKey: string;
  color: string;
}

const CATEGORY_TABS: CategoryTab[] = [
  { key: 'food',         labelKey: 'picture_this:leaderboard_food',    color: '#EF4444' },
  { key: 'libations',    labelKey: 'picture_this:leaderboard_drinks',  color: '#8B5CF6' },
  { key: 'wine',         labelKey: 'picture_this:leaderboard_wine',    color: '#A21CAF' },
  { key: 'menu_prices',  labelKey: 'picture_this:leaderboard_prices',  color: '#0891B2' },
];

const PLAY_MODES: { key: PictureThisPlayMode; labelKey: string }[] = [
  { key: 'lives', labelKey: 'picture_this:leaderboard_lives' },
  { key: 'timed', labelKey: 'picture_this:leaderboard_timed' },
];

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export default function PictureThisLeaderboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { t } = useTranslation();
  const { open: openMiniProfile } = useMiniProfile();

  const [activePlayMode, setActivePlayMode] = useState<PictureThisPlayMode>('lives');
  const [activeCategory, setActiveCategory] = useState<PictureThisCategory>('food');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!user?.id) { setLoading(false); return; }
        const { data, error } = await supabase.rpc(
          'get_picture_this_leaderboard_filtered_actor' as any,
          {
            p_category: activeCategory,
            p_play_mode: activePlayMode,
            p_limit: 20,
            p_actor_id: user.id,
          },
        );
        if (cancelled) return;
        if (!error && data) setEntries(data as Entry[]);
        else setEntries([]);
      } catch (err) {
        console.error('[PictureThis] leaderboard load error:', err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activePlayMode, activeCategory, user?.id]);

  const renderEntry = ({ item, index }: { item: Entry; index: number }) => {
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
        <View style={styles.rankBox}>
          {rank <= 3 ? (
            <Text style={styles.rankEmoji}>{RANK_EMOJIS[rank - 1]}</Text>
          ) : (
            <Text style={[styles.rankNumber, { color: colors.textSecondary }]}>{rank}</Text>
          )}
        </View>
        {item.profile_picture_url ? (
          <StorageImage source={{ uri: item.profile_picture_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.nameBox}>
          <Text style={[styles.name, { color: isMe ? colors.primary : colors.text }]} numberOfLines={1}>
            {item.name}{isMe ? ' (You)' : ''}
          </Text>
          <Text style={[styles.games, { color: colors.textSecondary }]}>
            {item.games_played} game{item.games_played !== 1 ? 's' : ''}
          </Text>
        </View>
        <Text style={[styles.score, { color: colors.primary }]}>
          {item.total_score.toLocaleString()}
        </Text>
      </TouchableOpacity>
    );
  };

  const activeCategoryLabel = t(CATEGORY_TABS.find(c => c.key === activeCategory)?.labelKey ?? '');
  const activeModeLabel = t(PLAY_MODES.find(m => m.key === activePlayMode)?.labelKey ?? '');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{t('picture_this:leaderboard_title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Play Mode toggle */}
      <View style={[styles.modeToggle, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {PLAY_MODES.map((pm) => {
          const active = pm.key === activePlayMode;
          return (
            <TouchableOpacity
              key={pm.key}
              style={[
                styles.modeTab,
                active && { backgroundColor: colors.primary, borderRadius: 10 },
              ]}
              onPress={() => setActivePlayMode(pm.key)}
            >
              <Text style={[
                styles.modeTabText,
                { color: active ? colors.fireText : colors.textSecondary },
                active && { fontWeight: '700' },
              ]}>
                {t(pm.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category tabs */}
      <View style={[styles.categoryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRowContent}
        >
          {CATEGORY_TABS.map((cat) => {
            const active = cat.key === activeCategory;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryTab,
                  active
                    ? { backgroundColor: cat.color, borderColor: cat.color }
                    : { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                onPress={() => setActiveCategory(cat.key)}
              >
                <Text style={[
                  styles.categoryTabText,
                  { color: active ? '#fff' : colors.textSecondary },
                  active && { fontWeight: '700' },
                ]}>
                  {t(cat.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {activeModeLabel} • {activeCategoryLabel}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>📸</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('picture_this:leaderboard_no_scores')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            {t('picture_this:leaderboard_be_first')} {activeCategoryLabel} • {activeModeLabel}
          </Text>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/picture-this-game')}
          >
            <Text style={[styles.playBtnText, { color: colors.fireText }]}>Play Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.user_id}
          renderItem={renderEntry}
          contentContainerStyle={styles.listContent}
        />
      )}

      <BottomNavBar activeTab="tools" />
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
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  modeToggle: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeTabText: { fontSize: 13, fontWeight: '600' },

  categoryRow: {
    borderBottomWidth: 1,
  },
  categoryRowContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 72,
    alignItems: 'center',
  },
  categoryTabText: { fontSize: 13, fontWeight: '600' },

  subtitleRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  subtitle: { fontSize: 13, fontStyle: 'italic' },
  listContent: { padding: 16, paddingBottom: 120, gap: 10 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    boxShadow: '0px 1px 4px rgba(0,0,0,0.1)',
    elevation: 2,
  },
  rankBox: { width: 30, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNumber: { fontSize: 16, fontWeight: '700' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  nameBox: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  games: { fontSize: 11, marginTop: 2 },
  score: { fontSize: 18, fontWeight: '800' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  playBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
