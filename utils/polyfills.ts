
// Ensure fetch is available globally and properly bound
if (typeof global.fetch !== 'undefined') {
  // Ensure fetch is bound to globalThis to prevent context issues
  const originalFetch = global.fetch;
  global.fetch = function(...args: any[]) {
    return originalFetch.apply(globalThis, args);
  };
  console.log('Fetch polyfill applied successfully');
} else {
  console.warn('Fetch is not available globally, this may cause issues');
}

// Polyfill window object
if (typeof window === 'undefined') {
  (global as any).window = global;
}

// Add all window properties
if (typeof window !== 'undefined') {
  // Ensure fetch is also available on window
  if (typeof window.fetch === 'undefined' && typeof global.fetch !== 'undefined') {
    (window as any).fetch = global.fetch;
  }
  
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
