-- s91 part A — Kitchen Assistant & Editor: recipe-editor grants, the Bar write RPCs
-- admitting granted titles, the checklist family growing a third (kitchen) set +
-- category attachments, and the two new private buckets.
--
-- Grant model: Org Settings › Jobs & Tools maps job titles to assistant keys in
-- job_title_assistants. Two new keys ride the same table — 'kitchen_editor' and
-- 'bartender_editor' — and _may_edit_assistant() admits owners / managers OR a user
-- holding a title mapped to '<key>_editor'. Every write RPC of the family gates on it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Editor predicates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._may_edit_assistant(p_org uuid, p_actor uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = p_actor AND u.organization_id = p_org AND u.is_active IS NOT DISTINCT FROM true
       AND (u.role IN ('manager','owner')
            OR EXISTS (SELECT 1 FROM public.job_title_assistants j
                        WHERE j.organization_id = p_org
                          AND j.assistant_key = p_key || '_editor'
                          AND j.job_title = ANY (COALESCE(u.job_titles, ARRAY[]::text[])))));
$$;
REVOKE EXECUTE ON FUNCTION public._may_edit_assistant(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._require_recipe_editor(p_key text, p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_edit_assistant(v_org, p_actor_id, p_key) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION public._require_recipe_editor(text, uuid) FROM PUBLIC, anon, authenticated;

-- The client asks "may I edit?" once per hub open (the To Editor chip).
CREATE OR REPLACE FUNCTION public.get_my_assistant_editor_keys(p_actor_id uuid)
RETURNS TABLE(assistant_key text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT k.key FROM unnest(ARRAY['bartender','kitchen','host']) AS k(key)
   WHERE public._may_edit_assistant((SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id), p_actor_id, k.key);
$$;
GRANT EXECUTE ON FUNCTION public.get_my_assistant_editor_keys(uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Bar write RPCs: _require_content_manager → _require_recipe_editor('bartender', …)
--    (same signatures, CREATE OR REPLACE). The three with hand-rolled role checks
--    adopt the same gate and org scoping.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
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
END; $function$;

CREATE OR REPLACE FUNCTION public.update_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.libation_recipes SET
    name = p_name, price = COALESCE(p_price, ''), category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  DELETE FROM public.libation_recipes WHERE id = p_recipe_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_libation_recipes(p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  UPDATE public.libation_recipes r SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND r.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_summer_libation_recipe(p_user_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
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
END; $function$;

CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_price text, p_category text, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_ingredients jsonb DEFAULT '[]'::jsonb, p_procedure text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_display_order integer DEFAULT 0, p_organization_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_is_featured boolean DEFAULT false, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.summer_libation_recipes SET
    name = p_name, price = COALESCE(p_price, ''), category = p_category, glassware = p_glassware,
    garnish = p_garnish, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, updated_at = now(),
    subcategory_id = p_subcategory_id, is_featured = COALESCE(p_is_featured, false)
  WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_summer_libation_recipe(p_user_id uuid, p_recipe_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  DELETE FROM public.summer_libation_recipes WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_summer_libation_recipes(p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  UPDATE public.summer_libation_recipes r SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND r.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_cocktail(p_user_id uuid, p_name text, p_alcohol_type text, p_ingredients text, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_cocktail_id uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.cocktails
    (name, alcohol_type, ingredients, procedure, thumbnail_url, images, display_order, is_active,
     created_by, created_at, updated_at, organization_id, glassware, garnish)
  VALUES
    (p_name, p_alcohol_type, p_ingredients, p_procedure, NULLIF(v_images->>0, ''), v_images, p_display_order, true,
     p_user_id, now(), now(), v_org, p_glassware, p_garnish)
  RETURNING id INTO v_cocktail_id;
  RETURN v_cocktail_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_cocktail(p_user_id uuid, p_cocktail_id uuid, p_name text, p_alcohol_type text, p_ingredients text, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_glassware text DEFAULT NULL::text, p_garnish text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.cocktails SET
    name = p_name, alcohol_type = p_alcohol_type, ingredients = p_ingredients,
    procedure = p_procedure, thumbnail_url = NULLIF(v_images->>0, ''), images = v_images,
    display_order = p_display_order, glassware = p_glassware, garnish = p_garnish, updated_at = now()
  WHERE id = p_cocktail_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_cocktail(p_user_id uuid, p_cocktail_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  UPDATE public.cocktails SET is_active = false, updated_at = now()
   WHERE id = p_cocktail_id AND organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_puree_syrup_recipe(p_user_id uuid, p_name text, p_category text, p_ingredients jsonb, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_recipe_id uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  INSERT INTO public.puree_syrup_recipes
    (name, category, ingredients, procedure, thumbnail_url, images, display_order, created_by, organization_id)
  VALUES
    (p_name, p_category, p_ingredients, p_procedure, NULLIF(v_images->>0, ''), v_images, p_display_order, p_user_id, v_org)
  RETURNING id INTO v_recipe_id;
  RETURN v_recipe_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_puree_syrup_recipe(p_user_id uuid, p_recipe_id uuid, p_name text, p_category text, p_ingredients jsonb, p_procedure text, p_thumbnail_url text, p_display_order integer, p_organization_id uuid DEFAULT NULL::uuid, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_images jsonb;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  v_images := public._images_norm(p_images, p_thumbnail_url);
  UPDATE public.puree_syrup_recipes SET
    name = p_name, category = p_category, ingredients = p_ingredients, procedure = p_procedure,
    thumbnail_url = NULLIF(v_images->>0, ''), images = v_images, display_order = p_display_order, updated_at = now()
  WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_puree_syrup_recipe(p_user_id uuid, p_recipe_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  UPDATE public.puree_syrup_recipes SET is_active = false, updated_at = now()
   WHERE id = p_recipe_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_puree_syrup_recipes(p_user_id uuid, p_ordered_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_user_id);
  UPDATE public.puree_syrup_recipes r SET display_order = o.idx - 1, updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE r.id = o.id AND r.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_bartender_checklist_category_translations_actor(p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_actor_id);
  UPDATE public.bartender_checklist_categories
     SET name_es = COALESCE(p_name_es, name_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.update_bartender_checklist_item_translations_actor(p_actor_id uuid, p_id uuid, p_text_es text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('bartender', p_actor_id);
  UPDATE public.bartender_checklist_items
     SET text_es = COALESCE(p_text_es, text_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Checklists: a third (kitchen) set + attachments on every category table.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kitchen_checklist_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  checklist_type text NOT NULL CHECK (checklist_type IN ('opening','running_side_work','closing')),
  name text NOT NULL,
  name_es text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kitchen_checklist_categories_org_type_idx ON public.kitchen_checklist_categories (organization_id, checklist_type);

CREATE TABLE public.kitchen_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.kitchen_checklist_categories(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  text text NOT NULL,
  text_es text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kitchen_checklist_items_cat_idx ON public.kitchen_checklist_items (category_id);

CREATE TABLE public.user_kitchen_checklist_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.kitchen_checklist_items(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT true,
  completed_date date NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checklist_item_id, completed_date)
);

ALTER TABLE public.kitchen_checklist_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_kitchen_checklist_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.checklist_categories ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.bartender_checklist_categories ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Family resolver: p_kind wins when given ('kitchen' | 'bartender' | 'host'),
-- else the legacy boolean. Old clients never send p_kind.
CREATE OR REPLACE FUNCTION public._checklist_kind(p_bartender boolean, p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_kind IN ('kitchen','bartender','host') THEN p_kind
              WHEN COALESCE(p_bartender, false) THEN 'bartender' ELSE 'host' END;
$$;
CREATE OR REPLACE FUNCTION public._checklist_tbl(p_kind text, p_which text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_which
    WHEN 'cat'  THEN CASE p_kind WHEN 'bartender' THEN 'bartender_checklist_categories' WHEN 'kitchen' THEN 'kitchen_checklist_categories' ELSE 'checklist_categories' END
    WHEN 'item' THEN CASE p_kind WHEN 'bartender' THEN 'bartender_checklist_items'      WHEN 'kitchen' THEN 'kitchen_checklist_items'      ELSE 'checklist_items'      END
    ELSE             CASE p_kind WHEN 'bartender' THEN 'user_bartender_checklist_progress' WHEN 'kitchen' THEN 'user_kitchen_checklist_progress' ELSE 'user_checklist_progress' END
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._checklist_kind(boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._checklist_tbl(text, text) FROM PUBLIC, anon, authenticated;

-- Attachment list shape: [{kind:'file', name, url, mime, size} | {kind:'guide', guide_id, name}] · cap 3.
CREATE OR REPLACE FUNCTION public._checklist_attachments_norm(p_attachments jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v jsonb; e jsonb; out jsonb := '[]'::jsonb;
BEGIN
  IF p_attachments IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF jsonb_typeof(p_attachments) <> 'array' THEN RAISE EXCEPTION 'Attachments must be a list'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(e) <> 'object' OR e->>'kind' NOT IN ('file','guide') THEN RAISE EXCEPTION 'Bad attachment'; END IF;
    IF e->>'kind' = 'file' AND btrim(COALESCE(e->>'url','')) = '' THEN RAISE EXCEPTION 'Bad attachment'; END IF;
    IF e->>'kind' = 'guide' AND btrim(COALESCE(e->>'guide_id','')) = '' THEN RAISE EXCEPTION 'Bad attachment'; END IF;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', e->>'kind', 'name', left(COALESCE(e->>'name',''), 160), 'url', e->>'url',
      'mime', e->>'mime', 'size', CASE WHEN (e->>'size') ~ '^[0-9]+$' THEN (e->>'size')::bigint ELSE NULL END,
      'guide_id', e->>'guide_id')));
  END LOOP;
  IF jsonb_array_length(out) > 3 THEN RAISE EXCEPTION 'Up to 3 attachments per category'; END IF;
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public._checklist_attachments_norm(jsonb) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.get_checklist_categories(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.get_checklist_items(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.get_my_checklist_progress(uuid, boolean, date);
DROP FUNCTION IF EXISTS public.set_checklist_progress(uuid, boolean, uuid, boolean, date);
DROP FUNCTION IF EXISTS public.upsert_checklist_category(uuid, boolean, text, text, uuid);
DROP FUNCTION IF EXISTS public.upsert_checklist_item(uuid, boolean, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.delete_checklist_category(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.delete_checklist_item(uuid, boolean, uuid);

CREATE FUNCTION public.get_checklist_categories(p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL::text, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, name_es text, display_order integer, checklist_type text, attachments jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_tbl := public._checklist_tbl(public._checklist_kind(p_bartender, p_kind), 'cat');
  RETURN QUERY EXECUTE format(
    'SELECT c.id, c.name, c.name_es, c.display_order, c.checklist_type, c.attachments FROM public.%I c
      WHERE c.organization_id = $1 AND c.is_active = true
        AND ($2 IS NULL OR c.checklist_type = $2)
      ORDER BY c.display_order', v_tbl)
    USING v_org, p_checklist_type;
END; $function$;

CREATE FUNCTION public.get_checklist_items(p_actor_id uuid, p_bartender boolean, p_checklist_type text DEFAULT NULL::text, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, category_id uuid, text text, text_es text, display_order integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_item_tbl text; v_cat_tbl text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_item_tbl := public._checklist_tbl(v_kind, 'item');
  v_cat_tbl  := public._checklist_tbl(v_kind, 'cat');
  RETURN QUERY EXECUTE format(
    'SELECT i.id, i.category_id, i.text, i.text_es, i.display_order FROM public.%I i
      WHERE i.organization_id = $1 AND i.is_active = true
        AND ($2 IS NULL OR EXISTS (
              SELECT 1 FROM public.%I c WHERE c.id = i.category_id AND c.checklist_type = $2))
      ORDER BY i.display_order', v_item_tbl, v_cat_tbl)
    USING v_org, p_checklist_type;
END; $function$;

CREATE FUNCTION public.get_my_checklist_progress(p_actor_id uuid, p_bartender boolean, p_date date, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(checklist_item_id uuid, completed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_tbl text;
BEGIN
  IF p_actor_id IS NULL THEN RETURN; END IF;
  v_tbl := public._checklist_tbl(public._checklist_kind(p_bartender, p_kind), 'prog');
  RETURN QUERY EXECUTE format(
    'SELECT p.checklist_item_id, p.completed FROM public.%I p
      WHERE p.user_id = $1 AND p.completed_date = $2', v_tbl)
    USING p_actor_id, p_date;
END; $function$;

CREATE FUNCTION public.set_checklist_progress(p_actor_id uuid, p_bartender boolean, p_item_id uuid, p_completed boolean, p_date date, p_kind text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_prog_tbl text; v_item_tbl text; v_ok boolean;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Unknown user'; END IF;
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_prog_tbl := public._checklist_tbl(v_kind, 'prog');
  v_item_tbl := public._checklist_tbl(v_kind, 'item');
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I i WHERE i.id = $1 AND i.organization_id = $2)', v_item_tbl)
    INTO v_ok USING p_item_id, v_org;
  IF NOT v_ok THEN RAISE EXCEPTION 'Checklist item not found'; END IF;
  IF p_completed THEN
    EXECUTE format(
      'INSERT INTO public.%I (user_id, checklist_item_id, completed, completed_date, organization_id)
         VALUES ($1, $2, true, $3, $4)
       ON CONFLICT (user_id, checklist_item_id, completed_date)
         DO UPDATE SET completed = true, updated_at = now()', v_prog_tbl)
      USING p_actor_id, p_item_id, p_date, v_org;
  ELSE
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1 AND checklist_item_id = $2 AND completed_date = $3', v_prog_tbl)
      USING p_actor_id, p_item_id, p_date;
  END IF;
END; $function$;

CREATE FUNCTION public.upsert_checklist_category(p_actor_id uuid, p_bartender boolean, p_checklist_type text, p_name text, p_category_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_tbl text; v_max int; v_id uuid;
BEGIN
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_org := public._require_recipe_editor(v_kind, p_actor_id);
  IF btrim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  v_tbl := public._checklist_tbl(v_kind, 'cat');
  IF p_category_id IS NULL THEN
    IF btrim(COALESCE(p_checklist_type, '')) = '' THEN RAISE EXCEPTION 'Checklist type is required'; END IF;
    EXECUTE format('SELECT COALESCE(max(display_order),0) FROM public.%I WHERE organization_id=$1 AND checklist_type=$2', v_tbl)
      INTO v_max USING v_org, p_checklist_type;
    EXECUTE format(
      'INSERT INTO public.%I (checklist_type, name, display_order, organization_id, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id', v_tbl)
      INTO v_id USING p_checklist_type, btrim(p_name), v_max + 1, v_org;
  ELSE
    EXECUTE format('UPDATE public.%I SET name=$1, updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING id', v_tbl)
      INTO v_id USING btrim(p_name), p_category_id, v_org;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;
  RETURN v_id;
END; $function$;

CREATE FUNCTION public.upsert_checklist_item(p_actor_id uuid, p_bartender boolean, p_category_id uuid, p_text text, p_item_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_item_tbl text; v_cat_tbl text; v_max int; v_id uuid; v_cat_ok boolean;
BEGIN
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_org := public._require_recipe_editor(v_kind, p_actor_id);
  IF btrim(COALESCE(p_text, '')) = '' THEN RAISE EXCEPTION 'Item text is required'; END IF;
  v_item_tbl := public._checklist_tbl(v_kind, 'item');
  v_cat_tbl  := public._checklist_tbl(v_kind, 'cat');
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I c WHERE c.id=$1 AND c.organization_id=$2)', v_cat_tbl)
    INTO v_cat_ok USING p_category_id, v_org;
  IF NOT v_cat_ok THEN RAISE EXCEPTION 'Category not found'; END IF;
  IF p_item_id IS NULL THEN
    EXECUTE format('SELECT COALESCE(max(display_order),0) FROM public.%I WHERE category_id=$1', v_item_tbl)
      INTO v_max USING p_category_id;
    EXECUTE format(
      'INSERT INTO public.%I (category_id, text, display_order, organization_id, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id', v_item_tbl)
      INTO v_id USING p_category_id, btrim(p_text), v_max + 1, v_org;
  ELSE
    EXECUTE format('UPDATE public.%I SET text=$1, category_id=$2, updated_at=now() WHERE id=$3 AND organization_id=$4 RETURNING id', v_item_tbl)
      INTO v_id USING btrim(p_text), p_category_id, p_item_id, v_org;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  END IF;
  RETURN v_id;
END; $function$;

CREATE FUNCTION public.delete_checklist_category(p_actor_id uuid, p_bartender boolean, p_category_id uuid, p_kind text DEFAULT NULL::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_tbl text; v_id uuid; v_att jsonb;
BEGIN
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_org := public._require_recipe_editor(v_kind, p_actor_id);
  v_tbl := public._checklist_tbl(v_kind, 'cat');
  -- Soft delete (matches the old client); child items stop rendering with their category.
  -- Uploaded files are queued for the storage sweep (the category row keeps its list).
  EXECUTE format('UPDATE public.%I SET is_active=false, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id, attachments', v_tbl)
    INTO v_id, v_att USING p_category_id, v_org;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT v_org, 'checklist-attachments', a->>'url' FROM jsonb_array_elements(COALESCE(v_att, '[]'::jsonb)) a
     WHERE a->>'kind' = 'file' AND COALESCE(a->>'url','') <> ''
    ON CONFLICT (bucket, file_url) DO NOTHING;
  RETURN TRUE;
END; $function$;

CREATE FUNCTION public.delete_checklist_item(p_actor_id uuid, p_bartender boolean, p_item_id uuid, p_kind text DEFAULT NULL::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_tbl text; v_id uuid;
BEGIN
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_org := public._require_recipe_editor(v_kind, p_actor_id);
  v_tbl := public._checklist_tbl(v_kind, 'item');
  EXECUTE format('UPDATE public.%I SET is_active=false, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id', v_tbl)
    INTO v_id USING p_item_id, v_org;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  RETURN TRUE;
END; $function$;

-- Attachments on a category (files + guide links, cap 3). Removed uploads are queued
-- for the storage sweep server-side — recipe editors can't broker-delete themselves.
CREATE FUNCTION public.set_checklist_category_attachments(p_actor_id uuid, p_bartender boolean, p_category_id uuid, p_attachments jsonb, p_kind text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_kind text; v_tbl text; v_old jsonb; v_new jsonb; v_id uuid;
BEGIN
  v_kind := public._checklist_kind(p_bartender, p_kind);
  v_org := public._require_recipe_editor(v_kind, p_actor_id);
  v_tbl := public._checklist_tbl(v_kind, 'cat');
  v_new := public._checklist_attachments_norm(p_attachments);
  EXECUTE format('SELECT attachments FROM public.%I WHERE id=$1 AND organization_id=$2', v_tbl)
    INTO v_old USING p_category_id, v_org;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  EXECUTE format('UPDATE public.%I SET attachments=$1, updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING id', v_tbl)
    INTO v_id USING v_new, p_category_id, v_org;
  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT v_org, 'checklist-attachments', o->>'url'
      FROM jsonb_array_elements(v_old) o
     WHERE o->>'kind' = 'file' AND COALESCE(o->>'url','') <> ''
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_new) n WHERE n->>'url' = o->>'url')
    ON CONFLICT (bucket, file_url) DO NOTHING;
  RETURN v_new;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_kitchen_checklist_category_translations_actor(p_actor_id uuid, p_id uuid, p_name_es text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_checklist_categories
     SET name_es = COALESCE(p_name_es, name_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.update_kitchen_checklist_item_translations_actor(p_actor_id uuid, p_id uuid, p_text_es text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_recipe_editor('kitchen', p_actor_id);
  UPDATE public.kitchen_checklist_items
     SET text_es = COALESCE(p_text_es, text_es), updated_at = now()
   WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found in your organization'; END IF;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_checklist_categories(uuid, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_checklist_items(uuid, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_checklist_progress(uuid, boolean, date, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_checklist_progress(uuid, boolean, uuid, boolean, date, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_checklist_category(uuid, boolean, text, text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_checklist_item(uuid, boolean, uuid, text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_checklist_category(uuid, boolean, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_checklist_item(uuid, boolean, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_checklist_category_attachments(uuid, boolean, uuid, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_kitchen_checklist_category_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_kitchen_checklist_item_translations_actor(uuid, uuid, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Buckets (private; writes via storage-broker purposes kitchen_recipe_image /
--    checklist_attachment, reads via the signed-read resolver).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('kitchen-recipes', 'kitchen-recipes', false, 10485760, ARRAY['image/jpeg','image/png','image/gif','image/webp']),
  ('checklist-attachments', 'checklist-attachments', false, 20971520, NULL)
ON CONFLICT (id) DO NOTHING;
