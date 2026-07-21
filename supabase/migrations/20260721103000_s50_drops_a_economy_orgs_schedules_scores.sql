-- S50 B5 teardown group A (2026-07-21): economy + organizations + schedules +
-- scores/reviews clusters — drop every legacy TO-public/authenticated policy
-- and revoke table grants. All client access is via DEFINER RPCs (sessions
-- 43-44). Includes word_search_scores' DUPLICATE delete policy and
-- exam_results' dead direct-write policies (submit_exam_and_award_bucks is the
-- gated write path).
-- ROLLBACK: re-CREATE from session50_manifests/restore_policies.sql;
--           re-GRANT from session50_manifests/restore_table_grants.sql.

-- economy
DROP POLICY "Anyone can view rewards transactions" ON public.rewards_transactions;
DROP POLICY "Managers can delete rewards transactions" ON public.rewards_transactions;
DROP POLICY "Managers can insert rewards transactions" ON public.rewards_transactions;
DROP POLICY "Managers can update rewards transactions" ON public.rewards_transactions;
DROP POLICY "Anyone can insert redemption requests" ON public.redemption_requests;
DROP POLICY "Anyone can update redemption requests" ON public.redemption_requests;
DROP POLICY "Anyone can view redemption requests" ON public.redemption_requests;
-- organizations (org INSERT happens only inside DEFINER signup_owner_with_org)
DROP POLICY "public_insert_organizations" ON public.organizations;
DROP POLICY "public_read_organizations" ON public.organizations;
DROP POLICY "public_update_organizations" ON public.organizations;
-- schedules
DROP POLICY "public_delete_staff_schedules" ON public.staff_schedules;
DROP POLICY "public_read_staff_schedules" ON public.staff_schedules;
DROP POLICY "public_update_staff_schedules" ON public.staff_schedules;
DROP POLICY "public_write_staff_schedules" ON public.staff_schedules;
DROP POLICY "public_delete_schedule_uploads" ON public.schedule_uploads;
DROP POLICY "public_read_schedule_uploads" ON public.schedule_uploads;
DROP POLICY "public_update_schedule_uploads" ON public.schedule_uploads;
DROP POLICY "public_write_schedule_uploads" ON public.schedule_uploads;
-- scores/reviews
DROP POLICY "Anyone can view active guest reviews" ON public.guest_reviews;
DROP POLICY "Managers can delete guest reviews" ON public.guest_reviews;
DROP POLICY "Managers can insert guest reviews" ON public.guest_reviews;
DROP POLICY "Managers can update guest reviews" ON public.guest_reviews;
DROP POLICY "Anyone can read google reviews" ON public.google_reviews;
DROP POLICY "Anyone can update google reviews is_published" ON public.google_reviews;
DROP POLICY "game_scores_delete_all" ON public.game_scores;
DROP POLICY "game_scores_insert_all" ON public.game_scores;
DROP POLICY "game_scores_select_all" ON public.game_scores;
DROP POLICY "Public can delete word search scores" ON public.word_search_scores;
DROP POLICY "Public can insert word search scores" ON public.word_search_scores;
DROP POLICY "Public can read word search scores" ON public.word_search_scores;
DROP POLICY "word_search_scores_delete_all" ON public.word_search_scores;
DROP POLICY "picture_this_scores_delete_all" ON public.picture_this_scores;
DROP POLICY "picture_this_scores_insert_all" ON public.picture_this_scores;
DROP POLICY "picture_this_scores_select_all" ON public.picture_this_scores;
DROP POLICY "Anyone can delete exam results" ON public.exam_results;
DROP POLICY "Anyone can insert exam results" ON public.exam_results;
DROP POLICY "Anyone can update exam results" ON public.exam_results;
DROP POLICY "Anyone can view exam results" ON public.exam_results;

REVOKE ALL ON public.rewards_transactions FROM anon, authenticated;
REVOKE ALL ON public.redemption_requests FROM anon, authenticated;
REVOKE ALL ON public.organizations FROM anon, authenticated;
REVOKE ALL ON public.staff_schedules FROM anon, authenticated;
REVOKE ALL ON public.schedule_uploads FROM anon, authenticated;
REVOKE ALL ON public.guest_reviews FROM anon, authenticated;
REVOKE ALL ON public.google_reviews FROM anon, authenticated;
REVOKE ALL ON public.game_scores FROM anon, authenticated;
REVOKE ALL ON public.word_search_scores FROM anon, authenticated;
REVOKE ALL ON public.picture_this_scores FROM anon, authenticated;
REVOKE ALL ON public.exam_results FROM anon, authenticated;
