
# EAS Build Fix Guide - Version 1.2 Build 6

## Problem
The EAS build was failing with the error:
```
(h.adapter || o.adapter) is not a function
```

This error typically occurs when a library (like axios) tries to use an HTTP adapter that's not available in the React Native environment.

## Changes Made

### 1. Version and Build Number Updates
- **app.json**: Already correctly set to version "1.2.0" with iOS buildNumber "6" and Android versionCode 6
- **package.json**: Updated version from "1.0.0" to "1.2.0"
- **eas.json**: Disabled autoIncrement to use manual version control

### 2. Fetch API Configuration
Updated `app/integrations/supabase/client.ts` to explicitly use native fetch:
```typescript
global: {
  // Explicitly use native fetch to avoid any adapter issues
  fetch: fetch.bind(globalThis),
}
```

### 3. Enhanced Polyfills
Updated `utils/polyfills.ts` to:
- Properly bind fetch to globalThis to prevent context issues
- Ensure fetch is available on both global and window objects
- Add logging for debugging

### 4. Import Order
Updated `index.ts` to ensure polyfills are loaded before expo-router:
```typescript
import 'react-native-url-polyfill/auto';
import './utils/polyfills';
import 'expo-router/entry';
```

### 5. Metro Configuration
Enhanced `metro.config.js` to ensure proper module resolution

### 6. App Configuration
Added Hermes JS engine specification to `app.json` for better performance and compatibility

## Next Steps

### 1. Clear Build Cache
Run these commands to clear all caches:
```bash
# Clear Expo cache
expo start -c

# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules
npm install
```

### 2. Update EAS Project ID
In `app.json`, replace `"your-eas-project-id-here"` with your actual EAS project ID. You can find this by running:
```bash
eas project:info
```

Or create a new EAS project:
```bash
eas build:configure
```

### 3. Build the App
Try building again with:
```bash
# For iOS
eas build --platform ios --profile production

# For Android
eas build --platform android --profile production

# For both
eas build --platform all --profile production
```

### 4. If Issues Persist

#### Check for Axios Dependencies
Run this command to check if any dependencies are using axios:
```bash
npm ls axios
```

If axios is found, it's likely a transitive dependency. You can check which package is bringing it in.

#### Verify Supabase Version
Ensure you're using the latest compatible version of @supabase/supabase-js:
```bash
npm update @supabase/supabase-js
```

#### Check EAS CLI Version
Ensure you have the latest EAS CLI:
```bash
npm install -g eas-cli
eas --version
```

Should be >= 13.2.0 as specified in eas.json

#### Review Build Logs
When the build runs, carefully review the logs for any mentions of:
- axios
- adapter
- HTTP client errors
- Network request failures

## Key Points

1. **Native Fetch**: The app now explicitly uses React Native's native fetch API, which is the recommended approach for Expo apps
2. **No Axios**: The app doesn't directly depend on axios, which is good
3. **Proper Polyfills**: All necessary polyfills are in place and loaded in the correct order
4. **Version Control**: Manual version control is now enabled (autoIncrement disabled)

## Verification

After building, verify:
1. The build completes without the adapter error
2. The app version shows as 1.2.0
3. The build number is 6 (iOS) and versionCode is 6 (Android)
4. All network requests (weather, Supabase) work correctly

## Additional Resources

- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Supabase JS Client Documentation](https://supabase.com/docs/reference/javascript/introduction)
- [React Native Fetch API](https://reactnative.dev/docs/network)
