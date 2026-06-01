-- ============================================================================
-- Migration: Atomic owner+organization signup + hardened users org trigger
--
-- Fixes the MyResto owner-signup multi-tenant bug: a new owner created with a
-- NULL organization_id was silently force-assigned to the McLoone's org by the
-- shared `set_default_organization_id()` trigger, trapping the owner in the
-- wrong tenant (and behind McLoone's paywall) before they could create their
-- own restaurant.
--
-- 1. `signup_owner_with_org(...)` creates the organization, the owner user, and
--    the 14-day trial in ONE transaction. Because the user is inserted WITH a
--    non-NULL organization_id, the default-org trigger never fires for owners.
--    It resolves username / slug / join_code collisions in-transaction and
--    returns the final values so the client can log in and show the username.
--
-- 2. A dedicated `set_default_organization_id_users()` replaces the shared
--    function ONLY on the users trigger: it RAISES for an org-less owner
--    (turning silent tenant corruption into a loud error) while preserving the
--    McLoone's fallback for employees, which the live single-tenant McLoone's
--    build still relies on. The shared `set_default_organization_id()` used by
--    all the content-table triggers is intentionally left unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Atomic owner + organization signup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_owner_with_org(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_password text,
  p_restaurant_name text,
  p_reward_currency_name text DEFAULT 'Bucks',
  p_default_password text DEFAULT 'welcome123',
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip text DEFAULT NULL,
  p_weather_location text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
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

  -- Username = first initial + last name (alphanumeric only, lowercased).
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

  -- Slug = kebab-cased restaurant name, collision-suffixed.
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

  -- Join code = 4-letter prefix (padded with X) + '-' + 4 random alnum chars.
  v_join_prefix := upper(rpad(
    left(regexp_replace(btrim(p_restaurant_name), '[^a-zA-Z]', '', 'g'), 4),
    4, 'X'
  ));
  LOOP
    v_join_code := v_join_prefix || '-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO public.organizations (
    name, slug, join_code, reward_currency_name, default_password,
    address, city, state, zip, weather_location, owner_id
  ) VALUES (
    btrim(p_restaurant_name), v_slug, v_join_code,
    COALESCE(NULLIF(btrim(p_reward_currency_name), ''), 'Bucks'),
    COALESCE(NULLIF(btrim(p_default_password), ''), 'welcome123'),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_state, '')), ''),
    NULLIF(btrim(COALESCE(p_zip, '')), ''),
    NULLIF(btrim(COALESCE(p_weather_location, '')), ''),
    NULL
  ) RETURNING id INTO v_org_id;

  -- organization_id is non-NULL here, so the users trigger is a no-op.
  INSERT INTO public.users (
    username, name, email, job_title, phone_number, role,
    password_hash, is_active, organization_id
  ) VALUES (
    v_username, v_full_name, lower(btrim(COALESCE(p_email, ''))), 'Owner', '', 'owner',
    crypt(p_password, gen_salt('bf')), true, v_org_id
  ) RETURNING id INTO v_user_id;

  UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;

  PERFORM public.initialize_org_trial(v_org_id);

  RETURN json_build_object(
    'user_id',   v_user_id,
    'org_id',    v_org_id,
    'username',  v_username,
    'join_code', v_join_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_owner_with_org(
  text, text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Hardened users-only default-org trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_organization_id_users()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF NEW.role = 'owner' THEN
      RAISE EXCEPTION 'organization_id is required when creating an owner account';
    END IF;
    -- Backward-compat: the live single-tenant McLoone's build creates
    -- employees without an explicit organization_id.
    NEW.organization_id := (SELECT id FROM organizations WHERE slug = 'mcloones-boathouse');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_org_id_users ON public.users;
CREATE TRIGGER trg_default_org_id_users
  BEFORE INSERT ON public.users FOR EACH ROW
  EXECUTE FUNCTION set_default_organization_id_users();
