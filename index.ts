
import 'react-native-url-polyfill/auto';

// Polyfill for window object in React Native
if (typeof window === 'undefined') {
  global.window = global as any;
}

import 'expo-router/entry';
