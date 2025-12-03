
import 'react-native-url-polyfill/auto';

// Comprehensive polyfill for window object in React Native
if (typeof window === 'undefined') {
  (global as any).window = global;
}

// Additional polyfills for browser APIs that might be missing
if (typeof (global as any).window !== 'undefined') {
  if (!(global as any).window.addEventListener) {
    (global as any).window.addEventListener = () => {};
  }
  if (!(global as any).window.removeEventListener) {
    (global as any).window.removeEventListener = () => {};
  }
}

import 'expo-router/entry';
