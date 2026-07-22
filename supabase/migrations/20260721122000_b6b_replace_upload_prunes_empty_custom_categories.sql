-- B6b: Replace-mode uploads prune now-empty CUSTOM categories (product ask
-- 2026-07-21). Repeated "Replace" uploads used to leave prior uploads' custom
-- categories behind with zero items — visible clutter in the menu editor.
-- After the existing built-in auto-hide step, replace mode now DELETEs custom
-- (system_key IS NULL) categories in the target slot that hold zero items for
-- the menu(s) that slot serves. Rules:
--   - 'replace' mode only; 'add' never deletes anything.
--   - Built-ins are never deleted (auto-hide handles them, specials stays).
--   - Per-menu slots (1/2) check season = slot-season OR 'both'.
--   - Shared slot 0 serves BOTH menus, so the emptiness check spans ALL
--     seasons (a winter-only category on a shared tree is NOT empty).
--   - Same-named categories in the other menu's slot are untouched.
--   - menu_subcategories cascade via FK (ON DELETE CASCADE, verified).
-- Returns/records a new counter: categories_deleted.
--
-- ROLLBACK: re-apply the prior definition (this file minus the
-- "Replace-mode housekeeping" block, categories_deleted counter, and the
-- json/menu_uploads counter additions) — prior def preserved in
-- 20260615000000_menu_upload_writeback.sql lineage.

CREATE OR REPLACE FUNCTION public.apply_parsed_menu(p_user_id uuid, p_organization_id uuid, p_upload_id uuid, p_payload jsonb, p_target_slot smallint, p_mode text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can apply a menu');
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
