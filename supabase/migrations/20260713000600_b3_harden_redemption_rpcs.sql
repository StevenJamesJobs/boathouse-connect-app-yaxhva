-- Batch B3 (economy) — harden the redemption RPCs in place (signatures unchanged, no client change):
-- derive the acting manager's org and require the request/user to be in that same org (closes
-- cross-org approve/deny/submit), stamp the ledger row with the derived org, and pin search_path.

CREATE OR REPLACE FUNCTION public.approve_redemption_request(
  p_request_id uuid, p_manager_id uuid, p_reason text, p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_req RECORD; v_manager_role text; v_manager_org uuid; v_balance integer; v_description text;
BEGIN
  SELECT role, organization_id INTO v_manager_role, v_manager_org FROM public.users WHERE id = p_manager_id;
  IF v_manager_role IS NULL OR v_manager_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers may approve redemption requests';
  END IF;
  SELECT * INTO v_req FROM public.redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Redemption request not found'; END IF;
  IF v_req.organization_id IS DISTINCT FROM v_manager_org THEN
    RAISE EXCEPTION 'Cannot act on a request in another organization';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;
  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM public.users WHERE id = v_req.user_id;
  IF v_balance < v_req.bucks_amount THEN RAISE EXCEPTION 'Employee balance insufficient at approval time'; END IF;
  v_description := CASE v_req.request_type
    WHEN 'food_beverage' THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Menu Item')
    WHEN 'section' THEN 'Redeemed: Choose Your Own Section'
    WHEN 'side_work' THEN 'Redeemed: Choose Your Own Side Work'
    WHEN 'side_work_free' THEN 'Redeemed: Side Work Free Shift'
    WHEN 'custom' THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Reward')
    ELSE 'Redeemed' END;
  -- Balance is adjusted by the AFTER INSERT trigger on rewards_transactions.
  INSERT INTO public.rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (v_req.user_id, -v_req.bucks_amount, v_description, true, p_manager_id, v_manager_org);
  UPDATE public.redemption_requests
     SET status = 'approved', decided_by = p_manager_id, decided_at = now(), decision_reason = p_reason
   WHERE id = p_request_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.deny_redemption_request(
  p_request_id uuid, p_manager_id uuid, p_reason text, p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_req RECORD; v_manager_role text; v_manager_org uuid;
BEGIN
  SELECT role, organization_id INTO v_manager_role, v_manager_org FROM public.users WHERE id = p_manager_id;
  IF v_manager_role IS NULL OR v_manager_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers may deny redemption requests';
  END IF;
  SELECT * INTO v_req FROM public.redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Redemption request not found'; END IF;
  IF v_req.organization_id IS DISTINCT FROM v_manager_org THEN
    RAISE EXCEPTION 'Cannot act on a request in another organization';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;
  UPDATE public.redemption_requests
     SET status = 'denied', decided_by = p_manager_id, decided_at = now(), decision_reason = p_reason
   WHERE id = p_request_id;
END; $function$;

-- Self-service submit: derive the org from the requesting user (don't trust a client org), pin sp.
CREATE OR REPLACE FUNCTION public.submit_redemption_request(
  p_user_id uuid, p_request_type text, p_bucks_amount integer, p_menu_item_id uuid,
  p_weekly_special_id uuid, p_item_name_snapshot text, p_shift_date date, p_shift_period text,
  p_comment text, p_organization_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_balance integer; v_pending_total integer; v_available integer; v_org uuid; v_request_id uuid;
BEGIN
  IF p_bucks_amount IS NULL OR p_bucks_amount <= 0 THEN RAISE EXCEPTION 'Invalid bucks amount'; END IF;
  SELECT COALESCE(mcloones_bucks, 0), organization_id INTO v_balance, v_org FROM public.users WHERE id = p_user_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  SELECT COALESCE(SUM(bucks_amount), 0) INTO v_pending_total
    FROM public.redemption_requests WHERE user_id = p_user_id AND status = 'pending';
  v_available := v_balance - v_pending_total;
  IF v_available < p_bucks_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', v_available, p_bucks_amount;
  END IF;
  INSERT INTO public.redemption_requests
    (user_id, request_type, bucks_amount, menu_item_id, weekly_special_id, item_name_snapshot,
     shift_date, shift_period, comment, organization_id)
  VALUES
    (p_user_id, p_request_type, p_bucks_amount, p_menu_item_id, p_weekly_special_id, p_item_name_snapshot,
     p_shift_date, p_shift_period, p_comment, v_org)
  RETURNING id INTO v_request_id;
  RETURN v_request_id;
END; $function$;