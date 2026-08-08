-- s66 follow-up, found by Steve's smoke: custom categories could be CREATED but
-- never USED, because `guides_and_training.category` carried a CHECK that
-- hard-coded the four original names:
--
--   CHECK (category = ANY (ARRAY['Employee HandBooks','Full Menus',
--                                'Cheat Sheets','Events Flyers']))
--
-- ⚠️ HOW THIS WAS MISSED: the categories feature was scoped off a read of
-- information_schema.columns ("plain text NOT NULL, no enum, no FK") without
-- ever reading pg_constraint. That single unchecked assumption is what made the
-- whole design look storable client-side.
--
-- Symptoms, all one cause:
--   * saving a guide into a custom category  -> 23514 check violation
--   * renaming a category that HAS guides    -> 23514, via the cascade UPDATE
--   * renaming an EMPTY category             -> APPEARED TO WORK, because the
--     cascade touched zero rows so the check never fired. That is why the first
--     smoke passed and the second did not.
--
-- The whitelist predates `guide_categories`, which is now the per-org source of
-- truth for what categories exist. A global constant contradicts that outright.
-- Replaced with the only rule still meaningful at the column level: non-blank.
ALTER TABLE public.guides_and_training
  DROP CONSTRAINT IF EXISTS guides_and_training_category_check;

ALTER TABLE public.guides_and_training
  ADD CONSTRAINT guides_and_training_category_check
  CHECK (btrim(category) <> '');

-- ⭐ DELIBERATELY NOT TIGHTENED into a referential check against
-- guide_categories, and this is a real (small) gap worth knowing about:
-- nothing now stops a caller writing an arbitrary non-blank category string,
-- where the old whitelist did. It is not reachable from the UI (the form's
-- picker only offers real categories) and there are zero orphans today, but
-- the honest fix is an EXISTS check inside create_guide/update_guide against
-- guide_categories for the actor's org, matched with lower(). Left for its own
-- pass rather than changing the core guide write path at the end of a session.
-- A composite FK is NOT the answer: uniqueness on guide_categories is
-- lower(name), so an exact FK would reject rows differing only in case.
--
-- VERIFIED LIVE after applying, on MyResto Test, fixture restored:
--   create_guide into a custom category      -> OK
--   rename a CUSTOM category with guides     -> cascaded
--   rename a BUILT-IN category with guides   -> cascaded
--   0 leftover rows / 0 orphaned guides / Boathouse still 50
