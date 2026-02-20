
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

export default function EmployeeRewardsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<'rewards' | 'reviews'>('rewards');
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

      // Fetch top 5 employees
      const { data: topData, error: topError } = await supabase
        .from('users')
        .select('id, name, job_title, mcloones_bucks')
        .eq('is_active', true)
        .order('mcloones_bucks', { ascending: false })
        .limit(5);

      if (!topError && topData) {
        setTopEmployees(topData);
      }

      // Fetch last 5 transactions with user names
      // First get ALL transactions (the RLS policy now allows this)
      const { data: transData, error: transError } = await supabase
        .from('rewards_transactions')
        .select('id, user_id, amount, description, is_visible, created_at')
        .order('created_at', { ascending: false })
        .limit(10); // Fetch more to account for hidden ones

      if (transError) {
        console.error('Error fetching transactions:', transError);
        return;
      }

      if (transData && transData.length > 0) {
        // Filter to only visible transactions on the client side
        const visibleTransactions = transData.filter(t => t.is_visible === true).slice(0, 5);

        if (visibleTransactions.length > 0) {
          // Get unique user IDs
          const userIds = [...new Set(visibleTransactions.map(t => t.user_id))];

          // Fetch user names separately
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, name')
            .in('id', userIds);

          if (!usersError && usersData) {
            // Create a map of user IDs to names
            const userMap = new Map(usersData.map(u => [u.id, u.name]));

            // Combine transaction data with user names
            const transactionsWithNames = visibleTransactions.map(trans => ({
              ...trans,
              user_name: userMap.get(trans.user_id) || 'Unknown Employee'
            }));

            console.log('Fetched visible transactions with names:', transactionsWithNames);
            setRecentTransactions(transactionsWithNames);
          } else {
            console.error('Error fetching user names:', usersError);
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
      {/* Tab Selector */}
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
            {/* My McLoone's Bucks */}
            <View style={[styles.bucksCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.bucksLabel, { color: colors.textSecondary }]}>My McLoone&apos;s Bucks</Text>
              <Text style={[styles.bucksAmount, { color: colors.primary }]}>${myBucks}</Text>
            </View>

            {/* Top 5 Leaderboard */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Top 5 Leaderboard</Text>
              {topEmployees.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No leaderboard data yet</Text>
              ) : (
                topEmployees.map((emp, index) => (
                  <View key={index} style={[styles.leaderboardItem, { backgroundColor: colors.card }]}>
                    <View style={[styles.leaderboardRank, { backgroundColor: colors.primary }]}>
                      <Text style={styles.leaderboardRankText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.leaderboardInfo}>
                      <Text style={[styles.leaderboardName, { color: colors.text }]}>{emp.name}</Text>
                      <Text style={[styles.leaderboardJob, { color: colors.textSecondary }]}>{emp.job_title}</Text>
                    </View>
                    <Text style={[styles.leaderboardBucks, { color: colors.primary }]}>${emp.mcloones_bucks || 0}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Recent Transactions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
              {recentTransactions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
              ) : (
                recentTransactions.map((trans, index) => (
                  <View key={index} style={[styles.transactionItem, { backgroundColor: colors.card }]}>
                    <View style={styles.transactionInfo}>
                      <Text style={[styles.transactionEmployee, { color: colors.text }]}>
                        {trans.user_name || 'Unknown Employee'}
                      </Text>
                      <Text style={[styles.transactionDescription, { color: colors.text }]}>{trans.description}</Text>
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
          </>
        ) : (
          <>
            {/* Guest Reviews */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Guest Reviews</Text>
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
                  <View key={index} style={[styles.reviewCard, { backgroundColor: colors.card }]}>
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
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  bucksLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  bucksAmount: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  leaderboardRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  leaderboardRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  leaderboardJob: {
    fontSize: 14,
  },
  leaderboardBucks: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionEmployee: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: 15,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  positiveAmount: {
    color: '#4CAF50',
  },
  negativeAmount: {
    color: '#F44336',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
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
