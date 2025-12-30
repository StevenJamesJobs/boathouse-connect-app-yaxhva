
-- =====================================================
-- SIGNATURE RECIPES STEP-BY-STEP MIGRATION
-- Run each section separately to identify any issues
-- =====================================================

-- =====================================================
-- SECTION 1: DROP EXISTING POLICIES (Run this first to fix the error)
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view active signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can insert signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can update signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can delete signature recipes" ON signature_recipes;

-- =====================================================
-- SECTION 2: CREATE TABLE (if it doesn't exist)
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price TEXT NOT NULL,
  subcategory TEXT,
  glassware TEXT,
  ingredients JSONB DEFAULT '[]'::jsonb,
  procedure TEXT,
  thumbnail_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE signature_recipes ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 3: CREATE TABLE POLICIES
-- =====================================================
CREATE POLICY "Anyone can view active signature recipes"
  ON signature_recipes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Managers can insert signature recipes"
  ON signature_recipes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can update signature recipes"
  ON signature_recipes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can delete signature recipes"
  ON signature_recipes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- =====================================================
-- SECTION 4: CREATE STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-recipe-images', 'signature-recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- SECTION 5: DROP EXISTING STORAGE POLICIES
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete signature recipe images" ON storage.objects;

-- =====================================================
-- SECTION 6: CREATE STORAGE POLICIES
-- =====================================================
CREATE POLICY "Anyone can view signature recipe images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signature-recipe-images');

CREATE POLICY "Managers can upload signature recipe images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can update signature recipe images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can delete signature recipe images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- =====================================================
-- SECTION 7: CREATE CRUD FUNCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION create_signature_recipe(
  p_user_id UUID,
  p_name TEXT,
  p_price TEXT,
  p_subcategory TEXT,
  p_glassware TEXT,
  p_ingredients JSONB,
  p_procedure TEXT,
  p_thumbnail_url TEXT,
  p_display_order INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipe_id UUID;
  v_is_manager BOOLEAN;
BEGIN
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can create signature recipes';
  END IF;

  INSERT INTO signature_recipes (
    name, price, subcategory, glassware, ingredients,
    procedure, thumbnail_url, display_order, created_by
  )
  VALUES (
    p_name, p_price, p_subcategory, p_glassware, p_ingredients,
    p_procedure, p_thumbnail_url, p_display_order, p_user_id
  )
  RETURNING id INTO v_recipe_id;

  RETURN v_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_signature_recipe(
  p_user_id UUID,
  p_recipe_id UUID,
  p_name TEXT,
  p_price TEXT,
  p_subcategory TEXT,
  p_glassware TEXT,
  p_ingredients JSONB,
  p_procedure TEXT,
  p_thumbnail_url TEXT,
  p_display_order INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_manager BOOLEAN;
BEGIN
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can update signature recipes';
  END IF;

  UPDATE signature_recipes
  SET
    name = p_name,
    price = p_price,
    subcategory = p_subcategory,
    glassware = p_glassware,
    ingredients = p_ingredients,
    procedure = p_procedure,
    thumbnail_url = p_thumbnail_url,
    display_order = p_display_order,
    updated_at = NOW()
  WHERE id = p_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_signature_recipe(
  p_user_id UUID,
  p_recipe_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_manager BOOLEAN;
BEGIN
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can delete signature recipes';
  END IF;

  DELETE FROM signature_recipes
  WHERE id = p_recipe_id;
END;
$$;

-- =====================================================
-- SECTION 8: DATA MIGRATION (OPTIONAL - READ FIRST!)
-- =====================================================
-- Before running this section, check your menu_items table structure:
-- SELECT * FROM menu_items WHERE category = 'Libations' LIMIT 5;
--
-- Then adjust the INSERT statement below to match your table structure.
-- =====================================================

-- Example migration (adjust column names as needed):
/*
INSERT INTO signature_recipes (
  name,
  price,
  subcategory,
  thumbnail_url,
  display_order,
  is_active,
  created_by
)
SELECT 
  name,
  price,
  subcategory,
  thumbnail_url,
  display_order,
  is_active,
  created_by
FROM menu_items
WHERE category = 'Libations'
AND subcategory IN ('Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV')
ON CONFLICT (id) DO NOTHING;
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Check if everything was created successfully:

-- 1. Check table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'signature_recipes'
) as table_exists;

-- 2. Check policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'signature_recipes';

-- 3. Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'signature-recipe-images';

-- 4. Check storage policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%signature recipe%';

-- 5. Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%signature_recipe%';

-- 6. Count signature recipes
SELECT COUNT(*) as total_recipes FROM signature_recipes;
