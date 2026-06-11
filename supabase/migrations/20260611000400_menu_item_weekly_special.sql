-- ============================================================
-- Weekly Specials overlay: let any menu item be FEATURED on
-- Weekly Specials without leaving its home category.
-- Adds menu_items.is_weekly_special and threads it through the
-- create/update menu-item RPCs.
-- ============================================================

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_weekly_special boolean NOT NULL DEFAULT false;

-- DROP the current signatures first (PostgREST overload-ambiguity safety:
-- adding a parameter would otherwise leave two overloads → PGRST203).
DROP FUNCTION IF EXISTS public.create_menu_item(
  uuid, text, text, text, text, text, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, integer, text, text, text, text, text,
  text, text, text, text, uuid
);

DROP FUNCTION IF EXISTS public.update_menu_item(
  uuid, uuid, text, text, text, text, text, boolean, boolean, boolean,
  boolean, boolean, boolean, text, text, integer, text, text, text, text,
  text, text, text, text, text, uuid
);

CREATE OR REPLACE FUNCTION public.create_menu_item(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_price text,
  p_category text,
  p_subcategory text,
  p_available_for_lunch boolean,
  p_available_for_dinner boolean,
  p_is_gluten_free boolean,
  p_is_gluten_free_available boolean,
  p_is_vegetarian boolean,
  p_is_vegetarian_available boolean,
  p_thumbnail_url text,
  p_thumbnail_shape text,
  p_display_order integer DEFAULT 0,
  p_location text DEFAULT NULL,
  p_glass_price text DEFAULT NULL,
  p_bottle_price text DEFAULT NULL,
  p_member_bottle_price text DEFAULT NULL,
  p_flavor_profile text DEFAULT NULL,
  p_flavor_profile_es text DEFAULT NULL,
  p_unique_selling_points text DEFAULT NULL,
  p_unique_selling_points_es text DEFAULT NULL,
  p_season text DEFAULT 'both',
  p_organization_id uuid DEFAULT NULL,
  p_is_weekly_special boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT; v_menu_item_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create menu items';
  END IF;
  INSERT INTO menu_items (
    name, description, price, category, subcategory,
    available_for_lunch, available_for_dinner, is_gluten_free, is_gluten_free_available,
    is_vegetarian, is_vegetarian_available, thumbnail_url, thumbnail_shape, display_order, created_by,
    location, glass_price, bottle_price, member_bottle_price,
    flavor_profile, flavor_profile_es, unique_selling_points, unique_selling_points_es,
    season, organization_id, is_weekly_special
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner, p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available, p_thumbnail_url, p_thumbnail_shape, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price,
    p_flavor_profile, p_flavor_profile_es, p_unique_selling_points, p_unique_selling_points_es,
    p_season, p_organization_id, p_is_weekly_special
  ) RETURNING id INTO v_menu_item_id;
  RETURN v_menu_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_menu_item(
  p_user_id uuid,
  p_menu_item_id uuid,
  p_name text,
  p_description text,
  p_price text,
  p_category text,
  p_subcategory text,
  p_available_for_lunch boolean,
  p_available_for_dinner boolean,
  p_is_gluten_free boolean,
  p_is_gluten_free_available boolean,
  p_is_vegetarian boolean,
  p_is_vegetarian_available boolean,
  p_thumbnail_url text,
  p_thumbnail_shape text,
  p_display_order integer DEFAULT 0,
  p_location text DEFAULT NULL,
  p_glass_price text DEFAULT NULL,
  p_bottle_price text DEFAULT NULL,
  p_member_bottle_price text DEFAULT NULL,
  p_flavor_profile text DEFAULT NULL,
  p_flavor_profile_es text DEFAULT NULL,
  p_unique_selling_points text DEFAULT NULL,
  p_unique_selling_points_es text DEFAULT NULL,
  p_season text DEFAULT 'both',
  p_organization_id uuid DEFAULT NULL,
  p_is_weekly_special boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update menu items';
  END IF;
  UPDATE menu_items SET
    name = p_name, description = p_description, price = p_price,
    category = p_category, subcategory = p_subcategory,
    available_for_lunch = p_available_for_lunch, available_for_dinner = p_available_for_dinner,
    is_gluten_free = p_is_gluten_free, is_gluten_free_available = p_is_gluten_free_available,
    is_vegetarian = p_is_vegetarian, is_vegetarian_available = p_is_vegetarian_available,
    thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
    display_order = p_display_order, location = p_location,
    glass_price = p_glass_price, bottle_price = p_bottle_price,
    member_bottle_price = p_member_bottle_price, flavor_profile = p_flavor_profile,
    flavor_profile_es = p_flavor_profile_es, unique_selling_points = p_unique_selling_points,
    unique_selling_points_es = p_unique_selling_points_es, season = p_season,
    is_weekly_special = p_is_weekly_special, updated_at = NOW()
  WHERE id = p_menu_item_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;
