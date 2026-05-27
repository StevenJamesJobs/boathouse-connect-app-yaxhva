import { Platform } from 'react-native';
import { IS_MCLOONES } from '@/constants/buildVariant';

// RevenueCat public API keys — fill in after dashboard setup
// These are safe to include in client code (they identify your app, not secret)
export const REVENUECAT_API_KEY_IOS = 'appl_PLACEHOLDER';
export const REVENUECAT_API_KEY_ANDROID = 'goog_PLACEHOLDER';

export const REVENUECAT_API_KEY =
  Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

// Product identifiers — must match App Store Connect / Google Play Console
export const PRODUCTS = {
  BASE_MONTHLY: 'mrc_base_monthly',
  PREMIUM_MONTHLY: 'mrc_premium_monthly',
} as const;

// Entitlement identifiers — configured in RevenueCat dashboard
export const ENTITLEMENTS = {
  BASE: 'base',
  PREMIUM: 'premium',
} as const;

// Skip RevenueCat for McLoone's variant and web
export const REVENUECAT_ENABLED =
  !IS_MCLOONES && Platform.OS !== 'web';

export const REVENUECAT_CONFIGURED =
  REVENUECAT_ENABLED &&
  !REVENUECAT_API_KEY.includes('PLACEHOLDER');
