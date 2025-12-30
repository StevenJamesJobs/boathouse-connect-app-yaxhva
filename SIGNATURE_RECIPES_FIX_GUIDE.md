
# Signature Recipes Fix Guide

This guide addresses the two issues you reported:

## Issue 1: "Coming Soon" Buttons Not Working ✅ FIXED

**Problem:** The "Signature Recipes" and "Signature Recipes Editor" buttons were showing "Coming Soon" instead of navigating to the actual pages.

**Solution:** Updated the following files:
- `app/bartender-assistant.tsx` - Changed button text to "View Recipes" and added navigation to `/signature-recipes`
- `app/bartender-assistant-editor.tsx` - Changed button text to "Manage Recipes" and added navigation to `/signature-recipes-editor`

**Result:** 
- Employees can now click "View Recipes" to see the Signature Recipes page
- Managers can now click "Manage Recipes" to access the Signature Recipes Editor

---

## Issue 2: SQL Policy Error ✅ FIXED

**Problem:** Running the SQL from `SIGNATURE_RECIPES_SETUP.md` returned an error:
```
ERROR: 42710: policy "Anyone can view active signature recipes" for table "signature_recipes" already exists
```

**Root Cause:** The policy already existed in the database, and the SQL was trying to create it again without checking if it exists first.

**Solution:** Created two new SQL files with improved migration scripts:

### Option 1: Complete Migration (Recommended)
**File:** `SIGNATURE_RECIPES_MIGRATION.sql`

This file includes:
1. ✅ Drops existing policies before recreating them (fixes the error)
2. ✅ Creates the signature_recipes table if it doesn't exist
3. ✅ Creates all RLS policies
4. ✅ Creates storage bucket and policies
5. ✅ Creates CRUD functions
6. ✅ Includes data migration template from menu_items (Libations)

**How to use:**
1. Open Supabase SQL Editor
2. Copy the entire contents of `SIGNATURE_RECIPES_MIGRATION.sql`
3. Paste and run it
4. Check the output for any errors

### Option 2: Step-by-Step Migration (For Troubleshooting)
**File:** `SIGNATURE_RECIPES_STEP_BY_STEP.sql`

This file breaks the migration into 8 separate sections that you can run one at a time:
1. Drop existing policies (fixes the error)
2. Create table
3. Create table policies
4. Create storage bucket
5. Drop existing storage policies
6. Create storage policies
7. Create CRUD functions
8. Data migration (optional)

**How to use:**
1. Open Supabase SQL Editor
2. Copy and run **SECTION 1** first (this fixes your error)
3. Then run sections 2-7 one at a time
4. Review section 8 before running (data migration)
5. Run the verification queries at the end to confirm everything worked

---

## Data Migration from Libations

The SQL files include a template for migrating data from your existing `menu_items` table where `category = 'Libations'`.

**Important Notes:**

1. **Review the migration query first!** The template assumes your `menu_items` table has these columns:
   - `name`
   - `price`
   - `subcategory` (should be: 'Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV')
   - `thumbnail_url`
   - `display_order`
   - `is_active`
   - `created_by`

2. **Check your table structure first:**
   ```sql
   SELECT * FROM menu_items WHERE category = 'Libations' LIMIT 5;
   ```

3. **Adjust the migration query** if your column names are different.

4. **What gets migrated:**
   - Name, price, subcategory, thumbnail URL, display order
   - Ingredients and procedures will be **empty** - you'll need to add these manually through the editor

5. **What doesn't get migrated automatically:**
   - Glassware information (add manually)
   - Ingredients (add manually)
   - Procedures (add manually)
   - Images (thumbnails URLs are copied, but if you want to copy the actual image files from one storage bucket to another, you'll need to do that separately)

---

## After Migration: Adding Missing Data

After running the migration, you'll need to add the missing information for each recipe:

### Option 1: Use the Signature Recipes Editor (Recommended)
1. Log in as a manager
2. Go to Manager Portal → Manage → Bartender Assistant Editor
3. Click "Manage Recipes"
4. Edit each recipe to add:
   - Glassware
   - Ingredients (with amounts)
   - Procedures

### Option 2: Use SQL Updates
You can also update recipes directly with SQL:

```sql
UPDATE signature_recipes
SET 
  glassware = 'Martini Glass',
  ingredients = '[
    {"ingredient": "vodka", "amount": "2 oz"},
    {"ingredient": "triple sec", "amount": "1 oz"},
    {"ingredient": "cranberry juice", "amount": "0.5 oz"}
  ]'::jsonb,
  procedure = 'Shake all ingredients with ice. Strain into a chilled martini glass. Garnish with a lime wheel.'
WHERE name = 'Cosmopolitan';
```

---

## Verification

After running the migration, verify everything worked:

```sql
-- Check how many recipes were migrated
SELECT COUNT(*) as total_recipes FROM signature_recipes;

-- View recipes by subcategory
SELECT subcategory, COUNT(*) as count 
FROM signature_recipes 
GROUP BY subcategory 
ORDER BY subcategory;

-- View all recipes
SELECT id, name, price, subcategory, glassware, display_order
FROM signature_recipes
ORDER BY subcategory, display_order, name;

-- Check which recipes need ingredients/procedures added
SELECT name, subcategory,
  CASE WHEN ingredients = '[]'::jsonb THEN 'Missing' ELSE 'Has Data' END as ingredients_status,
  CASE WHEN procedure IS NULL OR procedure = '' THEN 'Missing' ELSE 'Has Data' END as procedure_status
FROM signature_recipes
ORDER BY subcategory, name;
```

---

## Summary

✅ **Navigation Fixed:** Buttons now work and navigate to the correct pages
✅ **SQL Error Fixed:** Policies are now dropped before being recreated
✅ **Migration Scripts Ready:** Two SQL files provided for easy migration
✅ **Data Migration Template:** Includes template for copying Libations data

**Next Steps:**
1. Run `SIGNATURE_RECIPES_MIGRATION.sql` or `SIGNATURE_RECIPES_STEP_BY_STEP.sql`
2. Verify the migration worked using the verification queries
3. Add missing data (glassware, ingredients, procedures) through the editor
4. Test the Signature Recipes page and editor in the app

If you encounter any issues, run the step-by-step version and let me know which section fails!
