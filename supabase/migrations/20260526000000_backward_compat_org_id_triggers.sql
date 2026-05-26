-- ============================================================================
-- Migration: Backward-compatibility triggers for organization_id
--
-- The current live McLoone's app does not pass p_organization_id to RPCs.
-- These BEFORE INSERT triggers fill in the McLoone's org ID automatically
-- when organization_id is NULL, so the live app keeps working after the
-- multi-tenant RPCs are deployed.
--
-- Safe to remove once all app builds pass organization_id on every call.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_default_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := (SELECT id FROM organizations WHERE slug = 'mcloones-boathouse');
  END IF;
  RETURN NEW;
END;
$$;

-- Users/Auth
CREATE TRIGGER trg_default_org_id_users
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Content
CREATE TRIGGER trg_default_org_id_announcements
  BEFORE INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_menu_items
  BEFORE INSERT ON menu_items FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_cocktails
  BEFORE INSERT ON cocktails FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_wine_pairings
  BEFORE INSERT ON wine_pairings FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_weekly_specials
  BEFORE INSERT ON weekly_specials FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_libation_recipes
  BEFORE INSERT ON libation_recipes FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_puree_syrup_recipes
  BEFORE INSERT ON puree_syrup_recipes FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_guides_and_training
  BEFORE INSERT ON guides_and_training FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_content_images
  BEFORE INSERT ON content_images FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_special_features
  BEFORE INSERT ON special_features FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_upcoming_events
  BEFORE INSERT ON upcoming_events FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_events
  BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Messaging
CREATE TRIGGER trg_default_org_id_messages
  BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_message_recipients
  BEFORE INSERT ON message_recipients FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Schedules
CREATE TRIGGER trg_default_org_id_schedule_uploads
  BEFORE INSERT ON schedule_uploads FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_staff_schedules
  BEFORE INSERT ON staff_schedules FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Notifications
CREATE TRIGGER trg_default_org_id_push_tokens
  BEFORE INSERT ON push_tokens FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_notification_preferences
  BEFORE INSERT ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_notification_logs
  BEFORE INSERT ON notification_logs FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_custom_notifications
  BEFORE INSERT ON custom_notifications FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Games
CREATE TRIGGER trg_default_org_id_game_scores
  BEFORE INSERT ON game_scores FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_word_search_scores
  BEFORE INSERT ON word_search_scores FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_picture_this_scores
  BEFORE INSERT ON picture_this_scores FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Exams
CREATE TRIGGER trg_default_org_id_exams
  BEFORE INSERT ON exams FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_exam_questions
  BEFORE INSERT ON exam_questions FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_exam_results
  BEFORE INSERT ON exam_results FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_exam_reward_dismissals
  BEFORE INSERT ON exam_reward_dismissals FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_quiz_notification_dismissals
  BEFORE INSERT ON quiz_notification_dismissals FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Rewards
CREATE TRIGGER trg_default_org_id_rewards_transactions
  BEFORE INSERT ON rewards_transactions FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_redemption_requests
  BEFORE INSERT ON redemption_requests FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Reviews
CREATE TRIGGER trg_default_org_id_google_reviews
  BEFORE INSERT ON google_reviews FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_guest_reviews
  BEFORE INSERT ON guest_reviews FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Misc
CREATE TRIGGER trg_default_org_id_feedback
  BEFORE INSERT ON feedback FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_shade_dismissals
  BEFORE INSERT ON shade_dismissals FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- Checklists
CREATE TRIGGER trg_default_org_id_checklist_categories
  BEFORE INSERT ON checklist_categories FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_checklist_items
  BEFORE INSERT ON checklist_items FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_user_checklist_progress
  BEFORE INSERT ON user_checklist_progress FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_bartender_checklist_categories
  BEFORE INSERT ON bartender_checklist_categories FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_bartender_checklist_items
  BEFORE INSERT ON bartender_checklist_items FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
CREATE TRIGGER trg_default_org_id_user_bartender_checklist_progress
  BEFORE INSERT ON user_bartender_checklist_progress FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();
