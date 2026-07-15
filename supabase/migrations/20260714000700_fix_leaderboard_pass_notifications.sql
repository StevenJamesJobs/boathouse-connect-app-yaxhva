-- Bug fix (found in device testing) — the leaderboard-pass in-app notification feature was dead
-- three independent ways, all pre-existing:
--   1. The client shade-row INSERT into custom_notifications omitted the NOT NULL organization_id
--      AND the table's INSERT policy is manager-only (checks sent_by's role), so an employee who
--      passed someone got 42501 "violates row-level security". The push fired (edge function,
--      service role) but the in-app dropdown row + badge never got written — for anyone.
--   2. get_unread_leaderboard_pass_count() filtered on auth.uid(), which is ALWAYS NULL in this
--      app's custom username/password auth, so the unread badge was permanently 0.
--   3. mark_leaderboard_viewed() also keyed on auth.uid() (no-op), and the client even called it
--      with a p_organization_id arg the no-arg function never accepted.
-- All three fixes are ADDITIVE: a new DEFINER insert RPC, and p_user_id OVERLOADS of the count/
-- mark functions (the old auth.uid() signatures are left in place, harmlessly, for old clients).
-- The DEFINER insert bypasses the manager-only RLS (these are system-generated, not manager-
-- composed) and derives organization_id from the actor; recipients are same-org only.

CREATE OR REPLACE FUNCTION public.add_leaderboard_pass_notifications(
  p_actor_id uuid, p_recipient_ids uuid[], p_title text, p_body text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_count int;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF btrim(COALESCE(p_title, '')) = '' OR btrim(COALESCE(p_body, '')) = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;

  -- One shade row per SAME-ORG recipient; data shape mirrors the old client insert exactly
  -- (NotificationDropdown filters leaderboard_pass rows by data->>'targetUserId').
  INSERT INTO public.custom_notifications (organization_id, sent_by, title, body, data)
  SELECT v_org, p_actor_id, p_title, p_body,
         jsonb_build_object(
           'type', 'custom',
           'notificationType', 'leaderboard_pass',
           'destination', 'master-leaderboard',
           'targetUserId', r.rid)
    FROM unnest(p_recipient_ids) AS r(rid)
    JOIN public.users u ON u.id = r.rid AND u.organization_id = v_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $function$;

-- p_user_id overload — the count keyed off the passed user, not auth.uid().
CREATE OR REPLACE FUNCTION public.get_unread_leaderboard_pass_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_last_viewed timestamptz; v_count integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  SELECT leaderboard_last_viewed_at INTO v_last_viewed FROM public.users WHERE id = p_user_id;
  SELECT count(*)::integer INTO v_count
    FROM public.custom_notifications cn
   WHERE cn.data->>'notificationType' = 'leaderboard_pass'
     AND cn.data->>'targetUserId' = p_user_id::text
     AND (v_last_viewed IS NULL OR cn.created_at > v_last_viewed);
  RETURN COALESCE(v_count, 0);
END; $function$;

-- p_user_id overload — stamp the viewed time for the passed user.
CREATE OR REPLACE FUNCTION public.mark_leaderboard_viewed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  UPDATE public.users SET leaderboard_last_viewed_at = now() WHERE id = p_user_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.add_leaderboard_pass_notifications(uuid, uuid[], text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_leaderboard_pass_count(uuid)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_leaderboard_viewed(uuid)                                 TO anon, authenticated;
