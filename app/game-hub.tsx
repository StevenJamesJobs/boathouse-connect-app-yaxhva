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
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import HeaderNavButton from '@/components/HeaderNavButton';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { MessageBadge } from '@/components/MessageBadge';
import { hexToRgba } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '../contexts/OrganizationContext';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface GameCard {
  titleKey: string;
  descKey: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
  isPremium?: boolean;
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
    titleKey: 'game_hub_cards:memory_title',
    descKey: 'game_hub_cards:memory_desc',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/menu-memory-game',
    color: '#6366F1',
    isPremium: true,
  },
  {
    titleKey: 'game_hub_cards:word_search_title',
    descKey: 'game_hub_cards:word_search_desc',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-game',
    color: '#10B981',
  },
  {
    titleKey: 'game_hub_cards:picture_this_title',
    descKey: 'game_hub_cards:picture_this_desc',
    iosIcon: 'photo.fill',
    androidIcon: 'photo-camera',
    route: '/picture-this-game',
    color: '#EC4899',
    isPremium: true,
  },
];

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

interface NavTab {
  route: string;
  labelKey: string;
  iosIcon: string;
  androidIcon: string;
}

const EMPLOYEE_NAV_TABS: NavTab[] = [
  { route: '/(portal)/employee', labelKey: 'tabs.welcome', iosIcon: 'house.fill', androidIcon: 'home' },
  { route: '/(portal)/employee/menus', labelKey: 'tabs.menus', iosIcon: 'fork.knife', androidIcon: 'restaurant' },
  { route: '/(portal)/employee/tools', labelKey: 'tabs.tools', iosIcon: 'wrench.and.screwdriver.fill', androidIcon: 'build' },
  { route: '/(portal)/employee/rewards', labelKey: 'tabs.rewards', iosIcon: 'star.fill', androidIcon: 'star' },
  { route: '/(portal)/employee/profile', labelKey: 'tabs.profile', iosIcon: 'person.fill', androidIcon: 'person' },
];

const MANAGER_NAV_TABS: NavTab[] = [
  { route: '/(portal)/manager', labelKey: 'tabs.welcome', iosIcon: 'house.fill', androidIcon: 'home' },
  { route: '/(portal)/manager/menus', labelKey: 'tabs.menus', iosIcon: 'fork.knife', androidIcon: 'restaurant' },
  { route: '/(portal)/manager/tools', labelKey: 'tabs.tools', iosIcon: 'wrench.and.screwdriver.fill', androidIcon: 'build' },
  { route: '/(portal)/manager/manage', labelKey: 'tabs.manage', iosIcon: 'slider.horizontal.3', androidIcon: 'tune' },
  { route: '/(portal)/manager/profile', labelKey: 'tabs.profile', iosIcon: 'person.fill', androidIcon: 'person' },
];

function GameHubBottomNav() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { mode } = useAppTheme();

  const tabs = (user?.role === 'manager' || user?.role === 'owner') ? MANAGER_NAV_TABS : EMPLOYEE_NAV_TABS;

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, 0.6),
    android: hexToRgba(colors.tabBarBackground, 0.9),
    web: hexToRgba(colors.tabBarBackground, 0.85),
  });

  return (
    <View style={navStyles.container}>
      <BlurView
        intensity={80}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[navStyles.blur, { backgroundColor: blurBgColor }]}
      >
        <View style={navStyles.row}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.route}
              style={navStyles.tabBtn}
              onPress={() => router.replace(tab.route as any)}
            >
              <IconSymbol
                ios_icon_name={tab.iosIcon as any}
                android_material_icon_name={tab.androidIcon as any}
                size={24}
                color={colors.tabBarInactive}
              />
              <Text style={[navStyles.label, { color: colors.tabBarInactive }]} numberOfLines={1}>
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </BlurView>
    </View>
  );
}

const navStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  blur: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.2), 0px 4px 16px rgba(0, 0, 0, 0.15)',
    elevation: 20,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },
});

export default function GameHubScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unreadCount: unreadLeaderboardCount } = useUnreadLeaderboardPasses();
  const { organizationId } = useOrganization();
  const { hasPremium } = useSubscription();
  const [topLeaders, setTopLeaders] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchTopLeaders = async () => {
        setLoadingLeaders(true);
        try {
          const { data, error } = await supabase.rpc('get_master_leaderboard_overall', {
            p_limit: 3,
            p_organization_id: organizationId,
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
        <Text style={[styles.headerTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>{t('game_hub_ui:title')}</Text>
        {isManagerOrOwner(user) ? (
          <HeaderNavButton label={t('common:to_editor')} iconIos="pencil" iconAndroid="edit" onPress={() => router.replace('/game-hub-editor')} />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('game_hub_ui:subtitle')}
        </Text>

        {GAME_CARDS.map((card) => {
          const isLocked = card.isPremium && !hasPremium;
          return (
            <TouchableOpacity
              key={card.route}
              style={[styles.card, { backgroundColor: colors.card }, isLocked && { opacity: 0.7 }]}
              onPress={() => {
                if (isLocked) {
                  Alert.alert(
                    'Premium Feature',
                    `${t(card.titleKey)} requires the Premium plan ($15/mo).`,
                    [
                      { text: 'Not Now', style: 'cancel' },
                      { text: 'Upgrade', onPress: () => router.push('/subscription-management' as any) },
                    ]
                  );
                  return;
                }
                router.push(card.route as any);
              }}
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
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t(card.titleKey)}</Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(card.descKey)}</Text>
              </View>
              {isLocked ? (
                <IconSymbol
                  ios_icon_name="lock.fill"
                  android_material_icon_name="lock"
                  size={16}
                  color={colors.textSecondary}
                />
              ) : (
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={18}
                  color={colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {/* Leaderboard Card with Top 3 Preview */}
        <View style={[styles.leaderboardCard, { backgroundColor: colors.card }]}>
          <View style={styles.leaderboardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: '#F59E0B18' }]}>
              <Text style={styles.trophyIcon}>🏆</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('game_hub_ui:leaderboard_title')}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t('game_hub_ui:leaderboard_subtitle')}</Text>
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
              {t('game_hub_ui:no_scores')}
            </Text>
          )}

          {/* View Full Leaderboard Button */}
          <TouchableOpacity
            style={[styles.viewAllBtn, { backgroundColor: '#F59E0B15' }]}
            onPress={() => router.push('/master-leaderboard')}
            activeOpacity={0.7}
          >
            <Text style={[styles.viewAllText, { color: '#F59E0B' }]}>{t('game_hub_ui:view_full_leaderboard')}</Text>
            {unreadLeaderboardCount > 0 && (
              <View style={{ marginLeft: 4 }}>
                <MessageBadge count={unreadLeaderboardCount} size="small" />
              </View>
            )}
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color="#F59E0B" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <GameHubBottomNav />
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
