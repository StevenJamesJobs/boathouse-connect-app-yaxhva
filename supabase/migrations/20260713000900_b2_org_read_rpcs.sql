-- Batch B2 (organizations) — additive READ RPCs so the client stops reading the organizations
-- table directly for POST-LOGIN flows. `get_org` is member-gated (returns ONLY the caller's own
-- org, derived from the actor), so default_password/join_code/owner_id are no longer readable
-- cross-org or by anon once the public SELECT policy is dropped. SECURITY DEFINER, sp pinned.
-- NOTE: the PRE-LOGIN join flow (join.tsx) and the 6 direct .update() writes are a separate
-- follow-on (a server-side join_signup RPC + gated write RPCs); tracked in the session handoff.

CREATE OR REPLACE FUNCTION public.get_org(p_actor_id uuid)
RETURNS TABLE(
  id uuid, name text, slug text, logo_url text, address text, city text, state text, zip text,
  latitude numeric, longitude numeric, weather_location text, google_maps_query text,
  reward_currency_name text, join_code text, allow_self_signup boolean, menu_count integer,
  menu_1_name text, menu_2_name text, default_password text, owner_id uuid, menu_1_icon text,
  menu_2_icon text, header_icon text, menu_category_scope text, games_use_sample_data boolean
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
           o.menu_category_scope, o.games_use_sample_data
      FROM public.organizations o
     WHERE o.id = v_org;
END; $function$;

-- Resolve an org id by slug (used only to find the hardcoded sample-data org for games).
-- Returns just the id — not sensitive; anon-callable.
CREATE OR REPLACE FUNCTION public.get_org_id_by_slug(p_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT o.id INTO v_id FROM public.organizations o WHERE o.slug = p_slug;
  RETURN v_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_org(uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_id_by_slug(text) TO anon, authenticated;
