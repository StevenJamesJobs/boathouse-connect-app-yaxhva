-- B2/B3 session 47 Batch C-1: guides_and_training was full-CRUD public. Harden the 3 existing
-- (zero-gate) write RPCs IN PLACE (same names/sigs incl. their p_organization_id DEFAULT NULL;
-- no shipped build ever called them -- client used .from(), now rewired to these) + add member
-- reads. update_guide_translations pinned; its missing-actor-arg hole stays in the B5 family sweep.

CREATE OR REPLACE FUNCTION public.create_guide(
  p_user_id uuid, p_title text, p_description text, p_category text, p_thumbnail_url text,
  p_file_url text, p_file_type text, p_file_name text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_user_id AND role IN ('manager','owner');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN RAISE EXCEPTION 'Org mismatch'; END IF;
  INSERT INTO public.guides_and_training
    (title, description, category, thumbnail_url, file_url, file_type, file_name, display_order, created_by, organization_id)
  VALUES (p_title, p_description, p_category, p_thumbnail_url, p_file_url, p_file_type, p_file_name, p_display_order, p_user_id, v_org)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_guide(
  p_user_id uuid, p_guide_id uuid, p_title text, p_description text, p_category text, p_thumbnail_url text,
  p_file_url text, p_file_type text, p_file_name text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_user_id AND role IN ('manager','owner');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN RAISE EXCEPTION 'Org mismatch'; END IF;
  UPDATE public.guides_and_training SET
    title = p_title, description = p_description, category = p_category, thumbnail_url = p_thumbnail_url,
    file_url = p_file_url, file_type = p_file_type, file_name = p_file_name, display_order = p_display_order,
    updated_at = now()
  WHERE id = p_guide_id AND organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_guide(p_user_id uuid, p_guide_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_user_id AND role IN ('manager','owner');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN RAISE EXCEPTION 'Org mismatch'; END IF;
  DELETE FROM public.guides_and_training WHERE id = p_guide_id AND organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.get_guides(p_actor_id uuid, p_include_inactive boolean DEFAULT false)
RETURNS SETOF public.guides_and_training
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT g.*
  FROM public.guides_and_training g
  WHERE g.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id)
    AND (
      g.is_active
      OR (p_include_inactive AND EXISTS (
        SELECT 1 FROM public.users u2
        WHERE u2.id = p_actor_id AND u2.organization_id = g.organization_id
          AND u2.role IN ('manager','owner')
      ))
    )
  ORDER BY g.category ASC, g.display_order ASC;
$$;

CREATE OR REPLACE FUNCTION public.reorder_guides(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role IN ('manager','owner');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.guides_and_training g SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE g.id = o.id AND g.organization_id = v_org;
END; $$;

ALTER FUNCTION public.update_guide_translations(uuid, text, text, uuid) SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION
  public.get_guides(uuid, boolean),
  public.reorder_guides(uuid, uuid[])
TO anon, authenticated;
