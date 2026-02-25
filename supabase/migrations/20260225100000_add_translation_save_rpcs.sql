-- Create SECURITY DEFINER RPCs for saving translations
-- These bypass RLS policies so translations can be saved from the client
-- after the main RPC save completes.

-- Announcements
CREATE OR REPLACE FUNCTION update_announcement_translations(
  p_id UUID,
  p_title_es TEXT DEFAULT NULL,
  p_content_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE announcements
  SET title_es = p_title_es, content_es = p_content_es
  WHERE id = p_id;
END;
$$;

-- Special Features
CREATE OR REPLACE FUNCTION update_special_feature_translations(
  p_id UUID,
  p_title_es TEXT DEFAULT NULL,
  p_content_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE special_features
  SET title_es = p_title_es, content_es = p_content_es
  WHERE id = p_id;
END;
$$;

-- Upcoming Events
CREATE OR REPLACE FUNCTION update_upcoming_event_translations(
  p_id UUID,
  p_title_es TEXT DEFAULT NULL,
  p_content_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE upcoming_events
  SET title_es = p_title_es, content_es = p_content_es
  WHERE id = p_id;
END;
$$;

-- Menu Items
CREATE OR REPLACE FUNCTION update_menu_item_translations(
  p_id UUID,
  p_name_es TEXT DEFAULT NULL,
  p_description_es TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE menu_items
  SET name_es = p_name_es, description_es = p_description_es
  WHERE id = p_id;
END;
$$;

-- Refresh PostgREST schema cache so it recognizes the new _es columns
NOTIFY pgrst, 'reload schema';
