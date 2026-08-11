-- s68 A3 (finish) + A3b: apply_parsed_menu joins the shared upload rule, and the
-- org_settings.menu grant gets a real server-side write path.
-- APPLIED LIVE via Supabase MCP 2026-08-11 (version 20260811162044). Repo copy for the record.
--
-- apply_parsed_menu: gate swapped _is_org_owner -> _may_upload_menu (+ message);
-- body otherwise identical to live, and carries the five s68 dietary payload reads.
-- _may_configure_menu: owner OR manager with the org_settings.menu grant; EXECUTE revoked
-- from PUBLIC/anon/authenticated (internal predicate, same posture as _is_org_owner).
-- update_organization_settings: owner keeps full access; a granted manager may write ONLY
-- the five menu fields (menu_count, menu_1_name/2_name, menu_1_icon/2_icon) — any non-NULL
-- non-menu param is rejected outright.
-- set_org_menu_category_scope: owner -> _may_configure_menu (scope is a menu setting).
--
-- The full applied SQL for apply_parsed_menu is the live pg_get_functiondef body; the three
-- smaller functions follow in full.

CREATE OR REPLACE FUNCTION public.apply_parsed_menu(p_user_id uuid, p_organization_id uuid, p_upload_id uuid, p_payload jsonb, p_target_slot smallint, p_mode text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_scope text; v_season text; v_tree_slot smallint;
  v_cat jsonb; v_sub jsonb; v_item jsonb;
  v_catname text; v_subname text; v_itemname text;
  v_cat_id uuid; v_cat_canonical text; v_sub_canonical text;
  v_ord integer; v_item_ord integer;
  c_cats int := 0; c_subs int := 0; c_ins int := 0; c_skip int := 0; c_del int := 0;
  c_cats_del int := 0;
BEGIN
  IF NOT public._may_upload_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to apply a menu');
  END IF;
  IF p_mode NOT IN ('add','replace') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid mode');
  END IF;
  IF p_target_slot NOT IN (0,1,2) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid target menu');
  END IF;

  SELECT menu_category_scope INTO v_scope FROM public.organizations WHERE id = p_organization_id;

  IF v_scope = 'per_menu' THEN
    IF p_target_slot = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Per-menu organizations must target Menu 1 or Menu 2');
    END IF;
    v_tree_slot := p_target_slot;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' ELSE 'winter' END;
  ELSE
    v_tree_slot := 0;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' WHEN 1 THEN 'winter' ELSE 'both' END;
  END IF;

  IF p_mode = 'replace' THEN
    WITH d AS (
      DELETE FROM public.menu_items
       WHERE organization_id = p_organization_id AND season = v_season
      RETURNING 1
    ) SELECT count(*) INTO c_del FROM d;
  END IF;

  FOR v_cat IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'categories', '[]'::jsonb)) AS t(value)
  LOOP
    v_catname := btrim(COALESCE(v_cat->>'name', ''));
    CONTINUE WHEN v_catname = '';

    SELECT id, display_name INTO v_cat_id, v_cat_canonical
      FROM public.menu_categories
      WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot
        AND lower(display_name) = lower(v_catname)
      LIMIT 1;
    IF v_cat_id IS NULL THEN
      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
        FROM public.menu_categories WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot;
      BEGIN
        INSERT INTO public.menu_categories (organization_id, display_name, color, display_order, menu_slot)
          VALUES (p_organization_id, v_catname, '#607D8B', v_ord, v_tree_slot)
          RETURNING id, display_name INTO v_cat_id, v_cat_canonical;
        c_cats := c_cats + 1;
      EXCEPTION WHEN unique_violation THEN
        SELECT id, display_name INTO v_cat_id, v_cat_canonical
          FROM public.menu_categories
          WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot
            AND lower(display_name) = lower(v_catname) LIMIT 1;
      END;
    END IF;

    FOR v_sub IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_cat->'subcategories', '[]'::jsonb)) AS t(value)
    LOOP
      v_subname := btrim(COALESCE(v_sub->>'name', ''));
      v_sub_canonical := NULL;
      IF v_subname <> '' THEN
        SELECT display_name INTO v_sub_canonical
          FROM public.menu_subcategories
          WHERE category_id = v_cat_id AND lower(display_name) = lower(v_subname) LIMIT 1;
        IF v_sub_canonical IS NULL THEN
          SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
            FROM public.menu_subcategories WHERE category_id = v_cat_id;
          BEGIN
            INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order, menu_slot)
              VALUES (p_organization_id, v_cat_id, v_subname, v_ord, v_tree_slot)
              RETURNING display_name INTO v_sub_canonical;
            c_subs := c_subs + 1;
          EXCEPTION WHEN unique_violation THEN
            SELECT display_name INTO v_sub_canonical
              FROM public.menu_subcategories
              WHERE category_id = v_cat_id AND lower(display_name) = lower(v_subname) LIMIT 1;
          END;
        END IF;
      END IF;

      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_item_ord
        FROM public.menu_items
        WHERE organization_id = p_organization_id AND category = v_cat_canonical
          AND subcategory IS NOT DISTINCT FROM v_sub_canonical AND season = v_season;

      FOR v_item IN
        SELECT value FROM jsonb_array_elements(COALESCE(v_sub->'items', '[]'::jsonb)) AS t(value)
      LOOP
        v_itemname := btrim(COALESCE(v_item->>'name', ''));
        CONTINUE WHEN v_itemname = '';

        IF p_mode = 'add' AND EXISTS (
          SELECT 1 FROM public.menu_items
          WHERE organization_id = p_organization_id AND season = v_season
            AND category = v_cat_canonical
            AND subcategory IS NOT DISTINCT FROM v_sub_canonical
            AND lower(name) = lower(v_itemname)
        ) THEN
          c_skip := c_skip + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.menu_items (
          name, description, price, category, subcategory,
          available_for_lunch, available_for_dinner,
          is_gluten_free, is_gluten_free_available, is_vegetarian, is_vegetarian_available,
          is_dairy_free, is_egg_free, is_nut_free, is_sugar_free, is_salt_free,
          thumbnail_url, thumbnail_shape, display_order, created_by,
          glass_price, bottle_price, member_bottle_price,
          flavor_profile, unique_selling_points,
          season, organization_id
        ) VALUES (
          v_itemname,
          NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
          COALESCE(NULLIF(btrim(COALESCE(v_item->>'price', '')), ''), ''),
          v_cat_canonical,
          v_sub_canonical,
          COALESCE((v_item->>'available_for_lunch')::boolean, false),
          COALESCE((v_item->>'available_for_dinner')::boolean, false),
          COALESCE((v_item->>'is_gluten_free')::boolean, false),
          COALESCE((v_item->>'is_gluten_free_available')::boolean, false),
          COALESCE((v_item->>'is_vegetarian')::boolean, false),
          COALESCE((v_item->>'is_vegetarian_available')::boolean, false),
          COALESCE((v_item->>'is_dairy_free')::boolean, false),
          COALESCE((v_item->>'is_egg_free')::boolean, false),
          COALESCE((v_item->>'is_nut_free')::boolean, false),
          COALESCE((v_item->>'is_sugar_free')::boolean, false),
          COALESCE((v_item->>'is_salt_free')::boolean, false),
          NULL, 'square', v_item_ord, p_user_id,
          NULLIF(btrim(COALESCE(v_item->>'glass_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'bottle_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'member_bottle_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'flavor_profile', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'unique_selling_points', '')), ''),
          v_season, p_organization_id
        );
        v_item_ord := v_item_ord + 1;
        c_ins := c_ins + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Auto-hide built-in starter categories on the target menu that ended up empty,
  -- so they don't clutter the owner's freshly-uploaded categories. Featured/Weekly
  -- Specials is structural (drives the Welcome Specials tab) and always stays visible.
  UPDATE public.menu_categories c
     SET is_hidden = true, updated_at = now()
   WHERE c.organization_id = p_organization_id
     AND c.menu_slot = v_tree_slot
     AND c.system_key IS NOT NULL
     AND c.system_key <> 'cat.weekly_specials'
     AND c.is_hidden = false
     AND NOT EXISTS (
       SELECT 1 FROM public.menu_items mi
        WHERE mi.organization_id = p_organization_id
          AND mi.is_active
          AND mi.category = c.display_name
          AND (mi.season = v_season OR mi.season = 'both')
     );

  -- Replace-mode housekeeping: prior uploads' CUSTOM categories that now hold
  -- zero items for the menu(s) this slot serves are upload clutter -> delete
  -- them (subcategories cascade via FK). Built-ins are never deleted; shared
  -- slot 0 serves both menus so its emptiness check spans ALL seasons.
  IF p_mode = 'replace' THEN
    WITH gone AS (
      DELETE FROM public.menu_categories c
       WHERE c.organization_id = p_organization_id
         AND c.menu_slot = v_tree_slot
         AND c.system_key IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.menu_items mi
            WHERE mi.organization_id = p_organization_id
              AND mi.is_active
              AND mi.category = c.display_name
              AND (v_tree_slot = 0 OR mi.season = v_season OR mi.season = 'both')
         )
      RETURNING 1
    ) SELECT count(*) INTO c_cats_del FROM gone;
  END IF;

  UPDATE public.menu_uploads
     SET status = 'applied', apply_mode = p_mode, target_menu_slot = p_target_slot,
         categories_created = c_cats, subcategories_created = c_subs,
         items_inserted = c_ins, items_skipped = c_skip, items_deleted = c_del,
         updated_at = now()
   WHERE id = p_upload_id AND organization_id = p_organization_id;

  RETURN json_build_object('success', true,
    'categories_created', c_cats, 'subcategories_created', c_subs,
    'items_inserted', c_ins, 'items_skipped', c_skip, 'items_deleted', c_del,
    'categories_deleted', c_cats_del);
END;
$function$;

CREATE FUNCTION public._may_configure_menu(p_org uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT public._is_org_owner(p_org, p_actor)
      OR EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.manager_permissions mp
            ON mp.organization_id = u.organization_id
         WHERE u.id = p_actor
           AND u.organization_id = p_org
           AND u.role = 'manager'
           AND mp.permission_key = 'org_settings.menu'
           AND mp.granted
      );
$function$;
REVOKE ALL ON FUNCTION public._may_configure_menu(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_organization_settings(p_organization_id uuid, p_user_id uuid, p_name text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_zip text DEFAULT NULL::text, p_weather_location text DEFAULT NULL::text, p_google_maps_query text DEFAULT NULL::text, p_reward_currency_name text DEFAULT NULL::text, p_allow_self_signup boolean DEFAULT NULL::boolean, p_menu_count integer DEFAULT NULL::integer, p_menu_1_name text DEFAULT NULL::text, p_menu_2_name text DEFAULT NULL::text, p_default_password text DEFAULT NULL::text, p_menu_1_icon text DEFAULT NULL::text, p_menu_2_icon text DEFAULT NULL::text, p_header_icon text DEFAULT NULL::text, p_staff_can_view_roster boolean DEFAULT NULL::boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_is_owner boolean;
  v_result JSON;
BEGIN
  v_is_owner := public._is_org_owner(p_organization_id, p_user_id);

  IF NOT v_is_owner THEN
    IF NOT public._may_configure_menu(p_organization_id, p_user_id) THEN
      RETURN json_build_object('success', false, 'error', 'Only the organization owner can update settings');
    END IF;
    IF p_name IS NOT NULL OR p_address IS NOT NULL OR p_city IS NOT NULL OR p_state IS NOT NULL
       OR p_zip IS NOT NULL OR p_weather_location IS NOT NULL OR p_google_maps_query IS NOT NULL
       OR p_reward_currency_name IS NOT NULL OR p_allow_self_signup IS NOT NULL
       OR p_default_password IS NOT NULL OR p_header_icon IS NOT NULL
       OR p_staff_can_view_roster IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'Your menu permission covers menu settings only');
    END IF;
  END IF;

  UPDATE organizations SET
    name = COALESCE(p_name, name),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    zip = COALESCE(p_zip, zip),
    weather_location = COALESCE(p_weather_location, weather_location),
    google_maps_query = COALESCE(p_google_maps_query, google_maps_query),
    reward_currency_name = COALESCE(p_reward_currency_name, reward_currency_name),
    allow_self_signup = COALESCE(p_allow_self_signup, allow_self_signup),
    menu_count = COALESCE(p_menu_count, menu_count),
    menu_1_name = COALESCE(p_menu_1_name, menu_1_name),
    menu_2_name = COALESCE(p_menu_2_name, menu_2_name),
    default_password = COALESCE(p_default_password, default_password),
    menu_1_icon = COALESCE(p_menu_1_icon, menu_1_icon),
    menu_2_icon = COALESCE(p_menu_2_icon, menu_2_icon),
    header_icon = COALESCE(p_header_icon, header_icon),
    staff_can_view_roster = COALESCE(p_staff_can_view_roster, staff_can_view_roster),
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_org_menu_category_scope(p_organization_id uuid, p_user_id uuid, p_scope text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NOT public._may_configure_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to change the menu scope');
  END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('shared', 'per_menu') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid menu scope');
  END IF;

  IF p_scope = 'per_menu' THEN
    PERFORM public.materialize_org_per_menu_categories(p_organization_id);
  END IF;

  UPDATE public.organizations SET menu_category_scope = p_scope WHERE id = p_organization_id;
  RETURN json_build_object('success', true, 'scope', p_scope);
END;
$function$;
