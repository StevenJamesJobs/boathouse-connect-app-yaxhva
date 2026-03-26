-- Game Scores table for Menu Memory Game
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('wine_pairings', 'ingredients_dishes', 'cocktail_ingredients')),
  difficulty INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  time_seconds INTEGER,
  pairs_matched INTEGER NOT NULL,
  total_pairs INTEGER NOT NULL,
  lives_remaining INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_game_scores_mode_score ON game_scores(game_mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);

-- RLS policies (using public role per app pattern)
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_scores_select_all" ON game_scores
  FOR SELECT TO public USING (true);

CREATE POLICY "game_scores_insert_all" ON game_scores
  FOR INSERT TO public WITH CHECK (true);

-- Leaderboard RPC
CREATE OR REPLACE FUNCTION get_game_leaderboard(p_game_mode TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  best_score INTEGER,
  games_played BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.user_id,
    u.name,
    u.profile_picture_url,
    MAX(gs.score)::INTEGER as best_score,
    COUNT(*)::BIGINT as games_played
  FROM game_scores gs
  JOIN users u ON u.id = gs.user_id
  WHERE gs.game_mode = p_game_mode AND gs.completed = true
  GROUP BY gs.user_id, u.name, u.profile_picture_url
  ORDER BY best_score DESC
  LIMIT p_limit;
END;
$$;
