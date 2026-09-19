import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-level flags for the pre-login family (s86). None of these are secrets and none
 * are per-user: they describe what THIS PHONE has seen.
 *  - HAS_ACCOUNT: the device has reached a dashboard at least once → cold opens go to
 *    Login instead of Welcome. Set on the first portal mount (not at sign-in), so quitting
 *    mid-signup still lands on Welcome next time.
 *  - PERSONALIZED: someone walked the "Make it yours" theme step here → the stand-alone
 *    /personalize page is skipped after the forced password change.
 *  - LAST_USERNAME: written by AuthContext.establishSession; Login pre-fills it.
 */
export const DEVICE_FLAGS = {
  HAS_ACCOUNT: '@mrc_device_has_account',
  PERSONALIZED: '@mrc_personalized',
  LAST_USERNAME: '@mrc_last_username',
  LAST_ORG: '@mrc_last_org',
} as const;

export async function deviceHasReachedDashboard(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEVICE_FLAGS.HAS_ACCOUNT)) === '1';
  } catch {
    return false;
  }
}

export async function markDeviceReachedDashboard(): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [DEVICE_FLAGS.HAS_ACCOUNT, '1'],
      // Anyone who has reached a dashboard is past the first-run picker.
      [DEVICE_FLAGS.PERSONALIZED, '1'],
    ]);
  } catch {}
}

export async function markPersonalized(): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_FLAGS.PERSONALIZED, '1');
  } catch {}
}

/** First-run theme picker still owed? (never reached a dashboard AND never walked the step) */
export async function shouldOfferPersonalize(): Promise<boolean> {
  try {
    const rows = await AsyncStorage.multiGet([DEVICE_FLAGS.HAS_ACCOUNT, DEVICE_FLAGS.PERSONALIZED]);
    return rows.every(([, v]) => v !== '1');
  } catch {
    return false;
  }
}

export async function getLastUsername(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(DEVICE_FLAGS.LAST_USERNAME)) ?? '';
  } catch {
    return '';
  }
}

export async function clearLastUsername(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_FLAGS.LAST_USERNAME);
  } catch {}
}

/** Dev only: forget that this device ever had an account (re-opens Welcome). */
export async function resetDeviceFirstRun(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([DEVICE_FLAGS.HAS_ACCOUNT, DEVICE_FLAGS.PERSONALIZED]);
  } catch {}
}
