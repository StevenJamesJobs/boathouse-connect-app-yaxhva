-- Phase 2: bulk-reorder RPCs for the 3 bartender recipe editors
-- (Menu 1 Libations, Menu 2 Libations, Purees & Simple Syrups).
--
-- SECURITY DEFINER so they work under the app's anon-key custom auth.
-- (libation_recipes' direct UPDATE policy is gated on auth.uid()+role='manager',
-- which is NULL for the anon key, so a direct .update() would be silently blocked.
-- The puree/summer tables have permissive public/true UPDATE policies, but we route
-- all three through RPCs uniformly for consistency + a single round-trip.)
-- Gate on role IN ('manager','owner') to mirror delete_libation_recipe.

DROP FUNCTION IF EXISTS public.reorder_libation_recipes(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.reorder_summer_libation_recipes(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.reorder_puree_syrup_recipes(uuid, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.reorder_libation_recipes(
  p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reorder recipes';
  END IF;
  UPDATE libation_recipes r SET display_order = o.idx - 1, updated_at = NOW()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND (p_organization_id IS NULL OR r.organization_id = p_organization_id);
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_summer_libation_recipes(
  p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reorder recipes';
  END IF;
  UPDATE summer_libation_recipes r SET display_order = o.idx - 1, updated_at = NOW()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND (p_organization_id IS NULL OR r.organization_id = p_organization_id);
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_puree_syrup_recipes(
  p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reorder recipes';
  END IF;
  UPDATE puree_syrup_recipes r SET display_order = o.idx - 1, updated_at = NOW()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND (p_organization_id IS NULL OR r.organization_id = p_organization_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.reorder_libation_recipes(uuid, uuid[], uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_summer_libation_recipes(uuid, uuid[], uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_puree_syrup_recipes(uuid, uuid[], uuid) TO anon, authenticated, service_role;
