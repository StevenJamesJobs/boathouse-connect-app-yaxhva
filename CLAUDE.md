# Working with this repo

Project instructions for anyone (human or AI assistant, on any machine) working on this codebase.
Claude Code auto-loads this file. **These rules are load-bearing — follow them exactly.**

## Golden rules

- **Edit the WORKTREE, not the main checkout.** Do development in a git worktree
  (`git worktree add ../boathouse-connect-app-yaxhva-<name> <branch>`), not in the primary checkout.
- **A fresh worktree has no `node_modules` — SYMLINK it, do NOT `npm install`.** The SDK-54 install /
  lockfile is delicate and must not be disturbed: `ln -s <main-checkout>/node_modules <worktree>/node_modules`.
- **Dev server runs FROM THE WORKTREE:** `unset APP_VARIANT && APP_VARIANT=public npx expo start -c --go`
  (`public` = the MyResto variant; `mcloones` = Boathouse).
- **Gates on every change:** `npx tsc --noEmit` with **0 net-new errors in touched files** (main has a
  large pre-existing baseline of benign `organizationId: string|null` errors — measure the diff, not the
  total), and keep **en/es i18n at parity** — never add a `t()` key to only one locale.
- **Supabase project `xvbajqukbakcvdrkcioi` via the Supabase MCP.** Migrations and edge functions deploy
  **through the MCP** (`apply_migration` / edge-fn deploy), **not** from the repo. Keep a repo copy of each
  migration under `supabase/migrations/` for the record, but the live deploy is via MCP. Keep SQL
  SELECT-only until deliberately applying a reviewed migration.
- **Commit / PR / merge ONLY when Steve says "Sync it all."** Until then, work stays uncommitted in the
  worktree. Use `gh auth switch --user StevenJamesJobs` if git auth is needed. End commit messages with a
  `Co-Authored-By: Claude ...` line.

## Load-bearing architecture

- **One Supabase project serves BOTH app variants** (public/MyResto and mcloones/Boathouse). The URL is
  hardcoded in `app/integrations/supabase/client.ts` and is **not** switched by `APP_VARIANT`, so **DB
  migrations are GLOBAL across all organizations** — a schema/RLS/RPC change affects every org.
- **Custom username/password auth**: `auth.uid()` is always `NULL`. The actor id comes from
  `useAuth().user.id` client-side and is passed explicitly into RPCs (`p_actor_id` / `p_user_id`). Any
  RLS keyed on `auth.uid()` never matches — server access is via `SECURITY DEFINER` RPCs or the
  service-role edge functions.

## Building & releasing

See [BUILD.md](./BUILD.md) — variants, EAS commands, Transporter delivery, versioning, sandbox IAP
testing, and the shared Build Log (append a row per build).
