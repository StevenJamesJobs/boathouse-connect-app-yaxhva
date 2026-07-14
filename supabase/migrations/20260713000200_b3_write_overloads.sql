-- Batch B3 — additive p_actor_id write overloads (gated). The old 3-arg versions are intentionally
-- kept until the T2 teardown so in-the-wild clients don't break; new clients call these gated
-- 4-arg versions. All SECURITY DEFINER, search_path pinned. Org is derived from the actor and the
-- target must be in the actor's org (kills the NULL-org bypass and cross-org writes).

CREATE OR REPLACE FUNCTION public.update_user_active_status(
  p_user_id uuid, p_is_active boolean, p_organization_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change active status';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;
  UPDATE public.users SET is_active = p_is_active, updated_at = NOW()
   WHERE id = p_user_id AND organization_id = v_actor_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_user_job_titles(
  p_user_id uuid, p_job_titles text[], p_organization_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change job titles';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;
  UPDATE public.users SET job_titles = p_job_titles, updated_at = NOW()
   WHERE id = p_user_id AND organization_id = v_actor_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_user_test_flag(
  p_user_id uuid, p_is_test boolean, p_organization_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can set the test flag';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;
  UPDATE public.users SET is_test_user = p_is_test WHERE id = p_user_id AND organization_id = v_actor_org;
END; $function$;

-- Self OR manager/owner-same-org (absorbs the manager-sets-employee-photo direct write).
CREATE OR REPLACE FUNCTION public.update_profile_picture(
  user_id uuid, picture_url text, p_organization_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  IF p_actor_id = user_id THEN
    UPDATE public.users SET profile_picture_url = picture_url WHERE id = user_id;
    RETURN;
  END IF;
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can set another user''s photo';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;
  UPDATE public.users SET profile_picture_url = picture_url WHERE id = user_id AND organization_id = v_actor_org;
END; $function$;

GRANT EXECUTE ON FUNCTION public.update_user_active_status(uuid, boolean, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_job_titles(uuid, text[], uuid, uuid)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_test_flag(uuid, boolean, uuid, uuid)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_picture(uuid, text, uuid, uuid)        TO anon, authenticated;
