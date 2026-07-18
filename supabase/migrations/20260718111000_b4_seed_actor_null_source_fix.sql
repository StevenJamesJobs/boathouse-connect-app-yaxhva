-- B4 Batch 3 fix-up (2026-07-18, session 48): seed_org_cocktails_actor called
-- with NO p_source_org (the setup-wizard's shape — the legacy fn defaulted its
-- source to the sample org internally) resolved NULL through _recipe_source_org
-- to the actor's OWN org and silently no-op'd. NULL now defaults to the sample
-- org by slug, matching the legacy behavior; an explicit source stays bounded
-- to own-or-sample via _recipe_source_org.
-- ROLLBACK: re-apply the seed_org_cocktails_actor definition from
-- 20260718110000_b4_actor_gates_misc.sql.
CREATE OR REPLACE FUNCTION public.seed_org_cocktails_actor(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid; v_source uuid;
BEGIN
  v_org := public._require_owner_role(p_actor_id);
  IF p_source_org IS NULL THEN
    SELECT o.id INTO v_source FROM public.organizations o WHERE o.slug = 'mcloones-boathouse';
  ELSE
    v_source := public._recipe_source_org(p_actor_id, p_source_org);
  END IF;
  IF v_source IS NULL OR v_source = v_org THEN RETURN 0; END IF;
  RETURN public.seed_org_cocktails(v_org, v_source);
END $$;
