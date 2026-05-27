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
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { REVENUECAT_CONFIGURED, PRODUCTS } from '@/config/revenueCat';

const BASE_FEATURES = [
  { label: 'Manual Schedule Builder', included: true },
  { label: 'Menu Editor', included: true },
  { label: 'Employee Management', included: true },
  { label: 'Messaging & Notifications', included: true },
  { label: 'Rewards System', included: true },
  { label: 'Word Search Game', included: true },
  { label: 'Guides & Training', included: true },
];

const PREMIUM_EXTRAS = [
  'AI Schedule Upload',
  'Weekly Quizzes',
  'Menu Memory Tiles',
  'Picture This! Game',
  'Auto Google Reviews',
];

export default function PaywallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { organization } = useOrganization();
  const { refreshSubscription } = useSubscription();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = useCallback(async (productId: string) => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(
        'Setup Required',
        'In-app purchases will be available when the app is published to the App Store.',
      );
      return;
    }

    setPurchasing(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        Alert.alert('Error', 'No subscription plans are currently available.');
        setPurchasing(false);
        return;
      }

      const pkg = offerings.current.availablePackages.find(
        p => p.product.identifier === productId
      );

      if (!pkg) {
        Alert.alert('Error', 'The selected plan is not available.');
        setPurchasing(false);
        return;
      }

      await Purchases.purchasePackage(pkg);
      await refreshSubscription();

      Alert.alert('Welcome Back!', 'Your subscription is active. Enjoy MyResto Connect!', [
        { text: 'Continue', onPress: () => router.replace('/(portal)/manager' as any) },
      ]);
    } catch (err: any) {
      if (!err.userCancelled) {
        Alert.alert('Purchase Error', err.message || 'Something went wrong.');
      }
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription, router]);

  const handleRestore = useCallback(async () => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert('Setup Required', 'In-app purchases are not configured yet.');
      return;
    }

    setPurchasing(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const info = await Purchases.restorePurchases();

      const hasActive =
        Object.keys(info.entitlements.active).length > 0;

      if (hasActive) {
        await refreshSubscription();
        Alert.alert('Restored!', 'Your subscription has been restored.', [
          { text: 'Continue', onPress: () => router.replace('/(portal)/manager' as any) },
        ]);
      } else {
        Alert.alert('No Active Subscription', 'No previous subscription was found for this account.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not restore purchases.');
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      bounces={false}
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <IconSymbol
            ios_icon_name="bolt.circle.fill"
            android_material_icon_name="bolt"
            size={56}
            color={colors.primary}
          />
        </View>
        <Text style={styles.heroTitle}>Your Free Trial Has Ended</Text>
        <Text style={styles.heroSubtitle}>
          Choose a plan to keep {organization.name} connected.
        </Text>
      </View>

      {/* Premium Plan — highlighted first */}
      <View style={[styles.planCard, styles.premiumHighlight]}>
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>RECOMMENDED</Text>
        </View>

        <View style={styles.planHeader}>
          <Text style={styles.planTitle}>Premium</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>$15</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
        </View>

        <Text style={styles.planDesc}>
          Everything your team needs — all features unlocked.
        </Text>

        <View style={styles.featureList}>
          {BASE_FEATURES.map(f => (
            <View key={f.label} style={styles.featureRow}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color="#D4A843" />
              <Text style={styles.featureText}>{f.label}</Text>
            </View>
          ))}
          {PREMIUM_EXTRAS.map(label => (
            <View key={label} style={styles.featureRow}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color="#D4A843" />
              <Text style={[styles.featureText, styles.premiumFeatureText]}>{label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.premiumButton}
          onPress={() => handlePurchase(PRODUCTS.PREMIUM_MONTHLY)}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.premiumButtonText}>Get Premium — $15/mo</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Base Plan */}
      <View style={[styles.planCard, { borderColor: colors.border }]}>
        <View style={styles.planHeader}>
          <Text style={styles.planTitle}>Base</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>$11</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
        </View>

        <Text style={styles.planDesc}>
          Core features for managing your team.
        </Text>

        <View style={styles.featureList}>
          {BASE_FEATURES.map(f => (
            <View key={f.label} style={styles.featureRow}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color="#5B8C5A" />
              <Text style={styles.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.baseButton, { borderColor: colors.primary }]}
          onPress={() => handlePurchase(PRODUCTS.BASE_MONTHLY)}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.baseButtonText, { color: colors.primary }]}>Get Base — $11/mo</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Restore Purchases */}
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={purchasing}
      >
        <Text style={[styles.restoreText, { color: colors.primary }]}>
          Restore Previous Purchase
        </Text>
      </TouchableOpacity>

      {/* Legal Footer */}
      <Text style={styles.legalText}>
        Subscriptions renew monthly and can be cancelled anytime from your{' '}
        {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} subscription settings.
        Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google'} account.
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
      padding: 20,
      paddingTop: Platform.OS === 'ios' ? 80 : 40,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 28,
    },
    heroIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 22,
    },
    planCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
    },
    premiumHighlight: {
      borderColor: '#D4A843',
      borderWidth: 2,
    },
    recommendedBadge: {
      position: 'absolute',
      top: -11,
      alignSelf: 'center',
      backgroundColor: '#D4A843',
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 10,
      zIndex: 1,
      left: '50%',
      transform: [{ translateX: -55 }],
    },
    recommendedText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    planHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      marginTop: 4,
    },
    planTitle: {
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
    planDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    featureList: {
      marginBottom: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    featureText: {
      fontSize: 14,
      color: colors.text,
    },
    premiumFeatureText: {
      fontWeight: '600',
    },
    premiumButton: {
      backgroundColor: '#D4A843',
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    premiumButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    baseButton: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 2,
    },
    baseButtonText: {
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
    legalText: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 16,
      marginTop: 8,
    },
  });
}
