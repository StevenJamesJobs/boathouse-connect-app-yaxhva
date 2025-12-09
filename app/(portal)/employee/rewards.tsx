
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const [activeTab, setActiveTab] = useState<'rewards' | 'reviews'>('rewards');
  const [loading, setLoading] = useState(true);
  
  // Rewards state
  const [myBucks, setMyBucks] = useState(0);
  const [topEmployees, setTopEmployees] = useState<Employee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RewardTransaction[]>([]);
  
  // Reviews state
  const [reviews, setReviews] = useState<GuestReview[]>([]);

  useEffect(() => {
    fetchRewardsData();
    fetchReviews();
  }, []);

  const fetchRewardsData = async () => {
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
  };

  const fetchReviews = async () => {
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
            color={star <= rating ? '#FFD700' : employeeColors.textSecondary}
          />
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={employeeColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rewards' && styles.activeTab]}
          onPress={() => setActiveTab('rewards')}
        >
          <Text style={[styles.tabText, activeTab === 'rewards' && styles.activeTabText]}>
            Rewards
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
          onPress={() => setActiveTab('reviews')}
        >
          <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>
            Reviews
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'rewards' ? (
          <>
            {/* My McLoone's Bucks */}
            <View style={styles.bucksCard}>
              <Text style={styles.bucksLabel}>My McLoone&apos;s Bucks</Text>
              <Text style={styles.bucksAmount}>${myBucks}</Text>
            </View>

            {/* Top 5 Leaderboard */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top 5 Leaderboard</Text>
              {topEmployees.length === 0 ? (
                <Text style={styles.emptyText}>No leaderboard data yet</Text>
              ) : (
                topEmployees.map((emp, index) => (
                  <View key={index} style={styles.leaderboardItem}>
                    <View style={styles.leaderboardRank}>
                      <Text style={styles.leaderboardRankText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.leaderboardInfo}>
                      <Text style={styles.leaderboardName}>{emp.name}</Text>
                      <Text style={styles.leaderboardJob}>{emp.job_title}</Text>
                    </View>
                    <Text style={styles.leaderboardBucks}>${emp.mcloones_bucks || 0}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Recent Transactions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {recentTransactions.length === 0 ? (
                <Text style={styles.emptyText}>No transactions yet</Text>
              ) : (
                recentTransactions.map((trans, index) => (
                  <View key={index} style={styles.transactionItem}>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionEmployee}>
                        {trans.user_name || 'Unknown Employee'}
                      </Text>
                      <Text style={styles.transactionDescription}>{trans.description}</Text>
                      <Text style={styles.transactionDate}>
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
              <Text style={styles.sectionTitle}>Guest Reviews</Text>
              {reviews.length === 0 ? (
                <View style={styles.placeholderContainer}>
                  <IconSymbol
                    ios_icon_name="star.fill"
                    android_material_icon_name="rate_review"
                    size={64}
                    color={employeeColors.primary}
                  />
                  <Text style={styles.placeholderTitle}>No Reviews Yet</Text>
                  <Text style={styles.placeholderText}>
                    Guest reviews will appear here once they are added by management.
                  </Text>
                </View>
              ) : (
                reviews.map((review, index) => (
                  <View key={index} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewGuestName}>{review.guest_name}</Text>
                      {renderStars(review.rating)}
                    </View>
                    <Text style={styles.reviewText}>{review.review_text}</Text>
                    <Text style={styles.reviewDate}>
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
    backgroundColor: employeeColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: employeeColors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: employeeColors.card,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
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
  activeTab: {
    borderBottomColor: employeeColors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  activeTabText: {
    color: employeeColors.primary,
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
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  bucksLabel: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    marginBottom: 8,
  },
  bucksAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: employeeColors.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 12,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
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
    backgroundColor: employeeColors.primary,
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
    color: employeeColors.text,
    marginBottom: 4,
  },
  leaderboardJob: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  leaderboardBucks: {
    fontSize: 18,
    fontWeight: 'bold',
    color: employeeColors.primary,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.card,
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
    color: employeeColors.text,
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: 15,
    color: employeeColors.text,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: employeeColors.textSecondary,
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
    color: employeeColors.textSecondary,
    marginTop: 20,
  },
  reviewCard: {
    backgroundColor: employeeColors.card,
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
    color: employeeColors.text,
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewText: {
    fontSize: 14,
    color: employeeColors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: employeeColors.textSecondary,
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
    color: employeeColors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
});
