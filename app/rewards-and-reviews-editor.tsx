
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import { useUnreadAwards } from '@/hooks/useUnreadAwards';
import { MessageBadge } from '@/components/MessageBadge';

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
  is_published: boolean;
}

type ReviewItem =
  | (GuestReview & { source: 'manual' })
  | (GoogleReview & { source: 'google' });

export default function RewardsAndReviewsEditorScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const router = useRouter();
  const colors = useThemeColors();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 48,
      paddingBottom: 16,
      backgroundColor: colors.card,
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
      color: colors.text,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      borderBottomColor: colors.highlight,
    },
    tabText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    activeTabText: {
      color: colors.highlight,
    },
    scrollView: {
      flex: 1,
    },
    rewardsStaticHeader: {
      paddingTop: 20,
      paddingHorizontal: 16,
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
    quickActionsCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
      elevation: 3,
    },
    quickActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    quickActionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    quickActionIconContainer: {
      position: 'relative',
    },
    quickActionBadge: {
      position: 'absolute',
      top: -6,
      right: -8,
    },
    quickActionLabel: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 6,
      textAlign: 'center',
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
      backgroundColor: colors.highlight,
    },
    resetButton: {
      backgroundColor: '#FF9800',
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    rewardButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    bucksCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      marginBottom: 20,
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
      elevation: 3,
    },
    bucksLabel: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    bucksAmount: {
      fontSize: 48,
      fontWeight: 'bold',
      color: colors.primary,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 12,
    },
    leaderboardItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
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
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    leaderboardRankText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    leaderboardInfo: {
      flex: 1,
    },
    leaderboardName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 4,
    },
    leaderboardJob: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    leaderboardBucks: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.primary,
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
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
      color: colors.text,
      marginBottom: 4,
    },
    transactionDescription: {
      fontSize: 15,
      color: colors.text,
      marginBottom: 4,
    },
    transactionDate: {
      fontSize: 12,
      color: colors.textSecondary,
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
      color: colors.textSecondary,
      marginTop: 20,
    },
    reviewCard: {
      backgroundColor: colors.card,
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
      color: colors.text,
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
      color: colors.text,
      lineHeight: 20,
      marginBottom: 8,
    },
    reviewDate: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    googleReviewAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    authorPhoto: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    authorPhotoFallback: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E0E0E0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleBadgeText: {
      fontSize: 13,
      fontWeight: 'bold' as const,
      color: '#4285F4',
    },
    ownerReplyContainer: {
      borderLeftWidth: 3,
      paddingLeft: 12,
      marginBottom: 8,
      marginTop: 4,
    },
    ownerReplyLabel: {
      fontSize: 12,
      fontWeight: '600' as const,
      marginBottom: 4,
    },
    ownerReplyText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
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
      backgroundColor: colors.background,
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
      borderBottomColor: colors.highlight,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
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
      color: colors.text,
      marginBottom: 8,
    },
    formInput: {
      backgroundColor: colors.card,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    formInputDisabled: {
      opacity: 0.6,
    },
    formInputTextDisabled: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    formNote: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
      fontStyle: 'italic',
    },
    searchResults: {
      backgroundColor: colors.card,
      borderRadius: 8,
      marginTop: 8,
      maxHeight: 200,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchResultItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchResultName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    searchResultJob: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    selectedEmployee: {
      backgroundColor: colors.highlight,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    selectedEmployeeText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    selectedEmployeeBalance: {
      fontSize: 13,
      color: colors.text,
      marginTop: 4,
    },
    toggleContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    toggleOptionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.border,
      gap: 8,
    },
    toggleOptionButtonActive: {
      borderWidth: 2,
    },
    toggleOptionButtonReward: {
      backgroundColor: '#4CAF50',
      borderColor: '#4CAF50',
    },
    toggleOptionButtonDeduct: {
      backgroundColor: '#F44336',
      borderColor: '#F44336',
    },
    toggleOptionText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    toggleOptionTextActive: {
      color: '#FFFFFF',
    },
    amountPreview: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
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
      backgroundColor: colors.border,
      padding: 4,
      justifyContent: 'center',
    },
    toggleButtonActive: {
      backgroundColor: colors.highlight,
    },
    toggleCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.text,
    },
    toggleCircleActive: {
      alignSelf: 'flex-end',
    },
    ratingSelector: {
      flexDirection: 'row',
      gap: 8,
    },
    submitButton: {
      backgroundColor: colors.highlight,
      borderRadius: 8,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    submitButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    resetWarning: {
      backgroundColor: '#FFF3CD',
      borderRadius: 8,
      padding: 16,
      marginBottom: 24,
      fontSize: 14,
      color: '#856404',
      lineHeight: 20,
    },
    resetSection: {
      marginBottom: 24,
    },
    resetSectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 16,
    },
    resetSingleButton: {
      backgroundColor: '#FF9800',
    },
    resetAllButton: {
      backgroundColor: '#F44336',
    },
    resetAllWarning: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 24,
    },
  });


  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const currencyName = organization.reward_currency_name;
  const { sendNotification } = useNotification();
  const { pendingCount } = usePendingApprovals();
  const { hasNew: managerRecentHasNew, markRecentViewed: markManagerRecentViewed } = useUnreadAwards();
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

  // Sub-tab state
  const [rewardsSubTab, setRewardsSubTab] = useState<'leaderboard' | 'recent' | 'lookup'>('leaderboard');
  const subTabPagerRef = useRef<FlatList>(null);
  const SUB_PAGES = ['leaderboard', 'recent', 'lookup'] as const;
  const goToSubTab = (tab: typeof SUB_PAGES[number]) => {
    const idx = SUB_PAGES.indexOf(tab);
    subTabPagerRef.current?.scrollToIndex({ index: idx, animated: true });
    setRewardsSubTab(tab);
    if (tab === 'recent') markManagerRecentViewed();
  };
  const handleSubTabScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const next = SUB_PAGES[idx];
    if (next && next !== rewardsSubTab) {
      setRewardsSubTab(next);
      if (next === 'recent') markManagerRecentViewed();
    }
  };

  // Employee lookup state
  const [lookupSearchQuery, setLookupSearchQuery] = useState('');
  const [lookupFilteredEmployees, setLookupFilteredEmployees] = useState<Employee[]>([]);
  const [lookupEmployee, setLookupEmployee] = useState<Employee | null>(null);
  const [lookupTransactions, setLookupTransactions] = useState<RewardTransaction[]>([]);

  // Reviews state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviews, setReviews] = useState<GuestReview[]>([]);
  const [googleReviews, setGoogleReviews] = useState<GoogleReview[]>([]);
  const [refreshingGoogle, setRefreshingGoogle] = useState(false);
  const [editingReview, setEditingReview] = useState<GuestReview | null>(null);
  const [reviewForm, setReviewForm] = useState({
    guest_name: '',
    rating: 5,
    review_text: '',
    review_date: new Date().toISOString().split('T')[0],
    display_order: 0,
  });

  const fetchEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, job_title, mcloones_bucks')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  }, [organizationId]);

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

      // Fetch last 5 transactions with user names
      // Managers can see ALL transactions (including hidden ones)
      const { data: transData, error: transError } = await supabase
        .from('rewards_transactions')
        .select('id, user_id, amount, description, is_visible, created_at')
        .eq('organization_id', organizationId)
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
  }, [user?.id, organizationId]);

  const fetchReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('guest_reviews')
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true })
        .order('review_date', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  }, [organizationId]);

  const fetchGoogleReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('id, author_title, author_image, review_rating, review_text, review_text_es, review_datetime_utc, owner_answer, owner_answer_es, is_published')
        .eq('organization_id', organizationId)
        .order('review_datetime_utc', { ascending: false });

      if (!error && data) {
        setGoogleReviews(data as GoogleReview[]);
      }
    } catch (error) {
      console.error('Error fetching Google reviews:', error);
    }
  }, [organizationId]);

  const allReviews: ReviewItem[] = useMemo(() => {
    const manual: ReviewItem[] = reviews.map((r) => ({ ...r, source: 'manual' as const }));
    const google: ReviewItem[] = googleReviews.map((r) => ({ ...r, source: 'google' as const }));
    return [...manual, ...google].sort((a, b) => {
      const dateA = a.source === 'manual' ? a.review_date : a.review_datetime_utc;
      const dateB = b.source === 'manual' ? b.review_date : b.review_datetime_utc;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [reviews, googleReviews]);

  useEffect(() => {
    fetchEmployees();
    fetchRewardsData();
    fetchReviews();
    fetchGoogleReviews();
  }, [fetchEmployees, fetchRewardsData, fetchReviews, fetchGoogleReviews]);

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

  useEffect(() => {
    if (lookupSearchQuery) {
      const filtered = employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(lookupSearchQuery.toLowerCase()) ||
          emp.username.toLowerCase().includes(lookupSearchQuery.toLowerCase())
      );
      setLookupFilteredEmployees(filtered);
    } else {
      setLookupFilteredEmployees([]);
    }
  }, [lookupSearchQuery, employees]);

  const fetchEmployeeTransactions = async (employeeId: string, employeeName: string) => {
    try {
      const { data: transData, error: transError } = await supabase
        .from('rewards_transactions')
        .select('id, user_id, amount, description, is_visible, created_at')
        .eq('user_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!transError && transData) {
        setLookupTransactions((transData as any[]).map((t: any) => ({ ...t, user_name: employeeName })));
      }
    } catch (error) {
      console.error('Error fetching employee transactions:', error);
    }
  };

  const handleSelectLookupEmployee = (emp: Employee) => {
    setLookupEmployee(emp);
    setLookupSearchQuery(emp.name);
    setLookupFilteredEmployees([]);
    fetchEmployeeTransactions(emp.id, emp.name);
  };

  const handleRewardEmployee = async () => {
    try {
      if (!selectedEmployee) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_select_employee'));
        return;
      }

      if (!rewardAmount || isNaN(parseInt(rewardAmount))) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_valid_amount'));
        return;
      }

      if (!rewardDescription.trim()) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_description'));
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
        organization_id: organizationId,
      });

      if (error) throw error;

      // Send push notification (only for rewards, not deductions)
      if (isReward) {
        try {
          await sendNotification({
            userIds: [selectedEmployee.id],
            notificationType: 'reward',
            title: '🎉 You Earned McLoone\'s Bucks!',
            body: `+${rewardAmount} - ${rewardDescription}`,
            data: {
              amount: finalAmount,
              description: rewardDescription,
              senderId: user?.id,
            },
          });
        } catch (notificationError) {
          // Silent fail - don't block reward
          console.error('Failed to send push notification:', notificationError);
        }
      }

      Alert.alert(t('common:success'), isReward ? t('rewards_reviews_editor:reward_success') : t('rewards_reviews_editor:deduction_success'));
      setShowRewardModal(false);
      resetRewardForm();
      fetchEmployees();
      fetchRewardsData();
    } catch (error: any) {
      console.error('Error adding reward:', error);
      Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:reward_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetSingleUser = async () => {
    if (!resetSelectedEmployee) {
      Alert.alert(t('common:error'), t('rewards_reviews_editor:error_select_employee'));
      return;
    }

    Alert.alert(
      t('rewards_reviews_editor:reset_user_title'),
      t('rewards_reviews_editor:reset_user_confirm', { name: resetSelectedEmployee.name, currencyName }),
      [
        { text: t('rewards_reviews_editor:reset_cancel'), style: 'cancel' },
        {
          text: t('rewards_reviews_editor:reset_action'),
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

              Alert.alert(t('common:success'), t('rewards_reviews_editor:reset_success', { name: resetSelectedEmployee.name, currencyName }));
              setShowResetBucksModal(false);
              setResetSelectedEmployee(null);
              setResetSearchQuery('');
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error resetting user bucks:', error);
              Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:reset_error'));
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
      t('rewards_reviews_editor:reset_all_confirm_title'),
      t('rewards_reviews_editor:reset_all_confirm', { currencyName }),
      [
        { text: t('rewards_reviews_editor:reset_cancel'), style: 'cancel' },
        {
          text: t('rewards_reviews_editor:reset_all_action'),
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
                .eq('organization_id', organizationId)
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
                .eq('organization_id', organizationId)
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

              Alert.alert(t('common:success'), t('rewards_reviews_editor:reset_all_success', { currencyName }));
              setShowResetBucksModal(false);
              setResetSelectedEmployee(null);
              setResetSearchQuery('');
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error resetting all users bucks:', error);
              Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:reset_all_error'));
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
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_valid_amount'));
        return;
      }

      if (!editDescription.trim()) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_description'));
        return;
      }

      if (!user?.id) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_not_authenticated'));
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
        p_organization_id: organizationId,
      });

      if (error) {
        console.error('Error from database function:', error);
        throw error;
      }

      console.log('Transaction updated successfully, result:', data);

      Alert.alert(t('common:success'), t('rewards_reviews_editor:transaction_updated'));
      setShowEditTransactionModal(false);
      setEditingTransaction(null);
      fetchEmployees();
      fetchRewardsData();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:transaction_update_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = async (transaction: RewardTransaction) => {
    Alert.alert(
      t('rewards_reviews_editor:delete_transaction_title'),
      t('rewards_reviews_editor:delete_transaction_confirm', { name: transaction.user_name }),
      [
        { text: t('rewards_reviews_editor:delete_cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
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

              Alert.alert(t('common:success'), t('rewards_reviews_editor:transaction_deleted'));
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error('Error deleting transaction:', error);
              Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:transaction_delete_error'));
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
      newVisibility ? t('rewards_reviews_editor:hide_transaction_title_show') : t('rewards_reviews_editor:hide_transaction_title_hide'),
      newVisibility ? t('rewards_reviews_editor:hide_transaction_confirm_show') : t('rewards_reviews_editor:hide_transaction_confirm_hide'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: newVisibility ? t('rewards_reviews_editor:show_action') : t('rewards_reviews_editor:hide_action'),
          onPress: async () => {
            try {
              setLoading(true);

              // Update the transaction visibility (balance is NOT affected)
              const { error: visibilityError } = await supabase
                .from('rewards_transactions')
                .update({ is_visible: newVisibility })
                .eq('id', transaction.id);

              if (visibilityError) throw visibilityError;

              Alert.alert(t('common:success'), actionText === 'hide' ? t('rewards_reviews_editor:transaction_hidden') : t('rewards_reviews_editor:transaction_shown'));
              fetchEmployees();
              fetchRewardsData();
            } catch (error: any) {
              console.error(`Error ${actionText}ing transaction:`, error);
              Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:transaction_visibility_error'));
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
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_guest_name'));
        return;
      }

      if (!reviewForm.review_text.trim()) {
        Alert.alert(t('common:error'), t('rewards_reviews_editor:error_review_text'));
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
        Alert.alert(t('common:success'), t('rewards_reviews_editor:review_updated'));
      } else {
        // Create new review
        const { error } = await supabase.from('guest_reviews').insert({
          guest_name: reviewForm.guest_name,
          rating: reviewForm.rating,
          review_text: reviewForm.review_text,
          review_date: reviewForm.review_date,
          display_order: reviewForm.display_order,
          created_by: user?.id,
          organization_id: organizationId,
        });

        if (error) throw error;
        Alert.alert(t('common:success'), t('rewards_reviews_editor:review_added'));
      }

      setShowReviewModal(false);
      resetReviewForm();
      fetchReviews();
    } catch (error: any) {
      console.error('Error saving review:', error);
      Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:review_save_error'));
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
    Alert.alert(t('rewards_reviews_editor:delete_review_title'), t('rewards_reviews_editor:delete_review_confirm'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('guest_reviews')
              .delete()
              .eq('id', reviewId);

            if (error) throw error;
            Alert.alert(t('common:success'), t('rewards_reviews_editor:review_deleted'));
            fetchReviews();
          } catch (error: any) {
            console.error('Error deleting review:', error);
            Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:review_delete_error'));
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
            android_material_icon_name={star <= rating ? 'star' : 'star-border'}
            size={20}
            color={star <= rating ? '#FFD700' : colors.textSecondary}
          />
        ))}
      </View>
    );
  };

  const handleHideGoogleReview = (review: GoogleReview) => {
    const newPublished = !review.is_published;
    Alert.alert(
      newPublished ? t('rewards_reviews_editor:show_review_title') : t('rewards_reviews_editor:hide_review_title'),
      newPublished ? t('rewards_reviews_editor:show_review_confirm') : t('rewards_reviews_editor:hide_review_confirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: newPublished ? t('rewards_reviews_editor:show_action') : t('rewards_reviews_editor:hide_action'),
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase
                .from('google_reviews')
                .update({ is_published: newPublished })
                .eq('id', review.id);
              if (error) throw error;
              Alert.alert(t('common:success'), newPublished ? t('rewards_reviews_editor:review_shown') : t('rewards_reviews_editor:review_hidden'));
              fetchGoogleReviews();
            } catch (error: any) {
              console.error('Error toggling Google review visibility:', error);
              Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:review_visibility_error'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRefreshGoogleReviews = async () => {
    if (!hasPremium) {
      Alert.alert(
        'Premium Feature',
        'Automatic Google Reviews import requires the Premium plan ($15/mo).',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription-management' as any) },
        ]
      );
      return;
    }

    try {
      setRefreshingGoogle(true);
      const { data, error } = await supabase.functions.invoke('import-google-reviews', {
        body: { source: 'manual', user_id: user?.id, organization_id: organizationId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Import failed');
      Alert.alert(
        t('rewards_reviews_editor:refresh_success_title'),
        t('rewards_reviews_editor:refresh_success_message', { count: data.reviews_upserted })
      );
      fetchGoogleReviews();
    } catch (error: any) {
      console.error('Error refreshing Google reviews:', error);
      Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:refresh_error'));
    } finally {
      setRefreshingGoogle(false);
    }
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
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('rewards_reviews_editor:title')}</Text>
        <View style={styles.backButton} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rewards' && styles.activeTab]}
          onPress={() => setActiveTab('rewards')}
        >
          <Text style={[styles.tabText, activeTab === 'rewards' && styles.activeTabText]}>
            {t('rewards_reviews_editor:tab_rewards')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
          onPress={() => setActiveTab('reviews')}
        >
          <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>
            {t('rewards_reviews_editor:tab_reviews')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'rewards' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.rewardsStaticHeader}>
            {/* Quick Actions Grid: Reward / Deduct / Reset / Approvals */}
            <View style={styles.quickActionsCard}>
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={() => {
                    setIsReward(true);
                    setShowRewardModal(true);
                  }}
                >
                  <IconSymbol ios_icon_name="gift.fill" android_material_icon_name="card-giftcard" size={24} color={colors.primary} />
                  <Text style={[styles.quickActionLabel, { color: colors.text }]}>{t('rewards_ui:manager_reward')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={() => {
                    setIsReward(false);
                    setShowRewardModal(true);
                  }}
                >
                  <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color={colors.primary} />
                  <Text style={[styles.quickActionLabel, { color: colors.text }]}>{t('rewards_ui:manager_deduct')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={() => setShowResetBucksModal(true)}
                >
                  <IconSymbol ios_icon_name="arrow.counterclockwise.circle.fill" android_material_icon_name="refresh" size={24} color={colors.primary} />
                  <Text style={[styles.quickActionLabel, { color: colors.text }]}>{t('rewards_ui:manager_reset')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={() => router.push('/manager-approvals' as any)}
                >
                  <View style={styles.quickActionIconContainer}>
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={24} color={colors.primary} />
                    {pendingCount > 0 && (
                      <View style={styles.quickActionBadge}>
                        <MessageBadge count={pendingCount} size="small" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.quickActionLabel, { color: colors.text }]}>{t('rewards_ui:manager_approvals')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* My Bucks */}
            <View style={styles.bucksCard}>
              <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={32} color={colors.primary} />
              <Text style={styles.bucksLabel}>{t('rewards_reviews_editor:my_bucks_label', { currencyName })}</Text>
              <Text style={styles.bucksAmount}>${myBucks}</Text>
            </View>

            {/* Sub-Tab Selector: Leaderboard / Recent Awards / Employee Lookup */}
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 4,
              marginBottom: 16,
              boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
              elevation: 3,
            }}>
              {(['leaderboard', 'recent', 'lookup'] as const).map((tab) => {
                const active = rewardsSubTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 10,
                      borderRadius: 10,
                      gap: 4,
                      backgroundColor: active ? colors.primary : 'transparent',
                    }}
                    onPress={() => goToSubTab(tab)}
                  >
                    <View style={{ position: 'relative' }}>
                      <IconSymbol
                        ios_icon_name={tab === 'leaderboard' ? 'trophy.fill' : tab === 'recent' ? 'clock.fill' : 'magnifyingglass'}
                        android_material_icon_name={tab === 'leaderboard' ? 'emoji-events' : tab === 'recent' ? 'history' : 'search'}
                        size={14}
                        color={active ? '#FFF' : colors.textSecondary}
                      />
                      {tab === 'recent' && managerRecentHasNew && !active ? (
                        <View style={styles.subTabDot} />
                      ) : null}
                    </View>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: active ? '#FFF' : colors.textSecondary,
                    }}>
                      {tab === 'leaderboard' ? t('rewards_ui:tab_leaderboard') : tab === 'recent' ? t('rewards_ui:tab_recent_short') : t('rewards_ui:tab_lookup')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>

          {/* Sub-Tab Content — horizontal pager: leaderboard / recent / lookup */}
          <FlatList
            ref={subTabPagerRef}
            data={SUB_PAGES as unknown as string[]}
            keyExtractor={(item) => item}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleSubTabScroll}
            bounces={false}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            style={{ flex: 1 }}
            renderItem={({ item }) => (
              <ScrollView
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
            {item === 'lookup' ? (
              <View style={styles.section}>
                {/* Employee Search */}
                <TextInput
                  style={[styles.formInput, { marginBottom: 12 }]}
                  value={lookupSearchQuery}
                  onChangeText={(text) => {
                    setLookupSearchQuery(text);
                    if (!text) {
                      setLookupEmployee(null);
                      setLookupTransactions([]);
                    }
                  }}
                  placeholder="Search employee by name..."
                  placeholderTextColor={colors.textSecondary}
                />
                {lookupFilteredEmployees.length > 0 && !lookupEmployee && (
                  <View style={[styles.searchResults, { marginBottom: 12, marginTop: 0 }]}>
                    {lookupFilteredEmployees.slice(0, 5).map((emp) => (
                      <TouchableOpacity
                        key={emp.id}
                        style={styles.searchResultItem}
                        onPress={() => handleSelectLookupEmployee(emp)}
                      >
                        <Text style={styles.searchResultName}>{emp.name}</Text>
                        <Text style={styles.searchResultJob}>{emp.job_title} — ${emp.mcloones_bucks || 0}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {lookupEmployee && (
                  <>
                    {/* Employee Bucks Card */}
                    <View style={[styles.bucksCard, { marginBottom: 16, paddingVertical: 16 }]}>
                      <Text style={[styles.leaderboardName, { fontSize: 18, color: colors.text, marginBottom: 4 }]}>{lookupEmployee.name}</Text>
                      <Text style={[styles.leaderboardJob, { color: colors.textSecondary, marginBottom: 8 }]}>{lookupEmployee.job_title}</Text>
                      <Text style={[styles.bucksAmount, { fontSize: 36 }]}>${lookupEmployee.mcloones_bucks || 0}</Text>
                      <Text style={[styles.bucksLabel, { marginTop: 2 }]}>{currencyName} Balance</Text>
                    </View>

                    {/* Employee Transactions */}
                    <Text style={styles.sectionTitle}>Transaction History</Text>
                    {lookupTransactions.length === 0 ? (
                      <Text style={styles.emptyText}>No transactions found</Text>
                    ) : (
                      lookupTransactions.map((trans, index) => (
                        <View key={trans.id || index} style={styles.transactionItem}>
                          <View style={styles.transactionInfo}>
                            <Text style={styles.transactionDescription}>{trans.description}</Text>
                            <Text style={styles.transactionDate}>
                              {new Date(trans.created_at).toLocaleDateString()}
                            </Text>
                            {!trans.is_visible && (
                              <Text style={styles.hiddenBadge}>(hidden)</Text>
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
                          </View>
                        </View>
                      ))
                    )}
                  </>
                )}
              </View>
            ) : item === 'leaderboard' ? (
              <View style={styles.section}>
                {topEmployees.length === 0 ? (
                  <Text style={styles.emptyText}>No leaderboard data yet</Text>
                ) : (
                  topEmployees.map((emp, index) => (
                    <View key={emp.id || index} style={styles.leaderboardItem}>
                      <View style={[styles.leaderboardRank, {
                        backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : colors.primary,
                      }]}>
                        <Text style={styles.leaderboardRankText}>
                          {index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}
                        </Text>
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
            ) : (
              <View style={styles.section}>
                {recentTransactions.length === 0 ? (
                  <Text style={styles.emptyText}>{t('rewards_reviews_editor:no_transactions')}</Text>
                ) : (
                  recentTransactions.map((trans, index) => (
                    <View key={trans.id || index} style={styles.transactionItem}>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionEmployee}>
                          {trans.user_name || 'Unknown Employee'}
                        </Text>
                        <Text style={styles.transactionDescription}>{trans.description}</Text>
                        <Text style={styles.transactionDate}>
                          {new Date(trans.created_at).toLocaleDateString()}
                        </Text>
                        {!trans.is_visible && (
                          <Text style={styles.hiddenBadge}>{t('rewards_reviews_editor:hidden_badge')}</Text>
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
                              color={colors.primary}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleHideTransaction(trans)}
                            style={styles.actionIconButton}
                          >
                            <IconSymbol
                              ios_icon_name={trans.is_visible ? 'eye.slash.fill' : 'eye.fill'}
                              android_material_icon_name={trans.is_visible ? 'visibility-off' : 'visibility'}
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
            )}
              </ScrollView>
            )}
          />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          <>
            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rewardButton]}
                onPress={() => {
                  resetReviewForm();
                  setShowReviewModal(true);
                }}
              >
                <IconSymbol
                  ios_icon_name="plus.circle.fill"
                  android_material_icon_name="add-circle"
                  size={24}
                  color={colors.text}
                />
                <Text style={styles.actionButtonText}>{t('rewards_reviews_editor:add_review_button')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#4285F4' }]}
                onPress={handleRefreshGoogleReviews}
                disabled={refreshingGoogle}
              >
                {refreshingGoogle ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <IconSymbol
                    ios_icon_name="arrow.clockwise"
                    android_material_icon_name="refresh"
                    size={24}
                    color="#FFF"
                  />
                )}
                <Text style={[styles.actionButtonText, { color: '#FFF' }]}>
                  {refreshingGoogle ? t('rewards_reviews_editor:refreshing_reviews') : t('rewards_reviews_editor:refresh_google_reviews')}
                </Text>
                {!hasPremium && (
                  <IconSymbol
                    ios_icon_name="lock.fill"
                    android_material_icon_name="lock"
                    size={11}
                    color="rgba(255,255,255,0.6)"
                  />
                )}
              </TouchableOpacity>
            </View>

            {/* All Reviews List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('rewards_reviews_editor:guest_reviews_title')}</Text>
              {allReviews.length === 0 ? (
                <Text style={styles.emptyText}>{t('rewards_reviews_editor:no_reviews')}</Text>
              ) : (
                allReviews.map((review, index) => (
                  <View key={review.id || index} style={styles.reviewCard}>
                    {review.source === 'google' ? (
                      <>
                        <View style={styles.reviewHeader}>
                          <View style={styles.reviewHeaderLeft}>
                            <View style={styles.googleReviewAuthorRow}>
                              {review.author_image ? (
                                <Image
                                  source={review.author_image}
                                  style={styles.authorPhoto}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={[styles.authorPhotoFallback, { backgroundColor: colors.primary + '20' }]}>
                                  <IconSymbol
                                    ios_icon_name="person.fill"
                                    android_material_icon_name="person"
                                    size={18}
                                    color={colors.primary}
                                  />
                                </View>
                              )}
                              <Text style={[styles.reviewGuestName, { flex: 1, marginBottom: 0 }]}>{review.author_title}</Text>
                              <View style={styles.googleBadge}>
                                <Text style={styles.googleBadgeText}>G</Text>
                              </View>
                            </View>
                            {renderStars(review.review_rating)}
                          </View>
                          <View style={styles.reviewActions}>
                            <TouchableOpacity onPress={() => handleHideGoogleReview(review)}>
                              <IconSymbol
                                ios_icon_name={review.is_published ? 'eye.fill' : 'eye.slash.fill'}
                                android_material_icon_name={review.is_published ? 'visibility' : 'visibility-off'}
                                size={28}
                                color={review.is_published ? '#4CAF50' : '#FF9800'}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                        {!review.is_published && (
                          <Text style={styles.hiddenBadge}>{t('rewards_reviews_editor:hidden_review_badge')}</Text>
                        )}
                        {review.review_text ? (
                          <Text style={styles.reviewText}>
                            {getLocalizedField(review, 'review_text', language)}
                          </Text>
                        ) : null}
                        {review.owner_answer ? (
                          <View style={[styles.ownerReplyContainer, { borderLeftColor: colors.primary }]}>
                            <Text style={[styles.ownerReplyLabel, { color: colors.primary }]}>
                              {t('rewards_reviews_editor:owner_reply_label')}
                            </Text>
                            <Text style={styles.ownerReplyText}>
                              {getLocalizedField(review, 'owner_answer', language)}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.reviewDate}>
                          {new Date(review.review_datetime_utc).toLocaleDateString()}
                        </Text>
                      </>
                    ) : (
                      <>
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
                                color={colors.primary}
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
                      </>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        </ScrollView>
      )}

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Reward Modal */}
      <Modal visible={showRewardModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('rewards_reviews_editor:reward_modal_title')}</Text>
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
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Employee Search */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:search_employee_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('rewards_reviews_editor:search_employee_placeholder')}
                  placeholderTextColor={colors.textSecondary}
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
                      {t('rewards_reviews_editor:selected_prefix', { name: selectedEmployee.name })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Reward/Deduct Toggle */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:action_type_label')}</Text>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.toggleOptionButton,
                      isReward && styles.toggleOptionButtonActive,
                      isReward && styles.toggleOptionButtonReward,
                    ]}
                    onPress={() => setIsReward(true)}
                  >
                    <IconSymbol
                      ios_icon_name="plus.circle.fill"
                      android_material_icon_name="add-circle"
                      size={24}
                      color={isReward ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.toggleOptionText,
                        isReward && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('rewards_reviews_editor:reward_action')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleOptionButton,
                      !isReward && styles.toggleOptionButtonActive,
                      !isReward && styles.toggleOptionButtonDeduct,
                    ]}
                    onPress={() => setIsReward(false)}
                  >
                    <IconSymbol
                      ios_icon_name="minus.circle.fill"
                      android_material_icon_name="remove-circle"
                      size={24}
                      color={!isReward ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.toggleOptionText,
                        !isReward && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('rewards_reviews_editor:deduct_action')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:amount_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={rewardAmount}
                  onChangeText={setRewardAmount}
                  placeholder={t('rewards_reviews_editor:amount_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                />
                {rewardAmount && (
                  <Text style={styles.amountPreview}>
                    {isReward ? t('rewards_reviews_editor:amount_preview_add') : t('rewards_reviews_editor:amount_preview_deduct')}{' '}
                    <Text style={{ color: isReward ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>
                      {isReward ? '+' : '-'}${rewardAmount}
                    </Text>
                    {' '}{t('rewards_reviews_editor:amount_preview_suffix', { currencyName })}
                  </Text>
                )}
              </View>

              {/* Description */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:description_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={rewardDescription}
                  onChangeText={setRewardDescription}
                  placeholder={isReward ? t('rewards_reviews_editor:description_placeholder_reward') : t('rewards_reviews_editor:description_placeholder_deduct')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Visibility Toggle */}
              <View style={styles.formField}>
                <View style={styles.visibilityToggle}>
                  <Text style={styles.formLabel}>{t('rewards_reviews_editor:visible_to_employees')}</Text>
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
                  {t('rewards_reviews_editor:visibility_note')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleRewardEmployee}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isReward ? t('rewards_reviews_editor:submit_reward') : t('rewards_reviews_editor:submit_deduction')}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reset Bucks Modal */}
      <Modal visible={showResetBucksModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('rewards_reviews_editor:reset_modal_title', { currencyName })}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowResetBucksModal(false);
                  setResetSelectedEmployee(null);
                  setResetSearchQuery('');
                }}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.resetWarning}>
                {t('rewards_reviews_editor:reset_warning')}
              </Text>

              {/* Reset Single User */}
              <View style={styles.resetSection}>
                <Text style={styles.resetSectionTitle}>{t('rewards_reviews_editor:reset_single_title')}</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{t('rewards_reviews_editor:search_reset_employee_label')}</Text>
                  <TextInput
                    style={styles.formInput}
                    value={resetSearchQuery}
                    onChangeText={setResetSearchQuery}
                    placeholder={t('rewards_reviews_editor:search_employee_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  {resetFilteredEmployees.length > 0 && (
                    <View style={styles.searchResults}>
                      {resetFilteredEmployees.map((emp, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.searchResultItem}
                          onPress={() => {
                            setResetSelectedEmployee(emp);
                            setResetSearchQuery(emp.name);
                            setResetFilteredEmployees([]);
                          }}
                        >
                          <Text style={styles.searchResultName}>{emp.name}</Text>
                          <Text style={styles.searchResultJob}>
                            {emp.job_title} - Current: ${emp.mcloones_bucks || 0}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {resetSelectedEmployee && (
                    <View style={styles.selectedEmployee}>
                      <Text style={styles.selectedEmployeeText}>
                        {t('rewards_reviews_editor:selected_prefix', { name: resetSelectedEmployee.name })}
                      </Text>
                      <Text style={styles.selectedEmployeeBalance}>
                        Current Balance: ${resetSelectedEmployee.mcloones_bucks || 0}
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, styles.resetSingleButton]}
                  onPress={handleResetSingleUser}
                  disabled={loading || !resetSelectedEmployee}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.submitButtonText}>{t('rewards_reviews_editor:reset_selected_button')}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Reset All Users */}
              <View style={styles.resetSection}>
                <Text style={styles.resetSectionTitle}>{t('rewards_reviews_editor:reset_all_title')}</Text>
                <Text style={styles.resetAllWarning}>
                  {t('rewards_reviews_editor:reset_all_warning', { currencyName })}
                </Text>

                <TouchableOpacity
                  style={[styles.submitButton, styles.resetAllButton]}
                  onPress={handleResetAllUsers}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.submitButtonText}>{t('rewards_reviews_editor:reset_all_button')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal visible={showEditTransactionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('rewards_reviews_editor:edit_transaction_title')}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowEditTransactionModal(false);
                  setEditingTransaction(null);
                }}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Employee Info (Read-only) */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:employee_label')}</Text>
                <View style={[styles.formInput, styles.formInputDisabled]}>
                  <Text style={styles.formInputTextDisabled}>
                    {editingTransaction?.user_name || 'Unknown Employee'}
                  </Text>
                </View>
              </View>

              {/* Reward/Deduct Toggle */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:action_type_label')}</Text>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.toggleOptionButton,
                      editIsReward && styles.toggleOptionButtonActive,
                      editIsReward && styles.toggleOptionButtonReward,
                    ]}
                    onPress={() => setEditIsReward(true)}
                  >
                    <IconSymbol
                      ios_icon_name="plus.circle.fill"
                      android_material_icon_name="add-circle"
                      size={24}
                      color={editIsReward ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.toggleOptionText,
                        editIsReward && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('rewards_reviews_editor:reward_action')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleOptionButton,
                      !editIsReward && styles.toggleOptionButtonActive,
                      !editIsReward && styles.toggleOptionButtonDeduct,
                    ]}
                    onPress={() => setEditIsReward(false)}
                  >
                    <IconSymbol
                      ios_icon_name="minus.circle.fill"
                      android_material_icon_name="remove-circle"
                      size={24}
                      color={!editIsReward ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.toggleOptionText,
                        !editIsReward && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('rewards_reviews_editor:deduct_action')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:amount_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  placeholder={t('rewards_reviews_editor:amount_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                />
                {editAmount && (
                  <Text style={styles.amountPreview}>
                    {editIsReward ? t('rewards_reviews_editor:amount_preview_add') : t('rewards_reviews_editor:amount_preview_deduct')}{' '}
                    <Text style={{ color: editIsReward ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>
                      {editIsReward ? '+' : '-'}${editAmount}
                    </Text>
                    {' '}{t('rewards_reviews_editor:amount_preview_suffix', { currencyName })}
                  </Text>
                )}
              </View>

              {/* Description */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:description_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder={editIsReward ? t('rewards_reviews_editor:description_placeholder_reward') : t('rewards_reviews_editor:description_placeholder_deduct')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveEditTransaction}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>{t('rewards_reviews_editor:save_changes')}</Text>
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
                {editingReview ? t('rewards_reviews_editor:edit_review_modal_title') : t('rewards_reviews_editor:add_review_modal_title')}
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
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Guest Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:guest_name_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.guest_name}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, guest_name: text })
                  }
                  placeholder={t('rewards_reviews_editor:guest_name_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Rating */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:rating_label')}</Text>
                <View style={styles.ratingSelector}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setReviewForm({ ...reviewForm, rating: star })}
                    >
                      <IconSymbol
                        ios_icon_name={star <= reviewForm.rating ? 'star.fill' : 'star'}
                        android_material_icon_name={
                          star <= reviewForm.rating ? 'star' : 'star-border'
                        }
                        size={40}
                        color={star <= reviewForm.rating ? '#FFD700' : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Review Text */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:review_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={reviewForm.review_text}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, review_text: text })
                  }
                  placeholder={t('rewards_reviews_editor:review_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={6}
                />
              </View>

              {/* Review Date */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:review_date_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.review_date}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, review_date: text })
                  }
                  placeholder={t('rewards_reviews_editor:review_date_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('rewards_reviews_editor:display_order_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={reviewForm.display_order.toString()}
                  onChangeText={(text) =>
                    setReviewForm({ ...reviewForm, display_order: parseInt(text) || 0 })
                  }
                  placeholder={t('rewards_reviews_editor:display_order_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveReview}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingReview ? t('rewards_reviews_editor:update_review_button') : t('rewards_reviews_editor:add_review_submit')}
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
