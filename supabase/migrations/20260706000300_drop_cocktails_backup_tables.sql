-- Drop the two orphaned cocktail migration-backup tables (created 2026-06-15 when
-- cocktails/recipes were moved to the new structure). They held one-time backups
-- (156 + 54 rows), were confirmed unreferenced by app code, migrations, and edge
-- functions, and had no DB dependents (no FKs/views). Dropping them resolves the
-- two critical `rls_disabled_in_public` security-advisor ERRORS (they had no RLS,
-- so anyone with the anon key could read/edit/delete them).
DROP TABLE IF EXISTS public.cocktails_proc_backup_0615;
DROP TABLE IF EXISTS public.cocktails_ingredients_backup;
