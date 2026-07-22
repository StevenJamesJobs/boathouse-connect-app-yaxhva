-- B6b: word-search category consolidation 5 -> 2 (product decision 2026-07-21).
-- weekly_specials/lunch/dinner/happy_hour -> 'dishes_ingredients' (whole-menu
-- food pool) and libations -> 'libations_ingredients' (libation recipes +
-- Cocktails A-Z). Org menus are custom-category shaped post-upload, so the old
-- per-meal splits no longer mapped to anything real.
-- Leaderboards are freshly reset (Boathouse wipe op 2026-07-21); the remaining
-- handful of old-slug TEST-org rows are wiped rather than mapped (approved).
--
-- ROLLBACK:
--   ALTER TABLE public.word_search_scores DROP CONSTRAINT word_search_scores_category_check;
--   ALTER TABLE public.word_search_scores ADD CONSTRAINT word_search_scores_category_check
--     CHECK (category = ANY (ARRAY['weekly_specials','lunch','dinner','happy_hour','libations']));
--   (old test rows are not restored — none were meaningful)

DELETE FROM public.word_search_scores
 WHERE category IN ('weekly_specials','lunch','dinner','happy_hour','libations');

ALTER TABLE public.word_search_scores DROP CONSTRAINT word_search_scores_category_check;
ALTER TABLE public.word_search_scores ADD CONSTRAINT word_search_scores_category_check
  CHECK (category = ANY (ARRAY['dishes_ingredients'::text, 'libations_ingredients'::text]));
