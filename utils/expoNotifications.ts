/**
 * Guarded access to expo-notifications.
 *
 * Expo Go on Android lost remote push in SDK 53, and since expo-notifications
 * 57.0.19 the package THROWS while it is being imported there (its
 * TokenEmitter calls `warnOfExpoGoPushUsage` at module scope). A plain
 * `import * as Notifications from 'expo-notifications'` inside a context the
 * root layout mounts therefore took every route down on Android Expo Go
 * ("missing the required default export" for the whole tree). Nothing may
 * import the package statically — call `getNotifications()` instead. It
 * returns null on web and on Android Expo Go (those environments simply skip
 * local notifications, listeners and the app badge) and the real module in
 * dev-client / EAS builds and in iOS Expo Go.
 */
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

export type NotificationsModule = typeof import('expo-notifications');

export const NOTIFICATIONS_SUPPORTED: boolean =
  Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

let cached: NotificationsModule | null | undefined;

export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!NOTIFICATIONS_SUPPORTED) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as NotificationsModule;
  } catch (err) {
    console.warn('[expoNotifications] expo-notifications unavailable in this environment:', err);
    cached = null;
  }
  return cached;
}
