-- Session 20 hotfix: per-mode + per-category Picture This! leaderboard.
-- Used by the Picture This! game-specific leaderboard screen so players can
-- see Lives vs Timed standings inside each category. Master leaderboard
-- still uses get_master_leaderboard_picture_this (totals across everything).

CREATE OR REPLACE FUNCTION public.get_picture_this_leaderboard_filtered(
  p_category TEXT DEFAULT NULL,
  p_play_mode TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
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
    AND (p_category IS NULL OR pts.category = p_category)
    AND (p_play_mode IS NULL OR pts.play_mode = p_play_mode)
  GROUP BY pts.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_picture_this_leaderboard_filtered(TEXT, TEXT, INTEGER) TO authenticated, anon;
