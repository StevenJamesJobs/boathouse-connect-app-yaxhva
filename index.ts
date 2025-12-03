
import 'react-native-url-polyfill/auto';

// Comprehensive polyfill for window object in React Native
// This must be done before any other imports that might use window
if (typeof window === 'undefined') {
  (global as any).window = global;
  (global as any).window.addEventListener = () => {};
  (global as any).window.removeEventListener = () => {};
  (global as any).window.dispatchEvent = () => true;
  (global as any).window.location = {
    href: '',
    protocol: 'https:',
    host: '',
    hostname: '',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
  };
  (global as any).window.navigator = {
    userAgent: 'ReactNative',
  };
}

// Additional polyfills for browser APIs
if (typeof document === 'undefined') {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({}),
    getElementById: () => null,
  };
}

import 'expo-router/entry';
