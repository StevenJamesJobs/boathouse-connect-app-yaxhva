-- Add Spanish translation columns to guides_and_training table
ALTER TABLE guides_and_training ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE guides_and_training ADD COLUMN IF NOT EXISTS description_es TEXT;

-- Create SECURITY DEFINER RPC for saving guide translations
CREATE OR REPLACE FUNCTION update_guide_translations(
  p_id UUID,
  p_title_es TEXT DEFAULT NULL,
  p_description_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE guides_and_training
  SET title_es = p_title_es, description_es = p_description_es
  WHERE id = p_id;
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
