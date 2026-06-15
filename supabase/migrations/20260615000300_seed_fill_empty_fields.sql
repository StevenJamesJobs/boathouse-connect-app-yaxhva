-- Enhance the seeder so a push also propagates refinements to EXISTING cocktails,
-- not just adds missing ones. It now (1) INSERTs cocktails the target org lacks
-- by name [unchanged], and (2) FILLs only the EMPTY (NULL) display fields on
-- cocktails the org already has by name — never overwriting a value the org has
-- set. So when the source library gains glassware/garnish/etc., the next push
-- carries it to orgs that don't have it yet, while protecting org customizations.
--
-- Returns the total rows changed (inserted + filled), so the push button can
-- report real activity instead of "up to date" when it actually filled fields.
-- The backfill_all_orgs_cocktails / push_source_cocktails_to_all_orgs wrappers
-- call this and need no change.

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
  v_inserted integer;
  v_filled   integer;
BEGIN
  IF p_target_org IS NULL THEN
    RAISE EXCEPTION 'p_target_org is required';
  END IF;
  IF p_target_org = p_source_org THEN
    RETURN 0;  -- never seed the source into itself (keeps the source pristine)
  END IF;

  -- (1) Add cocktails the target org is missing by name.
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
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- (2) Fill only the EMPTY display fields on cocktails the org already has by
  --     name. COALESCE keeps any value the org set; the WHERE limits the touch
  --     (and the count) to rows that genuinely gain something → idempotent.
  UPDATE public.cocktails t SET
    glassware     = COALESCE(t.glassware, s.glassware),
    garnish       = COALESCE(t.garnish, s.garnish),
    procedure     = COALESCE(t.procedure, s.procedure),
    procedure_es  = COALESCE(t.procedure_es, s.procedure_es),
    thumbnail_url = COALESCE(t.thumbnail_url, s.thumbnail_url),
    updated_at    = now()
  FROM public.cocktails s
  WHERE s.organization_id = p_source_org
    AND s.is_active = true
    AND t.organization_id = p_target_org
    AND lower(btrim(t.name)) = lower(btrim(s.name))
    AND (
         (t.glassware     IS NULL AND s.glassware     IS NOT NULL)
      OR (t.garnish       IS NULL AND s.garnish       IS NOT NULL)
      OR (t.procedure     IS NULL AND s.procedure     IS NOT NULL)
      OR (t.procedure_es  IS NULL AND s.procedure_es  IS NOT NULL)
      OR (t.thumbnail_url IS NULL AND s.thumbnail_url IS NOT NULL)
    );
  GET DIAGNOSTICS v_filled = ROW_COUNT;

  RETURN v_inserted + v_filled;
END;
$$;
