-- s75 · Games & Leaderboards wave
--
-- 1) Five per-category game visibility flags on organizations (default ON).
--    These are DISPLAY PREFERENCES for the game surfaces (tiles / modes /
--    category tabs), honored client-side. The underlying content RPCs are
--    deliberately NOT gated: wine pairings also feed exam question generation
--    (utils/exam/questionGenerator.ts) and cocktails feed the bartender
--    assistant, so hiding a game category must not silently empty those.
-- 2) get_org grows the five flags (RETURNS TABLE change => drop + recreate).
-- 3) set_org_game_category_flag — whitelisted writer, manager/owner gate.
-- 4) get_my_game_summary — hub player card: overall total, rank, board size
--    (mirrors get_master_leaderboard_overall: completed rows, org-scoped,
--    test users excluded from the ranked board) + per-game totals/counts.
-- 5) get_game_category_board — top-N for one game category, merged across
--    play modes (memory/word_search: best single score; picture_this: total,
--    matching each game's existing board semantics), test users excluded.
-- 6) get_my_game_category_stats — the actor's own per-category line.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS games_show_wine_pairings boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS games_show_cocktails     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS games_show_ws_libations  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS games_show_pt_libations  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS games_show_pt_wine       boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.get_org(uuid);
CREATE FUNCTION public.get_org(p_actor_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, logo_url text, address text, city text, state text, zip text, latitude numeric, longitude numeric, weather_location text, google_maps_query text, reward_currency_name text, join_code text, allow_self_signup boolean, menu_count integer, menu_1_name text, menu_2_name text, default_password text, owner_id uuid, menu_1_icon text, menu_2_icon text, header_icon text, menu_category_scope text, games_use_sample_data boolean, staff_can_view_roster boolean, games_show_wine_pairings boolean, games_show_cocktails boolean, games_show_ws_libations boolean, games_show_pt_libations boolean, games_show_pt_wine boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.id, o.name, o.slug, o.logo_url, o.address, o.city, o.state, o.zip, o.latitude,
           o.longitude, o.weather_location, o.google_maps_query, o.reward_currency_name,
           o.join_code, o.allow_self_signup, o.menu_count, o.menu_1_name, o.menu_2_name,
           o.default_password, o.owner_id, o.menu_1_icon, o.menu_2_icon, o.header_icon,
           o.menu_category_scope, o.games_use_sample_data, o.staff_can_view_roster,
           o.games_show_wine_pairings, o.games_show_cocktails, o.games_show_ws_libations,
           o.games_show_pt_libations, o.games_show_pt_wine
      FROM public.organizations o
     WHERE o.id = v_org;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_org(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_org_game_category_flag(p_actor_id uuid, p_flag text, p_value boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RETURN json_build_object('success', false, 'error', 'Only managers or owners can change game settings');
  END IF;
  IF p_value IS NULL OR p_flag IS NULL OR p_flag NOT IN
     ('games_show_wine_pairings','games_show_cocktails','games_show_ws_libations','games_show_pt_libations','games_show_pt_wine') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid value');
  END IF;
  UPDATE public.organizations SET
    games_show_wine_pairings = CASE WHEN p_flag = 'games_show_wine_pairings' THEN p_value ELSE games_show_wine_pairings END,
    games_show_cocktails     = CASE WHEN p_flag = 'games_show_cocktails'     THEN p_value ELSE games_show_cocktails END,
    games_show_ws_libations  = CASE WHEN p_flag = 'games_show_ws_libations'  THEN p_value ELSE games_show_ws_libations END,
    games_show_pt_libations  = CASE WHEN p_flag = 'games_show_pt_libations'  THEN p_value ELSE games_show_pt_libations END,
    games_show_pt_wine       = CASE WHEN p_flag = 'games_show_pt_wine'       THEN p_value ELSE games_show_pt_wine END,
    updated_at = now()
  WHERE id = v_org;
  RETURN json_build_object('success', true, 'flag', p_flag, 'value', p_value);
END; $function$;
GRANT EXECUTE ON FUNCTION public.set_org_game_category_flag(uuid, text, boolean) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_game_summary(p_actor_id uuid)
 RETURNS TABLE(total_score bigint, overall_rank integer, players_total integer,
               memory_score bigint, memory_games bigint,
               word_search_score bigint, word_search_games bigint,
               picture_this_score bigint, picture_this_games bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY
  WITH combined AS (
    SELECT gs.user_id AS uid, gs.score AS sc, 'memory'::text AS g
      FROM public.game_scores gs
     WHERE gs.completed = TRUE AND gs.organization_id = v_org
    UNION ALL
    SELECT ws.user_id, ws.score, 'word_search'
      FROM public.word_search_scores ws
     WHERE ws.completed = TRUE AND ws.organization_id = v_org
    UNION ALL
    SELECT pts.user_id, pts.score, 'picture_this'
      FROM public.picture_this_scores pts
     WHERE pts.completed = TRUE AND pts.organization_id = v_org
  ), ranked AS (
    SELECT c.uid, SUM(c.sc)::bigint AS tot,
           RANK() OVER (ORDER BY SUM(c.sc) DESC) AS rk
      FROM combined c
      JOIN public.users u ON u.id = c.uid
     WHERE u.is_test_user = FALSE
     GROUP BY c.uid
  ), mine AS (
    SELECT COALESCE(SUM(c.sc), 0)::bigint AS all_s,
           COALESCE(SUM(c.sc) FILTER (WHERE c.g = 'memory'), 0)::bigint AS m_s,
           COALESCE(COUNT(*)  FILTER (WHERE c.g = 'memory'), 0)::bigint AS m_g,
           COALESCE(SUM(c.sc) FILTER (WHERE c.g = 'word_search'), 0)::bigint AS w_s,
           COALESCE(COUNT(*)  FILTER (WHERE c.g = 'word_search'), 0)::bigint AS w_g,
           COALESCE(SUM(c.sc) FILTER (WHERE c.g = 'picture_this'), 0)::bigint AS p_s,
           COALESCE(COUNT(*)  FILTER (WHERE c.g = 'picture_this'), 0)::bigint AS p_g
      FROM combined c
     WHERE c.uid = p_actor_id
  )
  SELECT m.all_s,
         (SELECT r.rk FROM ranked r WHERE r.uid = p_actor_id)::integer,
         (SELECT COUNT(*) FROM ranked)::integer,
         m.m_s, m.m_g, m.w_s, m.w_g, m.p_s, m.p_g
    FROM mine m;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_my_game_summary(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_game_category_board(p_actor_id uuid, p_game text, p_category text, p_limit integer DEFAULT 3)
 RETURNS TABLE(user_id uuid, name text, profile_picture_url text, score bigint, games_played bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  IF p_game = 'memory' THEN
    RETURN QUERY
      SELECT gs.user_id, u.name, u.profile_picture_url, MAX(gs.score)::bigint, COUNT(*)::bigint
        FROM public.game_scores gs
        JOIN public.users u ON u.id = gs.user_id
       WHERE gs.completed = TRUE AND gs.organization_id = v_org
         AND gs.game_mode = p_category AND u.is_test_user = FALSE
       GROUP BY gs.user_id, u.name, u.profile_picture_url
       ORDER BY MAX(gs.score) DESC
       LIMIT p_limit;
  ELSIF p_game = 'word_search' THEN
    RETURN QUERY
      SELECT ws.user_id, u.name, u.profile_picture_url, MAX(ws.score)::bigint, COUNT(*)::bigint
        FROM public.word_search_scores ws
        JOIN public.users u ON u.id = ws.user_id
       WHERE ws.completed = TRUE AND ws.organization_id = v_org
         AND ws.category = p_category AND u.is_test_user = FALSE
       GROUP BY ws.user_id, u.name, u.profile_picture_url
       ORDER BY MAX(ws.score) DESC
       LIMIT p_limit;
  ELSIF p_game = 'picture_this' THEN
    RETURN QUERY
      SELECT pts.user_id, u.name, u.profile_picture_url, SUM(pts.score)::bigint, COUNT(*)::bigint
        FROM public.picture_this_scores pts
        JOIN public.users u ON u.id = pts.user_id
       WHERE pts.completed = TRUE AND pts.organization_id = v_org
         AND pts.category = p_category AND u.is_test_user = FALSE
       GROUP BY pts.user_id, u.name, u.profile_picture_url
       ORDER BY SUM(pts.score) DESC
       LIMIT p_limit;
  END IF;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_game_category_board(uuid, text, text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_game_category_stats(p_actor_id uuid, p_game text)
 RETURNS TABLE(category text, score bigint, games_played bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  IF p_game = 'memory' THEN
    RETURN QUERY
      SELECT gs.game_mode, MAX(gs.score)::bigint, COUNT(*)::bigint
        FROM public.game_scores gs
       WHERE gs.completed = TRUE AND gs.organization_id = v_org AND gs.user_id = p_actor_id
       GROUP BY gs.game_mode;
  ELSIF p_game = 'word_search' THEN
    RETURN QUERY
      SELECT ws.category, MAX(ws.score)::bigint, COUNT(*)::bigint
        FROM public.word_search_scores ws
       WHERE ws.completed = TRUE AND ws.organization_id = v_org AND ws.user_id = p_actor_id
       GROUP BY ws.category;
  ELSIF p_game = 'picture_this' THEN
    RETURN QUERY
      SELECT pts.category, SUM(pts.score)::bigint, COUNT(*)::bigint
        FROM public.picture_this_scores pts
       WHERE pts.completed = TRUE AND pts.organization_id = v_org AND pts.user_id = p_actor_id
       GROUP BY pts.category;
  END IF;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_my_game_category_stats(uuid, text) TO anon, authenticated, service_role;
