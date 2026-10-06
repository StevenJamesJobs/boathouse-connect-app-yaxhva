-- s90 — Libations AI Upload (premium) + multi-images on menu items and recipes.
--
--  1. menu_uploads.upload_kind ('menu' | 'libations') — ONE table + ONE Recent
--     Uploads list for both scanners; a libations upload picks its book up front
--     (target_menu_slot 1 | 2 is set at create time, menu uploads keep setting
--     it at apply time).
--  2. Grant key 'premium.ai_libation_upload' (+ _may_upload_libations). The
--     upload/quota/history/delete RPCs admit EITHER grant; credits are ONE pool
--     (monthly_allowance 10 → 20 for every org — the free first scan stays
--     menu-only so a new restaurant's first recipe scan can't eat it).
--  3. apply_parsed_libations — all-or-nothing like apply_parsed_menu_v2:
--     creates missing recipe-fed Libations subcategories, inserts into the
--     book's recipe table, SKIPS duplicates by name (Steve, s89), appends
--     display_order, marks the upload applied. save_menu_upload_draft persists
--     the review's edits (statuses, photos, destinations) so a Save & Review
--     Later round-trip loses nothing.
--  4. images jsonb on menu_items + the four recipe tables. The FIRST photo is
--     the cover and is MIRRORED into thumbnail_url, so every existing reader
--     (tiles, shelves, hub peeks, menu cards, the parse functions) keeps
--     working untouched; the Poster pages the list. Cap 4 (client + server).
--     Read RPCs gain `images` at the END of their RETURNS (DROP + CREATE —
--     Steve's word 2026-10-06); write RPCs gain `p_images jsonb DEFAULT NULL`
--     (old clients keep sending one photo and stay coherent).
--  5. insert/update_cocktail + insert/update_puree_syrup_recipe adopt the
--     house gate (_require_content_manager, org derived from the actor) while
--     they are recreated.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · menu_uploads.upload_kind
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.menu_uploads
  ADD COLUMN IF NOT EXISTS upload_kind text NOT NULL DEFAULT 'menu';
ALTER TABLE public.menu_uploads DROP CONSTRAINT IF EXISTS menu_uploads_upload_kind_check;
ALTER TABLE public.menu_uploads
  ADD CONSTRAINT menu_uploads_upload_kind_check CHECK (upload_kind IN ('menu', 'libations'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · images columns (cover mirrored into thumbnail_url)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.menu_items              ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.libation_recipes        ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.summer_libation_recipes ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cocktails               ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.puree_syrup_recipes     ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.menu_items              SET images = jsonb_build_array(thumbnail_url) WHERE images = '[]'::jsonb AND thumbnail_url IS NOT NULL AND btrim(thumbnail_url) <> '';
UPDATE public.libation_recipes        SET images = jsonb_build_array(thumbnail_url) WHERE images = '[]'::jsonb AND thumbnail_url IS NOT NULL AND btrim(thumbnail_url) <> '';
UPDATE public.summer_libation_recipes SET images = jsonb_build_array(thumbnail_url) WHERE images = '[]'::jsonb AND thumbnail_url IS NOT NULL AND btrim(thumbnail_url) <> '';
UPDATE public.cocktails               SET images = jsonb_build_array(thumbnail_url) WHERE images = '[]'::jsonb AND thumbnail_url IS NOT NULL AND btrim(thumbnail_url) <> '';
UPDATE public.puree_syrup_recipes     SET images = jsonb_build_array(thumbnail_url) WHERE images = '[]'::jsonb AND thumbnail_url IS NOT NULL AND btrim(thumbnail_url) <> '';

-- Normalise a client photo list: NULL (old client) → the single thumbnail;
-- blanks dropped; at most 4. EXECUTE-revoked helper (called from DEFINER RPCs).
CREATE OR REPLACE FUNCTION public._images_norm(p_images jsonb, p_thumbnail_url text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v jsonb;
BEGIN
  IF p_images IS NULL THEN
    RETURN CASE WHEN p_thumbnail_url IS NULL OR btrim(p_thumbnail_url) = ''
                THEN '[]'::jsonb ELSE jsonb_build_array(p_thumbnail_url) END;
  END IF;
  IF jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'Photos must be a list';
  END IF;
  SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb) INTO v
    FROM jsonb_array_elements_text(p_images) WITH ORDINALITY AS t(e, ord)
   WHERE btrim(t.e) <> '';
  IF jsonb_array_length(v) > 4 THEN
    RAISE EXCEPTION 'Up to 4 photos per item';
  END IF;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public._images_norm(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._images_norm(jsonb, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · credits: one pool, 20 a month (default + existing rows)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_menu_upload_credits ALTER COLUMN monthly_allowance SET DEFAULT 20;
UPDATE public.organization_menu_upload_credits
   SET monthly_allowance = 20, updated_at = now()
 WHERE monthly_allowance < 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · the grant key + predicate
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._may_upload_libations(p_org uuid, p_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT public._is_org_owner(p_org, p_actor)
      OR EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.manager_permissions mp
            ON mp.organization_id = u.organization_id
         WHERE u.id = p_actor
           AND u.organization_id = p_org
           AND u.role = 'manager'
           AND mp.permission_key = 'premium.ai_libation_upload'
           AND mp.granted
      );
$$;
REVOKE ALL ON FUNCTION public._may_upload_libations(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._may_upload_libations(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_manager_permission(p_actor_id uuid, p_key text, p_granted boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._is_org_owner(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change manager permissions');
  END IF;
  IF p_key IS NULL OR p_key NOT IN (
    'org_settings.menu', 'org_settings.branding', 'org_settings.jobs_tools', 'org_settings.access',
    'menu.edit_categories',
    'premium.ai_menu_upload', 'premium.review_refresh', 'premium.ai_schedule_upload',
    'premium.ai_libation_upload'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unknown permission key');
  END IF;
  IF p_granted IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'granted must be true or false');
  END IF;
  INSERT INTO public.manager_permissions (organization_id, permission_key, granted, granted_by, updated_at)
  VALUES (v_org, p_key, p_granted, p_actor_id, now())
  ON CONFLICT (organization_id, permission_key)
  DO UPDATE SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, updated_at = now();
  RETURN json_build_object('success', true, 'key', p_key, 'granted', p_granted);
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · the upload family admits either grant; create/consume learn the kind
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_menu_upload(uuid, text, text, text, integer);
CREATE FUNCTION public.create_menu_upload(
  p_actor_id uuid, p_file_url text, p_file_name text, p_source_type text, p_page_count integer,
  p_kind text DEFAULT 'menu', p_target_slot smallint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_id uuid; v_kind text;
BEGIN
  v_kind := COALESCE(p_kind, 'menu');
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_kind = 'libations' THEN
    IF v_org IS NULL OR NOT public._may_upload_libations(v_org, p_actor_id) THEN
      RAISE EXCEPTION 'You do not have permission to upload libation recipes';
    END IF;
    IF p_target_slot IS NULL OR p_target_slot NOT IN (1, 2) THEN
      RAISE EXCEPTION 'Invalid target menu';
    END IF;
  ELSIF v_kind = 'menu' THEN
    IF v_org IS NULL OR NOT public._may_upload_menu(v_org, p_actor_id) THEN
      RAISE EXCEPTION 'You do not have permission to upload menus';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid upload kind';
  END IF;
  IF p_source_type IS NULL OR p_source_type NOT IN ('pdf','image') THEN
    RAISE EXCEPTION 'Invalid upload source type';
  END IF;
  INSERT INTO public.menu_uploads
    (organization_id, uploaded_by, file_url, file_name, source_type, page_count, status,
     credits_charged, was_free, upload_kind, target_menu_slot)
  VALUES
    (v_org, p_actor_id, COALESCE(p_file_url,''), COALESCE(p_file_name,''), p_source_type,
     COALESCE(p_page_count, 1), 'processing', 0, false, v_kind,
     CASE WHEN v_kind = 'libations' THEN p_target_slot ELSE NULL END)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_menu_upload(uuid, text, text, text, integer, text, smallint) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_menu_uploads(uuid, uuid, integer);
CREATE FUNCTION public.get_menu_uploads(p_actor_id uuid, p_upload_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT NULL::integer)
RETURNS TABLE(id uuid, file_name text, source_type text, status text, items_inserted integer, credits_charged integer, was_free boolean, error_message text, parsed_result jsonb, target_menu_slot smallint, apply_mode text, created_at timestamp with time zone, upload_kind text, items_skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT (public._may_upload_menu(v_org, p_actor_id) OR public._may_upload_libations(v_org, p_actor_id)) THEN
    RAISE EXCEPTION 'You do not have permission to view menu uploads';
  END IF;
  RETURN QUERY
    SELECT mu.id, mu.file_name, mu.source_type, mu.status, mu.items_inserted, mu.credits_charged,
           mu.was_free, mu.error_message, mu.parsed_result, mu.target_menu_slot, mu.apply_mode,
           mu.created_at, mu.upload_kind, mu.items_skipped
      FROM public.menu_uploads mu
     WHERE mu.organization_id = v_org
       AND (p_upload_id IS NULL OR mu.id = p_upload_id)
     ORDER BY mu.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_menu_uploads(uuid, uuid, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_menu_upload(p_actor_id uuid, p_upload_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_status text; v_file_url text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT (public._may_upload_menu(v_org, p_actor_id) OR public._may_upload_libations(v_org, p_actor_id)) THEN
    RAISE EXCEPTION 'You do not have permission to delete menu uploads';
  END IF;
  SELECT mu.status, mu.file_url INTO v_status, v_file_url
    FROM public.menu_uploads mu
   WHERE mu.id = p_upload_id AND mu.organization_id = v_org;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;
  IF v_status NOT IN ('ready_for_review', 'failed') THEN
    RAISE EXCEPTION 'Only unapplied uploads can be deleted';
  END IF;
  DELETE FROM public.menu_uploads mu WHERE mu.id = p_upload_id;
  RETURN v_file_url;
END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_upload_quota(p_user_id uuid, p_organization_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT (public._may_upload_menu(p_organization_id, p_user_id) OR public._may_upload_libations(p_organization_id, p_user_id)) THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to view upload credits');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id
    RETURNING * INTO r;
  END IF;
  RETURN json_build_object(
    'success', true,
    'free_available', (NOT r.free_menu_upload_used),
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used),
    'monthly_allowance', r.monthly_allowance,
    'period_start', r.period_start,
    'costs', json_build_object('pdf', 3, 'image_per_page', 1, 'website', 5)
  );
END; $$;

DROP FUNCTION IF EXISTS public.consume_menu_upload_credits(uuid, uuid, text, integer);
CREATE FUNCTION public.consume_menu_upload_credits(
  p_user_id uuid, p_organization_id uuid, p_source_type text, p_page_count integer DEFAULT 1,
  p_kind text DEFAULT 'menu')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE r public.organization_menu_upload_credits; v_cost int; v_remaining int; v_kind text;
BEGIN
  v_kind := COALESCE(p_kind, 'menu');
  IF v_kind = 'libations' THEN
    IF NOT public._may_upload_libations(p_organization_id, p_user_id) THEN
      RETURN json_build_object('ok', false, 'reason', 'owner_only');
    END IF;
  ELSIF NOT public._may_upload_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  IF p_source_type NOT IN ('pdf','image','website') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_source');
  END IF;
  IF p_source_type = 'website' THEN
    RETURN json_build_object('ok', false, 'reason', 'website_disabled');
  END IF;

  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id
    RETURNING * INTO r;
  END IF;

  -- The free first scan is the MENU onboarding gift — a recipe scan never spends it.
  IF v_kind = 'menu' AND NOT r.free_menu_upload_used THEN
    UPDATE public.organization_menu_upload_credits
       SET free_menu_upload_used = true, updated_at = now()
     WHERE organization_id = p_organization_id;
    RETURN json_build_object('ok', true, 'charged', 0, 'free_used', true,
      'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used));
  END IF;

  v_cost := CASE p_source_type
              WHEN 'pdf'   THEN 3
              WHEN 'image' THEN GREATEST(1, COALESCE(p_page_count, 1))
            END;
  v_remaining := r.monthly_allowance - r.period_used;
  IF v_remaining < v_cost THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_credits',
      'required', v_cost, 'credits_remaining', GREATEST(0, v_remaining));
  END IF;
  UPDATE public.organization_menu_upload_credits
     SET period_used = r.period_used + v_cost, updated_at = now()
   WHERE organization_id = p_organization_id;
  RETURN json_build_object('ok', true, 'charged', v_cost, 'free_used', false,
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used - v_cost));
END; $$;
GRANT EXECUTE ON FUNCTION public.consume_menu_upload_credits(uuid, uuid, text, integer, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · the review's draft + the all-or-nothing apply
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_menu_upload_draft(p_actor_id uuid, p_upload_id uuid, p_parsed_result jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_status text; v_kind text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_libations(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to upload libation recipes';
  END IF;
  SELECT mu.status, mu.upload_kind INTO v_status, v_kind
    FROM public.menu_uploads mu WHERE mu.id = p_upload_id AND mu.organization_id = v_org;
  IF v_status IS NULL OR v_kind <> 'libations' THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;
  IF v_status <> 'ready_for_review' THEN
    RAISE EXCEPTION 'This upload has already been applied';
  END IF;
  IF p_parsed_result IS NULL OR jsonb_typeof(p_parsed_result) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to add';
  END IF;
  UPDATE public.menu_uploads
     SET parsed_result = p_parsed_result, updated_at = now()
   WHERE id = p_upload_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.save_menu_upload_draft(uuid, uuid, jsonb) TO anon, authenticated, service_role;

-- Payload: { "recipes": [ { name, price, glassware, garnish, ingredients: [{amount, ingredient}],
--   procedure, thumbnail_url, images: [url…], is_featured, subcategory_id | new_subcategory_name,
--   category (legacy vocab string, optional) } ] }
-- Every recipe lands in ONE book (p_target_slot 1 = libation_recipes, 2 = summer_libation_recipes).
CREATE OR REPLACE FUNCTION public.apply_parsed_libations(p_actor_id uuid, p_upload_id uuid, p_target_slot smallint, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_org uuid; v_status text; v_kind text; v_scope text; v_tree_slot smallint; v_lib_cat uuid;
  v_r jsonb; v_name text; v_sub uuid; v_new_sub text; v_sub_name text; v_sub_key text; v_sub_fed boolean;
  v_category text; v_images jsonb; v_thumb text; v_ings jsonb; v_featured boolean; v_price text;
  v_order integer; v_sub_order integer; v_seen text[] := '{}';
  n_ins integer := 0; n_skip integer := 0; n_subs integer := 0;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_libations(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to upload libation recipes';
  END IF;
  SELECT mu.status, mu.upload_kind INTO v_status, v_kind
    FROM public.menu_uploads mu WHERE mu.id = p_upload_id AND mu.organization_id = v_org FOR UPDATE;
  IF v_status IS NULL OR v_kind <> 'libations' THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;
  IF v_status <> 'ready_for_review' THEN
    RAISE EXCEPTION 'This upload has already been applied';
  END IF;
  IF p_target_slot IS NULL OR p_target_slot NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Invalid target menu';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload->'recipes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Nothing to add';
  END IF;
  IF jsonb_array_length(p_payload->'recipes') = 0 THEN
    RAISE EXCEPTION 'Nothing to add';
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = v_org;
  v_tree_slot := CASE WHEN v_scope = 'per_menu' THEN p_target_slot ELSE 0 END;
  SELECT c.id INTO v_lib_cat FROM public.menu_categories c
   WHERE c.organization_id = v_org AND c.system_key = 'cat.libations' AND c.menu_slot = v_tree_slot;
  IF v_lib_cat IS NULL THEN
    RAISE EXCEPTION 'Libations category not found';
  END IF;

  IF p_target_slot = 2 THEN
    SELECT COALESCE(MAX(r.display_order), -1) + 1 INTO v_order FROM public.summer_libation_recipes r WHERE r.organization_id = v_org;
  ELSE
    SELECT COALESCE(MAX(r.display_order), -1) + 1 INTO v_order FROM public.libation_recipes r WHERE r.organization_id = v_org;
  END IF;

  FOR v_r IN SELECT * FROM jsonb_array_elements(p_payload->'recipes') LOOP
    v_name := btrim(COALESCE(v_r->>'name', ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'Recipe name is required';
    END IF;

    -- Duplicates by name: saved rows of this book + earlier rows of this run.
    IF lower(v_name) = ANY(v_seen) THEN
      n_skip := n_skip + 1; CONTINUE;
    END IF;
    v_seen := v_seen || lower(v_name);
    IF p_target_slot = 2 THEN
      IF EXISTS (SELECT 1 FROM public.summer_libation_recipes r
                  WHERE r.organization_id = v_org AND r.is_active AND lower(btrim(r.name)) = lower(v_name)) THEN
        n_skip := n_skip + 1; CONTINUE;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.libation_recipes r
                  WHERE r.organization_id = v_org AND r.is_active AND lower(btrim(r.name)) = lower(v_name)) THEN
        n_skip := n_skip + 1; CONTINUE;
      END IF;
    END IF;

    -- Destination: an existing recipe-fed sub, a new one (find-or-create), or Featured-only.
    v_featured := COALESCE((v_r->>'is_featured')::boolean, false);
    v_sub := NULL; v_sub_name := NULL; v_sub_key := NULL; v_category := NULL;
    IF NULLIF(btrim(COALESCE(v_r->>'subcategory_id', '')), '') IS NOT NULL THEN
      SELECT s.id, s.display_name, s.system_key INTO v_sub, v_sub_name, v_sub_key
        FROM public.menu_subcategories s
       WHERE s.id = (v_r->>'subcategory_id')::uuid AND s.category_id = v_lib_cat
         AND s.organization_id = v_org AND s.is_cocktail_fed;
      IF v_sub IS NULL THEN
        RAISE EXCEPTION 'Subcategory not found';
      END IF;
    ELSIF btrim(COALESCE(v_r->>'new_subcategory_name', '')) <> '' THEN
      v_new_sub := btrim(v_r->>'new_subcategory_name');
      SELECT s.id, s.display_name, s.system_key, s.is_cocktail_fed INTO v_sub, v_sub_name, v_sub_key, v_sub_fed
        FROM public.menu_subcategories s
       WHERE s.category_id = v_lib_cat AND s.organization_id = v_org
         AND lower(s.display_name) = lower(v_new_sub);
      IF v_sub IS NULL THEN
        SELECT COALESCE(MAX(s.display_order) + 1, 0) INTO v_sub_order
          FROM public.menu_subcategories s WHERE s.category_id = v_lib_cat;
        INSERT INTO public.menu_subcategories
          (organization_id, category_id, display_name, display_order, menu_slot, is_cocktail_fed)
        VALUES (v_org, v_lib_cat, v_new_sub, v_sub_order, v_tree_slot, true)
        RETURNING id, display_name, system_key INTO v_sub, v_sub_name, v_sub_key;
        n_subs := n_subs + 1;
      ELSIF NOT v_sub_fed THEN
        -- A manual Libations sub (Draft Beer…) of that name: never silently
        -- flip it to recipe-fed (that hides its hand-entered items).
        RAISE EXCEPTION 'A subcategory with that name already exists';
      END IF;
    ELSIF v_featured THEN
      v_category := 'Featured';
    ELSE
      RAISE EXCEPTION 'Subcategory not found';
    END IF;
    IF v_sub IS NOT NULL THEN
      -- The legacy `category` vocab string the editors write (utils/menuCategoryLabels
      -- recipeCategoryValueForSub): built-in subs keep the stable name, custom = display_name.
      v_category := COALESCE(NULLIF(btrim(v_r->>'category'), ''),
        CASE v_sub_key
          WHEN 'sub.signature_cocktails' THEN 'Signature Cocktails'
          WHEN 'sub.martinis' THEN 'Martinis'
          WHEN 'sub.sangria' THEN 'Sangrias'
          WHEN 'sub.low_abv' THEN 'Low ABV'
          WHEN 'sub.zero_abv' THEN 'No ABV'
          ELSE v_sub_name
        END);
    END IF;

    -- Ingredients keep every row with a name; the amount is optional (Steve, s89).
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'amount', COALESCE(btrim(i->>'amount'), ''),
             'ingredient', btrim(i->>'ingredient'))), '[]'::jsonb)
      INTO v_ings
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_r->'ingredients') = 'array' THEN v_r->'ingredients' ELSE '[]'::jsonb END) i
     WHERE btrim(COALESCE(i->>'ingredient', '')) <> '';

    v_images := public._images_norm(v_r->'images', NULLIF(btrim(COALESCE(v_r->>'thumbnail_url', '')), ''));
    v_thumb := NULLIF(v_images->>0, '');
    v_price := COALESCE(btrim(v_r->>'price'), '');

    IF p_target_slot = 2 THEN
      INSERT INTO public.summer_libation_recipes
        (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url, images,
         display_order, created_by, organization_id, subcategory_id, is_featured)
      VALUES
        (v_name, v_price, v_category, NULLIF(btrim(v_r->>'glassware'), ''), NULLIF(btrim(v_r->>'garnish'), ''),
         v_ings, NULLIF(btrim(v_r->>'procedure'), ''), v_thumb, v_images,
         v_order, p_actor_id, v_org, v_sub, v_featured);
    ELSE
      INSERT INTO public.libation_recipes
        (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url, images,
         display_order, created_by, organization_id, subcategory_id, is_featured)
      VALUES
        (v_name, v_price, v_category, NULLIF(btrim(v_r->>'glassware'), ''), NULLIF(btrim(v_r->>'garnish'), ''),
         v_ings, NULLIF(btrim(v_r->>'procedure'), ''), v_thumb, v_images,
         v_order, p_actor_id, v_org, v_sub, v_featured);
    END IF;
    v_order := v_order + 1;
    n_ins := n_ins + 1;
  END LOOP;

  UPDATE public.menu_uploads
     SET status = 'applied', items_inserted = n_ins, items_skipped = n_skip,
         subcategories_created = n_subs, target_menu_slot = p_target_slot, apply_mode = 'add',
         parsed_result = COALESCE(parsed_result, '{}'::jsonb) || jsonb_build_object('applied', p_payload->'recipes'),
         updated_at = now()
   WHERE id = p_upload_id;

  RETURN json_build_object('success', true, 'items_inserted', n_ins, 'items_skipped', n_skip,
    'subcategories_created', n_subs);
END; $$;
GRANT EXECUTE ON FUNCTION public.apply_parsed_libations(uuid, uuid, smallint, jsonb) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · read RPCs: `images` appended to RETURNS (DROP + CREATE)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_libation_recipes(uuid, uuid);
CREATE FUNCTION public.get_libation_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, price text, category text, glassware text, garnish text, ingredients jsonb, procedure text, procedure_es text, thumbnail_url text, display_order integer, subcategory_id uuid, is_featured boolean, is_active boolean, organization_id uuid, images jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.price, r.category, r.glassware, r.garnish, r.ingredients, r.procedure,
           r.procedure_es, r.thumbnail_url, r.display_order, r.subcategory_id, r.is_featured,
           r.is_active, r.organization_id, r.images
      FROM public.libation_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.category, r.display_order;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_libation_recipes(uuid, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_summer_libation_recipes(uuid, uuid);
CREATE FUNCTION public.get_summer_libation_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, price text, category text, glassware text, garnish text, ingredients jsonb, procedure text, procedure_es text, thumbnail_url text, display_order integer, subcategory_id uuid, is_featured boolean, is_active boolean, organization_id uuid, images jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.price, r.category, r.glassware, r.garnish, r.ingredients, r.procedure,
           r.procedure_es, r.thumbnail_url, r.display_order, r.subcategory_id, r.is_featured,
           r.is_active, r.organization_id, r.images
      FROM public.summer_libation_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.category, r.display_order;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_summer_libation_recipes(uuid, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_cocktails(uuid, uuid);
CREATE FUNCTION public.get_cocktails(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, alcohol_type text, ingredients text, procedure text, procedure_es text, thumbnail_url text, display_order integer, glassware text, garnish text, is_active boolean, organization_id uuid, images jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.alcohol_type, c.ingredients, c.procedure, c.procedure_es,
           c.thumbnail_url, c.display_order, c.glassware, c.garnish, c.is_active, c.organization_id, c.images
      FROM public.cocktails c
     WHERE c.organization_id = v_src AND c.is_active = true
     ORDER BY c.display_order;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_cocktails(uuid, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_puree_syrup_recipes(uuid, uuid);
CREATE FUNCTION public.get_puree_syrup_recipes(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, category text, ingredients jsonb, procedure text, procedure_es text, thumbnail_url text, display_order integer, is_active boolean, organization_id uuid, images jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_src uuid;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.category, r.ingredients, r.procedure, r.procedure_es,
           r.thumbnail_url, r.display_order, r.is_active, r.organization_id, r.images
      FROM public.puree_syrup_recipes r
     WHERE r.organization_id = v_src AND r.is_active = true
     ORDER BY r.display_order;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_puree_syrup_recipes(uuid, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_menu_items(uuid, uuid, text[], boolean, text);
CREATE FUNCTION public.get_menu_items(p_actor_id uuid, p_source_org uuid DEFAULT NULL::uuid, p_categories text[] DEFAULT NULL::text[], p_weekly_special boolean DEFAULT NULL::boolean, p_season text DEFAULT NULL::text)
RETURNS TABLE(id uuid, name text, description text, price text, category text, subcategory text, available_for_lunch boolean, available_for_dinner boolean, is_gluten_free boolean, is_gluten_free_available boolean, is_vegetarian boolean, is_vegetarian_available boolean, thumbnail_url text, thumbnail_shape text, display_order integer, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, name_es text, description_es text, location text, location_es text, glass_price text, bottle_price text, member_bottle_price text, flavor_profile text, flavor_profile_es text, unique_selling_points text, unique_selling_points_es text, season text, organization_id uuid, is_weekly_special boolean, is_dairy_free boolean, is_egg_free boolean, is_nut_free boolean, is_sugar_free boolean, is_salt_free boolean, images jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
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
           m.organization_id, m.is_weekly_special,
           m.is_dairy_free, m.is_egg_free, m.is_nut_free, m.is_sugar_free, m.is_salt_free, m.images
      FROM public.menu_items m
     WHERE m.organization_id = v_src
       AND m.is_active = true
       AND (p_categories IS NULL OR m.category = ANY(p_categories))
       AND (p_weekly_special IS NULL OR m.is_weekly_special = p_weekly_special)
       AND (p_season IS NULL OR m.season = ANY(ARRAY[p_season, 'both']))
     ORDER BY m.display_order;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_menu_items(uuid, uuid, text[], boolean, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · write RPCs: `p_images jsonb DEFAULT NULL` appended (DROP + CREATE)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.insert_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean);
CREATE FUNCTION public.insert_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_id uuid; v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url, images,
     display_order, created_by, organization_id, subcategory_id, is_featured)
  VALUES
    (p_name, COALESCE(p_price, ''), p_category, p_glassware, p_garnish, p_ingredients, p_procedure,
     NULLIF(v_images->>0, ''), v_images,
     p_display_order, p_user_id, v_org, p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean);
CREATE FUNCTION public.update_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.libation_recipes SET
    name = p_name, price = COALESCE(p_price, ''), category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
  RETURN TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.insert_summer_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean);
CREATE FUNCTION public.insert_summer_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_id uuid; v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.summer_libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure, thumbnail_url, images,
     display_order, created_by, organization_id, subcategory_id, is_featured)
  VALUES
    (p_name, COALESCE(p_price, ''), p_category, p_glassware, p_garnish, p_ingredients, p_procedure,
     NULLIF(v_images->>0, ''), v_images,
     p_display_order, p_user_id, v_org, p_subcategory_id, COALESCE(p_is_featured, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_summer_libation_recipe(uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_summer_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean);
CREATE FUNCTION public.update_summer_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.summer_libation_recipes SET
    name = p_name, price = COALESCE(p_price, ''), category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_summer_libation_recipe(uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, uuid, uuid, boolean, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.insert_cocktail(uuid, text, text, text, text, text, integer, uuid, text, text);
CREATE FUNCTION public.insert_cocktail(p_user_id uuid, p_name text, p_alcohol_type text, p_ingredients text, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_cocktail_id uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.cocktails
    (name, alcohol_type, ingredients, procedure, thumbnail_url, images, display_order, is_active,
     created_by, created_at, updated_at, organization_id, glassware, garnish)
  VALUES
    (p_name, p_alcohol_type, p_ingredients, p_procedure, NULLIF(v_images->>0, ''), v_images, p_display_order, true,
     p_user_id, now(), now(), v_org, p_glassware, p_garnish)
  RETURNING id INTO v_cocktail_id;
  RETURN v_cocktail_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_cocktail(uuid, text, text, text, text, text, integer, uuid, text, text, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_cocktail(uuid, uuid, text, text, text, text, text, integer, uuid, text, text);
CREATE FUNCTION public.update_cocktail(p_user_id uuid, p_cocktail_id uuid, p_name text, p_alcohol_type text, p_ingredients text, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.cocktails SET
    name = p_name, alcohol_type = p_alcohol_type, ingredients = p_ingredients,
    procedure = p_procedure, thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, glassware = p_glassware, garnish = p_garnish, updated_at = now()
  WHERE id = p_cocktail_id AND organization_id = v_org;
  RETURN TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_cocktail(uuid, uuid, text, text, text, text, text, integer, uuid, text, text, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.insert_puree_syrup_recipe(uuid, text, text, jsonb, text, text, integer, uuid);
CREATE FUNCTION public.insert_puree_syrup_recipe(p_user_id uuid, p_name text, p_category text, p_ingredients jsonb, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_images jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_recipe_id uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.puree_syrup_recipes
    (name, category, ingredients, procedure, thumbnail_url, images, display_order, created_by, organization_id)
  VALUES
    (p_name, p_category, p_ingredients, p_procedure, NULLIF(v_images->>0, ''), v_images, p_display_order, p_user_id, v_org)
  RETURNING id INTO v_recipe_id;
  RETURN v_recipe_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_puree_syrup_recipe(uuid, text, text, jsonb, text, text, integer, uuid, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_puree_syrup_recipe(uuid, uuid, text, text, jsonb, text, text, integer, uuid);
CREATE FUNCTION public.update_puree_syrup_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_category text, p_ingredients jsonb, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_images jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_content_manager(p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.puree_syrup_recipes SET
    name = p_name, category = p_category, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images, display_order = p_display_order, updated_at = now()
  WHERE id = p_recipe_id AND organization_id = v_org;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_puree_syrup_recipe(uuid, uuid, text, text, jsonb, text, text, integer, uuid, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_menu_item(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean);
CREATE FUNCTION public.create_menu_item(p_user_id uuid, p_name text, p_description text, p_price text, p_category text, p_subcategory text, p_available_for_lunch boolean, p_available_for_dinner boolean, p_is_gluten_free boolean, p_is_gluten_free_available boolean, p_is_vegetarian boolean, p_is_vegetarian_available boolean, p_thumbnail_url text, p_thumbnail_shape text, p_display_order integer DEFAULT 0, p_location text DEFAULT NULL::text, p_glass_price text DEFAULT NULL::text, p_bottle_price text DEFAULT NULL::text, p_member_bottle_price text DEFAULT NULL::text, p_flavor_profile text DEFAULT NULL::text, p_flavor_profile_es text DEFAULT NULL::text, p_unique_selling_points text DEFAULT NULL::text, p_unique_selling_points_es text DEFAULT NULL::text, p_season text DEFAULT 'both'::text, p_organization_id uuid DEFAULT NULL::uuid, p_is_weekly_special boolean DEFAULT false, p_is_dairy_free boolean DEFAULT false, p_is_egg_free boolean DEFAULT false, p_is_nut_free boolean DEFAULT false, p_is_sugar_free boolean DEFAULT false, p_is_salt_free boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_user_role text; v_menu_item_id uuid; v_images jsonb;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create menu items';
  END IF;
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO menu_items (
    name, description, price, category, subcategory,
    available_for_lunch, available_for_dinner, is_gluten_free, is_gluten_free_available,
    is_vegetarian, is_vegetarian_available, thumbnail_url, thumbnail_shape, images, display_order, created_by,
    location, glass_price, bottle_price, member_bottle_price,
    flavor_profile, flavor_profile_es, unique_selling_points, unique_selling_points_es,
    season, organization_id, is_weekly_special,
    is_dairy_free, is_egg_free, is_nut_free, is_sugar_free, is_salt_free
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner, p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available, NULLIF(v_images->>0, ''), p_thumbnail_shape, v_images, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price,
    p_flavor_profile, p_flavor_profile_es, p_unique_selling_points, p_unique_selling_points_es,
    p_season, p_organization_id, p_is_weekly_special,
    p_is_dairy_free, p_is_egg_free, p_is_nut_free, p_is_sugar_free, p_is_salt_free
  ) RETURNING id INTO v_menu_item_id;
  RETURN v_menu_item_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_menu_item(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean, jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_menu_item(uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean);
CREATE FUNCTION public.update_menu_item(p_user_id uuid, p_menu_item_id uuid, p_name text, p_description text, p_price text, p_category text, p_subcategory text, p_available_for_lunch boolean, p_available_for_dinner boolean, p_is_gluten_free boolean, p_is_gluten_free_available boolean, p_is_vegetarian boolean, p_is_vegetarian_available boolean, p_thumbnail_url text, p_thumbnail_shape text, p_display_order integer DEFAULT 0, p_location text DEFAULT NULL::text, p_glass_price text DEFAULT NULL::text, p_bottle_price text DEFAULT NULL::text, p_member_bottle_price text DEFAULT NULL::text, p_flavor_profile text DEFAULT NULL::text, p_flavor_profile_es text DEFAULT NULL::text, p_unique_selling_points text DEFAULT NULL::text, p_unique_selling_points_es text DEFAULT NULL::text, p_season text DEFAULT 'both'::text, p_organization_id uuid DEFAULT NULL::uuid, p_is_weekly_special boolean DEFAULT false, p_is_dairy_free boolean DEFAULT NULL::boolean, p_is_egg_free boolean DEFAULT NULL::boolean, p_is_nut_free boolean DEFAULT NULL::boolean, p_is_sugar_free boolean DEFAULT NULL::boolean, p_is_salt_free boolean DEFAULT NULL::boolean, p_images jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_user_role text; v_images jsonb;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update menu items';
  END IF;
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE menu_items SET
    name = p_name, description = p_description, price = p_price,
    category = p_category, subcategory = p_subcategory,
    available_for_lunch = p_available_for_lunch, available_for_dinner = p_available_for_dinner,
    is_gluten_free = p_is_gluten_free, is_gluten_free_available = p_is_gluten_free_available,
    is_vegetarian = p_is_vegetarian, is_vegetarian_available = p_is_vegetarian_available,
    thumbnail_url = NULLIF(v_images->>0, ''), thumbnail_shape = p_thumbnail_shape, images = v_images,
    display_order = p_display_order, location = p_location,
    glass_price = p_glass_price, bottle_price = p_bottle_price,
    member_bottle_price = p_member_bottle_price, flavor_profile = p_flavor_profile,
    flavor_profile_es = p_flavor_profile_es, unique_selling_points = p_unique_selling_points,
    unique_selling_points_es = p_unique_selling_points_es, season = p_season,
    is_weekly_special = p_is_weekly_special,
    is_dairy_free = COALESCE(p_is_dairy_free, is_dairy_free),
    is_egg_free   = COALESCE(p_is_egg_free, is_egg_free),
    is_nut_free   = COALESCE(p_is_nut_free, is_nut_free),
    is_sugar_free = COALESCE(p_is_sugar_free, is_sugar_free),
    is_salt_free  = COALESCE(p_is_salt_free, is_salt_free),
    updated_at = now()
  WHERE id = p_menu_item_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_menu_item(uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text, text, integer, text, text, text, text, text, text, text, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean, jsonb) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9 · retire_menu2 hands back EVERY photo of what it deletes (cover + extras)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retire_menu2(p_user_id uuid, p_organization_id uuid, p_items_action text DEFAULT 'keep'::text, p_recipes_action text DEFAULT 'keep'::text, p_delete_custom_categories boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_scope text; v_c record; v_n integer;
  v_items integer := 0; v_recipes integer := 0; v_cats integer := 0; v_subs integer := 0;
  v_item_urls text[] := '{}'; v_recipe_urls text[] := '{}';
BEGIN
  IF NOT public._may_configure_menu(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can configure menus');
  END IF;
  IF p_items_action NOT IN ('keep', 'delete') OR p_recipes_action NOT IN ('keep', 'visible', 'delete') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid choice');
  END IF;
  IF p_items_action = 'delete' AND NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can delete a menu');
  END IF;

  SELECT o.menu_category_scope INTO v_scope FROM public.organizations o WHERE o.id = p_organization_id;

  IF p_items_action = 'delete' THEN
    -- Menu 2 = season 'summer' in both scopes (shared-scope 'both' items stay:
    -- they are on Menu 1 too). Same rule as delete_menu(slot 2).
    WITH d AS (
      DELETE FROM public.menu_items
       WHERE organization_id = p_organization_id AND season = 'summer'
      RETURNING thumbnail_url, images
    ), u AS (
      SELECT x AS url FROM d, jsonb_array_elements_text(d.images) x
      UNION
      SELECT d.thumbnail_url FROM d WHERE d.thumbnail_url IS NOT NULL
    )
    SELECT (SELECT count(*) FROM d), COALESCE((SELECT array_agg(u.url) FROM u WHERE btrim(u.url) <> ''), '{}')
      INTO v_items, v_item_urls;

    IF p_delete_custom_categories AND v_scope = 'per_menu' THEN
      FOR v_c IN
        SELECT id FROM public.menu_categories
         WHERE organization_id = p_organization_id AND menu_slot = 2 AND system_key IS NULL
      LOOP
        WITH ds AS (DELETE FROM public.menu_subcategories WHERE category_id = v_c.id RETURNING 1)
          SELECT count(*) INTO v_n FROM ds;
        v_subs := v_subs + COALESCE(v_n, 0);
        DELETE FROM public.menu_categories WHERE id = v_c.id;
        v_cats := v_cats + 1;
      END LOOP;
    END IF;
  END IF;

  IF p_recipes_action = 'delete' THEN
    WITH d AS (
      DELETE FROM public.summer_libation_recipes
       WHERE organization_id = p_organization_id
      RETURNING thumbnail_url, images
    ), u AS (
      SELECT x AS url FROM d, jsonb_array_elements_text(d.images) x
      UNION
      SELECT d.thumbnail_url FROM d WHERE d.thumbnail_url IS NOT NULL
    )
    SELECT (SELECT count(*) FROM d), COALESCE((SELECT array_agg(u.url) FROM u WHERE btrim(u.url) <> ''), '{}')
      INTO v_recipes, v_recipe_urls;
  END IF;

  UPDATE public.organizations
     SET menu2_recipes_visible = (p_recipes_action = 'visible'), updated_at = now()
   WHERE id = p_organization_id;

  RETURN json_build_object('success', true,
    'items_deleted', v_items, 'recipes_deleted', v_recipes,
    'categories_deleted', v_cats, 'subcategories_deleted', v_subs,
    'item_thumbnail_urls', to_json(v_item_urls), 'recipe_thumbnail_urls', to_json(v_recipe_urls));
END;
$$;
