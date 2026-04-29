-- Session 20: Picture This! game
--
-- Adds:
--   1. users.is_test_user flag (excluded from ALL game leaderboards + pass notifications)
--   2. picture_this_scores table + RLS + indexes
--   3. get_master_leaderboard_picture_this RPC
--   4. reset_picture_this_scores RPC
--   5. set_user_test_flag RPC (manager toggle)
--   6. Recreates existing leaderboard + pass-notification RPCs to:
--        - filter out test users
--        - include picture_this_scores in totals/UNIONs

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Test user flag
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_test_user
  ON users(is_test_user) WHERE is_test_user = TRUE;

-- Manager-only toggle. Idempotent: simply sets the flag to the given value.
CREATE OR REPLACE FUNCTION public.set_user_test_flag(
  p_user_id UUID,
  p_is_test BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE users SET is_test_user = p_is_test WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_test_flag(UUID, BOOLEAN) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Picture This score table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS picture_this_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('food','libations','wine','menu_prices')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard','only')),
  play_mode TEXT NOT NULL CHECK (play_mode IN ('lives','timed')),
  score INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  questions_total INTEGER NOT NULL DEFAULT 0,
  bonus_points INTEGER NOT NULL DEFAULT 0,
  time_seconds INTEGER,
  lives_remaining INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_picture_this_scores_user ON picture_this_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_picture_this_scores_category ON picture_this_scores(category, difficulty);
CREATE INDEX IF NOT EXISTS idx_picture_this_scores_score ON picture_this_scores(score DESC);

ALTER TABLE picture_this_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picture_this_scores_select_all" ON picture_this_scores
  FOR SELECT TO public USING (true);

CREATE POLICY "picture_this_scores_insert_all" ON picture_this_scores
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "picture_this_scores_delete_all" ON picture_this_scores
  FOR DELETE TO public USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Picture This game-specific leaderboard
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_master_leaderboard_picture_this(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pts.user_id,
    u.name,
    u.profile_picture_url,
    SUM(pts.score)::BIGINT AS total_score,
    COUNT(*)::BIGINT AS games_played
  FROM picture_this_scores pts
  JOIN users u ON u.id = pts.user_id
  WHERE pts.completed = TRUE
    AND u.is_test_user = FALSE
  GROUP BY pts.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_master_leaderboard_picture_this(INTEGER) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Reset RPC (per category + difficulty + global)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_picture_this_scores(
  p_category TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM picture_this_scores
  WHERE (p_category IS NULL OR category = p_category)
    AND (p_difficulty IS NULL OR difficulty = p_difficulty);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_picture_this_scores(TEXT, TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Update existing master leaderboard RPCs:
--    - exclude test users
--    - include picture_this_scores in overall total
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_master_leaderboard_overall(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH combined AS (
    SELECT gs.user_id, gs.score FROM game_scores gs WHERE gs.completed = TRUE
    UNION ALL
    SELECT ws.user_id, ws.score FROM word_search_scores ws WHERE ws.completed = TRUE
    UNION ALL
    SELECT pts.user_id, pts.score FROM picture_this_scores pts WHERE pts.completed = TRUE
  )
  SELECT
    c.user_id,
    u.name,
    u.profile_picture_url,
    SUM(c.score)::BIGINT AS total_score,
    COUNT(*)::BIGINT AS games_played
  FROM combined c
  JOIN users u ON u.id = c.user_id
  WHERE u.is_test_user = FALSE
  GROUP BY c.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_memory(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.user_id,
    u.name,
    u.profile_picture_url,
    SUM(gs.score)::BIGINT AS total_score,
    COUNT(*)::BIGINT AS games_played
  FROM game_scores gs
  JOIN users u ON u.id = gs.user_id
  WHERE gs.completed = TRUE
    AND u.is_test_user = FALSE
  GROUP BY gs.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_word_search(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ws.user_id,
    u.name,
    u.profile_picture_url,
    SUM(ws.score)::BIGINT AS total_score,
    COUNT(*)::BIGINT AS games_played
  FROM word_search_scores ws
  JOIN users u ON u.id = ws.user_id
  WHERE ws.completed = TRUE
    AND u.is_test_user = FALSE
  GROUP BY ws.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

-- Single user total game score also needs picture_this_scores included
CREATE OR REPLACE FUNCTION public.get_user_total_game_score(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total BIGINT;
BEGIN
  SELECT COALESCE(SUM(score), 0) INTO total
  FROM (
    SELECT score FROM game_scores WHERE user_id = p_user_id AND completed = TRUE
    UNION ALL
    SELECT score FROM word_search_scores WHERE user_id = p_user_id AND completed = TRUE
    UNION ALL
    SELECT score FROM picture_this_scores WHERE user_id = p_user_id AND completed = TRUE
  ) combined;
  RETURN total;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Recreate get_passed_users_on_leaderboard to:
--    - include picture_this_scores in totals
--    - skip if the player themselves is a test user (no phantom passes)
--    - exclude test users from candidates
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_passed_users_on_leaderboard(
  p_user_id UUID,
  p_new_score BIGINT
)
RETURNS TABLE(user_id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_total BIGINT;
  v_old_total BIGINT;
  v_player_is_test BOOLEAN;
BEGIN
  SELECT COALESCE(is_test_user, FALSE) INTO v_player_is_test FROM users WHERE id = p_user_id;
  IF v_player_is_test THEN
    RETURN; -- test users never trigger pass notifications
  END IF;

  SELECT COALESCE(SUM(score), 0)::BIGINT INTO v_new_total
  FROM (
    SELECT gs.score FROM game_scores gs
      WHERE gs.user_id = p_user_id AND gs.completed = TRUE
    UNION ALL
    SELECT ws.score FROM word_search_scores ws
      WHERE ws.user_id = p_user_id AND ws.completed = TRUE
    UNION ALL
    SELECT pts.score FROM picture_this_scores pts
      WHERE pts.user_id = p_user_id AND pts.completed = TRUE
  ) s;

  v_old_total := v_new_total - p_new_score;

  RETURN QUERY
  WITH all_totals AS (
    SELECT t.user_id, SUM(t.score)::BIGINT AS total
    FROM (
      SELECT gs.user_id, gs.score FROM game_scores gs WHERE gs.completed = TRUE
      UNION ALL
      SELECT ws.user_id, ws.score FROM word_search_scores ws WHERE ws.completed = TRUE
      UNION ALL
      SELECT pts.user_id, pts.score FROM picture_this_scores pts WHERE pts.completed = TRUE
    ) t
    GROUP BY t.user_id
  )
  SELECT at.user_id, u.name
  FROM all_totals at
  JOIN users u ON u.id = at.user_id
  LEFT JOIN notification_preferences np ON np.user_id = at.user_id
  WHERE at.user_id <> p_user_id
    AND at.total > v_old_total
    AND at.total < v_new_total
    AND u.is_test_user = FALSE
    AND COALESCE(np.game_hub_enabled, TRUE) = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_passed_users_on_leaderboard(UUID, BIGINT) TO authenticated;
