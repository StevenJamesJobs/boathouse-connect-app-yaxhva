import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://xvbajqukbakcvdrkcioi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2YmFqcXVrYmFrY3ZkcmtjaW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODU5NzIsImV4cCI6MjA4MDI2MTk3Mn0.xsORz6eja_UxR3D81lNx3yctumdiKrpcU6vzTFErfqo";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
