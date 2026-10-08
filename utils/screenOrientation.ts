/**
 * s91 — the one place the app talks to expo-screen-orientation.
 *
 * app.config.ts allows every orientation ("default") so the Kitchen Assistant's
 * Book reader can turn the phone sideways; the rest of the app is locked to
 * portrait by the root layout through lockPortrait(). Every call is wrapped —
 * the web bundle and any host without the native module (a stale Expo Go) must
 * never red-box over an orientation request.
 */
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

export async function lockPortrait(): Promise<void> {
  if (!native) return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    console.log('[orientation] lockPortrait failed', e);
  }
}

/** Landscape both ways — the reader follows whichever way the cook turns it. */
export async function lockLandscape(): Promise<void> {
  if (!native) return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch (e) {
    console.log('[orientation] lockLandscape failed', e);
  }
}

export async function currentIsLandscape(): Promise<boolean> {
  if (!native) return false;
  try {
    const o = await ScreenOrientation.getOrientationAsync();
    return o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
  } catch {
    return false;
  }
}

/** Fires with true/false as the device turns; returns the unsubscribe. */
export function onOrientationChange(cb: (landscape: boolean) => void): () => void {
  if (!native) return () => {};
  try {
    const sub = ScreenOrientation.addOrientationChangeListener((ev) => {
      const o = ev.orientationInfo.orientation;
      cb(o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT);
    });
    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  } catch {
    return () => {};
  }
}
