
// CRITICAL: This polyfill MUST be the very first import
// It must run before any code that might reference window or document
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
    assign: () => {},
    reload: () => {},
    replace: () => {},
  };
  (global as any).window.navigator = {
    userAgent: 'ReactNative',
    language: 'en-US',
    languages: ['en-US', 'en'],
    onLine: true,
  };
  (global as any).window.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  (global as any).window.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
}

// Additional polyfills for browser APIs
if (typeof document === 'undefined') {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({}),
    getElementById: () => null,
    documentElement: {
      style: {},
    },
    body: {
      style: {},
    },
    cookie: '',
  };
}

// Polyfill for CustomEvent
if (typeof CustomEvent === 'undefined') {
  (global as any).CustomEvent = class CustomEvent {
    constructor(public type: string, public detail?: any) {}
  };
}

// Now we can safely import expo-router
import 'expo-router/entry';
