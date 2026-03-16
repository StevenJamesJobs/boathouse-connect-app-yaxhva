-- Add procedure_es columns to recipe tables for Spanish translation
ALTER TABLE libation_recipes ADD COLUMN IF NOT EXISTS procedure_es TEXT;
ALTER TABLE cocktails ADD COLUMN IF NOT EXISTS procedure_es TEXT;
ALTER TABLE puree_syrup_recipes ADD COLUMN IF NOT EXISTS procedure_es TEXT;

-- RPC for libation recipe translations (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION update_libation_recipe_translations(
  p_id UUID,
  p_procedure_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE libation_recipes
  SET procedure_es = p_procedure_es
  WHERE id = p_id;
END;
$$;

-- RPC for cocktail translations
CREATE OR REPLACE FUNCTION update_cocktail_translations(
  p_id UUID,
  p_procedure_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE cocktails
  SET procedure_es = p_procedure_es
  WHERE id = p_id;
END;
$$;

-- RPC for puree/syrup recipe translations
CREATE OR REPLACE FUNCTION update_puree_syrup_recipe_translations(
  p_id UUID,
  p_procedure_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE puree_syrup_recipes
  SET procedure_es = p_procedure_es
  WHERE id = p_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
