-- ============================================================
-- Migration: Add p_organization_id to all RPC functions
-- Part of MyResto Connect Phase 1 (multi-tenant foundation)
--
-- Strategy:
--   1. Drop stale overloads (functions accumulated multiple signatures over time)
--   2. Recreate each function with p_organization_id UUID DEFAULT NULL
--   3. Include organization_id in every INSERT
--   4. Filter by organization_id in SELECT/UPDATE/DELETE where applicable
--   5. Update role checks: 'manager' → IN ('manager','owner')
-- ============================================================

-- ============================================================
-- SECTION 1: Drop all stale overloads
-- ============================================================

-- create_announcement overloads (keep none — we recreate fresh)
DROP FUNCTION IF EXISTS public.create_announcement(uuid,text,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.create_announcement(uuid,text,text,text,text,text,text,integer,text);
DROP FUNCTION IF EXISTS public.create_announcement(uuid,text,text,text,text,text,text,integer,text,uuid);

-- update_announcement overloads
DROP FUNCTION IF EXISTS public.update_announcement(uuid,uuid,text,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.update_announcement(uuid,uuid,text,text,text,text,text,text,integer,text);
DROP FUNCTION IF EXISTS public.update_announcement(uuid,uuid,text,text,text,text,text,text,integer,text,uuid);

-- create_special_feature overloads
DROP FUNCTION IF EXISTS public.create_special_feature(uuid,text,text,text,text,timestamptz,timestamptz,integer);
DROP FUNCTION IF EXISTS public.create_special_feature(uuid,text,text,text,text,timestamptz,timestamptz,integer,text);
DROP FUNCTION IF EXISTS public.create_special_feature(uuid,text,text,text,text,timestamptz,timestamptz,integer,text,uuid);

-- update_special_feature overloads
DROP FUNCTION IF EXISTS public.update_special_feature(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer);
DROP FUNCTION IF EXISTS public.update_special_feature(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,text);
DROP FUNCTION IF EXISTS public.update_special_feature(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,text,uuid);

-- create_menu_item overloads
DROP FUNCTION IF EXISTS public.create_menu_item(uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer);
DROP FUNCTION IF EXISTS public.create_menu_item(uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text);
DROP FUNCTION IF EXISTS public.create_menu_item(uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.create_menu_item(uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text,text,text,text,text,text);

-- update_menu_item overloads
DROP FUNCTION IF EXISTS public.update_menu_item(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer);
DROP FUNCTION IF EXISTS public.update_menu_item(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text);
DROP FUNCTION IF EXISTS public.update_menu_item(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.update_menu_item(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,text,integer,text,text,text,text,text,text,text,text,text);

-- update_menu_item_translations overloads
DROP FUNCTION IF EXISTS public.update_menu_item_translations(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_menu_item_translations(uuid,text,text,text);

-- upsert_notification_preferences overloads
DROP FUNCTION IF EXISTS public.upsert_notification_preferences(uuid,boolean,boolean,boolean,boolean,boolean,boolean);
DROP FUNCTION IF EXISTS public.upsert_notification_preferences(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean);

-- get_game_leaderboard overloads
DROP FUNCTION IF EXISTS public.get_game_leaderboard(text,integer);
DROP FUNCTION IF EXISTS public.get_game_leaderboard(text,integer,text);

-- Single-signature functions (no overloads)
DROP FUNCTION IF EXISTS public.create_upcoming_event(uuid,text,text,text,text,timestamptz,timestamptz,integer,text,uuid,text);
DROP FUNCTION IF EXISTS public.create_user(uuid,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.create_cocktail(uuid,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.delete_announcement(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_special_feature(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_upcoming_event(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_menu_item(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_cocktail(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_libation_recipe(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_puree_syrup_recipe(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_summer_libation_recipe(uuid,uuid);
DROP FUNCTION IF EXISTS public.delete_expired_special_features();
DROP FUNCTION IF EXISTS public.delete_expired_upcoming_events();
DROP FUNCTION IF EXISTS public.update_upcoming_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,text,uuid,text);
DROP FUNCTION IF EXISTS public.update_cocktail(uuid,uuid,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.update_libation_recipe(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.update_puree_syrup_recipe(uuid,uuid,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.update_summer_libation_recipe(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.insert_cocktail(uuid,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.insert_libation_recipe(uuid,text,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.insert_puree_syrup_recipe(uuid,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.insert_summer_libation_recipe(uuid,text,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.update_employee_info(uuid,uuid,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.update_user_active_status(uuid,boolean);
DROP FUNCTION IF EXISTS public.update_user_job_titles(uuid,text[]);
DROP FUNCTION IF EXISTS public.update_transaction_and_balance(uuid,uuid,integer,text);
DROP FUNCTION IF EXISTS public.update_password(uuid,text);
DROP FUNCTION IF EXISTS public.update_profile_info(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_profile_picture(uuid,text);
DROP FUNCTION IF EXISTS public.update_quick_tools(uuid,jsonb);
DROP FUNCTION IF EXISTS public.upsert_push_token(uuid,text,text);
DROP FUNCTION IF EXISTS public.verify_password(uuid,text);
DROP FUNCTION IF EXISTS public.get_unread_message_count(uuid);
DROP FUNCTION IF EXISTS public.get_word_search_leaderboard(text,integer);
DROP FUNCTION IF EXISTS public.reset_word_search_scores(text);
DROP FUNCTION IF EXISTS public.reset_game_scores(text,text);
DROP FUNCTION IF EXISTS public.reset_picture_this_scores(text,text);
DROP FUNCTION IF EXISTS public.set_user_test_flag(uuid,boolean);
DROP FUNCTION IF EXISTS public.create_user(text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.get_master_leaderboard_overall(integer);
DROP FUNCTION IF EXISTS public.get_master_leaderboard_memory(integer);
DROP FUNCTION IF EXISTS public.get_master_leaderboard_word_search(integer);
DROP FUNCTION IF EXISTS public.get_master_leaderboard_picture_this(integer);
DROP FUNCTION IF EXISTS public.get_user_total_game_score(uuid);
DROP FUNCTION IF EXISTS public.get_picture_this_leaderboard_filtered(text,text,integer);
DROP FUNCTION IF EXISTS public.get_passed_users_on_leaderboard(uuid,bigint);
DROP FUNCTION IF EXISTS public.submit_exam_and_award_bucks(uuid,uuid,jsonb,integer,integer,integer,integer,boolean);
DROP FUNCTION IF EXISTS public.start_exam_attempt(uuid,uuid);
DROP FUNCTION IF EXISTS public.get_exam_completion_status(uuid,text);
DROP FUNCTION IF EXISTS public.close_expired_exams();
DROP FUNCTION IF EXISTS public.get_user_badge_totals(uuid[]);
DROP FUNCTION IF EXISTS public.submit_redemption_request(uuid,text,integer,uuid,uuid,text,date,text,text);
DROP FUNCTION IF EXISTS public.approve_redemption_request(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.deny_redemption_request(uuid,uuid,text);

-- Translation RPCs
DROP FUNCTION IF EXISTS public.update_announcement_translations(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_special_feature_translations(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_upcoming_event_translations(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_guide_translations(uuid,text,text);
DROP FUNCTION IF EXISTS public.update_libation_recipe_translations(uuid,text);
DROP FUNCTION IF EXISTS public.update_cocktail_translations(uuid,text);
DROP FUNCTION IF EXISTS public.update_puree_syrup_recipe_translations(uuid,text);
DROP FUNCTION IF EXISTS public.update_summer_libation_recipe_translations(uuid,text);

-- Other functions
DROP FUNCTION IF EXISTS public.create_guide(uuid,text,text,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.update_guide(uuid,uuid,text,text,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.delete_guide(uuid,uuid);
DROP FUNCTION IF EXISTS public.create_signature_recipe(uuid,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.update_signature_recipe(uuid,uuid,text,text,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.delete_signature_recipe(uuid,uuid);


-- ============================================================
-- SECTION 2: User management functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_user(
  p_username text,
  p_name text,
  p_email text,
  p_job_title text,
  p_phone_number text,
  p_role text,
  p_password text DEFAULT 'changeme',
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_user_id uuid;
BEGIN
  INSERT INTO public.users (
    username, name, email, job_title, phone_number, role,
    password_hash, is_active, organization_id
  )
  VALUES (
    p_username, p_name, p_email, p_job_title, p_phone_number, p_role,
    crypt(p_password, gen_salt('bf')),
    true,
    p_organization_id
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_password(
  user_id uuid,
  password text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT password_hash INTO stored_hash
  FROM public.users
  WHERE id = user_id;

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN stored_hash = crypt(password, stored_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_password(
  user_id uuid,
  new_password text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.users
  SET password_hash = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_profile_info(
  user_id uuid,
  new_email text,
  new_phone_number text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE users
  SET email = new_email, phone_number = new_phone_number
  WHERE id = user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_profile_picture(
  user_id uuid,
  picture_url text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE users SET profile_picture_url = picture_url WHERE id = user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_quick_tools(
  user_id uuid,
  tools jsonb,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE users SET quick_tools = tools, updated_at = NOW() WHERE id = user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_employee_info(
  p_manager_id uuid,
  p_employee_id uuid,
  p_name text,
  p_email text,
  p_job_title text,
  p_phone_number text,
  p_role text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_is_manager BOOLEAN;
BEGIN
  SELECT role IN ('manager', 'owner') INTO v_is_manager
  FROM users WHERE id = p_manager_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can update employee information';
  END IF;

  UPDATE users
  SET name = p_name, email = p_email, job_title = p_job_title,
      phone_number = p_phone_number, role = p_role, updated_at = NOW()
  WHERE id = p_employee_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_active_status(
  p_user_id uuid,
  p_is_active boolean,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE users
  SET is_active = p_is_active, updated_at = NOW()
  WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_job_titles(
  p_user_id uuid,
  p_job_titles text[],
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE users SET job_titles = p_job_titles, updated_at = NOW() WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_test_flag(
  p_user_id uuid,
  p_is_test boolean,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE users SET is_test_user = p_is_test WHERE id = p_user_id;
END;
$function$;


-- ============================================================
-- SECTION 3: Notification / push functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_user_id uuid,
  p_token text,
  p_device_type text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM push_tokens WHERE user_id = p_user_id;
  INSERT INTO push_tokens (user_id, token, device_type, organization_id)
  VALUES (p_user_id, p_token, p_device_type, p_organization_id);
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO notification_preferences (
    user_id, messages_enabled, rewards_enabled, announcements_enabled,
    events_enabled, special_features_enabled, custom_notifications_enabled,
    game_hub_enabled, organization_id
  )
  VALUES (
    p_user_id,
    COALESCE(p_messages_enabled, TRUE),
    COALESCE(p_rewards_enabled, TRUE),
    COALESCE(p_announcements_enabled, TRUE),
    COALESCE(p_events_enabled, TRUE),
    COALESCE(p_special_features_enabled, TRUE),
    COALESCE(p_custom_notifications_enabled, TRUE),
    COALESCE(p_game_hub_enabled, TRUE),
    p_organization_id
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

CREATE OR REPLACE FUNCTION public.get_unread_message_count(
  user_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM message_recipients mr
    JOIN messages m ON m.id = mr.message_id
    WHERE mr.recipient_id = user_id
      AND mr.is_read = FALSE
      AND mr.is_deleted = FALSE
      AND (p_organization_id IS NULL OR m.organization_id = p_organization_id)
  );
END;
$function$;


-- ============================================================
-- SECTION 4: Announcement functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_announcement(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_priority text DEFAULT 'medium',
  p_visibility text DEFAULT 'everyone',
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO announcements (
    title, content, message, thumbnail_url, thumbnail_shape,
    priority, visibility, display_order, created_by,
    link, guide_file_id, organization_id
  ) VALUES (
    p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_priority, p_visibility, p_display_order, p_user_id,
    p_link, p_guide_file_id, p_organization_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_announcement(
  p_user_id uuid,
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_priority text DEFAULT 'medium',
  p_visibility text DEFAULT 'everyone',
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE announcements
  SET title = p_title, content = p_message, message = p_message,
      thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
      priority = p_priority, visibility = p_visibility,
      display_order = p_display_order, updated_at = now(),
      link = p_link, guide_file_id = p_guide_file_id
  WHERE id = p_announcement_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_announcement(
  p_user_id uuid,
  p_announcement_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM announcements
  WHERE id = p_announcement_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN FOUND;
END;
$function$;


-- ============================================================
-- SECTION 5: Special feature functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_special_feature(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL,
  p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO special_features (
    title, content, message, thumbnail_url, thumbnail_shape,
    start_date_time, end_date_time, display_order, created_by,
    link, guide_file_id, organization_id
  ) VALUES (
    p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_start_date_time, p_end_date_time, p_display_order, p_user_id,
    p_link, p_guide_file_id, p_organization_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_special_feature(
  p_user_id uuid,
  p_feature_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL,
  p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE special_features
  SET title = p_title, content = p_message, message = p_message,
      thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
      start_date_time = p_start_date_time, end_date_time = p_end_date_time,
      display_order = p_display_order, updated_at = now(),
      link = p_link, guide_file_id = p_guide_file_id
  WHERE id = p_feature_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_special_feature(
  p_user_id uuid,
  p_feature_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM special_features
  WHERE id = p_feature_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_expired_special_features(
  p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM special_features
  WHERE end_date_time IS NOT NULL
    AND end_date_time < now()
    AND is_active = true
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$function$;


-- ============================================================
-- SECTION 6: Upcoming event functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_upcoming_event(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL,
  p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Event',
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event_id uuid;
  v_is_manager boolean;
BEGIN
  SELECT role IN ('manager', 'owner') INTO v_is_manager
  FROM users WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can create upcoming events';
  END IF;

  INSERT INTO upcoming_events (
    title, content, message, thumbnail_url, thumbnail_shape,
    start_date_time, end_date_time, display_order, is_active,
    link, guide_file_id, category, organization_id
  )
  VALUES (
    p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_start_date_time, p_end_date_time, p_display_order, true,
    p_link, p_guide_file_id, COALESCE(p_category, 'Event'), p_organization_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_upcoming_event(
  p_user_id uuid,
  p_event_id uuid,
  p_title text,
  p_message text,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL,
  p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Event',
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_is_manager boolean;
BEGIN
  SELECT role IN ('manager', 'owner') INTO v_is_manager
  FROM users WHERE id = p_user_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can update upcoming events';
  END IF;

  UPDATE upcoming_events
  SET title = p_title, content = p_message, message = p_message,
      thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
      start_date_time = p_start_date_time, end_date_time = p_end_date_time,
      display_order = p_display_order, link = p_link,
      guide_file_id = p_guide_file_id,
      category = COALESCE(p_category, 'Event'), updated_at = now()
  WHERE id = p_event_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_upcoming_event(
  p_user_id uuid,
  p_event_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM upcoming_events
  WHERE id = p_event_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_expired_upcoming_events(
  p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM upcoming_events
  WHERE end_date_time IS NOT NULL
    AND end_date_time < now()
    AND is_active = true
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$function$;


-- ============================================================
-- SECTION 7: Menu item functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_menu_item(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_price text,
  p_category text,
  p_subcategory text,
  p_available_for_lunch boolean,
  p_available_for_dinner boolean,
  p_is_gluten_free boolean,
  p_is_gluten_free_available boolean,
  p_is_vegetarian boolean,
  p_is_vegetarian_available boolean,
  p_thumbnail_url text,
  p_thumbnail_shape text,
  p_display_order integer DEFAULT 0,
  p_location text DEFAULT NULL,
  p_glass_price text DEFAULT NULL,
  p_bottle_price text DEFAULT NULL,
  p_member_bottle_price text DEFAULT NULL,
  p_flavor_profile text DEFAULT NULL,
  p_flavor_profile_es text DEFAULT NULL,
  p_unique_selling_points text DEFAULT NULL,
  p_unique_selling_points_es text DEFAULT NULL,
  p_season text DEFAULT 'both',
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT; v_menu_item_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create menu items';
  END IF;
  INSERT INTO menu_items (
    name, description, price, category, subcategory,
    available_for_lunch, available_for_dinner, is_gluten_free, is_gluten_free_available,
    is_vegetarian, is_vegetarian_available, thumbnail_url, thumbnail_shape, display_order, created_by,
    location, glass_price, bottle_price, member_bottle_price,
    flavor_profile, flavor_profile_es, unique_selling_points, unique_selling_points_es,
    season, organization_id
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner, p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available, p_thumbnail_url, p_thumbnail_shape, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price,
    p_flavor_profile, p_flavor_profile_es, p_unique_selling_points, p_unique_selling_points_es,
    p_season, p_organization_id
  ) RETURNING id INTO v_menu_item_id;
  RETURN v_menu_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_menu_item(
  p_user_id uuid,
  p_menu_item_id uuid,
  p_name text,
  p_description text,
  p_price text,
  p_category text,
  p_subcategory text,
  p_available_for_lunch boolean,
  p_available_for_dinner boolean,
  p_is_gluten_free boolean,
  p_is_gluten_free_available boolean,
  p_is_vegetarian boolean,
  p_is_vegetarian_available boolean,
  p_thumbnail_url text,
  p_thumbnail_shape text,
  p_display_order integer DEFAULT 0,
  p_location text DEFAULT NULL,
  p_glass_price text DEFAULT NULL,
  p_bottle_price text DEFAULT NULL,
  p_member_bottle_price text DEFAULT NULL,
  p_flavor_profile text DEFAULT NULL,
  p_flavor_profile_es text DEFAULT NULL,
  p_unique_selling_points text DEFAULT NULL,
  p_unique_selling_points_es text DEFAULT NULL,
  p_season text DEFAULT 'both',
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update menu items';
  END IF;
  UPDATE menu_items SET
    name = p_name, description = p_description, price = p_price,
    category = p_category, subcategory = p_subcategory,
    available_for_lunch = p_available_for_lunch, available_for_dinner = p_available_for_dinner,
    is_gluten_free = p_is_gluten_free, is_gluten_free_available = p_is_gluten_free_available,
    is_vegetarian = p_is_vegetarian, is_vegetarian_available = p_is_vegetarian_available,
    thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
    display_order = p_display_order, location = p_location,
    glass_price = p_glass_price, bottle_price = p_bottle_price,
    member_bottle_price = p_member_bottle_price, flavor_profile = p_flavor_profile,
    flavor_profile_es = p_flavor_profile_es, unique_selling_points = p_unique_selling_points,
    unique_selling_points_es = p_unique_selling_points_es, season = p_season, updated_at = NOW()
  WHERE id = p_menu_item_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_menu_item(
  p_user_id uuid,
  p_menu_item_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role text;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can delete menu items';
  END IF;
  DELETE FROM menu_items
  WHERE id = p_menu_item_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN true;
END;
$function$;


-- ============================================================
-- SECTION 8: Cocktail functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_cocktail(
  p_user_id uuid,
  p_name text,
  p_alcohol_type text,
  p_ingredients text,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
  v_cocktail_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create cocktails';
  END IF;
  INSERT INTO cocktails (
    name, alcohol_type, ingredients, procedure, thumbnail_url,
    display_order, is_active, created_by, created_at, updated_at, organization_id
  ) VALUES (
    p_name, p_alcohol_type, p_ingredients, p_procedure, p_thumbnail_url,
    p_display_order, true, p_user_id, NOW(), NOW(), p_organization_id
  )
  RETURNING id INTO v_cocktail_id;
  RETURN v_cocktail_id;
END;
$function$;

-- create_cocktail is an alias some code may use
CREATE OR REPLACE FUNCTION public.create_cocktail(
  p_user_id uuid,
  p_name text,
  p_alcohol_type text,
  p_ingredients text,
  p_procedure text,
  p_thumbnail_url text DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
  v_cocktail_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create cocktails';
  END IF;
  INSERT INTO cocktails (
    name, alcohol_type, ingredients, procedure, thumbnail_url,
    display_order, is_active, created_by, created_at, updated_at, organization_id
  ) VALUES (
    p_name, p_alcohol_type, p_ingredients, p_procedure, p_thumbnail_url,
    p_display_order, true, p_user_id, NOW(), NOW(), p_organization_id
  )
  RETURNING id INTO v_cocktail_id;
  RETURN v_cocktail_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_cocktail(
  p_user_id uuid,
  p_cocktail_id uuid,
  p_name text,
  p_alcohol_type text,
  p_ingredients text,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update cocktails';
  END IF;
  UPDATE cocktails
  SET name = p_name, alcohol_type = p_alcohol_type,
      ingredients = p_ingredients, procedure = p_procedure,
      thumbnail_url = p_thumbnail_url, display_order = p_display_order,
      updated_at = NOW()
  WHERE id = p_cocktail_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_cocktail(
  p_user_id uuid,
  p_cocktail_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can delete cocktails';
  END IF;
  UPDATE cocktails SET is_active = false, updated_at = NOW()
  WHERE id = p_cocktail_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END;
$function$;


-- ============================================================
-- SECTION 9: Recipe functions (libation, puree/syrup, summer)
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_libation_recipe(
  p_user_id uuid,
  p_name text,
  p_price text,
  p_category text,
  p_glassware text,
  p_garnish text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
  v_recipe_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can create libation recipes';
  END IF;
  INSERT INTO libation_recipes (
    name, price, category, glassware, garnish, ingredients, procedure,
    thumbnail_url, display_order, is_active, created_by, created_at, updated_at, organization_id
  ) VALUES (
    p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure,
    p_thumbnail_url, p_display_order, true, p_user_id, NOW(), NOW(), p_organization_id
  )
  RETURNING id INTO v_recipe_id;
  RETURN v_recipe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_libation_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_price text,
  p_category text,
  p_glassware text,
  p_garnish text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can update libation recipes';
  END IF;
  UPDATE libation_recipes
  SET name = p_name, price = p_price, category = p_category,
      glassware = p_glassware, garnish = p_garnish,
      ingredients = p_ingredients, procedure = p_procedure,
      thumbnail_url = p_thumbnail_url, display_order = p_display_order,
      updated_at = NOW()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_libation_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  IF v_user_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers can delete libation recipes';
  END IF;
  UPDATE libation_recipes SET is_active = false, updated_at = NOW()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_puree_syrup_recipe(
  p_user_id uuid,
  p_name text,
  p_category text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_recipe_id UUID;
BEGIN
  INSERT INTO puree_syrup_recipes (
    name, category, ingredients, procedure, thumbnail_url,
    display_order, created_by, organization_id
  ) VALUES (
    p_name, p_category, p_ingredients, p_procedure, p_thumbnail_url,
    p_display_order, p_user_id, p_organization_id
  )
  RETURNING id INTO v_recipe_id;
  RETURN v_recipe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_puree_syrup_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_category text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE puree_syrup_recipes
  SET name = p_name, category = p_category, ingredients = p_ingredients,
      procedure = p_procedure, thumbnail_url = p_thumbnail_url,
      display_order = p_display_order, updated_at = now()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_puree_syrup_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE puree_syrup_recipes SET is_active = false, updated_at = now()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_summer_libation_recipe(
  p_user_id uuid,
  p_name text,
  p_price text,
  p_category text,
  p_glassware text DEFAULT NULL,
  p_garnish text DEFAULT NULL,
  p_ingredients jsonb DEFAULT '[]'::jsonb,
  p_procedure text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_id UUID;
BEGIN
  INSERT INTO summer_libation_recipes
    (name, price, category, glassware, garnish, ingredients, procedure,
     thumbnail_url, display_order, created_by, organization_id)
  VALUES
    (p_name, p_price, p_category, p_glassware, p_garnish, p_ingredients, p_procedure,
     p_thumbnail_url, p_display_order, p_user_id, p_organization_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_price text,
  p_category text,
  p_glassware text DEFAULT NULL,
  p_garnish text DEFAULT NULL,
  p_ingredients jsonb DEFAULT '[]'::jsonb,
  p_procedure text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE summer_libation_recipes
  SET name = p_name, price = p_price, category = p_category,
      glassware = p_glassware, garnish = p_garnish, ingredients = p_ingredients,
      procedure = p_procedure, thumbnail_url = p_thumbnail_url,
      display_order = p_display_order, updated_at = now()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_summer_libation_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE summer_libation_recipes SET is_active = false
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;


-- ============================================================
-- SECTION 10: Rewards / transaction functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_transaction_and_balance(
  p_manager_id uuid,
  p_transaction_id uuid,
  p_new_amount integer,
  p_new_description text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_is_manager BOOLEAN;
  v_old_amount INTEGER;
  v_user_id UUID;
  v_amount_difference INTEGER;
BEGIN
  SELECT role IN ('manager', 'owner') INTO v_is_manager
  FROM users WHERE id = p_manager_id;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Only managers can update transactions';
  END IF;

  SELECT amount, user_id INTO v_old_amount, v_user_id
  FROM rewards_transactions
  WHERE id = p_transaction_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  IF v_old_amount IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  v_amount_difference := p_new_amount - v_old_amount;

  UPDATE rewards_transactions
  SET amount = p_new_amount, description = p_new_description, updated_at = NOW()
  WHERE id = p_transaction_id;

  UPDATE users
  SET mcloones_bucks = mcloones_bucks + v_amount_difference, updated_at = NOW()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_redemption_request(
  p_user_id uuid,
  p_request_type text,
  p_bucks_amount integer,
  p_menu_item_id uuid,
  p_weekly_special_id uuid,
  p_item_name_snapshot text,
  p_shift_date date,
  p_shift_period text,
  p_comment text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_balance INTEGER;
  v_pending_total INTEGER;
  v_available INTEGER;
  v_request_id UUID;
BEGIN
  IF p_bucks_amount IS NULL OR p_bucks_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid bucks amount';
  END IF;
  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM users WHERE id = p_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  SELECT COALESCE(SUM(bucks_amount), 0) INTO v_pending_total
  FROM redemption_requests
  WHERE user_id = p_user_id AND status = 'pending';
  v_available := v_balance - v_pending_total;
  IF v_available < p_bucks_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', v_available, p_bucks_amount;
  END IF;
  INSERT INTO redemption_requests (
    user_id, request_type, bucks_amount,
    menu_item_id, weekly_special_id, item_name_snapshot,
    shift_date, shift_period, comment, organization_id
  ) VALUES (
    p_user_id, p_request_type, p_bucks_amount,
    p_menu_item_id, p_weekly_special_id, p_item_name_snapshot,
    p_shift_date, p_shift_period, p_comment, p_organization_id
  ) RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_redemption_request(
  p_request_id uuid,
  p_manager_id uuid,
  p_reason text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_req RECORD;
  v_manager_role TEXT;
  v_balance INTEGER;
  v_description TEXT;
BEGIN
  SELECT role INTO v_manager_role FROM users WHERE id = p_manager_id;
  IF v_manager_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers may approve redemption requests';
  END IF;
  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Redemption request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;
  SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM users WHERE id = v_req.user_id;
  IF v_balance < v_req.bucks_amount THEN
    RAISE EXCEPTION 'Employee balance insufficient at approval time';
  END IF;
  v_description := CASE v_req.request_type
    WHEN 'food_beverage'   THEN 'Redeemed: ' || COALESCE(v_req.item_name_snapshot, 'Menu Item')
    WHEN 'section'         THEN 'Redeemed: Choose Your Own Section'
    WHEN 'side_work'       THEN 'Redeemed: Choose Your Own Side Work'
    WHEN 'side_work_free'  THEN 'Redeemed: Side Work Free Shift'
    ELSE 'Redeemed'
  END;
  UPDATE users
  SET mcloones_bucks = COALESCE(mcloones_bucks, 0) - v_req.bucks_amount
  WHERE id = v_req.user_id;
  INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
  VALUES (v_req.user_id, -v_req.bucks_amount, v_description, true, p_manager_id, p_organization_id);
  UPDATE redemption_requests
  SET status = 'approved', decided_by = p_manager_id,
      decided_at = now(), decision_reason = p_reason
  WHERE id = p_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deny_redemption_request(
  p_request_id uuid,
  p_manager_id uuid,
  p_reason text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_req RECORD;
  v_manager_role TEXT;
BEGIN
  SELECT role INTO v_manager_role FROM users WHERE id = p_manager_id;
  IF v_manager_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers may deny redemption requests';
  END IF;
  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Redemption request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Redemption request is not pending (status: %)', v_req.status;
  END IF;
  UPDATE redemption_requests
  SET status = 'denied', decided_by = p_manager_id,
      decided_at = now(), decision_reason = p_reason
  WHERE id = p_request_id;
END;
$function$;


-- ============================================================
-- SECTION 11: Game / leaderboard functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_game_leaderboard(
  p_game_mode text,
  p_limit integer DEFAULT 20,
  p_play_mode text DEFAULT 'lives',
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, best_score integer, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT gs.user_id, u.name, u.profile_picture_url,
    MAX(gs.score)::INTEGER as best_score, COUNT(*)::BIGINT as games_played
  FROM game_scores gs
  JOIN users u ON u.id = gs.user_id
  WHERE gs.game_mode = p_game_mode AND gs.play_mode = p_play_mode AND gs.completed = true
    AND (p_organization_id IS NULL OR gs.organization_id = p_organization_id)
  GROUP BY gs.user_id, u.name, u.profile_picture_url
  ORDER BY best_score DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_word_search_leaderboard(
  p_category text,
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, best_score integer, games_played bigint)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT ws.user_id, u.name, u.profile_picture_url,
    MAX(ws.score)::INT AS best_score, COUNT(*)::BIGINT AS games_played
  FROM word_search_scores ws
  JOIN users u ON u.id = ws.user_id
  WHERE ws.category = p_category AND ws.completed = true
    AND (p_organization_id IS NULL OR ws.organization_id = p_organization_id)
  GROUP BY ws.user_id, u.name, u.profile_picture_url
  ORDER BY best_score DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_overall(
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH combined AS (
    SELECT gs.user_id, gs.score FROM game_scores gs
    WHERE gs.completed = TRUE AND (p_organization_id IS NULL OR gs.organization_id = p_organization_id)
    UNION ALL
    SELECT ws.user_id, ws.score FROM word_search_scores ws
    WHERE ws.completed = TRUE AND (p_organization_id IS NULL OR ws.organization_id = p_organization_id)
    UNION ALL
    SELECT pts.user_id, pts.score FROM picture_this_scores pts
    WHERE pts.completed = TRUE AND (p_organization_id IS NULL OR pts.organization_id = p_organization_id)
  )
  SELECT c.user_id, u.name, u.profile_picture_url,
    SUM(c.score)::BIGINT AS total_score, COUNT(*)::BIGINT AS games_played
  FROM combined c JOIN users u ON u.id = c.user_id
  WHERE u.is_test_user = FALSE
  GROUP BY c.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_memory(
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT gs.user_id, u.name, u.profile_picture_url,
    SUM(gs.score)::BIGINT AS total_score, COUNT(*)::BIGINT AS games_played
  FROM game_scores gs JOIN users u ON u.id = gs.user_id
  WHERE gs.completed = TRUE AND u.is_test_user = FALSE
    AND (p_organization_id IS NULL OR gs.organization_id = p_organization_id)
  GROUP BY gs.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_word_search(
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ws.user_id, u.name, u.profile_picture_url,
    SUM(ws.score)::BIGINT AS total_score, COUNT(*)::BIGINT AS games_played
  FROM word_search_scores ws JOIN users u ON u.id = ws.user_id
  WHERE ws.completed = TRUE AND u.is_test_user = FALSE
    AND (p_organization_id IS NULL OR ws.organization_id = p_organization_id)
  GROUP BY ws.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_master_leaderboard_picture_this(
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT pts.user_id, u.name, u.profile_picture_url,
    SUM(pts.score)::BIGINT AS total_score, COUNT(*)::BIGINT AS games_played
  FROM picture_this_scores pts
  JOIN users u ON u.id = pts.user_id
  WHERE pts.completed = TRUE AND u.is_test_user = FALSE
    AND (p_organization_id IS NULL OR pts.organization_id = p_organization_id)
  GROUP BY pts.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_picture_this_leaderboard_filtered(
  p_category text DEFAULT NULL,
  p_play_mode text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, total_score bigint, games_played bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT pts.user_id, u.name, u.profile_picture_url,
    SUM(pts.score)::BIGINT AS total_score, COUNT(*)::BIGINT AS games_played
  FROM picture_this_scores pts
  JOIN users u ON u.id = pts.user_id
  WHERE pts.completed = TRUE AND u.is_test_user = FALSE
    AND (p_category IS NULL OR pts.category = p_category)
    AND (p_play_mode IS NULL OR pts.play_mode = p_play_mode)
    AND (p_organization_id IS NULL OR pts.organization_id = p_organization_id)
  GROUP BY pts.user_id, u.name, u.profile_picture_url
  ORDER BY total_score DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_total_game_score(
  p_user_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE total BIGINT;
BEGIN
  SELECT COALESCE(SUM(score), 0) INTO total
  FROM (
    SELECT score FROM game_scores WHERE user_id = p_user_id AND completed = TRUE
    UNION ALL
    SELECT score FROM word_search_scores WHERE user_id = p_user_id AND completed = TRUE
    UNION ALL
    SELECT score FROM picture_this_scores WHERE user_id = p_user_id AND completed = TRUE
  ) combined;
  RETURN total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_passed_users_on_leaderboard(
  p_user_id uuid,
  p_new_score bigint,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_total BIGINT;
  v_old_total BIGINT;
  v_player_is_test BOOLEAN;
BEGIN
  SELECT COALESCE(is_test_user, FALSE) INTO v_player_is_test FROM users WHERE id = p_user_id;
  IF v_player_is_test THEN RETURN; END IF;

  SELECT COALESCE(SUM(score), 0)::BIGINT INTO v_new_total
  FROM (
    SELECT gs.score FROM game_scores gs WHERE gs.user_id = p_user_id AND gs.completed = TRUE
    UNION ALL
    SELECT ws.score FROM word_search_scores ws WHERE ws.user_id = p_user_id AND ws.completed = TRUE
    UNION ALL
    SELECT pts.score FROM picture_this_scores pts WHERE pts.user_id = p_user_id AND pts.completed = TRUE
  ) s;

  v_old_total := v_new_total - p_new_score;

  RETURN QUERY
  WITH all_totals AS (
    SELECT t.user_id, SUM(t.score)::BIGINT AS total
    FROM (
      SELECT gs.user_id, gs.score FROM game_scores gs
      WHERE gs.completed = TRUE AND (p_organization_id IS NULL OR gs.organization_id = p_organization_id)
      UNION ALL
      SELECT ws.user_id, ws.score FROM word_search_scores ws
      WHERE ws.completed = TRUE AND (p_organization_id IS NULL OR ws.organization_id = p_organization_id)
      UNION ALL
      SELECT pts.user_id, pts.score FROM picture_this_scores pts
      WHERE pts.completed = TRUE AND (p_organization_id IS NULL OR pts.organization_id = p_organization_id)
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
    AND u.is_test_user = FALSE
    AND COALESCE(np.game_hub_enabled, TRUE) = TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_word_search_scores(
  p_category text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $function$
  DELETE FROM word_search_scores
  WHERE (p_category IS NULL OR category = p_category)
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
$function$;

CREATE OR REPLACE FUNCTION public.reset_game_scores(
  p_game_mode text DEFAULT NULL,
  p_play_mode text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF p_game_mode IS NULL AND p_play_mode IS NULL THEN
    DELETE FROM game_scores
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id);
  ELSIF p_game_mode IS NOT NULL AND p_play_mode IS NOT NULL THEN
    DELETE FROM game_scores WHERE game_mode = p_game_mode AND play_mode = p_play_mode
      AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  ELSIF p_game_mode IS NOT NULL THEN
    DELETE FROM game_scores WHERE game_mode = p_game_mode
      AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  ELSE
    DELETE FROM game_scores WHERE play_mode = p_play_mode
      AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_picture_this_scores(
  p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM picture_this_scores
  WHERE (p_category IS NULL OR category = p_category)
    AND (p_difficulty IS NULL OR difficulty = p_difficulty)
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;


-- ============================================================
-- SECTION 12: Exam / quiz functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_exam_and_award_bucks(
  p_exam_id uuid,
  p_user_id uuid,
  p_answers jsonb,
  p_correct_count integer,
  p_total_questions integer,
  p_bucks_awarded integer,
  p_time_seconds integer,
  p_is_timed_out boolean,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result_id UUID;
  v_existing RECORD;
BEGIN
  SELECT id, completed_at, correct_count
  INTO v_existing
  FROM exam_results
  WHERE exam_id = p_exam_id AND user_id = p_user_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.completed_at IS NOT NULL AND v_existing.correct_count > 0 THEN
      RETURN v_existing.id;
    END IF;
    UPDATE exam_results
    SET answers = p_answers, correct_count = p_correct_count,
        total_questions = p_total_questions, bucks_awarded = p_bucks_awarded,
        time_seconds = p_time_seconds, is_timed_out = p_is_timed_out,
        completed_at = now()
    WHERE id = v_existing.id;
    v_result_id := v_existing.id;
  ELSE
    INSERT INTO exam_results (exam_id, user_id, answers, correct_count, total_questions,
      bucks_awarded, time_seconds, is_timed_out, started_at, organization_id)
    VALUES (p_exam_id, p_user_id, p_answers, p_correct_count, p_total_questions,
      p_bucks_awarded, p_time_seconds, p_is_timed_out, now(), p_organization_id)
    RETURNING id INTO v_result_id;
  END IF;

  IF p_bucks_awarded > 0 THEN
    INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (p_user_id, p_bucks_awarded, 'Weekly Quiz Reward', false, p_user_id, p_organization_id);
    UPDATE users
    SET mcloones_bucks = COALESCE(mcloones_bucks, 0) + p_bucks_awarded
    WHERE id = p_user_id;
  END IF;

  RETURN v_result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(
  p_exam_id uuid,
  p_user_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(result_id uuid, started_at timestamptz, is_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_existing RECORD;
BEGIN
  SELECT er.id, er.started_at, er.completed_at, er.correct_count
  INTO v_existing
  FROM exam_results er
  WHERE er.exam_id = p_exam_id AND er.user_id = p_user_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_existing.id,
      v_existing.started_at,
      (v_existing.completed_at IS NOT NULL AND v_existing.correct_count > 0)::BOOLEAN;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO exam_results (exam_id, user_id, started_at, completed_at, organization_id)
  VALUES (p_exam_id, p_user_id, now(), NULL, p_organization_id)
  RETURNING id, exam_results.started_at, false::BOOLEAN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_exam_completion_status(
  p_exam_id uuid,
  p_exam_type text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, name text, profile_picture_url text, job_title text, has_completed boolean, correct_count integer, total_questions integer, bucks_awarded integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT u.id, u.name, u.profile_picture_url,
      COALESCE(u.job_titles,
        CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END
      ) AS job_titles_arr,
      u.job_title AS legacy_title
    FROM users u
    WHERE u.is_active = true AND u.role = 'employee'
      AND (p_organization_id IS NULL OR u.organization_id = p_organization_id)
  )
  SELECT e.id AS user_id, e.name::TEXT, e.profile_picture_url::TEXT,
    COALESCE(e.legacy_title, e.job_titles_arr[1])::TEXT AS job_title,
    (er.id IS NOT NULL) AS has_completed,
    COALESCE(er.correct_count, 0)::INTEGER,
    COALESCE(er.total_questions, 0)::INTEGER,
    COALESCE(er.bucks_awarded, 0)::INTEGER
  FROM eligible e
  LEFT JOIN exam_results er ON er.user_id = e.id AND er.exam_id = p_exam_id
  WHERE
    (p_exam_type = 'server'    AND e.job_titles_arr && ARRAY['Server','Lead Server','Busser','Runner']) OR
    (p_exam_type = 'bartender' AND e.job_titles_arr && ARRAY['Bartender']) OR
    (p_exam_type = 'host'      AND e.job_titles_arr && ARRAY['Host'])
  ORDER BY has_completed ASC, e.name ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_expired_exams(
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $function$
  UPDATE exams
  SET status = 'closed', closed_at = now()
  WHERE status = 'active'
    AND close_at IS NOT NULL
    AND close_at < now()
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_user_badge_totals(
  p_user_ids uuid[],
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, badge_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH target_users AS (
    SELECT u.id,
      COALESCE(u.job_titles,
        CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END
      ) AS job_titles
    FROM users u
    WHERE u.id = ANY(p_user_ids)
  ),
  unread_msgs AS (
    SELECT mr.recipient_id AS uid, COUNT(*)::int AS cnt
    FROM message_recipients mr
    WHERE mr.recipient_id = ANY(p_user_ids)
      AND mr.is_read = FALSE AND mr.is_deleted = FALSE
    GROUP BY mr.recipient_id
  ),
  active_quizzes AS (
    SELECT e.id, e.exam_type
    FROM exams e
    WHERE e.status = 'active'
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
  ),
  user_eligible AS (
    SELECT tu.id AS uid, aq.id AS exam_id
    FROM target_users tu
    CROSS JOIN active_quizzes aq
    WHERE (
      (aq.exam_type = 'server'    AND tu.job_titles && ARRAY['Server','Lead Server','Busser','Runner']) OR
      (aq.exam_type = 'bartender' AND tu.job_titles && ARRAY['Bartender']) OR
      (aq.exam_type = 'host'      AND tu.job_titles && ARRAY['Host'])
    )
  ),
  completed AS (
    SELECT ue.uid, ue.exam_id
    FROM user_eligible ue
    JOIN exam_results er ON er.exam_id = ue.exam_id AND er.user_id = ue.uid
    WHERE er.correct_count IS NOT NULL
  ),
  unread_quizzes AS (
    SELECT ue.uid, COUNT(*)::int AS cnt
    FROM user_eligible ue
    LEFT JOIN completed c ON c.uid = ue.uid AND c.exam_id = ue.exam_id
    WHERE c.exam_id IS NULL
    GROUP BY ue.uid
  )
  SELECT tu.id AS user_id,
    (COALESCE(um.cnt, 0) + COALESCE(uq.cnt, 0))::int AS badge_total
  FROM target_users tu
  LEFT JOIN unread_msgs um ON um.uid = tu.id
  LEFT JOIN unread_quizzes uq ON uq.uid = tu.id;
END;
$function$;


-- ============================================================
-- SECTION 13: Translation RPCs (operate by row ID, org for consistency)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_announcement_translations(
  p_id uuid,
  p_title_es text DEFAULT NULL,
  p_content_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE announcements
  SET title_es = COALESCE(p_title_es, title_es),
      content_es = COALESCE(p_content_es, content_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_special_feature_translations(
  p_id uuid,
  p_title_es text DEFAULT NULL,
  p_content_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE special_features
  SET title_es = COALESCE(p_title_es, title_es),
      content_es = COALESCE(p_content_es, content_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_upcoming_event_translations(
  p_id uuid,
  p_title_es text DEFAULT NULL,
  p_content_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE upcoming_events
  SET title_es = COALESCE(p_title_es, title_es),
      content_es = COALESCE(p_content_es, content_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_menu_item_translations(
  p_id uuid,
  p_name_es text DEFAULT NULL,
  p_description_es text DEFAULT NULL,
  p_location_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE menu_items
  SET name_es = COALESCE(p_name_es, name_es),
      description_es = COALESCE(p_description_es, description_es),
      location_es = COALESCE(p_location_es, location_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_guide_translations(
  p_id uuid,
  p_title_es text DEFAULT NULL,
  p_description_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE guides_and_training
  SET title_es = COALESCE(p_title_es, title_es),
      description_es = COALESCE(p_description_es, description_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_libation_recipe_translations(
  p_id uuid,
  p_procedure_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE libation_recipes
  SET procedure_es = COALESCE(p_procedure_es, procedure_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_cocktail_translations(
  p_id uuid,
  p_procedure_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE cocktails
  SET procedure_es = COALESCE(p_procedure_es, procedure_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_puree_syrup_recipe_translations(
  p_id uuid,
  p_procedure_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE puree_syrup_recipes
  SET procedure_es = COALESCE(p_procedure_es, procedure_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_summer_libation_recipe_translations(
  p_id uuid,
  p_procedure_es text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE summer_libation_recipes
  SET procedure_es = COALESCE(p_procedure_es, procedure_es),
      updated_at = now()
  WHERE id = p_id;
END;
$function$;


-- ============================================================
-- SECTION 14: Guide / signature recipe functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_guide(
  p_user_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_thumbnail_url text,
  p_file_url text,
  p_file_type text,
  p_file_name text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_guide_id UUID;
BEGIN
  INSERT INTO guides_and_training (
    title, description, category, thumbnail_url, file_url, file_type,
    file_name, display_order, created_by, organization_id
  ) VALUES (
    p_title, p_description, p_category, p_thumbnail_url, p_file_url, p_file_type,
    p_file_name, p_display_order, p_user_id, p_organization_id
  )
  RETURNING id INTO v_guide_id;
  RETURN v_guide_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_guide(
  p_user_id uuid,
  p_guide_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_thumbnail_url text,
  p_file_url text,
  p_file_type text,
  p_file_name text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE guides_and_training
  SET title = p_title, description = p_description, category = p_category,
      thumbnail_url = p_thumbnail_url, file_url = p_file_url, file_type = p_file_type,
      file_name = p_file_name, display_order = p_display_order, updated_at = now()
  WHERE id = p_guide_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_guide(
  p_user_id uuid,
  p_guide_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM guides_and_training
  WHERE id = p_guide_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_signature_recipe(
  p_user_id uuid,
  p_name text,
  p_price text,
  p_subcategory text,
  p_glassware text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_id UUID;
BEGIN
  INSERT INTO signature_recipes (
    name, price, subcategory, glassware, ingredients, procedure,
    thumbnail_url, display_order, created_by, organization_id
  ) VALUES (
    p_name, p_price, p_subcategory, p_glassware, p_ingredients, p_procedure,
    p_thumbnail_url, p_display_order, p_user_id, p_organization_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_signature_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_price text,
  p_subcategory text,
  p_glassware text,
  p_ingredients jsonb,
  p_procedure text,
  p_thumbnail_url text,
  p_display_order integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE signature_recipes
  SET name = p_name, price = p_price, subcategory = p_subcategory,
      glassware = p_glassware, ingredients = p_ingredients, procedure = p_procedure,
      thumbnail_url = p_thumbnail_url, display_order = p_display_order, updated_at = now()
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_signature_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM signature_recipes
  WHERE id = p_recipe_id
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
END;
$function$;
