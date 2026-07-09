-- Batch B1.1 — update_password: close anonymous account takeover [Critical]
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708223832).
-- Self-service password change now requires proof of the current password (crypt-verified).
DROP FUNCTION IF EXISTS public.update_password(uuid, text, uuid, uuid);

CREATE FUNCTION public.update_password(
  user_id uuid,
  new_password text,
  p_actor_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_current_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_actor_role  text;
  v_target_role text;
  v_stored_hash text;
BEGIN
  -- SELF-SERVICE: a user changing their OWN password must prove they know it.
  IF p_actor_id IS NULL OR p_actor_id = user_id THEN
    SELECT password_hash INTO v_stored_hash FROM public.users WHERE id = user_id;
    IF v_stored_hash IS NULL
       OR p_current_password IS NULL
       OR v_stored_hash <> crypt(p_current_password, v_stored_hash) THEN
      RAISE EXCEPTION 'Current password is incorrect';
    END IF;
    UPDATE public.users
       SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = now()
     WHERE id = user_id;
    RETURN;
  END IF;

  -- MANAGER/OWNER resetting ANOTHER user's password (authorization unchanged).
  SELECT role INTO v_actor_role FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can reset another user''s password';
  END IF;

  SELECT role INTO v_target_role FROM public.users WHERE id = user_id;
  IF v_target_role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can reset an owner''s password';
  END IF;

  UPDATE public.users
     SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = now()
   WHERE id = user_id;
END;
$function$;
