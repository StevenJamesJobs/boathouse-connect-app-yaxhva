-- Batch B3 (organizations) — close out the direct client writes (teardown-readiness for
-- dropping public_update_organizations). Four of the six remaining .update() sites fold into
-- EXISTING owner-gated RPCs (update_organization_settings for menu config + google_maps_query;
-- set_org_menu_category_scope for the scope incl. its per_menu materialization — which the
-- setup-wizard's direct write used to skip). NEW RPCs for the last two:
--   • set_org_logo — primary-owner-gated like update_organization_settings (same screen);
--     direct assignment because logo REMOVAL sets NULL, which the COALESCE partial-update
--     pattern cannot express (p_logo_url omitted/NULL clears the logo).
--   • set_org_games_sample_flag — manager/owner (Game Hub is a manager tool); org derived
--     from the actor, never a client arg.

CREATE OR REPLACE FUNCTION public.set_org_logo(p_actor_id uuid, p_logo_url text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._is_org_owner(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change the logo');
  END IF;
  UPDATE public.organizations SET logo_url = p_logo_url, updated_at = now() WHERE id = v_org;
  RETURN json_build_object('success', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.set_org_games_sample_flag(p_actor_id uuid, p_value boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RETURN json_build_object('success', false, 'error', 'Only managers or owners can change game settings');
  END IF;
  IF p_value IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid value');
  END IF;
  UPDATE public.organizations SET games_use_sample_data = p_value, updated_at = now() WHERE id = v_org;
  RETURN json_build_object('success', true, 'games_use_sample_data', p_value);
END; $function$;

GRANT EXECUTE ON FUNCTION public.set_org_logo(uuid, text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_games_sample_flag(uuid, boolean) TO anon, authenticated;
