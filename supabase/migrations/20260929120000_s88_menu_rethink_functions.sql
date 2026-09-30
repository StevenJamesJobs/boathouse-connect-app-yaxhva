-- s88: the Menu rethink — three ADDITIVE functions. No existing function is
-- changed, so every shipped client keeps its contract (apply_parsed_menu and
-- manage_menu_subcategory_delete stay exactly as they are for old builds).
--
--   manage_menu_subcategory_move    move a subcategory (and its items) to another category
--   manage_menu_subcategory_remove  delete a subcategory, deciding where its items go first
--   apply_parsed_menu_v2            the upload apply with a per-section destination
--
-- menu_items.category / .subcategory are free text matched by NAME (lower()),
-- so a move is an UPDATE by name — the same mechanism the rename functions use.
-- The app calls these as `anon` (statement_timeout 3s): arrays + plain
-- statements only, no per-call temp tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Move a subcategory to another category on the same menu.
--    A same-named subcategory in the target MERGES (items re-filed behind the
--    existing ones, the moved row deleted). A hidden target switches on.
--    Meal tags follow the new home: its own meal is always on; in shared scope
--    the other meal is the caller's choice; a non-meal home clears both.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_move(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_target_category_id uuid,
  p_available_for_lunch boolean DEFAULT false,
  p_available_for_dinner boolean DEFAULT false
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sub record; v_src record; v_tgt record; v_clash record;
  v_scope text; v_season text; v_lunch boolean; v_dinner boolean; v_meal boolean;
  v_final_sub text; v_base integer; v_order integer;
  v_moved integer := 0; v_merged boolean := false; v_woke boolean := false;
BEGIN
  IF NOT public._may_edit_menu_categories(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;

  SELECT s.id, s.display_name, s.system_key, s.is_cocktail_fed, s.category_id, s.menu_slot, s.is_hidden
    INTO v_sub
    FROM public.menu_subcategories s
   WHERE s.id = p_subcategory_id AND s.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_sub.system_key IS NOT NULL OR v_sub.is_cocktail_fed THEN
    RETURN json_build_object('success', false, 'error', 'Recipe-linked subcategories cannot be moved');
  END IF;

  SELECT c.id, c.display_name INTO v_src
    FROM public.menu_categories c WHERE c.id = v_sub.category_id;

  SELECT c.id, c.display_name, c.filter_behavior, c.menu_slot, c.is_hidden
    INTO v_tgt
    FROM public.menu_categories c
   WHERE c.id = p_target_category_id AND c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_tgt.id = v_sub.category_id THEN
    RETURN json_build_object('success', false, 'error', 'That subcategory is already in this category');
  END IF;
  IF v_tgt.menu_slot <> v_sub.menu_slot THEN
    RETURN json_build_object('success', false, 'error', 'Pick a category on the same menu');
  END IF;
  IF v_tgt.filter_behavior = 'weekly_specials' THEN
    RETURN json_build_object('success', false, 'error', 'The specials category cannot hold subcategories');
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = p_organization_id;
  v_season := CASE v_sub.menu_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  v_meal   := v_scope IS DISTINCT FROM 'per_menu' AND v_tgt.filter_behavior IN ('lunch', 'dinner');
  v_lunch  := v_tgt.filter_behavior = 'lunch'  OR (v_meal AND COALESCE(p_available_for_lunch, false));
  v_dinner := v_tgt.filter_behavior = 'dinner' OR (v_meal AND COALESCE(p_available_for_dinner, false));

  SELECT s.id, s.display_name, s.is_cocktail_fed, s.is_hidden
    INTO v_clash
    FROM public.menu_subcategories s
   WHERE s.category_id = v_tgt.id AND lower(s.display_name) = lower(v_sub.display_name);
  IF FOUND THEN
    IF v_clash.is_cocktail_fed THEN
      RETURN json_build_object('success', false, 'error', 'That category has a recipe-linked subcategory with this name');
    END IF;
    v_merged := true;
    v_final_sub := v_clash.display_name;
    SELECT COALESCE(MAX(mi.display_order) + 1, 0) INTO v_base
      FROM public.menu_items mi
     WHERE mi.organization_id = p_organization_id
       AND lower(mi.category) = lower(v_tgt.display_name)
       AND lower(mi.subcategory) = lower(v_clash.display_name)
       AND (v_season IS NULL OR mi.season = v_season);
  ELSE
    v_final_sub := v_sub.display_name;
    v_base := NULL;
  END IF;

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
       AND lower(mi.subcategory) = lower(v_sub.display_name)
       AND (v_season IS NULL OR mi.season = v_season)
    RETURNING 1
  ) SELECT count(*) INTO v_moved FROM moved;

  IF v_merged THEN
    UPDATE public.menu_subcategories
       SET is_hidden = (is_hidden AND v_sub.is_hidden), updated_at = now()
     WHERE id = v_clash.id;
    DELETE FROM public.menu_subcategories WHERE id = v_sub.id;
  ELSE
    SELECT COALESCE(MAX(s.display_order) + 1, 0) INTO v_order
      FROM public.menu_subcategories s WHERE s.category_id = v_tgt.id;
    UPDATE public.menu_subcategories
       SET category_id = v_tgt.id, display_order = v_order, updated_at = now()
     WHERE id = v_sub.id;
  END IF;

  IF v_tgt.is_hidden THEN
    UPDATE public.menu_categories SET is_hidden = false, updated_at = now() WHERE id = v_tgt.id;
    v_woke := true;
  END IF;

  RETURN json_build_object('success', true,
    'items_moved', v_moved, 'merged', v_merged, 'category_unhidden', v_woke);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Delete a subcategory, deciding where its items go FIRST.
--    p_items_action: 'move'   → re-file them under p_target_subcategory_id
--                               (a sibling in the same category)
--                    'delete' → delete them too; their image URLs come back so
--                               the client can broker-delete the files
--    A subcategory with no items needs neither. (The old
--    manage_menu_subcategory_delete nulls the items' subcategory, which leaves
--    them with no tab of their own.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_remove(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_items_action text DEFAULT NULL,
  p_target_subcategory_id uuid DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sub record; v_cat_name text; v_tgt record; v_season text;
  v_count integer; v_base integer;
  v_moved integer := 0; v_deleted integer := 0; v_urls text[] := '{}';
BEGIN
  IF NOT public._may_edit_menu_categories(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;

  SELECT s.id, s.display_name, s.system_key, s.is_cocktail_fed, s.category_id, s.menu_slot
    INTO v_sub
    FROM public.menu_subcategories s
   WHERE s.id = p_subcategory_id AND s.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_sub.system_key IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Built-in subcategories cannot be deleted; hide them instead');
  END IF;
  IF v_sub.is_cocktail_fed THEN
    RETURN json_build_object('success', false, 'error', 'Recipe-linked subcategories cannot be deleted; hide them instead');
  END IF;

  SELECT c.display_name INTO v_cat_name FROM public.menu_categories c WHERE c.id = v_sub.category_id;
  v_season := CASE v_sub.menu_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;

  SELECT count(*) INTO v_count
    FROM public.menu_items mi
   WHERE mi.organization_id = p_organization_id
     AND lower(mi.category) = lower(v_cat_name)
     AND lower(mi.subcategory) = lower(v_sub.display_name)
     AND (v_season IS NULL OR mi.season = v_season);

  IF v_count > 0 THEN
    IF p_items_action = 'move' THEN
      SELECT s.id, s.display_name, s.is_cocktail_fed INTO v_tgt
        FROM public.menu_subcategories s
       WHERE s.id = p_target_subcategory_id
         AND s.category_id = v_sub.category_id
         AND s.id <> v_sub.id;
      IF NOT FOUND OR v_tgt.is_cocktail_fed THEN
        RETURN json_build_object('success', false, 'error', 'Pick a subcategory in the same category for the items');
      END IF;
      SELECT COALESCE(MAX(mi.display_order) + 1, 0) INTO v_base
        FROM public.menu_items mi
       WHERE mi.organization_id = p_organization_id
         AND lower(mi.category) = lower(v_cat_name)
         AND lower(mi.subcategory) = lower(v_tgt.display_name)
         AND (v_season IS NULL OR mi.season = v_season);
      WITH moved AS (
        UPDATE public.menu_items mi
           SET subcategory = v_tgt.display_name,
               display_order = v_base + COALESCE(mi.display_order, 0)
         WHERE mi.organization_id = p_organization_id
           AND lower(mi.category) = lower(v_cat_name)
           AND lower(mi.subcategory) = lower(v_sub.display_name)
           AND (v_season IS NULL OR mi.season = v_season)
        RETURNING 1
      ) SELECT count(*) INTO v_moved FROM moved;
    ELSIF p_items_action = 'delete' THEN
      WITH gone AS (
        DELETE FROM public.menu_items mi
         WHERE mi.organization_id = p_organization_id
           AND lower(mi.category) = lower(v_cat_name)
           AND lower(mi.subcategory) = lower(v_sub.display_name)
           AND (v_season IS NULL OR mi.season = v_season)
        RETURNING mi.thumbnail_url
      )
      SELECT count(*), COALESCE(array_agg(g.thumbnail_url) FILTER (WHERE g.thumbnail_url IS NOT NULL AND g.thumbnail_url <> ''), '{}')
        INTO v_deleted, v_urls
        FROM gone g;
    ELSE
      RETURN json_build_object('success', false, 'error', 'Choose where the items go first');
    END IF;
  END IF;

  DELETE FROM public.menu_subcategories WHERE id = v_sub.id;

  RETURN json_build_object('success', true,
    'items_moved', v_moved, 'items_deleted', v_deleted, 'thumbnail_urls', to_json(v_urls));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. apply_parsed_menu_v2 — the upload apply with a destination per section.
--
--    p_payload = { "sections": [ {
--        "name":          text   the scanned section (kept for the record),
--        "category_id":   uuid   an EXISTING category to file into, or null
--        "category_name": text   the category to find-or-create when id is null
--        "available_for_lunch" / "available_for_dinner": bool  (shared-scope meal homes)
--        "groups": [ { "subcategory_id": uuid|null, "subcategory_name": text|null,
--                      "items": [ { name, description, price, is_gluten_free, … } ] } ]
--    } ] }
--
--    Differences from v1: a section can land inside a built-in (or any existing
--    category), which switches a hidden one back on; Libations is never
--    auto-hidden; and built-ins left empty are re-ordered BEHIND the categories
--    in use (Libations first among them, still visible), so the owner's own
--    sections lead the menu.
--
--    ALL-OR-NOTHING: a bad destination RAISEs, and the handler at the foot of
--    the block returns the message — catching it rolls back every write the
--    block made (a plain early RETURN would have kept a half-applied menu).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_parsed_menu_v2(
  p_user_id uuid,
  p_organization_id uuid,
  p_upload_id uuid,
  p_payload jsonb,
  p_target_slot smallint,
  p_mode text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_scope text; v_season text; v_tree_slot smallint;
  v_sec jsonb; v_grp jsonb; v_item jsonb;
  v_catname text; v_subname text; v_itemname text;
  v_cat record; v_cat_id uuid; v_cat_name text; v_cat_fb text;
  v_sub_id uuid; v_sub_name text;
  v_lunch boolean; v_dinner boolean; v_meal boolean;
  v_ord integer; v_item_ord integer;
  v_touched uuid[] := '{}';
  c_cats int := 0; c_subs int := 0; c_ins int := 0; c_skip int := 0; c_del int := 0;
  c_cats_del int := 0; c_woke int := 0;
BEGIN
  IF NOT public._may_upload_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to apply a menu');
  END IF;
  IF p_mode NOT IN ('add', 'replace') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid mode');
  END IF;
  IF p_target_slot NOT IN (0, 1, 2) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid target menu');
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = p_organization_id;

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

  FOR v_sec IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'sections', '[]'::jsonb)) AS t(value)
  LOOP
    -- ── the section's home category ──
    v_cat_id := NULL;
    IF NULLIF(v_sec->>'category_id', '') IS NOT NULL THEN
      SELECT c.id, c.display_name, c.filter_behavior, c.is_hidden INTO v_cat
        FROM public.menu_categories c
       WHERE c.id = (v_sec->>'category_id')::uuid
         AND c.organization_id = p_organization_id AND c.menu_slot = v_tree_slot;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Category not found';
      END IF;
    ELSE
      v_catname := btrim(COALESCE(v_sec->>'category_name', v_sec->>'name', ''));
      CONTINUE WHEN v_catname = '';
      SELECT c.id, c.display_name, c.filter_behavior, c.is_hidden INTO v_cat
        FROM public.menu_categories c
       WHERE c.organization_id = p_organization_id AND c.menu_slot = v_tree_slot
         AND lower(c.display_name) = lower(v_catname)
       LIMIT 1;
      IF NOT FOUND THEN
        SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
          FROM public.menu_categories WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot;
        BEGIN
          INSERT INTO public.menu_categories (organization_id, display_name, color, display_order, menu_slot)
            VALUES (p_organization_id, v_catname, '#607D8B', v_ord, v_tree_slot);
          c_cats := c_cats + 1;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
        SELECT c.id, c.display_name, c.filter_behavior, c.is_hidden INTO v_cat
          FROM public.menu_categories c
         WHERE c.organization_id = p_organization_id AND c.menu_slot = v_tree_slot
           AND lower(c.display_name) = lower(v_catname)
         LIMIT 1;
      END IF;
    END IF;
    v_cat_id := v_cat.id; v_cat_name := v_cat.display_name; v_cat_fb := v_cat.filter_behavior;

    v_meal   := v_scope IS DISTINCT FROM 'per_menu' AND v_cat_fb IN ('lunch', 'dinner');
    v_lunch  := v_cat_fb = 'lunch'  OR (v_meal AND COALESCE((v_sec->>'available_for_lunch')::boolean, false));
    v_dinner := v_cat_fb = 'dinner' OR (v_meal AND COALESCE((v_sec->>'available_for_dinner')::boolean, false));

    FOR v_grp IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_sec->'groups', '[]'::jsonb)) AS t(value)
    LOOP
      CONTINUE WHEN jsonb_array_length(COALESCE(v_grp->'items', '[]'::jsonb)) = 0;

      -- ── the group's subcategory (existing by id, find-or-create by name, or none) ──
      -- The specials category holds no subcategories: its items file directly.
      v_sub_id := NULL; v_sub_name := NULL;
      IF v_cat_fb = 'weekly_specials' THEN
        NULL;
      ELSIF NULLIF(v_grp->>'subcategory_id', '') IS NOT NULL THEN
        SELECT s.id, s.display_name INTO v_sub_id, v_sub_name
          FROM public.menu_subcategories s
         WHERE s.id = (v_grp->>'subcategory_id')::uuid AND s.category_id = v_cat_id
           AND NOT s.is_cocktail_fed;
        IF v_sub_id IS NULL THEN
          RAISE EXCEPTION 'Subcategory not found';
        END IF;
      ELSE
        v_subname := btrim(COALESCE(v_grp->>'subcategory_name', ''));
        IF v_subname <> '' THEN
          SELECT s.id, s.display_name INTO v_sub_id, v_sub_name
            FROM public.menu_subcategories s
           WHERE s.category_id = v_cat_id AND lower(s.display_name) = lower(v_subname)
             AND NOT s.is_cocktail_fed
           LIMIT 1;
          IF v_sub_id IS NULL THEN
            SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
              FROM public.menu_subcategories WHERE category_id = v_cat_id;
            BEGIN
              INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order, menu_slot)
                VALUES (p_organization_id, v_cat_id, v_subname, v_ord, v_tree_slot)
                RETURNING id, display_name INTO v_sub_id, v_sub_name;
              c_subs := c_subs + 1;
            EXCEPTION WHEN unique_violation THEN
              RAISE EXCEPTION 'That category has a recipe-linked subcategory with this name';
            END;
          END IF;
        END IF;
      END IF;
      -- a subcategory that receives items shows them
      IF v_sub_id IS NOT NULL THEN
        UPDATE public.menu_subcategories SET is_hidden = false, updated_at = now()
         WHERE id = v_sub_id AND is_hidden;
      END IF;

      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_item_ord
        FROM public.menu_items
       WHERE organization_id = p_organization_id AND lower(category) = lower(v_cat_name)
         AND lower(COALESCE(subcategory, '')) = lower(COALESCE(v_sub_name, ''))
         AND season = v_season;

      FOR v_item IN
        SELECT value FROM jsonb_array_elements(v_grp->'items') AS t(value)
      LOOP
        v_itemname := btrim(COALESCE(v_item->>'name', ''));
        CONTINUE WHEN v_itemname = '';

        IF p_mode = 'add' AND EXISTS (
          SELECT 1 FROM public.menu_items
           WHERE organization_id = p_organization_id AND season = v_season
             AND lower(category) = lower(v_cat_name)
             AND lower(COALESCE(subcategory, '')) = lower(COALESCE(v_sub_name, ''))
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
          v_cat_name,
          v_sub_name,
          v_lunch,
          v_dinner,
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
        IF NOT (v_cat_id = ANY(v_touched)) THEN v_touched := v_touched || v_cat_id; END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- A category that just received items shows them (a hidden built-in switches on).
  WITH woke AS (
    UPDATE public.menu_categories c
       SET is_hidden = false, updated_at = now()
     WHERE c.id = ANY(v_touched) AND c.is_hidden
    RETURNING 1
  ) SELECT count(*) INTO c_woke FROM woke;

  -- Built-in starters that ended up empty step out of the way. Featured
  -- Specials is structural (the Welcome Specials tab) and Libations is fed by
  -- the recipe editors, not by menu items — both always stay visible.
  UPDATE public.menu_categories c
     SET is_hidden = true, updated_at = now()
   WHERE c.organization_id = p_organization_id
     AND c.menu_slot = v_tree_slot
     AND c.system_key IS NOT NULL
     AND c.system_key NOT IN ('cat.weekly_specials', 'cat.libations')
     AND c.is_hidden = false
     AND NOT EXISTS (
       SELECT 1 FROM public.menu_items mi
        WHERE mi.organization_id = p_organization_id
          AND mi.is_active
          AND lower(mi.category) = lower(c.display_name)
          -- the shared tree serves BOTH menus: in use on either one counts
          AND (v_tree_slot = 0 OR mi.season = v_season OR mi.season = 'both')
     );

  -- Replace-mode housekeeping (unchanged from v1): prior uploads' CUSTOM
  -- categories that now hold zero items for the menu(s) this slot serves are
  -- upload clutter -> delete them (subcategories cascade via FK).
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
              AND lower(mi.category) = lower(c.display_name)
              AND (v_tree_slot = 0 OR mi.season = v_season OR mi.season = 'both')
         )
      RETURNING 1
    ) SELECT count(*) INTO c_cats_del FROM gone;
  END IF;

  -- The owner's own sections lead; built-ins nobody uses go to the back.
  -- Rank 0 keeps its relative order (everything in use); rank 1 is an idle
  -- Libations (visible, no items and no recipes yet); rank 2 the hidden empties.
  WITH ranked AS (
    SELECT c.id,
           row_number() OVER (
             ORDER BY
               CASE
                 WHEN c.system_key IS NULL OR c.system_key = 'cat.weekly_specials' THEN 0
                 WHEN EXISTS (
                   SELECT 1 FROM public.menu_items mi
                    WHERE mi.organization_id = p_organization_id AND mi.is_active
                      AND lower(mi.category) = lower(c.display_name)
                      AND (v_tree_slot = 0 OR mi.season = v_season OR mi.season = 'both')
                 ) THEN 0
                 WHEN c.system_key = 'cat.libations' AND (
                   EXISTS (SELECT 1 FROM public.libation_recipes r
                            WHERE r.organization_id = p_organization_id AND COALESCE(r.is_active, true))
                   OR EXISTS (SELECT 1 FROM public.summer_libation_recipes r
                               WHERE r.organization_id = p_organization_id AND r.is_active)
                 ) THEN 0
                 WHEN c.system_key = 'cat.libations' THEN 1
                 ELSE 2
               END,
               c.display_order, c.created_at
           ) - 1 AS ord
      FROM public.menu_categories c
     WHERE c.organization_id = p_organization_id AND c.menu_slot = v_tree_slot
  )
  UPDATE public.menu_categories c
     SET display_order = r.ord
    FROM ranked r
   WHERE c.id = r.id AND c.display_order IS DISTINCT FROM r.ord;

  UPDATE public.menu_uploads
     SET status = 'applied', apply_mode = p_mode, target_menu_slot = p_target_slot,
         categories_created = c_cats, subcategories_created = c_subs,
         items_inserted = c_ins, items_skipped = c_skip, items_deleted = c_del,
         updated_at = now()
   WHERE id = p_upload_id AND organization_id = p_organization_id;

  RETURN json_build_object('success', true,
    'categories_created', c_cats, 'subcategories_created', c_subs,
    'items_inserted', c_ins, 'items_skipped', c_skip, 'items_deleted', c_del,
    'categories_deleted', c_cats_del, 'categories_unhidden', c_woke);
EXCEPTION WHEN raise_exception THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- The app reaches these as anon / authenticated (custom auth — the actor is the
-- explicit p_user_id and every function gates on it).
REVOKE ALL ON FUNCTION public.manage_menu_subcategory_move(uuid, uuid, uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_menu_subcategory_remove(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_parsed_menu_v2(uuid, uuid, uuid, jsonb, smallint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_move(uuid, uuid, uuid, uuid, boolean, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_remove(uuid, uuid, uuid, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_parsed_menu_v2(uuid, uuid, uuid, jsonb, smallint, text) TO anon, authenticated, service_role;
