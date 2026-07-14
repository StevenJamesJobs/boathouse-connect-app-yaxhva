-- Batch B3 (economy) — hardened write RPCs for rewards_transactions, replacing the direct client
-- INSERT (award/deduct — the Critical "anyone can mint bucks" hole), DELETE, and visibility UPDATE.
-- All manager/owner-gated, org-derived from the actor, SECURITY DEFINER, search_path pinned.

-- Award (positive amount) OR deduct (negative amount). Balance is moved by the rewards_transactions
-- AFTER INSERT trigger (single source of truth), so this only inserts the ledger row.
CREATE OR REPLACE FUNCTION public.award_bucks(
  p_actor_id uuid, p_user_id uuid, p_amount integer, p_description text, p_is_visible boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can award or deduct bucks';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot adjust a user in another organization';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  INSERT INTO public.rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (p_user_id, p_amount, p_description, COALESCE(p_is_visible, true), p_actor_id, v_actor_org);
END; $function$;

-- Delete a ledger row (org-scoped). Balance is intentionally NOT recomputed — this matches the
-- existing behavior (the client comment noted "balance is NOT affected").
CREATE OR REPLACE FUNCTION public.delete_transaction(p_actor_id uuid, p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can delete transactions';
  END IF;
  DELETE FROM public.rewards_transactions WHERE id = p_transaction_id AND organization_id = v_actor_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_transaction_visibility(
  p_actor_id uuid, p_transaction_id uuid, p_is_visible boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change transaction visibility';
  END IF;
  UPDATE public.rewards_transactions SET is_visible = p_is_visible, updated_at = NOW()
   WHERE id = p_transaction_id AND organization_id = v_actor_org;
END; $function$;

GRANT EXECUTE ON FUNCTION public.award_bucks(uuid, uuid, integer, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_transaction(uuid, uuid)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_transaction_visibility(uuid, uuid, boolean) TO anon, authenticated;
