# Building & Releasing

Runbook for building and shipping the two apps in this repo. Kept **in the repo** so every machine
and every AI assistant working on it stays on the same page — see the **Build Log** at the bottom and
append a row whenever you build.

> This is an **Expo managed workflow** (there is intentionally **no `ios/` or `android/` directory** —
> EAS runs `expo prebuild` in the cloud). Native config lives in [`app.config.ts`](./app.config.ts).
> The old README note about editing `ios/BoathouseConnect/Info.plist` is **stale** and does not apply.

## Two apps, one codebase (variants)

Selected by the `APP_VARIANT` env var (default `public`):

| Variant | `APP_VARIANT` | App name | Slug | iOS bundle id | Android package | EAS projectId | RevenueCat |
|---|---|---|---|---|---|---|---|
| **MyResto** | `public` (default) | MyResto Connect | `MyRestoConnect` | `com.myrestoconnect.app` | (see app.config.ts) | `a202f52f-a6b0-4eba-a5c1-081c2b134d9e` | **enabled** (IAP) |
| **Boathouse** | `mcloones` | Boathouse Connect | `BoathouseConnect` | `com.stevenjamesjobs.mcloonesboathouseconnect` | (see app.config.ts) | `1ab6bb51-f4ea-445b-8c25-cd0c5d0d4fea` | disabled (hardcoded premium) |

EAS account: **stevenjamesjobs**. Apple Team: **86JRKCMC65** (Steven Eccles — Individual).

## Prerequisites

- `eas-cli` installed and logged in: `eas whoami` → `stevenjamesjobs`. (A "version outdated" warning is harmless.)
- Local Node version doesn't matter — EAS builds on its own Node (pinned to `22.15.0` in the `production` profile).
- **Gates before building** (same as the dev workflow): `npx tsc --noEmit` with 0 net-new errors, and en/es i18n key parity. Build from a **committed** commit on `main` (EAS archives git state).

## Versioning

`eas.json` sets `cli.appVersionSource: "remote"`, and the `production*` profiles set `autoIncrement: true`.
**EAS owns the build number** and bumps it automatically each build (e.g. MyResto 9 → 10). The
`ios.buildNumber` / `android.versionCode` in `app.config.ts` are therefore ignored for numbering
(EAS prints a note about this — expected).

- **Test build of the same version** → no manual change needed; just build (autoIncrement gives the next build number).
- **New store version** → bump `version` in [`app.config.ts`](./app.config.ts) for the variant, and keep [`package.json`](./package.json) `version` in sync. That's it (no Info.plist in managed workflow). Use `eas build:version:set` only to manually override the remote build number.

## Build (iOS)

```bash
# MyResto (public) — the App Store / TestFlight app with in-app purchases
APP_VARIANT=public   eas build -p ios --profile production-public --non-interactive

# Boathouse (mcloones)
APP_VARIANT=mcloones eas build -p ios --profile production-mcloones --non-interactive
```

Credentials (distribution cert + provisioning profile) are stored **on the EAS server, per account** —
so `--non-interactive` works on any machine once you're logged in; you do **not** re-set up signing per
machine. If EAS ever asks to log into Apple / set up credentials, that's an **interactive step a human
must run** (an AI assistant cannot enter Apple/EAS credentials).

When the build finishes, EAS prints an **`.ipa` artifact URL** and a build detail page.

## Deliver to TestFlight / App Store

**Primary method (Steve's workflow): Transporter.**
1. Open the build's page on expo.dev and **download the `.ipa`** (or use the artifact URL).
2. Open the **Transporter** app (Mac App Store), sign in with the Apple ID, drag in the `.ipa`, and **Deliver**.
3. It lands in **App Store Connect → TestFlight** after Apple processes it (~10–30 min). Assign internal testers.

**Alternative method: `eas submit`.**
```bash
APP_VARIANT=public eas submit -p ios --latest
```
⚠️ Run this **interactively the first time** — `eas.json`'s `submit` block only has an **Android** profile,
so iOS submit fails non-interactively with *"Set ascAppId in the submit profile or re-run in interactive
mode."* The interactive run authenticates to App Store Connect (API key or Apple ID) and auto-detects the
app. To make future iOS submits one-command, add an iOS submit profile to `eas.json` after the first run:
```jsonc
"submit": {
  "production-public": { "ios": { "ascAppId": "<numeric App Store Connect app id>", "appleTeamId": "86JRKCMC65" } },
  "production": { "android": { "serviceAccountKeyPath": "./google-play-service-account.json", "track": "internal" } }
}
```

## Sandbox in-app-purchase testing (MyResto only)

RevenueCat is configured for the `public` variant (real iOS key in `config/revenueCat.ts`;
disabled for `mcloones`, which is hardcoded premium). IAP only works in a real build (native module —
**not** available in Expo Go). To test on a TestFlight build:
1. Create a **Sandbox Apple ID**: App Store Connect → Users and Access → Sandbox → Testers.
2. On device: sign **out** of the normal App Store account (or set the sandbox tester in Settings → Developer).
3. Open the app as an **owner** whose org trial has ended, hit the paywall, buy a plan, and sign in with the sandbox account when prompted.
4. **Verify the tier persists** (survives an app reopen) — i.e. the purchase reconciled to the org's DB row.
   `SubscriptionContext.reconcileWithRevenueCat` calls `upsert_organization_subscription` with the actor id,
   so an owner-device purchase writes the tier server-side. (This path was dead before the 2026-07-16 fix.)

## Dev / preview builds

- `eas build -p ios --profile development` → dev client (internal distribution).
- `eas build -p ios --profile preview` → internal distribution, no dev client.
- Local dev (no build): from the worktree, `APP_VARIANT=public npx expo start -c --go`.

## Conventions for collaborators (human + AI, across machines)

- Build from **`main`**, committed, gates green.
- **Append a row to the Build Log below for every build** so the desktop and MacBook (and their AI
  assistants) can see who built what, from which commit, delivered how, and any issues — then commit it.
- Keep secrets out of this file. The `.p8` App Store Connect key, Google Play service-account JSON, and
  any sandbox credentials are **not** committed.

## Build Log

Newest first. Columns: date · variant · version (build#) · commit · built by · delivered via · notes.

| Date | Variant | Version (build) | Commit | Built by | Delivered via | Notes |
|---|---|---|---|---|---|---|
| 2026-07-16 | MyResto (public) | 1.0.0 (10) | `504fcb4` | Claude (MacBook) — EAS `production-public`, non-interactive | Transporter (Steve) | First build after the Session-47 security lockdown (org-config + content RPC lockdown, menu-upload-credits mint hole closed, onboarding fix, RevenueCat tier-sync fix). Credentials validated automatically. **Sandbox IAP CONFIRMED on TestFlight:** a Premium sandbox purchase on Belmont Tavern flipped its DB `subscription_tier` `expired`→`premium` — the RC tier-sync fix works end-to-end. |
