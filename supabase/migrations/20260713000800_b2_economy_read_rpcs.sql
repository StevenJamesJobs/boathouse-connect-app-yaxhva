-- Batch B2 (economy) — additive READ RPCs so the client stops reading rewards_transactions /
-- redemption_requests directly (org derived from the actor server-side; also fixes the
-- `.eq('organization_id', null)` "invalid uuid" error on first render). All SECURITY DEFINER,
-- search_path pinned, EXECUTE to anon+authenticated.

-- Org-wide recent transactions. Managers/owners see all (incl. hidden); employees see visible only.
CREATE OR REPLACE FUNCTION public.get_org_transactions(p_actor_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, amount integer, description text, is_visible boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_is_mgr boolean;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_org IS NULL THEN RETURN; END IF;
  v_is_mgr := v_actor_role IN ('manager','owner');
  RETURN QUERY
    SELECT t.id, t.user_id, t.amount, t.description, t.is_visible, t.created_at
      FROM public.rewards_transactions t
     WHERE t.organization_id = v_actor_org
       AND (v_is_mgr OR t.is_visible = true)
     ORDER BY t.created_at DESC
     LIMIT GREATEST(COALESCE(p_limit, 20), 0);
END; $function$;

-- One employee's full history (manager/owner + same-org only).
CREATE OR REPLACE FUNCTION public.get_user_transactions(p_actor_id uuid, p_user_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, amount integer, description text, is_visible boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view a user''s transactions';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users u WHERE u.id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot view a user in another organization';
  END IF;
  RETURN QUERY
    SELECT t.id, t.user_id, t.amount, t.description, t.is_visible, t.created_at
      FROM public.rewards_transactions t
     WHERE t.user_id = p_user_id AND t.organization_id = v_actor_org
     ORDER BY t.created_at DESC
     LIMIT GREATEST(COALESCE(p_limit, 20), 0);
END; $function$;

-- Count of new visible awards in the org since a cutoff (manager red-dot badge).
CREATE OR REPLACE FUNCTION public.get_unread_awards_count(p_actor_id uuid, p_since timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_org uuid; v_count integer;
BEGIN
  SELECT organization_id INTO v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_org IS NULL THEN RETURN 0; END IF;
  SELECT count(*) INTO v_count FROM public.rewards_transactions t
   WHERE t.organization_id = v_actor_org AND t.is_visible = true AND t.created_at > p_since;
  RETURN COALESCE(v_count, 0);
END; $function$;

-- Org pending redemption queue (manager/owner). Full row shape.
CREATE OR REPLACE FUNCTION public.get_pending_redemptions(p_actor_id uuid)
RETURNS TABLE(id uuid, user_id uuid, request_type text, bucks_amount integer, status text,
  menu_item_id uuid, weekly_special_id uuid, item_name_snapshot text, shift_date date,
  shift_period text, comment text, decided_by uuid, decided_at timestamptz, decision_reason text,
  created_at timestamptz, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view the redemption queue';
  END IF;
  RETURN QUERY
    SELECT r.id, r.user_id, r.request_type, r.bucks_amount, r.status, r.menu_item_id, r.weekly_special_id,
           r.item_name_snapshot, r.shift_date, r.shift_period, r.comment, r.decided_by, r.decided_at,
           r.decision_reason, r.created_at, r.organization_id
      FROM public.redemption_requests r
     WHERE r.organization_id = v_actor_org AND r.status = 'pending'
     ORDER BY r.created_at DESC;
END; $function$;

-- A user's own requests filtered by status (self-service: own rows only).
CREATE OR REPLACE FUNCTION public.get_my_redemptions(p_user_id uuid, p_statuses text[])
RETURNS TABLE(id uuid, user_id uuid, request_type text, bucks_amount integer, status text,
  menu_item_id uuid, weekly_special_id uuid, item_name_snapshot text, shift_date date,
  shift_period text, comment text, decided_by uuid, decided_at timestamptz, decision_reason text,
  created_at timestamptz, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN QUERY
    SELECT r.id, r.user_id, r.request_type, r.bucks_amount, r.status, r.menu_item_id, r.weekly_special_id,
           r.item_name_snapshot, r.shift_date, r.shift_period, r.comment, r.decided_by, r.decided_at,
           r.decision_reason, r.created_at, r.organization_id
      FROM public.redemption_requests r
     WHERE r.user_id = p_user_id AND r.status = ANY(p_statuses)
     ORDER BY r.created_at DESC;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_org_transactions(uuid, integer)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_transactions(uuid, uuid, integer)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_awards_count(uuid, timestamptz)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_redemptions(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_redemptions(uuid, text[])            TO anon, authenticated;
