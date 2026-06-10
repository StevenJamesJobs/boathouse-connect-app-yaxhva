-- ============================================================================
-- D4 Part B (4/4): generalize cocktail recipe-backing.
--
-- Owners can mark ANY Libations subcategory (built-in or custom) as
-- recipe-backed (is_cocktail_fed). Recipes now bind to a subcategory by id
-- (subcategory_id) instead of the fixed 6-value `category` vocab, and the
-- "Featured" pin is extracted into an explicit is_featured flag.
--
-- Back-compat: the legacy `category` column is kept and still written; readers
-- fall back to category -> system_key resolution when subcategory_id is NULL.
-- Backfill targets slot 0 (every org is 'shared' at migration time).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.libation_recipes
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.menu_subcategories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.summer_libation_recipes
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.menu_subcategories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Backfill is_featured from the legacy 'Featured' category value
-- ---------------------------------------------------------------------------
UPDATE public.libation_recipes        SET is_featured = true WHERE category = 'Featured';
UPDATE public.summer_libation_recipes SET is_featured = true WHERE category = 'Featured';

-- ---------------------------------------------------------------------------
-- Backfill subcategory_id from the fixed recipe vocab -> cocktail-fed sub
-- (slot-0 Libations subcategories). Mirrors RECIPE_CATEGORY_TO_SUBCATEGORY_KEY.
-- ---------------------------------------------------------------------------
UPDATE public.libation_recipes lr
  SET subcategory_id = ms.id
  FROM public.menu_subcategories ms
  WHERE ms.organization_id = lr.organization_id
    AND ms.menu_slot = 0
    AND ms.system_key = CASE lr.category
        WHEN 'Featured'            THEN 'sub.signature_cocktails'
        WHEN 'Signature Cocktails' THEN 'sub.signature_cocktails'
        WHEN 'Martinis'            THEN 'sub.martinis'
        WHEN 'Sangrias'            THEN 'sub.sangria'
        WHEN 'Low ABV'             THEN 'sub.low_abv'
        WHEN 'No ABV'              THEN 'sub.zero_abv'
        ELSE NULL END;

UPDATE public.summer_libation_recipes slr
  SET subcategory_id = ms.id
  FROM public.menu_subcategories ms
  WHERE ms.organization_id = slr.organization_id
    AND ms.menu_slot = 0
    AND ms.system_key = CASE slr.category
        WHEN 'Featured'            THEN 'sub.signature_cocktails'
        WHEN 'Signature Cocktails' THEN 'sub.signature_cocktails'
        WHEN 'Martinis'            THEN 'sub.martinis'
        WHEN 'Sangrias'            THEN 'sub.sangria'
        WHEN 'Low ABV'             THEN 'sub.low_abv'
        WHEN 'No ABV'              THEN 'sub.zero_abv'
        ELSE NULL END;

-- ---------------------------------------------------------------------------
-- Owner-gated toggle: mark a Libations subcategory recipe-backed (or not).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_set_cocktail_fed(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_is_cocktail_fed boolean
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cat_syskey text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT c.system_key INTO v_cat_syskey
    FROM public.menu_subcategories s
    JOIN public.menu_categories c ON c.id = s.category_id
    WHERE s.id = p_subcategory_id AND s.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_cat_syskey IS DISTINCT FROM 'cat.libations' THEN
    RETURN json_build_object('success', false, 'error', 'Only Libations subcategories can be recipe-backed');
  END IF;
  UPDATE public.menu_subcategories
    SET is_cocktail_fed = COALESCE(p_is_cocktail_fed, is_cocktail_fed), updated_at = now()
    WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_set_cocktail_fed(uuid, uuid, uuid, boolean) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Extend the recipe insert/update RPCs with p_subcategory_id + p_is_featured.
-- Drop the old signatures first (PostgREST overload-ambiguity gotcha). Keep
-- writing the legacy `category` for back-compat.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.insert_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.insert_libation_recipe(
  p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text,
  p_garnish text, p_ingredients jsonb, p_procedure text, p_thumbnail_url text,
  p_display_order integer, p_organization_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_is_featured boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_role TEXT; v_recipe_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN RAISE EXCEPTION 'Only managers can create libation recipes'; END IF;
  INSERT INTO libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url,
     display_order, is_active, created_by, created_at, updated_at, organization_id,
     subcategory_id, is_featured)
  VALUES
    (p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure, p_thumbnail_url,
     p_display_order, true, p_user_id, NOW(), NOW(), p_organization_id,
     p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_recipe_id;
  RETURN v_recipe_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.update_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.update_libation_recipe(
  p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text,
  p_glassware text, p_garnish text, p_ingredients jsonb, p_procedure text,
  p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_is_featured boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN RAISE EXCEPTION 'Only managers can update libation recipes'; END IF;
  UPDATE libation_recipes SET
    name = p_name, price = p_price, category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = p_thumbnail_url, display_order = p_display_order, updated_at = NOW(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.insert_summer_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.insert_summer_libation_recipe(
  p_user_id uuid, p_name text, p_price text, p_category text,
  p_glassware text DEFAULT NULL, p_garnish text DEFAULT NULL, p_ingredients jsonb DEFAULT '[]'::jsonb,
  p_procedure text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL, p_display_order integer DEFAULT 0,
  p_organization_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_is_featured boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO summer_libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url,
     display_order, created_by, organization_id, subcategory_id, is_featured)
  VALUES
    (p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure, p_thumbnail_url,
     p_display_order, p_user_id, p_organization_id, p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_summer_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.update_summer_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe(
  p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text,
  p_glassware text DEFAULT NULL, p_garnish text DEFAULT NULL, p_ingredients jsonb DEFAULT '[]'::jsonb,
  p_procedure text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL, p_display_order integer DEFAULT 0,
  p_organization_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_is_featured boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE summer_libation_recipes SET
    name = p_name, price = p_price, category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = p_thumbnail_url, display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_summer_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean) TO anon, authenticated;
