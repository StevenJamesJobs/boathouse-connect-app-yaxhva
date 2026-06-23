# Manage Page — RN Build Plan (Command Center)

**Status:** Design LOCKED 2026-06-23 (session 35). This is the durable, zero-handoff-loss build spec.
**Visual source of truth:** `design-mockups/manage-redesign-v2.html` (open in Chrome). Build EXACTLY as the mockup — no design changes without Steven.
**Companion memory:** `project_manage_redesign.md` (decisions + rationale).

---

## 0. What we're building (one paragraph)
Replace the Manager/Owner **Manage** tab (currently `app/(portal)/manager/manage.tsx`, 259 lines, 3 solid pill-tabs of plain icon tiles) with a glass **Command Center** on the edge-to-edge ambient base: the real Welcome header on top (locked), a mini Jolt search bar (bolt-only, collapses on scroll), and a **two-tab swipe pager** — **Tab 1 "Today at a glance"** = a 6-tile **flip-card cockpit** + a collapsible **Recent Activity** feed; **Tab 2 "All Tools"** = the grouped editor **directory**. Tiles show live counts and **glow when they need attention** (doubles as a setup guide), calming to neutral once populated.

**Ship Two-Tab only.** (One-Page was a mockup comparison toggle — drop it in RN unless Steven says otherwise.)

---

## 1. Reuse (all already shipped — see Welcome redesign)
- `components/WelcomeHeader.tsx` — the locked header (greeting + avatar + weather chip + mail + notification bell). Reuse VERBATIM (continuity; this rolls onto all nav pages over time).
- `components/GlassCard.tsx` — glass/surface BlurView surfaces (Android `experimentalBlurMethod` fallback).
- `components/AmbientGlow.tsx` — edge-to-edge corner gradients (`colors.glowA/glowB`).
- `components/JoltOverlay.tsx` — the bolt FAB + command palette (mounted in each portal `_layout`). The mini Jolt bar here is a search-affordance row that opens Jolt; see §7 for the bolt-lands-on-nav animation.
- `constants/fonts.ts` — `fonts.display` (Bricolage Grotesque), `fonts.body` (Inter), `fonts.mono` (JetBrains Mono).
- `hooks/useThemeColors` + the 15 glass tokens (`tint, ember, fireText, blue, blueText, glass, glassBorder, surface, surfaceBorder, hairline, navTint, sheen, thumbPlaceholder, glowA, glowB`). **`primary` is near-white on Moonstone → any text/icon on a `primary` fill uses `fireText`** (load-bearing invariant).
- **`components/PortalHome.tsx` = the structural reference** for the collapsing header + horizontal pager + sticky sub-tabs + per-leaf scroll sync (the swipe fix shipped in PR #39). The Manage page is the SAME pattern with 2 leaves instead of 7.
- Layout: `app/(portal)/manager/_layout.tsx` already renders `AmbientGlow` (currently gated to the Welcome tab via `useSegments`) with transparent `Tabs screenOptions.sceneStyle`. **Extend the gate so AmbientGlow + transparent scene also apply on the `manage` tab.**

**v1 target: ZERO new npm deps, ZERO migrations** (all client-side; reanimated + expo-blur + expo-linear-gradient already installed). The only possible DB touch is the Recent Activity feed (§5) — keep it client-side aggregation for v1 (no migration).

---

## 2. Architecture / layout (mirror PortalHome)
```
<View container>                      // GestureHandlerRootView, flex:1, transparent
  <AmbientGlow/>                      // absolute, behind everything (or via _layout)
  <StatusBar spacer/>                 // transparent
  <WelcomeHeader/>                    // LOCKED — outside the scroll/pager
  <View pagerWrap flex:1>
     <Animated horizontal FlatList>   // 2 leaves: 'today', 'tools' — pagingEnabled
        leaf 'today'  → vertical ScrollView: [JoltBar][Seg tabs sticky][cockpit][recent activity]
        leaf 'tools'  → vertical ScrollView: [JoltBar][Seg tabs sticky][directory]
     </FlatList>
     <CollapsingOverlay/>             // OPTION A (preferred): Jolt bar + Seg tabs rendered ONCE,
  </View>                             //   fixed above the pager, collapse via shared scrollY
</View>
```
**Collapsing-header choreography (the #1 risk — prototype first, copy PortalHome):**
- The **Welcome header is locked** (outside the pager, always visible).
- The **Jolt mini-bar collapses** (translates up / clips under the header) as the active leaf scrolls.
- The **Seg tabs ("Today at a glance" / "All Tools") pin** under the header.
- Two ways to build it, both proven in PortalHome:
  - **(A preferred)** Jolt bar + Seg tabs live in a **fixed overlay** above the pager (like `renderSectionHeaderOverlay`); each leaf is cards-only with `paddingTop` = header height; one shared `Animated.Value` per-leaf drives the collapse; sibling-scroll-sync keeps the two leaves aligned. This makes the swipe move ONLY the content (header stays put) — exactly the mockup.
  - **(B simpler)** Jolt bar + Seg tabs inside each leaf with `stickyHeaderIndices` — but this re-introduces the "whole page swipes" feel we just fixed on Welcome. **Use A.**
- Tab tap → `flatListRef.scrollToIndex(animated)`. Swipe → `onMomentumScrollEnd` sets active tab. (Identical to PortalHome's ConnectBar handlers.)

**Per-tab swipe order:** `today (default, initialScrollIndex 0) → tools`. Land on Today.

---

## 3. The cockpit — 6 flip tiles (Tab 1)
2-column grid, fixed tile height (~118 in CSS → measure/RN equivalent). Each tile = a **flip card**: tap → reanimated `rotateY` 180° (front ↔ back); back has action buttons; a small "✕" + tap-front flips back. Buttons `stopPropagation` (they navigate, don't re-flip). Flip-hint glyph = a horizontal **arrow** (`switch-horizontal`-style), top-right, subtle.

**Layout (the swap is baked in — highlighted tiles on the RIGHT):**
| Left column (lighter / neutral) | Right column (`.hl` subtle same-accent highlight) |
|---|---|
| Live Posts | **Scheduled Shifts** |
| Next 7 Days | **Rating** |
| Menu | **Plan** |

**Three visual levels:** lighter (left, populated) < highlighted (right, populated, subtle `tint` tint) < **glowing** (empty/needs-setup — `tint` border + bg + gentle pulse + "SET UP →" cue; overrides `.hl`).

### Tile specs — front data, flip actions (routes), glow condition
1. **Scheduled Shifts** (right, `.hl`, attention-capable)
   - Front: ☀ `{amCount}` AM · 🌙 `{pmCount}` PM + a pill "Your shift · `{start}–{end}`" (or "You're off today" / hide if owner has no shift).
   - Flip → **[Open Roster]** `/todays-roster` · **[Open Schedules]** `/manual-schedule`.
   - Data: today's shifts for the org → count AM (start < 12:00) vs PM (start ≥ 12:00); the viewer's own shift today. Source = the schedule data behind `UpcomingShiftsCard` / `todays-roster`.
   - **Glow when:** no schedule uploaded for the current week (0 AM + 0 PM).
2. **Live Posts** (left, attention-capable)
   - Front: `{annCount}` Announcements · `{featCount}` Special Features.
   - Flip → **[Announcements]** `/announcement-editor` · **[Special Features]** `/special-features-editor`.
   - Data: count active `announcements` + active `special_features` for the org.
   - **Glow when:** area fully empty (annCount 0 AND featCount 0). Calms once ≥1 of EITHER exists (CONFIRMED rule — see §6).
3. **Next 7 Days** (left, attention-capable)
   - Front: `{eventCount}` Events · `{entCount}` Entertainment.
   - Flip → **[View All]** `/view-all-upcoming-events` · **[Events Editor]** `/upcoming-events-editor`.
   - Data: `upcoming_events` with `start_date_time` (or falls-on) within today..+7d, split by `category` ('Event' / 'Entertainment'). Use `eventFallsOnDate`/date utils already in PortalHome.
   - **Glow when:** both 0. Same area rule as Live Posts.
4. **Rating** (right, `.hl`, attention-capable)
   - Front: `{avg}` ★ · `{count}` Google reviews (or "—" / "Connect Google reviews" when not connected).
   - Flip → **[Open Reviews]** Reviews tab of `/rewards-and-reviews-editor` · **[Refresh Reviews]** manual import (the `import-google-reviews` edge fn path; honor the future 10/month cap — see deferred).
   - Data: org rating — average + count from the imported Google reviews (reviews table). **Verify where the aggregate lives**; may need to compute avg client-side or read an org column.
   - **Glow when:** reviews not connected (no `google_maps_query`) or 0 reviews.
5. **Menu** (left, attention-capable)
   - Front: top label `{menuCount} Menus` · big `{itemCount}` items · `{featuredCount} Featured Specials` (org-renamable label).
   - Flip → **[Menu Editor]** `/menu-editor` · **[Menu Config]** Menu tab of `/organization-settings`.
   - Data: `organization.menu_count`; count `menu_items` (active); featured = `is_weekly_special` OR weekly_specials category (reuse `weeklySpecialsNames` + the merge logic already in PortalHome's weekly-specials query).
   - **Glow when:** 0 items → "Set up your menu" (skipped onboarding).
6. **Plan** (right, `.hl`)
   - Front: `{tier}` (Premium/Trial/…) + "`{n}`-day trial left" (or "Renews in `{n}` days" when subscribed).
   - Flip → **[Manage Subscription]** `/subscription-management`.
   - Data: subscription tier + `trial_end_date` / subscription end (the same source `subscription-management` + the paywall use).
   - **Glow (optional):** when trial < ~3 days (urgency). Otherwise calm-highlighted.

**Tile refresh:** load on mount + **refetch on focus** (`useFocusEffect`) so counts are current every time they land on Manage. No manual per-tile refresh control. The arrow glyph is a FLIP hint, not refresh.

---

## 4. All Tools directory (Tab 2)
Grouped glass chips → routes (groups CONFIRMED with Steven). Owner-only items gated by `user?.role === 'owner'`.
- **News Feed:** Announcements `/announcement-editor` · Special Features `/special-features-editor` · Events `/upcoming-events-editor` · Notifications `/notification-center`.
- **Team & Training** (renamed from "Employee"): Assistants `/assistant-editors` (parent → Server/Bar/Host/Kitchen) · Guides & Training `/guides-and-training-editor` · Game Hub `/game-hub-editor` · **Menu Editor `/menu-editor`** (moved here — employee-geared).
- **Management · Owner:** Employees `/employee-editor` · Schedules `/manual-schedule` · Org Settings `/organization-settings` (Owner) · Subscription `/subscription-management` (Owner).
- Each chip shows a live sub-stat (e.g. "3 LIVE · 1 NEW", "14 STAFF", "210 ITEMS") — reuse the same counts from §3 where available.

---

## 5. Recent Activity (Tab 1, collapsed by default)
A curated cross-app feed, **distinct from the notification bell**, collapsed by default (shows "{n} new" + chevron), expands to a glass list.
- **v1 (no migration): client-side aggregation** — query the most-recent N rows from each source, map to a unified `{icon, text, ago, ts}`, merge, sort by ts desc, dedupe, cap (~8). Sources: new Google reviews, `schedule_uploads` (uploaded), quiz/exam completions, `announcements`/`special_features`/`upcoming_events` (created), `menu_items` (added), Game Hub leaderboard passes, new Guides/Handbooks/Flyers uploaded.
- **Dedupe + helpful-only:** no duplicate items; only surface meaningful events (mirror the mockup's examples).
- **Future (deferred):** a proper `activity_log` table (triggers/RPC) when the social features land ("X post liked by 12 employees"). v1 stays client-side.

---

## 6. Dynamic glow logic (the setup-nudge)
- A tile is **attention-capable** (`t-attn`): Scheduled Shifts, Live Posts, Next 7 Days, Rating, Menu (Plan only when trial < ~3d).
- **Glow when its data point needs attention** (empty / not connected); **calm to neutral once populated.**
- **Two-data-point rule (CONFIRMED, gentler):** a tile with two sub-metrics (Live Posts = Announcements+Special Features; Next 7 Days = Events+Entertainment) glows only when its area is **fully empty (0+0)**, and **calms once it has ≥1 item in EITHER** sub-point (1 announcement + 0 features → CALM). The 2nd sub-type is often optional.
- **Glow styling:** themed `tint` (orange Moonstone / blue Ocean), toned-down border + bg + a gentle 3s pulse + a "SET UP →" micro-cue; the header text/icon go `tint`. Specificity: glow overrides the `.hl` highlight.
- **`.hl` highlight (right column, settled):** subtle same-accent `tint` bg+border, no pulse — purely the left/right visual hierarchy. Rating uses `tint` (not blue) for uniformity.

---

## 7. Jolt bolt lands-on-navigation (polish — can defer)
The mini Jolt bar's leading bolt should **animate from the floating nav-corner bolt into the search box** when the owner/manager navigates TO Manage (and fly back on leave). Feasible because `JoltOverlay` is ONE persistent component in the `_layout`: drive its position from the active route (`useSegments`) — translate/scale it from the FAB slot to the **measured** search-box slot when `manage` is active; reverse on leave. Needs the search box to expose its measured target (onLayout → shared store/context). Moderate effort; ship the static bar first, add the hand-off as polish.

---

## 8. Build order (phased)
- **Phase 0 — shell:** new `manage.tsx`; AmbientGlow + transparent scene on the `manage` tab; locked `WelcomeHeader`; Jolt bar (static); Seg tabs; **2-leaf horizontal pager + collapsing header** (copy PortalHome's overlay + sibling-scroll-sync + sticky tabs). Static placeholder content. **Get the swipe + collapse feeling right first.**
- **Phase 1 — cockpit (static):** 6 flip tiles via GlassCard + reanimated rotateY; the swap layout; `.hl` + glow styling; flip backs + buttons. Hardcoded numbers.
- **Phase 2 — directory:** All Tools grouped chips → routes; owner gating.
- **Phase 3 — data layer:** wire every tile + chip to live counts (queries + `useFocusEffect` refresh); implement the dynamic-glow conditions (§6). Confirm the rating + subscription data sources.
- **Phase 4 — Recent Activity:** client-side aggregation feed; collapsed by default.
- **Phase 5 — Jolt nav animation** (polish, optional for v1).
- **Phase 6 — i18n + verify:** EN/ES parity for new strings; `tsc` 0 net-new; device-test BOTH variants (MyResto→Moonstone, Boathouse→Ocean), both Org states (fresh org glows, dialed-in calm), swipe + collapse + flips on device.

---

## 9. Fidelity checklist (so it matches the mockup exactly)
- [ ] Welcome header locked; Jolt bar collapses behind it; Seg tabs pin; content swipes (not the header).
- [ ] Swipe AND tap both switch Today ↔ All Tools; active tab follows the swipe.
- [ ] Flip cards: tap flips, back shows the exact action buttons + routes in §3.
- [ ] Dynamic glow: empty tiles glow with "SET UP →"; Live Posts at 1/0 stays CALM; Menu 0 items → "Set up your menu".
- [ ] Right column (Scheduled Shifts, Rating, Plan) subtle highlight; left column neutral.
- [ ] Toned-down glow; arrow flip glyph; Scheduled Shifts AM/PM sun/moon + "Your shift" line.
- [ ] Recent Activity collapsed by default; All Tools directory grouped per §4 (Menu Editor under Team & Training).
- [ ] Moonstone + Ocean, dark + light all correct via tokens; `fireText`-on-`primary` invariant respected.

---

## 10. Deferred (NOT v1 — captured so they're not lost)
- **10 manual Google-refreshes/month cap** + onboarding copy ("auto-refresh Mon/Thu on Premium; 10 manual/month"). Touches `import-google-reviews` + a counter table/RPC.
- Add the full org **rating to the Reviews tab** of `rewards-and-reviews-editor`.
- Proper **`activity_log`** table for Recent Activity (when social features land).
- Reuse cockpit/elements on the **Tools page**.
- Roll the locked **WelcomeHeader onto all main nav pages**.
