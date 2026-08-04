import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import { supabase } from '@/app/integrations/supabase/client';
import { getCurrentActorId } from '@/utils/currentActor';

export const LANGUAGE_STORAGE_KEY = '@app_language';

export type SupportedLanguage = 'en' | 'es';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Seed from i18n so the toggle reflects the auto-detected device language
  // (i18n.ts inits lng from expo-localization before this provider mounts).
  const [language, setLanguageState] = useState<SupportedLanguage>(
    i18n.language === 'es' ? 'es' : 'en'
  );

  useEffect(() => {
    // Load saved language preference on startup
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'es') {
        setLanguageState(saved);
        i18n.changeLanguage(saved);
      }
    });
  }, []);

  const setLanguage = async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    // s62: mirror the choice to users.preferred_language so push senders can
    // localize per recipient. LanguageProvider mounts OUTSIDE AuthProvider, so
    // the actor comes from module scope; logged out (null) skips — the
    // AuthContext session effect syncs at next login. Fire-and-forget.
    const actorId = getCurrentActorId();
    if (actorId) {
      supabase
        .rpc('set_my_preferred_language', { p_user_id: actorId, p_language: lang })
        .then(({ error }) => {
          if (error) console.warn('[LanguageContext] preferred_language sync failed:', error.message);
        });
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
