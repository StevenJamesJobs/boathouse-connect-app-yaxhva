-- Batch B2 (organizations) — close the pre-login default_password leak in the join flow.
-- join.tsx used to SELECT id,name,allow_self_signup,default_password FROM organizations by
-- join_code UNAUTHENTICATED (R1), render the password on screen, then create the account
-- client-side with it. These two DEFINER RPCs move the whole flow server-side:
--   • lookup_join_code — code → (org_name, allow_self_signup) ONLY; no id, no password.
--   • join_signup — validates the code + allow_self_signup, resolves a free username from the
--     requested base (same suffix scheme as signup_owner_with_org / findAvailableUsername, but
--     case-insensitive to match users_username_lower_key), creates the employee through
--     create_user's self-signup path (role forced to employee, force_password_change=true) with
--     the org's default_password NEVER leaving the DB, and returns the authenticated row in the
--     exact login_user shape so the client can adopt the session directly.
-- Additive: nothing calls these yet; the public policies stay (teardown is gated separately).
-- TEARDOWN NOTE: once old clients are gone, create_user's anon self-signup path (p_actor_id
-- IS NULL) must be closed too — join_signup supersedes it and is the only code-gated entry.

CREATE OR REPLACE FUNCTION public.lookup_join_code(p_join_code text)
RETURNS TABLE(org_name text, allow_self_signup boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN QUERY
    SELECT o.name, o.allow_self_signup
      FROM public.organizations o
     WHERE upper(o.join_code) = upper(btrim(p_join_code))
     LIMIT 1;  -- codes are generated unique (signup_owner_with_org / regenerate_join_code)
END; $function$;

CREATE OR REPLACE FUNCTION public.join_signup(
  p_join_code text, p_username text, p_name text, p_email text DEFAULT '')
RETURNS TABLE(
  id uuid, username text, name text, email text, phone_number text,
  job_title text, job_titles text[], role text, organization_id uuid,
  profile_picture_url text, badge_title text, mcloones_bucks integer,
  quick_tools jsonb, force_password_change boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
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
BEGIN
  -- 1) The join code gates everything (old client matched with ilike ≙ case-insensitive equality).
  SELECT o.id, o.allow_self_signup, o.default_password
    INTO v_org_id, v_allow, v_default_pw
    FROM public.organizations o
   WHERE upper(o.join_code) = upper(btrim(p_join_code))
   LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;
  IF NOT COALESCE(v_allow, false) THEN
    RAISE EXCEPTION 'Self-registration is disabled for this organization';
  END IF;
  IF COALESCE(v_default_pw, '') = '' THEN
    RAISE EXCEPTION 'This organization has no default password configured';
  END IF;

  -- 2) Validate inputs here — create_user validates nothing and users.name/email are NOT NULL.
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
  -- users.email is NOT NULL + UNIQUE, so only ONE account can ever hold ''. Surface that as a
  -- clear message instead of a raw unique_violation (pre-existing data-model quirk; → B6).
  IF v_email = '' AND EXISTS (SELECT 1 FROM public.users u WHERE u.email = '') THEN
    RAISE EXCEPTION 'Please enter an email address';
  END IF;

  -- 3) Resolve a free username from the requested base, retrying on a concurrent-signup race.
  v_base := left(lower(regexp_replace(COALESCE(p_username, ''), '[^a-zA-Z0-9]', '', 'g')), 32);
  IF v_base = '' THEN v_base := 'user'; END IF;

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
      -- otherwise: username race with a concurrent signup — loop re-resolves and retries
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

GRANT EXECUTE ON FUNCTION public.lookup_join_code(text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_signup(text, text, text, text) TO anon, authenticated;
