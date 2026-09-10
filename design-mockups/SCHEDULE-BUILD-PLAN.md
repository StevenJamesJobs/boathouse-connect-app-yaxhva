# Schedule Wave — RN Build Plan (s83 → s84)

**Status:** DRAFT 2026-09-09 (session 83). Steve's notes override everything here; mockup picks get recorded in §11.
**Visual source of truth (new surfaces):** `design-mockups/schedule-shift-tools-redesign.html`.
**Pages that need NO mockup (Steve):** manual-schedule · schedule-upload · schedule-review · todays-roster · my-schedule — they get the ScreenHeader + AGGD treatment with the tweaks in §4.
**Companion memory:** `boathouse-session-state` (state) · `boathouse-design-rulebook` (kit rules).

---

## 0. What we're building (one paragraph)

Bring the five **Schedule tracker pages** onto the ambient-glow/glass design (ScreenHeader + AmbientGlow + GlassCard/GlassSheet), condense their chrome into one **Schedule ⚙ chip** (Roster · Schedules · Upload Schedule · Approvals · Schedule Settings), rebuild **schedule-upload** as a two-tab page (Upload | Recent Uploads) with a staged **Scan** step and the rotating AI quips, and ship the **Shift Tools**: employees **Request Time Off** and **Release Shift** from the Welcome Schedule tab, eligible coworkers **Pick Up** released shifts, and owners/managers decide everything on a new **Approvals** page (Time Off | Shift Pick Up | History) with push + shade + badge + glow + a dismissible decision blurb. Org toggles (Roster view · Time off · Release shifts · AM/PM cutoff) move out of Org Settings → Access into a **Schedule Settings** sheet.

**Two sessions:** s83 = server + shared kit + the five pages + the ⚙ chip family. s84 = Shift Tools (Welcome tab, sheets, Approvals page, notifications), org-settings removal, device smoke, tracker regen, Sync. If s83 runs long, the split point is the end of §4.

---

## 1. Reuse (all shipped)

| Piece | Path | Use here |
|---|---|---|
| ScreenHeader | `components/ScreenHeader.tsx` | every pushed schedule page; `right` = ⚙ chip (+ Save on review → `rightWide`) |
| AmbientGlow | `components/AmbientGlow.tsx` | FIRST child of every schedule root view |
| GlassCard / GlassSheet / GlassActionSheet | `components/Glass*.tsx` | cards, every modal (no more RN `Modal pageSheet`) |
| `useSheetHandoff` | `components/GlassSheet.tsx:38` | every navigating sheet row |
| MenuSheet nested-modal pattern | `components/MenuSheet.tsx:65-100` | ScheduleNavSheet → ScheduleUploadSheet handoff (`closeBothThen`, 450 ms floor) |
| MenuUploadSheet | `components/MenuUploadSheet.tsx` | source rows (file / library / camera) + View History row — clone for schedules |
| ScanQuip | `components/MenuScanQuips.tsx` | add `quips?: string[]` prop (fix the hardcoded `22` → `quips.length`) |
| Recent-uploads seg + card | `app/menu-upload.tsx:513-523, 611-656` | the tinted-glass seg (`primary+'2E'` active) + history card |
| FormKit / DateTimeField / ChipRow | `components/content/FormKit.tsx`, `components/content/DateTimeField.tsx`, `components/tips/TipsBits.tsx:32` | ShiftEditSheet, TimeOffSheet, filters |
| MenuSearchRow | `components/MenuSearchRow.tsx` | manual-schedule search + filter badge |
| CommandTile + AttentionRing | `components/tools/CommandTile.tsx`, `components/tools/ToolsBits.tsx:26` | Shift Tools tiles + pulse |
| WeeklyCalendarStrip | `components/WeeklyCalendarStrip.tsx` | roster (unchanged geometry) |
| PremiumGate | `components/PremiumGate.tsx` | schedule-upload / review base-tier gate (unchanged) |
| bothLanguages / sendNotification | `utils/notificationHelpers.ts` | every push (EN+ES pair) |
| Redemption round-trip | `app/redeem.tsx:305-342`, `app/manager-approvals.tsx:166-211` | the request → decision grammar to clone |
| ConnectBar `badges.schedule` | `components/ConnectBar.tsx:57-62` | already rendered, never passed — wire it |
| useSubscription / useManagerPermissions | `contexts/SubscriptionContext.tsx`, `hooks/useManagerPermissions.ts` | `hasPremium` lock on Uploads; `perms.access` for Schedule Settings |
| `_may_configure_access` | server | the Schedule Settings field group (same group the roster toggle already used) |

**New deps: ZERO.** Migrations: ONE additive migration (§2) + one edge-fn redeploy (parse-schedule).

---

## 2. Server (one migration: `supabase/migrations/20260909120000_s83_schedule_wave.sql`)

House discipline on every RPC: `SECURITY DEFINER` · `SET search_path = public, extensions, pg_temp` · actor-gate · org DERIVED from the actor · explicit grants (`REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated`) · RAISE strings wired into `utils/serverErrors.ts` (`server_errors` ns, EN byte-equal). New tables: RLS ON, zero policies (deny-all by design). `#variable_conflict use_column` on RETURNS TABLE fns that reference same-named columns. Never regenerate `types.ts` — hand-splice.

### 2.1 Columns (additive)
```
organizations.time_off_requests_enabled  boolean NOT NULL DEFAULT true
organizations.shift_release_enabled      boolean NOT NULL DEFAULT true
organizations.roster_pm_cutoff           time    NOT NULL DEFAULT '12:00'   -- Steve: YES, noon default
schedule_uploads.title                   text
schedule_uploads.reviewed_at             timestamptz
schedule_uploads.source_type             text CHECK (source_type IN ('pdf','image'))   -- card meta
schedule_uploads.page_count              integer NOT NULL DEFAULT 1
schedule_uploads.credits_charged         integer NOT NULL DEFAULT 0
schedule_uploads.was_free                boolean NOT NULL DEFAULT false
notification_preferences.shift_releases_enabled  boolean NOT NULL DEFAULT true          -- Steve: the new Profile toggle
notification_logs.notification_type CHECK widened: + 'schedule', + 'shift_release'
```

### 2.1b Schedule scan credits (Steve: "a scan is a scan")
Mirror of the menu meter, **its own pool** (weekly schedules would drain the 10/mo menu pool alone):
```
organization_schedule_upload_credits
  organization_id uuid PK → organizations CASCADE
  monthly_allowance integer NOT NULL DEFAULT 15      -- 5 PDF scans / month; tunable per org later
  period_used integer NOT NULL DEFAULT 0
  free_schedule_upload_used boolean NOT NULL DEFAULT false
  period_start timestamptz NOT NULL DEFAULT now() · updated_at
```
- Costs = menu costs: **PDF 3 · image 1 per page**. First scan free. Period rolls monthly on read (the menu pattern).
- `_may_upload_schedule(p_org, p_actor)` = owner OR manager holding **`premium.ai_schedule_upload`** (the key already in `set_manager_permission`'s whitelist — goes LIVE this wave).
- `get_schedule_upload_quota(p_actor_id)` → `{free_available, credits_remaining, monthly_allowance, costs}` (actor-derived org).
- `consume_schedule_upload_credits(p_actor_id, p_source_type, p_page_count)` → `{ok, charged, free_used, credits_remaining}` | `{ok:false, reason: owner_only | insufficient_credits}`.
- Charged by **parse-schedule after a successful parse** (parse-menu:246 pattern; a failed scan never charges; **deleting an upload never refunds** — the Recent-uploads delete copy says so). Stored on the upload row for the card meta line ("3 credits" / "Free").
- Broker: `schedule_upload_file` gains `grantKey: 'premium.ai_schedule_upload'`; parse-schedule checks the grant like parse-menu:340-356.
- Client: `useManagerPermissions` gains `aiScheduleUpload`; Org Settings → Jobs & Tools → Manager Permissions row flips `live: true` (⭐ premium, credits footnote). Ungranted managers see the Uploads chip / nav row / upload sheet **LOCKED** ("Ask the owner"); base tier sees the premium lock.

### 2.2 Tables
```
time_off_requests
  id uuid PK · organization_id → organizations CASCADE · user_id → users CASCADE
  start_date date NOT NULL · end_date date NOT NULL CHECK (end_date >= start_date)
  reason text · status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','cancelled','expired'))
  decided_by → users SET NULL · decided_at timestamptz · decision_reason text
  seen_at timestamptz            -- requester acknowledged the decision
  created_at timestamptz DEFAULT now()
  INDEX (organization_id, status) · INDEX (user_id)

shift_releases
  id uuid PK · organization_id CASCADE · shift_id → staff_schedules CASCADE · released_by → users CASCADE
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','claimed','approved','denied','cancelled','expired'))
  claimed_by → users SET NULL · claimed_at timestamptz
  decided_by → users SET NULL · decided_at timestamptz · decision_reason text
  releaser_seen_at timestamptz · claimer_seen_at timestamptz
  created_at timestamptz DEFAULT now()
  UNIQUE INDEX shift_releases_live_uq ON (shift_id) WHERE status IN ('open','claimed')   -- one live release per shift
  INDEX (organization_id, status)
```

### 2.3 RPCs (new unless marked)
| RPC | Who | Contract |
|---|---|---|
| `get_schedule_settings(p_actor_id)` | any member | `TABLE(staff_can_view_roster, time_off_requests_enabled, shift_release_enabled, roster_pm_cutoff)` |
| `update_organization_settings(… + p_time_off_requests_enabled, p_shift_release_enabled, p_roster_pm_cutoff)` | **REPLACE** (same existing params + 3 new with DEFAULT NULL) | the three join the `access` field group (`v_wants_access`) |
| `create_schedule_upload(… + p_title text DEFAULT NULL)` | **REPLACE** | stores title |
| `get_org_uploads` | **DROP + CREATE** (RETURNS TABLE gains `title, reviewed_at`; args unchanged → build 16 keeps working) | **§9 Q4 — Steve's word before applying** |
| `mark_schedule_upload_reviewed(p_actor_id, p_upload_id)` | manager | sets `reviewed_at = now()` (idempotent) |
| `request_time_off(p_actor_id, p_start_date, p_end_date, p_reason)` | any active member | org toggle ON · dates ≥ today · no overlapping pending/approved row for the user → uuid |
| `cancel_time_off_request(p_actor_id, p_request_id)` | requester | pending only |
| `get_my_time_off_requests(p_actor_id, p_limit DEFAULT 20)` | self | for "My requests" state |
| `decide_time_off_request(p_actor_id, p_request_id, p_approve, p_reason)` | manager/owner **≠ requester** | pending only · writes decided_* · deletes the managers' `time_off_requested` shade row for this id · returns `(user_id, start_date, end_date)` for the push |
| `release_shift(p_actor_id, p_shift_id)` | shift owner | org toggle ON · `shift_date ≥ today` · no live release → uuid |
| `cancel_shift_release(p_actor_id, p_release_id)` | releaser | open only |
| `get_my_shift_releases(p_actor_id)` | self | live + recently decided rows (state pills on my-schedule) |
| `get_available_shifts(p_actor_id)` | any member | `open` rows whose `lower(roles) ∩ lower(my job_titles)` ≠ ∅, not my own, `shift_date ≥ today` **+ rows I claimed** (`claimed_by_me`) — with releaser name/avatar + shift fields |
| `claim_shift(p_actor_id, p_release_id)` | eligible member | open only · title check server-side · ≠ releaser → `claimed` · returns releaser + shift summary for the push |
| `decide_shift_pickup(p_actor_id, p_release_id, p_approve, p_reason)` | manager/owner **≠ releaser, ≠ claimer** | claimed only · approve → `UPDATE staff_schedules SET user_id = claimed_by, employee_name = claimer.name` + `approved`; deny → row `denied` **and a fresh `open` row is inserted** so the shift stays available · deletes the managers' request shade row · returns both user ids + shift summary |
| `get_schedule_approvals(p_actor_id)` | manager/owner | unified pending list: `kind ('time_off'|'pickup')`, ids, names, avatars, dates/times/roles, `conflict_count` (shifts the requester holds inside the requested range), `is_own` (actor is requester/releaser/claimer → decide buttons disabled) |
| `get_schedule_approval_history(p_actor_id, p_limit DEFAULT 10, p_offset DEFAULT 0)` | manager/owner | decided rows of both kinds, newest first, **capped at 50**; runs `_sweep_schedule_requests(org)` first |
| `_sweep_schedule_requests(p_org)` | internal (EXECUTE revoked) | `DELETE` decided rows older than 30 days (WHERE-clause delete — safe-update OK) · pending time-off past `end_date` → `expired` · open/claimed releases past `shift_date` → `expired` |
| `get_pending_schedule_approval_count(p_actor_id)` | manager/owner (0 otherwise) | badge |
| `get_my_schedule_decisions(p_actor_id)` | self | unseen decisions where I'm requester / releaser / claimer → blurb rows |
| `ack_schedule_decisions(p_actor_id)` | self | sets the `*_seen_at` for me + deletes my `*_decision` shade rows → clears blurb/badge/glow/shade/home badge in one call |
| `get_my_notifications` / `get_unread_notification_count` | **REPLACE** | add to the CASE: `time_off_requested`, `shift_pickup_requested` → managers/owners; `time_off_decision`, `shift_pickup_decision` → `targetUserId = actor`. **Unread count: NOT added** (schedule rows own their own badges, like redemptions) |
| `create_notification` | **REPLACE** | widen the employee carve-out: own `time_off_requested` / `shift_pickup_requested` rows (`requesterId = actor`) |
| `get_user_badge_totals` | **REPLACE** | + pending schedule approvals (managers) + unseen decisions (everyone) so the APNs badge matches BadgeSyncer |

### 2.4 Edge fn `parse-schedule` (repo canonical → deploy)
- Body gains `week_start_hint?`, `week_end_hint?`, `title?`, `source_type`, `page_count`.
- Prompt addition when hints are present: *"The manager states this schedule covers {start} to {end}. Use that range when the document does not clearly print its own dates; if the document clearly shows different dates, trust the document."*
- **Prompt generalised (Steve: "not just R365").** Today's prompt opens with "You are parsing a Restaurant 365 (R365) Weekly Schedule PDF" and hardcodes Boathouse's role list + R365 colour coding. Rewrite as format-agnostic: (1) describe the three common layouts — employee-rows × day-columns grid (R365, HotSchedules, 7shifts, Excel prints), day-sections listing people, role-sections listing people; (2) name the shift-cell conventions to look for — time ranges in any format, role labels, opener/closer marks (🌙, CL, OP, "close", "open"), training, room/section labels; (3) keep the R365 colour hints as *"if the cells are colour-coded, colours usually mean…"*; (4) **ALLOWED ROLES = the org's own `job_titles` list** (fetched in the fn; the generic list only as fallback) so MyResto orgs get their real titles instead of Boathouse's; (5) the known-employee matching stays; (6) explicit rule: when a day has no header date, derive dates from the week range (hint or printed). This plus the best-results copy (§7.2) is what makes "organised and labelled" formats parse.
- After a successful parse: `consume_schedule_upload_credits` (free-first bypass), write `credits_charged / was_free` on the row. Insufficient credits → the upload fails with the server string (translated in serverErrors).
- Everything else unchanged (replace-same-week logic, batches, status writes).

---

## 3. The Schedule kit (new, `components/schedule/`)

| Component | Notes |
|---|---|
| `scheduleVisuals.ts` | family accent = **THEME TINT** (house family, like Guides/Content). Status hues: pending `#F59E0B`/`#B45309`, approved `#10A56F`/`#087A52`, denied `#EF4444`, expired/cancelled = muted. AM `#FF9800`, PM `#7C4DFF` stay (roster). Pulse = tint. Never re-literal elsewhere. |
| `ScheduleGearChip` | the 38pt glass ⚙ chip (`gearshape.fill`/`settings` @15 + "Schedule") — the menu chip's geometry, extracted once for this family |
| `ScheduleNavSheet` | GlassSheet, rows like MenuSheet: **Roster** · **Schedules** · **Upload Schedule** (opens `ScheduleUploadSheet` NESTED, `closeBothThen`) · **Approvals** (mono count bubble) · **Schedule Settings** (opens `ScheduleSettingsSheet` nested). Current page = row dimmed + "You're here" mono sub. Role-aware: employees get My Schedule · Roster only (when the roster toggle allows). Uploads row locked (padlock) on base tier; Settings row locked for managers without `org_settings.access`. All navigation via `defer` + `router.push`. |
| `ScheduleUploadSheet` | MenuUploadSheet clone: **Upload File · Upload Image · Take Photo** rows + dashed **View History** → `/schedule-upload?tab=recent`. Picks stage the asset(s) and push `/schedule-upload` with `{ staged: 'file'|'images'|'camera' }` — the PAGE owns the pipeline (one upload path). |
| `ScheduleSettingsSheet` | SwitchRows: **Staff can view roster** (on) · **Request time off** (on) · **Release shifts** (on) · **AM/PM cutoff** (SelectRow → nested time wheel; default 12:00 PM). Writes through `update_organization_settings` (access group). Managers without the grant: rows LOCKED, "Ask the owner" sub. |
| `ShiftEditSheet` | GlassSheet replacing `ShiftEditForm` everywhere: Employee (SelectRow → `EmployeePickerSheet` nested) · Role (ChipRow from `get_org_job_titles`, falling back to the shift's stored roles) · Date (DateTimeField, date only) · Start / End (DateTimeField time) · Tags ChipRow Opener / Closer / Training (opener↔closer exclusive) · **Section / Room** (GlassTextInput, optional — `room_assignment` finally gets a control) · Delete ONLY in the ⋯ red row. Add-mode defaults 4:30 PM → 10:00 PM. Full i18n (`shift_edit.*`). |
| `EmployeePickerSheet` | GlassSheet + MenuSearchRow + list (avatar · name · job title), "Unassign" row where allowed, "Already assigned to X" warning line |
| `ScheduleSegTabs` | the tinted-glass seg extracted (Upload / Recent · Matched / Unmatched · Time Off / Pick Up / History) |
| `ShiftRow` | one shift line: mono time · role pill · O/C/T flags · room — used by manual-schedule, review, roster, my-schedule, Available Shifts |
| `AvailableShiftCard` | releaser avatar + name · shift line · **Pick Up** primary chip / "Awaiting approval" pending pill (claimed by me) |
| `DecisionBlurb` | dismissible glass notice on the Schedule tab: "Your time off for Sat, Sep 20 was approved." + quoted reason; ✕ → `ack_schedule_decisions` |
| `TimeOffSheet` | GlassSheet: mini month calendar (single tap = one day, second tap = range end) · Reason (multiline) · **Review** step in the same sheet: "You're requesting off **Sat, Sep 20**" + quoted reason + **Submit to Manager** |
| `ReleaseShiftSheet` | GlassSheet listing my upcoming shifts (ShiftRow + **Release** chip); released → "Released · open" pill + **Cancel**; claimed → "Awaiting approval" |
| `ApprovalCard` | requester avatar + name · kind pill · what/when · quoted reason · conflict line ("Scheduled Sat 4:30–10 PM") · **Approve / Deny** → `DecisionSheet` (optional reason) · own request → buttons disabled + "Another manager must decide" |
| `useScheduleSettings` | polls `get_schedule_settings` on focus (fail-open like wineVisibility; toggles gate SURFACES, the server enforces) |
| `useScheduleAttention` | managers: pending count; everyone: unseen decisions count; 30 s poll + AppState + module listener (`refreshAllScheduleAttention`) — feeds ConnectBar dot/glow, Approvals tile pulse, BadgeSyncer |

---

## 4. Page by page (the tracker five)

### 4.1 `app/manual-schedule.tsx` — "Schedules" (O/M)
- Root: `AmbientGlow` + `ScreenHeader title="Schedules" right={<ScheduleGearChip/>}`.
- Chip row under the header: **Uploads** (lock on base tier → `/schedule-upload`) · **Approvals** (count bubble → `/schedule-approvals`). The three old pills are gone.
- Week nav bar: same behaviour, glass restyle (‹ › 38pt glass chips, display week label, mono stat line).
- **MenuSearchRow** above the employee list (search by name) with the **Filter** slot → `JobTitleFilterSheet` (ChipRow of org job titles, multi-select, persists until cleared; badge count on the filter button). Filter + search compose.
- Employee cards → GlassCard surface rows (collapse header: avatar · name · job pill · "N shifts" · ＋); shift rows = `ShiftRow` + pencil/✕.
- A-Z rail stays (36pt, glass), skips letters with no employees under the current filter.
- ⋯ menus = GlassActionSheet; delete confirm stays an Alert (2 buttons).
- i18n pass on every hardcoded string (`manual_schedule.*`).

### 4.2 `app/schedule-upload.tsx` — "Upload Schedule"
- Header right = ⚙ chip. `?tab=recent` deep-link (from the sheet's View History).
- **Seg tabs: Upload | Recent Uploads (N)**.
- Upload tab: **credits strip** (menu grammar: "7 of 15 credits left · PDF = 3 · photo = 1", free-first line) → **"For best results" fold ABOVE the tiles, closed by default** (Steve, round 1; copy in §7.2) → three tiles **Upload File · Upload Image · Take Photo** (tinted glass; lock on base tier / ungranted manager) → after a pick, the **Staging card**: file/photo thumbs, **Title** (optional, prefilled with the file name), **Week range** (optional; DateTimeField date × 2, "Set the week when the schedule doesn't print its dates"), **Scan** ShineButton + Discard. Only Scan calls `create_schedule_upload` + broker upload + `parse-schedule`.
- **Processing card**: spinner + `ScanQuip quips={SCHEDULE_QUIPS}` (§7.1) + "Usually under a minute"; 3 s poll with the error/5-empty bail from MenuUploadSheet.
- **Ready-to-review cards** (completed, `reviewed_at IS NULL`): title · week range · mono stamp · **Shifts N** · **Matched N** · **Unmatched N** (the unmatched number is a pressable expander → the names list) · **Review & Edit Shifts** bar (chevron) → `/schedule-review?upload_id=`.
- Recent Uploads tab: every non-processing upload, newest first (title/file name · week · status meta line in family colours · shift counts) · chevron → review · trash (Alert: "Removes this upload **and every shift it added**." — cascade is real) → `delete_schedule_upload` + broker delete of `file_url` in `schedules`. A reviewed upload lands here automatically.
- `__DEV__` "Simulate scan" toggle (menu precedent) so the quip rotor can be smoked without a real parse.
- PremiumGate full-screen stays on base tier (copy unchanged). Multi-image page uploads stay.

### 4.3 `app/schedule-review.tsx` — "Review Schedule"
- Header: `rightWide` → [⚙ chip][**Save** labelled chip]. Save = `mark_schedule_upload_reviewed` → `router.replace('/manual-schedule')`.
- Summary card: week range title + stat bar → **Seg: Matched (N) | Unmatched (N)** — Matched default; the two lists replace the "unmatched first" mega-list. "＋ Add employee" moves into the list header row (right slot).
- Cards → GlassCard rows: avatar/initials · name · Matched→name / **Not matched** pill · shift count · **Assign / Change** chip; expanded `ShiftRow`s with pencil/✕.
- Sheets: assign picker → `EmployeePickerSheet`; add/edit → `ShiftEditSheet`; add-employee → `EmployeePickerSheet` (mode add).
- The hand-pinned `savingOverlay` (top: 96) → a GameToast-style pill under the header.
- Dead `sectionPositions` scaffolding removed; A-Z rail keeps `initialLetter()` accent folding.

### 4.4 `app/todays-roster.tsx` — "Roster"
- Root: `AmbientGlow` + `ScreenHeader title="Roster" right={<ScheduleGearChip/>}` (chip role-aware). PortalTabBarStatic stays.
- Strip unchanged (WeeklyCalendarStrip, its own 8pt inset). Date + stats line glassed (Total · AM · PM).
- **AM/PM pills stay** but now REFLECT the pager: pages are **half-days** (`days × 2`; index = `dayIdx*2 + (PM?1:0)`), so a swipe goes AM → PM → next day AM → PM…; the pills jump within the day; strip tap lands on that day's AM. Prefetch by day (`[d-1, d, d+1]`).
- AM/PM split reads `roster_pm_cutoff` from `useScheduleSettings` (default 12:00 = today's behaviour).
- Cards → GlassCard rows grouped by role (role SectionRule), `ShiftRow` + avatar; managers tap to edit (`ShiftEditSheet`), everyone else → mini-profile. FAB ＋ stays (managers).
- **Full i18n** (`roster.*`) — the family's biggest debt; date formatting through the app locale.

### 4.5 `app/my-schedule.tsx` — "My Schedule"
- Root: `AmbientGlow` + `ScreenHeader title="My Schedule"` (right = ⚙ chip for O/M only; employees: none).
- Week nav bar + 53-week pager unchanged; `DayRow` → glass: 56pt date tile (tint fill on today) + `ShiftRow` cards.
- **Release** chip on each future shift when `shift_release_enabled` (state from `get_my_shift_releases`: none → "Release" · open → "Released · open" pill + Cancel · claimed → "Awaiting approval" · approved → the shift is gone from my list).
- Stamp line: "Schedule last updated {date} at {time}". The R365 sentence stays ONLY on the mcloones variant (`IS_MCLOONES`); MyResto gets "Shift changes and approvals happen right here in Shift Tools."

### 4.6 Org Settings → Access
- Remove the **Staff Can View Roster** row (Steve) — replaced by the Schedule Settings sheet. The `access` grant still governs the group server-side.

---

## 5. The Shift Tools (s84 unless s83 runs fast)

### 5.1 Welcome Schedule tab (`components/PortalHome.tsx:1412`)
Order (Steve, round 1): `DecisionBlurb` (when any) → **the Shifts card** = Upcoming shifts + Available shifts in ONE section (round-2 pick: flip card D vs tabbed card E, §11) → **My Full Schedule** · View Roster buttons → **Shift Tools** = Design A's tiles: `Request Time Off` · `Release Shift` (each hidden when its toggle is OFF; block hidden when both are) + O/M **Approvals** wide tile (count + AttentionRing pulse in tint). Available shifts only exist when the release toggle is ON; the "available" affordance pulses while the list is non-empty; claimed-by-me rows pin first.
- Fix: the Approvals gate uses `isManagerOrOwner(user)` (the current `isManager` prop misses owners).
- `badges.schedule` gets passed (dot) and the clock tab wraps in an AttentionRing when `useScheduleAttention` is non-zero and the tab isn't active.
- `?tab=schedule` deep-link param on the portal home (`handleTabChange('schedule')` once on mount).

### 5.2 Request Time Off → `TimeOffSheet`
Calendar (single day; tapping a second later day makes a range) → Reason → Review pane ("You're requesting off **Sat, Sep 20**" / "**Sep 20 – Sep 24**", quoted reason) → **Submit to Manager** → `request_time_off` → shade row (`time_off_requested`, targetRole manager, requesterId) + push to active managers/owners (`destination: 'schedule-approvals'`). A manager's own request goes to the same queue; the server refuses self-decisions.

### 5.3 Release Shift → `ReleaseShiftSheet`
My upcoming shifts with **Release** (no approval) → `release_shift` → the shift appears in coworkers' Available Shifts (title-matched). Cancel while open.
**Release push (Steve, round 1):** coworkers holding a matching job title (never the releaser, never O/M unless they hold the title) get a push — `notificationType: 'shift_release'`, governed by the NEW Profile → Notification Preferences toggle **"Shift releases"** (`shift_releases_enabled`, default on). Copy: "{Role} shift up for grabs · Sat, Sep 20 · 5:00 – 11:00 PM (from Marcus R.)". Requests/decisions use `notificationType: 'schedule'` with NO preference gate (transactional, always delivered). Recipients resolve server-side: `get_shift_release_recipients(p_actor_id, p_release_id)` → user ids, so the client never computes eligibility.

### 5.4 Pick Up
`AvailableShiftCard` → **Pick Up** → `claim_shift` → shade row (`shift_pickup_requested`) + push to managers/owners → Approvals badge/glow/pulse. Other coworkers stop seeing the row (claimed); the claimer sees "Awaiting approval".

### 5.5 Approvals page `app/schedule-approvals.tsx` (O/M)
`AmbientGlow` + `ScreenHeader "Approvals"` (right = ⚙ chip) → **Seg: Time Off (N) | Shift Pick Up (N) | History** → `ApprovalCard`s → `DecisionSheet` (Approve / Deny + optional reason) → `decide_*` → shade rows (`*_decision`, targetUserId = each affected user: requester; for pick-ups BOTH releaser and claimer) + pushes (`destination: 'schedule'` → `?tab=schedule`) → `refreshAllScheduleAttention()`. History: newest 10, "load more" on scroll end, up to 50; server sweeps >30 days. The rewards `/manager-approvals` page is untouched.

### 5.6 Employee side of a decision
Push (per-language) → shade row (only that employee) → Schedule tab dot + AttentionRing → `DecisionBlurb` on the tab. Seeing ANY of them clears all: tab focus or blurb ✕ → `ack_schedule_decisions`; shade tap → same RPC then `?tab=schedule`. Home-icon badge via BadgeSyncer (+ unseen decisions / + pending approvals for managers) and `get_user_badge_totals` for APNs.

---

## 6. Gating matrix

| Surface | Tier | Role | Grant | Org toggle | Other |
|---|---|---|---|---|---|
| Uploads chip / schedule-upload / review | premium (base = lock → PremiumGate) | manager/owner | none this wave (`premium.ai_schedule_upload` stays LATER) | — | — |
| Schedules (manual) | any | manager/owner | — | — | — |
| Roster | any | any | — | `staff_can_view_roster` (employees; server enforces) | — |
| Schedule Settings sheet | any | owner; managers with `org_settings.access` (else LOCKED rows) | access | — | — |
| Request Time Off | any | any active | — | `time_off_requests_enabled` | dates ≥ today |
| Release Shift | any | shift owner | — | `shift_release_enabled` | future shift, one live release |
| Pick Up | any | title-matched member | — | `shift_release_enabled` | ≠ releaser |
| Approvals page / decide | any | manager/owner | — | — | never your own request |

---

## 7. Copy

### 7.1 Schedule scan quips (`schedule_upload.quip_*`, EN / ES)
| key | EN | ES |
|---|---|---|
| itinerary | Contemplating the meaning of your itinerary. | Contemplando el sentido de tu itinerario. |
| sunday | Questioning if Sunday is real. | Cuestionando si el domingo existe. |
| meeting | Hoping this meeting gets canceled. | Esperando que cancelen esta reunión. |
| freezer | Estimating walk-in freezer crying sessions based on this grid: 7. | Estimando sesiones de llanto en la cámara fría según esta cuadrícula: 7. |
| lunch | Looking for hidden lunch breaks. | Buscando descansos de almuerzo escondidos. |
| friday | Counting the seconds until Friday. | Contando los segundos hasta el viernes. |
| naps | Adding 10-minute naps everywhere. | Añadiendo siestas de 10 minutos por todas partes. |
| spacetime | Bending the space-time continuum. | Doblando el continuo espacio-tiempo. |
| oracle | Consulting the digital oracle. | Consultando al oráculo digital. |
| freetime | Rescuing your lost free time. | Rescatando tu tiempo libre perdido. |
| mercury | Re-routing around Mercury retrograde. | Esquivando a Mercurio retrógrado. |
| wires | Untangling wires… and by that I mean this scheduling mess. | Desenredando cables… o sea, este lío de horarios. |
| workload | Pretending to understand this workload. | Fingiendo entender esta carga de trabajo. |
| coffee | Applying digital coffee to calendar. | Aplicando café digital al calendario. |
| thatguy | Oh boy… that guy again! | Ay no… ¡ese tipo otra vez! |
| silverware | Predicting silverware-rolling evasion tactics to peak around 9:30 PM. | Prediciendo que la evasión de enrollar cubiertos llegará a su punto máximo hacia las 9:30 PM. |
| cartrouble | Predicting three "car troubles" and one "sudden 24-hour flu" for Saturday morning. | Prediciendo tres "problemas con el carro" y una "gripe repentina de 24 horas" para el sábado por la mañana. |
| alarm | Adjusting for his inevitable "my alarm didn't go off" texts. | Ajustando por sus inevitables mensajes de "no me sonó la alarma". |
| goodluck | Applying the "Good Luck with That" filter. | Aplicando el filtro de "Buena suerte con eso". |
| clone | Creating a clone for your 8:00 AM meetings. | Creando un clon para tus reuniones de las 8:00 AM. |
| weekend | Plotting a permanent weekend. | Tramando un fin de semana permanente. |
| snacks | Replacing all shifts with snack breaks. | Reemplazando todos los turnos por pausas para picar. |
| hiding | Hiding from your notifications. | Escondiéndome de tus notificaciones. |

### 7.2 "For best results" fold (Upload tab)
> AI Schedule Upload scans your schedule and assigns the shifts to your employees automatically. For best results:
> • Make sure the upload clearly shows the week's start and end dates, employee names, and shift times.
> • Accepted files: PDF, PNG, JPG — up to 25 MB.
> • Photos should be sharp and in focus, with every date, name, and time readable.
> • Crop out backgrounds and anything that isn't the schedule before uploading.
> • If the dates aren't printed on the schedule, set the week range below so the scan knows where the shifts belong.

(Excel / Word are NOT supported — the parser sends PDF or image bytes to the model. 25 MB = the `schedules` bucket + broker limit.)

### 7.3 Notification copy (EN base + ES pair via `bothLanguages`)
- `time_off_request_title` "Time off request" · body "{name} requested {range}."
- `time_off_approved_title` "Time off approved" · body "Your time off for {range} was approved." (+ " Reason: {reason}" variant)
- `time_off_denied_title` "Time off not approved" · body "Your time off for {range} wasn't approved." (+ reason variant)
- `pickup_request_title` "Shift pick-up request" · body "{claimer} wants to pick up {releaser}'s {role} shift on {when}."
- `pickup_approved_title` "Shift pick-up approved" · body (claimer) "You're on the {role} shift {when}." · body (releaser) "{claimer} is covering your {role} shift {when}."
- `pickup_denied_title` "Shift pick-up not approved" · bodies mirror.
- Blurb lines reuse the bodies; the manager's reason renders in a quote box.

---

## 8. Smoke plan
- **Sim (MyResto Test, 7 grants ON):** throwaway employee A (Server) + B (Server, Bartender) via `create_user`; mresto decides. Flows: upload page staging → simulate scan → quips → ready card → review Save → lands on Schedules; roster half-day swipe; time-off request → manager shade/push → approve with reason → employee blurb/dot/glow → ack clears; release → B sees it (A doesn't, title mismatch check with a Host) → claim → approve → shift moves; deny → re-opens. Delete throwaways after (their uploads live in `schedules`, a broker-deletable bucket).
- **Device (Steve, Expo Go 57, LAN/tunnel):** file picker + camera paths on schedule-upload; push arrival + deep link into Approvals and the Schedule tab.
- **Fixtures:** Boathouse untouched (210/6/38/50 · 1484 shifts · 11 uploads); Belmont base tier (the lock states).

---

## 9. Questions — ANSWERED (Steve, round 1)
1. **Credits** — YES, meter schedule scans like menus; a scan costs even if the upload is deleted later. → §2.1b (own pool, 15/mo default, PDF 3 / image 1, first free).
2. **Time off range** — YES, range with single-day default.
3. **AM/PM cutoff** — YES, noon default.
4. **`get_org_uploads` DROP + CREATE** — trusted; go.
5. **Release push** — YES to title-matched coworkers, governed by a new Profile notification toggle; O/M get request notifications only. → §5.3.
Also folded in: the **AI Schedule Uploads manager permission goes live** (§2.1b) and the **premium / grant locks** on the Schedule chip rows and Uploads chip (§3, §6).

---

## 10. Session checklist
- [x] Mockup picks recorded (§11) · [x] migration applied + repo copy (`20260909120000_s83_schedule_wave.sql`) · [x] parse-schedule redeployed (v21) · [x] types.ts hand-spliced · [x] serverErrors wired (22 `s83_*`)
- [x] kit (§3) · [x] pages (§4) · [x] shift tools (§5) · [x] org-settings row removed
- [x] tsc TRUE 0 · [x] i18n parity **3525 = 3525** (baseline 3188 → 3525, both directions, 0 orphans) · [x] sim smoke (§12) · [ ] device smoke (Steve: file/camera picks, push arrival, deep links)
- [x] tracker regen · [ ] tracker republish · [ ] Design Library entries · [x] memory rewrite · [ ] "Sync it all"

## 11. Decisions log
- **Round 1 (2026-09-09):** Approvals page = **B (ledger + decision sheet)** — "compact, sleek, the hints about shifts are a nice touch". Rows 2 & 4 (sheets, ⚙ chip family, settings sheet, upload page) = go. Upload page: the *For best results* fold moves ABOVE the tiles, collapsed by default; show the Recent Uploads tab. Decision blurbs = keep. Shift Tools = **A's tiles**. "Full Schedule" → **"My Full Schedule"**. Welcome tab: Upcoming + Available share ONE section — round 2 decides between a **flip card** (strobing "Shifts available" chip flips to the list, "My shifts" flips back) and a **tabbed card** (Upcoming | Available seg inside the card). Steve's rail concern noted: a horizontal rail inside the Welcome pager fights the ConnectBar swipe — dropped.
- **Round 2 (2026-09-09):** Shifts card = **D, the flip card** ("so much more sleek") — front = Upcoming shifts + strobing "N shifts available" chip; tap flips (rotateY) to the Available list; the card MEASURES BOTH FACES and animates its height with the flip so the tiles slide, never jump; back capped at **4 rows + "See all"** which EXPANDS the card in place (more rows), and flipping home animates the height back up. **E (tabbed card) is the on-device fallback** if the flip fights the pager in Expo Go. Upload: U1' go; U3 delete-blurb loses "a scan is a scan" (reads like "a scam") → "Scan credits are not refunded."; U4 nav-sheet row renamed **"Upload Schedules & View History"**. P1 (release push + pulsing Schedule tab), P2 (Shift releases toggle), P3 (AI Schedule Uploads live) = go as drawn.
- **Steve's device round (2026-09-09, after the Expo Go smoke — "Just… WOW"):** everything green on device (time off, release, approvals, a real schedule upload with matched/unmatched + Save). Four design adjustments applied: (1) breathing room on the Welcome Schedule tab — 14pt between the flip card and the My Full Schedule / View Roster row, 12pt under the DecisionBlurb; the small "BACK" tab on the Available face is gone (the ⇄ "My shifts" control is enough; `shift_tools.back_tab` retired → i18n 3524); (2) the Roster strip's card band (the strip's own `colors.card` fill) read as a pre-glass leftover → `card: 'transparent'` on the roster only; (3) Release-a-shift rows are `stacked` — role pill under the time, the Release / state control on the right edge of the same row; (4) Approvals got the house horizontal pager: fixed seg tabs, three panes (Time off · Pick up · History) on a paging FlatList, tap = jump, swipe = tab follows; each pane keeps its own pull-to-refresh and the history load-more. (5) **My Schedule rows** re-slotted the same evening: the stacked ShiftRow now puts the time (14pt) + the hours badge (`timeTrailing`) on line one and the role pill + O/C/T tags + room on line two — everywhere `stacked` is used (Schedules, Release sheet, My Schedule) — so the Release control is the only thing on the right; a claimed release shows its "Awaiting approval" pill with the claimer's name underneath.

---

## 12. Sim smoke record (2026-09-09, iPhone 17 sim · Expo Go 57 · MyResto Test)
Throwaways `s83emp` Sia (Server+Bartender) · `s83bart` Bo (Bartender) · `s83host` Ho (Host) · `s83mgr` Mo (manager, all grants) — created via `create_user`, deleted after through `delete_employee` (cascades cover shifts/requests/releases/prefs; the one un-acked shade row was deleted first because `custom_notifications.sent_by` is NO ACTION).

**Green, end to end:** time-off request (range, reason) → managers' `time_off_requested` shade rows + pending count · release (Sia's Sat Server; Bo's Fri Bartender) → title matching held (Bo saw no open Server shift; Sia saw Bo's Bartender release) · Pick Up → `claimed` + manager shade row · Approvals page: Time off | Pick up | History, decision sheet with parties strip + conflict hints ("Scheduled inside this range: Sat 12 · 4:30 – 10:00 PM · Server …"), approve WITH a reason (stored, quoted in the decision copy) and WITHOUT (null path) · shift moved to the claimer · BOTH parties got `shift_pickup_decision` rows · history ledger (2 rows, decider, quote, "Last 50 decisions · 30 days") · Approvals tile count 2 → 0 and the pulse stopped · employee side: clock sub-tab dot, two green DecisionBlurbs, `get_my_schedule_decisions` 2 → 0 on tab focus (ack), single ✕ dismisses the stack · Schedules (chips, week nav, search/filter, A–Z, expand, Add Shift sheet with role chips/date/time/tags/room) · Upload (meter 15/15, collapsed *For best results*, tiles, DEV simulate rotor + quips, Recent tab with PDF/manual rows and the delete blurb) · Review (summary tiles, Matched|Unmatched, Add employee, rail) → Save marks `reviewed_at` and lands on Schedules · Roster half-day pager AM → PM → next-day AM with the strip advancing · ⚙ nav sheet → Schedule Settings (4 rows) → AM/PM cutoff spinner (nested) → Cancel/X returns to the parent sheet.

**Fixed during the smoke (all in the worktree):** `rightWide` on the Approvals / Roster / Upload headers (the ⚙ chip label truncated to "S…") · history detail line wraps to 2 lines · pick-up parties strip shows only the claimer's title that matches the shift · `ShiftRow` gained `stacked` (role pill + room under the time) — Schedules' expanded rows truncated the TIME with pencil + ✕ inline · Upload bucketing: Manual Entry + legacy (`source_type` null) rows live in Recent, never "Ready to review"; PDF detection falls back to the file name; manual rows read "added {{stamp}}" (new key) · the whole Recent row opens the review (was chevron-only) · Add Shift defaults to today when the visible week holds it · Review Save uses `router.dismissTo('/manual-schedule')` (pops to the Schedules already in the stack; replace when absent) and Schedules reloads on focus · the Uploads chip / nav row wait for the permission + subscription loads before wearing a lock (it flashed for a beat).

**Noted, not changed:** Expo Go's floating dev-menu bubble (blue gear) sits over the header's top-right in Expo Go only — drag it to the bottom-left before header taps; the Roster keeps its static portal tab bar on purpose; a released-but-unclaimed shift still lists as the releaser's on the Welcome card (My Schedule shows the state pill).

