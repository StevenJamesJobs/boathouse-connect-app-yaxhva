-- ============================================================================
-- Migration: Add organization_id to ALL existing tables
-- Phase 1A.5: Columns added as NULLABLE first; backfill migration sets NOT NULL
-- ============================================================================

-- Users/Auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Content
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE cocktails ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE wine_pairings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE weekly_specials ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE libation_recipes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE puree_syrup_recipes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE guides_and_training ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE content_images ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE special_features ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Messaging
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE message_recipients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Schedules
ALTER TABLE schedule_uploads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Notifications
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE custom_notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Games
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE word_search_scores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE picture_this_scores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE exam_reward_dismissals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE quiz_notification_dismissals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Rewards
ALTER TABLE rewards_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE redemption_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Reviews
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Misc
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE shade_dismissals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Checklists
ALTER TABLE checklist_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE user_checklist_progress ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bartender_checklist_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bartender_checklist_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE user_bartender_checklist_progress ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Force password change flag for manager-created accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;
