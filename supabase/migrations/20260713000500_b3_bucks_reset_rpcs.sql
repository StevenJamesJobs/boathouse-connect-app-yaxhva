-- Batch B3 — gated, org-scoped, ledger-consistent bucks-reset RPCs. These absorb the two direct
-- client `users` writes and, by scoping the ledger DELETE to the actor's org, ALSO fix the
-- Critical cross-org "Reset All Users" wipe bug (formerly deleted every org's rewards_transactions).
-- The rewards_transactions AFTER INSERT trigger does not fire on DELETE, so zeroing the balance
-- directly here is correct (not a double-count).

-- Single employee reset — manager or owner, same org only.
CREATE OR REPLACE FUNCTION public.reset_user_bucks(p_actor_id uuid, p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reset balances';
  END IF;
  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_target_user_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot reset a user in another organization';
  END IF;

  DELETE FROM public.rewards_transactions
   WHERE user_id = p_target_user_id AND organization_id = v_actor_org;
  UPDATE public.users SET mcloones_bucks = 0, updated_at = NOW()
   WHERE id = p_target_user_id AND organization_id = v_actor_org;
END; $function$;

-- Org-wide reset — OWNER ONLY (destructive, irreversible). Org derived from the actor; the ledger
-- DELETE is org-scoped, which is the fix for the cross-org wipe bug.
CREATE OR REPLACE FUNCTION public.reset_all_bucks(p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can reset all balances';
  END IF;

  DELETE FROM public.rewards_transactions WHERE organization_id = v_actor_org;
  UPDATE public.users SET mcloones_bucks = 0, updated_at = NOW() WHERE organization_id = v_actor_org;
END; $function$;

GRANT EXECUTE ON FUNCTION public.reset_user_bucks(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_bucks(uuid)        TO anon, authenticated;
