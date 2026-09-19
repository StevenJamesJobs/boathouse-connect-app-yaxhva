-- s86 · Nobody keeps a password someone else chose (Steve, device round).
--
-- Before: force_password_change was set ONLY on the self-signup branch of create_user. A
-- manager-ADDED employee signed in with the org default password and was never asked to
-- replace it; a manager RESET wrote the new hash and also left the flag alone.
--
--  1. create_user      — every new account starts with force_password_change = true
--                        (manager-added AND self-signup). Same signature → CREATE OR REPLACE.
--  2. update_password  — the manager-reset branch now (a) sets force_password_change = true, so
--                        the user picks their own password at next sign-in, and (b) refuses a
--                        target in ANOTHER organization (the branch never compared orgs).
--                        The self-service branch is unchanged (it clears the flag).

CREATE OR REPLACE FUNCTION public.create_user(p_username text, p_name text, p_email text, p_job_title text, p_phone_number text, p_role text, p_password text DEFAULT 'changeme'::text, p_organization_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    -- S50: anonymous self-signup is CLOSED. Only join_signup (which validates
    -- the join code + allow_self_signup server-side) may take this branch.
    IF current_setting('app.join_signup', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Self-signup requires a join code';
    END IF;
    v_role := 'employee';
  END IF;

  -- s86: the password on a new account was always chosen by someone else (the org default,
  -- or whatever a manager typed) — the first sign-in must replace it.
  INSERT INTO public.users
    (username, name, email, job_title, phone_number, role, password_hash, is_active,
     organization_id, force_password_change)
  VALUES
    (p_username, p_name, p_email, p_job_title, p_phone_number, v_role,
     crypt(p_password, gen_salt('bf')), true, p_organization_id, true)
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_password(user_id uuid, new_password text, p_actor_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_current_password text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_role text; v_target_org uuid; v_stored_hash text;
BEGIN
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

  SELECT u.role, u.organization_id INTO v_actor_role, v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reset another user''s password';
  END IF;
  SELECT u.role, u.organization_id INTO v_target_role, v_target_org FROM public.users u WHERE u.id = user_id;
  -- s86: a reset never crosses restaurants (the org is derived from the actor's row).
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can reset an owner''s password';
  END IF;
  -- s86: a reset password is a TEMPORARY one — the user replaces it at their next sign-in.
  UPDATE public.users
     SET password_hash = crypt(new_password, gen_salt('bf')),
         force_password_change = true,
         updated_at = now()
   WHERE id = user_id;
END; $function$;
