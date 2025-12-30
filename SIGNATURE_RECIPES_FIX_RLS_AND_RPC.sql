
-- =====================================================
-- SIGNATURE RECIPES FIX - RLS POLICIES AND RPC FUNCTIONS
-- =====================================================
-- This migration fixes the RLS policies and ensures RPC functions exist
-- Run this in the Supabase SQL Editor
-- =====================================================

-- Step 1: Ensure the signature_recipes table exists with correct structure
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

-- Step 2: Enable RLS
ALTER TABLE signature_recipes ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view active signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can insert signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can update signature recipes" ON signature_recipes;
DROP POLICY IF EXISTS "Managers can delete signature recipes" ON signature_recipes;

-- Step 4: Create RLS policies for signature_recipes
CREATE POLICY "Anyone can view active signature recipes"
  ON signature_recipes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Managers can insert signature recipes"
  ON signature_recipes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can update signature recipes"
  ON signature_recipes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can delete signature recipes"
  ON signature_recipes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- Step 5: Create storage bucket for signature recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-recipe-images', 'signature-recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Step 6: Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Anyone can view signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete signature recipe images" ON storage.objects;

-- Step 7: Create RLS policies for signature-recipe-images bucket
CREATE POLICY "Anyone can view signature recipe images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signature-recipe-images');

CREATE POLICY "Managers can upload signature recipe images"
  ON storage.objects FOR INSERT
  TO authenticated
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
  TO authenticated
  USING (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  )
  WITH CHECK (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can delete signature recipe images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- Step 8: Create or replace CRUD functions
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
  -- Check if user is a manager
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can create signature recipes';
  END IF;

  -- Insert the signature recipe
  INSERT INTO signature_recipes (
    name,
    price,
    subcategory,
    glassware,
    ingredients,
    procedure,
    thumbnail_url,
    display_order,
    created_by
  )
  VALUES (
    p_name,
    p_price,
    p_subcategory,
    p_glassware,
    COALESCE(p_ingredients, '[]'::jsonb),
    p_procedure,
    p_thumbnail_url,
    p_display_order,
    p_user_id
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
  -- Check if user is a manager
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can update signature recipes';
  END IF;

  -- Update the signature recipe
  UPDATE signature_recipes
  SET
    name = p_name,
    price = p_price,
    subcategory = p_subcategory,
    glassware = p_glassware,
    ingredients = COALESCE(p_ingredients, '[]'::jsonb),
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
  -- Check if user is a manager
  SELECT role = 'manager' INTO v_is_manager
  FROM users
  WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can delete signature recipes';
  END IF;

  -- Delete the signature recipe
  DELETE FROM signature_recipes
  WHERE id = p_recipe_id;
END;
$$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries after the migration to verify everything worked:

-- Check table policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'signature_recipes';

-- Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'signature-recipe-images';

-- Check storage policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%signature recipe%';

-- Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%signature_recipe%';

-- Count signature recipes
SELECT COUNT(*) as total_recipes FROM signature_recipes;
