-- B2/B3 follow-up: notification_preferences.organization_id was misfiled for every
-- non-Boathouse user.
--
-- Root cause chain (found during the b2b3_notifications_rpcs rehearsal):
--   users AFTER INSERT trigger `trigger_create_notification_preferences` →
--   create_default_notification_preferences() INSERTs (user_id) ONLY →
--   trg_default_org_id_notification_preferences backfills organization_id = the BOATHOUSE org.
-- Result: all 64 prefs rows were labeled MB Connect; 9 belonged to users of other orgs
-- (5 MyResto Test, 2 Belmont Tavern, 1 Keva Homes, 1 Reading Room). Nothing currently reads
-- prefs by organization_id (reads key on user_id), so this was latent — but any future
-- org-scoped query would silently mis-scope. Reversal note: every repaired row's prior value
-- was the Boathouse org id (7f9a6397-135a-40c2-849d-6109ef93f6a6).
--
-- Three fixes:
--   1. Trigger fn writes the new user's org explicitly (degenerate NULL-org users keep the
--      old backfill behavior — real users always carry an org).
--   2. upsert_notification_preferences' conflict-UPDATE self-heals organization_id on any write
--      (the freshly hardened version already derives it for the INSERT arm).
--   3. One-time repair of the 9 misfiled rows.

CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  INSERT INTO notification_preferences (user_id, organization_id)
  VALUES (NEW.id, NEW.organization_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

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
  ON CONFLICT (user_id) DO UPDATE SET messages_enabled = COALESCE(p_messages_enabled, notification_preferences.messages_enabled), rewards_enabled = COALESCE(p_rewards_enabled, notification_preferences.rewards_enabled), announcements_enabled = COALESCE(p_announcements_enabled, notification_preferences.announcements_enabled), events_enabled = COALESCE(p_events_enabled, notification_preferences.events_enabled), special_features_enabled = COALESCE(p_special_features_enabled, notification_preferences.special_features_enabled), custom_notifications_enabled = COALESCE(p_custom_notifications_enabled, notification_preferences.custom_notifications_enabled), game_hub_enabled = COALESCE(p_game_hub_enabled, notification_preferences.game_hub_enabled), organization_id = EXCLUDED.organization_id, updated_at = NOW();
END; $function$;

-- One-time repair of the misfiled rows (expected: 9).
UPDATE notification_preferences np
   SET organization_id = u.organization_id
  FROM users u
 WHERE u.id = np.user_id
   AND u.organization_id IS NOT NULL
   AND np.organization_id <> u.organization_id;
