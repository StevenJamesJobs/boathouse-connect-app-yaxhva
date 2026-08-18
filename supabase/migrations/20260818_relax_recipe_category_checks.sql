-- s73: custom recipe categories.
-- puree_syrup_recipes: the editor's new Custom… category picker mints arbitrary
-- category strings; the old two-value CHECK rejected them (Steve's smoke bug).
-- libation_recipes: same class latent — a custom cocktail-fed subcategory writes
-- its raw display_name as the legacy category, which the six-value vocab CHECK
-- would reject (summer_libation_recipes never had the check; this aligns them).
-- Both become a non-blank floor: widening only, every existing row passes.

ALTER TABLE public.puree_syrup_recipes
  DROP CONSTRAINT puree_syrup_recipes_category_check;
ALTER TABLE public.puree_syrup_recipes
  ADD CONSTRAINT puree_syrup_recipes_category_check
  CHECK (length(btrim(category)) > 0);

ALTER TABLE public.libation_recipes
  DROP CONSTRAINT libation_recipes_category_check;
ALTER TABLE public.libation_recipes
  ADD CONSTRAINT libation_recipes_category_check
  CHECK (length(btrim(category)) > 0);
