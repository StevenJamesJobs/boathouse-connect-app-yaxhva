-- Extend update_organization_settings with menu/header icon fields (D2 / D2b).
-- Drop the prior 15-arg signature first so we don't leave two overloads that
-- PostgREST could resolve ambiguously (see feedback_postgrest_supabase).

DROP FUNCTION IF EXISTS update_organization_settings(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION update_organization_settings(
  p_organization_id UUID,
  p_user_id UUID,
  p_name TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL,
  p_weather_location TEXT DEFAULT NULL,
  p_google_maps_query TEXT DEFAULT NULL,
  p_reward_currency_name TEXT DEFAULT NULL,
  p_allow_self_signup BOOLEAN DEFAULT NULL,
  p_menu_count INTEGER DEFAULT NULL,
  p_menu_1_name TEXT DEFAULT NULL,
  p_menu_2_name TEXT DEFAULT NULL,
  p_default_password TEXT DEFAULT NULL,
  p_menu_1_icon TEXT DEFAULT NULL,
  p_menu_2_icon TEXT DEFAULT NULL,
  p_header_icon TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_result JSON;
BEGIN
  -- Verify caller is the org owner
  SELECT owner_id INTO v_owner_id
  FROM organizations
  WHERE id = p_organization_id;

  IF v_owner_id IS NULL OR v_owner_id != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can update settings');
  END IF;

  -- Update only non-null fields
  UPDATE organizations SET
    name = COALESCE(p_name, name),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    zip = COALESCE(p_zip, zip),
    weather_location = COALESCE(p_weather_location, weather_location),
    google_maps_query = COALESCE(p_google_maps_query, google_maps_query),
    reward_currency_name = COALESCE(p_reward_currency_name, reward_currency_name),
    allow_self_signup = COALESCE(p_allow_self_signup, allow_self_signup),
    menu_count = COALESCE(p_menu_count, menu_count),
    menu_1_name = COALESCE(p_menu_1_name, menu_1_name),
    menu_2_name = COALESCE(p_menu_2_name, menu_2_name),
    default_password = COALESCE(p_default_password, default_password),
    menu_1_icon = COALESCE(p_menu_1_icon, menu_1_icon),
    menu_2_icon = COALESCE(p_menu_2_icon, menu_2_icon),
    header_icon = COALESCE(p_header_icon, header_icon),
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$$;
