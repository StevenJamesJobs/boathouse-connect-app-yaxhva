-- Type pass, server half: pin search_path on the 45 remaining unpinned public
-- functions.
--
-- Evidence (session 56 recon):
--  * The security advisor's 45 function_search_path_mutable WARNs are the
--    COMPLETE set of unpinned public functions (catalog cross-check found
--    zero others with proconfig IS NULL).
--  * All 45 bodies reference ONLY unqualified public-schema objects (scanned
--    mechanically) — pinning `public, extensions, pg_temp` (the house style,
--    e.g. get_me/login_user/award_bucks) cannot change any name resolution.
--  * 43 are SECURITY DEFINER fns (recipe writes, manage_menu_* suite,
--    menu-item CRUD, org seeders, _is_org_owner/_can_manage_* gate helpers);
--    2 are trigger fns (update_user_mcloones_bucks — the DEFINER bucks-ledger
--    trigger — plus auto_delete_old_messages / update_org_subscription_timestamp).
--  * Signatures are derived from the catalog AT APPLY TIME via
--    pg_get_function_identity_arguments — the s44 rollback was caused by a
--    hand-written signature; this cannot recur.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
      r.proname, r.args
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'search_path pinned on % functions', n;
  IF n <> 45 THEN
    RAISE EXCEPTION 'expected exactly 45 unpinned functions, found % — aborting (advisor set drifted)', n;
  END IF;
END $$;
