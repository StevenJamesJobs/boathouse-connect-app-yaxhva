-- s74 Assistants & Checklists wave.
-- 1) Retire the Server Assistant (the page pair is deleted from the app this
--    wave): drop its per-org toggle rows + job-title mappings and stop seeding
--    it for new orgs. Old clients are unaffected — their assistant tiles come
--    from a client-baked catalog, and the org-settings manager simply no longer
--    lists a row for it.
-- 2) Spanish translation columns for checklist items (both families), host
--    sections, and host section tiles, plus the read/write plumbing:
--    - get_checklist_items returns text_es (host getters are SETOF and pick the
--      new columns up automatically);
--    - four update_*_translations_actor RPCs in the house COALESCE-KEEP shape
--      (NULL keeps the stored translation so old clients can never blank one;
--      '' writes through = the client's deliberate-clear marker).

-- ── 1. Server Assistant teardown ────────────────────────────────────────────
DELETE FROM public.job_title_assistants WHERE assistant_key = 'server';
DELETE FROM public.organization_assistants WHERE assistant_key = 'server';

CREATE OR REPLACE FUNCTION public.seed_org_assistants(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.organization_assistants (organization_id, assistant_key, is_active, display_name) VALUES
    (p_org_id, 'bartender',  true, 'Bartender Assistant'),
    (p_org_id, 'host',       true, 'Host Assistant'),
    (p_org_id, 'kitchen',    true, 'Kitchen Assistant'),
    (p_org_id, 'check_outs', true, 'Check Outs Calculator')
  ON CONFLICT (organization_id, assistant_key) DO NOTHING;
END;
$function$;

-- ── 2. Translation columns ──────────────────────────────────────────────────
ALTER TABLE public.checklist_items           ADD COLUMN IF NOT EXISTS text_es text;
ALTER TABLE public.bartender_checklist_items ADD COLUMN IF NOT EXISTS text_es text;
ALTER TABLE public.host_sections
  ADD COLUMN IF NOT EXISTS title_es text,
  ADD COLUMN IF NOT EXISTS card_subtitle_es text,
  ADD COLUMN IF NOT EXISTS instructions_es text;
ALTER TABLE public.host_section_tiles
  ADD COLUMN IF NOT EXISTS title_es text,
  ADD COLUMN IF NOT EXISTS link_description_es text;

-- ── 3. get_checklist_items gains text_es ────────────────────────────────────
-- RETURNS TABLE change => drop + recreate (+ regrant). Same body otherwise;
-- old clients ignore the extra column.
DROP FUNCTION public.get_checklist_items(uuid, boolean, text);
CREATE FUNCTION public.get_checklist_items(p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, category_id uuid, text text, text_es text, display_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_item_tbl text; v_cat_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_item_tbl := CASE WHEN p_bartender THEN 'bartender_checklist_items'      ELSE 'checklist_items'      END;
  v_cat_tbl  := CASE WHEN p_bartender THEN 'bartender_checklist_categories' ELSE 'checklist_categories' END;
  RETURN QUERY EXECUTE format(
    'SELECT i.id, i.category_id, i.text, i.text_es, i.display_order FROM public.%I i
      WHERE i.organization_id = $1 AND i.is_active = true
        AND ($2 IS NULL OR EXISTS (
              SELECT 1 FROM public.%I c WHERE c.id = i.category_id AND c.checklist_type = $2))
      ORDER BY i.display_order', v_item_tbl, v_cat_tbl)
    USING v_org, p_checklist_type;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_checklist_items(uuid, boolean, text) TO anon, authenticated, service_role;

-- ── 4. Translations writers (house shape: _require_content_manager gate,
--       org-scoped row match, COALESCE-KEEP) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_checklist_item_translations_actor(p_actor_id uuid, p_id uuid, p_text_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.checklist_items
     SET text_es = COALESCE(p_text_es, text_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_checklist_item_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_bartender_checklist_item_translations_actor(p_actor_id uuid, p_id uuid, p_text_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.bartender_checklist_items
     SET text_es = COALESCE(p_text_es, text_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_bartender_checklist_item_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_host_section_translations_actor(p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL::text, p_card_subtitle_es text DEFAULT NULL::text, p_instructions_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.host_sections
     SET title_es = COALESCE(p_title_es, title_es),
         card_subtitle_es = COALESCE(p_card_subtitle_es, card_subtitle_es),
         instructions_es = COALESCE(p_instructions_es, instructions_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_host_section_translations_actor(uuid, uuid, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_host_section_tile_translations_actor(p_actor_id uuid, p_id uuid, p_title_es text DEFAULT NULL::text, p_link_description_es text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_content_manager(p_actor_id);
  UPDATE public.host_section_tiles
     SET title_es = COALESCE(p_title_es, title_es),
         link_description_es = COALESCE(p_link_description_es, link_description_es),
         updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.update_host_section_tile_translations_actor(uuid, uuid, text, text) TO anon, authenticated, service_role;

