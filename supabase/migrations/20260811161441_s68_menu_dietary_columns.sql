-- s68 A1: five new dietary flags on menu_items + widen the menu item RPCs to carry them.
-- Additive; existing callers keep working (new params default; new return columns append).
-- APPLIED LIVE via Supabase MCP 2026-08-11 (version 20260811161441). Repo copy for the record.

ALTER TABLE public.menu_items
  ADD COLUMN is_dairy_free boolean NOT NULL DEFAULT false,
  ADD COLUMN is_egg_free   boolean NOT NULL DEFAULT false,
  ADD COLUMN is_nut_free   boolean NOT NULL DEFAULT false,
  ADD COLUMN is_sugar_free boolean NOT NULL DEFAULT false,
  ADD COLUMN is_salt_free  boolean NOT NULL DEFAULT false;

-- get_menu_items: return type gains the five flags (drop+recreate; PostgREST named-arg calls unaffected).
DROP FUNCTION public.get_menu_items(uuid, uuid, text[], boolean, text);
CREATE FUNCTION public.get_menu_items(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid, p_categories text[] DEFAULT NULL::text[], p_weekly_special boolean DEFAULT NULL::boolean, p_season text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, price text, category text, subcategory text, available_for_lunch boolean, available_for_dinner boolean, is_gluten_free boolean, is_gluten_free_available boolean, is_vegetarian boolean, is_vegetarian_available boolean, thumbnail_url text, thumbnail_shape text, display_order integer, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, name_es text, description_es text, location text, location_es text, glass_price text, bottle_price text, member_bottle_price text, flavor_profile text, flavor_profile_es text, unique_selling_points text, unique_selling_points_es text, season text, organization_id uuid, is_weekly_special boolean, is_dairy_free boolean, is_egg_free boolean, is_nut_free boolean, is_sugar_free boolean, is_salt_free boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.description, m.price, m.category, m.subcategory,
           m.available_for_lunch, m.available_for_dinner, m.is_gluten_free,
           m.is_gluten_free_available, m.is_vegetarian, m.is_vegetarian_available,
           m.thumbnail_url, m.thumbnail_shape, m.display_order, m.is_active, m.created_by,
           m.created_at, m.updated_at, m.name_es, m.description_es, m.location, m.location_es,
           m.glass_price, m.bottle_price, m.member_bottle_price, m.flavor_profile,
           m.flavor_profile_es, m.unique_selling_points, m.unique_selling_points_es, m.season,
           m.organization_id, m.is_weekly_special,
           m.is_dairy_free, m.is_egg_free, m.is_nut_free, m.is_sugar_free, m.is_salt_free
      FROM public.menu_items m
     WHERE m.organization_id = v_src
       AND m.is_active = true
       AND (p_categories IS NULL OR m.category = ANY(p_categories))
       AND (p_weekly_special IS NULL OR m.is_weekly_special = p_weekly_special)
       AND (p_season IS NULL OR m.season = ANY(ARRAY[p_season, 'both']))
     ORDER BY m.display_order;
END; $function$;

-- create_menu_item: five new params, DEFAULT false (a new item's flags are off unless stated).
DROP FUNCTION public.create_menu_item(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean);
CREATE FUNCTION public.create_menu_item(p_user_id uuid, p_name text, p_description text, p_price text, p_category text, p_subcategory text, p_available_for_lunch boolean, p_available_for_dinner boolean, p_is_gluten_free boolean, p_is_gluten_free_available boolean, p_is_vegetarian boolean, p_is_vegetarian_available boolean, p_thumbnail_url text, p_thumbnail_shape text, p_display_order integer DEFAULT 0, p_location text DEFAULT NULL::text, p_glass_price text DEFAULT NULL::text, p_bottle_price text DEFAULT NULL::text, p_member_bottle_price text DEFAULT NULL::text, p_flavor_profile text DEFAULT NULL::text, p_flavor_profile_es text DEFAULT NULL::text, p_unique_selling_points text DEFAULT NULL::text, p_unique_selling_points_es text DEFAULT NULL::text, p_season text DEFAULT 'both'::text, p_organization_id uuid DEFAULT NULL::uuid, p_is_weekly_special boolean DEFAULT false, p_is_dairy_free boolean DEFAULT false, p_is_egg_free boolean DEFAULT false, p_is_nut_free boolean DEFAULT false, p_is_sugar_free boolean DEFAULT false, p_is_salt_free boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    season, organization_id, is_weekly_special,
    is_dairy_free, is_egg_free, is_nut_free, is_sugar_free, is_salt_free
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner, p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available, p_thumbnail_url, p_thumbnail_shape, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price,
    p_flavor_profile, p_flavor_profile_es, p_unique_selling_points, p_unique_selling_points_es,
    p_season, p_organization_id, p_is_weekly_special,
    p_is_dairy_free, p_is_egg_free, p_is_nut_free, p_is_sugar_free, p_is_salt_free
  ) RETURNING id INTO v_menu_item_id;
  RETURN v_menu_item_id;
END;
$function$;

-- update_menu_item: five new params, DEFAULT NULL + COALESCE-keep, so a caller that does not
-- send them cannot silently reset flags written elsewhere (the s68/s69 window: the current
-- editor build saves without these params).
DROP FUNCTION public.update_menu_item(uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean);
CREATE FUNCTION public.update_menu_item(p_user_id uuid, p_menu_item_id uuid, p_name text, p_description text, p_price text, p_category text, p_subcategory text, p_available_for_lunch boolean, p_available_for_dinner boolean, p_is_gluten_free boolean, p_is_gluten_free_available boolean, p_is_vegetarian boolean, p_is_vegetarian_available boolean, p_thumbnail_url text, p_thumbnail_shape text, p_display_order integer DEFAULT 0, p_location text DEFAULT NULL::text, p_glass_price text DEFAULT NULL::text, p_bottle_price text DEFAULT NULL::text, p_member_bottle_price text DEFAULT NULL::text, p_flavor_profile text DEFAULT NULL::text, p_flavor_profile_es text DEFAULT NULL::text, p_unique_selling_points text DEFAULT NULL::text, p_unique_selling_points_es text DEFAULT NULL::text, p_season text DEFAULT 'both'::text, p_organization_id uuid DEFAULT NULL::uuid, p_is_weekly_special boolean DEFAULT false, p_is_dairy_free boolean DEFAULT NULL::boolean, p_is_egg_free boolean DEFAULT NULL::boolean, p_is_nut_free boolean DEFAULT NULL::boolean, p_is_sugar_free boolean DEFAULT NULL::boolean, p_is_salt_free boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    is_weekly_special = p_is_weekly_special,
    is_dairy_free = COALESCE(p_is_dairy_free, is_dairy_free),
    is_egg_free   = COALESCE(p_is_egg_free, is_egg_free),
    is_nut_free   = COALESCE(p_is_nut_free, is_nut_free),
    is_sugar_free = COALESCE(p_is_sugar_free, is_sugar_free),
    is_salt_free  = COALESCE(p_is_salt_free, is_salt_free),
    updated_at = NOW()
  WHERE id = p_menu_item_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;
