-- ============================================================================
-- D4 Part B (3/4): make category create slot-aware and rename/delete cascades
-- slot-scoped, so editing one menu's tree never disturbs the other.
--
-- Slot -> season map for the menu_items cascade:
--   slot 0 (shared) -> NULL  => retag ALL seasons (winter/summer/both) — today's behavior
--   slot 1 (Menu 1) -> 'winter'
--   slot 2 (Menu 2) -> 'summer'
-- Legacy 'both' items are intentionally left untouched in per-menu slots
-- (grandfathered); they keep their stored string and render wherever it matches.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Category create: gains p_menu_slot. Drop the old 4-arg signature first to
-- avoid PostgREST overload ambiguity.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.manage_menu_category_create(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.manage_menu_category_create(
  p_organization_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_color text DEFAULT '#607D8B',
  p_menu_slot integer DEFAULT 0
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_order integer; v_name text; v_slot smallint;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Category name is required');
  END IF;
  v_slot := COALESCE(p_menu_slot, 0);
  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
    FROM public.menu_categories WHERE organization_id = p_organization_id AND menu_slot = v_slot;
  INSERT INTO public.menu_categories (organization_id, display_name, color, display_order, menu_slot)
    VALUES (p_organization_id, v_name, COALESCE(NULLIF(btrim(p_color), ''), '#607D8B'), v_order, v_slot)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A category with that name already exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- Category rename: cascade scoped to the category's slot/season.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_category_rename(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_new_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_name text; v_slot smallint; v_season text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_new_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Category name is required');
  END IF;
  SELECT display_name, menu_slot INTO v_old, v_slot
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  v_season := CASE v_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  UPDATE public.menu_categories SET display_name = v_name, updated_at = now() WHERE id = p_category_id;
  UPDATE public.menu_items SET category = v_name
    WHERE organization_id = p_organization_id AND category = v_old
      AND (v_season IS NULL OR season = v_season);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A category with that name already exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- Category delete: built-ins protected; orphaned items reassigned to an
-- "Uncategorized" bucket created in the SAME slot, scoped by season.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_category_delete(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_syskey text; v_slot smallint; v_season text; v_unc_id uuid; v_order integer;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT display_name, system_key, menu_slot INTO v_old, v_syskey, v_slot
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_syskey IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Built-in categories cannot be deleted; hide them instead');
  END IF;
  v_season := CASE v_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  IF EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE organization_id = p_organization_id AND category = v_old
      AND (v_season IS NULL OR season = v_season)
  ) THEN
    SELECT id INTO v_unc_id
      FROM public.menu_categories
      WHERE organization_id = p_organization_id AND menu_slot = v_slot
        AND lower(display_name) = 'uncategorized' AND id <> p_category_id;
    IF v_unc_id IS NULL THEN
      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
        FROM public.menu_categories WHERE organization_id = p_organization_id AND menu_slot = v_slot;
      INSERT INTO public.menu_categories (organization_id, display_name, filter_behavior, color, display_order, menu_slot)
        VALUES (p_organization_id, 'Uncategorized', 'category_match', '#607D8B', v_order, v_slot)
        RETURNING id INTO v_unc_id;
    END IF;
    UPDATE public.menu_items SET category = 'Uncategorized', subcategory = NULL
      WHERE organization_id = p_organization_id AND category = v_old
        AND (v_season IS NULL OR season = v_season);
  END IF;
  DELETE FROM public.menu_categories WHERE id = p_category_id;  -- subcategories cascade via FK
  RETURN json_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Subcategory create: derive menu_slot from the parent category.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_create(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_display_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_order integer; v_name text; v_slot smallint;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory name is required');
  END IF;
  SELECT menu_slot INTO v_slot
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
    FROM public.menu_subcategories WHERE category_id = p_category_id;
  INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order, menu_slot)
    VALUES (p_organization_id, p_category_id, v_name, v_order, v_slot)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- Subcategory rename: cascade scoped by parent-category name AND slot/season.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_rename(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_new_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_cat_id uuid; v_cat_name text; v_name text; v_slot smallint; v_season text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_new_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory name is required');
  END IF;
  SELECT display_name, category_id, menu_slot INTO v_old, v_cat_id, v_slot
    FROM public.menu_subcategories WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  SELECT display_name INTO v_cat_name FROM public.menu_categories WHERE id = v_cat_id;
  v_season := CASE v_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  UPDATE public.menu_subcategories SET display_name = v_name, updated_at = now() WHERE id = p_subcategory_id;
  UPDATE public.menu_items SET subcategory = v_name
    WHERE organization_id = p_organization_id AND subcategory = v_old AND category = v_cat_name
      AND (v_season IS NULL OR season = v_season);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- Subcategory delete: null out the tag on matching items, scoped by slot/season.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_delete(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_syskey text; v_cat_id uuid; v_cat_name text; v_slot smallint; v_season text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT display_name, system_key, category_id, menu_slot INTO v_old, v_syskey, v_cat_id, v_slot
    FROM public.menu_subcategories WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_syskey IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Built-in subcategories cannot be deleted; hide them instead');
  END IF;
  SELECT display_name INTO v_cat_name FROM public.menu_categories WHERE id = v_cat_id;
  v_season := CASE v_slot WHEN 1 THEN 'winter' WHEN 2 THEN 'summer' ELSE NULL END;
  UPDATE public.menu_items SET subcategory = NULL
    WHERE organization_id = p_organization_id AND subcategory = v_old AND category = v_cat_name
      AND (v_season IS NULL OR season = v_season);
  DELETE FROM public.menu_subcategories WHERE id = p_subcategory_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Re-grant (signature changed for create; the rest are CREATE OR REPLACE).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.manage_menu_category_create(uuid, uuid, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_rename(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_delete(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_create(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_rename(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_delete(uuid, uuid, uuid) TO anon, authenticated;
