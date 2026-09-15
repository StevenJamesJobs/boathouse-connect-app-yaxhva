# Profile Hub · People & Admin — build plan (s84)

The durable spec for the s84 wave: the Profile tab rebuilt as a hub, the Settings / Appearance /
forced-password screens, the messaging trio, Subscription, and the Employee Hub retirement. Decided over
three mockup rounds (`profile-settings-redesign.html`, `messages-subscription-redesign.html`,
`profile-hub-redesign-v2.html`, `profile-hub-redesign-v3.html`). Steve's picks are final unless a build
detail forces a change — record any such change in §11.

## 1. Decisions (locked)

**Profile tab (both portals)** — `app/(portal)/{employee,manager}/profile.tsx` → one shared `ProfileHub`.
- Hero = `WelcomeHeader`, byte-identical to Welcome / Manage (no pills, no camera badge). Its avatar tap
  opens the Profile on **My Info** (new `onProfilePress` prop; the default stays "navigate to profile");
  the bottom-nav Profile tab opens on **My Hub**. `?tab=hub|info|settings` param selects a pane.
- Under the hero: a ConnectBar-style capsule **My Hub · My Info · Settings** driving a horizontal
  `FlatList pagingEnabled` pager (Manage grammar, NON-collapsing: capsule inside the header block, plain
  per-pane `ScrollView`, `paddingBottom 150` clears the floating tab bar; the layout owns JoltOverlay +
  the tab bar — the page renders neither). The portal layouts must show `AmbientGlow` on `profile` too.
- **My Hub**: stat strip (3 cells) → Favorites (live mosaic, Mix 2) → "Signed in as @handle · Log out".
  - Employee cells: Bucks → Rewards tab · Game rank → `/game-hub` · Next shift → Welcome Schedule tab.
  - O/M cells: **Team** (azure, "14 staff", chevron-down; tap = drop the Team tile under the strip with a
    pointer notch: eyebrow "N staff · M scheduled today · code XXXX", buttons Employees → Manage page
    Employees pane (`?pane=employees`), Schedules → `/manual-schedule`, Invite → the share sheet) · Game
    rank · Next shift.
  - Favorites: header rule "Favorites · n / 8" + **Edit** chip (hidden while empty). Tiles are the live
    mosaic: wide tiles carry a headline number + two facts + a chip; squares carry one live line; a wide
    tile's `···` opens its options sheet. Whole face navigates. New accounts: the **empty state** (faded
    3-tile sample, "This is your space! Add your own favorites and most-used tiles from the gallery to
    display here.", **Add favorites** button → the editor). Existing `quick_tools` arrays upgrade in place
    to Simple tiles.
- **My Info**: identity card (64pt avatar + camera badge → picker, name, @handle, job-title pills, badge
  title pill, tagline or "Add a tagline") with the pencil top-right → **Your profile** sheet; then Email,
  Phone, Username 🔒, Full name 🔒 rows + hint. No shift card.
- **Settings** pane (Settings B): 2×2 square tiles — Appearance (swatch strip + "Theme · Mode") and
  Language on top navigate (page / prompt sheet); Notifications ("6 of 8 on") and Password below expand
  **in the row**: the tapped tile slides to full width, its neighbour folds to a slim chip above the row,
  and the content opens as the slide ends (one tap, ~350 ms); tapping the chip swaps; tapping the open
  header folds back. Owners get the Subscription row beneath the grid. `app/settings.tsx` is deleted.
- **Your profile sheet**: photo (tap → picker, direct from the open sheet), Username 🔒 / Full name 🔒 mono,
  Email, Phone, Tagline (60, counter), Cancel / Save. Writes `update_profile_info(+p_tagline)` then
  `refreshUser()`.
- **Favorites editor** (GlassSheet, scroll=false): "Your layout" 8-slot strip (filled slots drag to
  reorder; empty slots dashed) → category capsule All · Work · Learn · Play · (Manage) → sample grid drawn
  with each tile's live line; checking adds (cap 8, wide = 2 slots' worth of width but ONE slot); a checked
  sample shows an **Options** chip + a mono shape line ("Wide · 3 of 4 facts" / "Simple tile") → the
  options sheet. Done saves.
- **Tile options sheet**: **Simple tile** switch on top (on = uniform CommandTile, one live line, hides
  Size + Show), live preview, Size (Square | Wide), Show switches (per family), red "Remove from
  favorites", Done.
- **Appearance** (`app/appearance.tsx`): ScreenHeader; Light / Dark / Auto filled capsule; gallery of six
  theme tiles (mini glass render, name, "Revived"/"New" tags) + a wide dashed **Custom** tile ("Pick your
  own accent on any base"; once saved shows the colour + "Custom · #HEX"); honest Preview (greeting in
  tint, badge in blue, card, filled button, tab strip). Custom tile → **Your accent** sheet: preset chip
  rail (seeds hue + base, knob jumps, ticks on the bar), hue slider, neutral base (Graphite · Navy ·
  Espresso), preview, Cancel / Save accent. All on-device (`@app_theme_custom`).
- **Forced password** (`app/change-password.tsx`): AmbientGlow, org line, key disc, "Set a new password",
  two fields with eye toggles, hint, ShineButton, "Not you? · Log out". Same two-field rule.
- **Messages list** (`app/messages.tsx`, L-B): ScreenHeader "Messages" + **Select** chip; filter rail All ·
  Unread (n) · Sent · Files (n) · Groups; grouped rows under weighted separators (Today · Yesterday ·
  Earlier this week · month names; tint eyebrow + count + hairline + 16pt air); rows: avatar or 3-stack +
  "+N", sender line in tint, time, subject, preview; unread = tint ring; NO reply count; swipe → Read /
  Delete; long-press → GlassActionSheet (Mark as read · Reply · Select messages · Delete); selection
  mode (Select chip / long-press) with a bottom bar Mark read · Delete; the near-full inbox = gold meter
  strip; **FAB "+"** bottom-right → compose. **Files** = gallery (photos 3-up with sender + date; files as
  rows with ↓; tap opens, hold → Save / Share / Open the message). **Groups** = threads with >1 other
  participant. **Sent** = `get_sent_messages`.
- **Compose** (`app/compose-message.tsx`, C-B): ScreenHeader "New message"; To chip row (group chips
  "Bartenders · 6 ▾" expand to a collapsible name list where a person can be dropped; person chips;
  "+ Add" → recipients sheet); Subject input; draft area with attachment previews; **pinned composer**
  ("+" → GlassActionSheet Camera · Photo library · File; field grows to 5 lines then scrolls; send arrow
  lights when there is anything to send). Photo 5 MB + file 10 MB together; files O/M-only (unchanged).
  Reply paths: `replyToMessageId` etc. still accepted (from the thread's Reply action); `recipientId` too.
- **Recipients sheet**: search; Quick select chips (All staff · Managers · each job title, with counts;
  multi-select, stay open); people list grouped under the chosen titles ("Bartenders · 6 · all added"),
  then "Everyone else"; a person in two chosen groups appears in both with ONE shared check, the later
  row dimmed "also in X"; footer "Add N recipients".
- **Thread** (`app/message-detail.tsx`, D-A/D-B): ScreenHeader = subject (eyebrow "N people · started by
  X"), right = Delete; participants strip (overlapping avatars, "Nick, Sam, Amy and you", "Replies reach
  everyone") → participants sheet (rows + Message chip → compose with `recipientId`; row tap → mini
  profile); bubbles (theirs glass + 28pt avatar → mini profile; mine tint; file + photo bubbles; date
  divider; mono stamps); **pinned composer** replies to everyone in the thread (`send_message` with
  `p_reply_to_message_id` = root, recipients = participants minus me). Reply / Reply-all buttons retire.
- **Subscription** (`app/subscription-management.tsx`, SUB-B): ScreenHeader; current-plan strip (tier
  pill; trial = azure pill + days-left meter; expired = red); Monthly | Yearly capsule **hidden until
  yearly products exist** (`SHOW_YEARLY = false`); feature matrix (premium rows first, gold checks, faint
  gold wash); two CTAs under the columns reflecting real state; Restore purchases; footer. All copy →
  `subscription` namespace (EN + ES).
- **Employee Hub / Editor**: `app/employee-hub.tsx` + `app/employee-editor.tsx` DELETED. Manage page
  gains a `pane` search param (`goTab(PANES.indexOf(pane))` on focus); its two `/employee-editor` links
  → the Employees pane; quick tool `employee-hub` → `team`. `components/QuickToolsSelector.tsx` and
  `components/WeatherWidget.tsx` (zero importers) deleted. `components/NotificationPreferences.tsx`
  becomes the glass toggle list used inside the Settings pane.
- **Password**: current-password field stays + "Forgot it? A manager can reset it from your employee
  card." hint. `update_password(user_id, new_password, p_actor_id, p_organization_id, p_current_password)`
  after `verify_password`.

## 2. Server (done — live)
`supabase/migrations/20260915120000_s84_profile_tagline.sql`: `users.tagline` (≤60), `update_profile_info`
+ `p_tagline` (5-arg; '' clears, NULL = untouched), `get_user_card` returns `tagline`. types.ts hand-spliced.
`translateServerError`: 'Tagline must be 60 characters or fewer' → `server_errors.s84_tagline_too_long`.
No other server work: `get_inbox` / `get_sent_messages` / `get_message_thread` already return
`recipient_ids`; `get_me` does not return `tagline` — the identity card reads it from `get_user_card`
(own id) and the sheet writes through the RPC (a `get_me` change would be a second migration; skip).

## 3. Favorites model (client)
`users.quick_tools` (jsonb, `update_quick_tools(user_id, tools jsonb)`):
```
v1 (legacy): ["bartender-assistant","guides-training", ...]        → Simple tiles, in order
v2:          { "v": 2, "tiles": [ { "id": "tips", "size": "wide", "simple": false,
                                   "facts": { "weekTotal": true, "avg": true, "verdict": false, "logTonight": true } }, ... ] }
```
`config/favorites.ts` = the catalog: `FAVORITES_CATALOG: FavoriteDef[]` — `{ id, labelKey, iosIcon,
androidIcon, route | onOpen, category: 'work'|'learn'|'play'|'manage', accent: FamilyAccent, availableTo,
requiredJobTitles?, sizes: ('square'|'wide')[], facts?: FactDef[] (key, labelKey, hintKey, default),
data: (ctx) => LiveData }`. `MAX_FAVORITES = 8`. AuthContext keeps parsing `quick_tools` as-is; the hub
normalizes with `parseFavorites(raw)` → `FavoriteTile[]` (v1 arrays map through the OLD ids; renamed ids:
`employee-hub`→`team`, `menus-manager`→`menus`, `weekly-quizzes`→`quizzes`, `game-hub`/`memory-game`…
keep). Unknown ids drop silently.

Catalog (id · category · accent · live line · facts):
- Employees: `tips` (work, emerald; wide: this week total / avg per shift / last verdict / "Log tonight";
  device journal) · `my-schedule` (work, tint; wide: hours this week / next shift / open pick-ups;
  `get_my_shifts` + `useScheduleAttention.availableShifts`) · `pick-up-shifts` (work, tint; "N open") ·
  `messages` (work, tint; "N unread") · `quizzes` (learn, violet; "N waiting", `useUnreadQuizzes`) ·
  `guides-training` (learn, tint; "N new this week", `get_guides`) · `rewards` (play, gold; "$N · N
  pending", `get_me` + `get_my_redemptions pending`) · `game-hub` (play, gold; "Rank #N · best S",
  leaderboard) · `memory-game` / `picture-this` / `word-search` (play, azure; static sub) · `bartender-assistant`
  / `host-assistant` / `kitchen-assistant` (work, assistant hues; static; job-title gated) · `menus` (work,
  tint; "N specials today", `get_menu_items weekly_special`) · `events` (learn, violet; next event) ·
  `todays-roster` (work, azure; AM/PM heads; visible when roster allowed).
- Managers add (category manage): `team` (azure; "N staff") · `approvals` (gold; wide: waiting count +
  the two newest requests; `get_pending_schedule_approval_count` + `get_pending_redemptions`) ·
  `announcements` (tint; "N live · M scheduled") · `schedule-upload` (tint; wide: credits left / last
  scan / renews; `useScheduleQuota`) · `notification-center` (tint; "N sent this week") · `quizzes-editor`
  (violet) · `guides-editor` · `menu-editor` · `game-hub-editor` · `rewards-reviews` (gold; "N new
  reviews · avg") · `org-settings` (owner) · `subscription` (owner; tier).
Data hooks live in `components/profile/useFavoriteData.ts` (one `Promise.allSettled` on Profile focus,
30 s throttle; per-tile selectors). Static sub-lines are acceptable in v1 for tiles whose data would need
a new RPC — mark them `live: false` in the catalog; never fake a number.

## 4. Kit — `components/profile/`
- `profileVisuals.ts` — accents by family (reuse `toolsVisuals` + `ASSISTANT_HUES`), `TEAM_HUE`
  (azure), tile alphas (`TILE_*_ALPHA`), `MAX_FAVORITES`, sizes.
- `ProfileTabs.tsx` — the capsule (ConnectBar geometry: surface card r14, animated primary pill,
  3 equal tabs with icon + label). Props `{ value, onChange }`.
- `StatStrip.tsx` — `StatCell { big, small?, eyebrow, ink?: 'tint'|'gold'|'azure', onPress, expanded?,
  chevron: 'right'|'down' }` ×3 in a grid; `expanded` draws the pointer notch.
- `TeamDrop.tsx` — the azure drop (eyebrow, three buttons) with a measured-height open/close animation
  (JS-driven height like ShiftsFlipCard). Props `{ open, staffCount, scheduledToday, joinCode,
  onEmployees, onSchedules, onInvite }`.
- `InviteSheet.tsx` — GlassSheet: code block, Copy / Share, default password, hint (reuses
  ManageEmployeesPane's share code + `manager_manage.emp_*` keys).
- `LiveTile.tsx` — the mosaic tile: `{ def, tile, data, width, onPress, onOptions }`; square = CommandTile
  face (icon, title, live line, badge/pulse, chevron); wide = head (icon + eyebrow + `···`) + body (bigv +
  small, kv column, chip). Pulse via AttentionRing in the family accent.
- `FavoritesGrid.tsx` — 2-col layout with wide rows; `FavoritesEmpty.tsx` — the invitation card.
- `FavoritesEditorSheet.tsx` — slots strip (DraggableFlatList horizontal inside a sized
  GestureHandlerRootView, `activationDistance 10`), category SegControl, samples grid (`SampleTile`),
  Options chip → `TileOptionsSheet` (nested; handoff), Done.
- `TileOptionsSheet.tsx` — Simple switch, preview (`LiveTile` with sample data), Size seg, facts
  SwitchRows, remove, Done.
- `IdentityCard.tsx` (My Info) + `ProfileSheet.tsx` (Your profile: FormKit fields, tagline counter, photo
  picker inside the sheet).
- `SettingsGrid.tsx` — the 2×2 with the Settings-B motion: bottom row = `Animated` flex + width; the
  neighbour chip animates max-height; content opens with a delayed timing. Children: `AppearanceTile`,
  `LanguageTile`, `NotificationsPanel` (the restyled `NotificationPreferences`), `PasswordPanel`.
- `LanguageSheet.tsx` — GlassSheet with two check rows (English / Español).
- `hooks: useProfileStats.ts` (bucks, rank/score, next shift, staff/scheduled counts),
  `useFavorites.ts` (parse / save / reorder), `useFavoriteData.ts`.
- Messaging kit — `components/messages/`: `messageVisuals.ts`, `AvatarStack.tsx`, `MessageRow.tsx`
  (+ swipe), `DateSeparator.tsx`, `FilterRail.tsx`, `Composer.tsx` (pinned, growing, "+" and send),
  `RecipientChips.tsx` + `RecipientsSheet.tsx`, `ParticipantsStrip.tsx` + `ParticipantsSheet.tsx`,
  `Bubble.tsx`, `FilesGallery.tsx`, `useThreadParticipants.ts` (directory hydration).
- Appearance kit — `components/appearance/`: `ThemeTile.tsx`, `ThemePreview.tsx`, `AccentEditorSheet.tsx`,
  `HueSlider.tsx` (PanResponder track, knob, preset ticks).

## 5. Screens
| screen | action |
|---|---|
| `app/(portal)/employee/profile.tsx`, `manager/profile.tsx` | render `<ProfileHub />` (+ `import WelcomeHeader` marker for the tracker) |
| `app/settings.tsx` | DELETE (callers → `/(portal)/<role>/profile?tab=settings`) |
| `app/appearance.tsx` | rewrite (AP1 + AP2) |
| `app/change-password.tsx` | rewrite (glass) |
| `app/employee-hub.tsx`, `app/employee-editor.tsx` | DELETE |
| `app/(portal)/manager/manage.tsx` | `pane` param; two `/employee-editor` links → `goTab(2)` |
| `config/quickTools.ts` | → `config/favorites.ts` (catalog); old file deleted |
| `components/QuickToolsSelector.tsx`, `components/WeatherWidget.tsx` | DELETE |
| `components/NotificationPreferences.tsx` | glass rows (SwitchRow), no card, used by the Settings pane |
| `components/WelcomeHeader.tsx` | `onProfilePress?` prop |
| `components/MessageBadge.tsx` | unchanged (live in 6 places) |
| `app/messages.tsx`, `app/compose-message.tsx`, `app/message-detail.tsx` | rewrite |
| `app/subscription-management.tsx` | rewrite |
| `app/(portal)/{employee,manager}/_layout.tsx` | AmbientGlow on `profile` too |
| `contexts/MiniProfileContext.tsx` | show `tagline` under the titles |

## 6. i18n
New namespaces: `profile_hub` (tabs, stat cells, team, favorites, empty state, editor, options, settings
tiles, password panel, language sheet, footer), `favorites` (tile labels + fact labels), `appearance`
(extend: theme names, custom editor), `messages` / `compose` / `message_detail` (extend + the 3 missing
compose keys), `subscription` (whole page), `change_password_screen` (extend). Retire the 13 dead keys
listed in memory. EN + ES pairwise, harvester both directions 0 / 0 at the end.

## 7. Deletions & repoints checklist
`/settings` → profile?tab=settings (2 callers) · `/employee-hub` (profile quick action + catalog) ·
`/employee-editor` (manage ×2) · `QuickToolsSelector` (profile ×2) · `WeatherWidget` (none) ·
`getDefaultQuickTools` / `QUICK_TOOLS_CATALOG` (profile ×2, BottomNavBar? — grep) · tracker: profile
screens keep a `WelcomeHeader` import.

## 8. Smoke (sim, throwaways on MyResto Test)
Login as a throwaway employee → Profile lands on My Hub (empty state) → Add favorites → editor (check
Tips wide, Quizzes, Guides) → Done → tiles render with live lines → `···` on Tips → Simple on/off, size,
facts → reorder in the editor → My Info → pencil → tagline saved (get_user_card shows it in the mini
profile) → photo change from the sheet → Settings pane: Notifications grow-in-row + toggle persists;
Password grow-in-row + wrong current password → translated error; Language sheet → Español (full
reload) → Appearance: pick Ember, Auto mode, Custom → Emerald seed → slide → Save → app re-tints →
hero avatar tap → My Info. Manager throwaway: Team cell → drop → Employees → Manage Employees pane;
Invite sheet; Approvals wide tile pulses with a pending request. Messages: list filters (Files gallery
with a photo + file), swipe Read/Delete, long-press sheet, select mode; compose with two group chips +
one person, photo + file, send; thread → inline reply reaches everyone; participants sheet → Message →
compose prefilled; delete. Subscription: Belmont (trial) matrix + CTAs; MyResto (premium) "Current plan".
Forced password: throwaway with `force_password_change` → glass screen → set → portal.
Cleanup: `custom_notifications` sent rows → `delete_employee`. Boathouse untouched check.

## 9. Agent split (after the kit exists; every prompt carries NO-GIT; grep-verify)
A `messages.tsx` · B `compose-message.tsx` + `RecipientsSheet` · C `message-detail.tsx` + participants ·
D `subscription-management.tsx` + `change-password.tsx` · E `appearance.tsx` + appearance kit. The
coordinator builds `components/profile/*`, `ProfileHub`, `config/favorites.ts`, the layouts/repoints,
and merges i18n.

## 10. Gates
tsc TRUE 0 · harvester (namespace-aware) forward 0 / orphans 0 in the wave namespaces · parity EN = ES ·
tracker regen shows the family Glass · Boathouse counts unchanged.

## 11. Build-time changes to the decisions
- **Visibility gates apply in the editor too.** Tips and the three role assistants are org tool-visibility
  keys (`useToolVisibility.canSee`: `check_outs` / `bartender` / `host` / `kitchen`), the same gate the Tools
  page uses; a gated tile never shows in the editor either, and gated tiles wait for the visibility load
  (no flash). The Favorites counter counts the tiles actually shown.
- **Route verbs are `hub/…`, not `hub:…`** — the harvester reads `ns:key` literals as i18n keys.
- **Settings B motion, as built:** the two bottom tiles JS-animate `flex` + `maxWidth` + horizontal padding
  + border width (the folded tile really reaches 0), the folded neighbour's chip animates max-height +
  opacity above the row, the content rides the native driver (opacity + 6pt drop) with a 200 ms delay.
  The Notifications summary ("N of M on") comes from a hidden pre-mount of the list, reported through a
  ref (an inline callback re-fired the effect every render — the update-depth loop found in the smoke).
- **Stat strip copy:** the empty next-shift small text is "none" (the 3-cell width truncates longer).
- **Game rank score** comes from `useProfileStats` (the leaderboard row), merged over the favorites data.
- **Subscription:** the context exposes no renewal date, so paid tiers read "$15 / month · renews
  monthly" instead of a date (agent S).
- **Composer auto-grows natively.** The pinned composer's input had a fixed `height` fed from
  `onContentSizeChange`, which on RN 0.86 left it stuck at one line (extra lines clipped). It now sets
  `minHeight`/`maxHeight` and lets iOS size the multiline input; the content-size callback only drives the
  corner radius and the scroll-inside switch. The enabled send button also gets its 21pt radius (it rendered
  as an orange square once it lit).

## 12. Sim smoke log (iPhone 17, Expo Go, MyResto Test throwaways)
Employee (`s84emp`): hub empty state → editor pick/save (v2 JSON in `quick_tools`) → live tiles → tagline save
(DB confirmed) → My Info → Settings B both directions → Language sheet → Appearance gallery, Ember, Custom
accent editor (hue drag, save, Custom tile) → Moonstone restored → Password panel submit (verify + update RPC
flow, success alert, panel folds back) → Español switch (instant, every pane incl. My Hub) → forced-password
screen (`force_password_change = true` via SQL, glass screen, Update → portal; flag clears).
Manager (`s84mgr`): Team cell drop (16 staff · 3 scheduled today · join code) → Employees → Manage
`?pane=employees` → Schedules → Schedules screen → Invite sheet (code, default password, Share) → editor
Manage category (Team / Approvals / Upload with live lines, Options chip, SQUARE / WIDE · facts labels) →
three tiles saved and rendering live (Approvals 0 requests, Upload credits, Scan).
Messaging: list L-B rail (All / Unread / Sent / Files / Groups with counts) → FAB → compose C-B (To chips:
Chef group chip + person chip, Recipients sheet quick-select + search + "Everyone else" section, Attach sheet →
Photo library → thumbnail in the draft card, composer grows to 4 lines) → send → Sent filter (weighted Today
separator, tint sender) → Files gallery (photo, sender badge, time) → thread D-A (participants strip →
sheet with Message buttons, own bubbles right, inline reply appends with its own time) → long-press sheet
(Reply / Select messages / Delete) → employee inbox (tint ring, Unread 1) → swipe Read / Delete → Read clears
ring + count → Select mode bulk bar (Mark as Read / Delete) → recipient thread view (sender label, avatar,
grouped grey bubbles).
Found and fixed during the smoke: composer stuck at one line + square send button (§11), update-depth loop
on Notifications (§11), folded-tile gutter (§11), Tips gating (§11), "none" / key-column width (§11).
Not smoked in the sim: Subscription compare (owner-only → Steve's round), Camera attach (no sim camera),
Delete confirms (left the thread in place for the device round).

## 13. Steve's device round 1 (2026-09-15) — fixes
- **Frozen Profile after the editor (Sentry "Touch event within element: modal").** The Tile options sheet
  was rendered as a SIBLING Modal of the open editor Modal; iOS never presents a second root modal while one
  is up, and its transparent window outlived the editor and swallowed every touch on the page. Now NESTED
  inside the editor's GlassSheet (presents from the sheet's own VC, tears down with it). Inside that nested
  sheet the native `Switch` renders but never fires — `GlassToggle` (FormKit, JS-drawn pill) replaces it there
  and `SwitchRow native={false}` covers the facts rows. Editor button reads **Save Favorites**.
- **Team drop bottom clipped:** the 8pt gap moved from the card (inside the measured clip) to the clip.
- **My Info / Your profile copy** per Steve; the tagline now shows on the mini profile card (get_user_card
  already returned it — the card never rendered it).
- **Appearance:** six neutral bases — Graphite · Navy · Espresso · **Onyx** (true black) · **Slate** (cool
  mid-grey) · **Ivory** (warm white in BOTH modes; its accents use the light tone via `toneOf`) — in a 3 × 2
  grid with the "watch it change in the preview" hint. Ivory caveat: screens that pick hues by `resolvedMode`
  still use the dark-mode hue tables on the white ground — judge on device, drop the base if it reads wrong.
- **Messages list:** Files is the last chip; a horizontal pan on the list body turns the page (rows keep their
  leftward swipe actions; a rightward drag on a row is released to the pager via `dragOffsetFromLeftEdge`),
  the body slides 22pt + fades on a turn, the rail auto-centres the active chip, the FlatList is re-keyed per
  filter so no open swipe rides across. Swipe actions are two 40pt circles (Read · Delete) centred on the row,
  scaling in with the swipe. Files: the grid measured the padded wrapper (3 thumbs overflowed → 2 + a hole);
  measured on the grid now, plus a Photos / Files toggle once both exist.
- **Thread:** participants strip pinned under the ScreenHeader (outside the scroll); photo bubbles are the
  rounded image on a soft glow (tint shadow for mine), no tinted frame.
- **Compose:** the draft card's eyebrow + hint read 11 / 13.5.
- Retention question (Steve): attachments are never auto-deleted today — a 90-day storage sweep is a server
  cron decision for a later session (carry). The gallery scrolls; nothing is cut off.
- Android Expo Go (159 warnings) — not touched this round; investigate after the wave lands.

## 14. Steve's device round 2 (2026-09-15) — tweaks
- **My Schedule tile → the Welcome Schedule tab** (`hub/schedule-tab`), not the full-schedule page.
- **Team tile** scrolls the hub to the top before opening the drop (a `hubScrollRef` on the hub pane), so the
  expand is seen even when the tile sits at the bottom of a long list.
- **Editor slots:** tap a slot → it grows 10% with a tint ring, the layout row names it and grows a red
  **Remove** chip (the hint switches to "Tap Remove … · hold to move it"); hold still drags. Remove drops it
  from the draft and the row closes up.
- **Editor height + pager:** the sheet holds its 88% cap (`GlassSheet fill`) so switching to a short tab
  (Learn / Play) no longer breathes; the sample grid is one page per category in a paging FlatList — swipe
  or tap the capsule, the two stay in step. Page width is MEASURED (the pager bleeds through the sheet's
  padding but sits inside its hairline border — a screen-width page drifted 2pt per swipe).
- **Accent editor:** a Light · Dark capsule above the preview shows the draft in either mode without saving
  (opens on the mode in force).
- **Messages rows:** a rightward swipe closes an OPEN row (`dragOffsetFromLeftEdge` flips to 10 while open via
  onSwipeableWillOpen / onSwipeableClose); closed rows still hand a rightward drag to the filter pager.
- **Android (diagnosed from `expo_dev2.log`, not fixed — its own session):** the Android bundle fails while
  `app/_layout.tsx`'s imports evaluate — `TurboModuleRegistry.getEnforcing('RNEdgeToEdge') could not be found`
  (react-native-edge-to-edge ^1.7.0 is a direct dependency; the Android Expo Go binary in use has no such
  native module). Every route then logs "missing the required default export" and ContextNavigator throws —
  that is the "159 warnings". The 216 expo-notifications "removed from Expo Go" errors are the known
  Android-Expo-Go limitation (the push-token fetch is already guarded; the module-scope
  `setNotificationHandler` and the listeners are not). First moves next session: confirm the Android device
  runs the SDK 57 Expo Go, `npx expo install --check` / `expo-doctor` on edge-to-edge, then guard the
  notification handler/listeners for Android Expo Go. A one-off "invalid Unicode escape" was an HMR patch
  during a locale edit, not a code problem.

## 15. Steve's device round 3 (2026-09-15) — last tweaks
- **Selected slot ring clipped at the top:** the slot list is a ScrollView and clips to its bounds, so the
  10% grow lost its top edge. First attempt padded the DraggableFlatList's content container — that broke its
  cell measurement (only the first slot drew; the rest were invisible and untappable). Final: the list keeps its
  original props untouched, and the selection grows INSIDE its box — 2pt tint ring, brighter fill, 19pt glyph —
  so nothing overflows the list. Rule: never pad or fix the height of a DraggableFlatList's content container.
- **Message date separators** read bigger: label 12 / count 11.5 (were 9.5 / 9).
- Not sim-smoked (Steve's call) — Expo Go reload on device before "Sync it all".
- Android notes for its own session: the Android device runs Expo Go **57.0.9** (the SDK-57 client; the
  in-app banner only warns that the NEXT store release will be SDK-58-only, so pin auto-updates off). So the
  `RNEdgeToEdge` miss is not a wrong-client problem — first suspect is the `react-native-edge-to-edge` version
  resolved by `^1.7.0` against the one Expo Go 57 bundles. `npx expo install --check` on the worktree lists
  25 patch-level bumps (expo 57.0.21 → ~57.0.23, expo-router, expo-notifications, expo-image-picker…);
  run it on MAIN at the start of the Android session, not inside this wave's PR.
