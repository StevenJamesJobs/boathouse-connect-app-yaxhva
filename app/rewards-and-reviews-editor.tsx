
import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchEmployees();
    fetchRewardsData();
    fetchReviews();
  }, []);

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

  const fetchRewardsData = async () => {
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

      const { error } = await supabase.from('rewards_transactions').insert({
        user_id: selectedEmployee.id,
        amount: parseInt(rewardAmount),
        description: rewardDescription,
        is_visible: isVisible,
        created_by: user?.id,
      });

      if (error) throw error;

      Alert.alert('Success', 'Reward added successfully');
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
            {/* Reward Bucks Button */}
            <TouchableOpacity
              style={styles.rewardButton}
              onPress={() => setShowRewardModal(true)}
            >
              <IconSymbol
                ios_icon_name="gift.fill"
                android_material_icon_name="card_giftcard"
                size={24}
                color={managerColors.text}
              />
              <Text style={styles.rewardButtonText}>Reward Bucks</Text>
            </TouchableOpacity>

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
                          onPress={() => handleHideTransaction(trans)}
                          style={styles.actionButton}
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
                          style={styles.actionButton}
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

      {/* Reward Modal */}
      <Modal visible={showRewardModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reward Employee</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowRewardModal(false);
                  resetRewardForm();
                }}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Employee Search */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Search Employee *</Text>
                <TextInput
                  style={styles.formInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Type employee name..."
                  placeholderTextColor={managerColors.textSecondary}
                />
                {filteredEmployees.length > 0 && (
                  <View style={styles.searchResults}>
                    {filteredEmployees.map((emp, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.searchResultItem}
                        onPress={() => {
                          setSelectedEmployee(emp);
                          setSearchQuery(emp.name);
                          setFilteredEmployees([]);
                        }}
                      >
                        <Text style={styles.searchResultName}>{emp.name}</Text>
                        <Text style={styles.searchResultJob}>{emp.job_title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {selectedEmployee && (
                  <View style={styles.selectedEmployee}>
                    <Text style={styles.selectedEmployeeText}>
                      Selected: {selectedEmployee.name}
                    </Text>
                  </View>
                )}
              </View>

              {/* Amount */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Amount (use negative for deduction) *</Text>
                <TextInput
                  style={styles.formInput}
                  value={rewardAmount}
                  onChangeText={setRewardAmount}
                  placeholder="Enter amount (e.g., 50 or -25)"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              {/* Description */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Description *</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={rewardDescription}
                  onChangeText={setRewardDescription}
                  placeholder="Why are they receiving/losing bucks?"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Visibility Toggle */}
              <View style={styles.formField}>
                <View style={styles.visibilityToggle}>
                  <Text style={styles.formLabel}>Visible to Employees</Text>
                  <TouchableOpacity
                    style={[styles.toggleButton, isVisible && styles.toggleButtonActive]}
                    onPress={() => setIsVisible(!isVisible)}
                  >
                    <View
                      style={[
                        styles.toggleCircle,
                        isVisible && styles.toggleCircleActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.formNote}>
                  If hidden, the transaction won&apos;t show in any employee&apos;s transaction history, but the bucks will still be added/deducted from their total. Managers will still be able to see all transactions.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleRewardEmployee}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={managerColors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Reward</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={showReviewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingReview ? 'Edit Review' : 'Add Review'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowReviewModal(false);
                  resetReviewForm();
                }}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Guest Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Guest Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.guest_name}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, guest_name: text })
                  }
                  placeholder="Enter guest name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Rating */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Rating *</Text>
                <View style={styles.ratingSelector}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setReviewForm({ ...reviewForm, rating: star })}
                    >
                      <IconSymbol
                        ios_icon_name={star <= reviewForm.rating ? 'star.fill' : 'star'}
                        android_material_icon_name={
                          star <= reviewForm.rating ? 'star' : 'star_border'
                        }
                        size={40}
                        color={star <= reviewForm.rating ? '#FFD700' : managerColors.textSecondary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Review Text */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Review *</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={reviewForm.review_text}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, review_text: text })
                  }
                  placeholder="Enter review text"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={6}
                />
              </View>

              {/* Review Date */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Review Date *</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.review_date}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, review_date: text })
                  }
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.display_order.toString()}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, display_order: parseInt(text) || 0 })
                  }
                  placeholder="0"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveReview}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={managerColors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingReview ? 'Update Review' : 'Add Review'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

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
  rewardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
    gap: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
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
  actionButton: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: managerColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  modalForm: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  formNote: {
    fontSize: 12,
    color: managerColors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  searchResults: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 4,
  },
  searchResultJob: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  selectedEmployee: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  selectedEmployeeText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleButton: {
    width: 60,
    height: 32,
    borderRadius: 16,
    backgroundColor: managerColors.border,
    padding: 4,
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: managerColors.highlight,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: managerColors.text,
  },
  toggleCircleActive: {
    alignSelf: 'flex-end',
  },
  ratingSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  submitButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});
