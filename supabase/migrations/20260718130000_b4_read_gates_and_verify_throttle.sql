-- B4 Batch 6 (2026-07-18, session 48 continuation): gate the remaining
-- ungated org-param reads + throttle verify_password.
--
-- Verified via prosrc: the 4 master-leaderboard fns, get_game_leaderboard,
-- get_word_search_leaderboard and get_picture_this_leaderboard_filtered all
-- treat p_organization_id NULL as "every org" — anon could read all orgs'
-- employee names/photos/scores. get_exam_completion_status leaks employee quiz
-- completion cross-org the same way. close_expired_exams(NULL) runs globally
-- (benign housekeeping, gated anyway for symmetry). verify_password was a bare
-- per-uuid crypt check with NO throttle — online brute force against any
-- user's password. Fixes: distinctly-named *_actor wrappers (org ALWAYS
-- derived from the actor via helpers; leaderboards member-gated; exam status
-- mgr/owner) + verify_password re-created same-sig with the login throttle
-- (per-target 'vp:' key + the SHARED 'ip:' pool, so password guessing counts
-- against the same IP budget as login). Legacy sigs kept for shipped builds →
-- teardown REVOKE list. get_user_total_game_score /
-- get_passed_users_on_leaderboard stay as-is (p_user_id trust class, same as
-- get_me — documented).
--
-- ROLLBACK:
--   DROP FUNCTION public.get_master_leaderboard_overall_actor(uuid, integer);
--   DROP FUNCTION public.get_master_leaderboard_memory_actor(uuid, integer);
--   DROP FUNCTION public.get_master_leaderboard_word_search_actor(uuid, integer);
--   DROP FUNCTION public.get_master_leaderboard_picture_this_actor(uuid, integer);
--   DROP FUNCTION public.get_game_leaderboard_actor(uuid, text, integer, text);
--   DROP FUNCTION public.get_word_search_leaderboard_actor(uuid, text, integer);
--   DROP FUNCTION public.get_picture_this_leaderboard_filtered_actor(uuid, text, text, integer);
--   DROP FUNCTION public.get_exam_completion_status_actor(uuid, uuid, text);
--   DROP FUNCTION public.close_expired_exams_actor(uuid);
--   DROP FUNCTION public._require_member(uuid);
--   -- verify_password: recreate the pre-throttle definition (bare crypt check).

-- Any active member with an org → org id; RAISE otherwise. Not client-callable.
CREATE OR REPLACE FUNCTION public._require_member(p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_org uuid; v_active boolean;
BEGIN
  SELECT u.organization_id, u.is_active INTO v_org, v_active
  FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION public._require_member(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_overall_actor(
  p_actor_id uuid, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_master_leaderboard_overall(p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_memory_actor(
  p_actor_id uuid, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_master_leaderboard_memory(p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_word_search_actor(
  p_actor_id uuid, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_master_leaderboard_word_search(p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_picture_this_actor(
  p_actor_id uuid, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_master_leaderboard_picture_this(p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_game_leaderboard_actor(
  p_actor_id uuid, p_game_mode text, p_limit integer DEFAULT 20, p_play_mode text DEFAULT 'lives'
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, best_score integer, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_game_leaderboard(p_game_mode, p_limit, p_play_mode, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_word_search_leaderboard_actor(
  p_actor_id uuid, p_category text, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, best_score integer, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_word_search_leaderboard(p_category, p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_picture_this_leaderboard_filtered_actor(
  p_actor_id uuid, p_category text DEFAULT NULL, p_play_mode text DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_picture_this_leaderboard_filtered(p_category, p_play_mode, p_limit, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_exam_completion_status_actor(
  p_actor_id uuid, p_exam_id uuid, p_exam_type text
) RETURNS TABLE(user_id uuid, name text, profile_picture_url text, job_title text, has_completed boolean, correct_count integer, total_questions integer, bucks_awarded integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  RETURN QUERY SELECT * FROM public.get_exam_completion_status(p_exam_id, p_exam_type, v_org);
END $$;

CREATE OR REPLACE FUNCTION public.close_expired_exams_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_member(p_actor_id);
  PERFORM public.close_expired_exams(v_org);
END $$;

-- verify_password: same signature, now throttled (failures only; success clears
-- the per-target key). Shares the 'ip:' pool with login_user.
CREATE OR REPLACE FUNCTION public.verify_password(user_id uuid, password text, p_organization_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE stored_hash TEXT; v_key text; v_ip text; v_ok boolean;
BEGIN
  v_key := 'vp:' || user_id;
  v_ip  := public._request_ip();
  PERFORM public._throttle_check(v_key);
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ip:' || v_ip);
  END IF;

  SELECT password_hash INTO stored_hash FROM public.users u WHERE u.id = user_id;
  IF stored_hash IS NULL THEN
    v_ok := FALSE;
  ELSE
    v_ok := stored_hash = crypt(password, stored_hash);
  END IF;

  IF v_ok THEN
    PERFORM public._throttle_clear(v_key);
  ELSE
    PERFORM public._throttle_fail(v_key, 5, interval '15 minutes', interval '10 minutes');
    IF v_ip IS NOT NULL THEN
      PERFORM public._throttle_fail('ip:' || v_ip, 50, interval '15 minutes', interval '15 minutes');
    END IF;
  END IF;
  RETURN v_ok;
END $$;
