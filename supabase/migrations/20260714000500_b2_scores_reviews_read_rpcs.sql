-- Batch B2 (scores/reviews cluster) — additive READ RPCs for guest_reviews, google_reviews,
-- the three game-score tables, and the last direct exam_results read. All org-derived from
-- the actor; SECURITY DEFINER, search_path pinned, EXECUTE to anon+authenticated.
--   • get_org_guest_reviews   — member; active-only (matches the old is_active SELECT policy)
--   • get_org_google_reviews  — member sees published; unpublished only for manager/owner
--   • get_my_game_stats       — self per-mode aggregates (menu-memory-game stats)
--   • get_org_game_totals     — manager; per-user totals across all 3 games in ONE call
--   • get_org_exam_activity   — manager; recent completions for the manage activity feed

CREATE OR REPLACE FUNCTION public.get_org_guest_reviews(p_actor_id uuid)
RETURNS TABLE(
  id uuid, guest_name text, rating integer, review_text text, review_date date,
  display_order integer, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.guest_name, r.rating, r.review_text, r.review_date,
           r.display_order, r.is_active
      FROM public.guest_reviews r
     WHERE r.organization_id = v_org
       AND r.is_active = true
     ORDER BY r.display_order, r.review_date DESC;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_google_reviews(
  p_actor_id uuid, p_include_unpublished boolean DEFAULT false, p_limit integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, author_title text, author_image text, review_rating integer, review_text text,
  review_text_es text, review_datetime_utc timestamptz, owner_answer text,
  owner_answer_es text, is_published boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_show_all boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_show_all := COALESCE(p_include_unpublished, false) AND v_role IN ('manager','owner');
  RETURN QUERY
    SELECT g.id, g.author_title, g.author_image, g.review_rating, g.review_text,
           g.review_text_es, g.review_datetime_utc, g.owner_answer, g.owner_answer_es,
           g.is_published
      FROM public.google_reviews g
     WHERE g.organization_id = v_org
       AND (v_show_all OR g.is_published = true)
     ORDER BY g.review_datetime_utc DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_game_stats(p_actor_id uuid)
RETURNS TABLE(game_mode text, best_score integer, games_played bigint, highest_completed_difficulty integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN QUERY
    SELECT s.game_mode, max(s.score), count(*),
           COALESCE(max(s.difficulty) FILTER (WHERE s.completed), 0)
      FROM public.game_scores s
     WHERE s.user_id = p_actor_id
     GROUP BY s.game_mode;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_game_totals(p_actor_id uuid)
RETURNS TABLE(
  user_id uuid, memory_score bigint, memory_games bigint, word_search_score bigint,
  word_search_games bigint, picture_this_score bigint, picture_this_games bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view game totals';
  END IF;
  RETURN QUERY
    SELECT u.id,
           COALESCE(m.sc, 0), COALESCE(m.n, 0),
           COALESCE(w.sc, 0), COALESCE(w.n, 0),
           COALESCE(p.sc, 0), COALESCE(p.n, 0)
      FROM public.users u
      LEFT JOIN (SELECT g.user_id AS uid, sum(g.score) AS sc, count(*) AS n
                   FROM public.game_scores g WHERE g.completed GROUP BY g.user_id) m ON m.uid = u.id
      LEFT JOIN (SELECT g.user_id AS uid, sum(g.score) AS sc, count(*) AS n
                   FROM public.word_search_scores g WHERE g.completed GROUP BY g.user_id) w ON w.uid = u.id
      LEFT JOIN (SELECT g.user_id AS uid, sum(g.score) AS sc, count(*) AS n
                   FROM public.picture_this_scores g WHERE g.completed GROUP BY g.user_id) p ON p.uid = u.id
     WHERE u.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_exam_activity(p_actor_id uuid, p_since timestamptz)
RETURNS TABLE(id uuid, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view exam activity';
  END IF;
  RETURN QUERY
    SELECT e.id, e.completed_at
      FROM public.exam_results e
     WHERE e.organization_id = v_org
       AND e.completed_at IS NOT NULL
       AND e.completed_at >= p_since;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_org_guest_reviews(uuid)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_google_reviews(uuid, boolean, integer)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_game_stats(uuid)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_game_totals(uuid)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_exam_activity(uuid, timestamptz)        TO anon, authenticated;
