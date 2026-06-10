-- ============================================================================
-- D4: Owner RPCs for managing the menu category tree.
--
-- All are SECURITY DEFINER, owner-gated, and return JSON {success, error?}.
-- The client calls them under the anon role (custom auth), so security lives
-- here, not in RLS. Rename cascades to menu_items (free-text category/subcategory
-- strings). Built-ins (system_key NOT NULL) cannot be deleted — hide instead.
--
-- create_menu_item / update_menu_item are deliberately untouched: items keep
-- storing category/subcategory as the chosen display_name strings.
-- ============================================================================

-- Shared owner check.
CREATE OR REPLACE FUNCTION public._is_org_owner(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND owner_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_category_create(
  p_organization_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_color text DEFAULT '#607D8B'
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_order integer; v_name text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Category name is required');
  END IF;
  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
    FROM public.menu_categories WHERE organization_id = p_organization_id;
  INSERT INTO public.menu_categories (organization_id, display_name, color, display_order)
    VALUES (p_organization_id, v_name, COALESCE(NULLIF(btrim(p_color), ''), '#607D8B'), v_order)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A category with that name already exists');
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_category_rename(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_new_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_name text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_new_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Category name is required');
  END IF;
  SELECT display_name INTO v_old
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  UPDATE public.menu_categories SET display_name = v_name, updated_at = now() WHERE id = p_category_id;
  -- Cascade to items. Lunch/Dinner items also store category='Lunch'/'Dinner'
  -- as a string, so retag by the OLD display_name regardless of filter_behavior.
  UPDATE public.menu_items SET category = v_name
    WHERE organization_id = p_organization_id AND category = v_old;
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A category with that name already exists');
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_category_set_color(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_color text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  UPDATE public.menu_categories
    SET color = COALESCE(NULLIF(btrim(p_color), ''), color), updated_at = now()
    WHERE id = p_category_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_category_set_hidden(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_is_hidden boolean
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  UPDATE public.menu_categories
    SET is_hidden = COALESCE(p_is_hidden, is_hidden), updated_at = now()
    WHERE id = p_category_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_category_reorder(
  p_organization_id uuid,
  p_user_id uuid,
  p_ordered_ids uuid[]
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  UPDATE public.menu_categories mc
    SET display_order = t.ord - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
    WHERE mc.id = t.id AND mc.organization_id = p_organization_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_category_delete(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_syskey text; v_unc_id uuid; v_order integer;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT display_name, system_key INTO v_old, v_syskey
    FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  IF v_syskey IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Built-in categories cannot be deleted; hide them instead');
  END IF;
  -- Only spin up the Uncategorized bucket + reassign when items actually use this
  -- category; an empty category just gets deleted (no residue bucket).
  IF EXISTS (SELECT 1 FROM public.menu_items WHERE organization_id = p_organization_id AND category = v_old) THEN
    SELECT id INTO v_unc_id
      FROM public.menu_categories
      WHERE organization_id = p_organization_id AND lower(display_name) = 'uncategorized' AND id <> p_category_id;
    IF v_unc_id IS NULL THEN
      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
        FROM public.menu_categories WHERE organization_id = p_organization_id;
      INSERT INTO public.menu_categories (organization_id, display_name, filter_behavior, color, display_order)
        VALUES (p_organization_id, 'Uncategorized', 'category_match', '#607D8B', v_order)
        RETURNING id INTO v_unc_id;
    END IF;
    UPDATE public.menu_items SET category = 'Uncategorized', subcategory = NULL
      WHERE organization_id = p_organization_id AND category = v_old;
  END IF;
  DELETE FROM public.menu_categories WHERE id = p_category_id;  -- subcategories cascade via FK
  RETURN json_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Subcategories
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_create(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_display_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_order integer; v_name text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory name is required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_categories WHERE id = p_category_id AND organization_id = p_organization_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Category not found');
  END IF;
  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_order
    FROM public.menu_subcategories WHERE category_id = p_category_id;
  INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order)
    VALUES (p_organization_id, p_category_id, v_name, v_order)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_rename(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_new_name text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_cat_id uuid; v_cat_name text; v_name text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  v_name := btrim(coalesce(p_new_name, ''));
  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory name is required');
  END IF;
  SELECT display_name, category_id INTO v_old, v_cat_id
    FROM public.menu_subcategories WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  SELECT display_name INTO v_cat_name FROM public.menu_categories WHERE id = v_cat_id;
  UPDATE public.menu_subcategories SET display_name = v_name, updated_at = now() WHERE id = p_subcategory_id;
  -- Cascade scoped by parent category name (subcat names repeat across categories).
  UPDATE public.menu_items SET subcategory = v_name
    WHERE organization_id = p_organization_id AND subcategory = v_old AND category = v_cat_name;
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'A subcategory with that name already exists');
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_set_hidden(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid,
  p_is_hidden boolean
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  UPDATE public.menu_subcategories
    SET is_hidden = COALESCE(p_is_hidden, is_hidden), updated_at = now()
    WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_reorder(
  p_organization_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_ordered_ids uuid[]
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  UPDATE public.menu_subcategories ms
    SET display_order = t.ord - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
    WHERE ms.id = t.id AND ms.category_id = p_category_id AND ms.organization_id = p_organization_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_menu_subcategory_delete(
  p_organization_id uuid,
  p_user_id uuid,
  p_subcategory_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old text; v_syskey text; v_cat_id uuid; v_cat_name text;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can manage categories');
  END IF;
  SELECT display_name, system_key, category_id INTO v_old, v_syskey, v_cat_id
    FROM public.menu_subcategories WHERE id = p_subcategory_id AND organization_id = p_organization_id;
  IF v_old IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subcategory not found');
  END IF;
  IF v_syskey IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Built-in subcategories cannot be deleted; hide them instead');
  END IF;
  SELECT display_name INTO v_cat_name FROM public.menu_categories WHERE id = v_cat_id;
  UPDATE public.menu_items SET subcategory = NULL
    WHERE organization_id = p_organization_id AND subcategory = v_old AND category = v_cat_name;
  DELETE FROM public.menu_subcategories WHERE id = p_subcategory_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit; client calls run under the anon role via custom auth).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._is_org_owner(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_create(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_rename(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_set_color(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_set_hidden(uuid, uuid, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_reorder(uuid, uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_category_delete(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_create(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_rename(uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_set_hidden(uuid, uuid, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_reorder(uuid, uuid, uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_menu_subcategory_delete(uuid, uuid, uuid) TO anon, authenticated;
