-- B8 Item 2 (session 54, 2026-07-27) follow-up: the users table had its OWN
-- backfill variant (set_default_organization_id_users) that the family sweep's
-- pg_proc filter missed - trg_default_org_id_users called a users-specific
-- function (owner: RAISE; everyone else: silently attributed to McLoone's org).
-- Same hazard, same rationale, same Steve approval as
-- b8_drop_default_org_backfill_triggers: users.organization_id is NOT NULL and
-- every creation path (create_user / signup_owner_with_org / join_signup) sets
-- the org explicitly, so a NULL-org user insert should fail loudly, not silently
-- join Boathouse's roster.
-- Applied LIVE via Supabase MCP apply_migration (b8_drop_default_org_backfill_users_trigger).
--
-- Rollback (recorded verbatim in session54_manifests/rollback_b8_triggers.sql):
--   CREATE FUNCTION set_default_organization_id_users() ... (owner RAISE +
--   mcloones-boathouse backfill) + CREATE TRIGGER trg_default_org_id_users
--   BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION ...

DROP TRIGGER trg_default_org_id_users ON public.users;
DROP FUNCTION public.set_default_organization_id_users();
