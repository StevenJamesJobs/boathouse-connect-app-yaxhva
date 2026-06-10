-- ============================================================================
-- Wire seed_org_menu_categories into atomic owner signup so every new org gets
-- its default category tree at creation (D4). Re-creates signup_owner_with_org
-- with one added PERFORM; body otherwise identical to 20260608000000.
-- ============================================================================

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
  PERFORM public.seed_org_menu_categories(v_org_id);

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
