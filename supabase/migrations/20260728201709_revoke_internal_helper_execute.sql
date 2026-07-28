-- Hygiene micro-migration (s58): REVOKE EXECUTE on the REST-exposed internal
-- _helper functions FROM PUBLIC (+ anon/authenticated belt-and-braces).
-- These are definer-internal helpers (_is_org_owner, _can_manage_*, _require_*,
-- _throttle_*, _recipe_source_org, _request_ip) — harmless oracles but zero
-- reason to expose via PostgREST. Definer-internal calls are UNAFFECTED
-- (privilege checks run as the function owner — s50 precedent).
-- Catalog-driven with fail-loud count assertion (pins-migration pattern).
-- Recon 2026-07-28: exactly 11 such fns; only 4 still carried PUBLIC/anon/
-- authenticated EXECUTE (_is_org_owner, _can_manage_host,
-- _can_manage_redemptions, _recipe_source_org) — the other 7 revokes are
-- idempotent no-ops.
-- ROLLBACK (restores exact prior state — only the 4 that were exposed):
--   GRANT EXECUTE ON FUNCTION public._is_org_owner(uuid, uuid) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public._can_manage_host(uuid, uuid) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public._can_manage_redemptions(uuid, uuid) TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public._recipe_source_org(uuid, uuid) TO PUBLIC, anon, authenticated;
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.proname AS fname,
           pg_get_function_identity_arguments(p.oid) AS fargs
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname LIKE '\_%'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.fname, r.fargs);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.fname, r.fargs);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.fname, r.fargs);
    n := n + 1;
  END LOOP;
  IF n <> 11 THEN
    RAISE EXCEPTION 'helper revoke: expected exactly 11 underscore-prefixed public functions, found %', n;
  END IF;
  RAISE NOTICE 'helper revoke: EXECUTE revoked from PUBLIC/anon/authenticated on % functions', n;
END $$;
