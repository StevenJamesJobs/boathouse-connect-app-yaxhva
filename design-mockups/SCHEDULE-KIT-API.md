# The Schedule Kit — API brief for page builders (s83)

Read this before touching any schedule page. Everything below EXISTS and compiles (tsc 0).
The plan is `design-mockups/SCHEDULE-BUILD-PLAN.md` (§4 = the page-by-page spec you are building);
the visual reference for the new surfaces is `design-mockups/schedule-shift-tools-redesign.html` and
`…-v2.html`.

## Hard rules
- **NO GIT** — no stash / commit / checkout / branch. Edit files only.
- Pushed screen chrome: `<AmbientGlow />` as the FIRST child of the ROOT View, then `<ScreenHeader … />`
  (default `topOffset` 48; do NOT pass the menu-family `insets.top + 12`). The header's `right` slot gets
  `<ScheduleGearChip onPress={() => setNavOpen(true)} />` and the page mounts `<ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="…" />`.
- Every surface is glass: `GlassCard` (`variant="surface"` for cards, `"glass"` for chrome), theme tokens from
  `useThemeColors()` (`tint primary fireText blue blueText glass glassBorder surface surfaceBorder hairline text textSecondary card`),
  fonts from `constants/fonts.ts` (`fonts.display.semibold/bold`, `fonts.body.regular/medium/semibold`, `fonts.mono.medium/semibold`) — never `fontWeight` with a custom family.
- Sheets are top-level module components (never defined inside a screen's render). Any sheet action that navigates or alerts goes through
  `useSheetHandoff(onClose)` → `defer(fn)` + pass `onDismiss` to the GlassSheet. Overflow menus = `GlassActionSheet`, never an Alert with >3 buttons.
- Never draw `borderStyle: 'dotted'`. Dashed borders need the full 1pt.
- Category/role colours never colour text; role pills are `colors.primary + '24'` fill / `+ '42'` border / primary ink (ShiftRow does this for you).
- i18n: NO hardcoded user-facing strings. Use `t('namespace.key')` with the page's namespace (`manual_schedule` · `schedule_upload` · `schedule_review` · `roster` · `my_schedule`) plus the shared `schedule_common` / `shift_edit` / `schedule_nav` keys listed below. **Do NOT edit `locales/en.json` / `locales/es.json`** (parallel builders would collide). Write every NEW key you mint to `design-mockups/i18n/<page>.json` as `{"en": {"<namespace>": {…}}, "es": {"<namespace>": {…}}}` — EN and ES both, same key set. Keys already in the locale files may be reused (grep them). Interpolate with `{{n}}`, never `count` (plural forms are not set up).
- `app/integrations/supabase/types.ts` is HAND-ADJUSTED — never regenerate it. Every RPC below is already typed.
- Numbers from RPCs can arrive as strings (PostgREST numerics) — coerce with `Number()` where it matters.
- Gates: `npx tsc --noEmit` must be a TRUE 0 when you finish (run it from the repo root, absolute path `/Users/steveneccles/boathouse-connect-app-yaxhva-s83-schedule`; log to a file, never pipe through `head`). Fix your own errors. Do not touch files outside your page except the i18n scratch file.

## Chrome & glass
- `components/ScreenHeader.tsx` — `{ title, eyebrow?, onBack?, right?: ReactNode, rightWide?: boolean, topOffset?: number }`. Two right-side controls (gear + a labelled chip) need `rightWide`.
- `components/AmbientGlow.tsx` — no props.
- `components/GlassCard.tsx` — `{ variant: 'glass' | 'surface', radius?, intensity?, style?, children }`.
- `components/GlassSheet.tsx` — default export `{ visible, onClose, title, subtitle?, headerAction?, scroll?=true, footer?, onDismiss?, children }`; named export `useSheetHandoff(onClose) → { defer, onDismiss }`.
- `components/GlassActionSheet.tsx` — `{ visible, onClose, title, subtitle?, actions: { key, label, iosIcon, androidIcon, destructive?, disabled?, onPress }[] }` (auto-deferred).
- `components/PremiumGate.tsx` — `{ desc, title?, buttonLabel?, bullets?, footer?, showButton? }` (host renders AmbientGlow itself).
- `components/MenuSearchRow.tsx` — `{ colors, mode: 'user' | 'editor', value, onChangeText, placeholder, onRightPress, filterCount?, onReorderPress? }` (user mode = Filter button with badge; editor mode = ＋).
- `components/IconSymbol.tsx` — `{ ios_icon_name, android_material_icon_name, size, color }`.
- `components/tools/ToolsBits.tsx` — `AttentionRing({ active, color, radius? })` (absoluteFill pulse; parent must be `position: relative`) · `SectionRule({ label })`.

## The schedule kit (`components/schedule/`)
- `ScheduleGearChip` — `{ onPress, compact? }` (38pt glass ⚙ + "Schedule"; `compact` = icon only, for a header that also carries a labelled chip).
- `ScheduleNavSheet` — `{ visible, onClose, current: 'my-schedule' | 'roster' | 'schedules' | 'upload' | 'review' | 'approvals' }`. Self-contained (role, tier, grants, settings, badge). Hosts the nested Upload + Settings sheets.
- `ScheduleSegTabs<T>` — `{ tabs: { key, label, count?, iosIcon?, androidIcon?, live? }[], value, onChange, small? }` (the tinted seg; `live` pulses).
- `ShiftRow` — `{ shift: { shift_date, start_time, end_time, roles, is_opener?, is_closer?, is_training?, room_assignment? }, showDay?=true, leading?, trailing?, onPress?, dim?, style?, first? }` — ONE shift line everywhere (mono day · mono time range · O/C/T flags · role pill · room).
- `ShiftEditSheet` — `{ visible, mode: 'add' | 'edit', shift?: ShiftLike, employeeName?, userId?, uploadId?, defaultDate?: Date, lockEmployee?, onClose, onSaved, onDeleted? }`. Replaces `components/ShiftEditForm.tsx` everywhere (don't import the old one). `ShiftLike` = `{ id, upload_id?, user_id, employee_name, shift_date, start_time, end_time, roles, is_closer, is_opener, is_training, room_assignment }`.
- `EmployeePickerSheet` — `{ visible, onClose, onSelect(emp | null), selectedId?, filterRole?, allowUnassign?, assignedNames?: Record<userId, scheduleName>, title? }`. Replaces `EmployeePickerModal`.
- `ScheduleUploadSheet` — nested inside the nav sheet only; you never mount it yourself.
- `scheduleVisuals.ts` — `SCHEDULE_HUES {pending, ok, bad, am, pm}` (dark/light pairs), `scheduleHue(key, isDark)`, `statusHueKey(status)`, `TILE_BG_ALPHA / TILE_BORDER_ALPHA`, `APPROVAL_HISTORY_PAGE`, `AVAILABLE_BACK_ROWS`. Dark/light: `useIsDarkTheme()` from `components/content/useIsDarkTheme`.
- `scheduleQuips.ts` — `useScheduleQuips(): string[]` → pass to `<ScanQuip quips={…} style={…} />` (`components/MenuScanQuips.tsx`, default export).

## Hooks
- `hooks/useScheduleSettings` — `{ settings: { staffCanViewRoster, timeOffEnabled, shiftReleaseEnabled, rosterPmCutoff('HH:MM:SS') }, loading, refresh }` + `refreshAllScheduleSettings()`.
- `hooks/useScheduleQuota` — `{ quota: { remaining, max, freeAvailable, pdfCost, imagePageCost } | null, loading, refresh }` (lazy: call `refresh()` on focus/open) + `scanCost(sourceType, pageCount, quota)` + `SCHEDULE_PDF_COST`.
- `hooks/useScheduleAttention` — `{ attention: { pendingApprovals, unseenDecisions, availableShifts }, refresh }` + `refreshAllScheduleAttention()` + `ackScheduleDecisions(userId)`.
- `hooks/useManagerPermissions` — `perms.aiScheduleUpload` (owners true) · `perms.access`.
- `contexts/SubscriptionContext` `useSubscription().hasPremium` · `contexts/AuthContext` `useAuth().user` (`id, role, name`) · `contexts/OrganizationContext` `useOrganization()` (`organizationId, organization`) · `contexts/LanguageContext` `useLanguage().language`.
- `utils/roles` `isManagerOrOwner(user)` · `hooks/useRequireManagerRoute` for manager-only pages · `utils/orgDirectory` `getOrgDirectory(actorId)` → `{ id, name, job_title, job_titles, role, profile_picture_url, is_active }[]`.

## Utils
- `utils/schedule/format.ts` — `localeFor(language)`, `toISODate`, `todayISO`, `parseISODate` (LOCAL midnight — never `new Date('YYYY-MM-DD')`), `addDays`, `isSameDay`, `minutesOf`, `formatTime`, `formatTimeRange`, `formatDateShort` ("Sat, Sep 20"), `formatDayLead` ("Sat 20"), `formatDateLong`, `formatMonthDay`, `formatDateRange`, `formatWeekRange`, `daysBetween`, `shiftHalf(startTime, cutoff)` → 'AM' | 'PM', `toTimeParam(Date)`, `timeToDate('HH:MM')`, `shiftHours`, `formatStamp(iso)`, `initialsOf(name)`.
- `utils/schedule/uploadStaging.ts` — `takeStagedPick()` (one-shot) / `peekStagedPick()` / `setStagedPick()`; `StagedPick = { kind, assets: { uri, name, mimeType, size? }[], displayName, sourceType: 'pdf'|'image', pageCount, mediaType }`.
- `utils/storageBroker` — `brokerUploadBase64(purpose, base64, fileName, contentType, actorId) → publicUrl` (purpose `'schedule_upload_file'`) · `brokerDelete(bucket, urls, actorId)` (bucket `'schedules'`). Read a file with `FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })` from `expo-file-system/legacy`.
- `utils/serverErrors` — `translateServerError(error, fallback)` for every RPC error you surface.

## RPCs (all `p_actor_id: user.id`, all typed in types.ts)
Reads: `get_org_schedule(p_start_date, p_end_date)` · `get_org_roster(p_date)` · `get_my_shifts(p_start_date, p_end_date?, p_limit?)` · `get_upload_shifts(p_upload_id)` · `get_org_uploads(p_upload_id?, p_week_start?, p_limit?)` → rows now carry `title, reviewed_at, source_type ('pdf'|'image'|'manual'|null), page_count, credits_charged, was_free` · `get_latest_schedule_upload_at` · `get_org_job_titles` · `get_schedule_settings` · `get_schedule_upload_quota` · `get_my_shift_releases` · `get_available_shifts`.
Writes: `add_shift` / `update_shift` / `delete_shift` (use ShiftEditSheet) · `assign_upload_shifts(p_upload_id, p_employee_name, p_user_id?)` · `create_schedule_upload(p_file_url, p_file_name, p_week_start, p_week_end, p_status?, p_title?, p_source_type?, p_page_count?)` · `delete_schedule_upload(p_upload_id)` (cascades the shifts; NO credit refund) · `mark_schedule_upload_reviewed(p_upload_id)` · `release_shift(p_shift_id)` · `cancel_shift_release(p_release_id)`.
Edge fn: `supabase.functions.invoke('parse-schedule', { body: { file_url, upload_id, user_id, organization_id, media_type, additional_image_urls, source_type, page_count, week_start_hint?, week_end_hint? } })` → 202; poll `get_org_uploads({ p_upload_id })` every 3 s until `status !== 'processing'`, with the MenuUploadSheet error branch (RPC error or 5 empty reads → stop + alert).

## Shared i18n keys that already exist
`schedule_common.{opener,closer,training,flag_opener,flag_closer,flag_training}` · `shift_edit.*` (the editor) · `schedule_nav.*` · `schedule_upload.{quip_*, credits_left, credits_costs, first_free, premium_title, premium_msg, too_big_*, images_name, image_name, photo_name, permission_*, camera_denied_*, upload_failed, failed_generic, default_file_name}` plus the page's legacy keys (`schedule_upload.title`, `premium_desc`, `premium_b1..b5`, `premium_footer`, `status_*`, `shifts`, `unmatched`, `review_edit`, …) · `common:cancel` · `common.not_now` · `common.upgrade` · `content_editor.done`.
