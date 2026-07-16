-- B2/B3 shade_dismissals lockdown (the notification-shade / bell hide-list).
--
-- Before: policies "Anyone can insert/read/delete shade dismissals" (USING true / WITH CHECK true,
-- role public) — anyone could read every org's hide-list, hide any org's shade items from all its
-- staff, and restore (delete) any hide-row. This is the general announcement/event/feature/custom
-- bell hide-list (NOT exam-specific); a manager's "X" on a shade row hides it org-wide, and the
-- Notification Center's "Recently Dismissed" tab restores it. Key = UNIQUE(notification_type,
-- item_id); dismissed_by is audit only; dismissed_title snapshots the title for the restore list.
--
-- ADDITIVE only — teardown drops "Anyone can insert shade dismissals" / "Everyone can read shade
-- dismissals" / "Anyone can delete shade dismissals". Org written explicitly (trg_default_org_id_*
-- backfills Boathouse on NULL — never rely on it). Reads member-gated; dismiss/restore/recent are
-- manager/owner. Not in the realtime publication.

-- Every member reads the org hide-list so the dropdown can filter its shade for all staff.
CREATE OR REPLACE FUNCTION public.get_shade_dismissals(p_actor_id uuid)
RETURNS TABLE(notification_type text, item_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.notification_type, d.item_id FROM public.shade_dismissals d WHERE d.organization_id = v_org;
END; $function$;

-- Manager/owner hides a shade item org-wide (idempotent on the type+item key).
CREATE OR REPLACE FUNCTION public.dismiss_shade_item(
  p_actor_id uuid, p_notification_type text, p_item_id uuid, p_title text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can dismiss shade items'; END IF;
  INSERT INTO public.shade_dismissals (notification_type, item_id, dismissed_by, organization_id, dismissed_title)
  VALUES (p_notification_type, p_item_id, p_actor_id, v_org, p_title)
  ON CONFLICT (notification_type, item_id) DO NOTHING;
END; $function$;

-- Manager/owner: the org's recently-dismissed items (Notification Center restore tab).
CREATE OR REPLACE FUNCTION public.get_recent_shade_dismissals(p_actor_id uuid, p_limit integer DEFAULT 40)
RETURNS TABLE(id uuid, notification_type text, item_id uuid, dismissed_title text, dismissed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF v_role NOT IN ('manager','owner') THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.id, d.notification_type, d.item_id, d.dismissed_title, d.dismissed_at
      FROM public.shade_dismissals d
     WHERE d.organization_id = v_org
     ORDER BY d.dismissed_at DESC
     LIMIT COALESCE(p_limit, 40);
END; $function$;

-- Manager/owner restores an item (deletes the hide-row), org-checked.
CREATE OR REPLACE FUNCTION public.restore_shade_item(p_actor_id uuid, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can restore shade items'; END IF;
  DELETE FROM public.shade_dismissals d WHERE d.id = p_id AND d.organization_id = v_org;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_shade_dismissals(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_shade_item(uuid, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_shade_dismissals(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_shade_item(uuid, uuid) TO anon, authenticated;
