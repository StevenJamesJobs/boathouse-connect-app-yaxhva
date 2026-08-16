# Working with this repo

Project instructions for anyone (human or AI assistant, on any machine) working on this codebase.
Claude Code auto-loads this file. **These rules are load-bearing — follow them exactly.**

## Golden rules

- **Edit the WORKTREE, not the main checkout.** Do development in a git worktree
  (`git worktree add ../boathouse-connect-app-yaxhva-<name> <branch>`), not in the primary checkout.
- **A fresh worktree has no `node_modules` — SYMLINK it, do NOT `npm install`.** The SDK-54 install /
  lockfile is delicate and must not be disturbed: `ln -s <main-checkout>/node_modules <worktree>/node_modules`.
  (The symlink is ignored via `.git/info/exclude`, not `.gitignore` — re-add it if the repo is recloned.)
  Also copy `.expo/types/router.d.ts` from the main checkout into the worktree's `.expo/types/` —
  a stale or missing copy shows phantom expo-router `Href` tsc errors until a dev server regenerates it.
- **Dev server runs FROM THE WORKTREE:** `unset APP_VARIANT && APP_VARIANT=public npx expo start -c --go`
  (`public` = the MyResto variant; `mcloones` = Boathouse). Log long-running commands direct to a file —
  piping them (`| head`) has killed the server, and `eas` exit codes lie through pipelines.
- **Gates on every change:** `npx tsc --noEmit` must be a **TRUE 0** (the old pre-existing baseline was
  eliminated by the s57 type pass, PR #66 — any tsc error is net-new by definition), and keep **en/es
  i18n at parity** (`locales/en.json` / `es.json`; the current baseline count is tracked in the
  assistant's session memory, outside the repo). Never add a `t()` key to only one locale. Run the key
  check in BOTH directions — source refs exist in both locales AND newly added keys are referenced in
  source (catches minted-but-unwired keys) — plural-suffix-aware, scanning `app/ components/ hooks/
  utils/` **plus `config/ styles/ types/`** (`config/quickTools.ts` carries labelKeys).
- **Measure baselines in the PRISTINE MAIN checkout**, never via `git stash` — NEVER stash in a worktree
  holding live batch work. Shell working directories can reset between tool calls: use absolute paths;
  a sudden 0-error tsc is the classic wrong-directory tell.
- **Supabase project `xvbajqukbakcvdrkcioi` via the Supabase MCP.** Migrations and edge functions deploy
  **through the MCP** (`apply_migration` / edge-fn deploy), **not** from the repo — and they are LIVE
  IMMEDIATELY, unlike client code. Keep a repo copy of each migration under `supabase/migrations/`.
  **Edge-function sources are canonical in-repo at `supabase/functions/`** — patch there, then deploy,
  so the repo never lags the deployed bytes. Keep SQL SELECT-only until deliberately applying a
  reviewed migration.
- **Commit / PR / merge ONLY when Steve says "Sync it all."** Until then, work stays uncommitted in the
  worktree. Use `gh auth switch --user StevenJamesJobs` if git auth is needed. End commit messages with a
  `Co-Authored-By: Claude ...` line. (Claude Code's auto-mode classifier can block mass-DROP migrations,
  `verify_jwt=false` deploys, and occasionally push/PR — get Steve's explicit go-ahead and retry once.)

## Load-bearing architecture

- **One Supabase project serves BOTH app variants** (public/MyResto and mcloones/Boathouse). The URL is
  hardcoded in `app/integrations/supabase/client.ts` and is **not** switched by `APP_VARIANT`, so **DB
  migrations are GLOBAL across all organizations** — a schema/RLS/RPC change affects every org.
- **Custom username/password auth**: `auth.uid()` is always `NULL`. The actor id comes from
  `useAuth().user.id` client-side and is passed explicitly into RPCs (`p_actor_id` / `p_user_id`). Any
  RLS keyed on `auth.uid()` never matches — server access is via `SECURITY DEFINER` RPCs or the
  service-role edge functions. New RPCs follow the house discipline: DEFINER + search_path pin +
  actor-gate + org derived from the actor's row (never trust a client-supplied org).
- **NEVER regenerate `app/integrations/supabase/types.ts` wholesale.** The committed copy is
  HAND-ADJUSTED (the s64 casts-zero pass; the generator can't express nullability the app relies on) —
  regenerating produces ~74 errors across unrelated files. Hand-splice new definitions instead.
- **`information_schema` does NOT show CHECK constraints** — query `pg_constraint` before asserting
  what a column will accept.
- Locked tables are **RLS-on with zero policies = deny-all by design**; the security-advisor baseline
  is 0 ERROR, and the standing WARN/INFO noise is the audited architecture, not a regression.

## Working with AI subagents

- Every subagent/workflow prompt carries an explicit **NO-GIT** rule (no stash/commit/checkout).
- **Always grep-verify subagent edits** — never trust self-reports (agents have silently no-op'd).
- Pass derived data to workflows **as files, never hand-typed args**; reconcile counts in the main loop.
- Before believing a "failed" workflow did nothing, read its journal — it may have finished the work.

## Design system

The ambient-glow/glass design language is shared-component-first (`components/ScreenHeader.tsx`,
`GlassCard`, `GlassSheet`, `PremiumGate`, the Menu kit, …); `design-mockups/` holds the locked look.
Flagship pages get HTML mockups to choose from BEFORE any build. Detailed motion/layout rules
(the collapse spec, sheet handoff/teardown, drag-list rules) live in the assistant's memory.

## Building & releasing

See [BUILD.md](./BUILD.md) — variants, EAS commands, the npm-10 lockfile gate, Transporter delivery,
versioning, sandbox IAP testing, and the shared Build Log (append a row per build).
