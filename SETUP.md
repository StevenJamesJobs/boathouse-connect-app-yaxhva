# Working on this app across machines (Desktop ⇄ MacBook Pro)

**GitHub is the source of truth. The Supabase backend is shared and live. Each
machine builds its own `node_modules`.** You never copy files between machines —
everything flows through GitHub.

## First-time setup on a new machine

You need **git**, **Node 20+** (project pins 22.15.0 via `.nvmrc`), and the
**GitHub CLI** (`gh`) signed in as `StevenJamesJobs`. Because the app runs in
**Expo Go**, you do NOT need Xcode, CocoaPods, or Android Studio.

```bash
# 1. Clone as a real git repo (NOT "Download ZIP" — a ZIP has no git history)
git clone https://github.com/StevenJamesJobs/boathouse-connect-app-yaxhva.git
cd boathouse-connect-app-yaxhva

# 2. (Optional) match the pinned Node version — needs nvm installed
nvm install        # reads .nvmrc → installs & uses Node 22.15.0
                   # if "nvm: command not found", any Node 20/22/24 LTS is fine

# 3. Install the EXACT locked dependencies — THIS is the step that makes it run
npm ci

# 4. Start the dev server for Expo Go, then scan the QR code in Expo Go
unset APP_VARIANT && APP_VARIANT=public npx expo start -c --go
```

### ⚠️ The step people skip: `npm ci` (and don't confuse it with `nvm install`)
A fresh clone has **no `node_modules`** (it's gitignored). Running `expo start`
before installing deps fails with `Cannot find package 'expo'`. **`npm ci`** —
not `npm install`, and not `nvm install` — is what fixes it:
- installs the **exact** versions from `package-lock.json` (identical to the
  other machine), and
- **never rewrites the lockfile**, so it can't drift the SDK-54 setup.

Use `npm ci`, never `npm install`, on this project.

## Everyday rhythm when you switch machines

**Before you leave a machine:** finish what you're doing, tell Claude
**"Sync it all"** so it merges to `main`, and confirm the PR merged. Nothing is
left stranded.

**When you sit down at the other machine:**
```bash
git checkout main && git pull    # grab the latest
npm ci                           # ONLY if package-lock.json changed this cycle
```
Then work as normal.

**Golden rule:** work on **one machine at a time**, and always "Sync it all"
before switching. Everything funnels through PRs to `main`, so you'll basically
never hit a merge conflict.

## Good to know
- **Run Expo from the worktree.** When Claude is working in
  `.claude/worktrees/<name>/`, start `expo start -c` from *that* folder, not the
  repo root — otherwise Metro serves stale code.
- **One live database.** Both machines' apps hit the same Supabase project, and
  any migration / edge-function deploy runs against that same live DB. Nothing to
  sync — but treat every migration as a real production change.
- **No secrets to copy.** The Supabase URL + public anon key live in the code
  (`app/integrations/supabase/client.ts`); there's no `.env` file to move.
