-- B8 — get_me now excludes deactivated accounts (Steve-approved scope decision 1).
--
-- login_user already refuses inactive users, but a REMEMBERED session refreshed via
-- get_me survived deactivation forever (get_me had no is_active filter). With the B8
-- revalidation machinery (restore-retry + foreground revalidate), a deactivated user's
-- session now ends (get_me returns 0 rows → not_found → logout) within about a minute
-- of their next app use — deactivation semantics finally match login.
--
-- NULL is_active (legacy rows; the column defaults true) still counts as ACTIVE — only
-- an explicit false blocks. The four non-auth get_me call sites (org bootstrap + three
-- balance reads) degrade to empty results for an inactive user mid-session, which is
-- moot since the session ends on the next revalidation anyway.
--
-- Rollback: re-apply the prior definition without the COALESCE(u.is_active, true) term.

CREATE OR REPLACE FUNCTION public.get_me(p_user_id uuid)
 RETURNS TABLE(id uuid, username text, name text, email text, phone_number text, job_title text, job_titles text[], role text, organization_id uuid, profile_picture_url text, badge_title text, mcloones_bucks integer, quick_tools jsonb, force_password_change boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
    SELECT u.id, u.username, u.name, u.email, u.phone_number, u.job_title, u.job_titles,
           u.role, u.organization_id, u.profile_picture_url, u.badge_title, u.mcloones_bucks,
           u.quick_tools, u.force_password_change
      FROM public.users u
     WHERE u.id = p_user_id
       AND COALESCE(u.is_active, true);
END;
$function$;
