
// CRITICAL: This polyfill MUST be the very first thing that runs
// It must execute before ANY other code, including imports

// Import URL polyfill first
import 'react-native-url-polyfill/auto';

// Import expo-router entry
import 'expo-router/entry';

// Polyfill window object IMMEDIATELY
if (typeof window === 'undefined') {
  (global as any).window = global;
}

// Now add all window properties
if (typeof window !== 'undefined') {
  if (!window.addEventListener) {
    window.addEventListener = () => {};
  }
  if (!window.removeEventListener) {
    window.removeEventListener = () => {};
  }
  if (!window.dispatchEvent) {
    window.dispatchEvent = () => true;
  }
  if (!window.location) {
    (window as any).location = {
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
  }
  if (!window.navigator) {
    (window as any).navigator = {
      userAgent: 'ReactNative',
      language: 'en-US',
      languages: ['en-US', 'en'],
      onLine: true,
    };
  }
  if (!window.localStorage) {
    (window as any).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
  if (!window.sessionStorage) {
    (window as any).sessionStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
}

// Polyfill document object
if (typeof document === 'undefined') {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({}),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: {
      style: {},
    },
    body: {
      style: {},
    },
    cookie: '',
    readyState: 'complete',
  };
}

// Polyfill CustomEvent
if (typeof CustomEvent === 'undefined') {
  (global as any).CustomEvent = class CustomEvent {
    constructor(public type: string, params?: any) {
      this.detail = params?.detail;
    }
    detail: any;
  };
}

// Polyfill Event
if (typeof Event === 'undefined') {
  (global as any).Event = class Event {
    constructor(public type: string) {}
  };
}
