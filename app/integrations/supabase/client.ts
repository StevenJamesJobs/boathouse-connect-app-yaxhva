
// CRITICAL: Import polyfill first - this must be before any other imports
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = "https://xvbajqukbakcvdrkcioi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2YmFqcXVrYmFrY3ZkcmtjaW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODU5NzIsImV4cCI6MjA4MDI2MTk3Mn0.xsORz6eja_UxR3D81lNx3yctumdiKrpcU6vzTFErfqo";

// Create a function to initialize the Supabase client
// This ensures it's only created when actually needed (client-side)
function createSupabaseClient() {
  console.log('[Supabase] Initializing Supabase client for platform:', Platform.OS);
  
  try {
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    
    console.log('[Supabase] Client initialized successfully');
    return client;
  } catch (error) {
    console.error('[Supabase] Error initializing client:', error);
    throw error;
  }
}

// Export a lazy-initialized client
let _supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    // Initialize the client on first access
    if (!_supabaseClient) {
      console.log('[Supabase] First access, creating client...');
      _supabaseClient = createSupabaseClient();
    }
    return (_supabaseClient as any)[prop];
  }
});

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
