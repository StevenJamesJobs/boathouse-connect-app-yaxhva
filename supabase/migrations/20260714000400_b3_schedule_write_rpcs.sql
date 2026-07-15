-- Batch B3 (staff_schedules + schedule_uploads) — gated WRITE RPCs. All manager/owner-gated,
-- org ALWAYS derived from the actor; a client-supplied user or upload must belong to that org.
-- add_shift absorbs the old client-side resolveUploadIdForDate (find-or-create the "Manual
-- Entry" upload row for the shift's week) and every mutation keeps parsed_shifts_count /
-- unmatched_employees in sync server-side, replacing the client's best-effort follow-up
-- writes. delete_schedule_upload relies on the existing ON DELETE CASCADE fk to remove the
-- upload's shifts. Additive: nothing calls these yet; public policies untouched (teardown).

CREATE OR REPLACE FUNCTION public.add_shift(
  p_actor_id uuid, p_employee_name text, p_shift_date date, p_start_time time, p_end_time time,
  p_upload_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_roles text[] DEFAULT '{}',
  p_is_opener boolean DEFAULT false, p_is_closer boolean DEFAULT false,
  p_is_training boolean DEFAULT false, p_room_assignment text DEFAULT NULL)
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
    -- Old client behavior (resolveUploadIdForDate): latest completed upload whose week
    -- covers the date, else a placeholder "Manual Entry" upload for that (Sun–Sat) week.
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
        (organization_id, uploaded_by, file_url, file_name, week_start, week_end, status, parsed_shifts_count)
      VALUES (v_org, p_actor_id, '', 'Manual Entry', v_week_start, v_week_end, 'completed', 0)
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

CREATE OR REPLACE FUNCTION public.update_shift(
  p_actor_id uuid, p_shift_id uuid, p_user_id uuid DEFAULT NULL, p_employee_name text DEFAULT NULL,
  p_shift_date date DEFAULT NULL, p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
  p_roles text[] DEFAULT NULL, p_is_opener boolean DEFAULT NULL, p_is_closer boolean DEFAULT NULL,
  p_is_training boolean DEFAULT NULL, p_room_assignment text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_shift_org uuid; v_target_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can edit shifts';
  END IF;
  SELECT s.organization_id INTO v_shift_org FROM public.staff_schedules s WHERE s.id = p_shift_id;
  IF v_shift_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
  IF p_user_id IS NOT NULL THEN
    SELECT u.organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
    IF v_target_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Cannot assign a shift to a user in another organization';
    END IF;
  END IF;

  UPDATE public.staff_schedules s SET
    user_id         = COALESCE(p_user_id, s.user_id),
    employee_name   = COALESCE(NULLIF(btrim(COALESCE(p_employee_name, '')), ''), s.employee_name),
    shift_date      = COALESCE(p_shift_date, s.shift_date),
    start_time      = COALESCE(p_start_time, s.start_time),
    end_time        = COALESCE(p_end_time, s.end_time),
    roles           = COALESCE(p_roles, s.roles),
    is_opener       = COALESCE(p_is_opener, s.is_opener),
    is_closer       = COALESCE(p_is_closer, s.is_closer),
    is_training     = COALESCE(p_is_training, s.is_training),
    room_assignment = COALESCE(p_room_assignment, s.room_assignment)
  WHERE s.id = p_shift_id;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_shift(p_actor_id uuid, p_shift_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_shift_org uuid; v_upload uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can delete shifts';
  END IF;
  SELECT s.organization_id, s.upload_id INTO v_shift_org, v_upload
    FROM public.staff_schedules s WHERE s.id = p_shift_id;
  IF v_shift_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  DELETE FROM public.staff_schedules s WHERE s.id = p_shift_id;

  UPDATE public.schedule_uploads su
     SET parsed_shifts_count = (SELECT count(*) FROM public.staff_schedules s WHERE s.upload_id = v_upload),
         updated_at = now()
   WHERE su.id = v_upload;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.assign_upload_shifts(
  p_actor_id uuid, p_upload_id uuid, p_employee_name text, p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_upload_org uuid; v_target_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can assign schedule names';
  END IF;
  SELECT su.organization_id INTO v_upload_org FROM public.schedule_uploads su WHERE su.id = p_upload_id;
  IF v_upload_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;
  IF p_user_id IS NOT NULL THEN
    SELECT u.organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
    IF v_target_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Cannot assign shifts to a user in another organization';
    END IF;
  END IF;

  UPDATE public.staff_schedules s
     SET user_id = p_user_id
   WHERE s.upload_id = p_upload_id
     AND s.employee_name = p_employee_name;

  -- Recompute the unmatched list from reality (names on this upload with no linked user).
  UPDATE public.schedule_uploads su
     SET unmatched_employees = COALESCE(
           (SELECT jsonb_agg(DISTINCT s.employee_name)
              FROM public.staff_schedules s
             WHERE s.upload_id = p_upload_id AND s.user_id IS NULL),
           '[]'::jsonb),
         updated_at = now()
   WHERE su.id = p_upload_id;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_schedule_upload(
  p_actor_id uuid, p_file_url text, p_file_name text, p_week_start date, p_week_end date,
  p_status text DEFAULT 'processing')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can upload schedules';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending','processing','completed','failed') THEN
    RAISE EXCEPTION 'Invalid upload status';
  END IF;

  INSERT INTO public.schedule_uploads
    (organization_id, uploaded_by, file_url, file_name, week_start, week_end, status)
  VALUES
    (v_org, p_actor_id, COALESCE(p_file_url, ''), COALESCE(p_file_name, ''), p_week_start, p_week_end, p_status)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_schedule_upload(p_actor_id uuid, p_upload_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_upload_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can delete uploads';
  END IF;
  SELECT su.organization_id INTO v_upload_org FROM public.schedule_uploads su WHERE su.id = p_upload_id;
  IF v_upload_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;

  -- staff_schedules.upload_id has ON DELETE CASCADE: removing the upload removes its shifts.
  DELETE FROM public.schedule_uploads su WHERE su.id = p_upload_id;
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public.add_shift(uuid, text, date, time, time, uuid, uuid, text[], boolean, boolean, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_shift(uuid, uuid, uuid, text, date, time, time, text[], boolean, boolean, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shift(uuid, uuid)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_upload_shifts(uuid, uuid, text, uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_schedule_upload(uuid, text, text, date, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_schedule_upload(uuid, uuid)                TO anon, authenticated;
