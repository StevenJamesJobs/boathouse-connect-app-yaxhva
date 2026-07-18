-- B4 Batch 5 (2026-07-18, session 48): server-side login/signup throttle.
--
-- login_user (and the join/username probes) had NO rate limit — the anon key
-- allows unlimited password guessing per username, join-code brute-force, and
-- username enumeration. Adds a sealed attempts table + failure tracking with
-- lockouts, enforced INSIDE the fns (custom auth; nothing client-side to trust):
--   per-username login: 5 fails / 15 min  -> 10 min lock  (key u:<lower name>)
--   per-IP login:      50 fails / 15 min  -> 15 min lock  (key ip:<addr>)
--   per-IP join-code:  20 misses / 15 min -> 15 min lock  (key ipj:<addr>)
--   per-IP username probe: 120 calls / 15 min -> 5 min lock (key ipu:<addr>)
-- IP comes from PostgREST's request.headers (x-forwarded-for first hop); when
-- absent (internal SQL), IP throttles are skipped — the per-username throttle
-- still applies. Lockout RAISEs 'rate_limited' (client maps it to a friendly
-- message; all other behavior identical incl. the timing-safe dummy crypt).
-- No internal pg_proc callers of any of the 4 fns (verified). Counter clears
-- on successful login. Stale rows (>1 day, unlocked) pruned opportunistically.
--
-- ROLLBACK:
--   Recreate the 4 fns from their pre-throttle definitions (git: this file's
--   sibling copies / pg history) — bodies above each CREATE below are additive
--   wrappers around the verbatim originals;
--   DROP FUNCTION public._throttle_check(text); DROP FUNCTION
--   public._throttle_fail(text, integer, interval, interval); DROP FUNCTION
--   public._throttle_clear(text); DROP FUNCTION public._request_ip();
--   DROP TABLE public.login_attempts;

CREATE TABLE IF NOT EXISTS public.login_attempts (
  key           text PRIMARY KEY,
  fail_count    integer NOT NULL DEFAULT 0,
  first_fail_at timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM PUBLIC, anon, authenticated;

-- First-hop client IP from PostgREST request headers; NULL outside PostgREST.
CREATE OR REPLACE FUNCTION public._request_ip() RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v text;
BEGIN
  BEGIN
    v := current_setting('request.headers', true);
    IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
    v := btrim(split_part(COALESCE(v::json->>'x-forwarded-for', v::json->>'x-real-ip', ''), ',', 1));
    IF v = '' THEN RETURN NULL; END IF;
    RETURN left(v, 45);
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public._request_ip() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._throttle_check(p_key text) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_until timestamptz;
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  SELECT la.locked_until INTO v_until FROM public.login_attempts la WHERE la.key = p_key;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._throttle_check(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._throttle_fail(
  p_key text, p_threshold integer, p_window interval, p_lock interval
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  DELETE FROM public.login_attempts
   WHERE first_fail_at < now() - interval '1 day'
     AND (locked_until IS NULL OR locked_until < now());
  INSERT INTO public.login_attempts AS la (key, fail_count, first_fail_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    fail_count = CASE WHEN la.first_fail_at < now() - p_window
                        AND (la.locked_until IS NULL OR la.locked_until < now())
                      THEN 1 ELSE la.fail_count + 1 END,
    first_fail_at = CASE WHEN la.first_fail_at < now() - p_window
                           AND (la.locked_until IS NULL OR la.locked_until < now())
                         THEN now() ELSE la.first_fail_at END;
  UPDATE public.login_attempts la SET locked_until = now() + p_lock
   WHERE la.key = p_key AND la.fail_count >= p_threshold
     AND (la.locked_until IS NULL OR la.locked_until < now());
END $$;
REVOKE EXECUTE ON FUNCTION public._throttle_fail(text, integer, interval, interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._throttle_clear(p_key text) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  DELETE FROM public.login_attempts la WHERE la.key = p_key;
END $$;
REVOKE EXECUTE ON FUNCTION public._throttle_clear(text) FROM PUBLIC, anon, authenticated;

-- ===================== login_user (throttled) =====================
CREATE OR REPLACE FUNCTION public.login_user(p_username text, p_password text)
 RETURNS TABLE(id uuid, username text, name text, email text, phone_number text, job_title text, job_titles text[], role text, organization_id uuid, profile_picture_url text, badge_title text, mcloones_bucks integer, quick_tools jsonb, force_password_change boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_id   uuid;
  v_hash text;
  v_ukey text;
  v_ip   text;
BEGIN
  v_ukey := 'u:' || lower(btrim(p_username));
  v_ip   := public._request_ip();
  PERFORM public._throttle_check(v_ukey);
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ip:' || v_ip);
  END IF;

  SELECT u.id, u.password_hash INTO v_id, v_hash
    FROM public.users u
   WHERE lower(u.username) = lower(p_username)
   LIMIT 1;

  IF v_hash IS NULL THEN
    PERFORM crypt(p_password, gen_salt('bf'));
    PERFORM public._throttle_fail(v_ukey, 5, interval '15 minutes', interval '10 minutes');
    IF v_ip IS NOT NULL THEN
      PERFORM public._throttle_fail('ip:' || v_ip, 50, interval '15 minutes', interval '15 minutes');
    END IF;
    RETURN;
  END IF;

  IF v_hash <> crypt(p_password, v_hash) THEN
    PERFORM public._throttle_fail(v_ukey, 5, interval '15 minutes', interval '10 minutes');
    IF v_ip IS NOT NULL THEN
      PERFORM public._throttle_fail('ip:' || v_ip, 50, interval '15 minutes', interval '15 minutes');
    END IF;
    RETURN;
  END IF;

  PERFORM public._throttle_clear(v_ukey);

  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = v_id;
END;
$function$;

-- ===================== lookup_join_code (IP-throttled on misses) =====================
CREATE OR REPLACE FUNCTION public.lookup_join_code(p_join_code text)
 RETURNS TABLE(org_name text, allow_self_signup boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_ip text;
BEGIN
  v_ip := public._request_ip();
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ipj:' || v_ip);
  END IF;

  RETURN QUERY
    SELECT o.name, o.allow_self_signup
      FROM public.organizations o
     WHERE upper(o.join_code) = upper(btrim(p_join_code))
     LIMIT 1;  -- codes are generated unique (signup_owner_with_org / regenerate_join_code)

  IF NOT FOUND AND v_ip IS NOT NULL THEN
    PERFORM public._throttle_fail('ipj:' || v_ip, 20, interval '15 minutes', interval '15 minutes');
  END IF;
END; $function$;

-- ===================== join_signup (shares the join-code IP throttle) =====================
CREATE OR REPLACE FUNCTION public.join_signup(p_join_code text, p_username text, p_name text, p_email text DEFAULT '')
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

  -- 1) The join code gates everything (old client matched with ilike ≙ case-insensitive equality).
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

-- ===================== check_username_available (IP-metered) =====================
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_ip text;
BEGIN
  v_ip := public._request_ip();
  IF v_ip IS NOT NULL THEN
    PERFORM public._throttle_check('ipu:' || v_ip);
    PERFORM public._throttle_fail('ipu:' || v_ip, 120, interval '15 minutes', interval '5 minutes');
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users u WHERE lower(u.username) = lower(p_username)
  );
END;
$function$;
