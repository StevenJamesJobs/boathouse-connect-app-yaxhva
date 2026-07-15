-- Batch B2/B3 (menu-core) — lock menu_items / menu_categories / menu_subcategories / menu_uploads
-- reads (+ the last direct menu_items writes: display_order reorder + the upload insert). Item
-- CRUD (create/update/delete_menu_item, apply_parsed_menu) and category/subcategory writes
-- (manage_menu_*) were ALREADY gated RPCs. The hole here is READS: menu_items SELECT was
-- `is_active=true` with NO org filter (anon reads any org's active menu); categories/subcategories
-- were TO-public ALL; menu_uploads TO-public. Reads reuse the generic _recipe_source_org helper so
-- the games' "use sample data" path (reads menu content cross-org from the sample org
-- 'mcloones-boathouse') keeps working, bounded to own-org-or-sample. SECURITY DEFINER, sp pinned.
-- content_images is intentionally NOT here — it serves announcement/event/feature images and moves
-- to the content-postings batch.

-- ── menu_items READ (member; returns the full row so select('*') callers are unaffected) ──
CREATE OR REPLACE FUNCTION public.get_menu_items(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL, p_categories text[] DEFAULT NULL,
  p_weekly_special boolean DEFAULT NULL, p_season text DEFAULT NULL)
RETURNS TABLE(
  id uuid, name text, description text, price text, category text, subcategory text,
  available_for_lunch boolean, available_for_dinner boolean, is_gluten_free boolean,
  is_gluten_free_available boolean, is_vegetarian boolean, is_vegetarian_available boolean,
  thumbnail_url text, thumbnail_shape text, display_order integer, is_active boolean,
  created_by uuid, created_at timestamptz, updated_at timestamptz, name_es text,
  description_es text, location text, location_es text, glass_price text, bottle_price text,
  member_bottle_price text, flavor_profile text, flavor_profile_es text,
  unique_selling_points text, unique_selling_points_es text, season text, organization_id uuid,
  is_weekly_special boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.description, m.price, m.category, m.subcategory,
           m.available_for_lunch, m.available_for_dinner, m.is_gluten_free,
           m.is_gluten_free_available, m.is_vegetarian, m.is_vegetarian_available,
           m.thumbnail_url, m.thumbnail_shape, m.display_order, m.is_active, m.created_by,
           m.created_at, m.updated_at, m.name_es, m.description_es, m.location, m.location_es,
           m.glass_price, m.bottle_price, m.member_bottle_price, m.flavor_profile,
           m.flavor_profile_es, m.unique_selling_points, m.unique_selling_points_es, m.season,
           m.organization_id, m.is_weekly_special
      FROM public.menu_items m
     WHERE m.organization_id = v_src
       AND m.is_active = true
       AND (p_categories IS NULL OR m.category = ANY(p_categories))
       AND (p_weekly_special IS NULL OR m.is_weekly_special = p_weekly_special)
       AND (p_season IS NULL OR m.season = ANY(ARRAY[p_season, 'both']))
     ORDER BY m.display_order;
END; $function$;

-- ── menu_items REORDER (manager; reindex a group to 0..N-1 — matches the editor's existing
--    applyPositionChange/drag behavior; also serves Move Up/Down by passing the full group). ──
CREATE OR REPLACE FUNCTION public.reorder_menu_items(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reorder menu items';
  END IF;
  IF p_ordered_ids IS NULL OR array_length(p_ordered_ids, 1) IS NULL THEN RETURN TRUE; END IF;
  -- every id must belong to the actor's org (blocks cross-org reorder)
  SELECT count(*) INTO v_n FROM public.menu_items m
   WHERE m.id = ANY(p_ordered_ids) AND m.organization_id = v_org;
  IF v_n <> array_length(p_ordered_ids, 1) THEN
    RAISE EXCEPTION 'One or more items are not in your organization';
  END IF;
  UPDATE public.menu_items m
     SET display_order = ord.idx - 1, updated_at = now()
    FROM (SELECT unnest(p_ordered_ids) AS id, generate_subscripts(p_ordered_ids, 1) AS idx) ord
   WHERE m.id = ord.id AND m.organization_id = v_org;
  RETURN TRUE;
END; $function$;

-- ── menu_categories / menu_subcategories READS (member; p_menu_slot NULL = all slots for the
--    resolver, or a specific slot for useMenuCategories). Source-org allowance for the games'
--    category resolver. ──
CREATE OR REPLACE FUNCTION public.get_menu_categories(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL, p_menu_slot integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, display_name text, display_name_es text, system_key text, filter_behavior text,
  color text, display_order integer, is_hidden boolean, menu_slot smallint, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.display_name, c.display_name_es, c.system_key, c.filter_behavior, c.color,
           c.display_order, c.is_hidden, c.menu_slot, c.organization_id
      FROM public.menu_categories c
     WHERE c.organization_id = v_src
       AND (p_menu_slot IS NULL OR c.menu_slot = p_menu_slot)
     ORDER BY c.display_order;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_menu_subcategories(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL, p_menu_slot integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, category_id uuid, display_name text, display_name_es text, system_key text,
  is_cocktail_fed boolean, display_order integer, is_hidden boolean, menu_slot smallint,
  organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id, s.category_id, s.display_name, s.display_name_es, s.system_key, s.is_cocktail_fed,
           s.display_order, s.is_hidden, s.menu_slot, s.organization_id
      FROM public.menu_subcategories s
     WHERE s.organization_id = v_src
       AND (p_menu_slot IS NULL OR s.menu_slot = p_menu_slot)
     ORDER BY s.display_order;
END; $function$;

-- ── menu_uploads READ + INSERT (manager; the upload flow is an owner tool). get_menu_uploads
--    serves the history list, the poll-by-id, and the review-by-id (all org-scoped now, closing
--    the two single-row reads that previously relied on RLS). ──
CREATE OR REPLACE FUNCTION public.get_menu_uploads(
  p_actor_id uuid, p_upload_id uuid DEFAULT NULL, p_limit integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, file_name text, source_type text, status text, items_inserted integer,
  credits_charged integer, was_free boolean, error_message text, parsed_result jsonb,
  target_menu_slot smallint, apply_mode text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view menu uploads';
  END IF;
  RETURN QUERY
    SELECT mu.id, mu.file_name, mu.source_type, mu.status, mu.items_inserted, mu.credits_charged,
           mu.was_free, mu.error_message, mu.parsed_result, mu.target_menu_slot, mu.apply_mode,
           mu.created_at
      FROM public.menu_uploads mu
     WHERE mu.organization_id = v_org
       AND (p_upload_id IS NULL OR mu.id = p_upload_id)
     ORDER BY mu.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.create_menu_upload(
  p_actor_id uuid, p_file_url text, p_file_name text, p_source_type text, p_page_count integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can upload menus';
  END IF;
  IF p_source_type IS NULL OR p_source_type NOT IN ('pdf','image') THEN
    RAISE EXCEPTION 'Invalid upload source type';
  END IF;
  INSERT INTO public.menu_uploads
    (organization_id, uploaded_by, file_url, file_name, source_type, page_count, status,
     credits_charged, was_free)
  VALUES
    (v_org, p_actor_id, COALESCE(p_file_url,''), COALESCE(p_file_name,''), p_source_type,
     COALESCE(p_page_count, 1), 'processing', 0, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_menu_items(uuid, uuid, text[], boolean, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_menu_items(uuid, uuid[])                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_categories(uuid, uuid, integer)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_subcategories(uuid, uuid, integer)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_uploads(uuid, uuid, integer)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_menu_upload(uuid, text, text, text, integer)     TO anon, authenticated;
