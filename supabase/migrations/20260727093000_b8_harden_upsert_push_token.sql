-- B8 Item 2 (session 54, 2026-07-27) smoke-test follow-up: upsert_push_token
-- inserted the CLIENT-SUPPLIED org as-is (DEFAULT NULL). At login the app races
-- OrganizationContext and can pass NULL; the (now dropped) backfill trigger used
-- to silently stamp McLoone's org on those rows - Steve's smoke test surfaced the
-- 23502 the fail-loud design now produces instead. Fix: derive the org from the
-- user row server-side and ignore the client value (param kept for signature
-- compatibility with shipped clients - zero client changes). Also pins search_path
-- to the batch standard (was 'public' only) and repairs the 9 mis-attributed rows
-- (3 MyResto Test / 2 Belmont / 2 Reading Room / 1 Con Alma / 1 Keva users whose
-- tokens were stamped with Boathouse's org).
-- Applied LIVE via Supabase MCP apply_migration (b8_harden_upsert_push_token).
-- Rollback: session54_manifests/rollback_b8_upsert_push_token.sql (original body;
-- the data repair is not reversed - it corrects data).

CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_user_id uuid,
  p_token text,
  p_device_type text,
  p_organization_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org uuid;
BEGIN
  -- Derive the org from the user row; never trust the client-supplied value.
  SELECT organization_id INTO v_org FROM users WHERE id = p_user_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'unknown user for push token';
  END IF;
  DELETE FROM push_tokens WHERE user_id = p_user_id;
  INSERT INTO push_tokens (user_id, token, device_type, organization_id)
  VALUES (p_user_id, p_token, p_device_type, v_org);
END;
$function$;

-- Repair rows the trigger mis-stamped (org != the owner's real org).
UPDATE public.push_tokens pt
SET organization_id = u.organization_id
FROM public.users u
WHERE u.id = pt.user_id
  AND pt.organization_id IS DISTINCT FROM u.organization_id;

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM public.push_tokens pt
  JOIN public.users u ON u.id = pt.user_id
  WHERE pt.organization_id IS DISTINCT FROM u.organization_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'push_tokens repair incomplete: % rows still mis-attributed', bad;
  END IF;
END $$;
