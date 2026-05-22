-- ============================================================================
-- Migration: Backfill McLoone's Boathouse as tenant #1
-- Phase 1A.6: Creates org, backfills all tables, inserts job titles + assistant
--             mappings, promotes owner, sets NOT NULL + indexes
-- ============================================================================

DO $$
DECLARE
  mcloones_org_id UUID;
  steven_user_id UUID := '4b661dae-985d-4ed6-98a9-8fe174b688d8';
BEGIN

  -- ── 1. Insert McLoone's organization ──────────────────────────────────────
  INSERT INTO organizations (
    name, slug, logo_url, address, city, state, zip,
    latitude, longitude, weather_location, google_maps_query,
    reward_currency_name, join_code, allow_self_signup,
    menu_count, menu_1_name, menu_2_name, default_password
  ) VALUES (
    'McLoone''s Boathouse',
    'mcloones-boathouse',
    NULL,
    '9 Cherry Lane',
    'West Orange',
    'NJ',
    '07052',
    40.7856, -74.2640,
    'West Orange, NJ',
    'McLoone''s Boathouse, 9 Cherry Lane, West Orange, NJ 07052',
    'McLoone''s Bucks',
    'MCLOONES-BH01',
    true,
    2, 'Winter', 'Summer',
    'boathouseconnect'
  )
  RETURNING id INTO mcloones_org_id;

  -- ── 2. Backfill organization_id on every table ────────────────────────────

  -- Users/Auth
  UPDATE users SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Content
  UPDATE announcements SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE menu_items SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE cocktails SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE wine_pairings SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE weekly_specials SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE libation_recipes SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE puree_syrup_recipes SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE guides_and_training SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE content_images SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE special_features SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE upcoming_events SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE events SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Messaging
  UPDATE messages SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE message_recipients SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Schedules
  UPDATE schedule_uploads SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE staff_schedules SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Notifications
  UPDATE push_tokens SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE notification_preferences SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE notification_logs SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE custom_notifications SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Games
  UPDATE game_scores SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE word_search_scores SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE picture_this_scores SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Exams
  UPDATE exams SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE exam_questions SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE exam_results SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE exam_reward_dismissals SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE quiz_notification_dismissals SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Rewards
  UPDATE rewards_transactions SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE redemption_requests SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Reviews
  UPDATE google_reviews SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE guest_reviews SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Misc
  UPDATE feedback SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE shade_dismissals SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- Checklists
  UPDATE checklist_categories SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE checklist_items SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE user_checklist_progress SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE bartender_checklist_categories SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE bartender_checklist_items SET organization_id = mcloones_org_id WHERE organization_id IS NULL;
  UPDATE user_bartender_checklist_progress SET organization_id = mcloones_org_id WHERE organization_id IS NULL;

  -- ── 3. Insert McLoone's job titles ────────────────────────────────────────
  INSERT INTO organization_job_titles (organization_id, title, display_order) VALUES
    -- Management
    (mcloones_org_id, 'Manager', 1),
    (mcloones_org_id, 'Bar Manager', 2),
    (mcloones_org_id, 'Banquet Captain', 3),
    -- Front of house — Servers
    (mcloones_org_id, 'Server', 4),
    (mcloones_org_id, 'Lead Server', 5),
    (mcloones_org_id, 'Training Server', 6),
    (mcloones_org_id, 'Banquet Server', 7),
    -- Front of house — Bar
    (mcloones_org_id, 'Bartender', 8),
    (mcloones_org_id, 'Training Bartender', 9),
    (mcloones_org_id, 'Banquet Bartender', 10),
    (mcloones_org_id, 'Barback', 11),
    -- Front of house — Support
    (mcloones_org_id, 'Host', 12),
    (mcloones_org_id, 'Busser', 13),
    (mcloones_org_id, 'Runner', 14),
    (mcloones_org_id, 'Expo', 15),
    -- Back of house
    (mcloones_org_id, 'Chef', 16),
    (mcloones_org_id, 'Cook', 17),
    (mcloones_org_id, 'Kitchen', 18),
    (mcloones_org_id, 'Dishwasher', 19);

  -- ── 4. Insert McLoone's active assistants ─────────────────────────────────
  INSERT INTO organization_assistants (organization_id, assistant_key, is_active, display_name) VALUES
    (mcloones_org_id, 'server', true, 'Server Assistant'),
    (mcloones_org_id, 'bartender', true, 'Bartender Assistant'),
    (mcloones_org_id, 'host', true, 'Host Assistant'),
    (mcloones_org_id, 'kitchen', true, 'Kitchen Assistant'),
    (mcloones_org_id, 'check_outs', true, 'Check Outs Calculator');

  -- ── 5. Insert job title → assistant mappings ──────────────────────────────
  -- Replicates current hardcoded logic from tools.tsx:46-62

  -- Server Assistant: Server, Lead Server, Manager
  INSERT INTO job_title_assistants (organization_id, job_title, assistant_key) VALUES
    (mcloones_org_id, 'Server', 'server'),
    (mcloones_org_id, 'Lead Server', 'server'),
    (mcloones_org_id, 'Manager', 'server');

  -- Bartender Assistant: Bartender, Manager, Lead Server, Banquet Captain
  INSERT INTO job_title_assistants (organization_id, job_title, assistant_key) VALUES
    (mcloones_org_id, 'Bartender', 'bartender'),
    (mcloones_org_id, 'Manager', 'bartender'),
    (mcloones_org_id, 'Lead Server', 'bartender'),
    (mcloones_org_id, 'Banquet Captain', 'bartender');

  -- Host Assistant: Host, Manager
  INSERT INTO job_title_assistants (organization_id, job_title, assistant_key) VALUES
    (mcloones_org_id, 'Host', 'host'),
    (mcloones_org_id, 'Manager', 'host');

  -- Kitchen Assistant: Busser, Chef, Kitchen, Manager, Runner
  INSERT INTO job_title_assistants (organization_id, job_title, assistant_key) VALUES
    (mcloones_org_id, 'Busser', 'kitchen'),
    (mcloones_org_id, 'Chef', 'kitchen'),
    (mcloones_org_id, 'Kitchen', 'kitchen'),
    (mcloones_org_id, 'Manager', 'kitchen'),
    (mcloones_org_id, 'Runner', 'kitchen');

  -- Check Outs Calculator: Server, Lead Server, Manager
  INSERT INTO job_title_assistants (organization_id, job_title, assistant_key) VALUES
    (mcloones_org_id, 'Server', 'check_outs'),
    (mcloones_org_id, 'Lead Server', 'check_outs'),
    (mcloones_org_id, 'Manager', 'check_outs');

  -- ── 6. Promote Steven to owner, link org ──────────────────────────────────
  UPDATE users SET role = 'owner' WHERE id = steven_user_id;
  UPDATE organizations SET owner_id = steven_user_id WHERE id = mcloones_org_id;

END $$;

-- ── 7. Set NOT NULL constraints now that all data is backfilled ──────────────

ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE announcements ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE menu_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cocktails ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE wine_pairings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE weekly_specials ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE libation_recipes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE puree_syrup_recipes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE guides_and_training ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE content_images ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE special_features ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE upcoming_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE message_recipients ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE schedule_uploads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE staff_schedules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE push_tokens ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notification_preferences ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notification_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE custom_notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE game_scores ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE word_search_scores ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE picture_this_scores ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE exams ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE exam_results ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE exam_reward_dismissals ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE quiz_notification_dismissals ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE rewards_transactions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE redemption_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE google_reviews ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE guest_reviews ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE feedback ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE shade_dismissals ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE checklist_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE checklist_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE user_checklist_progress ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE bartender_checklist_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE bartender_checklist_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE user_bartender_checklist_progress ALTER COLUMN organization_id SET NOT NULL;

-- ── 8. Create indexes for org_id on all tables ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_org_id ON announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_org_id ON menu_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_cocktails_org_id ON cocktails(organization_id);
CREATE INDEX IF NOT EXISTS idx_wine_pairings_org_id ON wine_pairings(organization_id);
CREATE INDEX IF NOT EXISTS idx_weekly_specials_org_id ON weekly_specials(organization_id);
CREATE INDEX IF NOT EXISTS idx_libation_recipes_org_id ON libation_recipes(organization_id);
CREATE INDEX IF NOT EXISTS idx_puree_syrup_recipes_org_id ON puree_syrup_recipes(organization_id);
CREATE INDEX IF NOT EXISTS idx_guides_and_training_org_id ON guides_and_training(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_images_org_id ON content_images(organization_id);
CREATE INDEX IF NOT EXISTS idx_special_features_org_id ON special_features(organization_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_events_org_id ON upcoming_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_org_id ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_org_id ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_recipients_org_id ON message_recipients(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_uploads_org_id ON schedule_uploads(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_org_id ON staff_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_org_id ON push_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_org_id ON notification_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_org_id ON notification_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_notifications_org_id ON custom_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_org_id ON game_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_word_search_scores_org_id ON word_search_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_picture_this_scores_org_id ON picture_this_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_exams_org_id ON exams(organization_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_org_id ON exam_questions(organization_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_org_id ON exam_results(organization_id);
CREATE INDEX IF NOT EXISTS idx_exam_reward_dismissals_org_id ON exam_reward_dismissals(organization_id);
CREATE INDEX IF NOT EXISTS idx_quiz_notification_dismissals_org_id ON quiz_notification_dismissals(organization_id);
CREATE INDEX IF NOT EXISTS idx_rewards_transactions_org_id ON rewards_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_org_id ON redemption_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_google_reviews_org_id ON google_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_guest_reviews_org_id ON guest_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_org_id ON feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_shade_dismissals_org_id ON shade_dismissals(organization_id);
CREATE INDEX IF NOT EXISTS idx_checklist_categories_org_id ON checklist_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_org_id ON checklist_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_checklist_progress_org_id ON user_checklist_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_bartender_checklist_categories_org_id ON bartender_checklist_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_bartender_checklist_items_org_id ON bartender_checklist_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_bartender_checklist_progress_org_id ON user_bartender_checklist_progress(organization_id);

-- ── 9. Add FK from organizations.owner_id back to users ─────────────────────
ALTER TABLE organizations
  ADD CONSTRAINT fk_organizations_owner
  FOREIGN KEY (owner_id) REFERENCES users(id);
