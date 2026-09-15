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
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba, type ThemeColorSet } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import ShineButton from '@/components/quiz/ShineButton';
import { SegControl } from '@/components/content/FormKit';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { REVENUECAT_CONFIGURED, PRODUCTS } from '@/config/revenueCat';
import { translateServerError } from '@/utils/serverErrors';

/**
 * Subscription — SUB-B "Compare" (s84): the current-plan strip, the feature
 * matrix (premium rows first, gold checks, faint gold wash), two CTAs under
 * the columns reflecting the real tier, Restore, footer. Every string lives in
 * the `subscription` namespace.
 *
 * The Monthly | Yearly capsule is wired but hidden behind SHOW_YEARLY until the
 * yearly RevenueCat products exist (the copy keys are already in i18n).
 */
const SHOW_YEARLY: boolean = false;
type Billing = 'monthly' | 'yearly';
type Plan = 'base' | 'premium';

// Feature order is the existing screen's order — premium five first, then the base eight.
const PREMIUM_FEATURE_KEYS = [
  'feature_ai_schedule_upload',
  'feature_quizzes_exams',
  'feature_menu_memory_tiles',
  'feature_picture_this',
  'feature_auto_google_reviews',
] as const;

const BASE_FEATURE_KEYS = [
  'feature_manual_schedule_builder',
  'feature_menu_editor',
  'feature_employee_management',
  'feature_messaging_notifications',
  'feature_rewards_system',
  'feature_word_search',
  'feature_guides_training',
  'feature_announcements_events',
] as const;

// Fixed hues (mockup --gold / --azure / --bad / --ok), stepped for the light theme.
const GOLD = { dark: '#F59E0B', light: '#B45309' };
const AZURE = { dark: '#3B82F6', light: '#2563EB' };
const RED = { dark: '#EF4444', light: '#DC2626' };
const EMERALD = { dark: '#10A56F', light: '#087A52' };
const GOLD_INK = '#1A1200';
const PREMIUM_GRADIENT = ['#B45309', '#F59E0B'] as const;
const TRIAL_LENGTH_DAYS = 14;

const MARK_SIZE = 17;

export default function SubscriptionManagementScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const {
    tier,
    isTrialActive,
    trialDaysRemaining,
    trialEndDate,
    refreshSubscription,
  } = useSubscription();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [purchasing, setPurchasing] = useState(false);
  // Which CTA is mid-flight (null while a restore runs) — drives the spinners.
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>('monthly');

  const hues = useMemo(
    () => ({
      gold: isDark ? GOLD.dark : GOLD.light,
      azure: isDark ? AZURE.dark : AZURE.light,
      red: isDark ? RED.dark : RED.light,
      ok: isDark ? EMERALD.dark : EMERALD.light,
    }),
    [isDark],
  );

  // Yearly product ids slot in here once they exist in RevenueCat; until then
  // `billing` is always 'monthly' (the capsule is hidden behind SHOW_YEARLY).
  const productFor = useCallback(
    (plan: Plan) => (plan === 'base' ? PRODUCTS.BASE_MONTHLY : PRODUCTS.PREMIUM_MONTHLY),
    [],
  );

  const handlePurchase = useCallback(async (productId: string) => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(t('subscription.setup_required_title'), t('subscription.setup_required_msg'));
      return;
    }

    setPurchasing(true);
    setPendingProduct(productId);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        Alert.alert(t('common.error'), t('subscription.no_plans'));
        return;
      }

      const pkg = offerings.current.availablePackages.find(
        p => p.product.identifier === productId
      );

      if (!pkg) {
        Alert.alert(t('common.error'), t('subscription.plan_unavailable'));
        return;
      }

      await Purchases.purchasePackage(pkg);
      await refreshSubscription();

      Alert.alert(t('common.success'), t('subscription.purchase_success'));
    } catch (err: any) {
      if (err.userCancelled) {
        // User cancelled — no alert needed
      } else {
        Alert.alert(
          t('subscription.purchase_error_title'),
          translateServerError(err, t('subscription.purchase_error')),
        );
      }
    } finally {
      setPurchasing(false);
      setPendingProduct(null);
    }
  }, [refreshSubscription, t]);

  const handleRestore = useCallback(async () => {
    if (!REVENUECAT_CONFIGURED) {
      Alert.alert(t('subscription.setup_required_title'), t('subscription.setup_required_short'));
      return;
    }

    setPurchasing(true);
    setPendingProduct(null);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      await Purchases.restorePurchases();
      await refreshSubscription();
      Alert.alert(t('subscription.restored_title'), t('subscription.restored_msg'));
    } catch (err: any) {
      Alert.alert(t('common.error'), translateServerError(err, t('subscription.restore_error')));
    } finally {
      setPurchasing(false);
    }
  }, [refreshSubscription, t]);

  const handleManageSubscription = useCallback(async () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('subscription.manage_error'));
    }
  }, [t]);

  // Owner-only gate — must sit BELOW every hook so both roles run the same count.
  if (user?.role !== 'owner') {
    return (
      <View style={styles.root}>
        <AmbientGlow />
        <ScreenHeader title={t('subscription.title')} />
        <View style={styles.gateWrap}>
          <GlassCard radius={16} style={styles.gateCard}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={22} color={colors.tint} />
            <Text style={styles.gateText}>{t('subscription.owner_only')}</Text>
            <TouchableOpacity style={styles.glassBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={styles.glassBtnLabel}>{t('subscription.go_back')}</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </View>
    );
  }

  // ── Current-plan strip state ─────────────────────────────────────────────
  const isPaid = tier === 'base' || tier === 'premium';
  const tierHue =
    tier === 'trial' ? hues.azure
    : tier === 'expired' ? hues.red
    : tier === 'none' ? colors.textSecondary
    : hues.gold;
  const tierInk = isPaid ? GOLD_INK : '#FFFFFF';
  const tierLabel = t(`subscription.tier_${tier}`);
  const stripTinted = tier !== 'none';

  const dateLocale = i18n.language?.startsWith('es') ? 'es-ES' : 'en-US';
  const trialEndFormatted = trialEndDate
    ? trialEndDate.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
    : '';
  const trialElapsedPct = Math.max(
    5,
    Math.min(100, ((TRIAL_LENGTH_DAYS - trialDaysRemaining) / TRIAL_LENGTH_DAYS) * 100),
  );

  const priceBase = t('subscription.price_base');
  const pricePremium = t('subscription.price_premium');
  const perMonth = t('subscription.per_month');

  let planLine: string;
  if (isTrialActive) {
    planLine = t('subscription.days_left', { count: trialDaysRemaining, date: trialEndFormatted });
  } else if (tier === 'expired') {
    planLine = t('subscription.expired_warning');
  } else if (tier === 'none') {
    planLine = t('subscription.none_line');
  } else {
    planLine = t('subscription.paid_line', { price: tier === 'premium' ? pricePremium : priceBase });
  }

  // ── CTA labels by real state ─────────────────────────────────────────────
  const baseLabel =
    tier === 'base' ? t('subscription.current_plan')
    : tier === 'premium' ? t('subscription.switch_to_base')
    : `${t('subscription.plan_base')} · ${priceBase}`;
  const premiumLabel =
    tier === 'premium' ? t('subscription.current_plan')
    : tier === 'base' ? t('subscription.upgrade_premium')
    : `${t('subscription.plan_premium')} · ${pricePremium}`;
  const baseProduct = productFor('base');
  const premiumProduct = productFor('premium');
  const baseBusy = purchasing && pendingProduct === baseProduct;
  const premiumBusy = purchasing && pendingProduct === premiumProduct;
  const restoreBusy = purchasing && pendingProduct === null;

  const storeName = Platform.OS === 'ios' ? t('subscription.store_ios') : t('subscription.store_android');

  return (
    <View style={styles.root}>
      <AmbientGlow />
      <ScreenHeader title={t('subscription.title')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current plan strip */}
        <GlassCard
          radius={16}
          style={[styles.planCard, stripTinted && { borderColor: hexToRgba(tierHue, 0.34) }]}
        >
          {stripTinted && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(tierHue, 0.09) }]} />
          )}
          <View style={styles.planBody}>
            <View style={[styles.tierPill, { backgroundColor: tierHue }]}>
              <Text style={[styles.tierPillText, { color: tierInk }]}>{tierLabel}</Text>
            </View>
            <Text style={styles.orgName} numberOfLines={1}>{organization.name}</Text>
            {tier === 'expired' ? (
              <View style={styles.expiredRow}>
                <IconSymbol
                  ios_icon_name="exclamationmark.triangle.fill"
                  android_material_icon_name="warning"
                  size={14}
                  color={hues.red}
                />
                <Text style={[styles.planLine, { color: hues.red, flex: 1 }]}>{planLine}</Text>
              </View>
            ) : (
              <Text style={styles.planLine}>{planLine}</Text>
            )}
            {isTrialActive && (
              <View style={styles.meter}>
                <View style={[styles.meterFill, { width: `${trialElapsedPct}%`, backgroundColor: hues.azure }]} />
              </View>
            )}
          </View>
          {isPaid && (
            <TouchableOpacity style={styles.manageChip} onPress={handleManageSubscription} activeOpacity={0.8}>
              <Text style={styles.manageLabel}>{t('subscription.manage')}</Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        {/* Monthly | Yearly — hidden until the yearly products exist */}
        {SHOW_YEARLY && (
          <SegControl<Billing>
            options={[
              { key: 'monthly', label: t('subscription.monthly') },
              { key: 'yearly', label: `${t('subscription.yearly')} · ${t('subscription.yearly_save')}` },
            ]}
            value={billing}
            onChange={setBilling}
          />
        )}

        {/* Feature matrix */}
        <GlassCard radius={16} style={styles.matrix}>
          <View style={[styles.mxRow, styles.mxHead]}>
            <Text style={styles.eyebrow} numberOfLines={1}>{t('subscription.whats_included')}</Text>
            <View style={styles.colBase}>
              <Text style={styles.colHead}>{t('subscription.plan_base')}</Text>
              <Text style={styles.colSub}>{priceBase} {perMonth}</Text>
            </View>
            <View style={styles.colPrem}>
              <Text style={[styles.colHead, { color: hues.gold }]}>{t('subscription.plan_premium')}</Text>
              <Text style={styles.colSub}>{pricePremium} {perMonth}</Text>
            </View>
          </View>

          {PREMIUM_FEATURE_KEYS.map((key) => (
            <View key={key} style={[styles.mxRow, styles.mxRowLine, { backgroundColor: hexToRgba(hues.gold, 0.05) }]}>
              <Text style={styles.mxLabel}>{t(`subscription.${key}`)}</Text>
              <View style={styles.colBase}>
                <Mark kind="no" hue={colors.textSecondary} fill={colors.glass} />
              </View>
              <View style={styles.colPrem}>
                <Mark kind="ok" hue={hues.gold} fill={hexToRgba(hues.gold, 0.2)} />
              </View>
            </View>
          ))}

          {BASE_FEATURE_KEYS.map((key) => (
            <View key={key} style={[styles.mxRow, styles.mxRowLine]}>
              <Text style={styles.mxLabel}>{t(`subscription.${key}`)}</Text>
              <View style={styles.colBase}>
                <Mark kind="ok" hue={hues.ok} fill={hexToRgba(hues.ok, 0.18)} />
              </View>
              <View style={styles.colPrem}>
                <Mark kind="ok" hue={hues.ok} fill={hexToRgba(hues.ok, 0.18)} />
              </View>
            </View>
          ))}
        </GlassCard>

        {/* CTAs under the columns */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.glassBtn, styles.btnFlex, (purchasing || tier === 'base') && styles.btnDim]}
            onPress={() => handlePurchase(baseProduct)}
            disabled={purchasing || tier === 'base'}
            activeOpacity={0.8}
          >
            {baseBusy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.glassBtnLabel} numberOfLines={1}>{baseLabel}</Text>
            )}
          </TouchableOpacity>
          <ShineButton
            style={styles.btnFlex}
            label={premiumLabel}
            gradient={PREMIUM_GRADIENT}
            // The star is dropped on the long "Upgrade to Premium" label so it fits the half-width.
            iosIcon={tier === 'base' ? undefined : 'star.fill'}
            androidIcon={tier === 'base' ? undefined : 'star'}
            onPress={() => handlePurchase(premiumProduct)}
            disabled={purchasing || tier === 'premium'}
            loading={premiumBusy}
          />
        </View>

        {/* Restore purchases */}
        <TouchableOpacity style={styles.restore} onPress={handleRestore} disabled={purchasing} activeOpacity={0.7}>
          {restoreBusy ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={14} color={colors.tint} />
          )}
          <Text style={styles.restoreLabel}>{t('subscription.restore')}</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>{t('subscription.footer', { store: storeName })}</Text>
      </ScrollView>
    </View>
  );
}

/** The 17pt check / X circle in a matrix cell. */
function Mark({ kind, hue, fill }: { kind: 'ok' | 'no'; hue: string; fill: string }) {
  return (
    <View style={[markStyles.circle, { backgroundColor: fill }]}>
      {kind === 'ok' ? (
        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color={hue} />
      ) : (
        <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={11} color={hue} />
      )}
    </View>
  );
}

const markStyles = StyleSheet.create({
  circle: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function createStyles(colors: ThemeColorSet) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 40,
      gap: 12,
    },

    // Owner gate
    gateWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingBottom: 60,
    },
    gateCard: {
      padding: 20,
      alignItems: 'center',
      gap: 12,
    },
    gateText: {
      fontFamily: fonts.display.semibold,
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
      textAlign: 'center',
    },

    // Current plan strip
    planCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 13,
    },
    planBody: { flex: 1, minWidth: 0 },
    tierPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
    },
    tierPillText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
    },
    orgName: {
      fontFamily: fonts.display.bold,
      fontSize: 16,
      color: colors.text,
      marginTop: 3,
    },
    planLine: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 1,
    },
    expiredRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 2,
    },
    meter: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.glassBorder,
      overflow: 'hidden',
      marginTop: 7,
    },
    meterFill: {
      height: '100%',
      borderRadius: 2,
    },
    manageChip: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 9,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    manageLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 12,
      color: colors.text,
    },

    // Feature matrix
    matrix: {
      padding: 0,
    },
    mxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    mxRowLine: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    mxHead: {
      paddingVertical: 10,
      backgroundColor: colors.glass,
    },
    eyebrow: {
      flex: 1,
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    colBase: { width: 66, alignItems: 'center' },
    colPrem: { width: 74, alignItems: 'center' },
    colHead: {
      fontFamily: fonts.display.bold,
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
    },
    colSub: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9.5,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    mxLabel: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 12.5,
      color: colors.text,
      paddingRight: 6,
    },

    // CTAs
    btnRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    btnFlex: { flex: 1 },
    glassBtn: {
      minHeight: 50,
      borderRadius: 13,
      paddingHorizontal: 12,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassBtnLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 14,
      color: colors.text,
    },
    btnDim: { opacity: 0.55 },

    // Restore + footer
    restore: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    restoreLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 13,
      color: colors.tint,
    },
    footer: {
      fontFamily: fonts.body.regular,
      fontSize: 11,
      lineHeight: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
  });
}
