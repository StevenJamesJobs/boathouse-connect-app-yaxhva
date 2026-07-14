-- Batch B2 (users lockdown) — additive READ RPCs.
-- These let the client read user data WITHOUT direct table SELECT, so the public SELECT policy can
-- be dropped later (Phase C). All SECURITY DEFINER, search_path pinned, EXECUTE to anon+authenticated.
-- Explicit column lists ONLY — never expose password_hash. Additive: nothing calls these yet, so
-- creating them changes no existing behavior.

-- 1. login_user — case-insensitive, constant-time-ish (always one bcrypt op), no password_hash.
CREATE OR REPLACE FUNCTION public.login_user(p_username text, p_password text)
RETURNS TABLE(
  id uuid, username text, name text, email text, phone_number text,
  job_title text, job_titles text[], role text, organization_id uuid,
  profile_picture_url text, badge_title text, mcloones_bucks integer,
  quick_tools jsonb, force_password_change boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_id   uuid;
  v_hash text;
BEGIN
  SELECT u.id, u.password_hash INTO v_id, v_hash
    FROM public.users u
   WHERE lower(u.username) = lower(p_username)
   LIMIT 1;  -- uniqueness guaranteed by users_username_lower_key

  IF v_hash IS NULL THEN
    -- Burn comparable time on a username miss to avoid an enumeration timing oracle.
    PERFORM crypt(p_password, gen_salt('bf'));
    RETURN;  -- 0 rows
  END IF;

  IF v_hash <> crypt(p_password, v_hash) THEN
    RETURN;  -- 0 rows: wrong password
  END IF;

  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = v_id;
END;
$function$;

-- 2. get_me — self fetch by id (own email/phone ok). Same shape as login_user; no password_hash.
CREATE OR REPLACE FUNCTION public.get_me(p_user_id uuid)
RETURNS TABLE(
  id uuid, username text, name text, email text, phone_number text,
  job_title text, job_titles text[], role text, organization_id uuid,
  profile_picture_url text, badge_title text, mcloones_bucks integer,
  quick_tools jsonb, force_password_change boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = p_user_id;
END;
$function$;

-- 3. get_org_directory — roster for the ACTOR'S org (org derived from actor, never a client arg).
--    email/phone/is_test_user returned ONLY to manager/owner; NULL otherwise. All members returned.
CREATE OR REPLACE FUNCTION public.get_org_directory(p_actor_id uuid)
RETURNS TABLE(
  id uuid, name text, username text, job_title text, job_titles text[], role text,
  profile_picture_url text, is_active boolean, mcloones_bucks integer, badge_title text,
  is_test_user boolean, email text, phone_number text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_actor_org  uuid;
  v_is_mgr     boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_actor_role, v_actor_org
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_org IS NULL THEN
    RETURN;  -- unknown actor → empty roster
  END IF;
  v_is_mgr := v_actor_role IN ('manager','owner');

  RETURN QUERY
    SELECT u.id, u.name, u.username, u.job_title, u.job_titles, u.role,
           u.profile_picture_url, u.is_active, u.mcloones_bucks, u.badge_title,
           CASE WHEN v_is_mgr THEN u.is_test_user  ELSE NULL END,
           CASE WHEN v_is_mgr THEN u.email         ELSE NULL END,
           CASE WHEN v_is_mgr THEN u.phone_number  ELSE NULL END
      FROM public.users u
     WHERE u.organization_id = v_actor_org;
END;
$function$;

-- 4. get_employee — full detail (incl. email/phone) for one employee; manager/owner + same-org only.
CREATE OR REPLACE FUNCTION public.get_employee(p_actor_id uuid, p_employee_id uuid)
RETURNS TABLE(
  id uuid, username text, name text, email text, phone_number text, job_title text,
  job_titles text[], role text, organization_id uuid, profile_picture_url text,
  badge_title text, mcloones_bucks integer, is_active boolean, is_test_user boolean,
  force_password_change boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_actor_org  uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_actor_role, v_actor_org
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can view employee details';
  END IF;

  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.is_active, u.is_test_user, u.force_password_change
      FROM public.users u
     WHERE u.id = p_employee_id
       AND u.organization_id = v_actor_org;  -- same-org only
END;
$function$;

-- 5. get_user_card — coworker mini-profile (no PII); same-org only. Opened by any employee.
CREATE OR REPLACE FUNCTION public.get_user_card(p_actor_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid, name text, username text, job_titles text[], job_title text,
  badge_title text, profile_picture_url text, mcloones_bucks integer, role text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_actor_org uuid;
BEGIN
  SELECT u.organization_id INTO v_actor_org
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_actor_org IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.username, u.job_titles, u.job_title, u.badge_title,
           u.profile_picture_url, u.mcloones_bucks, u.role
      FROM public.users u
     WHERE u.id = p_user_id
       AND u.organization_id = v_actor_org;  -- same-org only
END;
$function$;

-- 6. check_username_available — pre-login (anon), case-insensitive, GLOBAL (usernames are globally
--    unique, so org-scoping would misreport). Rate-limiting belongs at the edge (no caller identity
--    in-DB); tracked as a follow-up.
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users u WHERE lower(u.username) = lower(p_username)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.login_user(text, text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_me(uuid)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_directory(uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee(uuid, uuid)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_card(uuid, uuid)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text)     TO anon, authenticated;
