-- B8 Item 2 (session 54, 2026-07-27): DROP the orphaned `events` table.
-- APPLIED LIVE via Supabase MCP apply_migration (b8_drop_orphaned_events_table).
--
-- Evidence: zero client access (no .from('events'), no RPC touches it, no realtime
-- sub, types-only reference); 2 rows of 2025-dated Boathouse demo-seed data
-- ("Summer Kickoff Party" 2025-06-15, "Live Music Night" 2025-06-22, created_by NULL,
-- seeded 2025-12-03); RLS-on/no-policy deny-all since the s50 teardown; no inbound
-- FKs, no dependent views. The upcoming-events CONTENT feature uses the separate
-- `upcoming_events` table and is unaffected.
--
-- Sealed backup mirrors boathouse_scores_backup_20260721 (RLS on, app roles revoked;
-- delete with the ~2026-08-20 30-day cleanup). Rollback: recreate from the backup +
-- PK(id), FK created_by->users(id), FK organization_id->organizations(id) NOT NULL
-- (the trg_default_org_id_events trigger is NOT restored - the backfill trigger
-- family is dropped later this same session).

CREATE TABLE public.events_backup_20260727 AS SELECT * FROM public.events;
ALTER TABLE public.events_backup_20260727 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events_backup_20260727 FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events_backup_20260727) <> (SELECT count(*) FROM public.events) THEN
    RAISE EXCEPTION 'events backup count mismatch - aborting drop';
  END IF;
END $$;

DROP TABLE public.events;
