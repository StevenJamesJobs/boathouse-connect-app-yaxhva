-- s83 (2026-09-09, Steve): THE SCHEDULE WAVE — shift tools (time off, release / pick-up,
-- approvals), schedule scan credits + the premium.ai_schedule_upload grant going live,
-- upload titles / reviewed flag, the elevated Schedule Settings toggles, and the
-- notification plumbing (per-user shade rows, the Shift releases preference).
--
-- House discipline: every RPC is SECURITY DEFINER + search_path pin + actor-gated with the
-- org DERIVED from the actor's row; new tables are RLS-on with ZERO policies (deny-all by
-- design — every read/write goes through these RPCs). Signature changes are DROP + CREATE
-- (a CREATE OR REPLACE with a new trailing param would mint an OVERLOAD and PostgREST
-- would refuse to choose); the new params all default, so build 16 keeps working.

-- ───────────────────────────── 1. columns ─────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS time_off_requests_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shift_release_enabled     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS roster_pm_cutoff          time    NOT NULL DEFAULT '12:00';

ALTER TABLE public.schedule_uploads
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS source_type     text,
  ADD COLUMN IF NOT EXISTS page_count      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS credits_charged integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS was_free        boolean NOT NULL DEFAULT false;
ALTER TABLE public.schedule_uploads DROP CONSTRAINT IF EXISTS schedule_uploads_source_type_check;
ALTER TABLE public.schedule_uploads
  ADD CONSTRAINT schedule_uploads_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('pdf','image','manual'));

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS shift_releases_enabled boolean NOT NULL DEFAULT true;

-- send-push logs every delivery with its notificationType; two new transactional types.
ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_notification_type_check;
ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_notification_type_check
  CHECK (notification_type = ANY (ARRAY['message','reward','announcement','event','special_feature','custom','schedule','shift_release']));

-- ───────────────────────────── 2. tables ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','denied','cancelled','expired')),
  decided_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_reason text,
  seen_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_requests_range_check CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS time_off_requests_org_status_idx ON public.time_off_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS time_off_requests_user_idx ON public.time_off_requests (user_id);
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shift_releases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id         uuid NOT NULL REFERENCES public.staff_schedules(id) ON DELETE CASCADE,
  released_by      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','claimed','approved','denied','cancelled','expired')),
  claimed_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at       timestamptz,
  decided_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decision_reason  text,
  releaser_seen_at timestamptz,
  claimer_seen_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- one LIVE release per shift (a denied pick-up re-opens as a fresh row)
CREATE UNIQUE INDEX IF NOT EXISTS shift_releases_live_uq ON public.shift_releases (shift_id) WHERE status IN ('open','claimed');
CREATE INDEX IF NOT EXISTS shift_releases_org_status_idx ON public.shift_releases (organization_id, status);
ALTER TABLE public.shift_releases ENABLE ROW LEVEL SECURITY;

-- Schedule scans get THEIR OWN monthly pool (weekly schedules would drain the menu pool
-- of 10 by themselves). Same costs as menus: PDF 3 · image 1 per page. First scan free.
CREATE TABLE IF NOT EXISTS public.organization_schedule_upload_credits (
  organization_id           uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_allowance         integer NOT NULL DEFAULT 15,
  period_used               integer NOT NULL DEFAULT 0,
  free_schedule_upload_used boolean NOT NULL DEFAULT false,
  period_start              timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_schedule_upload_credits ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────── 3. predicates / helpers ─────────────────────────────
-- owner, or a manager holding premium.ai_schedule_upload (the key already whitelisted in
-- set_manager_permission — LIVE from this wave).
CREATE OR REPLACE FUNCTION public._may_upload_schedule(p_org uuid, p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
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
           AND mp.permission_key = 'premium.ai_schedule_upload'
           AND mp.granted
      );
$function$;
REVOKE ALL ON FUNCTION public._may_upload_schedule(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- the actor's job titles, lower-cased (job_titles[] with the legacy job_title fallback)
CREATE OR REPLACE FUNCTION public._user_titles_lower(p_user uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT COALESCE(
           (SELECT array_agg(lower(btrim(t)))
              FROM unnest(COALESCE(NULLIF(u.job_titles, '{}'::text[]),
                                   CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END)) t),
           ARRAY[]::text[])
    FROM public.users u WHERE u.id = p_user;
$function$;
REVOKE ALL ON FUNCTION public._user_titles_lower(uuid) FROM PUBLIC, anon, authenticated;

-- does a user hold ANY of a shift's roles (case-insensitive)?
CREATE OR REPLACE FUNCTION public._user_matches_roles(p_user uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_roles, '{}'::text[])) r
     WHERE lower(btrim(r)) = ANY (public._user_titles_lower(p_user))
  );
$function$;
REVOKE ALL ON FUNCTION public._user_matches_roles(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- 30-day sweep + expiry, run by the approvals readers (pg_cron is not installed)
CREATE OR REPLACE FUNCTION public._sweep_schedule_requests(p_org uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.time_off_requests t
     SET status = 'expired'
   WHERE t.organization_id = p_org AND t.status = 'pending' AND t.end_date < current_date;
  UPDATE public.shift_releases r
     SET status = 'expired'
   WHERE r.organization_id = p_org AND r.status IN ('open','claimed')
     AND EXISTS (SELECT 1 FROM public.staff_schedules s WHERE s.id = r.shift_id AND s.shift_date < current_date);
  DELETE FROM public.time_off_requests t
   WHERE t.organization_id = p_org AND t.status <> 'pending'
     AND COALESCE(t.decided_at, t.created_at) < now() - interval '30 days';
  DELETE FROM public.shift_releases r
   WHERE r.organization_id = p_org AND r.status NOT IN ('open','claimed')
     AND COALESCE(r.decided_at, r.created_at) < now() - interval '30 days';
END; $function$;
REVOKE ALL ON FUNCTION public._sweep_schedule_requests(uuid) FROM PUBLIC, anon, authenticated;

-- ───────────────────────────── 4. schedule settings ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_schedule_settings(p_actor_id uuid)
RETURNS TABLE(staff_can_view_roster boolean, time_off_requests_enabled boolean, shift_release_enabled boolean, roster_pm_cutoff time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT o.staff_can_view_roster, o.time_off_requests_enabled, o.shift_release_enabled, o.roster_pm_cutoff
    FROM public.organizations o
   WHERE o.id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id);
$function$;
GRANT EXECUTE ON FUNCTION public.get_schedule_settings(uuid) TO anon, authenticated;

-- update_organization_settings gains the three schedule toggles in the ACCESS field group.
DROP FUNCTION IF EXISTS public.update_organization_settings(uuid, uuid, text, text, text, text, text, text, text, text, boolean, integer, text, text, text, text, text, text, boolean);
CREATE FUNCTION public.update_organization_settings(
  p_organization_id uuid, p_user_id uuid,
  p_name text DEFAULT NULL, p_address text DEFAULT NULL, p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_zip text DEFAULT NULL,
  p_weather_location text DEFAULT NULL, p_google_maps_query text DEFAULT NULL, p_reward_currency_name text DEFAULT NULL,
  p_allow_self_signup boolean DEFAULT NULL, p_menu_count integer DEFAULT NULL, p_menu_1_name text DEFAULT NULL, p_menu_2_name text DEFAULT NULL,
  p_default_password text DEFAULT NULL, p_menu_1_icon text DEFAULT NULL, p_menu_2_icon text DEFAULT NULL, p_header_icon text DEFAULT NULL,
  p_staff_can_view_roster boolean DEFAULT NULL,
  p_time_off_requests_enabled boolean DEFAULT NULL, p_shift_release_enabled boolean DEFAULT NULL, p_roster_pm_cutoff time DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
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
       OR p_default_password IS NOT NULL
       OR p_time_off_requests_enabled IS NOT NULL OR p_shift_release_enabled IS NOT NULL OR p_roster_pm_cutoff IS NOT NULL;

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
    time_off_requests_enabled = COALESCE(p_time_off_requests_enabled, time_off_requests_enabled),
    shift_release_enabled = COALESCE(p_shift_release_enabled, shift_release_enabled),
    roster_pm_cutoff = COALESCE(p_roster_pm_cutoff, roster_pm_cutoff),
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END; $function$;
GRANT EXECUTE ON FUNCTION public.update_organization_settings(uuid, uuid, text, text, text, text, text, text, text, text, boolean, integer, text, text, text, text, text, text, boolean, boolean, boolean, time) TO anon, authenticated;

-- ───────────────────────────── 5. scan credits ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_schedule_upload_quota(p_actor_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; r public.organization_schedule_upload_credits;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_schedule(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to upload schedules');
  END IF;
  INSERT INTO public.organization_schedule_upload_credits (organization_id)
    VALUES (v_org) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_schedule_upload_credits WHERE organization_id = v_org FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_schedule_upload_credits
       SET period_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = v_org
    RETURNING * INTO r;
  END IF;
  RETURN json_build_object(
    'success', true,
    'free_available', (NOT r.free_schedule_upload_used),
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used),
    'monthly_allowance', r.monthly_allowance,
    'period_start', r.period_start,
    'costs', json_build_object('pdf', 3, 'image_per_page', 1)
  );
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_schedule_upload_quota(uuid) TO anon, authenticated;

-- Charged by parse-schedule AFTER a successful parse (a failed scan never charges; a
-- deleted upload never refunds). The client pre-checks the quota before uploading.
CREATE OR REPLACE FUNCTION public.consume_schedule_upload_credits(p_actor_id uuid, p_source_type text, p_page_count integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; r public.organization_schedule_upload_credits; v_cost int; v_remaining int;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_schedule(v_org, p_actor_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  IF p_source_type NOT IN ('pdf','image') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_source');
  END IF;
  INSERT INTO public.organization_schedule_upload_credits (organization_id)
    VALUES (v_org) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_schedule_upload_credits WHERE organization_id = v_org FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_schedule_upload_credits
       SET period_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = v_org
    RETURNING * INTO r;
  END IF;
  IF NOT r.free_schedule_upload_used THEN
    UPDATE public.organization_schedule_upload_credits
       SET free_schedule_upload_used = true, updated_at = now()
     WHERE organization_id = v_org;
    RETURN json_build_object('ok', true, 'charged', 0, 'free_used', true,
      'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used));
  END IF;
  v_cost := CASE p_source_type WHEN 'pdf' THEN 3 ELSE GREATEST(1, COALESCE(p_page_count, 1)) END;
  v_remaining := r.monthly_allowance - r.period_used;
  IF v_remaining < v_cost THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_credits',
      'required', v_cost, 'credits_remaining', GREATEST(0, v_remaining));
  END IF;
  UPDATE public.organization_schedule_upload_credits
     SET period_used = r.period_used + v_cost, updated_at = now()
   WHERE organization_id = v_org;
  RETURN json_build_object('ok', true, 'charged', v_cost, 'free_used', false,
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used - v_cost));
END; $function$;
GRANT EXECUTE ON FUNCTION public.consume_schedule_upload_credits(uuid, text, integer) TO anon, authenticated;

-- ───────────────────────────── 6. uploads: title / reviewed / grant ─────────────────────────────
DROP FUNCTION IF EXISTS public.create_schedule_upload(uuid, text, text, date, date, text);
CREATE FUNCTION public.create_schedule_upload(
  p_actor_id uuid, p_file_url text, p_file_name text, p_week_start date, p_week_end date,
  p_status text DEFAULT 'processing', p_title text DEFAULT NULL, p_source_type text DEFAULT NULL, p_page_count integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can upload schedules';
  END IF;
  IF NOT public._may_upload_schedule(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to upload schedules';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending','processing','completed','failed') THEN
    RAISE EXCEPTION 'Invalid upload status';
  END IF;
  INSERT INTO public.schedule_uploads
    (organization_id, uploaded_by, file_url, file_name, week_start, week_end, status, title, source_type, page_count)
  VALUES
    (v_org, p_actor_id, COALESCE(p_file_url, ''), COALESCE(p_file_name, ''), p_week_start, p_week_end, p_status,
     NULLIF(btrim(COALESCE(p_title, '')), ''), p_source_type, GREATEST(1, COALESCE(p_page_count, 1)))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.create_schedule_upload(uuid, text, text, date, date, text, text, text, integer) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_org_uploads(uuid, uuid, date, integer);
CREATE FUNCTION public.get_org_uploads(p_actor_id uuid, p_upload_id uuid DEFAULT NULL, p_week_start date DEFAULT NULL, p_limit integer DEFAULT NULL)
RETURNS TABLE(id uuid, uploaded_by uuid, file_url text, file_name text, week_start date, week_end date, status text,
              parsed_shifts_count integer, unmatched_employees jsonb, error_message text, created_at timestamptz,
              title text, reviewed_at timestamptz, source_type text, page_count integer, credits_charged integer, was_free boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view schedule uploads';
  END IF;
  RETURN QUERY
    SELECT su.id, su.uploaded_by, su.file_url, su.file_name, su.week_start, su.week_end,
           su.status, su.parsed_shifts_count, su.unmatched_employees, su.error_message, su.created_at,
           su.title, su.reviewed_at, su.source_type, su.page_count, su.credits_charged, su.was_free
      FROM public.schedule_uploads su
     WHERE su.organization_id = v_org
       AND (p_upload_id IS NULL OR su.id = p_upload_id)
       AND (p_week_start IS NULL OR su.week_start = p_week_start)
     ORDER BY su.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_org_uploads(uuid, uuid, date, integer) TO anon, authenticated;

-- Manual-entry weeks are their own kind (no scan, no credits, never trash-able from Recent uploads)
UPDATE public.schedule_uploads SET source_type = 'manual' WHERE file_name = 'Manual Entry' AND source_type IS NULL;

CREATE OR REPLACE FUNCTION public.add_shift(p_actor_id uuid, p_employee_name text, p_shift_date date, p_start_time time without time zone, p_end_time time without time zone, p_upload_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_roles text[] DEFAULT '{}'::text[], p_is_opener boolean DEFAULT false, p_is_closer boolean DEFAULT false, p_is_training boolean DEFAULT false, p_room_assignment text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_role text; v_org uuid; v_target_org uuid;
  v_upload uuid; v_week_start date; v_week_end date; v_shift uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can add shifts';
  END IF;
  IF p_employee_name IS NULL OR btrim(p_employee_name) = '' THEN
    RAISE EXCEPTION 'Employee name is required';
  END IF;
  IF p_user_id IS NOT NULL THEN
    SELECT u.organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
    IF v_target_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Cannot assign a shift to a user in another organization';
    END IF;
  END IF;

  IF p_upload_id IS NOT NULL THEN
    SELECT su.id INTO v_upload FROM public.schedule_uploads su
     WHERE su.id = p_upload_id AND su.organization_id = v_org;
    IF v_upload IS NULL THEN
      RAISE EXCEPTION 'Upload not found';
    END IF;
  ELSE
    -- latest completed upload whose week covers the date, else a placeholder
    -- "Manual Entry" upload for that (Sun–Sat) week.
    SELECT su.id INTO v_upload FROM public.schedule_uploads su
     WHERE su.organization_id = v_org
       AND su.week_start <= p_shift_date AND su.week_end >= p_shift_date
       AND su.status = 'completed'
     ORDER BY su.created_at DESC
     LIMIT 1;
    IF v_upload IS NULL THEN
      v_week_start := p_shift_date - EXTRACT(DOW FROM p_shift_date)::int;
      v_week_end   := v_week_start + 6;
      INSERT INTO public.schedule_uploads
        (organization_id, uploaded_by, file_url, file_name, week_start, week_end, status, parsed_shifts_count, source_type, reviewed_at)
      VALUES (v_org, p_actor_id, '', 'Manual Entry', v_week_start, v_week_end, 'completed', 0, 'manual', now())
      RETURNING id INTO v_upload;
    END IF;
  END IF;

  INSERT INTO public.staff_schedules
    (organization_id, upload_id, user_id, employee_name, shift_date, start_time, end_time,
     roles, is_opener, is_closer, is_training, room_assignment)
  VALUES
    (v_org, v_upload, p_user_id, btrim(p_employee_name), p_shift_date, p_start_time, p_end_time,
     COALESCE(p_roles, '{}'), COALESCE(p_is_opener, false), COALESCE(p_is_closer, false),
     COALESCE(p_is_training, false), p_room_assignment)
  RETURNING id INTO v_shift;

  UPDATE public.schedule_uploads su
     SET parsed_shifts_count = (SELECT count(*) FROM public.staff_schedules s WHERE s.upload_id = v_upload),
         updated_at = now()
   WHERE su.id = v_upload;

  RETURN v_shift;
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_schedule_upload_reviewed(p_actor_id uuid, p_upload_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can review schedule uploads';
  END IF;
  UPDATE public.schedule_uploads su
     SET reviewed_at = COALESCE(su.reviewed_at, now()), updated_at = now()
   WHERE su.id = p_upload_id AND su.organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload not found'; END IF;
  RETURN TRUE;
END; $function$;
GRANT EXECUTE ON FUNCTION public.mark_schedule_upload_reviewed(uuid, uuid) TO anon, authenticated;

-- ───────────────────────────── 7. time off ─────────────────────────────
CREATE OR REPLACE FUNCTION public.request_time_off(p_actor_id uuid, p_start_date date, p_end_date date DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_active boolean; v_enabled boolean; v_end date; v_id uuid;
BEGIN
  SELECT u.organization_id, COALESCE(u.is_active, true) INTO v_org, v_active FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT v_active THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  SELECT o.time_off_requests_enabled INTO v_enabled FROM public.organizations o WHERE o.id = v_org;
  IF NOT COALESCE(v_enabled, true) THEN
    RAISE EXCEPTION 'Time off requests are turned off for your organization';
  END IF;
  IF p_start_date IS NULL OR p_start_date < current_date THEN
    RAISE EXCEPTION 'Time off must start today or later';
  END IF;
  v_end := COALESCE(p_end_date, p_start_date);
  IF v_end < p_start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.time_off_requests t
              WHERE t.user_id = p_actor_id AND t.status IN ('pending','approved')
                AND t.start_date <= v_end AND t.end_date >= p_start_date) THEN
    RAISE EXCEPTION 'You already have a request covering those dates';
  END IF;
  INSERT INTO public.time_off_requests (organization_id, user_id, start_date, end_date, reason)
  VALUES (v_org, p_actor_id, p_start_date, v_end, NULLIF(left(btrim(COALESCE(p_reason, '')), 500), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.request_time_off(uuid, date, date, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_time_off_request(p_actor_id uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.time_off_requests t SET status = 'cancelled'
   WHERE t.id = p_request_id AND t.user_id = p_actor_id AND t.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' = 'time_off_requested'
     AND n.data->>'requestId' = p_request_id::text;
  RETURN TRUE;
END; $function$;
GRANT EXECUTE ON FUNCTION public.cancel_time_off_request(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_time_off_requests(p_actor_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, start_date date, end_date date, reason text, status text, decided_at timestamptz, decision_reason text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT t.id, t.start_date, t.end_date, t.reason, t.status, t.decided_at, t.decision_reason, t.created_at
    FROM public.time_off_requests t
   WHERE t.user_id = p_actor_id
   ORDER BY t.created_at DESC
   LIMIT COALESCE(p_limit, 20);
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_time_off_requests(uuid, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.decide_time_off_request(p_actor_id uuid, p_request_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS TABLE(user_id uuid, user_name text, start_date date, end_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_req public.time_off_requests;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can decide requests';
  END IF;
  SELECT * INTO v_req FROM public.time_off_requests t WHERE t.id = p_request_id AND t.organization_id = v_org FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
  IF v_req.user_id = p_actor_id THEN RAISE EXCEPTION 'You can''t decide your own request'; END IF;
  UPDATE public.time_off_requests t
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         decided_by = p_actor_id, decided_at = now(),
         decision_reason = NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '')
   WHERE t.id = p_request_id;
  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' = 'time_off_requested'
     AND n.data->>'requestId' = p_request_id::text;
  RETURN QUERY
    SELECT u.id, u.name, v_req.start_date, v_req.end_date FROM public.users u WHERE u.id = v_req.user_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.decide_time_off_request(uuid, uuid, boolean, text) TO anon, authenticated;

-- ───────────────────────────── 8. release / pick-up ─────────────────────────────
CREATE OR REPLACE FUNCTION public.release_shift(p_actor_id uuid, p_shift_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_enabled boolean; v_shift public.staff_schedules; v_id uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id AND COALESCE(u.is_active, true);
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  SELECT o.shift_release_enabled INTO v_enabled FROM public.organizations o WHERE o.id = v_org;
  IF NOT COALESCE(v_enabled, true) THEN
    RAISE EXCEPTION 'Shift releases are turned off for your organization';
  END IF;
  SELECT * INTO v_shift FROM public.staff_schedules s WHERE s.id = p_shift_id AND s.organization_id = v_org;
  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.user_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'You can only release your own shifts'; END IF;
  IF v_shift.shift_date < current_date THEN RAISE EXCEPTION 'Past shifts can''t be released'; END IF;
  IF EXISTS (SELECT 1 FROM public.shift_releases r WHERE r.shift_id = p_shift_id AND r.status IN ('open','claimed')) THEN
    RAISE EXCEPTION 'This shift is already released';
  END IF;
  INSERT INTO public.shift_releases (organization_id, shift_id, released_by)
  VALUES (v_org, p_shift_id, p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.release_shift(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_shift_release(p_actor_id uuid, p_release_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.shift_releases r SET status = 'cancelled'
   WHERE r.id = p_release_id AND r.released_by = p_actor_id AND r.status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'This shift is no longer available'; END IF;
  RETURN TRUE;
END; $function$;
GRANT EXECUTE ON FUNCTION public.cancel_shift_release(uuid, uuid) TO anon, authenticated;

-- my releases: live rows + the last week of decided ones (state pills on My Schedule)
CREATE OR REPLACE FUNCTION public.get_my_shift_releases(p_actor_id uuid)
RETURNS TABLE(release_id uuid, shift_id uuid, status text, claimed_by uuid, claimed_by_name text, decided_at timestamptz, decision_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT r.id, r.shift_id, r.status, r.claimed_by, c.name, r.decided_at, r.decision_reason
    FROM public.shift_releases r
    LEFT JOIN public.users c ON c.id = r.claimed_by
   WHERE r.released_by = p_actor_id
     AND (r.status IN ('open','claimed')
          OR (r.status IN ('approved','denied') AND r.decided_at > now() - interval '7 days'))
   ORDER BY r.created_at DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_shift_releases(uuid) TO anon, authenticated;

-- coworkers' open releases I'm qualified for (+ the ones I've claimed, pinned first)
CREATE OR REPLACE FUNCTION public.get_available_shifts(p_actor_id uuid)
RETURNS TABLE(release_id uuid, shift_id uuid, status text, shift_date date, start_time time, end_time time, roles text[],
              is_opener boolean, is_closer boolean, is_training boolean, room_assignment text,
              released_by uuid, releaser_name text, releaser_avatar text, claimed_by_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_enabled boolean;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  SELECT o.shift_release_enabled INTO v_enabled FROM public.organizations o WHERE o.id = v_org;
  IF NOT COALESCE(v_enabled, true) THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, s.id, r.status, s.shift_date, s.start_time, s.end_time, s.roles,
           COALESCE(s.is_opener, false), COALESCE(s.is_closer, false), COALESCE(s.is_training, false), s.room_assignment,
           r.released_by, ru.name, ru.profile_picture_url, (r.claimed_by = p_actor_id)
      FROM public.shift_releases r
      JOIN public.staff_schedules s ON s.id = r.shift_id
      JOIN public.users ru ON ru.id = r.released_by
     WHERE r.organization_id = v_org
       AND r.released_by <> p_actor_id
       AND s.shift_date >= current_date
       AND (r.status = 'open' OR (r.status = 'claimed' AND r.claimed_by = p_actor_id))
       AND public._user_matches_roles(p_actor_id, s.roles)
     ORDER BY (r.claimed_by = p_actor_id) DESC, s.shift_date, s.start_time;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_available_shifts(uuid) TO anon, authenticated;

-- who to push when a shift is released: active title-matched coworkers (never the releaser).
-- send-push applies the shift_releases_enabled preference on top.
CREATE OR REPLACE FUNCTION public.get_shift_release_recipients(p_actor_id uuid, p_release_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_roles text[]; v_releaser uuid;
BEGIN
  SELECT r.organization_id, s.roles, r.released_by INTO v_org, v_roles, v_releaser
    FROM public.shift_releases r JOIN public.staff_schedules s ON s.id = r.shift_id
   WHERE r.id = p_release_id;
  IF v_org IS NULL OR v_releaser <> p_actor_id THEN RETURN; END IF;
  RETURN QUERY
    SELECT u.id FROM public.users u
     WHERE u.organization_id = v_org AND COALESCE(u.is_active, true) AND u.id <> v_releaser
       AND public._user_matches_roles(u.id, v_roles);
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_shift_release_recipients(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_shift(p_actor_id uuid, p_release_id uuid)
RETURNS TABLE(released_by uuid, releaser_name text, claimer_name text, shift_date date, start_time time, end_time time, roles text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_enabled boolean; v_rel public.shift_releases; v_shift public.staff_schedules;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id AND COALESCE(u.is_active, true);
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  SELECT o.shift_release_enabled INTO v_enabled FROM public.organizations o WHERE o.id = v_org;
  IF NOT COALESCE(v_enabled, true) THEN RAISE EXCEPTION 'Shift releases are turned off for your organization'; END IF;
  SELECT * INTO v_rel FROM public.shift_releases r WHERE r.id = p_release_id AND r.organization_id = v_org FOR UPDATE;
  IF v_rel.id IS NULL THEN RAISE EXCEPTION 'Release not found'; END IF;
  IF v_rel.status <> 'open' THEN RAISE EXCEPTION 'This shift is no longer available'; END IF;
  IF v_rel.released_by = p_actor_id THEN RAISE EXCEPTION 'You can''t pick up your own shift'; END IF;
  SELECT * INTO v_shift FROM public.staff_schedules s WHERE s.id = v_rel.shift_id;
  IF v_shift.id IS NULL OR v_shift.shift_date < current_date THEN RAISE EXCEPTION 'This shift is no longer available'; END IF;
  IF NOT public._user_matches_roles(p_actor_id, v_shift.roles) THEN
    RAISE EXCEPTION 'This shift needs a job title you don''t have';
  END IF;
  UPDATE public.shift_releases r SET status = 'claimed', claimed_by = p_actor_id, claimed_at = now() WHERE r.id = p_release_id;
  RETURN QUERY
    SELECT v_rel.released_by, ru.name, cu.name, v_shift.shift_date, v_shift.start_time, v_shift.end_time, v_shift.roles
      FROM public.users ru, public.users cu WHERE ru.id = v_rel.released_by AND cu.id = p_actor_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.claim_shift(uuid, uuid) TO anon, authenticated;

-- approve moves the shift to the claimer; deny re-opens it for everyone else
CREATE OR REPLACE FUNCTION public.decide_shift_pickup(p_actor_id uuid, p_release_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS TABLE(released_by uuid, claimed_by uuid, releaser_name text, claimer_name text, shift_date date, start_time time, end_time time, roles text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_rel public.shift_releases; v_shift public.staff_schedules; v_claimer_name text;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can decide requests';
  END IF;
  SELECT * INTO v_rel FROM public.shift_releases r WHERE r.id = p_release_id AND r.organization_id = v_org FOR UPDATE;
  IF v_rel.id IS NULL THEN RAISE EXCEPTION 'Release not found'; END IF;
  IF v_rel.status <> 'claimed' THEN RAISE EXCEPTION 'This pick-up is no longer pending'; END IF;
  IF p_actor_id IN (v_rel.released_by, v_rel.claimed_by) THEN
    RAISE EXCEPTION 'You can''t decide a pick-up you''re part of';
  END IF;
  SELECT * INTO v_shift FROM public.staff_schedules s WHERE s.id = v_rel.shift_id;
  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
  SELECT u.name INTO v_claimer_name FROM public.users u WHERE u.id = v_rel.claimed_by;

  UPDATE public.shift_releases r
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         decided_by = p_actor_id, decided_at = now(),
         decision_reason = NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '')
   WHERE r.id = p_release_id;

  IF p_approve THEN
    UPDATE public.staff_schedules s
       SET user_id = v_rel.claimed_by, employee_name = COALESCE(v_claimer_name, s.employee_name)
     WHERE s.id = v_rel.shift_id;
  ELSE
    -- the shift goes back up for grabs (the live-release unique index allows it now)
    INSERT INTO public.shift_releases (organization_id, shift_id, released_by)
    VALUES (v_org, v_rel.shift_id, v_rel.released_by);
  END IF;

  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' = 'shift_pickup_requested'
     AND n.data->>'requestId' = p_release_id::text;

  RETURN QUERY
    SELECT v_rel.released_by, v_rel.claimed_by, ru.name, v_claimer_name,
           v_shift.shift_date, v_shift.start_time, v_shift.end_time, v_shift.roles
      FROM public.users ru WHERE ru.id = v_rel.released_by;
END; $function$;
GRANT EXECUTE ON FUNCTION public.decide_shift_pickup(uuid, uuid, boolean, text) TO anon, authenticated;

-- ───────────────────────────── 9. approvals (O/M) ─────────────────────────────
-- Unified pending list. conflicts = the shifts the person already holds that collide:
-- time off → the requester's shifts inside the range; pick-up → the claimer's shifts on
-- that date. is_own → the actor is a party (decide buttons render disabled; server refuses).
CREATE OR REPLACE FUNCTION public.get_schedule_approvals(p_actor_id uuid)
RETURNS TABLE(kind text, id uuid, created_at timestamptz,
              requester_id uuid, requester_name text, requester_avatar text, requester_titles text[],
              start_date date, end_date date, reason text,
              shift_id uuid, shift_date date, start_time time, end_time time, roles text[],
              releaser_id uuid, releaser_name text, claimer_id uuid, claimer_name text, claimer_avatar text,
              conflicts jsonb, is_own boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view schedule approvals';
  END IF;
  PERFORM public._sweep_schedule_requests(v_org);
  RETURN QUERY
    SELECT 'time_off'::text, t.id, t.created_at,
           t.user_id, u.name, u.profile_picture_url, u.job_titles,
           t.start_date, t.end_date, t.reason,
           NULL::uuid, NULL::date, NULL::time, NULL::time, NULL::text[],
           NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('date', s.shift_date, 'start', s.start_time, 'end', s.end_time, 'roles', s.roles) ORDER BY s.shift_date, s.start_time)
                       FROM public.staff_schedules s
                      WHERE s.user_id = t.user_id AND s.shift_date BETWEEN t.start_date AND t.end_date), '[]'::jsonb),
           (t.user_id = p_actor_id)
      FROM public.time_off_requests t JOIN public.users u ON u.id = t.user_id
     WHERE t.organization_id = v_org AND t.status = 'pending'
    UNION ALL
    SELECT 'pickup'::text, r.id, COALESCE(r.claimed_at, r.created_at),
           r.claimed_by, cu.name, cu.profile_picture_url, cu.job_titles,
           NULL::date, NULL::date, NULL::text,
           s.id, s.shift_date, s.start_time, s.end_time, s.roles,
           r.released_by, ru.name, r.claimed_by, cu.name, cu.profile_picture_url,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('date', x.shift_date, 'start', x.start_time, 'end', x.end_time, 'roles', x.roles) ORDER BY x.start_time)
                       FROM public.staff_schedules x
                      WHERE x.user_id = r.claimed_by AND x.shift_date = s.shift_date), '[]'::jsonb),
           (p_actor_id IN (r.released_by, r.claimed_by))
      FROM public.shift_releases r
      JOIN public.staff_schedules s ON s.id = r.shift_id
      JOIN public.users ru ON ru.id = r.released_by
      JOIN public.users cu ON cu.id = r.claimed_by
     WHERE r.organization_id = v_org AND r.status = 'claimed'
     ORDER BY 3 DESC;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_schedule_approvals(uuid) TO anon, authenticated;

-- decided rows, newest first, 10 at a time, never more than the last 50; 30-day sweep on read
CREATE OR REPLACE FUNCTION public.get_schedule_approval_history(p_actor_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
RETURNS TABLE(kind text, id uuid, status text, decided_at timestamptz, decided_by_name text, decision_reason text,
              requester_id uuid, requester_name text, requester_avatar text,
              start_date date, end_date date, reason text,
              shift_date date, start_time time, end_time time, roles text[],
              releaser_name text, claimer_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_lim int; v_off int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view schedule approvals';
  END IF;
  PERFORM public._sweep_schedule_requests(v_org);
  v_off := GREATEST(COALESCE(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(COALESCE(p_limit, 10), 1), GREATEST(50 - v_off, 0));
  RETURN QUERY
    SELECT * FROM (
      SELECT 'time_off'::text AS kind, t.id, t.status, t.decided_at, d.name, t.decision_reason,
             t.user_id, u.name, u.profile_picture_url,
             t.start_date, t.end_date, t.reason,
             NULL::date, NULL::time, NULL::time, NULL::text[],
             NULL::text, NULL::text
        FROM public.time_off_requests t
        JOIN public.users u ON u.id = t.user_id
        LEFT JOIN public.users d ON d.id = t.decided_by
       WHERE t.organization_id = v_org AND t.status IN ('approved','denied')
      UNION ALL
      SELECT 'pickup'::text, r.id, r.status, r.decided_at, d.name, r.decision_reason,
             r.claimed_by, cu.name, cu.profile_picture_url,
             NULL::date, NULL::date, NULL::text,
             s.shift_date, s.start_time, s.end_time, s.roles,
             ru.name, cu.name
        FROM public.shift_releases r
        LEFT JOIN public.staff_schedules s ON s.id = r.shift_id
        JOIN public.users ru ON ru.id = r.released_by
        LEFT JOIN public.users cu ON cu.id = r.claimed_by
        LEFT JOIN public.users d ON d.id = r.decided_by
       WHERE r.organization_id = v_org AND r.status IN ('approved','denied')
    ) h
    ORDER BY h.decided_at DESC NULLS LAST
    OFFSET v_off LIMIT v_lim;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_schedule_approval_history(uuid, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_pending_schedule_approval_count(p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN RETURN 0; END IF;
  SELECT (SELECT count(*) FROM public.time_off_requests t WHERE t.organization_id = v_org AND t.status = 'pending' AND t.end_date >= current_date)
       + (SELECT count(*) FROM public.shift_releases r JOIN public.staff_schedules s ON s.id = r.shift_id
           WHERE r.organization_id = v_org AND r.status = 'claimed' AND s.shift_date >= current_date)
    INTO v_n;
  RETURN COALESCE(v_n, 0)::integer;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_pending_schedule_approval_count(uuid) TO anon, authenticated;

-- ───────────────────────────── 10. the employee's decision blurb ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_schedule_decisions(p_actor_id uuid)
RETURNS TABLE(kind text, id uuid, status text, my_role text, decided_at timestamptz, decision_reason text,
              start_date date, end_date date, shift_date date, start_time time, end_time time, roles text[], other_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT 'time_off'::text, t.id, t.status, 'requester'::text, t.decided_at, t.decision_reason,
         t.start_date, t.end_date, NULL::date, NULL::time, NULL::time, NULL::text[], NULL::text
    FROM public.time_off_requests t
   WHERE t.user_id = p_actor_id AND t.status IN ('approved','denied') AND t.seen_at IS NULL
  UNION ALL
  SELECT 'pickup'::text, r.id, r.status,
         CASE WHEN r.released_by = p_actor_id THEN 'releaser' ELSE 'claimer' END,
         r.decided_at, r.decision_reason,
         NULL::date, NULL::date, s.shift_date, s.start_time, s.end_time, s.roles,
         CASE WHEN r.released_by = p_actor_id THEN cu.name ELSE ru.name END
    FROM public.shift_releases r
    LEFT JOIN public.staff_schedules s ON s.id = r.shift_id
    LEFT JOIN public.users ru ON ru.id = r.released_by
    LEFT JOIN public.users cu ON cu.id = r.claimed_by
   WHERE r.status IN ('approved','denied')
     AND ((r.released_by = p_actor_id AND r.releaser_seen_at IS NULL)
       OR (r.claimed_by = p_actor_id AND r.claimer_seen_at IS NULL))
  ORDER BY 5 DESC NULLS LAST;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_schedule_decisions(uuid) TO anon, authenticated;

-- seeing ANY of blurb / shade / tab clears all of them: seen stamps + my decision shade rows
CREATE OR REPLACE FUNCTION public.ack_schedule_decisions(p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_n int := 0; v_k int;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.time_off_requests t SET seen_at = now()
   WHERE t.user_id = p_actor_id AND t.status IN ('approved','denied') AND t.seen_at IS NULL;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  UPDATE public.shift_releases r SET releaser_seen_at = now()
   WHERE r.released_by = p_actor_id AND r.status IN ('approved','denied') AND r.releaser_seen_at IS NULL;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  UPDATE public.shift_releases r SET claimer_seen_at = now()
   WHERE r.claimed_by = p_actor_id AND r.status IN ('approved','denied') AND r.claimer_seen_at IS NULL;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' IN ('time_off_decision','shift_pickup_decision')
     AND n.data->>'targetUserId' = p_actor_id::text;
  RETURN v_n;
END; $function$;
GRANT EXECUTE ON FUNCTION public.ack_schedule_decisions(uuid) TO anon, authenticated;

-- ───────────────────────────── 11. notifications plumbing ─────────────────────────────
-- Shade visibility: the two request types are manager-facing, the two decision types are
-- per-user (targetUserId). Without these WHENs the ELSE true branch would show them org-wide.
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_actor_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, title text, body text, created_at timestamp with time zone, data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_titles text[];
BEGIN
  SELECT u.role, u.organization_id,
         COALESCE(u.job_titles,
                  CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title]
                       ELSE ARRAY[]::text[] END)
    INTO v_role, v_org, v_titles
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.created_at, n.data
      FROM public.custom_notifications n
     WHERE n.organization_id = v_org
       AND COALESCE(n.data->>'notificationType','')
           NOT IN ('announcement','special_feature','event','weekly_special')
       AND (CASE COALESCE(n.data->>'notificationType','')
              WHEN 'redemption_requested'   THEN v_role IN ('manager','owner')
              WHEN 'redemption_decision'    THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'leaderboard_pass'       THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'retake_granted'         THEN v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text
              WHEN 'time_off_requested'     THEN v_role IN ('manager','owner')
              WHEN 'shift_pickup_requested' THEN v_role IN ('manager','owner')
              WHEN 'time_off_decision'      THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'shift_pickup_decision'  THEN n.data->>'targetUserId' = p_actor_id::text
              ELSE true
            END)
       -- Job-title-targeted rows are only for holders of a targeted title.
       -- CASE (not OR) so the array-length guard can never be evaluated
       -- against a non-array value.
       AND (CASE
              WHEN jsonb_typeof(n.data->'job_titles') IS DISTINCT FROM 'array' THEN true
              WHEN jsonb_array_length(n.data->'job_titles') = 0 THEN true
              ELSE EXISTS (
                     SELECT 1 FROM jsonb_array_elements_text(n.data->'job_titles') jt
                      WHERE jt.value = ANY(v_titles)
                   )
            END)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT COALESCE(p_limit, 100);
END;
$function$;

-- employees may log their OWN request rows to the managers' shade (the redemption carve-out, widened)
CREATE OR REPLACE FUNCTION public.create_notification(p_actor_id uuid, p_title text, p_body text, p_data jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF COALESCE(btrim(p_title),'') = '' OR COALESCE(btrim(p_body),'') = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;
  IF v_role NOT IN ('manager','owner')
     AND NOT (COALESCE(p_data->>'notificationType','') IN ('redemption_requested','time_off_requested','shift_pickup_requested')
              AND p_data->>'requesterId' = p_actor_id::text) THEN
    RAISE EXCEPTION 'Only managers or owners can send notifications';
  END IF;
  INSERT INTO public.custom_notifications (title, body, sent_by, organization_id, data)
  VALUES (p_title, p_body, p_actor_id, v_org, p_data)
  RETURNING custom_notifications.id INTO v_id;
  RETURN v_id;
END; $function$;

-- APNs badge = BadgeSyncer's sum: + pending schedule approvals (managers) + unseen decisions (everyone)
CREATE OR REPLACE FUNCTION public.get_user_badge_totals(p_user_ids uuid[], p_organization_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, badge_total integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  WITH target_users AS (
    SELECT u.id, u.role, u.organization_id AS org,
           COALESCE(u.job_titles, CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END) AS job_titles
      FROM users u WHERE u.id = ANY(p_user_ids)
  ),
  unread_msgs AS (
    SELECT mr.recipient_id AS uid, COUNT(*)::int AS cnt
      FROM message_recipients mr
     WHERE mr.recipient_id = ANY(p_user_ids) AND mr.is_read = FALSE AND mr.is_deleted = FALSE
     GROUP BY mr.recipient_id
  ),
  active_quizzes AS (
    SELECT e.id, e.exam_type FROM exams e
     WHERE e.status = 'active' AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
  ),
  user_eligible AS (
    SELECT tu.id AS uid, aq.id AS exam_id
      FROM target_users tu CROSS JOIN active_quizzes aq
     WHERE tu.role NOT IN ('manager','owner')
       AND ((aq.exam_type = 'server' AND tu.job_titles && ARRAY['Server','Lead Server','Busser','Runner'])
         OR (aq.exam_type = 'bartender' AND tu.job_titles && ARRAY['Bartender'])
         OR (aq.exam_type = 'host' AND tu.job_titles && ARRAY['Host']))
  ),
  completed AS (
    SELECT ue.uid, ue.exam_id FROM user_eligible ue
      JOIN exam_results er ON er.exam_id = ue.exam_id AND er.user_id = ue.uid
     WHERE er.correct_count IS NOT NULL
  ),
  unread_quizzes AS (
    SELECT ue.uid, COUNT(*)::int AS cnt
      FROM user_eligible ue
      LEFT JOIN completed c ON c.uid = ue.uid AND c.exam_id = ue.exam_id
     WHERE c.exam_id IS NULL GROUP BY ue.uid
  ),
  sched_mgr AS (
    SELECT tu.id AS uid,
           ((SELECT count(*) FROM time_off_requests t WHERE t.organization_id = tu.org AND t.status = 'pending' AND t.end_date >= current_date)
          + (SELECT count(*) FROM shift_releases r JOIN staff_schedules s ON s.id = r.shift_id
              WHERE r.organization_id = tu.org AND r.status = 'claimed' AND s.shift_date >= current_date))::int AS cnt
      FROM target_users tu WHERE tu.role IN ('manager','owner')
  ),
  sched_dec AS (
    SELECT tu.id AS uid,
           ((SELECT count(*) FROM time_off_requests t WHERE t.user_id = tu.id AND t.status IN ('approved','denied') AND t.seen_at IS NULL)
          + (SELECT count(*) FROM shift_releases r WHERE r.status IN ('approved','denied')
              AND ((r.released_by = tu.id AND r.releaser_seen_at IS NULL) OR (r.claimed_by = tu.id AND r.claimer_seen_at IS NULL))))::int AS cnt
      FROM target_users tu
  )
  SELECT tu.id AS user_id,
         (COALESCE(um.cnt, 0) + COALESCE(uq.cnt, 0) + COALESCE(sm.cnt, 0) + COALESCE(sd.cnt, 0))::int AS badge_total
    FROM target_users tu
    LEFT JOIN unread_msgs um ON um.uid = tu.id
    LEFT JOIN unread_quizzes uq ON uq.uid = tu.id
    LEFT JOIN sched_mgr sm ON sm.uid = tu.id
    LEFT JOIN sched_dec sd ON sd.uid = tu.id;
END; $function$;

-- the Shift releases preference (Profile → Notifications)
DROP FUNCTION IF EXISTS public.get_my_notification_preferences(uuid);
CREATE FUNCTION public.get_my_notification_preferences(p_actor_id uuid)
RETURNS TABLE(id uuid, user_id uuid, messages_enabled boolean, rewards_enabled boolean, announcements_enabled boolean,
              events_enabled boolean, special_features_enabled boolean, custom_notifications_enabled boolean,
              quiz_notifications_enabled boolean, game_hub_enabled boolean, created_at timestamptz, updated_at timestamptz,
              organization_id uuid, shift_releases_enabled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT np.id, np.user_id, np.messages_enabled, np.rewards_enabled,
           np.announcements_enabled, np.events_enabled, np.special_features_enabled,
           np.custom_notifications_enabled, np.quiz_notifications_enabled,
           np.game_hub_enabled, np.created_at, np.updated_at, np.organization_id, np.shift_releases_enabled
      FROM public.notification_preferences np
     WHERE np.user_id = p_actor_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.upsert_notification_preferences(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, uuid);
CREATE FUNCTION public.upsert_notification_preferences(
  p_user_id uuid, p_messages_enabled boolean DEFAULT NULL, p_rewards_enabled boolean DEFAULT NULL,
  p_announcements_enabled boolean DEFAULT NULL, p_events_enabled boolean DEFAULT NULL, p_special_features_enabled boolean DEFAULT NULL,
  p_custom_notifications_enabled boolean DEFAULT NULL, p_game_hub_enabled boolean DEFAULT NULL, p_organization_id uuid DEFAULT NULL,
  p_shift_releases_enabled boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid user'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  INSERT INTO notification_preferences (user_id, messages_enabled, rewards_enabled, announcements_enabled, events_enabled, special_features_enabled, custom_notifications_enabled, game_hub_enabled, organization_id, shift_releases_enabled)
  VALUES (p_user_id, COALESCE(p_messages_enabled, TRUE), COALESCE(p_rewards_enabled, TRUE), COALESCE(p_announcements_enabled, TRUE), COALESCE(p_events_enabled, TRUE), COALESCE(p_special_features_enabled, TRUE), COALESCE(p_custom_notifications_enabled, TRUE), COALESCE(p_game_hub_enabled, TRUE), v_org, COALESCE(p_shift_releases_enabled, TRUE))
  ON CONFLICT (user_id) DO UPDATE SET
    messages_enabled = COALESCE(p_messages_enabled, notification_preferences.messages_enabled),
    rewards_enabled = COALESCE(p_rewards_enabled, notification_preferences.rewards_enabled),
    announcements_enabled = COALESCE(p_announcements_enabled, notification_preferences.announcements_enabled),
    events_enabled = COALESCE(p_events_enabled, notification_preferences.events_enabled),
    special_features_enabled = COALESCE(p_special_features_enabled, notification_preferences.special_features_enabled),
    custom_notifications_enabled = COALESCE(p_custom_notifications_enabled, notification_preferences.custom_notifications_enabled),
    game_hub_enabled = COALESCE(p_game_hub_enabled, notification_preferences.game_hub_enabled),
    shift_releases_enabled = COALESCE(p_shift_releases_enabled, notification_preferences.shift_releases_enabled),
    organization_id = EXCLUDED.organization_id, updated_at = NOW();
END; $function$;
GRANT EXECUTE ON FUNCTION public.upsert_notification_preferences(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, uuid, boolean) TO anon, authenticated;
