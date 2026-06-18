-- Host Assistant custom sections: per-org, owner/manager-managed link-tile sections
-- (Resy/Toast/SevenRooms/academies…) shown above the checklists. OpenTable Academy
-- becomes a seeded, editable, hideable default section. App uses anon custom auth →
-- writes go through SECURITY DEFINER RPCs gated by a passed actor user-id.

CREATE TABLE IF NOT EXISTS public.host_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  card_subtitle text,
  instructions text,
  card_image_url text,
  card_image_shape text NOT NULL DEFAULT 'square',
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  system_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_sections_org_idx ON public.host_sections(organization_id);

CREATE TABLE IF NOT EXISTS public.host_section_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.host_sections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text,
  image_url text,
  image_shape text NOT NULL DEFAULT 'banner',
  system_asset_key text,
  link_url text,
  link_description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_section_tiles_section_idx ON public.host_section_tiles(section_id);

-- RLS: anon/public may READ (org filtering done in the query); writes only via the
-- SECURITY DEFINER RPCs below (which bypass RLS), so no write policies.
ALTER TABLE public.host_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_section_tiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_sections_read ON public.host_sections;
CREATE POLICY host_sections_read ON public.host_sections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS host_section_tiles_read ON public.host_section_tiles;
CREATE POLICY host_section_tiles_read ON public.host_section_tiles FOR SELECT TO anon, authenticated USING (true);

-- Authorization helper: caller must be a manager/owner of the given org.
CREATE OR REPLACE FUNCTION public._can_manage_host(p_user_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND organization_id = p_org_id AND role IN ('manager','owner')
  );
$$;
GRANT EXECUTE ON FUNCTION public._can_manage_host(uuid, uuid) TO anon, authenticated;

-- ── Section CRUD ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_host_section(
  p_actor_id uuid, p_org_id uuid, p_title text, p_card_subtitle text DEFAULT NULL,
  p_instructions text DEFAULT NULL, p_card_image_url text DEFAULT NULL,
  p_card_image_shape text DEFAULT 'square', p_icon text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_order integer;
BEGIN
  IF NOT public._can_manage_host(p_actor_id, p_org_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT COALESCE(MAX(display_order)+1, 0) INTO v_order FROM public.host_sections WHERE organization_id = p_org_id;
  INSERT INTO public.host_sections (organization_id, title, card_subtitle, instructions, card_image_url, card_image_shape, icon, display_order)
  VALUES (p_org_id, p_title, p_card_subtitle, p_instructions, p_card_image_url, COALESCE(p_card_image_shape,'square'), p_icon, v_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_host_section(uuid,uuid,text,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_host_section(
  p_actor_id uuid, p_section_id uuid, p_title text, p_card_subtitle text,
  p_instructions text, p_card_image_url text, p_card_image_shape text,
  p_icon text, p_is_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_sections WHERE id = p_section_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.host_sections SET
    title = p_title, card_subtitle = p_card_subtitle, instructions = p_instructions,
    card_image_url = p_card_image_url, card_image_shape = COALESCE(p_card_image_shape,'square'),
    icon = p_icon, is_active = COALESCE(p_is_active, is_active), updated_at = now()
  WHERE id = p_section_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_host_section(uuid,uuid,text,text,text,text,text,text,boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_host_section(p_actor_id uuid, p_section_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_sections WHERE id = p_section_id;
  IF v_org IS NULL THEN RETURN true; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.host_sections WHERE id = p_section_id;  -- tiles cascade
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_host_section(uuid,uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reorder_host_sections(p_actor_id uuid, p_org_id uuid, p_ordered_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public._can_manage_host(p_actor_id, p_org_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.host_sections s SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE s.id = o.id AND s.organization_id = p_org_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.reorder_host_sections(uuid,uuid,uuid[]) TO anon, authenticated;

-- ── Tile CRUD ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_host_section_tile(
  p_actor_id uuid, p_section_id uuid, p_title text DEFAULT NULL, p_image_url text DEFAULT NULL,
  p_image_shape text DEFAULT 'banner', p_link_url text DEFAULT NULL, p_link_description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid; v_id uuid; v_order integer;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_sections WHERE id = p_section_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT COALESCE(MAX(display_order)+1, 0) INTO v_order FROM public.host_section_tiles WHERE section_id = p_section_id;
  INSERT INTO public.host_section_tiles (section_id, organization_id, title, image_url, image_shape, link_url, link_description, display_order)
  VALUES (p_section_id, v_org, p_title, p_image_url, COALESCE(p_image_shape,'banner'), p_link_url, p_link_description, v_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_host_section_tile(uuid,uuid,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_host_section_tile(
  p_actor_id uuid, p_tile_id uuid, p_title text, p_image_url text,
  p_image_shape text, p_link_url text, p_link_description text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_section_tiles WHERE id = p_tile_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Tile not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.host_section_tiles SET
    title = p_title, image_url = p_image_url, image_shape = COALESCE(p_image_shape,'banner'),
    link_url = p_link_url, link_description = p_link_description, updated_at = now()
  WHERE id = p_tile_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_host_section_tile(uuid,uuid,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_host_section_tile(p_actor_id uuid, p_tile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_section_tiles WHERE id = p_tile_id;
  IF v_org IS NULL THEN RETURN true; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.host_section_tiles WHERE id = p_tile_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_host_section_tile(uuid,uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reorder_host_section_tiles(p_actor_id uuid, p_section_id uuid, p_ordered_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_sections WHERE id = p_section_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.host_section_tiles t SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE t.id = o.id AND t.section_id = p_section_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.reorder_host_section_tiles(uuid,uuid,uuid[]) TO anon, authenticated;

-- ── Seed: OpenTable Academy as an editable default section (generic, no cmacula) ─
CREATE OR REPLACE FUNCTION public.seed_org_host_sections(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_section_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.host_sections WHERE organization_id = p_org_id AND system_key = 'opentable_academy') THEN
    RETURN;
  END IF;
  INSERT INTO public.host_sections (organization_id, title, card_subtitle, instructions, icon, card_image_shape, system_key, display_order, is_active)
  VALUES (p_org_id, 'OpenTable Academy',
    'Earn your Beginner, Intermediate, and Advanced OpenTable Academy Certifications',
    E'Please select a course below, and log in to your OpenTable Academy account to complete each course.\nIf you do not have an account, please register and log in to start the courses.\nCourses range from 30-60 minutes, but are not timed and can be completed at your own pace.',
    'graduationcap.fill', 'square', 'opentable_academy', 0, true)
  RETURNING id INTO v_section_id;
  INSERT INTO public.host_section_tiles (section_id, organization_id, system_asset_key, image_shape, link_url, display_order) VALUES
    (v_section_id, p_org_id, 'opentable_beginner', 'banner', 'https://opentable.docebosaas.com/academy/learn/signin', 0),
    (v_section_id, p_org_id, 'opentable_intermediate', 'banner', 'https://opentable.docebosaas.com/academy/learn/signin', 1),
    (v_section_id, p_org_id, 'opentable_advanced', 'banner', 'https://opentable.docebosaas.com/academy/learn/signin', 2);
END; $$;
GRANT EXECUTE ON FUNCTION public.seed_org_host_sections(uuid) TO anon, authenticated;
