-- s68 addendum (Steve, mid-session): Edit Categories becomes its own manager permission.
-- New key 'menu.edit_categories' — owner may grant managers category editing (rename/hide/
-- reorder/colours/subcategories) independently of uploads and menu configuration.
-- All 12 manage_menu_* RPCs swap _is_org_owner -> _may_edit_menu_categories via a
-- mechanical rewrite of their LIVE definitions (no other body change; DEFINER + pinned
-- search_path verified preserved on all 12 after the rewrite). The category/subcategory
-- translation _actor RPCs are already manager-level and stay as they are.
-- APPLIED LIVE via Supabase MCP 2026-08-11 (migration s68_menu_categories_grant).

CREATE FUNCTION public._may_edit_menu_categories(p_org uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT public._is_org_owner(p_org, p_actor)
      OR EXISTS (
        SELECT 1
          FROM public.users u
          JOIN public.manager_permissions mp
            ON mp.organization_id = u.organization_id
         WHERE u.id = p_actor
           AND u.organization_id = p_org
           AND u.role = 'manager'
           AND mp.permission_key = 'menu.edit_categories'
           AND mp.granted
      );
$function$;
REVOKE ALL ON FUNCTION public._may_edit_menu_categories(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  fn text; def text; n int;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'manage_menu_category_create', 'manage_menu_category_delete', 'manage_menu_category_rename',
    'manage_menu_category_reorder', 'manage_menu_category_set_color', 'manage_menu_category_set_hidden',
    'manage_menu_subcategory_create', 'manage_menu_subcategory_delete', 'manage_menu_subcategory_rename',
    'manage_menu_subcategory_reorder', 'manage_menu_subcategory_set_cocktail_fed', 'manage_menu_subcategory_set_hidden'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = fn;
    IF def IS NULL THEN
      RAISE EXCEPTION 'function % not found', fn;
    END IF;
    n := (length(def) - length(replace(def, '_is_org_owner(', ''))) / length('_is_org_owner(');
    IF n < 1 THEN
      RAISE EXCEPTION 'function % has no _is_org_owner gate to swap', fn;
    END IF;
    def := replace(def, '_is_org_owner(', '_may_edit_menu_categories(');
    EXECUTE def;
  END LOOP;
END $$;

-- set_manager_permission: whitelist gains the eighth key.
CREATE OR REPLACE FUNCTION public.set_manager_permission(p_actor_id uuid, p_key text, p_granted boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._is_org_owner(v_org, p_actor_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can change manager permissions');
  END IF;
  IF p_key IS NULL OR p_key NOT IN (
    'org_settings.menu', 'org_settings.branding', 'org_settings.jobs_tools', 'org_settings.access',
    'menu.edit_categories',
    'premium.ai_menu_upload', 'premium.review_refresh', 'premium.ai_schedule_upload'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unknown permission key');
  END IF;
  IF p_granted IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'granted must be true or false');
  END IF;
  INSERT INTO public.manager_permissions (organization_id, permission_key, granted, granted_by, updated_at)
  VALUES (v_org, p_key, p_granted, p_actor_id, now())
  ON CONFLICT (organization_id, permission_key)
  DO UPDATE SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, updated_at = now();
  RETURN json_build_object('success', true, 'key', p_key, 'granted', p_granted);
END; $function$;
