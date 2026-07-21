-- S50 B5 teardown (2026-07-21): REVOKE EXECUTE on the 29 superseded legacy
-- function signatures. Every one has a *_actor replacement (sessions 47-48)
-- that the next build calls; the legacy sigs were kept only for pre-teardown
-- clients, which are dead by design now. Functions are REVOKEd (not dropped) —
-- B8 decides drops. KEEPS anon-callable: verify_password (throttled),
-- get_user_total_game_score / get_passed_users_on_leaderboard (p_user_id trust
-- class -> identity phase).
--
-- MUST revoke from PUBLIC, not just anon/authenticated: CREATE FUNCTION adds an
-- implicit GRANT EXECUTE TO PUBLIC, and these sigs never had explicit
-- anon/authenticated grants — they were reachable purely through PUBLIC. The
-- explicit anon/authenticated revoke is kept for completeness/idempotence.
-- (The live *_actor + app RPCs carry explicit anon/authenticated grants, so
-- revoking PUBLIC does not affect them.)
-- ROLLBACK: session50_manifests/restore_function_grants.sql (re-GRANTs to
-- anon/authenticated explicitly — equivalent access, cleaner ACL).

-- 11 no-actor update_*_translations
REVOKE EXECUTE ON FUNCTION public.update_announcement_translations(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_special_feature_translations(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_upcoming_event_translations(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_menu_item_translations(uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_menu_category_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_menu_subcategory_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_guide_translations(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_libation_recipe_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_summer_libation_recipe_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_cocktail_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_puree_syrup_recipe_translations(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
-- 5 destructive/seed legacy sigs (NULL-org = global effects)
REVOKE EXECUTE ON FUNCTION public.reset_game_scores(text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_word_search_scores(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_picture_this_scores(text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_org_cocktails(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_org_per_menu_categories(uuid) FROM PUBLIC, anon, authenticated;
-- 7 legacy leaderboard sigs (NULL org = cross-org reads)
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_overall(integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_memory(integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_word_search(integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_picture_this(integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_game_leaderboard(text,integer,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_word_search_leaderboard(text,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_picture_this_leaderboard_filtered(text,text,integer,uuid) FROM PUBLIC, anon, authenticated;
-- 2 exam legacy sigs
REVOKE EXECUTE ON FUNCTION public.get_exam_completion_status(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_expired_exams(uuid) FROM PUBLIC, anon, authenticated;
-- 3 legacy subscription sigs
REVOKE EXECUTE ON FUNCTION public.get_organization_subscription(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_org_trial(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_org_trial(uuid) FROM PUBLIC, anon, authenticated;
-- 1 unpinned legacy seed sig
REVOKE EXECUTE ON FUNCTION public.seed_default_job_title_assistants(uuid) FROM PUBLIC, anon, authenticated;
