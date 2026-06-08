-- ============================================================================
-- Seed assistants + default job-title→assistant mappings for new orgs.
--
-- McLoone's got 5 organization_assistants + 18 job_title_assistants rows from a
-- one-time backfill (20260521000002). New orgs created via signup_owner_with_org
-- were never seeded, so their owners saw "No assistants configured", no manager
-- pinned tiles, and employees saw no assistants. These two helpers fix that:
--   * seed_org_assistants        — the 5 active assistants (org-agnostic; called
--                                  at signup, before job titles exist)
--   * seed_default_job_title_assistants — default mappings, derived from the
--                                  org's chosen job titles (called at setup
--                                  completion, once titles exist)
-- Both are idempotent (ON CONFLICT DO NOTHING) so they can safely re-run.
-- ============================================================================

-- 1. Seed the 5 standard assistants (active) for an org.
CREATE OR REPLACE FUNCTION public.seed_org_assistants(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.organization_assistants (organization_id, assistant_key, is_active, display_name) VALUES
    (p_org_id, 'server',     true, 'Server Assistant'),
    (p_org_id, 'bartender',  true, 'Bartender Assistant'),
    (p_org_id, 'host',       true, 'Host Assistant'),
    (p_org_id, 'kitchen',    true, 'Kitchen Assistant'),
    (p_org_id, 'check_outs', true, 'Check Outs Calculator')
  ON CONFLICT (organization_id, assistant_key) DO NOTHING;
END;
$$;

-- 2. Seed default job-title → assistant mappings for an org, matching each of
--    the org's job titles (case-insensitively) against the standard role names.
--    Mirrors McLoone's defaults (20260521000002 lines 142-171). Custom titles
--    that don't match a standard name get no mapping — the owner assigns those
--    in Jobs & Tools. job_title is stored as the org's actual title string so it
--    matches users.job_titles exactly (see hooks/useToolVisibility.ts).
CREATE OR REPLACE FUNCTION public.seed_default_job_title_assistants(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.job_title_assistants (organization_id, job_title, assistant_key)
  SELECT p_org_id, jt.title, m.assistant_key
  FROM public.organization_job_titles jt
  JOIN (VALUES
    ('server','server'), ('lead server','server'), ('manager','server'),
    ('bartender','bartender'), ('manager','bartender'), ('lead server','bartender'), ('banquet captain','bartender'),
    ('host','host'), ('manager','host'),
    ('busser','kitchen'), ('chef','kitchen'), ('cook','kitchen'), ('kitchen','kitchen'), ('manager','kitchen'), ('runner','kitchen'),
    ('server','check_outs'), ('lead server','check_outs'), ('manager','check_outs')
  ) AS m(std_title, assistant_key)
    ON lower(btrim(jt.title)) = m.std_title
  WHERE jt.organization_id = p_org_id
  ON CONFLICT (organization_id, job_title, assistant_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_org_assistants(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_job_title_assistants(uuid) TO anon, authenticated;

-- 3. Wire seed_org_assistants into atomic owner signup so every new org gets the
--    5 assistants at creation. (Re-creates signup_owner_with_org with one added
--    PERFORM; body otherwise identical to 20260601000000.)
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
