-- S50 B5 teardown (2026-07-21): close create_user's anonymous self-signup path.
-- join_signup (join-code-gated) is the ONLY self-signup entry. Because
-- join_signup calls create_user internally with a NULL actor, the two
-- functions share a TRANSACTION-LOCAL GUC handshake: join_signup sets
-- app.join_signup='1' (set_config ... is_local=true) immediately before its
-- call; create_user's NULL-actor branch RAISEs unless that GUC is set. An
-- anonymous PostgREST caller cannot set GUCs, so the direct anon path is dead.
-- Manager/owner path (p_actor_id NOT NULL) unchanged.
-- ROLLBACK: recreate both functions from their pre-S50 definitions (captured
-- in session50_manifests/ + this file's git history).

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

  INSERT INTO public.users
    (username, name, email, job_title, phone_number, role, password_hash, is_active,
     organization_id, force_password_change)
  VALUES
    (p_username, p_name, p_email, p_job_title, p_phone_number, v_role,
     crypt(p_password, gen_salt('bf')), true, p_organization_id, (p_actor_id IS NULL))
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.join_signup(p_join_code text, p_username text, p_name text, p_email text DEFAULT ''::text)
 RETURNS TABLE(id uuid, username text, name text, email text, phone_number text, job_title text, job_titles text[], role text, organization_id uuid, profile_picture_url text, badge_title text, mcloones_bucks integer, quick_tools jsonb, force_password_change boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_org_id     uuid;
  v_allow      boolean;
  v_default_pw text;
  v_email      text;
  v_base       text;
  v_username   text;
  v_counter    int;
  v_attempt    int;
  v_new_id     uuid;
  v_constraint text;
  v_ip         text;
BEGIN
  v_ip := public._request_ip();
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ipj:' || v_ip);
  END IF;

  SELECT o.id, o.allow_self_signup, o.default_password
    INTO v_org_id, v_allow, v_default_pw
    FROM public.organizations o
   WHERE upper(o.join_code) = upper(btrim(p_join_code))
   LIMIT 1;
  IF v_org_id IS NULL THEN
    IF v_ip IS NOT NULL THEN
      PERFORM public._throttle_fail('ipj:' || v_ip, 20, interval '15 minutes', interval '15 minutes');
    END IF;
    RAISE EXCEPTION 'Invalid join code';
  END IF;
  IF NOT COALESCE(v_allow, false) THEN
    RAISE EXCEPTION 'Self-registration is disabled for this organization';
  END IF;
  IF COALESCE(v_default_pw, '') = '' THEN
    RAISE EXCEPTION 'This organization has no default password configured';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF length(btrim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Name is too long';
  END IF;
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email <> '' AND (length(v_email) > 254
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  IF v_email = '' AND EXISTS (SELECT 1 FROM public.users u WHERE u.email = '') THEN
    RAISE EXCEPTION 'Please enter an email address';
  END IF;

  v_base := left(lower(regexp_replace(COALESCE(p_username, ''), '[^a-zA-Z0-9]', '', 'g')), 32);
  IF v_base = '' THEN v_base := 'user'; END IF;

  -- S50: transaction-local handshake authorizing create_user's self-signup
  -- branch for exactly this transaction (see create_user).
  PERFORM set_config('app.join_signup', '1', true);

  FOR v_attempt IN 1..3 LOOP
    v_username := v_base;
    v_counter := 1;
    WHILE EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = v_username) LOOP
      v_counter := v_counter + 1;
      v_username := v_base || v_counter;
    END LOOP;

    BEGIN
      v_new_id := public.create_user(
        p_username        => v_username,
        p_name            => btrim(p_name),
        p_email           => v_email,
        p_job_title       => '',
        p_phone_number    => '',
        p_role            => 'employee',
        p_password        => v_default_pw,
        p_organization_id => v_org_id);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint := CONSTRAINT_NAME;
      IF v_constraint = 'users_email_key' THEN
        RAISE EXCEPTION 'That email address is already in use';
      END IF;
    END;
  END LOOP;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'Could not create the account, please try again';
  END IF;

  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = v_new_id;
END; $function$;
