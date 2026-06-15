-- Add Glassware + Garnish to Cocktails A-Z (mirrors libation_recipes).
-- The two new columns are nullable text; insert/update RPCs gain p_glassware +
-- p_garnish; the signup/push seeder clones them so they propagate to every org.

ALTER TABLE public.cocktails
  ADD COLUMN IF NOT EXISTS glassware text,
  ADD COLUMN IF NOT EXISTS garnish   text;

-- ── insert_cocktail: add p_glassware + p_garnish (drop old sig first; arg count
--    changed → PostgREST overload ambiguity otherwise). ──
DROP FUNCTION IF EXISTS public.insert_cocktail(uuid, text, text, text, text, text, integer, uuid);

CREATE OR REPLACE FUNCTION public.insert_cocktail(
  p_user_id uuid,
  p_name text,
  p_alcohol_type text,
  p_ingredients text,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_glassware text DEFAULT NULL::text,
  p_garnish text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT; v_cocktail_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN RAISE EXCEPTION 'Only managers can create cocktails'; END IF;
  INSERT INTO cocktails (name, alcohol_type, ingredients, procedure, thumbnail_url, display_order, is_active, created_by, created_at, updated_at, organization_id, glassware, garnish)
  VALUES (p_name, p_alcohol_type, p_ingredients, p_procedure, p_thumbnail_url, p_display_order, true, p_user_id, NOW(), NOW(), p_organization_id, p_glassware, p_garnish)
  RETURNING id INTO v_cocktail_id;
  RETURN v_cocktail_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.insert_cocktail(uuid, text, text, text, text, text, integer, uuid, text, text) TO anon, authenticated, service_role;

-- ── update_cocktail: add p_glassware + p_garnish (drop old sig first). ──
DROP FUNCTION IF EXISTS public.update_cocktail(uuid, uuid, text, text, text, text, text, integer, uuid);

CREATE OR REPLACE FUNCTION public.update_cocktail(
  p_user_id uuid,
  p_cocktail_id uuid,
  p_name text,
  p_alcohol_type text,
  p_ingredients text,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_glassware text DEFAULT NULL::text,
  p_garnish text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN RAISE EXCEPTION 'Only managers can update cocktails'; END IF;
  UPDATE cocktails SET
    name = p_name, alcohol_type = p_alcohol_type, ingredients = p_ingredients,
    procedure = p_procedure, thumbnail_url = p_thumbnail_url, display_order = p_display_order,
    glassware = p_glassware, garnish = p_garnish, updated_at = NOW()
  WHERE id = p_cocktail_id AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public.update_cocktail(uuid, uuid, text, text, text, text, text, integer, uuid, text, text) TO anon, authenticated, service_role;

-- ── seed_org_cocktails: clone glassware + garnish too (same signature). ──
CREATE OR REPLACE FUNCTION public.seed_org_cocktails(
  p_target_org uuid,
  p_source_org uuid DEFAULT '7f9a6397-135a-40c2-849d-6109ef93f6a6'  -- McLoone's
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_target_org IS NULL THEN
    RAISE EXCEPTION 'p_target_org is required';
  END IF;
  IF p_target_org = p_source_org THEN
    RETURN 0;
  END IF;

  INSERT INTO public.cocktails (
    name, alcohol_type, ingredients, procedure, procedure_es,
    glassware, garnish, thumbnail_url, display_order, is_active, created_by, organization_id
  )
  SELECT
    s.name, s.alcohol_type, s.ingredients, s.procedure, s.procedure_es,
    s.glassware, s.garnish, s.thumbnail_url, s.display_order, true, NULL, p_target_org
  FROM public.cocktails s
  WHERE s.organization_id = p_source_org
    AND s.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.cocktails t
      WHERE t.organization_id = p_target_org
        AND lower(btrim(t.name)) = lower(btrim(s.name))
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
