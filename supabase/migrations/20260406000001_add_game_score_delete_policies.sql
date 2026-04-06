-- Add DELETE policies to game_scores and word_search_scores tables
-- Required for Reset All Game Scores and per-user score reset features

CREATE POLICY "Anyone can delete game_scores"
  ON game_scores FOR DELETE TO public
  USING (true);

CREATE POLICY "Anyone can delete word_search_scores"
  ON word_search_scores FOR DELETE TO public
  USING (true);

-- Drop the 1-param overload of reset_game_scores to prevent PostgREST ambiguity
-- Only the 2-param version (p_game_mode, p_play_mode) is needed
DROP FUNCTION IF EXISTS public.reset_game_scores(text);
