import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import es from './locales/es.json';

const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'en';

// Build namespace-based resources from the flat JSON files.
// Each top-level key (e.g. "announcement_editor", "menu_editor") becomes
// its own i18next namespace so that t('announcement_editor:title') resolves
// correctly.  We also keep a "translation" namespace with the full object
// so that non-namespaced lookups (dot-path) keep working.
const buildNamespaces = (translations: Record<string, any>) => {
  const namespaces: Record<string, any> = { translation: translations };
  for (const key of Object.keys(translations)) {
    if (typeof translations[key] === 'object' && translations[key] !== null) {
      namespaces[key] = translations[key];
    }
  }
  return namespaces;
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: buildNamespaces(en),
      es: buildNamespaces(es),
    },
    lng: deviceLanguage,
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;
