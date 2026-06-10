-- ============================================================================
-- D4 Part B (2/4): materialize per-menu trees + owner-gated scope toggle.
--
-- materialize_org_per_menu_categories clones the slot-0 (shared) tree into
-- slot 1 and slot 2 so each menu starts identical, then diverges as the owner
-- edits. Idempotent: skips a slot that already has rows. The slot-0 tree is
-- never touched, so switching back to 'shared' is lossless.
--
-- Grandfathering: existing items are NOT migrated. Legacy 'both' items stay
-- visible in both menus (the client load query keeps season IN (active,'both')).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.materialize_org_per_menu_categories(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot smallint;
  r_cat  record;
  v_new_cat_id uuid;
BEGIN
  FOREACH v_slot IN ARRAY ARRAY[1, 2]::smallint[] LOOP
    -- Skip if this slot is already materialized (idempotent).
    IF EXISTS (SELECT 1 FROM public.menu_categories WHERE organization_id = p_org_id AND menu_slot = v_slot) THEN
      CONTINUE;
    END IF;

    FOR r_cat IN
      SELECT * FROM public.menu_categories
      WHERE organization_id = p_org_id AND menu_slot = 0
      ORDER BY display_order
    LOOP
      INSERT INTO public.menu_categories
        (organization_id, display_name, system_key, filter_behavior, color, display_order, is_hidden, menu_slot)
      VALUES
        (p_org_id, r_cat.display_name, r_cat.system_key, r_cat.filter_behavior,
         r_cat.color, r_cat.display_order, r_cat.is_hidden, v_slot)
      RETURNING id INTO v_new_cat_id;

      -- Clone this category's subcategories under the freshly-created per-slot parent.
      INSERT INTO public.menu_subcategories
        (organization_id, category_id, display_name, system_key, is_cocktail_fed, display_order, is_hidden, menu_slot)
      SELECT p_org_id, v_new_cat_id, s.display_name, s.system_key, s.is_cocktail_fed,
             s.display_order, s.is_hidden, v_slot
      FROM public.menu_subcategories s
      WHERE s.category_id = r_cat.id;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.materialize_org_per_menu_categories(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner-gated scope toggle. Forward (per_menu) materializes the two trees;
-- backward (shared) just flips the flag. Items are never migrated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_org_menu_category_scope(
  p_organization_id uuid,
  p_user_id uuid,
  p_scope text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change the menu scope');
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
$$;

GRANT EXECUTE ON FUNCTION public.set_org_menu_category_scope(uuid, uuid, text) TO anon, authenticated;
