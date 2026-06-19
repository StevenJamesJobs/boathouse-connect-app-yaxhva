# MyResto Connect — Welcome Redesign: RN Build Plan

Reference mockup: `design-mockups/welcome-myresto.html` (light/dark toggle, exact hex, all interactions).
Scoped 2026-06-19 via a 3-agent codebase audit. Verified against the real code.

---

## 🟢 Headline (the great news)

- **v1 needs ZERO database migrations.** Theme, week-start, roster visibility, and search are all **client-side** in this app (RLS is permissive everywhere; gating is in TypeScript).
- **ZERO new npm dependencies.** `expo-blur`, `expo-linear-gradient`, `react-native-reanimated 4.1`, `react-native-gesture-handler`, and even `expo-glass-effect` are **already installed**.
- The only new **assets** are **7 font TTFs**. The only new **components** are `GlassCard`, `PortalHome`, `JoltOverlay`.
- **Glass is opt-in per component** (a new `GlassCard`) — the 127 screens that read solid `colors.card` keep working untouched.

---

## Phase 0 — Foundations (theme + fonts), app-wide

**Fonts** (`app/_layout.tsx`, `assets/fonts/`, new `constants/fonts.ts`)
- Bundle 7 static TTFs: Bricolage Grotesque SemiBold/Bold (display), Inter Regular/Medium/SemiBold (body), JetBrains Mono Medium/SemiBold (times/data).
- Register in the existing `useFonts({...})` call (splash-gate already blocks render until loaded). Add `constants/fonts.ts` with semantic names (`display`, `body`, `mono`). Bake weight into the family name (RN `fontWeight` is unreliable with custom families on Android). **No npm package** (vs `@expo-google-fonts/*` = 3 deps).

**Theme tokens** (`styles/commonStyles.ts`)
- Add **15 new fields** to `ThemeColorSet` (keep the existing 14, esp. keep **`card` SOLID**): `tint, ember, fireText, blue, blueText, glass, glassBorder, surface, surfaceBorder, hairline, navTint, sheen, thumbPlaceholder, glowA, glowB`. (`primary` already = the mockup's `--fire` accent — reuse it, don't add a `fire` field.)
- Replace `themePalettes` with **only `moonstone` + `ocean`** (4 modes), using the exact hex from the mockup's `.t-mono-*` / `.t-ocean-*` blocks (captured in the agent report). `ThemePaletteId` → `'moonstone' | 'ocean'`. `employeeColors`/`managerColors` aliases → `ocean`.

**Defaults + migration** (`contexts/ThemeContext.tsx`)
- `const DEFAULT_PALETTE = IS_MCLOONES ? 'ocean' : 'moonstone'; const DEFAULT_MODE = 'dark';` → MyResto = **Moonstone Dark**, Boathouse = **Ocean Dark**. Apply in **both** hardcoded default spots (createContext fallback + useState init — currently both `'winterchill'`/`'light'`).
- The existing `if (savedPalette in themePalettes)` guard already makes a removed palette fall back to default. Add a normalize step that **rewrites** a stale saved palette → default in AsyncStorage (preserve `mode`).

**Picker + i18n** (`app/appearance.tsx`, `app/settings.tsx`, `locales/*`)
- Picker auto-shows the 2 themes (driven by the shortened list). Add `appearance.theme_moonstone`, drop the 12 removed keys (watch the duplicate-key silent-override gotcha; keep en/es parity).

**New `components/GlassCard.tsx`** — `BlurView` + a translucent `colors.glass`/`surface` overlay + `glassBorder`. Android: set `experimentalBlurMethod="dimezisBlurView"`, and fall back to solid-low-opacity on low-end Android to avoid jank/overdraw.

---

## Phase 1 — Shared `PortalHome` extraction (do this FIRST to de-risk)

`app/(portal)/employee/index.tsx` and `manager/index.tsx` are ~1500 lines and **near-identical** (only 4 role deltas: announcement visibility `employees`/`managers`, `isManager` on the shift card, the `/menus` route, NotificationDropdown props). Extract a single `components/PortalHome.tsx` taking a `role` prop; the two files become 1-line wrappers. **Verify behavior parity before any redesign** so every later change lands once, not twice.

---

## Phase 2 — Welcome page rebuild (build order)

1. **WelcomeHeader** (`components/WelcomeHeader.tsx`): time-aware greeting headline ("Good {morning/afternoon/evening}, {firstName}", firstName = `user.name.split(' ')[0]`) ABOVE a one-row `[avatar | weather | messages | notifications]`; wrap in glass. Keep weather/unread wiring.
2. **ConnectBar** (`components/ConnectBar.tsx`): slim height; prepend an **icon-only clock "Schedule" tab** (`flex:0 0 38`); switch the active indicator from `%`-based to **measured `tabWidths`/`tabPositions`** (already captured) — animate `translateX` + `scaleX` (native-safe). `ConnectBarTab` → `'schedule'|'today'|'events'|'specials'`.
3. **Prepend the Schedule leaf** (in `PortalHome`): everything shifts +1 →
   `FLATLIST_PAGES = [schedule, today-announcements, today-special-features, events-event, events-entertainment, specials, menu-bridge]`; `MENU_BRIDGE_INDEX 5→6`; `SECTION_FIRST_LEAF {schedule:0, today:1, events:3, specials:5}`; rebucket `pageIndexToSection`; bump the scroll-handler/`goToLeaf`/sub-tab-derivation indices; add `initialScrollIndex` so the app **still lands on Today:Announcements** (not Schedule); Schedule is the hard-left clamp (`bounces={false}`). **`MenuDisplay.tsx` bridge needs no change.** Test the full 7-leaf swipe + the Menu round-trip.
4. **Schedule tab content** + **UpcomingShiftsCard** (`components/UpcomingShiftsCard.tsx`): `.limit(5)→7`, render 7 one-line rows; **decouple "View Roster"** out of the card (so managers with no shift still reach it) into the Schedule button row; add an `onViewRoster`/`mode` prop. Add the design-only reserved block (Available-for-pickup / Request-time-off / Release-shift / Approvals badge, "Coming soon"). Add the empty-state CTA ("Add your first schedule" → Schedule section) for post-onboarding.
5. **WeeklyCalendarStrip** (`components/WeeklyCalendarStrip.tsx`): glass day-tiles (visual only); already Sunday-based via `dateUtils`.
6. **Collapsing header + sticky sub-tabs (THE hard part):** custom **Reanimated** (reject `react-native-collapsible-tab-view` — wrong fit for a horizontally-paged layout). A shared `scrollY` written only by the active leaf; the "Happening Today" band animates `translateY`/`opacity` up behind the Connect bar; the Announcements/Special-Features sub-tab bar pins under the Connect bar (+ shadow when scrolled). Keep the no-Happening fallback. **Prototype in isolation first.**
7. **PortalTabBar** (`components/PortalTabBar.tsx`): glassier (lower nav tint + blur + inset sheen) + an **animated active pill** (measured widths, Reanimated `translateX`/`width`).
8. **Jolt** (new `components/JoltOverlay.tsx`): mount as a sibling overlay in each role's `_layout.tsx` (NOT inside PortalTabBar — it's clipped; NOT a tab slot) so it persists across all portal screens. FAB above the nav + full-screen command palette + **Reanimated fly-up** driven by an `open` shared value (NOT `sharedTransitionTag` — fragile on Reanimated 4/Fabric). v1 search = **client-side role-filtered index** (employees only for managers/owners; tools via `getAvailableTools`; etc.); Quick Tools chips → routes; Recent/Suggested rows.

---

## Phase 3 — Cross-app odds & ends

- **Sunday week-start:** `dateUtils.getWeekStartDate`/`getWeekDays` are **already Sunday** ✅. The one real bug: **`components/ShiftEditForm.tsx` is Monday-based** → switch to `dateUtils.getWeekStartDate` (else duplicate `schedule_uploads` week rows). Audit `my-schedule`/`MonthlyCalendar` (inherit dateUtils). Optional: update the `parse-schedule` edge-fn prompt's "Thursday–Wednesday" hint (⚠️ committing does NOT redeploy edge fns).
- **Roster view-all:** RLS is already open. `config/quickTools.ts` `todays-roster` `availableTo: 'manager'→'all'`; gate the `+`/tap-edit/save in `app/todays-roster.tsx` + `ShiftEditForm` behind `isManagerOrOwner`; read-only cards for employees.
- **i18n:** `welcome.good_*`, schedule labels, jolt placeholders (en/es parity).
- **Theme polish:** verify high-traffic screens with the new accent semantics — in Moonstone `primary` is near-white, so anything that must stay branded-orange uses **`tint`**. Keep `card` opaque. Re-check contrast in all 4 modes.

---

## Deferred (design-only now; build later)

- **Shift Swap / Release / Request Time Off + manager Shift-Approvals page (3 tabs) + Approved-Day-Off blocks + notifications.** New tables (`time_off_requests`, a unified `shift_requests` with a `kind` enum or separate `shift_releases`/`shift_swaps`, `approved_day_off_blocks`) + **SECURITY DEFINER RPCs** (the one place to enforce manager authority server-side) + notification types (reuse `custom_notifications`/`send-push-notification` — mind the deploy gap). NOTE: the existing `app/manager-approvals.tsx` is **rewards** approvals, unrelated.
- **Onboarding "Appearance" step** (pick theme before "You're all set").
- **Glass rollout to other screens** (after Welcome lands).
- **Optional hardening:** real edit-protection RPCs for roster/schedule (RLS is open app-wide — existing posture, not new debt). Server search RPC (`pg_trgm`) only if datasets grow.

---

## Verification

- `tsc` 0 net-new; en/es i18n parity; build from the **worktree**: `unset APP_VARIANT && APP_VARIANT=public npx expo start -c --go`.
- Device-test **both variants** (MyResto → Moonstone Dark default; Boathouse/mcloones → Ocean Dark default).
- On a real **mid-range Android**: the 7-leaf swipe order, the Menu bridge round-trip, the Today collapse + sticky sub-tabs, Jolt fly-up, and **BlurView performance** (the main perf risk).

## Top risks
1. Collapsing-header choreography (custom Reanimated) — prototype the Today tab in isolation.
2. Schedule-leaf index shift (off-by-one breaks badges/menu-bridge) — extract `PortalHome` first; derive from named constants only.
3. App-wide reskin: `primary` is near-white in Moonstone — move "must-stay-orange" usages to `tint`; keep `card` opaque; BlurView Android perf.
4. `ShiftEditForm` Monday→Sunday (duplicate week rows).
5. No server-side edit enforcement (RLS open) — accept (existing posture) or harden later.
