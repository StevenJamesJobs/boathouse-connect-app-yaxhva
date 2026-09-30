-- s88 round 2 (Steve's device pass, 2026-09-30):
--
--   1. organizations.menu2_recipes_visible — a one-menu org may keep Menu 2's
--      cocktail recipes OPEN in the Bar Assistant (menus overlap; bartenders
--      still look them up) while the guest-facing Menu 2 is gone. get_org
--      carries the flag (return type change → DROP + CREATE, same grants).
--   2. retire_menu2 — the 2 → 1 decision in one call, AFTER the settings save:
--      Menu 2's items keep | delete (owner-only, the AI-upload page's
--      delete_menu semantics, custom categories optional) and Menu 2's recipes
--      keep | visible | delete. Deletes are HARD; image URLs come back so the
--      client broker-deletes the files.
--   3. manage_menu_category_move_into — fold a stand-alone custom category (no
--      subcategories) into another category: as its own new subcategory, merged
--      into a same-named one, or into a chosen existing subcategory. Items ride
--      along; the empty category is deleted.
--   4. The libation recipe write RPCs (both menus: insert / update / delete /
--      reorder) gain the house actor gate — the org is the ACTOR's org, never
--      the client's argument — and delete becomes a real DELETE (the old
--      is_active=false rows were invisible forever anyway). Signatures and
--      return types are unchanged, so every shipped build keeps working.
--
-- Additive except (4), which Steve asked for explicitly. Everything else
-- untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The "keep Menu 2's recipes visible" flag
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS menu2_recipes_visible boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_org(uuid);
CREATE FUNCTION public.get_org(p_actor_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, logo_url text, address text, city text, state text, zip text,
               latitude numeric, longitude numeric, weather_location text, google_maps_query text,
               reward_currency_name text, join_code text, allow_self_signup boolean, menu_count integer,
               menu_1_name text, menu_2_name text, default_password text, owner_id uuid, menu_1_icon text,
               menu_2_icon text, header_icon text, menu_category_scope text, games_use_sample_data boolean,
               staff_can_view_roster boolean, games_show_wine_pairings boolean, games_show_cocktails boolean,
               games_show_ws_libations boolean, games_show_pt_libations boolean, games_show_pt_wine boolean,
               menu2_recipes_visible boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.id, o.name, o.slug, o.logo_url, o.address, o.city, o.state, o.zip, o.latitude,
           o.longitude, o.weather_location, o.google_maps_query, o.reward_currency_name,
           o.join_code, o.allow_self_signup, o.menu_count, o.menu_1_name, o.menu_2_name,
           o.default_password, o.owner_id, o.menu_1_icon, o.menu_2_icon, o.header_icon,
           o.menu_category_scope, o.games_use_sample_data, o.staff_can_view_roster,
           o.games_show_wine_pairings, o.games_show_cocktails, o.games_show_ws_libations,
           o.games_show_pt_libations, o.games_show_pt_wine, o.menu2_recipes_visible
      FROM public.organizations o
     WHERE o.id = v_org;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Two menus → one: what happens to Menu 2's items and recipes
--    p_items_action   'keep' | 'delete'   (delete = owner only, like delete_menu)
--    p_recipes_action 'keep' | 'visible' | 'delete'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retire_menu2(
  p_user_id uuid,
  p_organization_id uuid,
  p_items_action text DEFAULT 'keep',
  p_recipes_action text DEFAULT 'keep',
  p_delete_custom_categories boolean DEFAULT false
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_scope text; v_c record; v_n integer;
  v_items integer := 0; v_recipes integer := 0; v_cats integer := 0; v_subs integer := 0;
  v_item_urls text[] := '{}'; v_recipe_urls text[] := '{}';
BEGIN
  IF NOT public._may_configure_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can configure menus');
  END IF;
  IF p_items_action NOT IN ('keep', 'delete') OR p_recipes_action NOT IN ('keep', 'visible', 'delete') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid choice');
  END IF;
  IF p_items_action = 'delete' AND NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can delete a menu');
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = p_organization_id;

  IF p_items_action = 'delete' THEN
    -- Menu 2 = season 'summer' in both scopes (shared-scope 'both' items stay:
    -- they are on Menu 1 too). Same rule as delete_menu(slot 2).
    WITH d AS (
      DELETE FROM public.menu_items
       WHERE organization_id = p_organization_id AND season = 'summer'
      RETURNING thumbnail_url
    ) SELECT count(*), COALESCE(array_remove(array_agg(d.thumbnail_url), NULL), '{}')
        INTO v_items, v_item_urls FROM d;

    IF p_delete_custom_categories AND v_scope = 'per_menu' THEN
      FOR v_c IN
        SELECT id FROM public.menu_categories
         WHERE organization_id = p_organization_id AND menu_slot = 2 AND system_key IS NULL
      LOOP
        WITH ds AS (DELETE FROM public.menu_subcategories WHERE category_id = v_c.id RETURNING 1)
          SELECT count(*) INTO v_n FROM ds;
        v_subs := v_subs + COALESCE(v_n, 0);
        DELETE FROM public.menu_categories WHERE id = v_c.id;
        v_cats := v_cats + 1;
      END LOOP;
    END IF;
  END IF;

  IF p_recipes_action = 'delete' THEN
    WITH d AS (
      DELETE FROM public.summer_libation_recipes
       WHERE organization_id = p_organization_id
      RETURNING thumbnail_url
    ) SELECT count(*), COALESCE(array_remove(array_agg(d.thumbnail_url), NULL), '{}')
        INTO v_recipes, v_recipe_urls FROM d;
  END IF;

  UPDATE public.organizations
     SET menu2_recipes_visible = (p_recipes_action = 'visible'), updated_at = now()
   WHERE id = p_organization_id;

  RETURN json_build_object('success', true,
    'items_deleted', v_items, 'recipes_deleted', v_recipes,
    'categories_deleted', v_cats, 'subcategories_deleted', v_subs,
    'item_thumbnail_urls', to_json(v_item_urls), 'recipe_thumbnail_urls', to_json(v_recipe_urls));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fold a stand-alone custom category into another category
--    p_target_subcategory_id NULL → the category becomes a subcategory named
--    after itself (merging into a same-named one if it exists); otherwise its
--    items are filed under that existing subcategory. Meal flags follow the
--    new home exactly as manage_menu_subcategory_move does.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_menu_category_move_into(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_target_category_id uuid,
  p_target_subcategory_id uuid DEFAULT NULL,
  p_available_for_lunch boolean DEFAULT false,
  p_available_for_dinner boolean DEFAULT false
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_src record; v_tgt record; v_tsub record;
  v_scope text; v_season text; v_lunch boolean; v_dinner boolean; v_meal boolean;
  v_nsubs integer; v_final_sub text; v_sub_id uuid; v_base integer; v_order integer;
  v_moved integer := 0; v_merged boolean := false; v_created boolean := false; v_woke boolean := false;
BEGIN
  IF NOT public._may_edit_menu_categories(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;

  SELECT c.id, c.display_name, c.display_name_es, c.system_key, c.filter_behavior, c.menu_slot, c.is_hidden
    INTO v_src
    FROM public.menu_categories c
   WHERE c.id = p_category_id AND c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_src.system_key IS NOT NULL OR v_src.filter_behavior = 'weekly_specials' THEN
    RETURN json_build_object('success', false, 'error', 'Built-in categories cannot be moved into another category');
  END IF;
  SELECT count(*) INTO v_nsubs FROM public.menu_subcategories s WHERE s.category_id = v_src.id;
  IF v_nsubs > 0 THEN
    RETURN json_build_object('success', false, 'error', 'Only a category with no subcategories can be moved into another');
  END IF;

  SELECT c.id, c.display_name, c.filter_behavior, c.menu_slot, c.is_hidden
    INTO v_tgt
    FROM public.menu_categories c
   WHERE c.id = p_target_category_id AND c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_tgt.id = v_src.id THEN
    RETURN json_build_object('success', false, 'error', 'Pick a different category');
  END IF;
  IF v_tgt.menu_slot <> v_src.menu_slot THEN
    RETURN json_build_object('success', false, 'error', 'Pick a category on the same menu');
  END IF;
  IF v_tgt.filter_behavior = 'weekly_specials' THEN
    RETURN json_build_object('success', false, 'error', 'The specials category cannot hold subcategories');
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = p_organization_id;
  v_season := CASE v_src.menu_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  v_meal   := v_scope IS DISTINCT FROM 'per_menu' AND v_tgt.filter_behavior IN ('lunch', 'dinner');
  v_lunch  := v_tgt.filter_behavior = 'lunch'  OR (v_meal AND COALESCE(p_available_for_lunch, false));
  v_dinner := v_tgt.filter_behavior = 'dinner' OR (v_meal AND COALESCE(p_available_for_dinner, false));

  IF p_target_subcategory_id IS NOT NULL THEN
    SELECT s.id, s.display_name, s.system_key, s.is_cocktail_fed, s.is_hidden
      INTO v_tsub
      FROM public.menu_subcategories s
     WHERE s.id = p_target_subcategory_id AND s.category_id = v_tgt.id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Subcategory not found');
    END IF;
  ELSE
    SELECT s.id, s.display_name, s.system_key, s.is_cocktail_fed, s.is_hidden
      INTO v_tsub
      FROM public.menu_subcategories s
     WHERE s.category_id = v_tgt.id AND lower(s.display_name) = lower(v_src.display_name);
  END IF;

  IF v_tsub.id IS NOT NULL THEN
    IF v_tsub.system_key IS NOT NULL OR v_tsub.is_cocktail_fed THEN
      RETURN json_build_object('success', false, 'error', 'Recipe-linked subcategories cannot receive menu items');
    END IF;
    v_merged := true;
    v_sub_id := v_tsub.id;
    v_final_sub := v_tsub.display_name;
    SELECT COALESCE(MAX(mi.display_order) + 1, 0) INTO v_base
      FROM public.menu_items mi
     WHERE mi.organization_id = p_organization_id
       AND lower(mi.category) = lower(v_tgt.display_name)
       AND lower(mi.subcategory) = lower(v_tsub.display_name)
       AND (v_season IS NULL OR mi.season = v_season);
  ELSE
    SELECT COALESCE(MAX(s.display_order) + 1, 0) INTO v_order
      FROM public.menu_subcategories s WHERE s.category_id = v_tgt.id;
    INSERT INTO public.menu_subcategories
      (organization_id, category_id, display_name, display_name_es, display_order, is_hidden, menu_slot)
    VALUES
      (p_organization_id, v_tgt.id, v_src.display_name, v_src.display_name_es, v_order, false, v_tgt.menu_slot)
    RETURNING id INTO v_sub_id;
    v_created := true;
    v_final_sub := v_src.display_name;
    v_base := NULL;
  END IF;

  -- Every item filed under the category comes along (a category with no
  -- subcategories files its items with subcategory NULL or a stale name).
  WITH moved AS (
    UPDATE public.menu_items mi
       SET category = v_tgt.display_name,
           subcategory = v_final_sub,
           available_for_lunch = v_lunch,
           available_for_dinner = v_dinner,
           display_order = CASE WHEN v_base IS NULL THEN mi.display_order
                                ELSE v_base + COALESCE(mi.display_order, 0) END
     WHERE mi.organization_id = p_organization_id
       AND lower(mi.category) = lower(v_src.display_name)
       AND (v_season IS NULL OR mi.season = v_season)
    RETURNING 1
  ) SELECT count(*) INTO v_moved FROM moved;

  IF v_merged THEN
    UPDATE public.menu_subcategories
       SET is_hidden = (is_hidden AND v_src.is_hidden), updated_at = now()
     WHERE id = v_tsub.id;
  END IF;

  DELETE FROM public.menu_categories WHERE id = v_src.id;

  IF v_tgt.is_hidden THEN
    UPDATE public.menu_categories SET is_hidden = false, updated_at = now() WHERE id = v_tgt.id;
    v_woke := true;
  END IF;

  RETURN json_build_object('success', true,
    'items_moved', v_moved, 'merged', v_merged, 'created_subcategory', v_created,
    'subcategory_id', v_sub_id, 'subcategory_name', v_final_sub, 'category_unhidden', v_woke);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Libation recipe writes: actor-gated, org from the actor, hard deletes.
--    Same signatures + return types as before.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  DELETE FROM public.libation_recipes WHERE id = p_recipe_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_summer_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  DELETE FROM public.summer_libation_recipes WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  INSERT INTO public.libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url,
     display_order, created_by, organization_id, subcategory_id, is_featured)
  VALUES
    (p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure, p_thumbnail_url,
     p_display_order, p_user_id, v_org, p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_summer_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  INSERT INTO public.summer_libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url,
     display_order, created_by, organization_id, subcategory_id, is_featured)
  VALUES
    (p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure, p_thumbnail_url,
     p_display_order, p_user_id, v_org, p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  UPDATE public.libation_recipes SET
    name = p_name, price = p_price, category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = p_thumbnail_url, display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  UPDATE public.summer_libation_recipes SET
    name = p_name, price = p_price, category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = p_thumbnail_url, display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_libation_recipes(p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  UPDATE public.libation_recipes r SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND r.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_summer_libation_recipes(p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  UPDATE public.summer_libation_recipes r SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND r.organization_id = v_org;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants — the app calls as anon.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_menu2(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_menu_category_move_into(uuid, uuid, uuid, uuid, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retire_menu2(uuid, uuid, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_move_into(uuid, uuid, uuid, uuid, uuid, boolean, boolean) TO anon, authenticated, service_role;
