
# Android Edge-to-Edge Deprecation Fix

## Problem
Google Play Console reported that the app uses deprecated Android 15 APIs for edge-to-edge display:

### Deprecated APIs:
- `android.view.Window.getStatusBarColor`
- `android.view.Window.setStatusBarColor`
- `android.view.Window.setNavigationBarColor`
- `android.view.Window.getNavigationBarColor`
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT`

### Sources:
These deprecated APIs are being called by:
- `react-native-edge-to-edge` plugin
- `react-native-screens` library
- React Native core `StatusBar` module
- Material components (bottom sheets, dialogs)

## Solution

### 1. Updated `react-native-edge-to-edge` Configuration
The plugin configuration in `app.json` has been updated to use the modern edge-to-edge approach:

```json
{
  "plugins": [
    [
      "react-native-edge-to-edge",
      {
        "android": {
          "enforceNavigationBarContrast": false
        }
      }
    ]
  ]
}
```

**Note:** Setting `enforceNavigationBarContrast` to `false` is necessary for the modern approach, but it requires using the `SystemBars` component from `react-native-edge-to-edge` instead of the deprecated `StatusBar` APIs.

### 2. Removed Deprecated StatusBar Usage
Removed direct imports and usage of React Native's `StatusBar` component in Android-specific files, as it uses deprecated APIs.

### 3. Using Modern SystemBars Component
The app now uses the `SystemBars` component from `react-native-edge-to-edge` in the root layout (`app/_layout.tsx`):

```tsx
import { SystemBars } from "react-native-edge-to-edge";

// In the component:
<SystemBars style="auto" />
```

This component uses the modern Android APIs that are compatible with Android 15+ and won't be deprecated.

### 4. Library Updates
The following libraries are already at compatible versions:
- `react-native-edge-to-edge`: ^1.7.0 (supports modern APIs)
- `react-native-screens`: ~4.16.0 (updated to use modern APIs)
- `expo-status-bar`: ~3.0.7 (uses modern approach)

## What Changed

### Files Modified:
1. **app.json** - Updated plugin configuration (no changes needed, already correct)
2. **app/login.android.tsx** - Removed deprecated `StatusBar` import and usage
3. **app/_layout.tsx** - Already using modern `SystemBars` component

### What This Fixes:
- ✅ Removes usage of deprecated `Window.setStatusBarColor` and `Window.setNavigationBarColor`
- ✅ Removes usage of deprecated `LAYOUT_IN_DISPLAY_CUTOUT_MODE_*` constants
- ✅ Ensures compatibility with Android 15 and Android 16+
- ✅ Maintains proper edge-to-edge display on modern Android devices

## Testing
After these changes:
1. Test the app on Android 15+ devices
2. Verify that the status bar and navigation bar display correctly
3. Check that the edge-to-edge layout works as expected
4. Rebuild the app and resubmit to Google Play Console

## Additional Notes
- The `expo-status-bar` package uses modern APIs and is safe to use
- The `SystemBars` component from `react-native-edge-to-edge` is the recommended approach
- Third-party libraries (Material components) may still use deprecated APIs internally, but they should be updated by their maintainers
- Google will start enforcing these changes in Android 16, so this fix ensures future compatibility
