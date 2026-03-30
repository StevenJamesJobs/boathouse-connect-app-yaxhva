-- Master Leaderboard RPCs for Game Hub
-- Overall leaderboard (both games combined), Memory Game totals, Word Search totals

-- Overall: total scores from both game_scores + word_search_scores
CREATE OR REPLACE FUNCTION get_master_leaderboard_overall(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH combined AS (
    SELECT gs.user_id, gs.score FROM game_scores gs WHERE gs.completed = true
    UNION ALL
    SELECT ws.user_id, ws.score FROM word_search_scores ws WHERE ws.completed = true
  )
  SELECT
    c.user_id,
    u.name,
    u.profile_picture_url,
    SUM(c.score)::BIGINT as total_score,
    COUNT(*)::BIGINT as games_played
  FROM combined c
  JOIN users u ON u.id = c.user_id
  GROUP BY c.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

-- Memory Game totals
CREATE OR REPLACE FUNCTION get_master_leaderboard_memory(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.user_id,
    u.name,
    u.profile_picture_url,
    SUM(gs.score)::BIGINT as total_score,
    COUNT(*)::BIGINT as games_played
  FROM game_scores gs
  JOIN users u ON u.id = gs.user_id
  WHERE gs.completed = true
  GROUP BY gs.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

-- Word Search totals
CREATE OR REPLACE FUNCTION get_master_leaderboard_word_search(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  total_score BIGINT,
  games_played BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ws.user_id,
    u.name,
    u.profile_picture_url,
    SUM(ws.score)::BIGINT as total_score,
    COUNT(*)::BIGINT as games_played
  FROM word_search_scores ws
  JOIN users u ON u.id = ws.user_id
  WHERE ws.completed = true
  GROUP BY ws.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$;

-- Single user total game score (for profile display)
CREATE OR REPLACE FUNCTION get_user_total_game_score(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total BIGINT;
BEGIN
  SELECT COALESCE(SUM(score), 0) INTO total
  FROM (
    SELECT score FROM game_scores WHERE user_id = p_user_id AND completed = true
    UNION ALL
    SELECT score FROM word_search_scores WHERE user_id = p_user_id AND completed = true
  ) combined;
  RETURN total;
END;
$$;
