-- Follow-up to b2b3_notifications_rpcs, from device smoke:
--  (A) Take 2 (quiz retake) shade rows were notificationType 'custom' → get_my_notifications
--      showed them to EVERY user in the org. They must be visible only to managers/owners and the
--      cleared user. New dedicated type 'retake_granted' + a visibility case. Also migrate the
--      existing leaked rows (were 'custom' + snake_case target_user_id) to the new shape.
--  (B) The bell (WelcomeHeader) badge counted only content (announcements/features/events), so a
--      Notification-Center broadcast never bumped it. New get_unread_notification_count counts the
--      "general" bell-only notifications (broadcasts + retake grants) newer than a client cutoff;
--      the client advances the cutoff when the shade is opened. Types that already own a dedicated
--      badge (leaderboard_pass → Tools, redemption_* → approvals/Rewards) are excluded to avoid
--      double-counting.

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
              WHEN 'retake_granted'       THEN v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text
              ELSE true
            END)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT COALESCE(p_limit, 100);
END; $function$;

-- Bell badge count: the general notifications that have no other badge home.
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_actor_id uuid, p_since timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_count integer;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  SELECT count(*)::integer INTO v_count
    FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.created_at > COALESCE(p_since, '-infinity'::timestamptz)
     AND (CASE COALESCE(n.data->>'notificationType','')
            WHEN 'custom'         THEN true
            WHEN 'retake_granted' THEN v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text
            ELSE false
          END);
  RETURN COALESCE(v_count, 0);
END; $function$;

-- Repair the existing leaked Take 2 rows: 'custom'+destination weekly-quizzes+snake target_user_id
-- → 'retake_granted'+camelCase targetUserId (so they stop showing to the whole org).
UPDATE public.custom_notifications
   SET data = (data - 'target_user_id')
              || jsonb_build_object('notificationType', 'retake_granted',
                                    'targetUserId', data->>'target_user_id')
 WHERE data->>'destination' = 'weekly-quizzes'
   AND data->>'notificationType' = 'custom'
   AND data ? 'target_user_id';

GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(uuid, timestamptz) TO anon, authenticated;
