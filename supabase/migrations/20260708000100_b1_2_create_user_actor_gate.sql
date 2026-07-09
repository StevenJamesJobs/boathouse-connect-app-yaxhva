-- Batch B1.2 — create_user: stop anon from minting an owner [Critical]
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708224001).
-- With an actor, the actor must be a manager/owner of the SAME org, and only owners may
-- create managers/owners. With no actor (self-signup) the role is forced to 'employee'.
DROP FUNCTION IF EXISTS public.create_user(text, text, text, text, text, text, text, uuid);

CREATE FUNCTION public.create_user(
  p_username text,
  p_name text,
  p_email text,
  p_job_title text,
  p_phone_number text,
  p_role text,
  p_password text DEFAULT 'changeme',
  p_organization_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  new_user_id  uuid;
  v_actor_role text;
  v_actor_org  uuid;
  v_role       text := p_role;
BEGIN
  IF p_actor_id IS NOT NULL THEN
    SELECT role, organization_id INTO v_actor_role, v_actor_org
      FROM public.users WHERE id = p_actor_id;
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
      RAISE EXCEPTION 'Only managers or owners can create users';
    END IF;
    IF v_actor_org IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'Cannot create a user in another organization';
    END IF;
    IF v_role IN ('manager','owner') AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only an owner can create a manager or owner';
    END IF;
  ELSE
    v_role := 'employee';
  END IF;

  INSERT INTO public.users
    (username, name, email, job_title, phone_number, role, password_hash, is_active, organization_id)
  VALUES
    (p_username, p_name, p_email, p_job_title, p_phone_number, v_role,
     crypt(p_password, gen_salt('bf')), true, p_organization_id)
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$function$;
