-- B2/B3 notifications lockdown: custom_notifications, notification_preferences
--
-- Before this migration:
--   custom_notifications — "Everyone can view custom notifications" (SELECT USING true: every
--   org's shade rows world-readable, incl. redemption decisions), "Managers can delete custom
--   notifications" (DELETE USING true: world-delete), "Managers can insert custom notifications"
--   (INSERT check: sent_by's role = 'manager' EXACTLY — so OWNER broadcasts/decision rows/"Take 2"
--   logs and the EMPLOYEE redemption-request row all failed 42501 into swallowed catches: those
--   in-app shade writes have been silently dead). No UPDATE policy (client never updates).
--   Two client selects (manager-approvals decide, useUnreadAwards clear) had NO org filter at all.
--   notification_preferences — "Users can manage their own notification preferences" (ALL,
--   auth.uid()-based → never matches under custom auth): direct reads always returned EMPTY, so
--   saved preferences never displayed back (the screen fell back to all-enabled defaults); writes
--   only ever worked via the DEFINER upsert_notification_preferences, which trusted a
--   client-supplied p_organization_id (NULL → the default-org trigger backfills BOATHOUSE).
--
-- This migration is ADDITIVE (one in-place hardening) — no policies dropped. Teardown list:
--   custom_notifications: "Everyone can view custom notifications" (SELECT), "Managers can
--     insert custom notifications" (INSERT), "Managers can delete custom notifications" (DELETE)
--   notification_preferences: "Users can manage their own notification preferences" (ALL)
-- Realtime: covered by the publication-empty finding (all postgres_changes subs already inert).
--
-- Intentional behavior deltas (all restore silently-dead features):
--   * owners can now create shade rows everywhere managers could;
--   * the employee redemption-request shade row now actually lands (managers see it in the bell);
--   * saved notification preferences now display back.
-- get_my_notifications enforces the dropdown's client-side visibility matrix SERVER-side
-- (content-mirror types skipped; redemption_requested = manager/owner only;
-- redemption_decision / leaderboard_pass = data.targetUserId match — for every role, matching the
-- client loop). The client loop keeps its checks (harmless double-filter).

-- ============================================================================
-- READ RPCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_actor_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, title text, body text, created_at timestamptz, data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.created_at, n.data
      FROM public.custom_notifications n
     WHERE n.organization_id = v_org
       AND COALESCE(n.data->>'notificationType','')
           NOT IN ('announcement','special_feature','event','weekly_special')
       AND (CASE COALESCE(n.data->>'notificationType','')
              WHEN 'redemption_requested' THEN v_role IN ('manager','owner')
              WHEN 'redemption_decision'  THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'leaderboard_pass'     THEN n.data->>'targetUserId' = p_actor_id::text
              ELSE true
            END)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT COALESCE(p_limit, 100);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences(p_actor_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, messages_enabled boolean, rewards_enabled boolean,
  announcements_enabled boolean, events_enabled boolean, special_features_enabled boolean,
  custom_notifications_enabled boolean, quiz_notifications_enabled boolean,
  game_hub_enabled boolean, created_at timestamptz, updated_at timestamptz, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT np.id, np.user_id, np.messages_enabled, np.rewards_enabled,
           np.announcements_enabled, np.events_enabled, np.special_features_enabled,
           np.custom_notifications_enabled, np.quiz_notifications_enabled,
           np.game_hub_enabled, np.created_at, np.updated_at, np.organization_id
      FROM public.notification_preferences np
     WHERE np.user_id = p_actor_id;
END; $function$;

-- ============================================================================
-- WRITE RPCS
-- ============================================================================

-- All four client insert sites route here. Managers/owners may create any shade row; an
-- EMPLOYEE may create only their own redemption-request row (data.notificationType =
-- 'redemption_requested' with data.requesterId = themselves) — the redeem flow.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_actor_id uuid, p_title text, p_body text, p_data jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF COALESCE(btrim(p_title),'') = '' OR COALESCE(btrim(p_body),'') = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;
  IF v_role NOT IN ('manager','owner')
     AND NOT (COALESCE(p_data->>'notificationType','') = 'redemption_requested'
              AND p_data->>'requesterId' = p_actor_id::text) THEN
    RAISE EXCEPTION 'Only managers or owners can send notifications';
  END IF;
  INSERT INTO public.custom_notifications (title, body, sent_by, organization_id, data)
  VALUES (p_title, p_body, p_actor_id, v_org, p_data)
  RETURNING custom_notifications.id INTO v_id;
  RETURN v_id;
END; $function$;

-- manager-approvals decide(): clears the org-wide "redemption_requested" shade rows for one
-- request (replaces the unfiltered select + client-side filter + delete-by-ids round trip).
CREATE OR REPLACE FUNCTION public.clear_redemption_request_notifications(p_actor_id uuid, p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can clear request notifications';
  END IF;
  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' = 'redemption_requested'
     AND n.data->>'requestId' = p_request_id::text;
END; $function$;

-- useUnreadAwards markRecentViewed (employee branch): drops the caller's own
-- redemption_decision rows (replaces the org-unfiltered select + delete-by-ids).
CREATE OR REPLACE FUNCTION public.clear_my_decision_notifications(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  DELETE FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.data->>'notificationType' = 'redemption_decision'
     AND n.data->>'targetUserId' = p_actor_id::text;
END; $function$;

-- NotificationDropdown decision-tap: single-row delete. Permitted when the row targets the
-- actor (data.targetUserId) or the actor is manager/owner; otherwise a silent 0-row no-op
-- (the client call is fire-and-forget).
CREATE OR REPLACE FUNCTION public.delete_notification(p_actor_id uuid, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  DELETE FROM public.custom_notifications n
   WHERE n.id = p_id
     AND n.organization_id = v_org
     AND (v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text);
END; $function$;

-- In-place hardening (same name/args — old clients keep working): org is now DERIVED from
-- p_user_id's users row; a non-NULL p_organization_id must match or the call RAISEs; the row is
-- written with the derived org (the NULL→default-org trigger backfill can no longer misfile a
-- preferences row under the Boathouse org). search_path pinned to the house value.
CREATE OR REPLACE FUNCTION public.upsert_notification_preferences(
  p_user_id uuid,
  p_messages_enabled boolean DEFAULT NULL,
  p_rewards_enabled boolean DEFAULT NULL,
  p_announcements_enabled boolean DEFAULT NULL,
  p_events_enabled boolean DEFAULT NULL,
  p_special_features_enabled boolean DEFAULT NULL,
  p_custom_notifications_enabled boolean DEFAULT NULL,
  p_game_hub_enabled boolean DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid user'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  INSERT INTO notification_preferences (user_id, messages_enabled, rewards_enabled, announcements_enabled, events_enabled, special_features_enabled, custom_notifications_enabled, game_hub_enabled, organization_id)
  VALUES (p_user_id, COALESCE(p_messages_enabled, TRUE), COALESCE(p_rewards_enabled, TRUE), COALESCE(p_announcements_enabled, TRUE), COALESCE(p_events_enabled, TRUE), COALESCE(p_special_features_enabled, TRUE), COALESCE(p_custom_notifications_enabled, TRUE), COALESCE(p_game_hub_enabled, TRUE), v_org)
  ON CONFLICT (user_id) DO UPDATE SET messages_enabled = COALESCE(p_messages_enabled, notification_preferences.messages_enabled), rewards_enabled = COALESCE(p_rewards_enabled, notification_preferences.rewards_enabled), announcements_enabled = COALESCE(p_announcements_enabled, notification_preferences.announcements_enabled), events_enabled = COALESCE(p_events_enabled, notification_preferences.events_enabled), special_features_enabled = COALESCE(p_special_features_enabled, notification_preferences.special_features_enabled), custom_notifications_enabled = COALESCE(p_custom_notifications_enabled, notification_preferences.custom_notifications_enabled), game_hub_enabled = COALESCE(p_game_hub_enabled, notification_preferences.game_hub_enabled), updated_at = NOW();
END; $function$;

-- ============================================================================
-- Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_notifications(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_redemption_request_notifications(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_decision_notifications(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_notification(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_notification_preferences(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, uuid) TO anon, authenticated;
