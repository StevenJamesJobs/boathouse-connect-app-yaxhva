-- s86 · Onboarding & Auth wave (applied via the Supabase MCP; this is the repo copy).
--
--  1. organizations.tos_accepted_at / tos_version — the owner's clickwrap tick, recorded.
--  2. _joinable_job_titles(org)   — the org's active titles MINUS management titles; the only
--                                   list a self-signup joiner may pick from. EXECUTE-revoked helper.
--  3. join_prepare(code, base, email) — the join flow's quiet step-2 check: org name, the REAL
--                                   username (collision suffix resolved), email-in-use verdict,
--                                   and the positions list. Pre-auth, gated by a valid join code,
--                                   shares the 'ipj:' join throttle. Returns ZERO rows for a bad
--                                   code (a RAISE would roll the throttle write back).
--  4. join_signup                 — signature grows (p_phone, p_tagline, p_job_titles; all DEFAULTed,
--                                   so the live 4-arg callers keep resolving): email is now required,
--                                   one email per TEAM, picked titles validated against (2).
--  5. signup_owner_with_org       — gains p_tos_version (DEFAULTed) + the missing rate limit:
--                                   5 new restaurants per network per hour ('ipo:' key), counted on
--                                   the SUCCESS path so it commits with the org.
--
-- NOT in this file (applied a day later on Steve's word — it drops a constraint): swapping the global
-- users_email_key UNIQUE(email) for a per-team unique index. See 20260918121000_s86_email_per_team.sql.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_version text;

-- ── 2 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._joinable_job_titles(p_org uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(t.title ORDER BY t.display_order NULLS LAST, t.title), '{}'::text[])
    FROM public.organization_job_titles t
   WHERE t.organization_id = p_org
     AND t.is_active IS NOT FALSE
     AND btrim(COALESCE(t.title, '')) <> ''
     -- Management titles are granted by an owner, never self-selected (Steve, s86).
     AND t.title !~* '(manager|owner|director|\mgm\M|\mmgr\M)';
$function$;

REVOKE ALL ON FUNCTION public._joinable_job_titles(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_prepare(p_join_code text, p_username text, p_email text)
 RETURNS TABLE(org_name text, allow_self_signup boolean, username text, email_in_use boolean, job_titles text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_ip       text;
  v_org_id   uuid;
  v_org_name text;
  v_allow    boolean;
  v_email    text;
  v_base     text;
  v_username text;
  v_counter  int := 1;
  v_in_use   boolean := false;
BEGIN
  v_ip := public._request_ip();
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ipj:' || v_ip);
  END IF;

  SELECT o.id, o.name, COALESCE(o.allow_self_signup, false)
    INTO v_org_id, v_org_name, v_allow
    FROM public.organizations o
   WHERE upper(o.join_code) = upper(btrim(p_join_code))
   LIMIT 1;

  IF v_org_id IS NULL THEN
    IF v_ip IS NOT NULL THEN
      PERFORM public._throttle_fail('ipj:' || v_ip, 20, interval '15 minutes', interval '15 minutes');
    END IF;
    RETURN;
  END IF;

  v_base := left(lower(regexp_replace(COALESCE(p_username, ''), '[^a-zA-Z0-9]', '', 'g')), 32);
  IF v_base = '' THEN v_base := 'user'; END IF;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base || v_counter;
  END LOOP;

  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email <> '' THEN
    v_in_use :=
      EXISTS (SELECT 1 FROM public.users u
               WHERE u.organization_id = v_org_id AND lower(u.email) = v_email)
      -- While the legacy GLOBAL unique constraint is still in place, an email on ANY team
      -- would bounce at create time — report it here so nobody fills five steps for nothing.
      OR (EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conname = 'users_email_key' AND c.conrelid = 'public.users'::regclass)
          AND EXISTS (SELECT 1 FROM public.users u WHERE u.email = v_email));
  END IF;

  RETURN QUERY
    SELECT v_org_name, v_allow, v_username, v_in_use,
           CASE WHEN v_allow THEN public._joinable_job_titles(v_org_id) ELSE '{}'::text[] END;
END; $function$;

REVOKE ALL ON FUNCTION public.join_prepare(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_prepare(text, text, text) TO anon, authenticated, service_role;

-- ── 4 ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_signup(text, text, text, text);

CREATE FUNCTION public.join_signup(
  p_join_code  text,
  p_username   text,
  p_name       text,
  p_email      text   DEFAULT ''::text,
  p_phone      text   DEFAULT ''::text,
  p_tagline    text   DEFAULT NULL::text,
  p_job_titles text[] DEFAULT NULL::text[])
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
  v_phone      text;
  v_tagline    text;
  v_allowed    text[];
  v_titles     text[];
  v_wanted     int;
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
  IF v_email = '' THEN
    RAISE EXCEPTION 'Please enter an email address';
  END IF;
  IF length(v_email) > 254
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  -- One email per TEAM (someone can work at two restaurants with the same address).
  IF EXISTS (SELECT 1 FROM public.users u
              WHERE u.organization_id = v_org_id AND lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'This email is already in use on this team. If this is an error, speak to your manager right away!';
  END IF;

  v_phone := left(btrim(COALESCE(p_phone, '')), 32);
  v_tagline := NULLIF(btrim(COALESCE(p_tagline, '')), '');
  IF v_tagline IS NOT NULL AND char_length(v_tagline) > 60 THEN
    RAISE EXCEPTION 'Tagline must be 60 characters or fewer';
  END IF;

  -- Picked positions must come from THIS org's joinable list; stored in the org's own casing/order.
  IF p_job_titles IS NOT NULL AND COALESCE(array_length(p_job_titles, 1), 0) > 0 THEN
    v_allowed := public._joinable_job_titles(v_org_id);
    SELECT count(DISTINCT lower(btrim(pj))) INTO v_wanted
      FROM unnest(p_job_titles) AS pj
     WHERE btrim(COALESCE(pj, '')) <> '';
    SELECT array_agg(x.al ORDER BY x.ord) INTO v_titles
      FROM unnest(v_allowed) WITH ORDINALITY AS x(al, ord)
     WHERE lower(x.al) IN (SELECT lower(btrim(pj)) FROM unnest(p_job_titles) AS pj);
    IF COALESCE(array_length(v_titles, 1), 0) <> v_wanted THEN
      RAISE EXCEPTION 'One or more positions are not available';
    END IF;
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
        p_job_title       => COALESCE(v_titles[1], ''),
        p_phone_number    => v_phone,
        p_role            => 'employee',
        p_password        => v_default_pw,
        p_organization_id => v_org_id);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint := CONSTRAINT_NAME;
      IF v_constraint IN ('users_email_key', 'users_org_email_key') THEN
        RAISE EXCEPTION 'That email address is already in use';
      END IF;
    END;
  END LOOP;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'Could not create the account, please try again';
  END IF;

  UPDATE public.users u
     SET job_titles = COALESCE(v_titles, u.job_titles),
         tagline    = v_tagline
   WHERE u.id = v_new_id;

  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = v_new_id;
END; $function$;

REVOKE ALL ON FUNCTION public.join_signup(text, text, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_signup(text, text, text, text, text, text, text[]) TO anon, authenticated, service_role;

-- ── 5 ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.signup_owner_with_org(text, text, text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION public.signup_owner_with_org(
  p_first_name           text,
  p_last_name            text,
  p_email                text,
  p_password             text,
  p_restaurant_name      text,
  p_reward_currency_name text DEFAULT 'Bucks'::text,
  p_default_password     text DEFAULT 'welcome123'::text,
  p_address              text DEFAULT NULL::text,
  p_city                 text DEFAULT NULL::text,
  p_state                text DEFAULT NULL::text,
  p_zip                  text DEFAULT NULL::text,
  p_weather_location     text DEFAULT NULL::text,
  p_tos_version          text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_full_name     text;
  v_base_username text;
  v_username      text;
  v_base_slug     text;
  v_slug          text;
  v_join_prefix   text;
  v_join_code     text;
  v_org_id        uuid;
  v_user_id       uuid;
  v_counter       int := 1;
  v_ip            text;
  v_tos           text;
BEGIN
  -- s86: owner signup had no rate limit. Locked networks raise 'rate_limited' here.
  v_ip := public._request_ip();
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ipo:' || v_ip);
  END IF;

  IF p_first_name IS NULL OR btrim(p_first_name) = '' THEN
    RAISE EXCEPTION 'First name is required';
  END IF;
  IF p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Last name is required';
  END IF;
  IF p_restaurant_name IS NULL OR btrim(p_restaurant_name) = '' THEN
    RAISE EXCEPTION 'Restaurant name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_full_name := btrim(p_first_name) || ' ' || btrim(p_last_name);

  v_base_username := lower(
    left(btrim(p_first_name), 1)
    || regexp_replace(btrim(p_last_name), '[^a-zA-Z0-9]', '', 'g')
  );
  IF v_base_username = '' THEN
    v_base_username := 'owner';
  END IF;
  v_username := v_base_username;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base_username || v_counter;
  END LOOP;

  v_base_slug := btrim(regexp_replace(lower(btrim(p_restaurant_name)), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base_slug = '' THEN
    v_base_slug := 'restaurant';
  END IF;
  v_slug := v_base_slug;
  v_counter := 1;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  v_join_prefix := upper(rpad(
    left(regexp_replace(btrim(p_restaurant_name), '[^a-zA-Z]', '', 'g'), 4),
    4, 'X'
  ));
  LOOP
    v_join_code := v_join_prefix || '-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = v_join_code);
  END LOOP;

  v_tos := NULLIF(left(btrim(COALESCE(p_tos_version, '')), 32), '');

  INSERT INTO public.organizations (
    name, slug, join_code, reward_currency_name, default_password,
    address, city, state, zip, weather_location, owner_id,
    tos_accepted_at, tos_version
  ) VALUES (
    btrim(p_restaurant_name), v_slug, v_join_code,
    COALESCE(NULLIF(btrim(p_reward_currency_name), ''), 'Bucks'),
    COALESCE(NULLIF(btrim(p_default_password), ''), 'welcome123'),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_state, '')), ''),
    NULLIF(btrim(COALESCE(p_zip, '')), ''),
    NULLIF(btrim(COALESCE(p_weather_location, '')), ''),
    NULL,
    CASE WHEN v_tos IS NOT NULL THEN now() END, v_tos
  ) RETURNING id INTO v_org_id;

  INSERT INTO public.users (
    username, name, email, job_title, phone_number, role,
    password_hash, is_active, organization_id
  ) VALUES (
    v_username, v_full_name, lower(btrim(COALESCE(p_email, ''))), 'Owner', '', 'owner',
    crypt(p_password, gen_salt('bf')), true, v_org_id
  ) RETURNING id INTO v_user_id;

  UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;

  PERFORM public.initialize_org_trial(v_org_id);
  PERFORM public.seed_org_assistants(v_org_id);
  PERFORM public.seed_org_menu_categories(v_org_id);
  PERFORM public.seed_org_host_sections(v_org_id);

  -- Count this creation toward the network's hourly allowance (commits with the org).
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_fail('ipo:' || v_ip, 5, interval '1 hour', interval '1 hour');
  END IF;

  RETURN json_build_object(
    'user_id',   v_user_id,
    'org_id',    v_org_id,
    'username',  v_username,
    'join_code', v_join_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.signup_owner_with_org(text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_owner_with_org(text, text, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;
