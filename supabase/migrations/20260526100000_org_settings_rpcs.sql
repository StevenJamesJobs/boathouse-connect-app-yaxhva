-- ============================================================================
-- Migration: Owner-only RPCs for organization settings management
-- Phase 2: update_organization_settings + regenerate_join_code
-- ============================================================================

-- Update organization settings (owner-only)
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
  p_default_password TEXT DEFAULT NULL
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
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$$;

-- Regenerate join code (owner-only)
CREATE OR REPLACE FUNCTION regenerate_join_code(
  p_organization_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_new_code TEXT;
  v_org_name TEXT;
  v_prefix TEXT;
BEGIN
  -- Verify caller is the org owner
  SELECT owner_id, name INTO v_owner_id, v_org_name
  FROM organizations
  WHERE id = p_organization_id;

  IF v_owner_id IS NULL OR v_owner_id != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can regenerate the join code');
  END IF;

  -- Generate a new code: first 4 chars of uppercase name + hyphen + 4 random alphanumeric
  v_prefix := UPPER(LEFT(REGEXP_REPLACE(v_org_name, '[^a-zA-Z]', '', 'g'), 4));
  v_new_code := v_prefix || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4));

  -- Ensure uniqueness (retry up to 5 times)
  FOR i IN 1..5 LOOP
    BEGIN
      UPDATE organizations
      SET join_code = v_new_code, updated_at = now()
      WHERE id = p_organization_id;

      RETURN json_build_object('success', true, 'join_code', v_new_code);
    EXCEPTION WHEN unique_violation THEN
      v_new_code := v_prefix || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || i::TEXT), 1, 4));
    END;
  END LOOP;

  RETURN json_build_object('success', false, 'error', 'Could not generate unique join code');
END;
$$;
