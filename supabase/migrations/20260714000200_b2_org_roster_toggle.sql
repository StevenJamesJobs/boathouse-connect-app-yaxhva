-- Batch B2 (organizations / staff_schedules prep) — owner-controlled roster visibility.
-- New organizations.staff_can_view_roster (DEFAULT true = current behavior): when an owner
-- turns it off, employees can no longer read the day roster (enforced in get_org_roster,
-- next migration); managers/owners are unaffected. get_org and update_organization_settings
-- are recreated to carry the field — DROP+CREATE because a RETURNS TABLE shape / parameter
-- list cannot change in place; both happen inside this single migration transaction.
-- Old clients unaffected: they call by named args and ignore extra returned json keys.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS staff_can_view_roster boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.get_org(uuid);
CREATE FUNCTION public.get_org(p_actor_id uuid)
RETURNS TABLE(
  id uuid, name text, slug text, logo_url text, address text, city text, state text, zip text,
  latitude numeric, longitude numeric, weather_location text, google_maps_query text,
  reward_currency_name text, join_code text, allow_self_signup boolean, menu_count integer,
  menu_1_name text, menu_2_name text, default_password text, owner_id uuid, menu_1_icon text,
  menu_2_icon text, header_icon text, menu_category_scope text, games_use_sample_data boolean,
  staff_can_view_roster boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.id, o.name, o.slug, o.logo_url, o.address, o.city, o.state, o.zip, o.latitude,
           o.longitude, o.weather_location, o.google_maps_query, o.reward_currency_name,
           o.join_code, o.allow_self_signup, o.menu_count, o.menu_1_name, o.menu_2_name,
           o.default_password, o.owner_id, o.menu_1_icon, o.menu_2_icon, o.header_icon,
           o.menu_category_scope, o.games_use_sample_data, o.staff_can_view_roster
      FROM public.organizations o
     WHERE o.id = v_org;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_org(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.update_organization_settings(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean, integer,
  text, text, text, text, text, text);
CREATE FUNCTION public.update_organization_settings(
  p_organization_id uuid, p_user_id uuid, p_name text DEFAULT NULL, p_address text DEFAULT NULL,
  p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_zip text DEFAULT NULL,
  p_weather_location text DEFAULT NULL, p_google_maps_query text DEFAULT NULL,
  p_reward_currency_name text DEFAULT NULL, p_allow_self_signup boolean DEFAULT NULL,
  p_menu_count integer DEFAULT NULL, p_menu_1_name text DEFAULT NULL,
  p_menu_2_name text DEFAULT NULL, p_default_password text DEFAULT NULL,
  p_menu_1_icon text DEFAULT NULL, p_menu_2_icon text DEFAULT NULL,
  p_header_icon text DEFAULT NULL, p_staff_can_view_roster boolean DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_owner_id UUID;
  v_result JSON;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM organizations
  WHERE id = p_organization_id;

  IF v_owner_id IS NULL OR v_owner_id != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can update settings');
  END IF;

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
    staff_can_view_roster = COALESCE(p_staff_can_view_roster, staff_can_view_roster),
    updated_at = now()
  WHERE id = p_organization_id;

  SELECT json_build_object('success', true) INTO v_result;
  RETURN v_result;
END; $function$;

GRANT EXECUTE ON FUNCTION public.update_organization_settings(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean, integer,
  text, text, text, text, text, text, boolean) TO anon, authenticated;
