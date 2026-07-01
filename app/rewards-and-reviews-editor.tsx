
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Dimensions,
  Animated,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import AmbientGlow from '@/components/AmbientGlow';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import { fonts } from '@/constants/fonts';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
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
  const params = useLocalSearchParams<{ tab?: string }>();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();
  const { hasPremium } = useSubscription();
  const currencyName = organization.reward_currency_name;
  const { sendNotification } = useNotification();
  const { pendingCount } = usePendingApprovals();
  const { hasNew: managerRecentHasNew, markRecentViewed: markManagerRecentViewed } = useUnreadAwards();

  // Role gating: managers/owners manage; only the OWNER can manually refresh
  // Google reviews (they pay for the subscription / Outscraper usage).
  const isOwner = user?.role === 'owner';
  const isManagerOrOwner = user?.role === 'owner' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<'rewards' | 'reviews'>('rewards');
  const [loading, setLoading] = useState(false);

  // Honor a ?tab= route param so callers (e.g. the Manage cockpit Rating /
  // Rewards tiles) can deep-link straight to the Reviews or Rewards tab.
  useEffect(() => {
    if (params?.tab === 'reviews' || params?.tab === 'rewards') {
      setActiveTab(params.tab);
    }
  }, [params?.tab]);

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

  // Sub-tab state. Employees see Leaderboard + Recent; managers/owners also Lookup.
  const [rewardsSubTab, setRewardsSubTab] = useState<'leaderboard' | 'recent' | 'lookup'>('leaderboard');
  const SUB_PAGES = useMemo(
    () => (isManagerOrOwner ? (['leaderboard', 'recent', 'lookup'] as const) : (['leaderboard', 'recent'] as const)),
    [isManagerOrOwner]
  );
  const goToSubTab = (tab: 'leaderboard' | 'recent' | 'lookup') => {
    setRewardsSubTab(tab);
    if (tab === 'recent') markManagerRecentViewed();
  };

  // Horizontal swipe between the Rewards sub-tabs (Leaderboard/Recent/Lookup).
  // Edge-aware: hitSlop excludes the left ~30px so the native swipe-back-from-left
  // to the previous screen is preserved; failOffsetY lets the vertical scroll (and
  // the header collapse it drives) work untouched — only clearly-horizontal swipes
  // switch tabs.
  const onBodySwipe = (e: any) => {
    if (e?.nativeEvent?.state !== State.END) return;
    if (activeTab !== 'rewards') return;
    const { translationX = 0, velocityX = 0 } = e.nativeEvent;
    const pages = SUB_PAGES as readonly ('leaderboard' | 'recent' | 'lookup')[];
    const i = pages.indexOf(rewardsSubTab);
    if ((translationX <= -55 || velocityX < -650) && i < pages.length - 1) {
      goToSubTab(pages[i + 1]);
    } else if ((translationX >= 55 || velocityX > 650) && i > 0) {
      goToSubTab(pages[i - 1]);
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

  // Owner-only manual-refresh allowance for the current billing period.
  const [refreshRemaining, setRefreshRemaining] = useState<number | null>(null);
  // My Bucks tile "flips" (owner/manager) to reveal Redeem Settings access.
  const [bucksSettings, setBucksSettings] = useState(false);
  // First-visit glow on the My Bucks tile until the owner opens Redeem Settings.
  const [redeemGlow, setRedeemGlow] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  // ── Sticky / collapsing header ─────────────────────────────────────────
  // The title + nav tiles stay locked; on the Rewards tab the action bar
  // (Reward/Deduct/Reset/Approve) collapses up behind the tiles as the list
  // scrolls, and the Leaderboard/Recent/Lookup sub-tabs pin under the tiles.
  const scrollRef = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerBlockH, setHeaderBlockH] = useState(0);
  const [actsH, setActsH] = useState(0);
  const collapseDist = Math.max(1, actsH);
  const collapseTranslate = scrollY.interpolate({
    inputRange: [0, collapseDist],
    outputRange: [0, -collapseDist],
    extrapolate: 'clamp',
  });
  const actsOpacity = scrollY.interpolate({
    inputRange: [0, collapseDist * 0.75],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // Reset the collapse whenever the active tab or sub-tab changes so a switch
  // always shows the full header (and never leaves the list scrolled past its
  // new, shorter content).
  useEffect(() => {
    scrollY.setValue(0);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [activeTab, rewardsSubTab, scrollY]);

  useEffect(() => {
    if (!isManagerOrOwner || !organizationId) return;
    AsyncStorage.getItem(`@redeem_settings_seen:${organizationId}`).then((v) => {
      if (!v) {
        setRedeemGlow(true);
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])
        ).start();
      }
    });
  }, [isManagerOrOwner, organizationId, glowAnim]);

  const openRedeemSettings = useCallback(() => {
    if (organizationId) AsyncStorage.setItem(`@redeem_settings_seen:${organizationId}`, '1');
    setRedeemGlow(false);
    router.push('/redeem-settings' as any);
  }, [organizationId, router]);

  // Aggregate Google rating (published only) — shown on the Reviews tile.
  const { ratingAvg, ratingCount } = useMemo(() => {
    const pub = googleReviews.filter((r) => r.is_published);
    const count = pub.length;
    const avg = count ? pub.reduce((s, r) => s + (r.review_rating || 0), 0) / count : 0;
    return { ratingAvg: avg, ratingCount: count };
  }, [googleReviews]);

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

  // Owner-only: load the remaining manual refreshes for the billing period.
  const fetchRefreshQuota = useCallback(async () => {
    if (!isOwner || !user?.id || !organizationId) return;
    try {
      const { data } = await (supabase as any).rpc('get_review_refresh_quota', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      if (data?.success) setRefreshRemaining(data.remaining ?? 0);
    } catch (e) {
      console.warn('refresh quota error', e);
    }
  }, [isOwner, user?.id, organizationId]);

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
    fetchRefreshQuota();
  }, [fetchEmployees, fetchRewardsData, fetchReviews, fetchGoogleReviews, fetchRefreshQuota]);

  // Re-fetch on focus (e.g. returning from the Approvals screen) so an approved
  // or denied redemption immediately updates the leaderboard balances + the
  // Recent list — no manual navigate-away-and-back needed.
  useFocusEffect(
    useCallback(() => {
      fetchEmployees();
      fetchRewardsData();
    }, [fetchEmployees, fetchRewardsData])
  );

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

              // Step 1: Delete all transactions for this user
              const { error: deleteError } = await supabase
                .from('rewards_transactions')
                .delete()
                .eq('user_id', resetSelectedEmployee.id);

              if (deleteError) throw deleteError;

              // Step 2: Recalculate the balance from remaining transactions (should be 0)
              const { data: sumData, error: sumError } = await supabase
                .from('rewards_transactions')
                .select('amount')
                .eq('user_id', resetSelectedEmployee.id);

              if (sumError) throw sumError;

              const totalBucks = sumData?.reduce((sum, trans) => sum + trans.amount, 0) || 0;

              // Step 3: Update user's bucks to the calculated total (should be 0)
              const { error: updateError } = await supabase
                .from('users')
                .update({ mcloones_bucks: totalBucks })
                .eq('id', resetSelectedEmployee.id)
                .select();

              if (updateError) throw updateError;

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

              // Step 1: Delete all transactions
              const { error: deleteError } = await supabase
                .from('rewards_transactions')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

              if (deleteError) throw deleteError;

              // Step 2: Get all active users
              const { data: allUsers, error: fetchError } = await supabase
                .from('users')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('is_active', true);

              if (fetchError) throw fetchError;

              // Step 3: For each user, recalculate their balance from remaining transactions (should be 0)
              if (allUsers && allUsers.length > 0) {
                for (const userRecord of allUsers) {
                  const { data: sumData, error: sumError } = await supabase
                    .from('rewards_transactions')
                    .select('amount')
                    .eq('user_id', userRecord.id);

                  if (sumError) {
                    console.error(`Error calculating sum for user ${userRecord.id}:`, sumError);
                    continue;
                  }

                  const totalBucks = sumData?.reduce((sum, trans) => sum + trans.amount, 0) || 0;

                  const { error: updateError } = await supabase
                    .from('users')
                    .update({ mcloones_bucks: totalBucks })
                    .eq('id', userRecord.id);

                  if (updateError) {
                    console.error(`Error updating user ${userRecord.id}:`, updateError);
                  }
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

      // Use the database function to update transaction and recalculate balance
      const { error } = await supabase.rpc('update_transaction_and_balance', {
        p_manager_id: user.id,
        p_transaction_id: editingTransaction.id,
        p_new_amount: finalAmount,
        p_new_description: editDescription,
        p_organization_id: organizationId,
      });

      if (error) throw error;

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

  const renderStars = (rating: number, size = 14) => (
    <View style={styles.starsRow}>
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

  // Owner-only manual refresh, capped per billing period. The Mon/Thu auto
  // refresh is free and does NOT count toward this limit.
  const doRefreshGoogleReviews = async () => {
    try {
      setRefreshingGoogle(true);
      // Reserve one refresh credit (owner-gated, billing-period cap).
      const { data: cap, error: capErr } = await (supabase as any).rpc('consume_review_refresh', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
      });
      if (capErr) throw capErr;
      if (!cap?.ok) {
        if (cap?.reason === 'limit_reached') {
          setRefreshRemaining(0);
          Alert.alert(t('rewards_reviews_editor:refresh_limit_title'), t('rewards_reviews_editor:refresh_limit_message'));
        } else {
          Alert.alert(t('common:error'), t('rewards_reviews_editor:refresh_error'));
        }
        return;
      }
      setRefreshRemaining(cap.remaining ?? 0);

      const { data, error } = await supabase.functions.invoke('import-google-reviews', {
        body: { source: 'manual', user_id: user?.id, organization_id: organizationId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Import failed');
      // The import runs asynchronously (submitted to Outscraper, ingested later
      // via webhook), so there's no synchronous count — tell the owner it's
      // importing and refetch shortly so newly-landed reviews appear.
      Alert.alert(
        t('rewards_reviews_editor:refresh_queued_title'),
        t('rewards_reviews_editor:refresh_queued_message')
      );
      setTimeout(() => fetchGoogleReviews(), 4000);
    } catch (error: any) {
      console.error('Error refreshing Google reviews:', error);
      Alert.alert(t('common:error'), error.message || t('rewards_reviews_editor:refresh_error'));
    } finally {
      setRefreshingGoogle(false);
    }
  };

  const handleRefreshGoogleReviews = () => {
    if (!hasPremium) {
      Alert.alert(
        t('rewards_reviews_editor:premium_feature_title'),
        t('rewards_reviews_editor:premium_feature_msg'),
        [
          { text: t('common:not_now'), style: 'cancel' },
          { text: t('rewards_reviews_editor:upgrade'), onPress: () => router.push('/subscription-management' as any) },
        ]
      );
      return;
    }
    if (!isOwner) return; // owners only — the button is hidden for managers
    const remaining = refreshRemaining ?? 0;
    Alert.alert(
      t('rewards_reviews_editor:refresh_confirm_title'),
      t('rewards_reviews_editor:refresh_confirm_message', { count: remaining }),
      [
        { text: t('common:not_now'), style: 'cancel' },
        { text: t('rewards_reviews_editor:refresh_now'), onPress: doRefreshGoogleReviews },
      ]
    );
  };

  // ── Reusable bits ──────────────────────────────────────────────────────
  // A plain function (NOT a nested component) so the modal's TextInputs keep
  // focus across re-renders — a `<Sheet/>` component redefined each render would
  // remount and drop focus on every keystroke.
  const sheetShell = (title: string, onClose: () => void, children: React.ReactNode) => (
    <View style={styles.sheetWrap}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <GlassCard variant="glass" radius={26} intensity={32} style={styles.sheet}>
        <View style={styles.grab} />
        <View style={styles.mtitleRow}>
          <Text style={styles.mtitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </GlassCard>
    </View>
  );

  const amountPreview = (amount: string, reward: boolean) => {
    const n = parseInt(amount);
    if (!amount || isNaN(n)) return null;
    return (
      <Text style={styles.amtPrev}>
        {reward ? t('rewards_reviews_editor:amount_preview_add', 'Will add') : t('rewards_reviews_editor:amount_preview_deduct', 'Will deduct')}{' '}
        <Text style={{ color: reward ? '#34C759' : '#FF6B6B', fontFamily: fonts.mono.semibold }}>
          {reward ? '+' : '-'}${n}
        </Text>{' '}
        {t('rewards_reviews_editor:amount_preview_suffix', { currencyName, defaultValue: `to ${currencyName}` })}
      </Text>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <AmbientGlow />

      {/* Scrolling content sits UNDER the fixed header; paddingTop reserves the
          header's full (expanded) height so the first row tucks under the
          pinned sub-tabs once the action bar collapses. The PanGestureHandler
          adds horizontal swipe between the Rewards sub-tabs while preserving
          vertical scroll (failOffsetY) and the native left-edge back-swipe
          (hitSlop excludes the left edge). */}
      <PanGestureHandler
        enabled={activeTab === 'rewards'}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-15, 15]}
        hitSlop={{ left: -30 }}
        onHandlerStateChange={onBodySwipe}
      >
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.screen}
          contentContainerStyle={[styles.screenContent, { paddingTop: (headerBlockH || 240) + 6 }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {activeTab === 'rewards' ? renderRewards() : renderReviews()}
        </Animated.ScrollView>
      </PanGestureHandler>

      {/* Fixed, collapsing header: identity rail + nav tiles stay LOCKED; on the
          Rewards tab the action bar collapses up behind the tiles and the
          Leaderboard/Recent/Lookup sub-tabs pin underneath. */}
      <View
        style={styles.fixedTop}
        onLayout={(e) => setHeaderBlockH(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
        {/* Locked head (title + nav tiles) over an OPAQUE backdrop so the list
            scrolling up is hidden behind the translucent tiles; the glow is
            re-drawn so the header still reads edge-to-edge. */}
        <View style={[styles.lockedHead, { paddingTop: insets.top + 8 }]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            <AmbientGlow />
          </View>
        <View style={styles.idbar}>
          <Pressable style={styles.bk} onPress={() => router.back()} hitSlop={8}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.idTitle}>{t('rewards_reviews_editor:title', 'Rewards & Reviews')}</Text>
            <Text style={styles.idSub}>
              {activeTab === 'rewards' ? t('rewards_reviews_editor:tab_rewards', 'Rewards') : t('rewards_reviews_editor:tab_reviews', 'Reviews')}
            </Text>
          </View>
        </View>

        {/* Nav tiles — these REPLACE the tab bar (tap to switch views) */}
        <View style={styles.navtiles}>
          <Pressable
            style={[styles.ntile, activeTab === 'rewards' && styles.ntileOn]}
            onPress={() => {
              if (activeTab !== 'rewards') { setActiveTab('rewards'); setBucksSettings(false); }
              else if (isManagerOrOwner) { setBucksSettings((v) => !v); }
            }}
          >
            {redeemGlow && isManagerOrOwner && activeTab === 'rewards' && !bucksSettings && (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 1.5, borderColor: colors.tint, opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.95] }) }]}
              />
            )}
            {activeTab !== 'rewards' && (
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} style={styles.goav} />
            )}
            {activeTab === 'rewards' && isManagerOrOwner && (
              <IconSymbol ios_icon_name={bucksSettings ? 'arrow.uturn.backward' : 'gearshape.fill'} android_material_icon_name={bucksSettings ? 'undo' : 'settings'} size={13} color={colors.tint} style={styles.goav} />
            )}
            {bucksSettings && isManagerOrOwner ? (
              <>
                <View style={styles.nlblRow}>
                  <IconSymbol ios_icon_name="gift.fill" android_material_icon_name="card-giftcard" size={13} color={colors.tint} />
                  <Text style={[styles.nlbl, { color: colors.tint }]} numberOfLines={1}>{t('rewards_reviews_editor:redeem_label', 'Redeem')}</Text>
                </View>
                <Pressable style={styles.redeemSettingsBtn} onPress={openRedeemSettings}>
                  <IconSymbol ios_icon_name="slider.horizontal.3" android_material_icon_name="tune" size={15} color={colors.fireText} />
                  <Text style={styles.redeemSettingsTxt}>{t('rewards_reviews_editor:redeem_settings', 'Redeem Settings')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.nlblRow}>
                  <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="paid" size={13} color={activeTab === 'rewards' ? colors.tint : colors.textSecondary} />
                  <Text style={[styles.nlbl, activeTab === 'rewards' && { color: colors.tint }]} numberOfLines={1}>
                    {t('rewards_reviews_editor:my_bucks_label', { currencyName, defaultValue: `My ${currencyName}` })}
                  </Text>
                </View>
                <Text style={[styles.nnum, activeTab === 'rewards' && { color: colors.tint }]}>{myBucks.toLocaleString()}</Text>
                <Text style={styles.nsub}>{t('rewards_reviews_editor:your_balance', 'Your balance')}</Text>
              </>
            )}
          </Pressable>

          <Pressable style={[styles.ntile, activeTab === 'reviews' && styles.ntileOn]} onPress={() => setActiveTab('reviews')}>
            {activeTab !== 'reviews' && (
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} style={styles.goav} />
            )}
            <View style={styles.nlblRow}>
              <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={13} color={activeTab === 'reviews' ? colors.tint : colors.textSecondary} />
              <Text style={[styles.nlbl, activeTab === 'reviews' && { color: colors.tint }]} numberOfLines={1}>
                {t('rewards_reviews_editor:tab_reviews', 'Reviews')}
              </Text>
            </View>
            <View style={styles.nnumRow}>
              <Text style={[styles.nnum, activeTab === 'reviews' && { color: colors.tint }]}>{ratingCount ? ratingAvg.toFixed(1) : '—'}</Text>
              {ratingCount > 0 && (
                <View style={styles.rtag}>
                  <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color="#FFD45E" />
                  <Text style={styles.rtagTxt}>{t('rewards_reviews_editor:rating', 'Rating')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.nsub}>{t('rewards_reviews_editor:n_google_reviews', { count: ratingCount, defaultValue: `${ratingCount} Google reviews` })}</Text>
          </Pressable>
        </View>
        </View>

        {/* The collapsing controls (action bar on Rewards, Add Review/Refresh on
            Reviews) fade up behind the tiles as you scroll. On Rewards the
            sub-tabs then PIN under the tiles over an opaque strip so the list
            tucks cleanly behind them; on Reviews there's nothing pinned, so the
            cards tuck straight behind the tiles. */}
        <View style={styles.clip}>
          <Animated.View style={{ transform: [{ translateY: collapseTranslate }] }}>
            <Animated.View style={{ opacity: actsOpacity }} onLayout={(e) => setActsH(e.nativeEvent.layout.height)}>
              {activeTab === 'rewards'
                ? (isManagerOrOwner ? renderActionBar() : null)
                : renderReviewButtons()}
            </Animated.View>
            {activeTab === 'rewards' && (
              <View style={styles.subTabsWrap}>
                <View style={[styles.subTabsBackdrop, { backgroundColor: colors.background }]} pointerEvents="none" />
                {renderSubTabs()}
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      <BottomNavBar activeTab="manage" />
      {/* This editor is a pushed route (outside the tab layout), so render the
          Jolt companion here too — the corner FAB / command palette. */}
      <JoltOverlay role="manager" />

      {renderRewardModal()}
      {renderResetModal()}
      {renderEditTransactionModal()}
      {renderReviewModal()}

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      )}
    </KeyboardAvoidingView>
  );

  // ── Rewards view ───────────────────────────────────────────────────────
  // The action bar + sub-tabs live in the FIXED header overlay (so they lock /
  // collapse); only the list lives in the scroll body.
  function renderActionBar() {
    return (
      <View style={styles.acts}>
        <Pressable style={styles.act} onPress={() => { setIsReward(true); setShowRewardModal(true); }}>
          <IconSymbol ios_icon_name="gift.fill" android_material_icon_name="card-giftcard" size={21} color={colors.tint} />
          <Text style={styles.actTxt}>{t('rewards_ui:manager_reward', 'Reward')}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={() => { setIsReward(false); setShowRewardModal(true); }}>
          <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={21} color={colors.tint} />
          <Text style={styles.actTxt}>{t('rewards_ui:manager_deduct', 'Deduct')}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={() => setShowResetBucksModal(true)}>
          <IconSymbol ios_icon_name="arrow.counterclockwise.circle.fill" android_material_icon_name="refresh" size={21} color={colors.tint} />
          <Text style={styles.actTxt}>{t('rewards_ui:manager_reset', 'Reset')}</Text>
        </Pressable>
        <Pressable style={styles.act} onPress={() => router.push('/manager-approvals' as any)}>
          {pendingCount > 0 && <View style={styles.actBadge}><Text style={styles.actBadgeTxt}>{pendingCount}</Text></View>}
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={21} color={colors.tint} />
          <Text style={styles.actTxt}>{t('rewards_ui:manager_approvals', 'Approve')}</Text>
        </Pressable>
      </View>
    );
  }

  function renderSubTabs() {
    return (
      <View style={styles.sub3}>
        {SUB_PAGES.map((p) => {
          const on = rewardsSubTab === p;
          const meta = p === 'leaderboard'
            ? { ios: 'trophy.fill', android: 'emoji-events', label: t('rewards_ui:tab_leaderboard', 'Leaderboard') }
            : p === 'recent'
            ? { ios: 'clock.fill', android: 'history', label: t('rewards_ui:tab_recent_short', 'Recent') }
            : { ios: 'magnifyingglass', android: 'search', label: t('rewards_ui:tab_lookup', 'Lookup') };
          return (
            <Pressable key={p} style={[styles.sub3Item, on && styles.sub3On]} onPress={() => goToSubTab(p)}>
              <IconSymbol ios_icon_name={meta.ios} android_material_icon_name={meta.android} size={14} color={on ? colors.text : colors.textSecondary} />
              <Text style={[styles.sub3Txt, on && { color: colors.text }]} numberOfLines={1}>{meta.label}</Text>
              {p === 'recent' && managerRecentHasNew && !on && <View style={styles.sub3Dot} />}
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderRewards() {
    return (
      <>
        {rewardsSubTab === 'leaderboard'
          ? renderLeaderboard()
          : rewardsSubTab === 'recent'
          ? renderRecent()
          : renderLookup()}
      </>
    );
  }

  function renderLeaderboard() {
    return (
      <View style={styles.pad2}>
        <Text style={styles.zlabel}>{t('rewards_ui:tab_leaderboard', 'Leaderboard')}</Text>
        {topEmployees.length === 0 ? (
          <Text style={styles.empty}>{t('rewards_reviews_editor:no_leaderboard', 'No leaderboard data yet')}</Text>
        ) : (
          topEmployees.map((emp, i) => (
            <TouchableOpacity key={emp.id} onPress={() => openMiniProfile(emp.id)} activeOpacity={0.75}>
              <GlassCard variant="surface" radius={15} style={styles.lcard}>
                <View style={[styles.medal, i === 0 ? styles.mGold : i === 1 ? styles.mSilver : i === 2 ? styles.mBronze : styles.mNeutral]}>
                  <Text style={[styles.medalTxt, i > 2 && { color: colors.tint }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lname} numberOfLines={1}>{emp.name}</Text>
                  <Text style={styles.ljob} numberOfLines={1}>{emp.job_title}</Text>
                </View>
                <Text style={styles.lbucks}>${(emp.mcloones_bucks || 0).toLocaleString()}</Text>
              </GlassCard>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  }

  function renderRecent() {
    return (
      <View style={styles.pad2}>
        <Text style={styles.zlabel}>{t('rewards_ui:tab_recent_short', 'Recent Awards')}</Text>
        {recentTransactions.length === 0 ? (
          <Text style={styles.empty}>{t('rewards_reviews_editor:no_transactions', 'No recent activity')}</Text>
        ) : (
          recentTransactions.map((trans) => (
            <GlassCard key={trans.id} variant="surface" radius={15} style={styles.txCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.txName} numberOfLines={1}>
                  {trans.user_name}
                  {!trans.is_visible && <Text style={styles.hiddenTag}>  {t('rewards_reviews_editor:hidden_badge', '(hidden)')}</Text>}
                </Text>
                <Text style={styles.txDesc} numberOfLines={2}>{trans.description}</Text>
                <Text style={styles.txDate}>{new Date(trans.created_at).toLocaleDateString()}</Text>
              </View>
              <View style={styles.txRight}>
                <Text style={[styles.txAmt, { color: trans.amount > 0 ? '#34C759' : '#FF6B6B' }]}>
                  {trans.amount > 0 ? '+' : '-'}${Math.abs(trans.amount)}
                </Text>
                {isManagerOrOwner && (
                  <View style={styles.txIcons}>
                    <Pressable onPress={() => handleEditTransaction(trans)} hitSlop={6}>
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.tint} />
                    </Pressable>
                    <Pressable onPress={() => handleHideTransaction(trans)} hitSlop={6}>
                      <IconSymbol
                        ios_icon_name={trans.is_visible ? 'eye.slash.fill' : 'eye.fill'}
                        android_material_icon_name={trans.is_visible ? 'visibility-off' : 'visibility'}
                        size={17}
                        color={trans.is_visible ? '#E0A23C' : '#34C759'}
                      />
                    </Pressable>
                    <Pressable onPress={() => handleDeleteTransaction(trans)} hitSlop={6}>
                      <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={17} color="#FF6B6B" />
                    </Pressable>
                  </View>
                )}
              </View>
            </GlassCard>
          ))
        )}
      </View>
    );
  }

  function renderLookup() {
    return (
      <View style={styles.pad2}>
        <GlassCard variant="glass" radius={14} style={styles.searchBar}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={17} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('rewards_reviews_editor:lookup_placeholder', 'Search employee by name…')}
            placeholderTextColor={colors.textSecondary}
            value={lookupSearchQuery}
            onChangeText={setLookupSearchQuery}
          />
        </GlassCard>

        {lookupFilteredEmployees.length > 0 && !lookupEmployee && (
          <View style={styles.resultList}>
            {lookupFilteredEmployees.slice(0, 5).map((emp) => (
              <Pressable key={emp.id} style={styles.resultRow} onPress={() => handleSelectLookupEmployee(emp)}>
                <Text style={styles.resultName}>{emp.name}</Text>
                <Text style={styles.resultSub}>{emp.job_title} · ${emp.mcloones_bucks || 0}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {lookupEmployee && (
          <>
            <GlassCard variant="surface" radius={16} style={styles.lookupCard}>
              <Text style={styles.lookupName}>{lookupEmployee.name}</Text>
              <Text style={styles.lookupJob}>{lookupEmployee.job_title}</Text>
              <Text style={styles.lookupBucks}>${(lookupEmployee.mcloones_bucks || 0).toLocaleString()}</Text>
              <Text style={styles.lookupBal}>{t('rewards_reviews_editor:balance_label', { currencyName, defaultValue: `${currencyName} Balance` })}</Text>
            </GlassCard>
            <Text style={styles.zlabel}>{t('rewards_reviews_editor:transaction_history', 'Transaction History')}</Text>
            {lookupTransactions.length === 0 ? (
              <Text style={styles.empty}>{t('rewards_reviews_editor:no_transactions_found', 'No transactions found')}</Text>
            ) : (
              lookupTransactions.map((trans) => (
                <GlassCard key={trans.id} variant="surface" radius={14} style={styles.txCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.txDesc} numberOfLines={2}>{trans.description}</Text>
                    <Text style={styles.txDate}>{new Date(trans.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.txAmt, { color: trans.amount > 0 ? '#34C759' : '#FF6B6B' }]}>
                    {trans.amount > 0 ? '+' : '-'}${Math.abs(trans.amount)}
                  </Text>
                </GlassCard>
              ))
            )}
          </>
        )}
      </View>
    );
  }

  // ── Reviews view ───────────────────────────────────────────────────────
  // The Add Review / Refresh buttons live in the FIXED header overlay so they
  // lock while the review cards scroll underneath.
  function renderReviewButtons() {
    return (
      <View style={styles.rvbtns}>
        {isManagerOrOwner && (
          <Pressable style={[styles.rvb, styles.rvbAdd]} onPress={() => { resetReviewForm(); setShowReviewModal(true); }}>
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={17} color={colors.text} />
            <Text style={[styles.rvbTxt, { color: colors.text }]}>{t('rewards_reviews_editor:add_review_button', 'Add Review')}</Text>
          </Pressable>
        )}
        {isOwner && (
          <Pressable style={[styles.rvb, styles.rvbRef]} onPress={handleRefreshGoogleReviews} disabled={refreshingGoogle}>
            {refreshingGoogle ? (
              <ActivityIndicator size="small" color={colors.blueText} />
            ) : (
              <>
                <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={16} color={colors.blueText} />
                <Text style={[styles.rvbTxt, { color: colors.blueText }]}>{t('rewards_reviews_editor:refresh_short', 'Refresh')}</Text>
                {refreshRemaining !== null && (
                  <View style={styles.refLim}><Text style={styles.refLimTxt}>{t('rewards_reviews_editor:n_left', { count: refreshRemaining, defaultValue: `${refreshRemaining} left` })}</Text></View>
                )}
              </>
            )}
          </Pressable>
        )}
      </View>
    );
  }

  function renderReviews() {
    return (
      <View>
        <Text style={styles.zlabel}>{t('rewards_reviews_editor:guest_reviews_title', 'Guest reviews')}</Text>
        {allReviews.length === 0 ? (
          <Text style={styles.empty}>{t('rewards_reviews_editor:no_reviews', 'No reviews yet')}</Text>
        ) : (
          allReviews.map((review) =>
            review.source === 'google' ? renderGoogleReview(review) : renderManualReview(review)
          )
        )}
      </View>
    );
  }

  function renderGoogleReview(review: GoogleReview & { source: 'google' }) {
    const text = getLocalizedField(review as any, 'review_text', language);
    const reply = getLocalizedField(review as any, 'owner_answer', language);
    return (
      <GlassCard key={review.id} variant="surface" radius={16} style={styles.rev}>
        <View style={styles.rvHead}>
          {review.author_image ? (
            <Image source={{ uri: review.author_image }} style={styles.rvAvImg} />
          ) : (
            <View style={styles.rvAv}><IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={16} color={colors.tint} /></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rvName} numberOfLines={1}>{review.author_title}</Text>
            {renderStars(review.review_rating, 12)}
          </View>
          <View style={styles.gBadge}><Text style={styles.gBadgeTxt}>G</Text></View>
          {isManagerOrOwner && (
            <Pressable onPress={() => handleHideGoogleReview(review)} hitSlop={6} style={{ marginLeft: 8 }}>
              <IconSymbol
                ios_icon_name={review.is_published ? 'eye.fill' : 'eye.slash.fill'}
                android_material_icon_name={review.is_published ? 'visibility' : 'visibility-off'}
                size={18}
                color={review.is_published ? '#34C759' : '#E0A23C'}
              />
            </Pressable>
          )}
        </View>
        {!review.is_published && <Text style={styles.hiddenTag}>{t('rewards_reviews_editor:hidden_review_badge', '(hidden)')}</Text>}
        {!!text && <Text style={styles.rvText}>{text}</Text>}
        {!!reply && (
          <View style={styles.rvReply}>
            <Text style={styles.rvReplyLbl}>{t('rewards_reviews_editor:owner_reply_label', 'Owner reply')}</Text>
            <Text style={styles.rvReplyTxt}>{reply}</Text>
          </View>
        )}
        <Text style={styles.rvDate}>{new Date(review.review_datetime_utc).toLocaleDateString()}</Text>
      </GlassCard>
    );
  }

  function renderManualReview(review: GuestReview & { source: 'manual' }) {
    return (
      <GlassCard key={review.id} variant="surface" radius={16} style={styles.rev}>
        <View style={styles.rvHead}>
          <View style={styles.rvAv}><Text style={styles.rvAvTxt}>{review.guest_name?.charAt(0)?.toUpperCase() || '?'}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rvName} numberOfLines={1}>{review.guest_name}</Text>
            {renderStars(review.rating, 12)}
          </View>
          {isManagerOrOwner && (
            <View style={styles.txIcons}>
              <Pressable onPress={() => handleEditReview(review)} hitSlop={6}>
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.tint} />
              </Pressable>
              <Pressable onPress={() => handleDeleteReview(review.id)} hitSlop={6}>
                <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={17} color="#FF6B6B" />
              </Pressable>
            </View>
          )}
        </View>
        {!!review.review_text && <Text style={styles.rvText}>{review.review_text}</Text>}
        <Text style={styles.rvDate}>{new Date(review.review_date).toLocaleDateString()}</Text>
      </GlassCard>
    );
  }

  // ── Modals (glass bottom sheets) ───────────────────────────────────────
  function renderRewardModal() {
    return (
      <Modal visible={showRewardModal} transparent animationType="slide" onRequestClose={() => setShowRewardModal(false)}>
        {sheetShell(isReward ? t('rewards_reviews_editor:reward_modal_title', 'Reward an Employee') : t('rewards_reviews_editor:deduct_modal_title', 'Deduct Bucks'), () => { setShowRewardModal(false); resetRewardForm(); }, (<>
          <Text style={styles.flbl}>{t('rewards_reviews_editor:search_employee_label', 'Employee')}</Text>
          {selectedEmployee ? (
            <View style={styles.echip}>
              <View style={styles.echipAv}><Text style={styles.echipAvTxt}>{selectedEmployee.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.echipName}>{selectedEmployee.name}</Text>
                <Text style={styles.echipJob}>{selectedEmployee.job_title}</Text>
              </View>
              <Pressable onPress={() => { setSelectedEmployee(null); setSearchQuery(''); }} hitSlop={8}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <>
              <GlassCard variant="glass" radius={13} style={styles.searchBar}>
                <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={17} color={colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('rewards_reviews_editor:search_employee_placeholder', 'Search by name…')}
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </GlassCard>
              {filteredEmployees.slice(0, 6).map((emp) => (
                <Pressable key={emp.id} style={styles.resultRow} onPress={() => { setSelectedEmployee(emp); setSearchQuery(emp.name); setFilteredEmployees([]); }}>
                  <Text style={styles.resultName}>{emp.name}</Text>
                  <Text style={styles.resultSub}>{emp.job_title}</Text>
                </Pressable>
              ))}
            </>
          )}

          <Text style={styles.flbl}>{t('rewards_reviews_editor:action_type_label', 'Action')}</Text>
          <View style={styles.rdseg}>
            <Pressable style={[styles.rdopt, isReward && styles.rdoptGood]} onPress={() => setIsReward(true)}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={18} color={isReward ? '#34C759' : colors.textSecondary} />
              <Text style={[styles.rdoptTxt, isReward && { color: '#34C759' }]}>{t('rewards_reviews_editor:reward_action', 'Reward')}</Text>
            </Pressable>
            <Pressable style={[styles.rdopt, !isReward && styles.rdoptBad]} onPress={() => setIsReward(false)}>
              <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={18} color={!isReward ? '#FF6B6B' : colors.textSecondary} />
              <Text style={[styles.rdoptTxt, !isReward && { color: '#FF6B6B' }]}>{t('rewards_reviews_editor:deduct_action', 'Deduct')}</Text>
            </Pressable>
          </View>

          <Text style={styles.flbl}>{t('rewards_reviews_editor:amount_label', 'Amount')}</Text>
          <TextInput
            style={styles.finput}
            placeholder={t('rewards_reviews_editor:amount_placeholder', 'Enter amount')}
            placeholderTextColor={colors.textSecondary}
            value={rewardAmount}
            onChangeText={setRewardAmount}
            keyboardType="numeric"
          />
          {amountPreview(rewardAmount, isReward)}

          <Text style={styles.flbl}>{t('rewards_reviews_editor:description_label', 'Reason')}</Text>
          <TextInput
            style={styles.farea}
            placeholder={isReward ? t('rewards_reviews_editor:description_placeholder_reward', 'What is this reward for?') : t('rewards_reviews_editor:description_placeholder_deduct', 'Reason for the deduction')}
            placeholderTextColor={colors.textSecondary}
            value={rewardDescription}
            onChangeText={setRewardDescription}
            multiline
          />

          <View style={styles.toggleRow}>
            <Pressable style={[styles.tsw, { backgroundColor: isVisible ? '#34C759' : colors.glassBorder }]} onPress={() => setIsVisible(!isVisible)}>
              <View style={[styles.tswKnob, { alignSelf: isVisible ? 'flex-end' : 'flex-start' }]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.tglTxt}>{t('rewards_reviews_editor:visible_to_employees', 'Visible to employee')}</Text>
              <Text style={styles.tglSub}>{t('rewards_reviews_editor:visibility_note', "They'll see this in their feed")}</Text>
            </View>
          </View>

          <Pressable style={styles.msubmit} onPress={handleRewardEmployee} disabled={loading}>
            <IconSymbol ios_icon_name={isReward ? 'gift.fill' : 'minus.circle.fill'} android_material_icon_name={isReward ? 'card-giftcard' : 'remove-circle'} size={18} color={colors.fireText} />
            <Text style={styles.msubmitTxt}>{isReward ? t('rewards_reviews_editor:submit_reward', 'Give Reward') : t('rewards_reviews_editor:submit_deduction', 'Deduct Bucks')}</Text>
          </Pressable>
        </>))}
      </Modal>
    );
  }

  function renderResetModal() {
    return (
      <Modal visible={showResetBucksModal} transparent animationType="slide" onRequestClose={() => setShowResetBucksModal(false)}>
        {sheetShell(t('rewards_reviews_editor:reset_modal_title', { currencyName, defaultValue: `Reset ${currencyName}` }), () => setShowResetBucksModal(false), (<>
          <View style={styles.warnBox}><Text style={styles.warnTxt}>{t('rewards_reviews_editor:reset_warning', 'Resetting deletes all transactions and zeroes the balance. This cannot be undone.')}</Text></View>

          <Text style={styles.flbl}>{t('rewards_reviews_editor:reset_single_title', 'Reset a single user')}</Text>
          <GlassCard variant="glass" radius={13} style={styles.searchBar}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={17} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('rewards_reviews_editor:search_employee_placeholder', 'Search by name…')}
              placeholderTextColor={colors.textSecondary}
              value={resetSearchQuery}
              onChangeText={setResetSearchQuery}
            />
          </GlassCard>
          {resetFilteredEmployees.slice(0, 6).map((emp) => (
            <Pressable key={emp.id} style={styles.resultRow} onPress={() => { setResetSelectedEmployee(emp); setResetSearchQuery(emp.name); setResetFilteredEmployees([]); }}>
              <Text style={styles.resultName}>{emp.name}</Text>
              <Text style={styles.resultSub}>{emp.job_title} · ${emp.mcloones_bucks || 0}</Text>
            </Pressable>
          ))}
          {resetSelectedEmployee && (
            <View style={styles.echip}>
              <View style={styles.echipAv}><Text style={styles.echipAvTxt}>{resetSelectedEmployee.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.echipName}>{resetSelectedEmployee.name}</Text>
                <Text style={styles.echipJob}>{t('rewards_reviews_editor:current_balance', { defaultValue: 'Current' })}: ${resetSelectedEmployee.mcloones_bucks || 0}</Text>
              </View>
            </View>
          )}
          <Pressable style={[styles.msubmit, { backgroundColor: '#E0A23C' }]} onPress={handleResetSingleUser} disabled={!resetSelectedEmployee || loading}>
            <Text style={styles.msubmitTxt}>{t('rewards_reviews_editor:reset_selected_button', 'Reset Selected User')}</Text>
          </Pressable>

          <View style={styles.divider} />

          <Text style={styles.flbl}>{t('rewards_reviews_editor:reset_all_title', 'Reset everyone')}</Text>
          <Text style={styles.resetAllWarn}>{t('rewards_reviews_editor:reset_all_warning', { currencyName, defaultValue: `Zeroes ${currencyName} for ALL employees.` })}</Text>
          <Pressable style={[styles.msubmit, { backgroundColor: '#FF6B6B' }]} onPress={handleResetAllUsers} disabled={loading}>
            <Text style={styles.msubmitTxt}>{t('rewards_reviews_editor:reset_all_button', 'Reset All Users')}</Text>
          </Pressable>
        </>))}
      </Modal>
    );
  }

  function renderEditTransactionModal() {
    return (
      <Modal visible={showEditTransactionModal} transparent animationType="slide" onRequestClose={() => setShowEditTransactionModal(false)}>
        {sheetShell(t('rewards_reviews_editor:edit_transaction_title', 'Edit Transaction'), () => { setShowEditTransactionModal(false); setEditingTransaction(null); }, (<>
          <Text style={styles.flbl}>{t('rewards_reviews_editor:employee_label', 'Employee')}</Text>
          <View style={[styles.finput, { justifyContent: 'center', opacity: 0.7 }]}><Text style={{ color: colors.textSecondary, fontFamily: fonts.body.regular }}>{editingTransaction?.user_name}</Text></View>

          <Text style={styles.flbl}>{t('rewards_reviews_editor:action_type_label', 'Action')}</Text>
          <View style={styles.rdseg}>
            <Pressable style={[styles.rdopt, editIsReward && styles.rdoptGood]} onPress={() => setEditIsReward(true)}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={18} color={editIsReward ? '#34C759' : colors.textSecondary} />
              <Text style={[styles.rdoptTxt, editIsReward && { color: '#34C759' }]}>{t('rewards_reviews_editor:reward_action', 'Reward')}</Text>
            </Pressable>
            <Pressable style={[styles.rdopt, !editIsReward && styles.rdoptBad]} onPress={() => setEditIsReward(false)}>
              <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={18} color={!editIsReward ? '#FF6B6B' : colors.textSecondary} />
              <Text style={[styles.rdoptTxt, !editIsReward && { color: '#FF6B6B' }]}>{t('rewards_reviews_editor:deduct_action', 'Deduct')}</Text>
            </Pressable>
          </View>

          <Text style={styles.flbl}>{t('rewards_reviews_editor:amount_label', 'Amount')}</Text>
          <TextInput style={styles.finput} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
          {amountPreview(editAmount, editIsReward)}

          <Text style={styles.flbl}>{t('rewards_reviews_editor:description_label', 'Reason')}</Text>
          <TextInput style={styles.farea} value={editDescription} onChangeText={setEditDescription} multiline placeholderTextColor={colors.textSecondary} />

          <Pressable style={styles.msubmit} onPress={handleSaveEditTransaction} disabled={loading}>
            <Text style={styles.msubmitTxt}>{t('rewards_reviews_editor:save_changes', 'Save Changes')}</Text>
          </Pressable>
        </>))}
      </Modal>
    );
  }

  function renderReviewModal() {
    return (
      <Modal visible={showReviewModal} transparent animationType="slide" onRequestClose={() => setShowReviewModal(false)}>
        {sheetShell(editingReview ? t('rewards_reviews_editor:edit_review_modal_title', 'Edit Review') : t('rewards_reviews_editor:add_review_modal_title', 'Add Review'), () => { setShowReviewModal(false); resetReviewForm(); }, (<>
          <Text style={styles.flbl}>{t('rewards_reviews_editor:guest_name_label', 'Guest name')}</Text>
          <TextInput
            style={styles.finput}
            placeholder={t('rewards_reviews_editor:guest_name_placeholder', 'Guest name')}
            placeholderTextColor={colors.textSecondary}
            value={reviewForm.guest_name}
            onChangeText={(v) => setReviewForm({ ...reviewForm, guest_name: v })}
          />

          <Text style={styles.flbl}>{t('rewards_reviews_editor:rating_label', 'Rating')}</Text>
          <View style={styles.starsPick}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setReviewForm({ ...reviewForm, rating: star })} hitSlop={4}>
                <IconSymbol
                  ios_icon_name={star <= reviewForm.rating ? 'star.fill' : 'star'}
                  android_material_icon_name={star <= reviewForm.rating ? 'star' : 'star-border'}
                  size={36}
                  color={star <= reviewForm.rating ? '#FFD45E' : colors.textSecondary}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.flbl}>{t('rewards_reviews_editor:review_label', 'Review')}</Text>
          <TextInput
            style={[styles.farea, { minHeight: 110 }]}
            placeholder={t('rewards_reviews_editor:review_placeholder', 'What did they say?')}
            placeholderTextColor={colors.textSecondary}
            value={reviewForm.review_text}
            onChangeText={(v) => setReviewForm({ ...reviewForm, review_text: v })}
            multiline
          />

          <Text style={styles.flbl}>{t('rewards_reviews_editor:review_date_label', 'Date')}</Text>
          <TextInput
            style={styles.finput}
            placeholder={t('rewards_reviews_editor:review_date_placeholder', 'YYYY-MM-DD')}
            placeholderTextColor={colors.textSecondary}
            value={reviewForm.review_date}
            onChangeText={(v) => setReviewForm({ ...reviewForm, review_date: v })}
          />

          <Pressable style={styles.msubmit} onPress={handleSaveReview} disabled={loading}>
            <Text style={styles.msubmitTxt}>{editingReview ? t('rewards_reviews_editor:update_review_button', 'Update Review') : t('rewards_reviews_editor:add_review_submit', 'Add Review')}</Text>
          </Pressable>
        </>))}
      </Modal>
    );
  }

  // Styles are declared after the render functions but hoisted into scope via
  // the `styles` const below (created once per theme change).
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    idbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
    bk: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
    idTitle: { fontFamily: fonts.display.bold, fontSize: 19, color: colors.text, letterSpacing: -0.3 },
    idSub: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.tint, marginTop: 2 },

    screen: { flex: 1 },
    screenContent: { paddingHorizontal: 16, paddingBottom: 120 },

    // Fixed, collapsing header overlay. NO zIndex — it's rendered after the
    // scroll (so it paints over the list) but before the nav bar + Jolt palette
    // in JSX (so those, rendered later, stay on top). An explicit high zIndex
    // here would clip the Jolt palette (which is a plain absolute View, not a Modal).
    fixedTop: { position: 'absolute', top: 0, left: 0, right: 0 },
    lockedHead: { paddingBottom: 6, overflow: 'hidden' },
    clip: { overflow: 'hidden', paddingHorizontal: 16, paddingTop: 2 },
    // Pinned sub-tabs sit over a full-bleed opaque strip (extends past the clip's
    // 16px padding to the screen edges) so the list is hidden behind them.
    subTabsWrap: { position: 'relative' },
    subTabsBackdrop: { position: 'absolute', top: 0, bottom: -2, left: -16, right: -16 },

    navtiles: { flexDirection: 'row', gap: 10, marginTop: 9, paddingHorizontal: 16 },
    ntile: { flex: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.surfaceBorder, backgroundColor: colors.surface, padding: 13, overflow: 'hidden' },
    ntileOn: { borderColor: colors.tint + '5C', backgroundColor: colors.tint + '1C' },
    goav: { position: 'absolute', top: 13, right: 12, opacity: 0.5 },
    nlblRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    nlbl: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary, flexShrink: 1 },
    nnum: { fontFamily: fonts.mono.semibold, fontSize: 28, letterSpacing: -1, color: colors.text, marginTop: 9 },
    nnumRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
    nsub: { fontFamily: fonts.mono.medium, fontSize: 9, color: colors.textSecondary, marginTop: 6 },
    rtag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD45E26', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFD45E52', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    redeemSettingsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 11, backgroundColor: colors.primary, marginTop: 12 },
    redeemSettingsTxt: { fontFamily: fonts.display.semibold, fontSize: 11.5, color: colors.fireText },
    rtagTxt: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.4, textTransform: 'uppercase', color: '#E0A23C' },

    acts: { flexDirection: 'row', gap: 8, marginTop: 11 },
    act: { flex: 1, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.surfaceBorder, backgroundColor: colors.surface, paddingVertical: 12, alignItems: 'center', gap: 7 },
    actTxt: { fontFamily: fonts.display.semibold, fontSize: 11, color: colors.text },
    actBadge: { position: 'absolute', top: -6, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FF6B6B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.background, zIndex: 2 },
    actBadgeTxt: { fontFamily: fonts.mono.semibold, fontSize: 9.5, color: '#fff' },

    sub3: { flexDirection: 'row', gap: 4, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, borderRadius: 13, padding: 4, marginTop: 14 },
    sub3Item: { flex: 1, paddingVertical: 8, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    sub3On: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceBorder },
    sub3Txt: { fontFamily: fonts.display.semibold, fontSize: 11.5, color: colors.textSecondary },
    sub3Dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF6B6B' },

    pad2: { paddingTop: 4 },
    zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 16, marginBottom: 9, marginHorizontal: 2 },
    empty: { fontFamily: fonts.mono.medium, fontSize: 12, color: colors.textSecondary, textAlign: 'center', paddingVertical: 26 },

    lcard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, marginBottom: 8 },
    medal: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    medalTxt: { fontFamily: fonts.mono.semibold, fontSize: 14, color: '#1A1E24' },
    mGold: { backgroundColor: '#F5C542' }, mSilver: { backgroundColor: '#C3CCD6' }, mBronze: { backgroundColor: '#DC8A4A' },
    mNeutral: { backgroundColor: colors.tint + '29', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.tint + '47' },
    lname: { fontFamily: fonts.display.bold, fontSize: 14.5, color: colors.text },
    ljob: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 2 },
    lbucks: { fontFamily: fonts.mono.semibold, fontSize: 17, color: colors.tint, letterSpacing: -0.5 },

    txCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 },
    txName: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
    txDesc: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.text, marginTop: 3, opacity: 0.9 },
    txDate: { fontFamily: fonts.mono.medium, fontSize: 9, color: colors.textSecondary, marginTop: 5 },
    txRight: { alignItems: 'flex-end', gap: 6 },
    txAmt: { fontFamily: fonts.mono.semibold, fontSize: 16, letterSpacing: -0.5 },
    txIcons: { flexDirection: 'row', gap: 11, alignItems: 'center' },
    hiddenTag: { fontFamily: fonts.mono.medium, fontSize: 10, color: '#E0A23C', fontStyle: 'italic' },

    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, height: 46, marginTop: 4 },
    searchInput: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, color: colors.text, paddingVertical: 0 },
    resultList: { marginTop: 6 },
    resultRow: { paddingVertical: 11, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
    resultName: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.text },
    resultSub: { fontFamily: fonts.mono.medium, fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    lookupCard: { padding: 16, marginTop: 10, alignItems: 'center' },
    lookupName: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.text },
    lookupJob: { fontFamily: fonts.mono.medium, fontSize: 10, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 2 },
    lookupBucks: { fontFamily: fonts.mono.semibold, fontSize: 34, color: colors.tint, letterSpacing: -1, marginTop: 8 },
    lookupBal: { fontFamily: fonts.mono.medium, fontSize: 10, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 2 },

    rvbtns: { flexDirection: 'row', gap: 9, marginTop: 14 },
    rvb: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 14 },
    rvbAdd: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.surfaceBorder },
    rvbRef: { backgroundColor: colors.blue + '29', borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.blue + '52' },
    rvbTxt: { fontFamily: fonts.display.semibold, fontSize: 13 },
    refLim: { backgroundColor: colors.blue + '38', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
    refLimTxt: { fontFamily: fonts.mono.semibold, fontSize: 9, color: colors.blueText },

    rev: { padding: 14, marginBottom: 9 },
    rvHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rvAv: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.tint + '2E', alignItems: 'center', justifyContent: 'center' },
    rvAvImg: { width: 34, height: 34, borderRadius: 17 },
    rvAvTxt: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.tint },
    rvName: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
    rvText: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 19, color: colors.text, opacity: 0.92, marginTop: 9 },
    rvReply: { marginTop: 10, padding: 11, borderRadius: 11, backgroundColor: colors.glass, borderLeftWidth: 2, borderLeftColor: colors.tint },
    rvReplyLbl: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.tint },
    rvReplyTxt: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 17, color: colors.textSecondary, marginTop: 4 },
    rvDate: { fontFamily: fonts.mono.medium, fontSize: 9, color: colors.textSecondary, marginTop: 9 },
    gBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue + '26', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.blue + '47', alignItems: 'center', justifyContent: 'center' },
    gBadgeTxt: { fontFamily: fonts.mono.semibold, fontSize: 11, color: colors.blueText },
    starsRow: { flexDirection: 'row', gap: 1, marginTop: 3 },

    // modals
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,10,18,0.5)' },
    sheet: { paddingHorizontal: 18, paddingBottom: 28, paddingTop: 8, maxHeight: '88%' },
    grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.glassBorder, alignSelf: 'center', marginTop: 6, marginBottom: 14 },
    mtitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    mtitle: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.text },
    flbl: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 16, marginBottom: 7, marginHorizontal: 2 },
    finput: { height: 46, borderRadius: 13, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, color: colors.text, fontSize: 14, fontFamily: fonts.body.regular },
    farea: { minHeight: 80, borderRadius: 13, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 13, lineHeight: 19, fontFamily: fonts.body.regular, textAlignVertical: 'top' },
    echip: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 13, backgroundColor: colors.tint + '1F', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.tint + '42', paddingHorizontal: 13, marginTop: 4 },
    echipAv: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tint + '33', alignItems: 'center', justifyContent: 'center' },
    echipAvTxt: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.tint },
    echipName: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
    echipJob: { fontFamily: fonts.mono.medium, fontSize: 9, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 1 },
    rdseg: { flexDirection: 'row', gap: 9 },
    rdopt: { flex: 1, height: 50, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, backgroundColor: colors.glass, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    rdoptGood: { backgroundColor: '#34C75926', borderColor: '#34C75966' },
    rdoptBad: { backgroundColor: '#FF6B6B26', borderColor: '#FF6B6B66' },
    rdoptTxt: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.textSecondary },
    amtPrev: { fontFamily: fonts.mono.medium, fontSize: 11, color: colors.textSecondary, marginTop: 8, marginLeft: 2 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16 },
    tsw: { width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center' },
    tswKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff' },
    tglTxt: { fontFamily: fonts.body.medium, fontSize: 12.5, color: colors.text },
    tglSub: { fontFamily: fonts.body.regular, fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
    msubmit: { height: 50, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
    msubmitTxt: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.fireText },
    starsPick: { flexDirection: 'row', gap: 8, marginTop: 2 },
    warnBox: { backgroundColor: '#E0A23C1F', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0A23C4D', borderRadius: 12, padding: 12, marginTop: 6 },
    warnTxt: { fontFamily: fonts.body.medium, fontSize: 12, color: '#E0A23C', lineHeight: 17 },
    resetAllWarn: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 17 },
    divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 22 },

    loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 20 },
  });
