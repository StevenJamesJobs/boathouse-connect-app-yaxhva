-- S50 corrective (2026-07-21): the live application of 20260721107000 initially
-- ran REVOKE ... FROM anon, authenticated, which was a NO-OP for these 29
-- legacy sigs — they are reachable via the implicit PUBLIC EXECUTE grant that
-- CREATE FUNCTION adds, not through explicit role grants. This migration
-- revokes EXECUTE FROM PUBLIC to actually close them. (The repo copy of 107000
-- was subsequently corrected to include PUBLIC, so a fresh replay of 107000
-- alone is already complete; this file is idempotent and harmless on replay.)
-- Verified after apply: 0/29 anon-executable, 0/29 authenticated-executable;
-- live *_actor + app RPCs (login_user, *_scores_actor, get_master_leaderboard
-- *_actor) still anon-executable via their explicit grants.
REVOKE EXECUTE ON FUNCTION public.update_announcement_translations(uuid,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_special_feature_translations(uuid,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_upcoming_event_translations(uuid,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_menu_item_translations(uuid,text,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_menu_category_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_menu_subcategory_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_guide_translations(uuid,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_libation_recipe_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_summer_libation_recipe_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_cocktail_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_puree_syrup_recipe_translations(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_game_scores(text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_word_search_scores(text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_picture_this_scores(text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_org_cocktails(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.materialize_org_per_menu_categories(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_overall(integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_memory(integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_word_search(integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_master_leaderboard_picture_this(integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_game_leaderboard(text,integer,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_word_search_leaderboard(text,integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_picture_this_leaderboard_filtered(text,text,integer,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_exam_completion_status(uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_expired_exams(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organization_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initialize_org_trial(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_org_trial(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_job_title_assistants(uuid) FROM PUBLIC;
