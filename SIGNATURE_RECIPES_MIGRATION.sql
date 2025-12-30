
-- =====================================================
-- SIGNATURE RECIPES COMPLETE MIGRATION
-- =====================================================
-- This migration handles:
-- 1. Creating the signature_recipes table if it doesn't exist
-- 2. Dropping and recreating policies to avoid conflicts
-- 3. Creating storage bucket and policies
-- 4. Creating CRUD functions
-- 5. Migrating data from menu_items (libations) to signature_recipes
-- =====================================================

-- Step 1: Create signature_recipes table if it doesn't exist
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

-- Step 8: Create database functions for CRUD operations
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
    p_ingredients,
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
-- DATA MIGRATION FROM MENU_ITEMS (LIBATIONS)
-- =====================================================
-- This section migrates data from the menu_items table
-- where category = 'Libations' to the signature_recipes table
-- 
-- IMPORTANT: Review and adjust the mapping based on your
-- actual menu_items table structure before running!
-- =====================================================

-- Step 9: Migrate data from menu_items to signature_recipes
-- NOTE: This assumes your menu_items table has the following structure:
-- - name (TEXT)
-- - price (TEXT)
-- - subcategory (TEXT) - should be one of: 'Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV'
-- - thumbnail_url (TEXT)
-- - display_order (INTEGER)
-- - category (TEXT) - should be 'Libations' for cocktails
--
-- ADJUST THIS QUERY BASED ON YOUR ACTUAL TABLE STRUCTURE!

-- First, check if menu_items table exists and has the expected columns
DO $$
BEGIN
  -- Only run migration if menu_items table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'menu_items'
  ) THEN
    
    -- Insert libations from menu_items into signature_recipes
    -- This will create empty ingredients array and procedure for now
    -- You'll need to manually add ingredients and procedures later
    INSERT INTO signature_recipes (
      name,
      price,
      subcategory,
      glassware,
      ingredients,
      procedure,
      thumbnail_url,
      display_order,
      is_active,
      created_by
    )
    SELECT 
      name,
      price,
      subcategory,
      NULL as glassware, -- Add glassware manually later
      '[]'::jsonb as ingredients, -- Empty ingredients array - add manually later
      '' as procedure, -- Empty procedure - add manually later
      thumbnail_url,
      display_order,
      is_active,
      created_by
    FROM menu_items
    WHERE category = 'Libations'
    AND subcategory IN ('Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV')
    ON CONFLICT (id) DO NOTHING; -- Skip if already exists
    
    RAISE NOTICE 'Data migration completed successfully!';
  ELSE
    RAISE NOTICE 'menu_items table not found. Skipping data migration.';
  END IF;
END $$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries after the migration to verify everything worked:

-- Check how many signature recipes were created
-- SELECT COUNT(*) as total_signature_recipes FROM signature_recipes;

-- View all signature recipes grouped by subcategory
-- SELECT subcategory, COUNT(*) as count 
-- FROM signature_recipes 
-- GROUP BY subcategory 
-- ORDER BY subcategory;

-- View all signature recipes
-- SELECT id, name, price, subcategory, glassware, display_order, is_active
-- FROM signature_recipes
-- ORDER BY subcategory, display_order, name;

-- =====================================================
-- NOTES
-- =====================================================
-- 1. After running this migration, you'll need to manually add:
--    - Glassware information for each recipe
--    - Ingredients (ingredient name and amount pairs)
--    - Preparation procedures
--
-- 2. You can do this through the Signature Recipes Editor
--    in the app, or by running UPDATE queries like:
--
--    UPDATE signature_recipes
--    SET 
--      glassware = 'Martini Glass',
--      ingredients = '[
--        {"ingredient": "vodka", "amount": "2 oz"},
--        {"ingredient": "triple sec", "amount": "1 oz"}
--      ]'::jsonb,
--      procedure = 'Shake with ice and strain into glass.'
--    WHERE name = 'Your Cocktail Name';
--
-- 3. If you need to copy images from the menu-images bucket
--    to signature-recipe-images bucket, you'll need to do that
--    separately using the Supabase Storage interface or API.
-- =====================================================
