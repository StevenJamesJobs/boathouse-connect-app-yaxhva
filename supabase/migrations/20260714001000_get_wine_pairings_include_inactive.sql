-- get_wine_pairings gains an optional p_include_inactive so the memory-game-editor (a manager
-- tool with an active/inactive toggle) can see inactive pairings to reactivate them. Only a
-- manager/owner reading their OWN org gets inactive rows; games/viewers keep active-only.
-- DROP+CREATE because the arg list changes (2-arg calls still resolve via the new defaults).
DROP FUNCTION IF EXISTS public.get_wine_pairings(uuid, uuid);
CREATE FUNCTION public.get_wine_pairings(
  p_actor_id uuid, p_source_org uuid DEFAULT NULL, p_include_inactive boolean DEFAULT false)
RETURNS TABLE(
  id uuid, wine text, entree text, hint text, display_order integer, is_active boolean,
  organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_src uuid; v_actor_org uuid; v_role text; v_all boolean;
BEGIN
  v_src := public._recipe_source_org(p_actor_id, p_source_org);
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT u.role, u.organization_id INTO v_role, v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  v_all := COALESCE(p_include_inactive, false)
           AND v_src = v_actor_org
           AND v_role IN ('manager','owner');
  RETURN QUERY
    SELECT w.id, w.wine, w.entree, w.hint, w.display_order, w.is_active, w.organization_id
      FROM public.wine_pairings w
     WHERE w.organization_id = v_src AND (v_all OR w.is_active = true)
     ORDER BY w.display_order;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_wine_pairings(uuid, uuid, boolean) TO anon, authenticated;
