-- s62 per-recipient push localization: recipient language lives server-side.
-- Additive + reversible. NULL = never reported → senders treat as 'en'.
-- Applied live via Supabase MCP apply_migration (s62_users_preferred_language);
-- this file is the repo record.
ALTER TABLE public.users
  ADD COLUMN preferred_language text
  CHECK (preferred_language IN ('en','es'));

COMMENT ON COLUMN public.users.preferred_language IS
  's62: app-reported UI language (en/es). NULL = unknown, treated as en. Written via set_my_preferred_language on language change + login sync.';

-- Self-only write, house pattern (custom auth: p_user_id is the client-supplied
-- actor — same trust model as every other RPC; org isolation irrelevant here
-- since a user can only ever set their OWN row's language).
CREATE OR REPLACE FUNCTION public.set_my_preferred_language(p_user_id uuid, p_language text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_language IS NULL OR p_language NOT IN ('en','es') THEN
    RAISE EXCEPTION 'invalid_language';
  END IF;
  UPDATE public.users
     SET preferred_language = p_language
   WHERE id = p_user_id
     AND is_active = true
     AND preferred_language IS DISTINCT FROM p_language;
END;
$$;

-- Rollback:
--   DROP FUNCTION public.set_my_preferred_language(uuid, text);
--   ALTER TABLE public.users DROP COLUMN preferred_language;
