-- Owner-account protection: managers can't demote/lock out or hijack the owner.
-- Owner identity: users.role='owner' (supports multiple owners); the PRIMARY owner
-- is organizations.owner_id (reuse public._is_org_owner). App uses anon custom auth,
-- so all gating relies on a passed actor user-id.

-- 1) update_employee_info: add owner-role guards ---------------------------------
DROP FUNCTION IF EXISTS public.update_employee_info(uuid, uuid, text, text, text, text, text, uuid);

CREATE FUNCTION public.update_employee_info(
  p_manager_id uuid,
  p_employee_id uuid,
  p_name text,
  p_email text,
  p_job_title text,
  p_phone_number text,
  p_role text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role text;
  v_caller_is_owner boolean;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = p_manager_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update employee information';
  END IF;
  v_caller_is_owner := (v_caller_role = 'owner');

  SELECT role INTO v_target_role FROM users WHERE id = p_employee_id;

  -- Only an owner can grant the owner role.
  IF p_role = 'owner' AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only an owner can grant the owner role';
  END IF;

  -- Managers cannot change an existing owner's role.
  IF v_target_role = 'owner' AND p_role <> 'owner' AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only an owner can change an owner''s role';
  END IF;

  -- The primary owner can never be demoted (prevents org lockout).
  IF public._is_org_owner(p_organization_id, p_employee_id) AND p_role <> 'owner' THEN
    RAISE EXCEPTION 'The primary owner''s role cannot be changed';
  END IF;

  UPDATE users
  SET name = p_name, email = p_email, job_title = p_job_title,
      phone_number = p_phone_number, role = p_role, updated_at = NOW()
  WHERE id = p_employee_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_employee_info(uuid,uuid,text,text,text,text,text,uuid) TO anon, authenticated;

-- 2) update_password: add actor + owner guard (self-service still allowed) --------
DROP FUNCTION IF EXISTS public.update_password(uuid, text, uuid);

CREATE FUNCTION public.update_password(
  user_id uuid,
  new_password text,
  p_actor_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_actor_role text;
  v_target_role text;
BEGIN
  -- Self-service password change is always allowed (actor not provided, or self).
  IF p_actor_id IS NULL OR p_actor_id = user_id THEN
    UPDATE public.users SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = now()
    WHERE id = user_id;
    RETURN;
  END IF;

  SELECT role INTO v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can reset another user''s password';
  END IF;

  SELECT role INTO v_target_role FROM users WHERE id = user_id;
  -- Managers cannot reset an owner's password; only an owner can.
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can reset an owner''s password';
  END IF;

  UPDATE public.users SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = now()
  WHERE id = user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_password(uuid,text,uuid,uuid) TO anon, authenticated;

-- 3) delete_employee: gated deletion, owner-protected ----------------------------
CREATE OR REPLACE FUNCTION public.delete_employee(
  p_actor_id uuid,
  p_employee_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_actor_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can delete users';
  END IF;

  SELECT role INTO v_target_role FROM users WHERE id = p_employee_id;

  -- Managers cannot delete an owner; only an owner can.
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can delete an owner account';
  END IF;

  -- The primary owner can never be deleted here.
  IF public._is_org_owner(p_organization_id, p_employee_id) THEN
    RAISE EXCEPTION 'The primary owner account cannot be deleted';
  END IF;

  DELETE FROM users
  WHERE id = p_employee_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_employee(uuid,uuid,uuid) TO anon, authenticated;
