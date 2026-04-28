-- Session 19 follow-up: Badge plumbing for leaderboard-pass notifications
--
-- Tracks per-user "last viewed master leaderboard" timestamp on the users
-- table so unread counts work across devices and reinstalls. The
-- custom_notifications table itself is the source of truth for the shade
-- entries; this column just gates the unread cutoff.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS leaderboard_last_viewed_at TIMESTAMPTZ;

-- Marks the master leaderboard as viewed for the current user (clears badge).
-- SECURITY DEFINER so it can update the users row regardless of RLS.
CREATE OR REPLACE FUNCTION public.mark_leaderboard_viewed()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE users SET leaderboard_last_viewed_at = NOW() WHERE id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_leaderboard_viewed() TO authenticated;

-- Returns the count of leaderboard-pass shade entries for the current user
-- that landed AFTER they last viewed the leaderboard. NULL last-viewed
-- means "never viewed" → all entries count.
CREATE OR REPLACE FUNCTION public.get_unread_leaderboard_pass_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_viewed TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT leaderboard_last_viewed_at INTO v_last_viewed
    FROM users WHERE id = auth.uid();

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM custom_notifications cn
  WHERE cn.data->>'notificationType' = 'leaderboard_pass'
    AND cn.data->>'targetUserId' = auth.uid()::TEXT
    AND (v_last_viewed IS NULL OR cn.created_at > v_last_viewed);

  RETURN COALESCE(v_count, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unread_leaderboard_pass_count() TO authenticated;
