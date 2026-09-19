/**
 * Paywall (s86, mockup F-2) — the trial-ended wall, drawn in the s84 Subscription grammar:
 * the compare matrix (premium rows first, faint gold wash, gold checks), Get Base beside the
 * gold Get Premium, then Restore · Log out. Every string lives in the `paywall` namespace.
 * Log out is the screen's one exit for someone signed in to the wrong account.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import ShineButton from '@/components/quiz/ShineButton';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { REVENUECAT_CONFIGURED, PRODUCTS } from '@/config/revenueCat';
import { translateServerError } from '@/utils/serverErrors';
import { OnbScreen, Disc, GhostButton, LegalFooter, useOnbAccents } from '@/components/onboarding/OnboardingKit';

const GOLD_INK = '#1A1200';

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const { logout } = useAuth();
  const { organization } = useOrganization();
  const { refreshSubscription } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = useCallback(async (productId: string) => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(
        t('paywall.setup_required_title'),
        t('paywall.setup_required_msg'),
      );
      return;
    }

    setPurchasing(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        Alert.alert(t('paywall.error_title'), t('paywall.no_plans'));
        setPurchasing(false);
        return;
      }

      const pkg = offerings.current.availablePackages.find(
        p => p.product.identifier === productId
      );

      if (!pkg) {
        Alert.alert(t('paywall.error_title'), t('paywall.plan_unavailable'));
        setPurchasing(false);
        return;
      }

      await Purchases.purchasePackage(pkg);
      await refreshSubscription();

      Alert.alert(t('paywall.welcome_back_title'), t('paywall.welcome_back_msg'), [
        { text: t('paywall.continue'), onPress: () => router.replace('/(portal)/manager' as any) },
      ]);
    } catch (err: any) {
      if (!err.userCancelled) {
        Alert.alert(t('paywall.purchase_error_title'), translateServerError(err, t('paywall.purchase_error_fallback')));
      }
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription, router, t]);

  const handleRestore = useCallback(async () => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(t('paywall.setup_required_title'), t('paywall.setup_required_short'));
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
        Alert.alert(t('paywall.restored_title'), t('paywall.restored_msg'), [
          { text: t('paywall.continue'), onPress: () => router.replace('/(portal)/manager' as any) },
        ]);
      } else {
        Alert.alert(t('paywall.no_active_title'), t('paywall.no_active_msg'));
      }
    } catch (err: any) {
      Alert.alert(t('paywall.error_title'), translateServerError(err, t('paywall.restore_error_fallback')));
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription, router, t]);

  // The one way out for someone signed in to the wrong account.
  const handleLogout = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const gold = a.isDark ? '#F59E0B' : '#B45309';

  // One literal t() per feature — the i18n harvester greps for literals.
  const premiumFeatures = [
    t('paywall.feat_ai_schedule'),
    t('paywall.feat_quizzes'),
    t('paywall.feat_memory'),
    t('paywall.feat_picture_this'),
    t('paywall.feat_auto_reviews'),
  ];
  const baseFeatures = [
    t('paywall.feat_schedule_builder'),
    t('paywall.feat_menu_editor'),
    t('paywall.feat_employees'),
    t('paywall.feat_messaging'),
    t('paywall.feat_rewards_games_guides'),
  ];

  const hairline = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline };

  return (
    <OnbScreen contentStyle={styles.content}>
      {/* Header row — bolt left of the trial-ended line */}
      <View style={styles.head}>
        <Disc style={styles.disc}>
          <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={28} color={gold} />
        </Disc>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.text }]}>{t('paywall.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('paywall.subtitle', { orgName: organization.name })}</Text>
        </View>
      </View>

      {/* Compare matrix — premium rows first */}
      <GlassCard variant="glass" radius={18} style={styles.matrix}>
        <View style={[styles.mxRow, styles.mxHead, { backgroundColor: colors.glass }]}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]} numberOfLines={1}>{t('paywall.whats_included')}</Text>
          <View style={styles.colBase}>
            <Text style={[styles.colHead, { color: colors.text }]} numberOfLines={1}>{t('paywall.base')}</Text>
            <Text style={[styles.colSub, { color: colors.textSecondary }]} numberOfLines={1}>{t('paywall.price_base')}</Text>
          </View>
          <View style={styles.colPrem}>
            <Text style={[styles.colHead, { color: gold }]} numberOfLines={1}>{t('paywall.premium')}</Text>
            <Text style={[styles.colSub, { color: colors.textSecondary }]} numberOfLines={1}>{t('paywall.price_premium')}</Text>
          </View>
        </View>

        {premiumFeatures.map((label) => (
          <View key={label} style={[styles.mxRow, hairline, { backgroundColor: hexToRgba(gold, 0.06) }]}>
            <Text style={[styles.mxLabel, { color: colors.text }]}>{label}</Text>
            <View style={styles.colBase}>
              <Text style={[styles.dash, { color: colors.textSecondary }]}>—</Text>
            </View>
            <View style={styles.colPrem}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={gold} />
            </View>
          </View>
        ))}

        {baseFeatures.map((label) => (
          <View key={label} style={[styles.mxRow, hairline]}>
            <Text style={[styles.mxLabel, { color: colors.text }]}>{label}</Text>
            <View style={styles.colBase}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={a.ok} />
            </View>
            <View style={styles.colPrem}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={a.ok} />
            </View>
          </View>
        ))}
      </GlassCard>

      {/* Get Base · Get Premium */}
      <View style={styles.btnRow}>
        <GhostButton
          label={t('paywall.get_base')}
          onPress={() => handlePurchase(PRODUCTS.BASE_MONTHLY)}
          disabled={purchasing}
          style={styles.baseBtn}
        />
        <ShineButton
          label={t('paywall.get_premium')}
          gradient={[gold, gold]}
          ink={GOLD_INK}
          onPress={() => handlePurchase(PRODUCTS.PREMIUM_MONTHLY)}
          disabled={purchasing}
          loading={purchasing}
          style={styles.premBtn}
        />
      </View>

      {/* Restore · Log out */}
      <View style={styles.links}>
        <Pressable onPress={handleRestore} disabled={purchasing} hitSlop={8} style={purchasing && styles.dim}>
          <Text style={[styles.link, { color: a.pop }]}>{t('paywall.restore')}</Text>
        </Pressable>
        <Text style={[styles.linkDot, { color: colors.textSecondary }]}>·</Text>
        <Pressable onPress={handleLogout} disabled={purchasing} hitSlop={8} style={purchasing && styles.dim}>
          <Text style={[styles.link, { color: a.bad }]}>{t('paywall.log_out')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.legalNote, { color: colors.textSecondary }]}>
        {Platform.OS === 'ios' ? t('paywall.legal_ios') : t('paywall.legal_android')}
      </Text>
      <LegalFooter showVersion={false} />
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 26 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingTop: 6, paddingHorizontal: 2 },
  disc: { width: 58, height: 58, borderRadius: 20, marginBottom: 0 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display.bold, fontSize: 21, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, marginTop: 2 },

  // Compare matrix (mirrors app/subscription-management.tsx)
  matrix: { padding: 0 },
  mxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12 },
  mxHead: { paddingTop: 10, paddingBottom: 8 },
  eyebrow: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  colBase: { width: 62, alignItems: 'center' },
  colPrem: { width: 72, alignItems: 'center' },
  colHead: { fontFamily: fonts.display.bold, fontSize: 14, textAlign: 'center' },
  colSub: { fontFamily: fonts.mono.semibold, fontSize: 10, textAlign: 'center' },
  mxLabel: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, paddingRight: 6 },
  dash: { fontFamily: fonts.body.regular, fontSize: 12.5, opacity: 0.5 },

  btnRow: { flexDirection: 'row', gap: 10 },
  baseBtn: { flex: 0.8 },
  // Tighter side padding so "Get Premium — $15/mo" fits the 1 : 0.8 split on a 375pt phone.
  premBtn: { flex: 1, paddingHorizontal: 8 },

  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  link: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  linkDot: { fontFamily: fonts.body.regular, fontSize: 12.5 },
  dim: { opacity: 0.5 },

  legalNote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: 8 },
});
