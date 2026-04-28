-- Session 19: Game Hub leaderboard pass notification
--
-- Adds a per-user toggle for Game Hub notifications and an RPC that returns
-- the users who got passed on the FULL master leaderboard after a fresh score.

-- 1. New preference column (default ON; staff competition is opt-out).
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS game_hub_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Recreate the upsert RPC to accept the new field. Same shape as the
--    existing one — NULL params mean "leave existing value untouched".
CREATE OR REPLACE FUNCTION public.upsert_notification_preferences(
  p_user_id UUID,
  p_messages_enabled BOOLEAN DEFAULT NULL,
  p_rewards_enabled BOOLEAN DEFAULT NULL,
  p_announcements_enabled BOOLEAN DEFAULT NULL,
  p_events_enabled BOOLEAN DEFAULT NULL,
  p_special_features_enabled BOOLEAN DEFAULT NULL,
  p_custom_notifications_enabled BOOLEAN DEFAULT NULL,
  p_game_hub_enabled BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO notification_preferences (
    user_id,
    messages_enabled,
    rewards_enabled,
    announcements_enabled,
    events_enabled,
    special_features_enabled,
    custom_notifications_enabled,
    game_hub_enabled
  )
  VALUES (
    p_user_id,
    COALESCE(p_messages_enabled, TRUE),
    COALESCE(p_rewards_enabled, TRUE),
    COALESCE(p_announcements_enabled, TRUE),
    COALESCE(p_events_enabled, TRUE),
    COALESCE(p_special_features_enabled, TRUE),
    COALESCE(p_custom_notifications_enabled, TRUE),
    COALESCE(p_game_hub_enabled, TRUE)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    messages_enabled = COALESCE(p_messages_enabled, notification_preferences.messages_enabled),
    rewards_enabled = COALESCE(p_rewards_enabled, notification_preferences.rewards_enabled),
    announcements_enabled = COALESCE(p_announcements_enabled, notification_preferences.announcements_enabled),
    events_enabled = COALESCE(p_events_enabled, notification_preferences.events_enabled),
    special_features_enabled = COALESCE(p_special_features_enabled, notification_preferences.special_features_enabled),
    custom_notifications_enabled = COALESCE(p_custom_notifications_enabled, notification_preferences.custom_notifications_enabled),
    game_hub_enabled = COALESCE(p_game_hub_enabled, notification_preferences.game_hub_enabled),
    updated_at = NOW();
END;
$function$;

-- 3. RPC that returns users who got passed on the full leaderboard.
--    Call this AFTER inserting the new completed score row (game_scores or
--    word_search_scores). p_new_score is the score that was just earned.
--
--    Logic: pre-play total = current_total - p_new_score. A user got
--    "passed" if their total was strictly greater than the player's
--    pre-play total AND is now strictly less than the player's new total.
--    Filters out users who have opted out via game_hub_enabled = FALSE.
--    LEFT JOIN + COALESCE so users with no preferences row are treated as
--    opted-in (default ON behavior matches the column default).
CREATE OR REPLACE FUNCTION public.get_passed_users_on_leaderboard(
  p_user_id UUID,
  p_new_score BIGINT
)
RETURNS TABLE(user_id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_total BIGINT;
  v_old_total BIGINT;
BEGIN
  -- Compute the player's current total (post-insert).
  SELECT COALESCE(SUM(score), 0)::BIGINT INTO v_new_total
  FROM (
    SELECT gs.score FROM game_scores gs
      WHERE gs.user_id = p_user_id AND gs.completed = TRUE
    UNION ALL
    SELECT ws.score FROM word_search_scores ws
      WHERE ws.user_id = p_user_id AND ws.completed = TRUE
  ) s;

  v_old_total := v_new_total - p_new_score;

  -- Anyone whose total sits strictly between old and new totals got passed.
  RETURN QUERY
  WITH all_totals AS (
    SELECT t.user_id, SUM(t.score)::BIGINT AS total
    FROM (
      SELECT gs.user_id, gs.score FROM game_scores gs WHERE gs.completed = TRUE
      UNION ALL
      SELECT ws.user_id, ws.score FROM word_search_scores ws WHERE ws.completed = TRUE
    ) t
    GROUP BY t.user_id
  )
  SELECT at.user_id, u.name
  FROM all_totals at
  JOIN users u ON u.id = at.user_id
  LEFT JOIN notification_preferences np ON np.user_id = at.user_id
  WHERE at.user_id <> p_user_id
    AND at.total > v_old_total
    AND at.total < v_new_total
    AND COALESCE(np.game_hub_enabled, TRUE) = TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_passed_users_on_leaderboard(UUID, BIGINT) TO authenticated;
