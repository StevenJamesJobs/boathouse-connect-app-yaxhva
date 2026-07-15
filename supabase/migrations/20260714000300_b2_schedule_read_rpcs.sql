-- Batch B2 (staff_schedules + schedule_uploads) — additive READ RPCs so the client stops
-- reading either table directly (1,484 of 1,495 shift rows are real Boathouse names × shift
-- times; both tables are TO public USING(true) until the gated teardown). Org is ALWAYS
-- derived from the actor. SECURITY DEFINER, search_path pinned, EXECUTE to anon+authenticated.
--   • get_my_shifts             — self only (my-schedule pager, upcoming card, profiles)
--   • get_user_next_shift       — member, same-org (mini-profile coworker peek)
--   • get_org_roster            — member + staff_can_view_roster gate (managers always)
--   • get_org_schedule          — manager/owner (manual schedule editor)
--   • get_upload_shifts         — manager/owner, upload must belong to actor's org
--   • get_org_uploads           — manager/owner (upload list / poll / week count)
--   • get_latest_schedule_upload_at — member ("last updated" stamp on my-schedule)

CREATE OR REPLACE FUNCTION public.get_my_shifts(
  p_actor_id uuid, p_start_date date, p_end_date date DEFAULT NULL, p_limit integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, shift_date date, start_time time, end_time time, roles text[],
  is_closer boolean, is_opener boolean, is_training boolean, room_assignment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN QUERY
    SELECT s.id, s.shift_date, s.start_time, s.end_time, s.roles,
           s.is_closer, s.is_opener, s.is_training, s.room_assignment
      FROM public.staff_schedules s
     WHERE s.user_id = p_actor_id
       AND s.shift_date >= p_start_date
       AND (p_end_date IS NULL OR s.shift_date <= p_end_date)
     ORDER BY s.shift_date, s.start_time
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_next_shift(p_actor_id uuid, p_user_id uuid)
RETURNS TABLE(shift_date date, start_time time, end_time time, roles text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT u.organization_id INTO v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  SELECT u.organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
  IF v_actor_org IS NULL OR v_target_org IS DISTINCT FROM v_actor_org THEN
    RETURN;  -- unknown actor or cross-org target → nothing
  END IF;
  RETURN QUERY
    SELECT s.shift_date, s.start_time, s.end_time, s.roles
      FROM public.staff_schedules s
     WHERE s.user_id = p_user_id
       AND s.shift_date >= CURRENT_DATE
     ORDER BY s.shift_date, s.start_time
     LIMIT 1;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_roster(p_actor_id uuid, p_date date)
RETURNS TABLE(
  id uuid, upload_id uuid, employee_name text, user_id uuid, shift_date date,
  start_time time, end_time time, roles text[], is_closer boolean, is_opener boolean,
  is_training boolean, room_assignment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_staff_ok boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF v_role NOT IN ('manager','owner') THEN
    SELECT o.staff_can_view_roster INTO v_staff_ok FROM public.organizations o WHERE o.id = v_org;
    IF NOT COALESCE(v_staff_ok, true) THEN
      RAISE EXCEPTION 'Roster viewing is disabled for staff';
    END IF;
  END IF;
  RETURN QUERY
    SELECT s.id, s.upload_id, s.employee_name, s.user_id, s.shift_date, s.start_time,
           s.end_time, s.roles, s.is_closer, s.is_opener, s.is_training, s.room_assignment
      FROM public.staff_schedules s
     WHERE s.organization_id = v_org
       AND s.shift_date = p_date
     ORDER BY s.start_time;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_schedule(p_actor_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE(
  id uuid, upload_id uuid, employee_name text, user_id uuid, shift_date date,
  start_time time, end_time time, roles text[], is_closer boolean, is_opener boolean,
  is_training boolean, room_assignment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view the full schedule';
  END IF;
  RETURN QUERY
    SELECT s.id, s.upload_id, s.employee_name, s.user_id, s.shift_date, s.start_time,
           s.end_time, s.roles, s.is_closer, s.is_opener, s.is_training, s.room_assignment
      FROM public.staff_schedules s
     WHERE s.organization_id = v_org
       AND s.shift_date >= p_start_date
       AND s.shift_date <= p_end_date
     ORDER BY s.shift_date, s.start_time;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_upload_shifts(p_actor_id uuid, p_upload_id uuid)
RETURNS TABLE(
  id uuid, upload_id uuid, employee_name text, user_id uuid, shift_date date,
  start_time time, end_time time, roles text[], is_closer boolean, is_opener boolean,
  is_training boolean, room_assignment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can review uploads';
  END IF;
  RETURN QUERY
    SELECT s.id, s.upload_id, s.employee_name, s.user_id, s.shift_date, s.start_time,
           s.end_time, s.roles, s.is_closer, s.is_opener, s.is_training, s.room_assignment
      FROM public.staff_schedules s
      JOIN public.schedule_uploads su ON su.id = s.upload_id
     WHERE s.upload_id = p_upload_id
       AND su.organization_id = v_org   -- cross-org upload → empty, no info leak
     ORDER BY s.employee_name, s.shift_date, s.start_time;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_org_uploads(
  p_actor_id uuid, p_upload_id uuid DEFAULT NULL, p_week_start date DEFAULT NULL,
  p_limit integer DEFAULT NULL)
RETURNS TABLE(
  id uuid, uploaded_by uuid, file_url text, file_name text, week_start date, week_end date,
  status text, parsed_shifts_count integer, unmatched_employees jsonb, error_message text,
  created_at timestamptz)
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
           su.status, su.parsed_shifts_count, su.unmatched_employees, su.error_message,
           su.created_at
      FROM public.schedule_uploads su
     WHERE su.organization_id = v_org
       AND (p_upload_id IS NULL OR su.id = p_upload_id)
       AND (p_week_start IS NULL OR su.week_start = p_week_start)
     ORDER BY su.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_latest_schedule_upload_at(p_actor_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_at timestamptz;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN NULL; END IF;
  SELECT max(su.created_at) INTO v_at FROM public.schedule_uploads su WHERE su.organization_id = v_org;
  RETURN v_at;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_my_shifts(uuid, date, date, integer)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_next_shift(uuid, uuid)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_roster(uuid, date)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_schedule(uuid, date, date)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upload_shifts(uuid, uuid)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_uploads(uuid, uuid, date, integer)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_schedule_upload_at(uuid)               TO anon, authenticated;
