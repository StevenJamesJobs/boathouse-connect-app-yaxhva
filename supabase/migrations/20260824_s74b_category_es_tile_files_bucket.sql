-- s74b (smoke round 1 fixes).
-- 1) Checklist CATEGORY names gain Spanish: name_es on both category tables,
--    get_checklist_categories returns it, and two translations writers in the
--    house COALESCE-KEEP shape.
-- 2) Host section tiles get a dedicated file slot: a tile may now carry BOTH a
--    web link (link_url) and an attached file (file_url) — the viewer offers a
--    choice when both are present. Existing file-tiles (storage URLs parked in
--    link_url by the first s74 build) are moved over. The tile RPCs gain
--    p_file_url; the update path COALESCE-KEEPs it (old clients editing a tile
--    can't strip its file) with an explicit p_clear_file for deliberate removal.
-- 3) host-section-images bucket: lift the image-only mime allowlist + raise the
--    size cap to 50MB so host_section_file uploads pass. Bucket-level config is
--    the outer bound only — every write still goes through the storage-broker,
--    whose per-purpose gates (images 10MB / files 50MB any-type) remain the
--    real enforcement.

-- ── 1. Category translations ────────────────────────────────────────────────
ALTER TABLE public.checklist_categories           ADD COLUMN IF NOT EXISTS name_es text;
ALTER TABLE public.bartender_checklist_categories ADD COLUMN IF NOT EXISTS name_es text;

DROP FUNCTION public.get_checklist_categories(uuid, boolean, text);
CREATE FUNCTION public.get_checklist_categories(p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, name_es text, display_order integer, checklist_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;
  RETURN QUERY EXECUTE format(
    'SELECT c.id, c.name, c.name_es, c.display_order, c.checklist_type FROM public.%I c
      WHERE c.organization_id = $1 AND c.is_active = true
        AND ($2 IS NULL OR c.checklist_type = $2)
      ORDER BY c.display_order', v_tbl)
    USING v_org, p_checklist_type;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_checklist_categories(uuid, boolean, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_checklist_category_translations_actor(p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.checklist_categories
     SET name_es = COALESCE(p_name_es, name_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_checklist_category_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_bartender_checklist_category_translations_actor(p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.bartender_checklist_categories
     SET name_es = COALESCE(p_name_es, name_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_bartender_checklist_category_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;

-- ── 2. Tile file slot ───────────────────────────────────────────────────────
ALTER TABLE public.host_section_tiles ADD COLUMN IF NOT EXISTS file_url text;

-- First-build file-tiles parked their storage URL in link_url — move them.
UPDATE public.host_section_tiles
   SET file_url = link_url, link_url = NULL
 WHERE link_url LIKE '%/storage/v1/object/public/%';

DROP FUNCTION public.create_host_section_tile(uuid, uuid, text, text, text, text, text);
CREATE FUNCTION public.create_host_section_tile(p_actor_id uuid, p_section_id uuid, p_title text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_image_shape text DEFAULT 'banner'::text, p_link_url text DEFAULT NULL::text, p_link_description text DEFAULT NULL::text, p_file_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_id uuid; v_order integer;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_sections WHERE id = p_section_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT COALESCE(MAX(display_order)+1, 0) INTO v_order FROM public.host_section_tiles WHERE section_id = p_section_id;
  INSERT INTO public.host_section_tiles (section_id, organization_id, title, image_url, image_shape, link_url, link_description, file_url, display_order)
  VALUES (p_section_id, v_org, p_title, p_image_url, COALESCE(p_image_shape,'banner'), p_link_url, p_link_description, p_file_url, v_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.create_host_section_tile(uuid, uuid, text, text, text, text, text, text) TO anon, authenticated, service_role;

DROP FUNCTION public.update_host_section_tile(uuid, uuid, text, text, text, text, text);
CREATE FUNCTION public.update_host_section_tile(p_actor_id uuid, p_tile_id uuid, p_title text, p_image_url text, p_image_shape text, p_link_url text, p_link_description text, p_file_url text DEFAULT NULL::text, p_clear_file boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.host_section_tiles WHERE id = p_tile_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Tile not found'; END IF;
  IF NOT public._can_manage_host(p_actor_id, v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.host_section_tiles SET
    title = p_title, image_url = p_image_url, image_shape = COALESCE(p_image_shape,'banner'),
    link_url = p_link_url, link_description = p_link_description,
    -- COALESCE-KEEP: an old client (no p_file_url) cannot strip a tile's file;
    -- the new client clears deliberately via p_clear_file.
    file_url = CASE WHEN p_clear_file THEN NULL ELSE COALESCE(p_file_url, file_url) END,
    updated_at = now()
  WHERE id = p_tile_id;
  RETURN true;
END; $function$;
GRANT EXECUTE ON FUNCTION public.update_host_section_tile(uuid, uuid, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;

-- ── 3. Bucket config ────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = NULL, file_size_limit = 52428800
 WHERE id = 'host-section-images';
