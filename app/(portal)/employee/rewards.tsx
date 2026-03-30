
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import ExamRewardBlurb from '@/components/ExamRewardBlurb';

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
}

interface GuestReview {
  id: string;
  guest_name: string;
  rating: number;
  review_text: string;
  review_date: string;
}

type MainTab = 'rewards' | 'reviews';
type RewardsSubTab = 'leaderboard' | 'recent';

export default function EmployeeRewardsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<MainTab>('rewards');
  const [rewardsSubTab, setRewardsSubTab] = useState<RewardsSubTab>('leaderboard');
  const [loading, setLoading] = useState(true);

  // Rewards state
  const [myBucks, setMyBucks] = useState(0);
  const [topEmployees, setTopEmployees] = useState<Employee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RewardTransaction[]>([]);

  // Reviews state
  const [reviews, setReviews] = useState<GuestReview[]>([]);

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
        .order('created_at', { ascending: false })
        .limit(15);

      if (transError) {
        console.error('Error fetching transactions:', transError);
        return;
      }

      if (transData && transData.length > 0) {
        const visibleTransactions = transData.filter(t => t.is_visible === true).slice(0, 5);

        if (visibleTransactions.length > 0) {
          const userIds = [...new Set(visibleTransactions.map(t => t.user_id))];
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, name')
            .in('id', userIds);

          if (!usersError && usersData) {
            const userMap = new Map(usersData.map(u => [u.id, u.name]));
            setRecentTransactions(visibleTransactions.map(trans => ({
              ...trans,
              user_name: userMap.get(trans.user_id) || 'Unknown Employee'
            })));
          } else {
            setRecentTransactions(visibleTransactions.map(trans => ({
              ...trans,
              user_name: 'Unknown Employee'
            })));
          }
        } else {
          setRecentTransactions([]);
        }
      } else {
        setRecentTransactions([]);
      }
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

  useEffect(() => {
    fetchRewardsData();
    fetchReviews();
  }, [fetchRewardsData, fetchReviews]);

  const getRankColor = (index: number) => {
    if (index === 0) return '#FFD700'; // Gold
    if (index === 1) return '#C0C0C0'; // Silver
    if (index === 2) return '#CD7F32'; // Bronze
    return colors.primary;
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <IconSymbol
            key={star}
            ios_icon_name={star <= rating ? 'star.fill' : 'star'}
            android_material_icon_name={star <= rating ? 'star' : 'star_border'}
            size={20}
            color={star <= rating ? '#FFD700' : colors.textSecondary}
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Main Tab Selector */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rewards' && { borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('rewards')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'rewards' && { color: colors.primary }]}>
            Rewards
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && { borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('reviews')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'reviews' && { color: colors.primary }]}>
            Reviews
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'rewards' ? (
          <>
            {/* Exam Reward Blurb (dismissible) */}
            <ExamRewardBlurb />

            {/* My McLoone's Bucks */}
            <View style={[styles.bucksCard, { backgroundColor: colors.card }]}>
              <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={32} color={colors.primary} />
              <Text style={[styles.bucksLabel, { color: colors.textSecondary }]}>My McLoone's Bucks</Text>
              <Text style={[styles.bucksAmount, { color: colors.primary }]}>${myBucks}</Text>
            </View>

            {/* Sub-Tab Selector: Leaderboard / Recent Awards */}
            <View style={[styles.subTabContainer, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={[
                  styles.subTab,
                  rewardsSubTab === 'leaderboard' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setRewardsSubTab('leaderboard')}
              >
                <IconSymbol
                  ios_icon_name="trophy.fill"
                  android_material_icon_name="emoji-events"
                  size={16}
                  color={rewardsSubTab === 'leaderboard' ? '#FFF' : colors.textSecondary}
                />
                <Text style={[
                  styles.subTabText,
                  { color: rewardsSubTab === 'leaderboard' ? '#FFF' : colors.textSecondary },
                ]}>
                  Leaderboard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.subTab,
                  rewardsSubTab === 'recent' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setRewardsSubTab('recent')}
              >
                <IconSymbol
                  ios_icon_name="clock.fill"
                  android_material_icon_name="history"
                  size={16}
                  color={rewardsSubTab === 'recent' ? '#FFF' : colors.textSecondary}
                />
                <Text style={[
                  styles.subTabText,
                  { color: rewardsSubTab === 'recent' ? '#FFF' : colors.textSecondary },
                ]}>
                  Recent Awards
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sub-Tab Content */}
            {rewardsSubTab === 'leaderboard' ? (
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
                      <View
                        key={emp.id}
                        style={[
                          styles.leaderboardItem,
                          { backgroundColor: colors.card },
                          isCurrentUser && { borderWidth: 2, borderColor: colors.primary },
                        ]}
                      >
                        <View style={[styles.leaderboardRank, { backgroundColor: getRankColor(index) }]}>
                          <Text style={styles.leaderboardRankText}>
                            {index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}
                          </Text>
                        </View>
                        <View style={styles.leaderboardInfo}>
                          <Text style={[styles.leaderboardName, { color: colors.text }]}>
                            {emp.name}{isCurrentUser ? ' (You)' : ''}
                          </Text>
                          <Text style={[styles.leaderboardJob, { color: colors.textSecondary }]}>{emp.job_title}</Text>
                        </View>
                        <Text style={[styles.leaderboardBucks, { color: colors.primary }]}>${emp.mcloones_bucks || 0}</Text>
                      </View>
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
                  recentTransactions.map((trans, index) => (
                    <View key={trans.id || index} style={[styles.transactionItem, { backgroundColor: colors.card }]}>
                      <View style={[styles.transactionIcon, { backgroundColor: trans.amount > 0 ? '#E8F5E9' : '#FFEBEE' }]}>
                        <IconSymbol
                          ios_icon_name={trans.amount > 0 ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'}
                          android_material_icon_name={trans.amount > 0 ? 'arrow-upward' : 'arrow-downward'}
                          size={20}
                          color={trans.amount > 0 ? '#4CAF50' : '#F44336'}
                        />
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={[styles.transactionEmployee, { color: colors.text }]}>
                          {trans.user_name || 'Unknown Employee'}
                        </Text>
                        <Text style={[styles.transactionDescription, { color: colors.textSecondary }]}>{trans.description}</Text>
                        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                          {new Date(trans.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.transactionAmount,
                          trans.amount > 0 ? styles.positiveAmount : styles.negativeAmount,
                        ]}
                      >
                        {trans.amount > 0 ? '+' : ''}${trans.amount}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {/* Guest Reviews */}
            <View style={styles.section}>
              {reviews.length === 0 ? (
                <View style={styles.placeholderContainer}>
                  <IconSymbol
                    ios_icon_name="star.fill"
                    android_material_icon_name="rate_review"
                    size={64}
                    color={colors.primary}
                  />
                  <Text style={[styles.placeholderTitle, { color: colors.text }]}>No Reviews Yet</Text>
                  <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    Guest reviews will appear here once they are added by management.
                  </Text>
                </View>
              ) : (
                reviews.map((review, index) => (
                  <View key={review.id || index} style={[styles.reviewCard, { backgroundColor: colors.card }]}>
                    <View style={styles.reviewHeader}>
                      <Text style={[styles.reviewGuestName, { color: colors.text }]}>{review.guest_name}</Text>
                      {renderStars(review.rating)}
                    </View>
                    <Text style={[styles.reviewText, { color: colors.text }]}>{review.review_text}</Text>
                    <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                      {new Date(review.review_date).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
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

  // Sub-tabs
  subTabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 24,
  },

  // Leaderboard
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  leaderboardRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  leaderboardRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  leaderboardJob: {
    fontSize: 13,
  },
  leaderboardBucks: {
    fontSize: 17,
    fontWeight: 'bold',
  },

  // Transactions
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
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
  },
  transactionEmployee: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  transactionDescription: {
    fontSize: 13,
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 11,
  },
  transactionAmount: {
    fontSize: 17,
    fontWeight: 'bold',
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

  // Reviews
  reviewCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  reviewHeader: {
    marginBottom: 12,
  },
  reviewGuestName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
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
