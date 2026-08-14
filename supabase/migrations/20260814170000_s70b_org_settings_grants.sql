-- s70b: wire org_settings.branding / org_settings.jobs_tools / org_settings.access
-- + premium.review_refresh as real grants (Steve's s70 smoke-feedback greenlight).
-- Pattern per s68: _may_* helper predicates (owner OR granted manager), EXECUTE
-- revoked like _is_org_owner; gated fns rewritten mechanically, bodies preserved.
-- Applied to the live shared DB via MCP 2026-08-14 (this file is the repo record).
--
-- 1. Helpers: _may_configure_branding / _may_configure_jobs_tools /
--    _may_configure_access / _may_refresh_reviews — _may_configure_menu shape
--    with their respective manager_permissions keys; EXECUTE revoked from
--    PUBLIC/anon/authenticated.
-- 2. update_organization_settings: per-field-group gating for non-owners —
--    MENU (menu_count, menu_1/2_name, menu_1/2_icon) → _may_configure_menu;
--    BRANDING (name, address, city, state, zip, weather_location,
--    google_maps_query, reward_currency_name, header_icon) → _may_configure_branding;
--    ACCESS (allow_self_signup, staff_can_view_roster, default_password) →
--    _may_configure_access. No grant at all → original owner-only error verbatim;
--    a group present without its grant → 'You do not have permission to change
--    these settings.'
-- 3. Six Jobs & Tools writes swap the role='owner' lookup for
--    _may_configure_jobs_tools (bodies verbatim): add_org_job_title,
--    set_org_job_title_active, reorder_org_job_titles, delete_org_job_title,
--    set_org_assistant_active, set_job_title_assistant. (Reads were already
--    member-level.)
-- 4. regenerate_join_code: primary owner OR _may_configure_access.
-- 5. set_org_logo: _may_configure_branding (includes owner).
-- 6. consume_review_refresh + get_review_refresh_quota: _may_refresh_reviews
--    (reason/error strings kept verbatim for old-client parity).
--
-- The full SQL below is exactly what was applied.

-- 1. Helper predicates ------------------------------------------------------
CREATE OR REPLACE FUNCTION public._may_configure_branding(p_org uuid, p_actor uuid)
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
           AND mp.permission_key = 'org_settings.branding'
           AND mp.granted
      );
$function$;

CREATE OR REPLACE FUNCTION public._may_configure_jobs_tools(p_org uuid, p_actor uuid)
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
           AND mp.permission_key = 'org_settings.jobs_tools'
           AND mp.granted
      );
$function$;

CREATE OR REPLACE FUNCTION public._may_configure_access(p_org uuid, p_actor uuid)
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
           AND mp.permission_key = 'org_settings.access'
           AND mp.granted
      );
$function$;

CREATE OR REPLACE FUNCTION public._may_refresh_reviews(p_org uuid, p_actor uuid)
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
           AND mp.permission_key = 'premium.review_refresh'
           AND mp.granted
      );
$function$;

REVOKE ALL ON FUNCTION public._may_configure_branding(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._may_configure_jobs_tools(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._may_configure_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._may_refresh_reviews(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. update_organization_settings — per-field-group gating -------------------
CREATE OR REPLACE FUNCTION public.update_organization_settings(p_organization_id uuid, p_user_id uuid, p_name text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_zip text DEFAULT NULL::text, p_weather_location text DEFAULT NULL::text, p_google_maps_query text DEFAULT NULL::text, p_reward_currency_name text DEFAULT NULL::text, p_allow_self_signup boolean DEFAULT NULL::boolean, p_menu_count integer DEFAULT NULL::integer, p_menu_1_name text DEFAULT NULL::text, p_menu_2_name text DEFAULT NULL::text, p_default_password text DEFAULT NULL::text, p_menu_1_icon text DEFAULT NULL::text, p_menu_2_icon text DEFAULT NULL::text, p_header_icon text DEFAULT NULL::text, p_staff_can_view_roster boolean DEFAULT NULL::boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_is_owner boolean;
  v_wants_menu boolean;
  v_wants_branding boolean;
  v_wants_access boolean;
  v_result JSON;
BEGIN
  v_is_owner := public._is_org_owner(p_organization_id, p_user_id);

  IF NOT v_is_owner THEN
    -- s70b: field-group grants. Each group a non-owner touches requires its
    -- own manager_permissions key; a caller with no grant at all gets the
    -- original owner-only error verbatim (old-client parity).
    IF NOT (public._may_configure_menu(p_organization_id, p_user_id)
         OR public._may_configure_branding(p_organization_id, p_user_id)
         OR public._may_configure_access(p_organization_id, p_user_id)) THEN
      RETURN json_build_object('success', false, 'error', 'Only the organization owner can update settings');
    END IF;

    v_wants_menu := p_menu_count IS NOT NULL OR p_menu_1_name IS NOT NULL
       OR p_menu_2_name IS NOT NULL OR p_menu_1_icon IS NOT NULL OR p_menu_2_icon IS NOT NULL;
    v_wants_branding := p_name IS NOT NULL OR p_address IS NOT NULL OR p_city IS NOT NULL
       OR p_state IS NOT NULL OR p_zip IS NOT NULL OR p_weather_location IS NOT NULL
       OR p_google_maps_query IS NOT NULL OR p_reward_currency_name IS NOT NULL
       OR p_header_icon IS NOT NULL;
    v_wants_access := p_allow_self_signup IS NOT NULL OR p_staff_can_view_roster IS NOT NULL
       OR p_default_password IS NOT NULL;

    IF v_wants_menu AND NOT public._may_configure_menu(p_organization_id, p_user_id) THEN
      RETURN json_build_object('success', false, 'error', 'You do not have permission to change these settings.');
    END IF;
    IF v_wants_branding AND NOT public._may_configure_branding(p_organization_id, p_user_id) THEN
      RETURN json_build_object('success', false, 'error', 'You do not have permission to change these settings.');
    END IF;
    IF v_wants_access AND NOT public._may_configure_access(p_organization_id, p_user_id) THEN
      RETURN json_build_object('success', false, 'error', 'You do not have permission to change these settings.');
    END IF;
  END IF;

  UPDATE organizations SET
    name = COALESCE(p_name, name),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    zip = COALESCE(p_zip, zip),
    weather_location = COALESCE(p_weather_location, weather_location),
    google_maps_query = COALESCE(p_google_maps_query, google_maps_query),
    reward_currency_name = COALESCE(p_reward_currency_name, reward_currency_name),
    allow_self_signup = COALESCE(p_allow_self_signup, allow_self_signup),
    menu_count = COALESCE(p_menu_count, menu_count),
    menu_1_name = COALESCE(p_menu_1_name, menu_1_name),
    menu_2_name = COALESCE(p_menu_2_name, menu_2_name),
    default_password = COALESCE(p_default_password, default_password),
    menu_1_icon = COALESCE(p_menu_1_icon, menu_1_icon),
    menu_2_icon = COALESCE(p_menu_2_icon, menu_2_icon),
    header_icon = COALESCE(p_header_icon, header_icon),
    staff_can_view_roster = COALESCE(p_staff_can_view_roster, staff_can_view_roster),
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END; $function$;

-- 3. Jobs & Tools writes: owner-only lookup -> owner-or-granted --------------
CREATE OR REPLACE FUNCTION public.add_org_job_title(p_actor_id uuid, p_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_id uuid; v_title text;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_title := trim(p_title);
  IF v_title IS NULL OR length(v_title) = 0 THEN RAISE EXCEPTION 'Title required'; END IF;
  INSERT INTO public.organization_job_titles (organization_id, title, display_order, is_active)
  VALUES (v_org, v_title,
    COALESCE((SELECT max(display_order) + 1 FROM public.organization_job_titles WHERE organization_id = v_org), 0),
    true)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_org_job_title_active(p_actor_id uuid, p_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_job_titles SET is_active = p_is_active
  WHERE id = p_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_org_job_titles(p_actor_id uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_job_titles t SET display_order = o.idx - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, idx)
  WHERE t.id = o.id AND t.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_org_job_title(p_actor_id uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.organization_job_titles WHERE id = p_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_org_assistant_active(p_actor_id uuid, p_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.organization_assistants SET is_active = p_is_active
  WHERE id = p_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_job_title_assistant(p_actor_id uuid, p_assistant_key text, p_job_title text, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_jobs_tools(v_org, p_actor_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_enabled THEN
    INSERT INTO public.job_title_assistants (organization_id, assistant_key, job_title)
    VALUES (v_org, p_assistant_key, p_job_title)
    ON CONFLICT (organization_id, job_title, assistant_key) DO NOTHING;
  ELSE
    DELETE FROM public.job_title_assistants
    WHERE organization_id = v_org AND assistant_key = p_assistant_key AND job_title = p_job_title;
  END IF;
END; $function$;

-- 4. regenerate_join_code: primary owner OR access-granted manager -----------
CREATE OR REPLACE FUNCTION public.regenerate_join_code(p_organization_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_owner_id UUID;
  v_new_code TEXT;
  v_org_name TEXT;
  v_prefix TEXT;
BEGIN
  -- Verify caller is the org owner (or, s70b, an access-granted manager)
  SELECT owner_id, name INTO v_owner_id, v_org_name
  FROM organizations
  WHERE id = p_organization_id;

  IF v_owner_id IS NULL
     OR (v_owner_id != p_user_id AND NOT public._may_configure_access(p_organization_id, p_user_id)) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can regenerate the join code');
  END IF;

  -- Generate a new code: first 4 chars of uppercase name + hyphen + 4 random alphanumeric
  v_prefix := UPPER(LEFT(REGEXP_REPLACE(v_org_name, '[^a-zA-Z]', '', 'g'), 4));
  v_new_code := v_prefix || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4));

  -- Ensure uniqueness (retry up to 5 times)
  FOR i IN 1..5 LOOP
    BEGIN
      UPDATE organizations
      SET join_code = v_new_code, updated_at = now()
      WHERE id = p_organization_id;

      RETURN json_build_object('success', true, 'join_code', v_new_code);
    EXCEPTION WHEN unique_violation THEN
      v_new_code := v_prefix || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || i::TEXT), 1, 4));
    END;
  END LOOP;

  RETURN json_build_object('success', false, 'error', 'Could not generate unique join code');
END;
$function$;

-- 5. set_org_logo: owner OR branding-granted manager -------------------------
CREATE OR REPLACE FUNCTION public.set_org_logo(p_actor_id uuid, p_logo_url text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_configure_branding(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change the logo');
  END IF;
  UPDATE public.organizations SET logo_url = p_logo_url, updated_at = now() WHERE id = v_org;
  RETURN json_build_object('success', true);
END; $function$;

-- 6. Review-refresh quota RPCs: owner OR review-refresh-granted manager ------
CREATE OR REPLACE FUNCTION public.consume_review_refresh(p_user_id uuid, p_organization_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE r public.organization_menu_upload_credits; v_remaining int;
BEGIN
  IF NOT public._may_refresh_reviews(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id RETURNING * INTO r;
  END IF;
  v_remaining := r.manual_refresh_allowance - r.manual_refresh_used;
  IF v_remaining <= 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'limit_reached', 'remaining', 0,
      'allowance', r.manual_refresh_allowance);
  END IF;
  UPDATE public.organization_menu_upload_credits
     SET manual_refresh_used = r.manual_refresh_used + 1, updated_at = now()
   WHERE organization_id = p_organization_id;
  RETURN json_build_object('ok', true, 'remaining', GREATEST(0, v_remaining - 1),
    'allowance', r.manual_refresh_allowance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_review_refresh_quota(p_user_id uuid, p_organization_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT public._may_refresh_reviews(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'owner_only');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id RETURNING * INTO r;
  END IF;
  RETURN json_build_object(
    'success', true,
    'remaining', GREATEST(0, r.manual_refresh_allowance - r.manual_refresh_used),
    'allowance', r.manual_refresh_allowance,
    'used', r.manual_refresh_used,
    'period_start', r.period_start
  );
END;
$function$;
