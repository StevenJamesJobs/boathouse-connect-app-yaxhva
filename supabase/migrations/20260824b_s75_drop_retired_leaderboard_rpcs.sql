-- s75b · Drop the per-game leaderboard RPCs orphaned by the screen retirements.
-- Their only callers were memory-game-leaderboard / word-search-leaderboard /
-- picture-this-leaderboard, all deleted in s75; pg_proc shows zero dependent
-- functions. Steve's call (s75): no live users on the old build, next
-- TestFlight build ships the new screens, so no deployed client loses a call.
-- The replacement read surface is get_game_category_board + the master_* family.

DROP FUNCTION IF EXISTS public.get_game_leaderboard_actor(uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.get_game_leaderboard(text, integer, text, uuid);
DROP FUNCTION IF EXISTS public.get_word_search_leaderboard_actor(uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_word_search_leaderboard(text, integer, uuid);
DROP FUNCTION IF EXISTS public.get_picture_this_leaderboard_filtered_actor(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.get_picture_this_leaderboard_filtered(text, text, integer, uuid);
