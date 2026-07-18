-- B4 Batch 3 (2026-07-18, session 48): actor-gate the remaining ungated
-- destructive org-scoped fns (verified via pg_proc.prosrc):
--   reset_game_scores / reset_word_search_scores / reset_picture_this_scores —
--     NULL org = wipe EVERY org's leaderboards, callable by anon;
--   seed_org_cocktails — anon could copy cocktails between arbitrary orgs;
--   materialize_org_per_menu_categories — anon could insert category rows into
--     any org.
-- Adds distinctly-NAMED *_actor versions (org ALWAYS derived from the actor,
-- never NULL/global): resets = manager/owner; seed + materialize = owner role.
-- The _actor fns delegate to the legacy bodies with the org forced, keeping one
-- source of truth. Legacy sigs KEPT for shipped builds (pinned here) → REVOKE
-- at the adoption-gated teardown. close_expired_exams (benign housekeeping) and
-- get_exam_completion_status (read) stay ungated — documented for B5.
--
-- ROLLBACK:
--   DROP FUNCTION public.reset_game_scores_actor(uuid, text, text);
--   DROP FUNCTION public.reset_word_search_scores_actor(uuid, text);
--   DROP FUNCTION public.reset_picture_this_scores_actor(uuid, text, text);
--   DROP FUNCTION public.seed_org_cocktails_actor(uuid, uuid);
--   DROP FUNCTION public.materialize_org_per_menu_categories_actor(uuid);
--   DROP FUNCTION public._require_owner_role(uuid);
--   ALTER FUNCTION public.reset_game_scores(text, text, uuid) RESET search_path;
--   ALTER FUNCTION public.reset_word_search_scores(text, uuid) RESET search_path;
--   ALTER FUNCTION public.materialize_org_per_menu_categories(uuid) RESET search_path;
--   ALTER FUNCTION public.close_expired_exams(uuid) RESET search_path;

-- Owner-role gate (role = 'owner'), same shape as _require_content_manager.
CREATE OR REPLACE FUNCTION public._require_owner_role(p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_role text; v_org uuid; v_active boolean;
BEGIN
  SELECT u.role, u.organization_id, u.is_active INTO v_role, v_org, v_active
  FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_active IS DISTINCT FROM true OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION public._require_owner_role(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_game_scores_actor(
  p_actor_id uuid, p_game_mode text DEFAULT NULL, p_play_mode text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  PERFORM public.reset_game_scores(p_game_mode, p_play_mode, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.reset_word_search_scores_actor(
  p_actor_id uuid, p_category text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  PERFORM public.reset_word_search_scores(p_category, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.reset_picture_this_scores_actor(
  p_actor_id uuid, p_category text DEFAULT NULL, p_difficulty text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  PERFORM public.reset_picture_this_scores(p_category, p_difficulty, v_org);
END $$;

-- Seed cocktails INTO the actor's own org; source bounded to own-or-sample via
-- the existing _recipe_source_org helper (same rule as the recipe read RPCs).
CREATE OR REPLACE FUNCTION public.seed_org_cocktails_actor(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid; v_source uuid;
BEGIN
  v_org := public._require_owner_role(p_actor_id);
  v_source := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_source IS NULL OR v_source = v_org THEN RETURN 0; END IF;
  RETURN public.seed_org_cocktails(v_org, v_source);
END $$;

CREATE OR REPLACE FUNCTION public.materialize_org_per_menu_categories_actor(
  p_actor_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_owner_role(p_actor_id);
  PERFORM public.materialize_org_per_menu_categories(v_org);
END $$;

-- Pin the unpinned legacy fns (picture_this + seed already pinned).
ALTER FUNCTION public.reset_game_scores(text, text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.reset_word_search_scores(text, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.materialize_org_per_menu_categories(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.close_expired_exams(uuid) SET search_path = public, extensions, pg_temp;
