-- Batch B3 (scores/reviews cluster) — gated WRITE RPCs. Score submits are SELF-only (the
-- player is the actor; org derived — closes the forge-any-score / wipe-any-leaderboard hole).
-- Review writes and score resets are manager/owner-gated, same-org enforced.
-- set_google_review_published flips ONLY is_published — what the old wide-open UPDATE
-- policy's name always pretended. Deeper score anti-cheat (server-computed scores) → B5.
-- Additive: nothing calls these yet; public policies untouched (teardown).

CREATE OR REPLACE FUNCTION public.submit_memory_game_score(
  p_actor_id uuid, p_game_mode text, p_play_mode text, p_difficulty integer, p_score integer,
  p_time_seconds integer DEFAULT NULL, p_pairs_matched integer DEFAULT 0,
  p_total_pairs integer DEFAULT 0, p_lives_remaining integer DEFAULT 0,
  p_completed boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Unknown user'; END IF;
  IF COALESCE(p_score, -1) < 0 OR btrim(COALESCE(p_game_mode, '')) = '' OR btrim(COALESCE(p_play_mode, '')) = '' THEN
    RAISE EXCEPTION 'Invalid score submission';
  END IF;
  INSERT INTO public.game_scores
    (user_id, organization_id, game_mode, play_mode, difficulty, score, time_seconds,
     pairs_matched, total_pairs, lives_remaining, completed)
  VALUES
    (p_actor_id, v_org, p_game_mode, p_play_mode, COALESCE(p_difficulty, 1), p_score,
     p_time_seconds, COALESCE(p_pairs_matched, 0), COALESCE(p_total_pairs, 0),
     COALESCE(p_lives_remaining, 0), COALESCE(p_completed, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.submit_word_search_score(
  p_actor_id uuid, p_category text, p_difficulty text, p_play_mode text, p_score integer,
  p_words_found integer DEFAULT 0, p_total_words integer DEFAULT 0,
  p_time_seconds integer DEFAULT 0, p_completed boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Unknown user'; END IF;
  IF COALESCE(p_score, -1) < 0 OR btrim(COALESCE(p_category, '')) = '' OR btrim(COALESCE(p_play_mode, '')) = '' THEN
    RAISE EXCEPTION 'Invalid score submission';
  END IF;
  INSERT INTO public.word_search_scores
    (user_id, organization_id, category, difficulty, play_mode, score, words_found,
     total_words, time_seconds, completed)
  VALUES
    (p_actor_id, v_org, p_category, COALESCE(p_difficulty, ''), p_play_mode, p_score,
     COALESCE(p_words_found, 0), COALESCE(p_total_words, 0), COALESCE(p_time_seconds, 0),
     COALESCE(p_completed, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.submit_picture_this_score(
  p_actor_id uuid, p_category text, p_difficulty text, p_play_mode text, p_score integer,
  p_questions_correct integer DEFAULT 0, p_questions_total integer DEFAULT 0,
  p_bonus_points integer DEFAULT 0, p_time_seconds integer DEFAULT NULL,
  p_lives_remaining integer DEFAULT 0, p_completed boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Unknown user'; END IF;
  IF COALESCE(p_score, -1) < 0 OR btrim(COALESCE(p_category, '')) = '' OR btrim(COALESCE(p_play_mode, '')) = '' THEN
    RAISE EXCEPTION 'Invalid score submission';
  END IF;
  INSERT INTO public.picture_this_scores
    (user_id, organization_id, category, difficulty, play_mode, score, questions_correct,
     questions_total, bonus_points, time_seconds, lives_remaining, completed)
  VALUES
    (p_actor_id, v_org, p_category, COALESCE(p_difficulty, ''), p_play_mode, p_score,
     COALESCE(p_questions_correct, 0), COALESCE(p_questions_total, 0),
     COALESCE(p_bonus_points, 0), p_time_seconds, COALESCE(p_lives_remaining, 0),
     COALESCE(p_completed, true))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.reset_user_game_scores(p_actor_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_target_org uuid; v_m int; v_w int; v_p int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reset game scores';
  END IF;
  SELECT u.organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Cannot reset scores for a user in another organization';
  END IF;

  DELETE FROM public.game_scores g WHERE g.user_id = p_user_id;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  DELETE FROM public.word_search_scores g WHERE g.user_id = p_user_id;
  GET DIAGNOSTICS v_w = ROW_COUNT;
  DELETE FROM public.picture_this_scores g WHERE g.user_id = p_user_id;
  GET DIAGNOSTICS v_p = ROW_COUNT;

  RETURN json_build_object('success', true, 'memory_deleted', v_m,
                           'word_search_deleted', v_w, 'picture_this_deleted', v_p);
END; $function$;

CREATE OR REPLACE FUNCTION public.upsert_guest_review(
  p_actor_id uuid, p_guest_name text, p_rating integer, p_review_text text,
  p_review_date date, p_display_order integer DEFAULT NULL, p_review_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage guest reviews';
  END IF;
  IF btrim(COALESCE(p_guest_name, '')) = '' OR btrim(COALESCE(p_review_text, '')) = '' THEN
    RAISE EXCEPTION 'Guest name and review text are required';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  IF p_review_id IS NULL THEN
    INSERT INTO public.guest_reviews
      (organization_id, guest_name, rating, review_text, review_date, display_order,
       is_active, created_by)
    VALUES
      (v_org, btrim(p_guest_name), p_rating, p_review_text, p_review_date,
       p_display_order, true, p_actor_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.guest_reviews r
       SET guest_name = btrim(p_guest_name), rating = p_rating, review_text = p_review_text,
           review_date = p_review_date, display_order = p_display_order, updated_at = now()
     WHERE r.id = p_review_id AND r.organization_id = v_org
     RETURNING r.id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Review not found';
    END IF;
  END IF;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_guest_review(p_actor_id uuid, p_review_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage guest reviews';
  END IF;
  DELETE FROM public.guest_reviews r WHERE r.id = p_review_id AND r.organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_google_review_published(
  p_actor_id uuid, p_review_id uuid, p_published boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can publish reviews';
  END IF;
  IF p_published IS NULL THEN
    RAISE EXCEPTION 'Invalid value';
  END IF;
  UPDATE public.google_reviews g
     SET is_published = p_published, updated_at = now()
   WHERE g.id = p_review_id AND g.organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public.submit_memory_game_score(uuid, text, text, integer, integer, integer, integer, integer, integer, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_word_search_score(uuid, text, text, text, integer, integer, integer, integer, boolean)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_picture_this_score(uuid, text, text, text, integer, integer, integer, integer, integer, integer, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_game_scores(uuid, uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_guest_review(uuid, text, integer, text, date, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_review(uuid, uuid)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_google_review_published(uuid, uuid, boolean) TO anon, authenticated;
