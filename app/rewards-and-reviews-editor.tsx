
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { sendRewardNotification } from '@/utils/notificationHelpers';

interface Employee {
  id: string;
  username: string;
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
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export default function RewardsAndReviewsEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'rewards' | 'reviews'>('rewards');
  const [loading, setLoading] = useState(false);

  // Rewards state
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showResetBucksModal, setShowResetBucksModal] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [myBucks, setMyBucks] = useState(0);
  const [topEmployees, setTopEmployees] = useState<Employee[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RewardTransaction[]>([]);
  const [isReward, setIsReward] = useState(true); // true = Reward (positive), false = Deduct (negative)

  // Reset Bucks state
  const [resetSearchQuery, setResetSearchQuery] = useState('');
  const [resetFilteredEmployees, setResetFilteredEmployees] = useState<Employee[]>([]);
  const [resetSelectedEmployee, setResetSelectedEmployee] = useState<Employee | null>(null);

  // Edit transaction state
  const [showEditTransactionModal, setShowEditTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<RewardTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsReward, setEditIsReward] = useState(true);

  // Reviews state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviews, setReviews] = useState<GuestReview[]>([]);
  const [editingReview, setEditingReview] = useState<GuestReview | null>(null);
  const [reviewForm, setReviewForm] = useState({
    guest_name: '',
    rating: 5,
    review_text: '',
    review_date: new Date().toISOString().split('T')[0],
    display_order: 0,
  });

  const fetchRewardsData = useCallback(async () => {
    try {
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
      // Managers can see ALL transactions (including hidden ones)
      const { data: transData, error: transError } = await supabase
        .from('rewards_transactions')
        .select('id, user_id, amount, description, is_visible, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (transError) {
        console.error('Error fetching transactions:', transError);
        return;
      }

      if (transData && transData.length > 0) {
        // Get unique user IDs
        const userIds = [...new Set(transData.map(t => t.user_id))];
        
        // Fetch user names separately
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);

        if (!usersError && usersData) {
          // Create a map of user IDs to names
          const userMap = new Map(usersData.map(u => [u.id, u.name]));
          
          // Combine transaction data with user names
          const transactionsWithNames = transData.map(trans => ({
            ...trans,
            user_name: userMap.get(trans.user_id) || 'Unknown Employee'
          }));
          
          console.log('Fetched transactions with names:', transactionsWithNames);
          setRecentTransactions(transactionsWithNames);
        } else {
          console.error('Error fetching user names:', usersError);
          setRecentTransactions(transData.map(trans => ({
            ...trans,
            user_name: 'Unknown Employee'
          })));
        }
      } else {
        setRecentTransactions([]);
      }
    } catch (error) {
      console.error('Error fetching rewards data:', error);
    }
  }, [user?.id]);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, job_title, mcloones_bucks')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchReviews = async () => {
    try {
      const { data, error } = await supabase
        .from('guest_reviews')
        .select('*')
        .order('display_order', { ascending: true })
        .order('review_date', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchRewardsData();
    fetchReviews();
  }, [fetchRewardsData]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredEmployees(filtered);
    } else {
      setFilteredEmployees([]);
    }
  }, [searchQuery, employees]);

  useEffect(() => {
    if (resetSearchQuery) {
      const filtered = employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(resetSearchQuery.toLowerCase()) ||
          emp.username.toLowerCase().includes(resetSearchQuery.toLowerCase())
      );
      setResetFilteredEmployees(filtered);
    } else {
      setResetFilteredEmployees([]);
    }
  }, [resetSearchQuery, employees]);

  const handleRewardEmployee = async () => {
    try {
      if (!selectedEmployee) {
        Alert.alert('Error', 'Please select an employee');
        return;
      }

      if (!rewardAmount || isNaN(parseInt(rewardAmount))) {
        Alert.alert('Error', 'Please enter a valid amount');
        return;
      }

      if (!rewardDescription.trim()) {
        Alert.alert('Error', 'Please enter a description');
        return;
      }

      setLoading(true);

      // Calculate the final amount based on Reward/Deduct toggle
      const finalAmount = isReward ? parseInt(rewardAmount) : -parseInt(rewardAmount);

      const { error } = await supabase.from('rewards_transactions').insert({
        user_id: selectedEmployee.id,
        amount: finalAmount,
        description: rewardDescription,
        is_visible: isVisible,
        created_by: user?.id,
      });

      if (error) throw error;

      // 🔔 SEND PUSH NOTIFICATION (only for rewards, not deductions)
      if (isReward) {
        try {
          await sendRewardNotification(
            selectedEmployee.id,     // User who received the reward
            parseInt(rewardAmount),  // Amount of McLoone's Bucks
            rewardDescription        // Description of why they earned it
          );
        } catch (notificationError) {
          console.error('Failed to send notification:', notificationError);
          // Don't show error to user - notification is secondary to main action
        }
      }

      Alert.alert('Success', `${isReward ? 'Reward' : 'Deduction'} added successfully`);
      setShowRewardModal(false);
      resetRewardForm();
      fetchEmployees();
      fetchRewardsData();
    } catch (error: any) {
      console.error('Error adding reward:', error);
      Alert.alert('Error', error.message || 'Failed to add reward');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSingleUser = async () => {
    if (!resetSelectedEmployee) {
      Alert.alert('Error', 'Please select an employee');
      return;
    }

    Alert.alert(
      'Reset User Bucks',
      `Are you sure you want to reset ${resetSelectedEmployee.name}'s McLoone's Bucks to $0? This will also delete all their transaction history. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              console.log('Starting reset for user:', resetSelectedEmployee.id);

              // Step 1: Delete all transactions for this user
              const { error: deleteError } = await supabase
                .from('rewards_transactions')
                .delete()
                .eq('user_id', resetSelectedEmployee.id);

              if (deleteError) {
                console.error('Error deleting transactions:', deleteError);
                throw deleteError;
              }
              console.log('Transactions deleted successfully');

              // Step 2: Recalculate the balance from remaining transactions (should be 0)
              const { data: sumData, error: sumError } = await supabase
                .from('rewards_transactions')
                .select('amount')
                .eq('user_id', resetSelectedEmployee.id);

              if (sumError) {
                console.error('Error calculating sum:', sumError);
                throw sumError;
              }

              // Calculate total from remaining transactions
              const totalBucks = sumData?.reduce((sum, trans) => sum + trans.amount, 0) || 0;
              console.log('Calculated total bucks from remaining transactions:', totalBucks);

              // Step 3: Update user's bucks to the calculated total (should be 0)
              const { data: updateData, error: updateError } = await supabase
                .from('users')
                .update({ mcloones_bucks: totalBucks })
                .eq('id', resetSelectedEmployee.id)
                .select();

              if (updateError) {
                console.error('Error updating user bucks:', updateError);
                throw updateError;
              }
              console.log('User bucks updated successfully:', updateData);

              // Step 4: Verify the update
              const { data: verifyData, error: verifyError } = await supabase
                .from('users')
                .select('mcloones_bucks')
                .eq('id', resetSelectedEmployee.id)
                .single();

              if (verifyError) {
                console.error('Error verifying update:', verifyError);
              } else {
                console.log('Verified user bucks after reset:', verifyData);
              }

              Alert.alert('Success', `${resetSelectedEmployee.name}'s McLoone's Bucks have been reset to $0 and all transactions deleted`);
              setShowResetBucksModal(false);
              setResetSelectedEmployee(null);
              setResetSearchQuery('');
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error resetting user bucks:', error);
              Alert.alert('Error', error.message || 'Failed to reset user bucks');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleResetAllUsers = async () => {
    Alert.alert(
      'Reset All Users Bucks',
      'Are you sure you want to reset ALL employees\' McLoone\'s Bucks to $0? This will also delete ALL transaction history for everyone. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              console.log('Starting reset for all users');

              // Step 1: Delete all transactions
              const { error: deleteError } = await supabase
                .from('rewards_transactions')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

              if (deleteError) {
                console.error('Error deleting all transactions:', deleteError);
                throw deleteError;
              }
              console.log('All transactions deleted successfully');

              // Step 2: Get all active users
              const { data: allUsers, error: fetchError } = await supabase
                .from('users')
                .select('id')
                .eq('is_active', true);

              if (fetchError) {
                console.error('Error fetching users:', fetchError);
                throw fetchError;
              }
              console.log('Found users to reset:', allUsers?.length);

              // Step 3: For each user, recalculate their balance from remaining transactions (should be 0)
              if (allUsers && allUsers.length > 0) {
                for (const userRecord of allUsers) {
                  // Calculate sum of remaining transactions for this user
                  const { data: sumData, error: sumError } = await supabase
                    .from('rewards_transactions')
                    .select('amount')
                    .eq('user_id', userRecord.id);

                  if (sumError) {
                    console.error(`Error calculating sum for user ${userRecord.id}:`, sumError);
                    continue;
                  }

                  // Calculate total from remaining transactions
                  const totalBucks = sumData?.reduce((sum, trans) => sum + trans.amount, 0) || 0;

                  // Update user's bucks to the calculated total (should be 0)
                  const { error: updateError } = await supabase
                    .from('users')
                    .update({ mcloones_bucks: totalBucks })
                    .eq('id', userRecord.id);

                  if (updateError) {
                    console.error(`Error updating user ${userRecord.id}:`, updateError);
                  }
                }
              }

              console.log('All users bucks updated successfully');

              // Step 4: Verify the update
              const { data: verifyData, error: verifyError } = await supabase
                .from('users')
                .select('id, name, mcloones_bucks')
                .eq('is_active', true);

              if (verifyError) {
                console.error('Error verifying update:', verifyError);
              } else {
                console.log('Verified users after reset:', verifyData);
                const nonZeroUsers = verifyData?.filter(u => u.mcloones_bucks !== 0);
                if (nonZeroUsers && nonZeroUsers.length > 0) {
                  console.warn('Warning: Some users still have non-zero bucks:', nonZeroUsers);
                }
              }

              Alert.alert('Success', 'All employees\' McLoone\'s Bucks have been reset to $0 and all transactions deleted');
              setShowResetBucksModal(false);
              setResetSelectedEmployee(null);
              setResetSearchQuery('');
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error resetting all users bucks:', error);
              Alert.alert('Error', error.message || 'Failed to reset all users bucks');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditTransaction = (transaction: RewardTransaction) => {
    setEditingTransaction(transaction);
    const absAmount = Math.abs(transaction.amount);
    setEditAmount(absAmount.toString());
    setEditDescription(transaction.description);
    setEditIsReward(transaction.amount >= 0);
    setShowEditTransactionModal(true);
  };

  const handleSaveEditTransaction = async () => {
    try {
      if (!editingTransaction) return;

      if (!editAmount || isNaN(parseInt(editAmount))) {
        Alert.alert('Error', 'Please enter a valid amount');
        return;
      }

      if (!editDescription.trim()) {
        Alert.alert('Error', 'Please enter a description');
        return;
      }

      if (!user?.id) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      setLoading(true);

      // Calculate the final amount based on Reward/Deduct toggle
      const finalAmount = editIsReward ? parseInt(editAmount) : -parseInt(editAmount);

      console.log('Updating transaction:', {
        manager_id: user.id,
        transaction_id: editingTransaction.id,
        new_amount: finalAmount,
        new_description: editDescription,
      });

      // Use the database function to update transaction and recalculate balance
      const { data, error } = await supabase.rpc('update_transaction_and_balance', {
        p_manager_id: user.id,
        p_transaction_id: editingTransaction.id,
        p_new_amount: finalAmount,
        p_new_description: editDescription,
      });

      if (error) {
        console.error('Error from database function:', error);
        throw error;
      }

      console.log('Transaction updated successfully, result:', data);

      Alert.alert('Success', 'Transaction updated successfully and user balance recalculated');
      setShowEditTransactionModal(false);
      setEditingTransaction(null);
      fetchEmployees();
      fetchRewardsData();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      Alert.alert('Error', error.message || 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = async (transaction: RewardTransaction) => {
    Alert.alert(
      'Delete Transaction',
      `Are you sure you want to delete this transaction? This will remove it from the history but will NOT affect ${transaction.user_name}'s total balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // Delete the transaction (balance is NOT affected)
              const { error: deleteError } = await supabase
                .from('rewards_transactions')
                .delete()
                .eq('id', transaction.id);

              if (deleteError) throw deleteError;

              Alert.alert('Success', 'Transaction deleted successfully');
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error deleting transaction:', error);
              Alert.alert('Error', error.message || 'Failed to delete transaction');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleHideTransaction = async (transaction: RewardTransaction) => {
    const newVisibility = !transaction.is_visible;
    const actionText = newVisibility ? 'show' : 'hide';
    
    Alert.alert(
      `${newVisibility ? 'Show' : 'Hide'} Transaction`,
      `Are you sure you want to ${actionText} this transaction? This will ${newVisibility ? 'show it to' : 'hide it from'} all employees in their recent transaction list but will NOT affect their total balance. Managers will still be able to see all transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newVisibility ? 'Show' : 'Hide',
          onPress: async () => {
            try {
              setLoading(true);

              // Update the transaction visibility (balance is NOT affected)
              const { error: visibilityError } = await supabase
                .from('rewards_transactions')
                .update({ is_visible: newVisibility })
                .eq('id', transaction.id);

              if (visibilityError) throw visibilityError;

              Alert.alert('Success', `Transaction ${actionText === 'hide' ? 'hidden' : 'shown'} successfully`);
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error(`Error ${actionText}ing transaction:`, error);
              Alert.alert('Error', error.message || `Failed to ${actionText} transaction`);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const resetRewardForm = () => {
    setSelectedEmployee(null);
    setRewardAmount('');
    setRewardDescription('');
    setIsVisible(true);
    setSearchQuery('');
    setIsReward(true);
  };

  const handleSaveReview = async () => {
    try {
      if (!reviewForm.guest_name.trim()) {
        Alert.alert('Error', 'Please enter guest name');
        return;
      }

      if (!reviewForm.review_text.trim()) {
        Alert.alert('Error', 'Please enter review text');
        return;
      }

      setLoading(true);

      if (editingReview) {
        // Update existing review
        const { error } = await supabase
          .from('guest_reviews')
          .update({
            guest_name: reviewForm.guest_name,
            rating: reviewForm.rating,
            review_text: reviewForm.review_text,
            review_date: reviewForm.review_date,
            display_order: reviewForm.display_order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingReview.id);

        if (error) throw error;
        Alert.alert('Success', 'Review updated successfully');
      } else {
        // Create new review
        const { error } = await supabase.from('guest_reviews').insert({
          guest_name: reviewForm.guest_name,
          rating: reviewForm.rating,
          review_text: reviewForm.review_text,
          review_date: reviewForm.review_date,
          display_order: reviewForm.display_order,
          created_by: user?.id,
        });

        if (error) throw error;
        Alert.alert('Success', 'Review added successfully');
      }

      setShowReviewModal(false);
      resetReviewForm();
      fetchReviews();
    } catch (error: any) {
      console.error('Error saving review:', error);
      Alert.alert('Error', error.message || 'Failed to save review');
    } finally {
      setLoading(false);
    }
  };

  const resetReviewForm = () => {
    setEditingReview(null);
    setReviewForm({
      guest_name: '',
      rating: 5,
      review_text: '',
      review_date: new Date().toISOString().split('T')[0],
      display_order: 0,
    });
  };

  const handleEditReview = (review: GuestReview) => {
    setEditingReview(review);
    setReviewForm({
      guest_name: review.guest_name,
      rating: review.rating,
      review_text: review.review_text,
      review_date: review.review_date,
      display_order: review.display_order,
    });
    setShowReviewModal(true);
  };

  const handleDeleteReview = async (reviewId: string) => {
    Alert.alert('Delete Review', 'Are you sure you want to delete this review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('guest_reviews')
              .delete()
              .eq('id', reviewId);

            if (error) throw error;
            Alert.alert('Success', 'Review deleted successfully');
            fetchReviews();
          } catch (error: any) {
            console.error('Error deleting review:', error);
            Alert.alert('Error', error.message || 'Failed to delete review');
          }
        },
      },
    ]);
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
            color={star <= rating ? '#FFD700' : managerColors.textSecondary}
          />
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Reviews Editor</Text>
        <View style={styles.backButton} />
      </View>

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
            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rewardButton]}
                onPress={() => setShowRewardModal(true)}
              >
                <IconSymbol
                  ios_icon_name="gift.fill"
                  android_material_icon_name="card_giftcard"
                  size={24}
                  color={managerColors.text}
                />
                <Text style={styles.actionButtonText}>Reward Bucks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.resetButton]}
                onPress={() => setShowResetBucksModal(true)}
              >
                <IconSymbol
                  ios_icon_name="arrow.counterclockwise.circle.fill"
                  android_material_icon_name="refresh"
                  size={24}
                  color={managerColors.text}
                />
                <Text style={styles.actionButtonText}>Reset Bucks</Text>
              </TouchableOpacity>
            </View>

            {/* My McLoone's Bucks */}
            <View style={styles.bucksCard}>
              <Text style={styles.bucksLabel}>My McLoone&apos;s Bucks</Text>
              <Text style={styles.bucksAmount}>${myBucks}</Text>
            </View>

            {/* Top 5 Leaderboard */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top 5 Leaderboard</Text>
              {topEmployees.map((emp, index) => (
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
              ))}
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
                      {!trans.is_visible && (
                        <Text style={styles.hiddenBadge}>Hidden from all employees</Text>
                      )}
                    </View>
                    <View style={styles.transactionRight}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          trans.amount > 0 ? styles.positiveAmount : styles.negativeAmount,
                        ]}
                      >
                        {trans.amount > 0 ? '+' : ''}${trans.amount}
                      </Text>
                      <View style={styles.transactionActions}>
                        <TouchableOpacity
                          onPress={() => handleEditTransaction(trans)}
                          style={styles.actionIconButton}
                        >
                          <IconSymbol
                            ios_icon_name="pencil.circle.fill"
                            android_material_icon_name="edit"
                            size={24}
                            color={managerColors.highlight}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleHideTransaction(trans)}
                          style={styles.actionIconButton}
                        >
                          <IconSymbol
                            ios_icon_name={trans.is_visible ? 'eye.slash.fill' : 'eye.fill'}
                            android_material_icon_name={trans.is_visible ? 'visibility_off' : 'visibility'}
                            size={24}
                            color={trans.is_visible ? '#FF9800' : '#4CAF50'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteTransaction(trans)}
                          style={styles.actionIconButton}
                        >
                          <IconSymbol
                            ios_icon_name="trash.fill"
                            android_material_icon_name="delete"
                            size={24}
                            color="#F44336"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            {/* Add Review Button */}
            <TouchableOpacity
              style={styles.rewardButton}
              onPress={() => {
                resetReviewForm();
                setShowReviewModal(true);
              }}
            >
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add_circle"
                size={24}
                color={managerColors.text}
              />
              <Text style={styles.rewardButtonText}>Add Review</Text>
            </TouchableOpacity>

            {/* Reviews List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Guest Reviews</Text>
              {reviews.length === 0 ? (
                <Text style={styles.emptyText}>No reviews yet</Text>
              ) : (
                reviews.map((review, index) => (
                  <View key={index} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewHeaderLeft}>
                        <Text style={styles.reviewGuestName}>{review.guest_name}</Text>
                        {renderStars(review.rating)}
                      </View>
                      <View style={styles.reviewActions}>
                        <TouchableOpacity onPress={() => handleEditReview(review)}>
                          <IconSymbol
                            ios_icon_name="pencil.circle.fill"
                            android_material_icon_name="edit"
                            size={28}
                            color={managerColors.highlight}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteReview(review.id)}>
                          <IconSymbol
                            ios_icon_name="trash.circle.fill"
                            android_material_icon_name="delete"
                            size={28}
                            color="#F44336"
                          />
                        </TouchableOpacity>
                      </View>
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

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// Styles remain the same as in the original file
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: managerColors.card,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
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
    borderBottomColor: managerColors.highlight,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  activeTabText: {
    color: managerColors.highlight,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  rewardButton: {
    backgroundColor: managerColors.highlight,
  },
  resetButton: {
    backgroundColor: '#FF9800',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  rewardButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  bucksCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  bucksLabel: {
    fontSize: 16,
    color: managerColors.textSecondary,
    marginBottom: 8,
  },
  bucksAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: managerColors.highlight,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 12,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  leaderboardRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: managerColors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  leaderboardRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  leaderboardJob: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  leaderboardBucks: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.highlight,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionEmployee: {
    fontSize: 17,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: 15,
    color: managerColors.text,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  hiddenBadge: {
    fontSize: 11,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 4,
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 8,
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
  transactionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconButton: {
    padding: 4,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 20,
  },
  reviewCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reviewHeaderLeft: {
    flex: 1,
  },
  reviewGuestName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewText: {
    fontSize: 14,
    color: managerColors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
