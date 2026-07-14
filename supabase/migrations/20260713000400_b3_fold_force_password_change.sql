-- Batch B3 — fold the two client-side force_password_change writes into the RPCs, so the client
-- no longer touches the users table directly for them. Behavior-preserving:
--   • create_user sets force_password_change = TRUE only for self-signup (no actor), matching the
--     old join.tsx write; manager-created users keep FALSE (unchanged).
--   • update_password clears force_password_change = FALSE only on the SELF-SERVICE branch,
--     matching the old change-password.tsx write; a manager reset leaves the flag untouched.

CREATE OR REPLACE FUNCTION public.create_user(
  p_username text, p_name text, p_email text, p_job_title text, p_phone_number text,
  p_role text, p_password text DEFAULT 'changeme', p_organization_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE new_user_id uuid; v_actor_role text; v_actor_org uuid; v_role text := p_role;
BEGIN
  IF p_actor_id IS NOT NULL THEN
    SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
      RAISE EXCEPTION 'Only managers or owners can create users';
    END IF;
    IF v_actor_org IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'Cannot create a user in another organization';
    END IF;
    IF v_role IN ('manager','owner') AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only an owner can create a manager or owner';
    END IF;
  ELSE
    v_role := 'employee';
  END IF;

  INSERT INTO public.users
    (username, name, email, job_title, phone_number, role, password_hash, is_active,
     organization_id, force_password_change)
  VALUES
    (p_username, p_name, p_email, p_job_title, p_phone_number, v_role,
     crypt(p_password, gen_salt('bf')), true, p_organization_id, (p_actor_id IS NULL))
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_password(
  user_id uuid, new_password text, p_actor_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL, p_current_password text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_target_role text; v_stored_hash text;
BEGIN
  -- SELF-SERVICE: prove knowledge of the current password, then clear the forced-change flag.
  IF p_actor_id IS NULL OR p_actor_id = user_id THEN
    SELECT password_hash INTO v_stored_hash FROM public.users WHERE id = user_id;
    IF v_stored_hash IS NULL
       OR p_current_password IS NULL
       OR v_stored_hash <> crypt(p_current_password, v_stored_hash) THEN
      RAISE EXCEPTION 'Current password is incorrect';
    END IF;
    UPDATE public.users
       SET password_hash = crypt(new_password, gen_salt('bf')),
           force_password_change = false,
           updated_at = now()
     WHERE id = user_id;
    RETURN;
  END IF;

  -- MANAGER/OWNER reset of ANOTHER user's password (flag untouched).
  SELECT role INTO v_actor_role FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reset another user''s password';
  END IF;
  SELECT role INTO v_target_role FROM public.users WHERE id = user_id;
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can reset an owner''s password';
  END IF;
  UPDATE public.users
     SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = now()
   WHERE id = user_id;
END; $function$;
