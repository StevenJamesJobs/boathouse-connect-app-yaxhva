import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useOrganization } from './OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { REVENUECAT_CONFIGURED, ENTITLEMENTS } from '@/config/revenueCat';

export type SubscriptionTier = 'trial' | 'base' | 'premium' | 'expired' | 'none';

export interface SubscriptionContextType {
  tier: SubscriptionTier;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  trialEndDate: Date | null;
  hasBase: boolean;
  hasPremium: boolean;
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
}

const MCLOONES_STATE: SubscriptionContextType = {
  tier: 'premium',
  isTrialActive: false,
  trialDaysRemaining: 0,
  trialEndDate: null,
  hasBase: true,
  hasPremium: true,
  isLoading: false,
  refreshSubscription: async () => {},
};

const DEFAULT_STATE: SubscriptionContextType = {
  tier: 'none',
  isTrialActive: false,
  trialDaysRemaining: 0,
  trialEndDate: null,
  hasBase: false,
  hasPremium: false,
  isLoading: true,
  refreshSubscription: async () => {},
};

const SubscriptionContext = createContext<SubscriptionContextType>(DEFAULT_STATE);

function computeState(
  tier: SubscriptionTier,
  trialEndDate: Date | null,
): Omit<SubscriptionContextType, 'refreshSubscription' | 'isLoading'> {
  const now = new Date();
  const isTrialActive = tier === 'trial' && trialEndDate != null && trialEndDate > now;
  const trialDaysRemaining =
    isTrialActive && trialEndDate
      ? Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  const hasBase = tier === 'base' || tier === 'premium' || isTrialActive;
  const hasPremium = tier === 'premium' || isTrialActive;

  return { tier, isTrialActive, trialDaysRemaining, trialEndDate, hasBase, hasPremium };
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  if (IS_MCLOONES) {
    return (
      <SubscriptionContext.Provider value={MCLOONES_STATE}>
        {children}
      </SubscriptionContext.Provider>
    );
  }

  return <SubscriptionProviderInner>{children}</SubscriptionProviderInner>;
}

function SubscriptionProviderInner({ children }: { children: ReactNode }) {
  const { organizationId } = useOrganization();
  const [state, setState] = useState<SubscriptionContextType>(DEFAULT_STATE);
  const initializedOrg = useRef<string | null>(null);

  const fetchSubscription = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_organization_subscription', {
        p_organization_id: orgId,
      });

      if (error) {
        console.error('[Subscription] Error fetching:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const row = data[0];
      return {
        tier: row.subscription_tier as SubscriptionTier,
        trialEndDate: row.trial_end_date ? new Date(row.trial_end_date) : null,
      };
    } catch (err) {
      console.error('[Subscription] Exception:', err);
      return null;
    }
  }, []);

  const initializeTrial = useCallback(async (orgId: string) => {
    try {
      await (supabase.rpc as any)('initialize_org_trial', {
        p_organization_id: orgId,
      });
    } catch (err) {
      console.error('[Subscription] Trial init error:', err);
    }
  }, []);

  const expireTrial = useCallback(async (orgId: string) => {
    try {
      await (supabase.rpc as any)('expire_org_trial', {
        p_organization_id: orgId,
      });
    } catch (err) {
      console.error('[Subscription] Expire error:', err);
    }
  }, []);

  const reconcileWithRevenueCat = useCallback(async (orgId: string, dbTier: SubscriptionTier) => {
    if (!REVENUECAT_CONFIGURED || Platform.OS === 'web') return dbTier;

    try {
      const Purchases = (await import('react-native-purchases')).default;
      const customerInfo = await Purchases.getCustomerInfo();

      const hasPremiumEntitlement =
        customerInfo.entitlements.active[ENTITLEMENTS.PREMIUM] !== undefined;
      const hasBaseEntitlement =
        customerInfo.entitlements.active[ENTITLEMENTS.BASE] !== undefined;

      let rcTier: SubscriptionTier = dbTier;
      if (hasPremiumEntitlement) {
        rcTier = 'premium';
      } else if (hasBaseEntitlement) {
        rcTier = 'base';
      }

      if (rcTier !== dbTier && (rcTier === 'base' || rcTier === 'premium')) {
        await (supabase.rpc as any)('upsert_organization_subscription', {
          p_organization_id: orgId,
          p_subscription_tier: rcTier,
        });
        return rcTier;
      }

      return dbTier;
    } catch (err) {
      console.warn('[Subscription] RevenueCat check skipped:', err);
      return dbTier;
    }
  }, []);

  const scheduleTrialNotifications = useCallback(async (trialEnd: Date) => {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      const now = Date.now();
      const reminders = [
        { days: 7, title: 'Trial Ending Soon', body: 'Your MyResto Connect trial ends in 7 days. Choose a plan to keep all features.' },
        { days: 2, title: 'Trial Ending in 2 Days', body: 'Your trial ends in 2 days. Subscribe now to avoid losing premium features.' },
        { days: 1, title: 'Last Day of Your Trial', body: 'Last day of your free trial! Subscribe today to keep your team connected.' },
      ];

      for (const reminder of reminders) {
        const triggerDate = new Date(trialEnd.getTime() - reminder.days * 24 * 60 * 60 * 1000);
        if (triggerDate.getTime() > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: reminder.title,
              body: reminder.body,
              data: { type: 'custom', destination: 'subscription-management' },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
          });
        }
      }
    } catch (err) {
      console.warn('[Subscription] Failed to schedule trial notifications:', err);
    }
  }, []);

  const loadSubscription = useCallback(async (orgId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    let result = await fetchSubscription(orgId);

    if (!result) {
      await initializeTrial(orgId);
      result = await fetchSubscription(orgId);
    }

    if (!result) {
      setState({ ...DEFAULT_STATE, isLoading: false });
      return;
    }

    let { tier, trialEndDate } = result;

    // Auto-expire trials that have passed their end date
    if (tier === 'trial' && trialEndDate && trialEndDate <= new Date()) {
      await expireTrial(orgId);
      tier = 'expired';
    }

    // Reconcile with RevenueCat (may upgrade tier if purchase detected)
    tier = await reconcileWithRevenueCat(orgId, tier);

    const computed = computeState(tier, trialEndDate);
    setState({ ...computed, isLoading: false, refreshSubscription: () => loadSubscription(orgId) });

    if (computed.isTrialActive && trialEndDate) {
      scheduleTrialNotifications(trialEndDate);
    }
  }, [fetchSubscription, initializeTrial, expireTrial, reconcileWithRevenueCat]);

  const refreshSubscription = useCallback(async () => {
    if (organizationId) {
      await loadSubscription(organizationId);
    }
  }, [organizationId, loadSubscription]);

  useEffect(() => {
    if (!organizationId) {
      setState({ ...DEFAULT_STATE, isLoading: false });
      initializedOrg.current = null;
      return;
    }

    if (initializedOrg.current === organizationId) return;
    initializedOrg.current = organizationId;

    loadSubscription(organizationId);
  }, [organizationId, loadSubscription]);

  const contextValue: SubscriptionContextType = {
    ...state,
    refreshSubscription,
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
