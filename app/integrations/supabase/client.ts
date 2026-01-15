
// CRITICAL: Import polyfill first - this must be before any other imports
import 'react-native-url-polyfill/auto';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = "https://xvbajqukbakcvdrkcioi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2YmFqcXVrYmFrY3ZkcmtjaW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODU5NzIsImV4cCI6MjA4MDI2MTk3Mn0.xsORz6eja_UxR3D81lNx3yctumdiKrpcU6vzTFErfqo";

// Lazy-load AsyncStorage to avoid SSR issues
let AsyncStorage: any = null;

// Only import AsyncStorage in non-SSR environments
if (typeof window !== 'undefined' || Platform.OS !== 'web') {
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
    console.log('[Supabase] AsyncStorage loaded successfully');
  } catch (error) {
    console.warn('[Supabase] Failed to load AsyncStorage:', error);
  }
}

console.log('[Supabase] Initializing Supabase client for platform:', Platform.OS);

// Create the Supabase client with conditional storage
let supabase: ReturnType<typeof createClient<Database>>;

try {
  supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      // Only use AsyncStorage if it's available (not during SSR)
      storage: AsyncStorage || undefined,
      autoRefreshToken: true,
      persistSession: !!AsyncStorage,
      detectSessionInUrl: false,
    },
  });
  
  console.log('[Supabase] Client initialized successfully');
} catch (error) {
  console.error('[Supabase] CRITICAL ERROR initializing client:', error);
  // Create a fallback client to prevent app crash
  supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: undefined,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export { supabase };

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
