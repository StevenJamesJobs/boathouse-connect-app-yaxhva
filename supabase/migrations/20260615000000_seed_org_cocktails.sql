-- Cocktails A-Z signup seeder + manual-push backfill.
--
-- McLoone's/Boathouse org (7f9a6397-135a-40c2-849d-6109ef93f6a6) is the canonical
-- source library of ~52 cleaned Cocktails A-Z recipes. We want every NEW org to
-- start with this library at onboarding, plus a way to push newly-added cocktails
-- to existing orgs over time.
--
-- Why a SECURITY DEFINER RPC (not a client .insert()): the cocktails INSERT RLS is
-- gated on auth.uid() + role='manager', which is NULL under the app's anon-key
-- custom auth, so a direct client insert silently fails. The RPC runs as its owner
-- and bypasses RLS.
--
-- Why WHERE NOT EXISTS by name (not ON CONFLICT): there is no unique constraint on
-- (organization_id, name). By-name idempotency also makes the SAME function serve
-- both the signup seed and the "push more over time" backfill -- it only ever adds
-- names the target lacks, never clobbering an org's own edits.

-- ───────────────────────────────────────────────────────────────────────────
-- RPC 1: seed_org_cocktails — clone active source cocktails into a target org.
--        Idempotent by name. Used by signup (setup-wizard) AND the backfill below.
-- ───────────────────────────────────────────────────────────────────────────
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

  -- Never seed the source into itself — keeps McLoone's pristine even if called
  -- with target = source (e.g. from the all-orgs backfill before the WHERE filter).
  IF p_target_org = p_source_org THEN
    RETURN 0;
  END IF;

  INSERT INTO public.cocktails (
    name, alcohol_type, ingredients, procedure, procedure_es,
    thumbnail_url, display_order, is_active, created_by, organization_id
  )
  SELECT
    s.name, s.alcohol_type, s.ingredients, s.procedure, s.procedure_es,
    s.thumbnail_url, s.display_order, true, NULL, p_target_org
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

-- Called from the app client (anon key, custom auth) via the setup-wizard.
GRANT EXECUTE ON FUNCTION public.seed_org_cocktails(uuid, uuid) TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC 2: backfill_all_orgs_cocktails — the "manual push". Loops every org except
--        the source and seeds it. Admin-only: NOT granted to anon/authenticated,
--        so it can only run under a privileged role (Supabase MCP / SQL editor).
--        Run it whenever new cocktails are added to the source library:
--            SELECT public.backfill_all_orgs_cocktails();
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_all_orgs_cocktails(
  p_source_org uuid DEFAULT '7f9a6397-135a-40c2-849d-6109ef93f6a6'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org     record;
  v_seeded  integer;
  v_total   integer := 0;
  v_orgs    integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_org IN
    SELECT id, name FROM public.organizations
    WHERE id <> p_source_org
    ORDER BY name
  LOOP
    v_seeded := public.seed_org_cocktails(v_org.id, p_source_org);
    v_total  := v_total + v_seeded;
    v_orgs   := v_orgs + 1;
    IF v_seeded > 0 THEN
      v_results := v_results || jsonb_build_object(
        'org_id', v_org.id, 'name', v_org.name, 'seeded', v_seeded
      );
    END IF;
  END LOOP;

  RETURN json_build_object(
    'orgs_processed', v_orgs,
    'total_seeded',   v_total,
    'details',        v_results
  );
END;
$$;

-- Admin-only: strip execute from the app-client roles so anon/authenticated
-- can't invoke the all-orgs push. Supabase's ALTER DEFAULT PRIVILEGES grants
-- EXECUTE on new public functions to anon/authenticated explicitly (not just via
-- PUBLIC), so revoke from those roles by name. Keep it for the privileged
-- service_role used by the Supabase MCP / SQL editor.
REVOKE ALL ON FUNCTION public.backfill_all_orgs_cocktails(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_all_orgs_cocktails(uuid) TO service_role;
