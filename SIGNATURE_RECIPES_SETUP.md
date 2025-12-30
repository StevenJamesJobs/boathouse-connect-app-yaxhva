
# Signature Recipes Setup Guide

This guide explains how to set up the Signature Recipes feature for the McLoone's Boathouse Connect app.

## Database Migration

Run the following SQL in your Supabase SQL Editor to create the necessary tables, storage bucket, and functions:

```sql
-- Create signature_recipes table
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

-- Create RLS policies for signature_recipes
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

-- Create storage bucket for signature recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-recipe-images', 'signature-recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for signature-recipe-images bucket
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

-- Create database functions for CRUD operations
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
```

## Features Implemented

### Signature Recipes Page (Employee & Manager View)

- **2-Column Tile View**: Displays cocktails in a 2-column grid layout similar to the reference image
- **Category Grouping**: Recipes are grouped by category with headers (Signature Cocktails, Martinis, Sangria, Low ABV, Zero ABV)
- **Thumbnail Display**: Shows cocktail thumbnail with name and price overlaid on the image
- **Placeholder Image**: Uses a default cocktail image from Unsplash if no thumbnail is uploaded
- **No Filter/Search**: The page displays all recipes grouped by category without search or filter functionality
- **Detailed Pop-up**: Clicking a tile opens a smooth modal with:
  - Full-size thumbnail image
  - Name, price, and glassware
  - Ingredients section with distinct ingredient and amount display
  - Procedure section
  - Proper scrolling to prevent content cutoff on iOS and Android

### Signature Recipe Editor (Manager Only)

- **Thumbnail Upload**: Upload cocktail images (stored in `signature-recipe-images` bucket)
- **Name Field**: Text input for cocktail name
- **Price Field**: Text input for price
- **Subcategory Selection**: Horizontal scrolling selector for categories
- **Glassware Field**: Text input for glassware type
- **Dynamic Ingredients**: 
  - "Add Ingredient" button to add new ingredient/amount pairs
  - Each ingredient has two fields: Amount and Ingredient
  - Remove button for each ingredient (minimum 1 required)
- **Procedure Field**: Multi-line text area for preparation instructions
- **Display Order**: Numeric input to control display order
- **Search & Filter**: Search by name, glassware, or ingredients; filter by subcategory
- **CRUD Operations**: Create, read, update, and delete recipes with proper validation

## Data Structure

### Ingredients Format

Ingredients are stored as JSONB array with the following structure:

```json
[
  {
    "ingredient": "vodka",
    "amount": "2 oz."
  },
  {
    "ingredient": "sour apple liqueur",
    "amount": "1 oz."
  },
  {
    "ingredient": "lemon juice",
    "amount": "0.25 oz."
  }
]
```

## Notes

- The description field has been removed as requested
- Ingredients are now structured as ingredient/amount pairs instead of a single text field
- The detailed pop-up displays ingredients with clear separation between amount and ingredient name
- All images are cached with timestamps to ensure fresh loads
- Proper RLS policies ensure only managers can edit recipes
- The page is optimized for both iOS and Android with proper padding and scrolling
