-- BUGFIX: approve_redemption_request was deducting bucks TWICE.
--
-- The AFTER INSERT trigger `update_user_mcloones_bucks` on rewards_transactions
-- already adjusts users.mcloones_bucks by NEW.amount. The function ALSO ran an
-- explicit `UPDATE users SET mcloones_bucks = ... - bucks_amount`, so every
-- approval deducted the amount twice ($30 awarded, redeem $8 + $10 →
-- 30 - 18 - 18 = -6 instead of +12).
--
-- Fix: drop the explicit balance update — the inserted (negative) transaction +
-- trigger is the single source of truth, exactly like the Reward/Deduct flow.
-- The pre-insert balance check stays so a redemption can never go negative.
-- (Also added a 'custom' branch to the description so custom redemptions read
-- "Redeemed: <label>" instead of the generic "Redeemed".)
--
-- One-time data reconcile for the already-double-charged users was applied
-- separately (mcloones_bucks += SUM of their approved redemption bucks_amount);
-- it is NOT part of this migration because it is data cleanup, not schema.
CREATE OR REPLACE FUNCTION public.approve_redemption_request(p_request_id uuid, p_manager_id uuid, p_reason text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_req RECORD; v_manager_role TEXT; v_balance INTEGER; v_description TEXT;
BEGIN
  SELECT role INTO v_manager_role FROM users WHERE id = p_manager_id;
  IF v_manager_role NOT IN ('manager', 'owner') THEN RAISE EXCEPTION 'Only managers may approve redemption requests'; END IF;
  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Redemption request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status; END IF;
  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM users WHERE id = v_req.user_id;
  IF v_balance < v_req.bucks_amount THEN RAISE EXCEPTION 'Employee balance insufficient at approval time'; END IF;
  v_description := CASE v_req.request_type
    WHEN 'food_beverage' THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Menu Item')
    WHEN 'section' THEN 'Redeemed: Choose Your Own Section'
    WHEN 'side_work' THEN 'Redeemed: Choose Your Own Side Work'
    WHEN 'side_work_free' THEN 'Redeemed: Side Work Free Shift'
    WHEN 'custom' THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Reward')
    ELSE 'Redeemed' END;
  -- Balance is adjusted by the AFTER INSERT trigger on rewards_transactions.
  INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
  VALUES (v_req.user_id, -v_req.bucks_amount, v_description, true, p_manager_id, p_organization_id);
  UPDATE redemption_requests SET status = 'approved', decided_by = p_manager_id, decided_at = now(), decision_reason = p_reason WHERE id = p_request_id;
END; $function$;
