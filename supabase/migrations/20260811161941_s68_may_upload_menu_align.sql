-- s68 A3: one upload-permission rule, used by all five upload RPCs.
-- Before this, the five disagreed: create_menu_upload/get_menu_uploads allowed any manager
-- (inline role check) while quota/consume/apply were _is_org_owner-only. The rule is now:
-- owner, or a manager whose org has the premium.ai_menu_upload grant.
-- (The storage-broker and parse-menu edge functions carry the same rule; deployed alongside:
-- storage-broker v9, parse-menu v7.)
-- APPLIED LIVE via Supabase MCP 2026-08-11 (version 20260811161941). Repo copy for the record.
-- apply_parsed_menu's gate swap is in the sibling 20260811162044 migration.

CREATE FUNCTION public._may_upload_menu(p_org uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT public._is_org_owner(p_org, p_actor)
      OR EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.manager_permissions mp
            ON mp.organization_id = u.organization_id
         WHERE u.id = p_actor
           AND u.organization_id = p_org
           AND u.role = 'manager'
           AND mp.permission_key = 'premium.ai_menu_upload'
           AND mp.granted
      );
$function$;
REVOKE ALL ON FUNCTION public._may_upload_menu(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- create_menu_upload: inline any-manager check -> the shared rule (actor's own org).
CREATE OR REPLACE FUNCTION public.create_menu_upload(p_actor_id uuid, p_file_url text, p_file_name text, p_source_type text, p_page_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_menu(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to upload menus';
  END IF;
  IF p_source_type IS NULL OR p_source_type NOT IN ('pdf','image') THEN
    RAISE EXCEPTION 'Invalid upload source type';
  END IF;
  INSERT INTO public.menu_uploads
    (organization_id, uploaded_by, file_url, file_name, source_type, page_count, status,
     credits_charged, was_free)
  VALUES
    (v_org, p_actor_id, COALESCE(p_file_url,''), COALESCE(p_file_name,''), p_source_type,
     COALESCE(p_page_count, 1), 'processing', 0, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- get_menu_uploads: inline any-manager check -> the shared rule.
CREATE OR REPLACE FUNCTION public.get_menu_uploads(p_actor_id uuid, p_upload_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, file_name text, source_type text, status text, items_inserted integer, credits_charged integer, was_free boolean, error_message text, parsed_result jsonb, target_menu_slot smallint, apply_mode text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_menu(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to view menu uploads';
  END IF;
  RETURN QUERY
    SELECT mu.id, mu.file_name, mu.source_type, mu.status, mu.items_inserted, mu.credits_charged,
           mu.was_free, mu.error_message, mu.parsed_result, mu.target_menu_slot, mu.apply_mode,
           mu.created_at
      FROM public.menu_uploads mu
     WHERE mu.organization_id = v_org
       AND (p_upload_id IS NULL OR mu.id = p_upload_id)
     ORDER BY mu.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

-- get_menu_upload_quota: _is_org_owner -> the shared rule (explicit org arg is membership-checked
-- inside _may_upload_menu, so no cross-org read opens up).
CREATE OR REPLACE FUNCTION public.get_menu_upload_quota(p_user_id uuid, p_organization_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT public._may_upload_menu(p_organization_id, p_user_id) THEN
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
END;
$function$;

-- consume_menu_upload_credits: _is_org_owner -> the shared rule. The 'owner_only' reason
-- string is kept verbatim: parse-menu branches only on 'insufficient_credits' and logs the
-- rest, so renaming it buys nothing and risks ripples.
CREATE OR REPLACE FUNCTION public.consume_menu_upload_credits(p_user_id uuid, p_organization_id uuid, p_source_type text, p_page_count integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE r public.organization_menu_upload_credits; v_cost int; v_remaining int;
BEGIN
  IF NOT public._may_upload_menu(p_organization_id, p_user_id) THEN
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

  IF NOT r.free_menu_upload_used THEN
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
END;
$function$;
