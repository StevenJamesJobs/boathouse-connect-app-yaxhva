/**
 * SystemBars that survives Expo Go on Android.
 *
 * `react-native-edge-to-edge` resolves its `RNEdgeToEdge` TurboModule at
 * import time with `getEnforcing`, and Expo Go does not ship that module
 * (the library's README: "not supported in the Expo Go sandbox app, use a
 * development build"). Importing it at module scope in `app/_layout.tsx`
 * therefore threw while the route tree was being evaluated on Android and
 * took every route down with it (the "missing the required default export"
 * storm). Development / EAS builds autolink the module and get the real
 * component; Expo Go falls back to nothing — expo-status-bar (mounted next
 * to this in the root layout) still styles the status bar there, and the
 * navigation bar keeps the system default.
 */
import React from 'react';
import { Platform, TurboModuleRegistry } from 'react-native';
import type { SystemBarsProps } from 'react-native-edge-to-edge';

type SystemBarsComponent = React.ComponentType<SystemBarsProps>;

function loadSystemBars(): SystemBarsComponent | null {
  if (Platform.OS === 'web') return null;
  // On Android the library hard-requires the native module; probe with the
  // non-throwing lookup first so Expo Go never evaluates the enforcing call.
  if (Platform.OS === 'android' && TurboModuleRegistry.get('RNEdgeToEdge') == null) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('react-native-edge-to-edge') as { SystemBars: SystemBarsComponent }).SystemBars;
  } catch {
    return null;
  }
}

const SystemBars = loadSystemBars();

/** True when the native edge-to-edge module is present (dev/EAS builds). */
export const SYSTEM_BARS_AVAILABLE = SystemBars != null;

export function SystemBarsSafe(props: SystemBarsProps) {
  if (!SystemBars) return null;
  return <SystemBars {...props} />;
}

export default SystemBarsSafe;
