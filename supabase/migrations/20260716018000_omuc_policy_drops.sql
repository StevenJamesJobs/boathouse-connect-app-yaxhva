-- B2/B3 session 47 Batch A — USER-APPROVED EARLY DROP (2026-07-16): remove the world-open
-- policies on organization_menu_upload_credits (the "mint credits" hole). Safe because the
-- entire client git history shows the feature was born RPC-only (zero direct .from() ever
-- shipped in any build variant), and the 4 owner-gated SECURITY DEFINER RPCs
-- (get_menu_upload_quota / consume_menu_upload_credits / get_review_refresh_quota /
-- consume_review_refresh, all pinned in b2b3_omuc_pins) are unaffected by policies/grants.
--
-- ROLLBACK (restores the pre-drop state exactly, takes seconds):
--   CREATE POLICY public_read_omuc  ON public.organization_menu_upload_credits FOR SELECT TO public USING (true);
--   CREATE POLICY public_write_omuc ON public.organization_menu_upload_credits FOR ALL    TO public USING (true) WITH CHECK (true);
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_menu_upload_credits TO anon, authenticated;
DROP POLICY IF EXISTS public_write_omuc ON public.organization_menu_upload_credits;
DROP POLICY IF EXISTS public_read_omuc ON public.organization_menu_upload_credits;
REVOKE ALL ON public.organization_menu_upload_credits FROM anon, authenticated;
