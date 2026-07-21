-- S50 B5 teardown T2 (2026-07-21): users table WRITE surface closed + the
-- superseded un-gated write-RPC overloads dropped (the 4-arg p_actor_id
-- overloads from B3-A3 are the live paths; update_profile_picture's un-gated
-- 3-arg form was already dropped at B4a). KEEPS the dead policy
-- "Only managers can insert users" (auth.uid()-based, never matches).
-- ROLLBACK:
--   GRANT INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
--   CREATE POLICY "Allow update users" ON public.users FOR UPDATE TO public USING (true) WITH CHECK (true);
--   CREATE POLICY "Allow delete users" ON public.users FOR DELETE TO public USING (true);
--   -- overload restores: session-43 A3 migration notes (b3_write_overloads)
DROP POLICY "Allow update users" ON public.users;
DROP POLICY "Allow delete users" ON public.users;
REVOKE ALL ON public.users FROM anon, authenticated;

DROP FUNCTION public.update_user_active_status(uuid, boolean, uuid);
DROP FUNCTION public.update_user_job_titles(uuid, text[], uuid);
DROP FUNCTION public.set_user_test_flag(uuid, boolean, uuid);
