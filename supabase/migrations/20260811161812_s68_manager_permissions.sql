-- s68 A2: per-organization manager permission grants, keyed (not booleans).
-- Two keys go live this wave (org_settings.menu, premium.ai_menu_upload); five more are
-- reserved in the RPC whitelist so the vocabulary is settled. The whitelist lives ONLY in
-- set_manager_permission (no table CHECK) so adding a key later replaces one function.
-- RLS on with zero policies: all access via the two SECURITY DEFINER RPCs (house pattern —
-- auth.uid() is always NULL under custom auth).
-- APPLIED LIVE via Supabase MCP 2026-08-11 (version 20260811161812). Repo copy for the record.

CREATE TABLE public.manager_permissions (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  permission_key  text NOT NULL,
  granted         boolean NOT NULL DEFAULT false,
  granted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, permission_key)
);

ALTER TABLE public.manager_permissions ENABLE ROW LEVEL SECURITY;

-- Readable by owner AND manager: a manager must be able to learn what they may do.
-- Returns only {key, granted}; missing rows read as not-granted client-side.
CREATE FUNCTION public.get_manager_permissions(p_actor_id uuid)
 RETURNS TABLE(permission_key text, granted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') OR v_org IS NULL THEN
    RAISE EXCEPTION 'Only managers or owners can view manager permissions';
  END IF;
  RETURN QUERY
    SELECT mp.permission_key, mp.granted
      FROM public.manager_permissions mp
     WHERE mp.organization_id = v_org;
END; $function$;

-- Owner only, hard-gated by _is_org_owner. Grants are per-organization, not per-user.
CREATE FUNCTION public.set_manager_permission(p_actor_id uuid, p_key text, p_granted boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._is_org_owner(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change manager permissions');
  END IF;
  IF p_key IS NULL OR p_key NOT IN (
    'org_settings.menu', 'org_settings.branding', 'org_settings.jobs_tools', 'org_settings.access',
    'premium.ai_menu_upload', 'premium.review_refresh', 'premium.ai_schedule_upload'
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
END; $function$;
