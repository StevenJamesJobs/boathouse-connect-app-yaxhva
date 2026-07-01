
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useRouter, useFocusEffect } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { useRedemptionSettings } from '@/hooks/useRedemptionSettings';
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import ExamRewardBlurb from '@/components/ExamRewardBlurb';
import { useUnreadAwards } from '@/hooks/useUnreadAwards';

interface Employee {
  id: string;
  name: string;
  job_title: string;
  mcloones_bucks: number;
}

interface RewardTransaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  is_visible: boolean;
  created_at: string;
  user_name?: string;
  isDenied?: boolean;
}

interface GuestReview {
  id: string;
  guest_name: string;
  rating: number;
  review_text: string;
  review_date: string;
}

interface GoogleReview {
  id: string;
  author_title: string;
  author_image: string | null;
  review_rating: number;
  review_text: string | null;
  review_text_es: string | null;
  review_datetime_utc: string;
  owner_answer: string | null;
  owner_answer_es: string | null;
}

type ReviewItem =
  | (GuestReview & { source: 'manual' })
  | (GoogleReview & { source: 'google' });

type MainTab = 'rewards' | 'reviews';
type RewardsSubTab = 'leaderboard' | 'recent';

export default function EmployeeRewardsScreen() {
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();
  const { settings: redemptionSettings } = useRedemptionSettings();
  const insets = useSafeAreaInsets();
  const currencyName = organization.reward_currency_name;
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const router = useRouter();
  const { hasNew: awardsHasNew, markRecentViewed } = useUnreadAwards();
  const [activeTab, setActiveTab] = useState<MainTab>('rewards');
  const [rewardsSubTab, setRewardsSubTab] = useState<RewardsSubTab>('leaderboard');
  const [loading, setLoading] = useState(true);
  const subTabPagerRef = useRef<FlatList>(null);
  const SUB_PAGES: RewardsSubTab[] = ['leaderboard', 'recent'];
  // The pager prepends an invisible "Tools" bridge page at index 0: swiping RIGHT
  // past Leaderboard lands on it and navigates to the Tools tab (a smooth, native
  // way to go "back" to Tools — which sits left of Rewards in the nav) while the
  // Leaderboard↔Recent swipe stays intact. Real sub-tabs live at indices 1+.
  const TOOLS_BRIDGE = '__tools_bridge__';
  const PAGER_PAGES: string[] = [TOOLS_BRIDGE, ...SUB_PAGES];
  const pageIndexOf = (tab: RewardsSubTab) => PAGER_PAGES.indexOf(tab);

  const goToSubTab = (tab: RewardsSubTab) => {
    subTabPagerRef.current?.scrollToIndex({ index: pageIndexOf(tab), animated: true });
    setRewardsSubTab(tab);
    if (tab === 'recent') markRecentViewed();
  };

  const handleSubTabScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx === 0) {
      // Landed on the Tools bridge → snap back (so returning shows the last
      // sub-tab, not the empty page) and navigate to the Tools tab.
      subTabPagerRef.current?.scrollToIndex({ index: pageIndexOf(rewardsSubTab), animated: false });
      router.replace('/(portal)/employee/tools' as any);
      return;
    }
    const next = PAGER_PAGES[idx] as RewardsSubTab;
    if (next && next !== rewardsSubTab) {
      setRewardsSubTab(next);
      if (next === 'recent') markRecentViewed();
    }
  };

  // Rewards state
  const [myBucks, setMyBucks] = useState(0);
  const [topEmployees, setTopEmployees] = useState<Employee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RewardTransaction[]>([]);

  // Reviews state
  const [reviews, setReviews] = useState<GuestReview[]>([]);
  const [googleReviews, setGoogleReviews] = useState<GoogleReview[]>([]);

  // Aggregate Google rating for the Reviews tile (mirrors the manager page).
  const ratingCount = googleReviews.length;
  const ratingAvg = ratingCount ? googleReviews.reduce((s, r) => s + (r.review_rating || 0), 0) / ratingCount : 0;

  const fetchRewardsData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch current user's bucks
      if (user?.id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('mcloones_bucks')
          .eq('id', user.id)
          .single();

        if (!userError && userData) {
          setMyBucks(userData.mcloones_bucks || 0);
        }
      }

      // Fetch top 10 employees
      const { data: topData, error: topError } = await supabase
        .from('users')
        .select('id, name, job_title, mcloones_bucks')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('mcloones_bucks', { ascending: false })
        .limit(10);

      if (!topError && topData) {
        setTopEmployees(topData);
      }

      // Fetch last 10 transactions (filter visible on client, show 5)
      const { data: transData, error: transError } = await supabase
        .from('rewards_transactions')
        .select('id, user_id, amount, description, is_visible, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(15);

      if (transError) {
        console.error('Error fetching transactions:', transError);
        return;
      }

      // Visible transactions (shared across all employees)
      const visibleTransactions = ((transData as any[]) || []).filter((t: any) => t.is_visible === true);

      // Denied redemption requests for the current user only — surface in their
      // own Recent Awards as a "denied" entry (no balance change).
      let deniedEntries: RewardTransaction[] = [];
      if (user?.id) {
        const { data: deniedRows } = await (supabase
          .from('redemption_requests' as any) as any)
          .select('id, user_id, bucks_amount, request_type, item_name_snapshot, decided_at, decision_reason')
          .eq('user_id', user.id)
          .eq('status', 'denied')
          .order('decided_at', { ascending: false })
          .limit(10);
        deniedEntries = ((deniedRows as any[]) || []).map((r) => ({
          id: `denied_${r.id}`,
          user_id: r.user_id,
          amount: -r.bucks_amount,
          description:
            r.request_type === 'food_beverage'
              ? `Denied: ${r.item_name_snapshot || 'Menu item'}${r.decision_reason ? ` — ${r.decision_reason}` : ''}`
              : `Denied: ${r.request_type.replace(/_/g, ' ')}${r.decision_reason ? ` — ${r.decision_reason}` : ''}`,
          is_visible: true,
          created_at: r.decided_at,
          isDenied: true,
        }));
      }

      const userIds = [...new Set(visibleTransactions.map((t: any) => t.user_id))];
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: usersData } = await (supabase
          .from('users') as any)
          .select('id, name')
          .in('id', userIds);
        if (usersData) userMap = new Map((usersData as any[]).map((u: any) => [u.id, u.name]));
      }

      const decoratedTx: RewardTransaction[] = visibleTransactions.map((trans: any) => ({
        ...trans,
        user_name: userMap.get(trans.user_id) || 'Unknown Employee',
      }));

      const merged = [...decoratedTx, ...deniedEntries]
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 8);
      setRecentTransactions(merged);
    } catch (error) {
      console.error('Error fetching rewards data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('guest_reviews')
        .select('id, guest_name, rating, review_text, review_date')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('review_date', { ascending: false });

      if (!error && data) {
        setReviews(data);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  }, []);

  const fetchGoogleReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('id, author_title, author_image, review_rating, review_text, review_text_es, review_datetime_utc, owner_answer, owner_answer_es')
        .eq('organization_id', organizationId)
        .eq('is_published', true)
        .order('review_datetime_utc', { ascending: false });

      if (!error && data) {
        setGoogleReviews(data as GoogleReview[]);
      }
    } catch (error) {
      console.error('Error fetching Google reviews:', error);
    }
  }, []);

  const allReviews: ReviewItem[] = React.useMemo(() => {
    const manual: ReviewItem[] = reviews.map((r) => ({ ...r, source: 'manual' as const }));
    const google: ReviewItem[] = googleReviews.map((r) => ({ ...r, source: 'google' as const }));
    return [...manual, ...google].sort((a, b) => {
      const dateA = a.source === 'manual' ? a.review_date : a.review_datetime_utc;
      const dateB = b.source === 'manual' ? b.review_date : b.review_datetime_utc;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [reviews, googleReviews]);

  useEffect(() => {
    fetchRewardsData();
    fetchReviews();
    fetchGoogleReviews();
  }, [fetchRewardsData, fetchReviews, fetchGoogleReviews]);

  // Refetch the bucks balance + leaderboard on focus so an approved/denied
  // redemption reflects right away when the employee returns to this tab.
  useFocusEffect(
    useCallback(() => {
      fetchRewardsData();
    }, [fetchRewardsData])
  );

  const getRankColor = (index: number) => {
    if (index === 0) return '#FFD700'; // Gold
    if (index === 1) return '#C0C0C0'; // Silver
    if (index === 2) return '#CD7F32'; // Bronze
    return colors.primary;
  };

  const renderStars = (rating: number, size = 12) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <IconSymbol
            key={star}
            ios_icon_name={star <= rating ? 'star.fill' : 'star'}
            android_material_icon_name={star <= rating ? 'star' : 'star-border'}
            size={size}
            color={star <= rating ? '#FFD45E' : colors.textSecondary}
          />
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    // Transparent — the employee tab _layout renders the ambient glow behind the
    // status-bar spacer so it reads edge-to-edge (no solid strip up top).
    <View style={styles.container}>
      {/* Compact glass header (mirrors the manager Rewards page). The employee
          tab _layout already renders an insets.top spacer, so only a small top
          pad here (otherwise the title is double-inset). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, zIndex: 5 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display.bold, fontSize: 19, color: colors.text, letterSpacing: -0.3 }}>{t('rewards_reviews_editor:title', 'Rewards & Reviews')}</Text>
          <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.tint, marginTop: 2 }}>
            {activeTab === 'rewards' ? t('rewards_reviews_editor:tab_rewards', 'Rewards') : t('rewards_reviews_editor:tab_reviews', 'Reviews')}
          </Text>
        </View>
      </View>

      {/* Nav tiles replace the old tabs */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 9, paddingHorizontal: 16, zIndex: 2 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => setActiveTab('rewards')}
          style={{ flex: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: activeTab === 'rewards' ? colors.tint + '5C' : colors.surfaceBorder, backgroundColor: activeTab === 'rewards' ? colors.tint + '1C' : colors.surface, padding: 13, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="paid" size={13} color={activeTab === 'rewards' ? colors.tint : colors.textSecondary} />
            <Text style={{ fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: activeTab === 'rewards' ? colors.tint : colors.textSecondary }} numberOfLines={1}>
              {t('rewards_reviews_editor:my_bucks_label', { currencyName, defaultValue: `My ${currencyName}` })}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 26, letterSpacing: -1, color: activeTab === 'rewards' ? colors.tint : colors.text, marginTop: 8 }}>${myBucks}</Text>
          {redemptionSettings.redemptions_enabled ? (
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: 10, backgroundColor: colors.primary, marginTop: 10 }} onPress={() => router.push('/redeem' as any)}>
              <IconSymbol ios_icon_name="gift.fill" android_material_icon_name="card-giftcard" size={14} color={colors.fireText} />
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 11.5, color: colors.fireText }}>{t('rewards_ui:redeem')}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontFamily: fonts.mono.medium, fontSize: 9, color: colors.textSecondary, marginTop: 6 }}>{t('rewards_reviews_editor:your_balance', 'Your balance')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.85} onPress={() => setActiveTab('reviews')}
          style={{ flex: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: activeTab === 'reviews' ? colors.tint + '5C' : colors.surfaceBorder, backgroundColor: activeTab === 'reviews' ? colors.tint + '1C' : colors.surface, padding: 13, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={13} color={activeTab === 'reviews' ? colors.tint : colors.textSecondary} />
            <Text style={{ fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: activeTab === 'reviews' ? colors.tint : colors.textSecondary }} numberOfLines={1}>
              {t('rewards_reviews_editor:tab_reviews', 'Reviews')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 26, letterSpacing: -1, color: activeTab === 'reviews' ? colors.tint : colors.text }}>{ratingCount ? ratingAvg.toFixed(1) : '—'}</Text>
            {ratingCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD45E26', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFD45E52', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color="#FFD45E" />
                <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.4, textTransform: 'uppercase', color: '#E0A23C' }}>{t('rewards_reviews_editor:rating', 'Rating')}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: fonts.mono.medium, fontSize: 9, color: colors.textSecondary, marginTop: 6 }}>{t('rewards_reviews_editor:n_google_reviews', { count: ratingCount, defaultValue: `${ratingCount} Google reviews` })}</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'rewards' ? (
        <View style={{ flex: 1 }}>
          {/* Static header — Exam blurb, Bucks card, Sub-Tab Selector */}
          <View style={styles.subTabHeader}>
            <ExamRewardBlurb />

            <View style={[styles.subTabContainer, { backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }]}>
              <TouchableOpacity
                style={[styles.subTab, rewardsSubTab === 'leaderboard' && [styles.subTabActive, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]]}
                onPress={() => goToSubTab('leaderboard')}
              >
                <IconSymbol
                  ios_icon_name="trophy.fill"
                  android_material_icon_name="emoji-events"
                  size={14}
                  color={rewardsSubTab === 'leaderboard' ? colors.text : colors.textSecondary}
                />
                <Text style={[
                  styles.subTabText,
                  { color: rewardsSubTab === 'leaderboard' ? colors.text : colors.textSecondary },
                ]} numberOfLines={1}>
                  {t('rewards_ui:tab_leaderboard')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTab, rewardsSubTab === 'recent' && [styles.subTabActive, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]]}
                onPress={() => goToSubTab('recent')}
              >
                <View style={{ position: 'relative' }}>
                  <IconSymbol
                    ios_icon_name="clock.fill"
                    android_material_icon_name="history"
                    size={14}
                    color={rewardsSubTab === 'recent' ? colors.text : colors.textSecondary}
                  />
                  {awardsHasNew && rewardsSubTab !== 'recent' ? (
                    <View style={styles.subTabDot} />
                  ) : null}
                </View>
                <Text style={[
                  styles.subTabText,
                  { color: rewardsSubTab === 'recent' ? colors.text : colors.textSecondary },
                ]} numberOfLines={1}>
                  {t('rewards_ui:tab_recent')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Horizontal pager — swipes between the Tools bridge (index 0) /
              Leaderboard / Recent */}
          <FlatList
            ref={subTabPagerRef}
            data={PAGER_PAGES}
            keyExtractor={(item) => item}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleSubTabScroll}
            bounces={false}
            initialScrollIndex={pageIndexOf(rewardsSubTab)}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item }) => (
              item === TOOLS_BRIDGE ? (
                <View style={{ width: SCREEN_WIDTH }} />
              ) : (
              <ScrollView
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {item === 'leaderboard' ? (
                  <View style={styles.section}>
                    {topEmployees.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <IconSymbol ios_icon_name="trophy" android_material_icon_name="emoji-events" size={48} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No leaderboard data yet</Text>
                      </View>
                    ) : (
                      topEmployees.map((emp, index) => {
                        const isCurrentUser = emp.id === user?.id;
                        return (
                          <TouchableOpacity
                            key={emp.id}
                            onPress={() => openMiniProfile(emp.id)}
                            activeOpacity={0.75}
                            style={[
                              styles.leaderboardItem,
                              { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceBorder },
                              isCurrentUser && { borderWidth: 1.5, borderColor: colors.tint },
                            ]}
                          >
                            <View style={[
                              styles.leaderboardRank,
                              index < 3
                                ? { backgroundColor: getRankColor(index) }
                                : { backgroundColor: colors.tint + '29', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.tint + '47' },
                            ]}>
                              <Text style={[styles.leaderboardRankText, index >= 3 && { color: colors.tint }]}>{index + 1}</Text>
                            </View>
                            <View style={styles.leaderboardInfo}>
                              <Text style={[styles.leaderboardName, { color: colors.text }]} numberOfLines={1}>
                                {emp.name}{isCurrentUser ? ' (You)' : ''}
                              </Text>
                              <Text style={[styles.leaderboardJob, { color: colors.textSecondary }]} numberOfLines={1}>{emp.job_title}</Text>
                            </View>
                            <Text style={[styles.leaderboardBucks, { color: colors.tint }]}>${(emp.mcloones_bucks || 0).toLocaleString()}</Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                ) : (
                  <View style={styles.section}>
                    {recentTransactions.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <IconSymbol ios_icon_name="clock" android_material_icon_name="history" size={48} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recent awards yet</Text>
                      </View>
                    ) : (
                      recentTransactions.map((trans, index) => {
                        const denied = trans.isDenied;
                        return (
                          <View key={trans.id || index} style={[styles.transactionItem, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceBorder }]}>
                            <View style={[
                              styles.transactionIcon,
                              { backgroundColor: denied ? '#FFEBEE' : trans.amount > 0 ? '#E8F5E9' : '#FFEBEE' },
                            ]}>
                              <IconSymbol
                                ios_icon_name={denied ? 'xmark.circle.fill' : trans.amount > 0 ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'}
                                android_material_icon_name={denied ? 'cancel' : trans.amount > 0 ? 'arrow-upward' : 'arrow-downward'}
                                size={20}
                                color={denied ? '#F44336' : trans.amount > 0 ? '#4CAF50' : '#F44336'}
                              />
                            </View>
                            <View style={styles.transactionInfo}>
                              <Text style={[styles.transactionEmployee, { color: colors.text }]}>
                                {denied ? 'You' : trans.user_name || 'Unknown Employee'}
                              </Text>
                              <Text style={[styles.transactionDescription, { color: colors.textSecondary }]}>{trans.description}</Text>
                              <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                                {new Date(trans.created_at).toLocaleDateString()}
                              </Text>
                            </View>
                            {denied ? (
                              <View style={styles.deniedPill}>
                                <Text style={styles.deniedPillText}>DENIED</Text>
                              </View>
                            ) : (
                              <Text
                                style={[
                                  styles.transactionAmount,
                                  trans.amount > 0 ? styles.positiveAmount : styles.negativeAmount,
                                ]}
                              >
                                {trans.amount > 0 ? '+' : ''}${trans.amount}
                              </Text>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </ScrollView>
              )
            )}
          />
        </View>
      ) : (
        <ScrollView style={[styles.scrollView, { marginTop: 10 }]} contentContainerStyle={styles.contentContainer}>
          <View style={styles.section}>
            {allReviews.length === 0 ? (
              <View style={styles.placeholderContainer}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="rate-review"
                  size={64}
                  color={colors.primary}
                />
                <Text style={[styles.placeholderTitle, { color: colors.text }]}>No Reviews Yet</Text>
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  Guest reviews will appear here once they are added by management.
                </Text>
              </View>
            ) : (
              allReviews.map((review, index) => (
                <GlassCard key={review.id || index} variant="surface" radius={16} style={styles.reviewCard}>
                  {review.source === 'google' ? (
                    <>
                      <View style={styles.reviewHeader}>
                        {review.author_image ? (
                          <Image source={review.author_image} style={styles.authorPhoto} contentFit="cover" />
                        ) : (
                          <View style={[styles.authorPhotoFallback, { backgroundColor: colors.tint + '2E' }]}>
                            <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={16} color={colors.tint} />
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.reviewGuestName, { color: colors.text }]} numberOfLines={1}>{review.author_title}</Text>
                          {renderStars(review.review_rating, 12)}
                        </View>
                        <View style={styles.googleBadge}>
                          <Text style={styles.googleBadgeText}>G</Text>
                        </View>
                      </View>
                      {review.review_text ? (
                        <Text style={[styles.reviewText, { color: colors.text }]}>
                          {getLocalizedField(review, 'review_text', language)}
                        </Text>
                      ) : null}
                      {review.owner_answer ? (
                        <View style={[styles.ownerReplyContainer, { backgroundColor: colors.glass, borderLeftColor: colors.tint }]}>
                          <Text style={[styles.ownerReplyLabel, { color: colors.tint }]}>
                            {t('rewards_reviews_editor:owner_reply_label')}
                          </Text>
                          <Text style={[styles.ownerReplyText, { color: colors.textSecondary }]}>
                            {getLocalizedField(review, 'owner_answer', language)}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                        {new Date(review.review_datetime_utc).toLocaleDateString()}
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.reviewHeader}>
                        <View style={[styles.authorPhotoFallback, { backgroundColor: colors.tint + '2E' }]}>
                          <Text style={[styles.reviewAvatarInitial, { color: colors.tint }]}>{review.guest_name?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.reviewGuestName, { color: colors.text }]} numberOfLines={1}>{review.guest_name}</Text>
                          {renderStars(review.rating, 12)}
                        </View>
                      </View>
                      <Text style={[styles.reviewText, { color: colors.text }]}>{review.review_text}</Text>
                      <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                        {new Date(review.review_date).toLocaleDateString()}
                      </Text>
                    </>
                  )}
                </GlassCard>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  subTabHeader: {
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  contentContainer: {
    flexGrow: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  bucksCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
    gap: 6,
  },
  bucksLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  bucksAmount: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 12,
  },
  redeemBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  subTabDot: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  deniedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F4433620',
  },
  deniedPillText: {
    color: '#F44336',
    fontSize: 11,
    fontWeight: '700',
  },

  // Sub-tabs (match the manager Rewards page)
  subTabContainer: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 13,
    padding: 4,
    marginBottom: 16,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 5,
  },
  subTabActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  subTabText: {
    fontFamily: fonts.display.semibold,
    fontSize: 11.5,
  },

  // Section
  section: {
    marginBottom: 24,
  },

  // Leaderboard (match the manager Rewards page)
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 15,
    padding: 11,
    marginBottom: 8,
  },
  leaderboardRank: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardRankText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 14,
    color: '#1A1E24',
  },
  leaderboardInfo: {
    flex: 1,
    minWidth: 0,
  },
  leaderboardName: {
    fontFamily: fonts.display.bold,
    fontSize: 14.5,
    marginBottom: 2,
  },
  leaderboardJob: {
    fontFamily: fonts.mono.medium,
    fontSize: 9.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  leaderboardBucks: {
    fontFamily: fonts.mono.semibold,
    fontSize: 17,
    letterSpacing: -0.5,
  },

  // Transactions (match the manager Rewards page)
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    padding: 12,
    marginBottom: 8,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  transactionEmployee: {
    fontFamily: fonts.display.bold,
    fontSize: 14,
    marginBottom: 3,
  },
  transactionDescription: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    marginBottom: 3,
  },
  transactionDate: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
  },
  transactionAmount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    letterSpacing: -0.5,
  },
  positiveAmount: {
    color: '#4CAF50',
  },
  negativeAmount: {
    color: '#F44336',
  },

  // Empty states
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
  },

  // Reviews (match the manager Rewards page)
  reviewCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 11,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewGuestName: {
    fontFamily: fonts.display.bold,
    fontSize: 14,
  },
  reviewAvatarInitial: {
    fontFamily: fonts.display.bold,
    fontSize: 15,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 1,
    marginTop: 3,
  },
  reviewText: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 19,
    opacity: 0.92,
    marginTop: 9,
  },
  reviewDate: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    marginTop: 9,
  },
  googleReviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  authorPhoto: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  authorPhotoFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4285F420',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#4285F455',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBadgeText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: '#4285F4',
  },
  ownerReplyContainer: {
    borderLeftWidth: 2,
    borderRadius: 11,
    padding: 11,
    marginTop: 10,
  },
  ownerReplyLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ownerReplyText: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 17,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 300,
  },
  placeholderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
});
