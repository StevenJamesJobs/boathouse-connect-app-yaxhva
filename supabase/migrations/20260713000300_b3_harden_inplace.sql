-- Batch B3 — harden the actor-carrying write RPCs IN PLACE (signature unchanged, so old clients
-- keep working; legitimate same-org calls are unaffected). Org is derived from the actor and the
-- NULL-org bypass `(p_organization_id IS NULL OR ...)` is removed. Existing owner/primary-owner
-- protections preserved. search_path pinned. Plus email validation on update_profile_info.

CREATE OR REPLACE FUNCTION public.update_employee_info(
  p_manager_id uuid, p_employee_id uuid, p_name text, p_email text, p_job_title text,
  p_phone_number text, p_role text, p_organization_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_caller_role text; v_caller_org uuid; v_caller_is_owner boolean; v_target_role text; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_caller_role, v_caller_org FROM public.users WHERE id = p_manager_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can update employee information';
  END IF;
  v_caller_is_owner := (v_caller_role = 'owner');

  SELECT role, organization_id INTO v_target_role, v_target_org FROM public.users WHERE id = p_employee_id;
  IF v_target_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Cannot modify a user in another organization';
  END IF;

  IF p_role = 'owner' AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only an owner can grant the owner role';
  END IF;
  IF v_target_role = 'owner' AND p_role <> 'owner' AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only an owner can change an owner''s role';
  END IF;
  IF public._is_org_owner(v_caller_org, p_employee_id) AND p_role <> 'owner' THEN
    RAISE EXCEPTION 'The primary owner''s role cannot be changed';
  END IF;

  UPDATE public.users
     SET name = p_name, email = p_email, job_title = p_job_title,
         phone_number = p_phone_number, role = p_role, updated_at = NOW()
   WHERE id = p_employee_id AND organization_id = v_caller_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_employee(
  p_actor_id uuid, p_employee_id uuid, p_organization_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_target_role text; v_target_org uuid;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can delete users';
  END IF;

  SELECT role, organization_id INTO v_target_role, v_target_org FROM public.users WHERE id = p_employee_id;
  IF v_target_org IS DISTINCT FROM v_actor_org THEN
    RAISE EXCEPTION 'Cannot delete a user in another organization';
  END IF;
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can delete an owner account';
  END IF;
  IF public._is_org_owner(v_actor_org, p_employee_id) THEN
    RAISE EXCEPTION 'The primary owner account cannot be deleted';
  END IF;

  DELETE FROM public.users WHERE id = p_employee_id AND organization_id = v_actor_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_transaction_and_balance(
  p_manager_id uuid, p_transaction_id uuid, p_new_amount integer, p_new_description text, p_organization_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_actor_role text; v_actor_org uuid; v_old_amount integer; v_user_id uuid; v_amount_difference integer;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org FROM public.users WHERE id = p_manager_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can update transactions';
  END IF;
  SELECT amount, user_id INTO v_old_amount, v_user_id
    FROM public.rewards_transactions
   WHERE id = p_transaction_id AND organization_id = v_actor_org;
  IF v_old_amount IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  v_amount_difference := p_new_amount - v_old_amount;
  UPDATE public.rewards_transactions
     SET amount = p_new_amount, description = p_new_description, updated_at = NOW()
   WHERE id = p_transaction_id;
  -- The ledger trigger fires only on INSERT, so keep the balance in sync on an amount edit here.
  UPDATE public.users SET mcloones_bucks = mcloones_bucks + v_amount_difference, updated_at = NOW()
   WHERE id = v_user_id;
  RETURN TRUE;
END; $function$;

-- Self-service profile edit: validate/normalize email and surface a clean error on collision
-- (email is NOT NULL + UNIQUE, so a blank or duplicate previously threw a raw 500).
CREATE OR REPLACE FUNCTION public.update_profile_info(
  user_id uuid, new_email text, new_phone_number text, p_organization_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_email text;
BEGIN
  v_email := lower(btrim(coalesce(new_email, '')));
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  UPDATE public.users SET email = v_email, phone_number = new_phone_number WHERE id = user_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That email address is already in use';
END; $function$;

-- Pure search_path pins (no body change) for the remaining DEFINER functions in scope.
ALTER FUNCTION public.update_quick_tools(uuid, jsonb, uuid)              SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.verify_password(uuid, text, uuid)                  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.signup_owner_with_org(text, text, text, text, text, text, text, text, text, text, text, text)
                                                                          SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_game_leaderboard(text, integer, text, uuid)    SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_word_search_leaderboard(text, integer, uuid)   SET search_path = public, extensions, pg_temp;
-- Old 3-arg write overloads (kept until T2) — pin them too so they stop showing as mutable.
ALTER FUNCTION public.update_user_active_status(uuid, boolean, uuid)     SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_user_job_titles(uuid, text[], uuid)         SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_user_test_flag(uuid, boolean, uuid)            SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_profile_picture(uuid, text, uuid)           SET search_path = public, extensions, pg_temp;
