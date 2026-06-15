-- ============================================================================
-- AI Menu Upload — write-back layer.
--
-- Feature: an owner uploads a menu (PDF/photo) -> the parse-menu edge function
-- (Claude vision) parses it into JSON -> the owner REVIEWS/edits -> on approval
-- we populate the real menu. Nothing is written to menu_items until the owner
-- approves (parse -> REVIEW -> write).
--
-- This migration adds:
--   1. menu_uploads          — tracks each upload + holds parsed_result for review
--      + a 'menu-uploads' storage bucket (mirrors the 'schedules' bucket).
--   2. organization_menu_upload_credits — per-org credit accounting (10/month,
--      no rollover, lazy monthly reset; one lifetime free first upload).
--   3. RPCs (all SECURITY DEFINER, owner-gated via _is_org_owner, JSON envelopes,
--      granted to anon+authenticated — the client calls under anon via custom auth):
--        get_menu_upload_quota, consume_menu_upload_credits,
--        apply_parsed_menu (the transactional write-back), delete_menu.
--
-- Verified schema facts this depends on:
--   * menu_items references categories by TEXT (category/subcategory = display_name),
--     NOT by FK. apply writes the CANONICAL display_name already in the tree.
--   * menu_items.price is NOT NULL (pass '' when empty).
--   * season is free text winter|summer|both. Slot<->season<->menu:
--       slot 1 = 'winter' = Menu 1, slot 2 = 'summer' = Menu 2, slot 0 = 'both' = shared.
--   * category tree slot = (per_menu ? target_slot : 0).
--   * live render rule: season IN (active,'both') -> a 'both' item shows on BOTH menus.
--     => replace/delete only ever touch EXACT-season rows, never 'both'.
--   * built-in categories carry system_key IS NOT NULL (protected from delete).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. menu_uploads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_uploads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by           uuid NOT NULL REFERENCES public.users(id),
  file_url              text NOT NULL,
  file_name             text NOT NULL,
  source_type           text NOT NULL DEFAULT 'pdf'
                          CHECK (source_type IN ('pdf','image','website')),
  page_count            integer NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'processing'
                          CHECK (status IN ('processing','ready_for_review','applied','failed')),
  parsed_result         jsonb,                       -- Claude's parsed tree (owner-editable pre-apply)
  target_menu_slot      smallint CHECK (target_menu_slot IN (0,1,2)),  -- chosen at apply time
  apply_mode            text CHECK (apply_mode IN ('add','replace')),  -- chosen at apply time
  credits_charged       integer NOT NULL DEFAULT 0,
  was_free              boolean NOT NULL DEFAULT false,
  input_tokens          integer,   -- Claude usage (for real per-upload cost tracking)
  output_tokens         integer,
  categories_created    integer,
  subcategories_created integer,
  items_inserted        integer,
  items_skipped         integer,
  items_deleted         integer,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_uploads_org_created
  ON public.menu_uploads (organization_id, created_at DESC);

ALTER TABLE public.menu_uploads ENABLE ROW LEVEL SECURITY;

-- Permissive RLS (security lives in the edge fn owner-check + owner-gated RPCs,
-- consistent with schedule_uploads and the custom-auth architecture).
DROP POLICY IF EXISTS "public_read_menu_uploads"   ON public.menu_uploads;
DROP POLICY IF EXISTS "public_insert_menu_uploads" ON public.menu_uploads;
DROP POLICY IF EXISTS "public_update_menu_uploads" ON public.menu_uploads;
DROP POLICY IF EXISTS "public_delete_menu_uploads" ON public.menu_uploads;
CREATE POLICY "public_read_menu_uploads"   ON public.menu_uploads FOR SELECT USING (true);
CREATE POLICY "public_insert_menu_uploads" ON public.menu_uploads FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_menu_uploads" ON public.menu_uploads FOR UPDATE USING (true);
CREATE POLICY "public_delete_menu_uploads" ON public.menu_uploads FOR DELETE USING (true);

-- Storage bucket for the original PDFs/photos (mirror the 'schedules' bucket).
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-uploads', 'menu-uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_menu_uploads" ON storage.objects;
DROP POLICY IF EXISTS "public_read_menu_uploads_bucket" ON storage.objects;
CREATE POLICY "auth_upload_menu_uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'menu-uploads');
CREATE POLICY "public_read_menu_uploads_bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-uploads');

-- ---------------------------------------------------------------------------
-- 2. organization_menu_upload_credits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_menu_upload_credits (
  organization_id       uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_allowance     integer NOT NULL DEFAULT 10,
  period_used           integer NOT NULL DEFAULT 0,     -- credits used this period (no rollover)
  free_menu_upload_used boolean NOT NULL DEFAULT false, -- lifetime one-time free first upload
  period_start          timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_menu_upload_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_omuc"  ON public.organization_menu_upload_credits;
DROP POLICY IF EXISTS "public_write_omuc" ON public.organization_menu_upload_credits;
CREATE POLICY "public_read_omuc"  ON public.organization_menu_upload_credits FOR SELECT USING (true);
CREATE POLICY "public_write_omuc" ON public.organization_menu_upload_credits FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3a. get_menu_upload_quota — owner reads remaining credits (lazy monthly reset).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_menu_upload_quota(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can view upload credits');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, period_start = now(), updated_at = now()
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
END;
$$;

-- ---------------------------------------------------------------------------
-- 3b. consume_menu_upload_credits — charge free-first or N credits (atomic).
--      Called by the edge function after a successful Claude parse.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_menu_upload_credits(
  p_user_id uuid,
  p_organization_id uuid,
  p_source_type text,
  p_page_count integer DEFAULT 1
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r public.organization_menu_upload_credits; v_cost int; v_remaining int;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  IF p_source_type NOT IN ('pdf','image','website') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_source');
  END IF;
  IF p_source_type = 'website' THEN
    RETURN json_build_object('ok', false, 'reason', 'website_disabled');  -- reserved for v2
  END IF;

  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;   -- row lock = atomic vs double-submit
  IF now() > r.period_start + interval '1 month' THEN
    r.period_used := 0; r.period_start := now();
  END IF;

  -- Free first upload (lifetime, no credit cost).
  IF NOT r.free_menu_upload_used THEN
    UPDATE public.organization_menu_upload_credits
       SET free_menu_upload_used = true, period_used = r.period_used,
           period_start = r.period_start, updated_at = now()
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
    UPDATE public.organization_menu_upload_credits   -- persist any lazy reset
       SET period_used = r.period_used, period_start = r.period_start, updated_at = now()
     WHERE organization_id = p_organization_id;
    RETURN json_build_object('ok', false, 'reason', 'insufficient_credits',
      'required', v_cost, 'credits_remaining', GREATEST(0, v_remaining));
  END IF;
  UPDATE public.organization_menu_upload_credits
     SET period_used = r.period_used + v_cost, period_start = r.period_start, updated_at = now()
   WHERE organization_id = p_organization_id;
  RETURN json_build_object('ok', true, 'charged', v_cost, 'free_used', false,
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used - v_cost));
END;
$$;

-- ---------------------------------------------------------------------------
-- 3c. apply_parsed_menu — the transactional write-back (parse -> review -> WRITE).
--      p_payload: { categories:[{ name, subcategories:[{ name, items:[{...}] }] }] }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_parsed_menu(
  p_user_id uuid,
  p_organization_id uuid,
  p_upload_id uuid,
  p_payload jsonb,
  p_target_slot smallint,
  p_mode text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_scope text; v_season text; v_tree_slot smallint;
  v_cat jsonb; v_sub jsonb; v_item jsonb;
  v_catname text; v_subname text; v_itemname text;
  v_cat_id uuid; v_cat_canonical text; v_sub_canonical text;
  v_ord integer; v_item_ord integer;
  c_cats int := 0; c_subs int := 0; c_ins int := 0; c_skip int := 0; c_del int := 0;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can apply a menu');
  END IF;
  IF p_mode NOT IN ('add','replace') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid mode');
  END IF;
  IF p_target_slot NOT IN (0,1,2) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid target menu');
  END IF;

  SELECT menu_category_scope INTO v_scope FROM public.organizations WHERE id = p_organization_id;

  IF v_scope = 'per_menu' THEN
    IF p_target_slot = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Per-menu organizations must target Menu 1 or Menu 2');
    END IF;
    v_tree_slot := p_target_slot;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' ELSE 'winter' END;
  ELSE  -- shared scope: categories live in slot 0; items get the menu's season
    v_tree_slot := 0;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' WHEN 1 THEN 'winter' ELSE 'both' END;
  END IF;

  -- REPLACE: clear ONLY the target menu's exact-season items first (never 'both').
  IF p_mode = 'replace' THEN
    WITH d AS (
      DELETE FROM public.menu_items
       WHERE organization_id = p_organization_id AND season = v_season
      RETURNING 1
    ) SELECT count(*) INTO c_del FROM d;
  END IF;

  FOR v_cat IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'categories', '[]'::jsonb)) AS t(value)
  LOOP
    v_catname := btrim(COALESCE(v_cat->>'name', ''));
    CONTINUE WHEN v_catname = '';

    -- reuse-or-create category by case-insensitive name within (org, tree_slot)
    SELECT id, display_name INTO v_cat_id, v_cat_canonical
      FROM public.menu_categories
      WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot
        AND lower(display_name) = lower(v_catname)
      LIMIT 1;
    IF v_cat_id IS NULL THEN
      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
        FROM public.menu_categories WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot;
      BEGIN
        INSERT INTO public.menu_categories (organization_id, display_name, color, display_order, menu_slot)
          VALUES (p_organization_id, v_catname, '#607D8B', v_ord, v_tree_slot)
          RETURNING id, display_name INTO v_cat_id, v_cat_canonical;
        c_cats := c_cats + 1;
      EXCEPTION WHEN unique_violation THEN   -- race: another writer created it
        SELECT id, display_name INTO v_cat_id, v_cat_canonical
          FROM public.menu_categories
          WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot
            AND lower(display_name) = lower(v_catname) LIMIT 1;
      END;
    END IF;

    FOR v_sub IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_cat->'subcategories', '[]'::jsonb)) AS t(value)
    LOOP
      v_subname := btrim(COALESCE(v_sub->>'name', ''));
      v_sub_canonical := NULL;
      IF v_subname <> '' THEN
        SELECT display_name INTO v_sub_canonical
          FROM public.menu_subcategories
          WHERE category_id = v_cat_id AND lower(display_name) = lower(v_subname) LIMIT 1;
        IF v_sub_canonical IS NULL THEN
          SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_ord
            FROM public.menu_subcategories WHERE category_id = v_cat_id;
          BEGIN
            INSERT INTO public.menu_subcategories (organization_id, category_id, display_name, display_order, menu_slot)
              VALUES (p_organization_id, v_cat_id, v_subname, v_ord, v_tree_slot)
              RETURNING display_name INTO v_sub_canonical;
            c_subs := c_subs + 1;
          EXCEPTION WHEN unique_violation THEN
            SELECT display_name INTO v_sub_canonical
              FROM public.menu_subcategories
              WHERE category_id = v_cat_id AND lower(display_name) = lower(v_subname) LIMIT 1;
          END;
        END IF;
      END IF;

      -- per-bucket display_order high-water mark
      SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_item_ord
        FROM public.menu_items
        WHERE organization_id = p_organization_id AND category = v_cat_canonical
          AND subcategory IS NOT DISTINCT FROM v_sub_canonical AND season = v_season;

      FOR v_item IN
        SELECT value FROM jsonb_array_elements(COALESCE(v_sub->'items', '[]'::jsonb)) AS t(value)
      LOOP
        v_itemname := btrim(COALESCE(v_item->>'name', ''));
        CONTINUE WHEN v_itemname = '';

        -- ADD mode: skip duplicate name within (category, subcategory, season)
        IF p_mode = 'add' AND EXISTS (
          SELECT 1 FROM public.menu_items
          WHERE organization_id = p_organization_id AND season = v_season
            AND category = v_cat_canonical
            AND subcategory IS NOT DISTINCT FROM v_sub_canonical
            AND lower(name) = lower(v_itemname)
        ) THEN
          c_skip := c_skip + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.menu_items (
          name, description, price, category, subcategory,
          available_for_lunch, available_for_dinner,
          is_gluten_free, is_gluten_free_available, is_vegetarian, is_vegetarian_available,
          thumbnail_url, thumbnail_shape, display_order, created_by,
          glass_price, bottle_price, member_bottle_price,
          flavor_profile, unique_selling_points,
          season, organization_id
        ) VALUES (
          v_itemname,
          NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
          COALESCE(NULLIF(btrim(COALESCE(v_item->>'price', '')), ''), ''),   -- price NOT NULL
          v_cat_canonical,
          v_sub_canonical,
          COALESCE((v_item->>'available_for_lunch')::boolean, false),
          COALESCE((v_item->>'available_for_dinner')::boolean, false),
          COALESCE((v_item->>'is_gluten_free')::boolean, false),
          COALESCE((v_item->>'is_gluten_free_available')::boolean, false),
          COALESCE((v_item->>'is_vegetarian')::boolean, false),
          COALESCE((v_item->>'is_vegetarian_available')::boolean, false),
          NULL, 'square', v_item_ord, p_user_id,
          NULLIF(btrim(COALESCE(v_item->>'glass_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'bottle_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'member_bottle_price', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'flavor_profile', '')), ''),
          NULLIF(btrim(COALESCE(v_item->>'unique_selling_points', '')), ''),
          v_season, p_organization_id
        );
        v_item_ord := v_item_ord + 1;
        c_ins := c_ins + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Auto-hide built-in starter categories on the target menu that ended up empty,
  -- so they don't clutter the owner's freshly-uploaded categories. Featured/Weekly
  -- Specials is structural (drives the Welcome Specials tab) and always stays visible.
  -- Matched built-ins (e.g. the AI reused "Wine") keep their items and stay visible.
  -- Reversible: the owner can unhide any of these in Manage Categories.
  UPDATE public.menu_categories c
     SET is_hidden = true, updated_at = now()
   WHERE c.organization_id = p_organization_id
     AND c.menu_slot = v_tree_slot
     AND c.system_key IS NOT NULL
     AND c.system_key <> 'cat.weekly_specials'
     AND c.is_hidden = false
     AND NOT EXISTS (
       SELECT 1 FROM public.menu_items mi
        WHERE mi.organization_id = p_organization_id
          AND mi.is_active
          AND mi.category = c.display_name
          AND (mi.season = v_season OR mi.season = 'both')
     );

  UPDATE public.menu_uploads
     SET status = 'applied', apply_mode = p_mode, target_menu_slot = p_target_slot,
         categories_created = c_cats, subcategories_created = c_subs,
         items_inserted = c_ins, items_skipped = c_skip, items_deleted = c_del,
         updated_at = now()
   WHERE id = p_upload_id AND organization_id = p_organization_id;

  RETURN json_build_object('success', true,
    'categories_created', c_cats, 'subcategories_created', c_subs,
    'items_inserted', c_ins, 'items_skipped', c_skip, 'items_deleted', c_del);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3d. delete_menu — owner "clean out a menu" before re-uploading.
--      Deletes the target menu's exact-season items (never 'both'); optionally
--      deletes that slot's CUSTOM categories/subs while PROTECTING built-ins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_menu(
  p_user_id uuid,
  p_organization_id uuid,
  p_target_slot smallint,
  p_delete_custom_categories boolean DEFAULT false
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_scope text; v_season text; v_tree_slot smallint;
  c_del int := 0; c_cats int := 0; c_subs int := 0; v_n int;
  v_c record;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can delete a menu');
  END IF;
  IF p_target_slot NOT IN (0,1,2) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid target menu');
  END IF;
  SELECT menu_category_scope INTO v_scope FROM public.organizations WHERE id = p_organization_id;
  IF v_scope = 'per_menu' THEN
    IF p_target_slot = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Per-menu organizations must target Menu 1 or Menu 2');
    END IF;
    v_tree_slot := p_target_slot;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' ELSE 'winter' END;
  ELSE
    v_tree_slot := 0;
    v_season := CASE p_target_slot WHEN 2 THEN 'summer' WHEN 1 THEN 'winter' ELSE 'both' END;
  END IF;

  WITH d AS (
    DELETE FROM public.menu_items
     WHERE organization_id = p_organization_id AND season = v_season
    RETURNING 1
  ) SELECT count(*) INTO c_del FROM d;

  IF p_delete_custom_categories THEN
    FOR v_c IN
      SELECT id FROM public.menu_categories
       WHERE organization_id = p_organization_id AND menu_slot = v_tree_slot
         AND system_key IS NULL                       -- protect built-ins
    LOOP
      WITH ds AS (DELETE FROM public.menu_subcategories WHERE category_id = v_c.id RETURNING 1)
        SELECT count(*) INTO v_n FROM ds;
      c_subs := c_subs + COALESCE(v_n, 0);
      DELETE FROM public.menu_categories WHERE id = v_c.id;
      c_cats := c_cats + 1;
    END LOOP;
  END IF;

  RETURN json_build_object('success', true,
    'items_deleted', c_del, 'categories_deleted', c_cats, 'subcategories_deleted', c_subs);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants (client calls run under the anon role via custom auth).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_menu_upload_quota(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_menu_upload_credits(uuid, uuid, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_parsed_menu(uuid, uuid, uuid, jsonb, smallint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_menu(uuid, uuid, smallint, boolean) TO anon, authenticated;
