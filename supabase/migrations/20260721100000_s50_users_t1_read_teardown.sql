-- S50 B5 teardown T1 (2026-07-21): users table READ surface closed.
-- All client reads go through the Phase-A DEFINER RPCs (login_user/get_me/
-- get_org_directory/get_employee/get_user_card/check_username_available).
-- ROLLBACK:
--   GRANT SELECT ON public.users TO anon, authenticated;
--   CREATE POLICY "Allow read access for login" ON public.users FOR SELECT TO public USING (true);
DROP POLICY "Allow read access for login" ON public.users;
REVOKE SELECT ON public.users FROM anon, authenticated;
