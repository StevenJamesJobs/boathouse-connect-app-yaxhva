# Boathouse Connect

Staff communication and management app for McLoone's Boathouse (West Orange, NJ). Live on the Apple App Store and Google Play.

## Stack

- **App**: React Native + [Expo](https://expo.dev) (Expo Router for file-based routing)
- **Backend**: [Supabase](https://supabase.com) (Postgres + Edge Functions + Storage + RLS)
- **Auth & Push**: Firebase
- **Internationalization**: i18next (English + Spanish)
- **Builds & Submission**: EAS Build + EAS Submit

## Directory layout

```
app/                    Expo Router routes (file-based)
  (portal)/manager/     Manager-side tabs
  (portal)/employee/    Employee-side tabs
  ...                   Top-level screens (login, editors, games, etc.)
components/             Shared React components
contexts/               Auth, Theme, Notification, etc.
hooks/                  Reusable hooks (useThemeColors, useUnreadMessages, ...)
utils/                  Pure helpers (date formatting, game adapters, ...)
locales/                en.json + es.json translation strings
styles/                 Shared style helpers
assets/images/          App icons, splash, content imagery
supabase/
  functions/            Edge Functions (e.g. send-push-notification)
  migrations/           SQL migrations
ios/ + android/         Prebuilt native projects (gitignored where applicable)
```

For a more detailed map see [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md), and for the user-facing flow see [APP_FLOW_DIAGRAM.md](./APP_FLOW_DIAGRAM.md).

## Local development

```bash
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

## Builds & store submission

Production builds run on [EAS](https://expo.dev/eas). The `production` profile in [eas.json](./eas.json) handles signing and auto-increments build numbers via `appVersionSource: "remote"`.

```bash
# Build
eas build -p ios --profile production
eas build -p android --profile production

# Submit
eas submit -p ios --latest
eas submit -p android --latest
```

**Version bumps require a multi-step checklist** (`app.json` + `package.json` + `ios/BoathouseConnect/Info.plist` + `eas build:version:set`). Skipping any step has blocked App Store submissions in the past — follow the full sequence carefully.

## Environment

- **Supabase project ID**: `xvbajqukbakcvdrkcioi` — manage via the Supabase dashboard or MCP tools, never hardcode IDs in client code.
- **Translations**: column-pair pattern (`field` + `field_es`) with SECURITY DEFINER RPCs handling Spanish writes. Never write `_es` columns from the client directly.
- **Push notifications**: Edge Function `send-push-notification` sends via Expo Push API; Sent History rows are written by the calling editor (not the function), so deploys of this function need to be coordinated with app version rollouts.
