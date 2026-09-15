-- s84 · Profile hub: a one-line tagline on the user row, editable from the Your profile sheet,
-- read by the identity card and the mini profile card. Additive; the old 4-arg update_profile_info
-- signature is replaced by a 5-arg one whose trailing parameter defaults, so existing callers keep working.
-- Applied via the Supabase MCP on 2026-09-15 (migration name s84_profile_tagline).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tagline_len;
ALTER TABLE public.users ADD CONSTRAINT users_tagline_len CHECK (tagline IS NULL OR char_length(tagline) <= 60);

DROP FUNCTION IF EXISTS public.update_profile_info(uuid, text, text, uuid);
CREATE FUNCTION public.update_profile_info(
  user_id uuid,
  new_email text,
  new_phone_number text,
  p_organization_id uuid DEFAULT NULL,
  p_tagline text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_email text;
  v_tag text;
BEGIN
  v_email := lower(btrim(coalesce(new_email, '')));
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  IF p_tagline IS NOT NULL THEN
    -- '' clears the tagline; NULL means "not provided" (old clients never send it).
    v_tag := nullif(btrim(p_tagline), '');
    IF v_tag IS NOT NULL AND char_length(v_tag) > 60 THEN
      RAISE EXCEPTION 'Tagline must be 60 characters or fewer';
    END IF;
    UPDATE public.users SET email = v_email, phone_number = new_phone_number, tagline = v_tag WHERE id = user_id;
  ELSE
    UPDATE public.users SET email = v_email, phone_number = new_phone_number WHERE id = user_id;
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That email address is already in use';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.update_profile_info(uuid, text, text, uuid, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_user_card(uuid, uuid);
CREATE FUNCTION public.get_user_card(p_actor_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid, name text, username text, job_titles text[], job_title text, badge_title text,
  profile_picture_url text, mcloones_bucks integer, role text, tagline text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
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
           u.profile_picture_url, u.mcloones_bucks, u.role, u.tagline
      FROM public.users u
     WHERE u.id = p_user_id
       AND u.organization_id = v_actor_org;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_user_card(uuid, uuid) TO anon, authenticated, service_role;
