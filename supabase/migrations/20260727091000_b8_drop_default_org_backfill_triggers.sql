-- B8 Item 2 (session 54, 2026-07-27): remove the set_default_organization_id
-- backfill-trigger family (the "null org -> Boathouse" hazard).
-- Applied LIVE via Supabase MCP apply_migration (b8_drop_default_org_backfill_triggers).
--
-- The function stamped McLoone's org onto any INSERT arriving with a NULL
-- organization_id, across 42 tables (events' trigger already died with that
-- table's DROP earlier today). Every one of those tables now has organization_id
-- NOT NULL, and every live write path (DEFINER RPCs org-derive; edge fns v26/v15/v2
-- set org explicitly) supplies a concrete org - so the trigger's only remaining
-- effect was to MASK a broken null-org insert by silently mis-attributing it to
-- Boathouse. With the family gone, such an insert fails loudly on the NOT NULL
-- constraint instead. Verified before this migration: all RPCs inserting into
-- these tables mention organization_id; pending_review_imports has zero null-org
-- rows; send-push-notification v26 now stamps actor-org on notification_logs.
--
-- Also repairs the damage the trigger already did: 151 notification_logs rows
-- for MyResto Test / Reading Room users were stamped with Boathouse's org
-- (send-push v25 omitted organization_id on log rows). Rows whose user no longer
-- exists cannot be re-attributed and are left as-is.
--
-- Rollback: session54_manifests/rollback_b8_triggers.sql (recreates the function
-- + all 41 triggers; the notification_logs repair is not reversed - it corrects data).

-- 1) Repair notification_logs org attribution to each recipient's real org.
UPDATE public.notification_logs nl
SET organization_id = u.organization_id
FROM public.users u
WHERE u.id = nl.user_id
  AND nl.organization_id IS DISTINCT FROM u.organization_id;

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM public.notification_logs nl
  JOIN public.users u ON u.id = nl.user_id
  WHERE nl.organization_id IS DISTINCT FROM u.organization_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'notification_logs repair incomplete: % rows still mis-attributed', bad;
  END IF;
END $$;

-- 2) Drop all 41 remaining backfill triggers.
DROP TRIGGER IF EXISTS trg_default_org_id_announcements ON public.announcements;
DROP TRIGGER IF EXISTS trg_default_org_id_menu_items ON public.menu_items;
DROP TRIGGER IF EXISTS trg_default_org_id_cocktails ON public.cocktails;
DROP TRIGGER IF EXISTS trg_default_org_id_wine_pairings ON public.wine_pairings;
DROP TRIGGER IF EXISTS trg_default_org_id_weekly_specials ON public.weekly_specials;
DROP TRIGGER IF EXISTS trg_default_org_id_libation_recipes ON public.libation_recipes;
DROP TRIGGER IF EXISTS trg_default_org_id_puree_syrup_recipes ON public.puree_syrup_recipes;
DROP TRIGGER IF EXISTS trg_default_org_id_guides_and_training ON public.guides_and_training;
DROP TRIGGER IF EXISTS trg_default_org_id_content_images ON public.content_images;
DROP TRIGGER IF EXISTS trg_default_org_id_special_features ON public.special_features;
DROP TRIGGER IF EXISTS trg_default_org_id_upcoming_events ON public.upcoming_events;
DROP TRIGGER IF EXISTS trg_default_org_id_messages ON public.messages;
DROP TRIGGER IF EXISTS trg_default_org_id_message_recipients ON public.message_recipients;
DROP TRIGGER IF EXISTS trg_default_org_id_schedule_uploads ON public.schedule_uploads;
DROP TRIGGER IF EXISTS trg_default_org_id_staff_schedules ON public.staff_schedules;
DROP TRIGGER IF EXISTS trg_default_org_id_push_tokens ON public.push_tokens;
DROP TRIGGER IF EXISTS trg_default_org_id_notification_preferences ON public.notification_preferences;
DROP TRIGGER IF EXISTS trg_default_org_id_notification_logs ON public.notification_logs;
DROP TRIGGER IF EXISTS trg_default_org_id_custom_notifications ON public.custom_notifications;
DROP TRIGGER IF EXISTS trg_default_org_id_game_scores ON public.game_scores;
DROP TRIGGER IF EXISTS trg_default_org_id_word_search_scores ON public.word_search_scores;
DROP TRIGGER IF EXISTS trg_default_org_id_picture_this_scores ON public.picture_this_scores;
DROP TRIGGER IF EXISTS trg_default_org_id_exams ON public.exams;
DROP TRIGGER IF EXISTS trg_default_org_id_exam_questions ON public.exam_questions;
DROP TRIGGER IF EXISTS trg_default_org_id_exam_results ON public.exam_results;
DROP TRIGGER IF EXISTS trg_default_org_id_exam_reward_dismissals ON public.exam_reward_dismissals;
DROP TRIGGER IF EXISTS trg_default_org_id_quiz_notification_dismissals ON public.quiz_notification_dismissals;
DROP TRIGGER IF EXISTS trg_default_org_id_rewards_transactions ON public.rewards_transactions;
DROP TRIGGER IF EXISTS trg_default_org_id_redemption_requests ON public.redemption_requests;
DROP TRIGGER IF EXISTS trg_default_org_id_google_reviews ON public.google_reviews;
DROP TRIGGER IF EXISTS trg_default_org_id_guest_reviews ON public.guest_reviews;
DROP TRIGGER IF EXISTS trg_default_org_id_feedback ON public.feedback;
DROP TRIGGER IF EXISTS trg_default_org_id_shade_dismissals ON public.shade_dismissals;
DROP TRIGGER IF EXISTS trg_default_org_id_checklist_categories ON public.checklist_categories;
DROP TRIGGER IF EXISTS trg_default_org_id_checklist_items ON public.checklist_items;
DROP TRIGGER IF EXISTS trg_default_org_id_user_checklist_progress ON public.user_checklist_progress;
DROP TRIGGER IF EXISTS trg_default_org_id_bartender_checklist_categories ON public.bartender_checklist_categories;
DROP TRIGGER IF EXISTS trg_default_org_id_bartender_checklist_items ON public.bartender_checklist_items;
DROP TRIGGER IF EXISTS trg_default_org_id_user_bartender_checklist_progress ON public.user_bartender_checklist_progress;
DROP TRIGGER IF EXISTS trg_default_org_id_summer_libation_recipes ON public.summer_libation_recipes;
DROP TRIGGER IF EXISTS trg_default_org_id_signature_recipes ON public.signature_recipes;

-- 3) Drop the function. This is also the completeness check: if ANY trigger
--    still referenced it, this DROP would error and roll back the migration.
DROP FUNCTION public.set_default_organization_id();
