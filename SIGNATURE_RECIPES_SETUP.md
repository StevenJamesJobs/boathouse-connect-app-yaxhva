
# Signature Recipes Setup Guide

⚠️ **IMPORTANT: This file has been superseded by newer migration files!**

Please use one of the following files instead:

## Recommended Files:

1. **SIGNATURE_RECIPES_FIX_GUIDE.md** - Start here! Complete guide to fixing all issues
2. **SIGNATURE_RECIPES_MIGRATION.sql** - Complete migration script (run all at once)
3. **SIGNATURE_RECIPES_STEP_BY_STEP.sql** - Step-by-step migration (for troubleshooting)
4. **SIGNATURE_RECIPES_VS_MENU_ITEMS.md** - Explains the difference between the two tables

## What's Fixed:

✅ **Navigation buttons now work** - "Coming Soon" replaced with working links
✅ **SQL policy error fixed** - Policies are dropped before being recreated
✅ **Data migration included** - Template for copying Libations data
✅ **Better documentation** - Step-by-step guides and troubleshooting

## Quick Start:

1. Read `SIGNATURE_RECIPES_FIX_GUIDE.md` first
2. Run `SIGNATURE_RECIPES_MIGRATION.sql` in Supabase SQL Editor
3. Verify the migration worked
4. Add missing data (glassware, ingredients, procedures) through the app

---

## Original Setup Instructions (Deprecated)

The original SQL below may cause errors if policies already exist. Use the new migration files instead.

<details>
<summary>Click to view original SQL (not recommended)</summary>

```sql
-- This SQL is deprecated. Use SIGNATURE_RECIPES_MIGRATION.sql instead.
-- Keeping this here for reference only.

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
-- WARNING: These will fail if policies already exist!
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

-- ... (rest of original SQL omitted for brevity)
```

</details>

---

## Features Implemented

### Signature Recipes Page (Employee & Manager View)

- **2-Column Tile View**: Displays cocktails in a 2-column grid layout
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
