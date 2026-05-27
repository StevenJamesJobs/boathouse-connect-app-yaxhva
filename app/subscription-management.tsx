import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription, SubscriptionTier } from '@/contexts/SubscriptionContext';
import { REVENUECAT_CONFIGURED, PRODUCTS, ENTITLEMENTS } from '@/config/revenueCat';

const BASE_FEATURES = [
  'Manual Schedule Builder',
  'Menu Editor',
  'Employee Management',
  'Messaging & Notifications',
  'Rewards System',
  'Word Search Game',
  'Guides & Training',
  'Announcements & Events',
];

const PREMIUM_FEATURES = [
  'AI Schedule Upload',
  'Weekly Quizzes',
  'Menu Memory Tiles',
  'Picture This! Game',
  'Auto Google Reviews',
];

const TIER_LABELS: Record<SubscriptionTier, string> = {
  trial: 'Free Trial',
  base: 'Base',
  premium: 'Premium',
  expired: 'Expired',
  none: 'No Plan',
};

const TIER_COLORS: Record<SubscriptionTier, string> = {
  trial: '#4A90D9',
  base: '#5B8C5A',
  premium: '#D4A843',
  expired: '#CC4444',
  none: '#888888',
};

export default function SubscriptionManagementScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const {
    tier,
    isTrialActive,
    trialDaysRemaining,
    trialEndDate,
    hasBase,
    hasPremium,
    refreshSubscription,
  } = useSubscription();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [purchasing, setPurchasing] = useState(false);

  // Owner-only gate
  if (user?.role !== 'owner') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
          Only the restaurant owner can manage subscriptions.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handlePurchase = useCallback(async (productId: string) => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(
        'Setup Required',
        'In-app purchases are not configured yet. This will be available when the app is published to the App Store.',
      );
      return;
    }

    setPurchasing(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        Alert.alert('Error', 'No subscription plans are currently available. Please try again later.');
        setPurchasing(false);
        return;
      }

      const pkg = offerings.current.availablePackages.find(
        p => p.product.identifier === productId
      );

      if (!pkg) {
        Alert.alert('Error', 'The selected plan is not available. Please try again later.');
        setPurchasing(false);
        return;
      }

      await Purchases.purchasePackage(pkg);
      await refreshSubscription();

      Alert.alert('Success', 'Your subscription has been activated. Thank you!');
    } catch (err: any) {
      if (err.userCancelled) {
        // User cancelled — no alert needed
      } else {
        Alert.alert('Purchase Error', err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription]);

  const handleRestore = useCallback(async () => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert('Setup Required', 'In-app purchases are not configured yet.');
      return;
    }

    setPurchasing(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      await Purchases.restorePurchases();
      await refreshSubscription();
      Alert.alert('Restored', 'Your purchases have been restored.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not restore purchases.');
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription]);

  const handleManageSubscription = useCallback(async () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open subscription settings.');
    }
  }, []);

  const tierColor = TIER_COLORS[tier];
  const trialEndFormatted = trialEndDate
    ? trialEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Current Plan Card */}
      <View style={[styles.currentPlanCard, { borderColor: tierColor }]}>
        <View style={styles.currentPlanHeader}>
          <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
            <Text style={styles.tierBadgeText}>{TIER_LABELS[tier]}</Text>
          </View>
          {tier === 'base' || tier === 'premium' ? (
            <TouchableOpacity onPress={handleManageSubscription}>
              <Text style={[styles.manageLink, { color: colors.primary }]}>Manage</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.currentPlanName}>{organization.name}</Text>

        {isTrialActive && (
          <View style={styles.trialInfo}>
            <View style={styles.trialProgressContainer}>
              <View
                style={[
                  styles.trialProgressBar,
                  {
                    backgroundColor: tierColor,
                    width: `${Math.max(5, ((14 - trialDaysRemaining) / 14) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.trialText}>
              {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} remaining
            </Text>
            <Text style={styles.trialSubtext}>
              Trial ends {trialEndFormatted}
            </Text>
          </View>
        )}

        {tier === 'expired' && (
          <View style={styles.expiredInfo}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={20}
              color={TIER_COLORS.expired}
            />
            <Text style={styles.expiredText}>
              Your free trial has ended. Choose a plan to continue using all features.
            </Text>
          </View>
        )}
      </View>

      {/* Plan Comparison */}
      <Text style={styles.sectionTitle}>Choose Your Plan</Text>

      {/* Base Plan Card */}
      <View style={[
        styles.planCard,
        tier === 'base' && { borderColor: TIER_COLORS.base, borderWidth: 2 },
      ]}>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>Base</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>$11</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
        </View>

        {tier === 'base' && (
          <View style={[styles.currentBadge, { backgroundColor: TIER_COLORS.base }]}>
            <Text style={styles.currentBadgeText}>Current Plan</Text>
          </View>
        )}

        <View style={styles.featureList}>
          {BASE_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={18}
                color={TIER_COLORS.base}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
          {PREMIUM_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="xmark.circle"
                android_material_icon_name="cancel"
                size={18}
                color={colors.textSecondary}
              />
              <Text style={[styles.featureText, styles.featureDisabled]}>{feature}</Text>
            </View>
          ))}
        </View>

        {tier !== 'base' && (
          <TouchableOpacity
            style={[styles.planButton, { backgroundColor: TIER_COLORS.base }]}
            onPress={() => handlePurchase(PRODUCTS.BASE_MONTHLY)}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.planButtonText}>
                {tier === 'premium' ? 'Switch to Base' : 'Subscribe — $11/mo'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Premium Plan Card */}
      <View style={[
        styles.planCard,
        styles.premiumCard,
        tier === 'premium' && { borderColor: TIER_COLORS.premium, borderWidth: 2 },
      ]}>
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueText}>BEST VALUE</Text>
        </View>

        <View style={styles.planHeader}>
          <Text style={styles.planName}>Premium</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>$15</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
        </View>

        {tier === 'premium' && (
          <View style={[styles.currentBadge, { backgroundColor: TIER_COLORS.premium }]}>
            <Text style={styles.currentBadgeText}>Current Plan</Text>
          </View>
        )}

        <View style={styles.featureList}>
          {BASE_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={18}
                color={TIER_COLORS.premium}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
          {PREMIUM_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={18}
                color={TIER_COLORS.premium}
              />
              <Text style={[styles.featureText, { fontWeight: '600' }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {tier !== 'premium' && (
          <TouchableOpacity
            style={[styles.planButton, { backgroundColor: TIER_COLORS.premium }]}
            onPress={() => handlePurchase(PRODUCTS.PREMIUM_MONTHLY)}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.planButtonText}>
                {isTrialActive ? 'Subscribe — $15/mo' :
                 tier === 'base' ? 'Upgrade to Premium' : 'Subscribe — $15/mo'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Restore Purchases */}
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={purchasing}
      >
        <Text style={[styles.restoreText, { color: colors.primary }]}>
          Restore Purchases
        </Text>
      </TouchableOpacity>

      {/* Footer */}
      <Text style={styles.footerText}>
        Subscriptions renew monthly. You can cancel anytime from your{' '}
        {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} subscription settings.
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    currentPlanCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 2,
    },
    currentPlanHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    tierBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    tierBadgeText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    manageLink: {
      fontSize: 14,
      fontWeight: '600',
    },
    currentPlanName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    trialInfo: {
      marginTop: 4,
    },
    trialProgressContainer: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    trialProgressBar: {
      height: '100%',
      borderRadius: 3,
    },
    trialText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    trialSubtext: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    expiredInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    expiredText: {
      flex: 1,
      fontSize: 14,
      color: TIER_COLORS.expired,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    planCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    premiumCard: {
      position: 'relative',
      overflow: 'visible',
    },
    bestValueBadge: {
      position: 'absolute',
      top: -10,
      right: 16,
      backgroundColor: TIER_COLORS.premium,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      zIndex: 1,
    },
    bestValueText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    planHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    planName: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    priceAmount: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
    },
    pricePeriod: {
      fontSize: 14,
      color: colors.textSecondary,
      marginLeft: 2,
    },
    currentBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      marginBottom: 12,
    },
    currentBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    featureList: {
      marginBottom: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 5,
    },
    featureText: {
      fontSize: 14,
      color: colors.text,
    },
    featureDisabled: {
      color: colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    planButton: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    planButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    restoreButton: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    restoreText: {
      fontSize: 15,
      fontWeight: '600',
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 20,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
