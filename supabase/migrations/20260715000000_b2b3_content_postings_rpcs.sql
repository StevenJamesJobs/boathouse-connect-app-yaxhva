-- B2/B3 content-postings lockdown: announcements, special_features, upcoming_events, content_images
--
-- Before this migration: special_features / upcoming_events / content_images were TO-public
-- USING(true) on all four ops; announcements SELECT was world-readable (is_active=true, NO org
-- filter). The existing write RPCs trusted a client-supplied p_organization_id (optional — NULL
-- bypassed the org check entirely), the announcement/special-feature writers had no role gate,
-- delete_expired_*(NULL) deleted expired rows for EVERY org, and none were search_path-pinned.
-- content_images additionally relied on the set_default_organization_id trigger, which backfills
-- the BOATHOUSE org on NULL-org inserts (cross-org write hazard) — all writes now set org explicitly.
--
-- This migration is ADDITIVE/in-place only — no policies are dropped here. Teardown (Phase C) list:
--   announcements: "Only managers can delete announcements", "Only managers can insert announcements",
--     "Only managers can update announcements" (auth.uid()-based, never match), "Anon can view active
--     announcements", "Public can view active announcements"
--   special_features / upcoming_events: "Allow authenticated DELETE/INSERT/UPDATE on <table>",
--     "Allow public SELECT on <table>" (roles are actually {public} on all four)
--   content_images: "Anyone can read/insert/update/delete content images"
--   + useUnreadContent holds 3 realtime INSERT subs on the postings tables (pair SELECT-policy drops
--     with a polling fallback), and the old-client delete_expired_*(p_organization_id-only) call shape
--     becomes a no-op below (drop the compat default at teardown).
--
-- Reads return the FULL row (so select('*') callers keep their shape) plus a guide_file jsonb built
-- from guides_and_training — the client previously used a PostgREST FK embed, which RPCs can't do.

-- ============================================================================
-- READ RPCS (member-gated, own-org only — content is never cross-org)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_announcements(
  p_actor_id uuid,
  p_id uuid DEFAULT NULL,
  p_include_inactive boolean DEFAULT false,
  p_limit integer DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, content text, created_by uuid, created_at timestamptz,
  updated_at timestamptz, thumbnail_url text, thumbnail_shape text, message text,
  priority text, visibility text, display_order integer, is_active boolean,
  link text, guide_file_id uuid, title_es text, content_es text,
  organization_id uuid, guide_file jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_mgr boolean; v_all boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_mgr := v_role IN ('manager','owner');
  -- Editor mode (managers only): every row, every visibility, inactive included —
  -- matches the editor's historical unfiltered select('*').
  v_all := COALESCE(p_include_inactive, false) AND v_mgr;
  RETURN QUERY
    SELECT a.id, a.title, a.content, a.created_by, a.created_at, a.updated_at,
           a.thumbnail_url, a.thumbnail_shape, a.message, a.priority, a.visibility,
           a.display_order, a.is_active, a.link, a.guide_file_id, a.title_es,
           a.content_es, a.organization_id,
           CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', g.id, 'title', g.title, 'file_url', g.file_url,
             'file_name', g.file_name, 'file_type', g.file_type) END
      FROM public.announcements a
      LEFT JOIN public.guides_and_training g ON g.id = a.guide_file_id
     WHERE a.organization_id = v_org
       AND (p_id IS NULL OR a.id = p_id)
       AND (v_all OR a.is_active = true)
       AND (v_all
            OR (v_mgr AND a.visibility IN ('everyone','managers'))
            OR (NOT v_mgr AND a.visibility IN ('everyone','employees')))
     ORDER BY a.display_order ASC, a.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_special_features(
  p_actor_id uuid,
  p_id uuid DEFAULT NULL,
  p_include_inactive boolean DEFAULT false,
  p_limit integer DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, content text, message text, thumbnail_url text,
  thumbnail_shape text, start_date_time timestamptz, end_date_time timestamptz,
  display_order integer, is_active boolean, created_by uuid, created_at timestamptz,
  updated_at timestamptz, link text, guide_file_id uuid, title_es text,
  content_es text, organization_id uuid, guide_file jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_all boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_all := COALESCE(p_include_inactive, false) AND v_role IN ('manager','owner');
  RETURN QUERY
    SELECT s.id, s.title, s.content, s.message, s.thumbnail_url, s.thumbnail_shape,
           s.start_date_time, s.end_date_time, s.display_order, s.is_active,
           s.created_by, s.created_at, s.updated_at, s.link, s.guide_file_id,
           s.title_es, s.content_es, s.organization_id,
           CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', g.id, 'title', g.title, 'file_url', g.file_url,
             'file_name', g.file_name, 'file_type', g.file_type) END
      FROM public.special_features s
      LEFT JOIN public.guides_and_training g ON g.id = s.guide_file_id
     WHERE s.organization_id = v_org
       AND (p_id IS NULL OR s.id = p_id)
       AND (v_all OR s.is_active = true)
     ORDER BY s.display_order ASC, s.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_upcoming_events(
  p_actor_id uuid,
  p_id uuid DEFAULT NULL,
  p_include_inactive boolean DEFAULT false,
  p_limit integer DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, content text, message text, thumbnail_url text,
  thumbnail_shape text, start_date_time timestamptz, end_date_time timestamptz,
  display_order integer, is_active boolean, created_by uuid, created_at timestamptz,
  updated_at timestamptz, link text, guide_file_id uuid, category text,
  title_es text, content_es text, organization_id uuid, guide_file jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_all boolean;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  v_all := COALESCE(p_include_inactive, false) AND v_role IN ('manager','owner');
  RETURN QUERY
    SELECT e.id, e.title, e.content, e.message, e.thumbnail_url, e.thumbnail_shape,
           e.start_date_time, e.end_date_time, e.display_order, e.is_active,
           e.created_by, e.created_at, e.updated_at, e.link, e.guide_file_id,
           e.category, e.title_es, e.content_es, e.organization_id,
           CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', g.id, 'title', g.title, 'file_url', g.file_url,
             'file_name', g.file_name, 'file_type', g.file_type) END
      FROM public.upcoming_events e
      LEFT JOIN public.guides_and_training g ON g.id = e.guide_file_id
     WHERE e.organization_id = v_org
       AND (p_id IS NULL OR e.id = p_id)
       AND (v_all OR e.is_active = true)
     ORDER BY e.display_order ASC, e.created_at DESC
     LIMIT COALESCE(p_limit, 2147483647);
END; $function$;

-- Serves both the single (1-element array) and batch util paths. Org-scoped: closes
-- the bug where every caller omitted the optional org filter and read cross-org.
CREATE OR REPLACE FUNCTION public.get_content_images(
  p_actor_id uuid,
  p_content_type text,
  p_content_ids uuid[]
)
RETURNS TABLE(content_id uuid, image_url text, display_order integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR p_content_ids IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT ci.content_id, ci.image_url, ci.display_order
      FROM public.content_images ci
     WHERE ci.organization_id = v_org
       AND ci.content_type = p_content_type
       AND ci.content_id = ANY(p_content_ids)
     ORDER BY ci.display_order ASC;
END; $function$;

-- ============================================================================
-- WRITE HARDENING — announcements
-- (in place, same arg names; org now DERIVED from the actor, p_organization_id
--  validated when supplied instead of trusted; manager/owner gate; sp pinned)
-- ============================================================================

-- Return type changes void -> uuid, so DROP + recreate (named-arg clients unaffected;
-- old clients ignore the return). Kills the racy "select newest id after insert" read.
DROP FUNCTION IF EXISTS public.create_announcement(uuid, text, text, text, text, text, text, integer, text, uuid, uuid);
CREATE FUNCTION public.create_announcement(
  p_user_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_priority text DEFAULT 'medium', p_visibility text DEFAULT 'everyone',
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can create announcements';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  INSERT INTO public.announcements (title, content, message, thumbnail_url, thumbnail_shape,
    priority, visibility, display_order, created_by, link, guide_file_id, organization_id)
  VALUES (p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_priority, p_visibility, p_display_order, p_user_id, p_link, p_guide_file_id, v_org)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_announcement(
  p_user_id uuid, p_announcement_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_priority text DEFAULT 'medium', p_visibility text DEFAULT 'everyone',
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can update announcements';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  UPDATE public.announcements
     SET title = p_title, content = p_message, message = p_message,
         thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
         priority = p_priority, visibility = p_visibility,
         display_order = p_display_order, updated_at = now(),
         link = p_link, guide_file_id = p_guide_file_id
   WHERE id = p_announcement_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_announcement(
  p_user_id uuid, p_announcement_id uuid, p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can delete announcements';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  -- The editors historically cleaned images AFTER the parent row was gone, so the
  -- cascade must live server-side (also atomic). Storage binaries are B4's problem.
  DELETE FROM public.content_images
   WHERE content_type = 'announcement' AND content_id = p_announcement_id AND organization_id = v_org;
  DELETE FROM public.announcements WHERE id = p_announcement_id AND organization_id = v_org;
  RETURN FOUND;
END; $function$;

-- ============================================================================
-- WRITE HARDENING — special_features
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_special_feature(uuid, text, text, text, text, timestamptz, timestamptz, integer, text, uuid, uuid);
CREATE FUNCTION public.create_special_feature(
  p_user_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL, p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can create special features';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  INSERT INTO public.special_features (title, content, message, thumbnail_url, thumbnail_shape,
    start_date_time, end_date_time, display_order, created_by, link, guide_file_id, organization_id)
  VALUES (p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_start_date_time, p_end_date_time, p_display_order, p_user_id, p_link, p_guide_file_id, v_org)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_special_feature(
  p_user_id uuid, p_feature_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL, p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can update special features';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  UPDATE public.special_features
     SET title = p_title, content = p_message, message = p_message,
         thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
         start_date_time = p_start_date_time, end_date_time = p_end_date_time,
         display_order = p_display_order, updated_at = now(),
         link = p_link, guide_file_id = p_guide_file_id
   WHERE id = p_feature_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_special_feature(
  p_user_id uuid, p_feature_id uuid, p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can delete special features';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  DELETE FROM public.content_images
   WHERE content_type = 'special_feature' AND content_id = p_feature_id AND organization_id = v_org;
  DELETE FROM public.special_features WHERE id = p_feature_id AND organization_id = v_org;
END; $function$;

-- ============================================================================
-- WRITE HARDENING — upcoming_events (create/update were already role-gated;
-- they now also derive the org and are pinned; delete gains the gate it lacked)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_upcoming_event(
  p_user_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL, p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_category text DEFAULT 'Event',
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_event_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can create upcoming events';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  INSERT INTO public.upcoming_events (title, content, message, thumbnail_url, thumbnail_shape,
    start_date_time, end_date_time, display_order, is_active, link, guide_file_id, category, organization_id)
  VALUES (p_title, p_message, p_message, p_thumbnail_url, p_thumbnail_shape,
    p_start_date_time, p_end_date_time, p_display_order, true, p_link, p_guide_file_id,
    COALESCE(p_category, 'Event'), v_org)
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_upcoming_event(
  p_user_id uuid, p_event_id uuid, p_title text, p_message text,
  p_thumbnail_url text DEFAULT NULL, p_thumbnail_shape text DEFAULT 'square',
  p_start_date_time timestamptz DEFAULT NULL, p_end_date_time timestamptz DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_link text DEFAULT NULL,
  p_guide_file_id uuid DEFAULT NULL, p_category text DEFAULT 'Event',
  p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can update upcoming events';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  UPDATE public.upcoming_events
     SET title = p_title, content = p_message, message = p_message,
         thumbnail_url = p_thumbnail_url, thumbnail_shape = p_thumbnail_shape,
         start_date_time = p_start_date_time, end_date_time = p_end_date_time,
         display_order = p_display_order, link = p_link, guide_file_id = p_guide_file_id,
         category = COALESCE(p_category, 'Event'), updated_at = now()
   WHERE id = p_event_id AND organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_upcoming_event(
  p_user_id uuid, p_event_id uuid, p_organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers can delete upcoming events';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org THEN
    RAISE EXCEPTION 'Organization mismatch';
  END IF;
  DELETE FROM public.content_images
   WHERE content_type = 'upcoming_event' AND content_id = p_event_id AND organization_id = v_org;
  DELETE FROM public.upcoming_events WHERE id = p_event_id AND organization_id = v_org;
END; $function$;

-- ============================================================================
-- delete_expired_* — the old 1-arg shape let ANYONE (anon included) delete
-- expired rows for EVERY org (NULL = global). New shape: actor-derived own-org
-- cleanup, member-gated (employees trigger it from Home). Old named-arg clients
-- ({p_organization_id: x}) still resolve and become a safe RETURN 0 no-op.
-- ============================================================================

DROP FUNCTION IF EXISTS public.delete_expired_special_features(uuid);
CREATE FUNCTION public.delete_expired_special_features(
  p_actor_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_deleted_count integer;
BEGIN
  IF p_actor_id IS NULL THEN RETURN 0; END IF;  -- old-client compat: no-op
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.content_images ci
   WHERE ci.content_type = 'special_feature' AND ci.organization_id = v_org
     AND ci.content_id IN (
       SELECT s.id FROM public.special_features s
        WHERE s.organization_id = v_org AND s.end_date_time IS NOT NULL
          AND s.end_date_time < now() AND s.is_active = true);
  DELETE FROM public.special_features s
   WHERE s.organization_id = v_org AND s.end_date_time IS NOT NULL
     AND s.end_date_time < now() AND s.is_active = true;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END; $function$;

DROP FUNCTION IF EXISTS public.delete_expired_upcoming_events(uuid);
CREATE FUNCTION public.delete_expired_upcoming_events(
  p_actor_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_deleted_count integer;
BEGIN
  IF p_actor_id IS NULL THEN RETURN 0; END IF;  -- old-client compat: no-op
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.content_images ci
   WHERE ci.content_type = 'upcoming_event' AND ci.organization_id = v_org
     AND ci.content_id IN (
       SELECT e.id FROM public.upcoming_events e
        WHERE e.organization_id = v_org AND e.end_date_time IS NOT NULL
          AND e.end_date_time < now() AND e.is_active = true);
  DELETE FROM public.upcoming_events e
   WHERE e.organization_id = v_org AND e.end_date_time IS NOT NULL
     AND e.end_date_time < now() AND e.is_active = true;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END; $function$;

-- ============================================================================
-- content_images write — full-set replace matching saveContentImages semantics
-- (delete-then-insert of the ordered set; empty array = delete-all). Parent row
-- must exist in the actor's org; organization_id set explicitly (never the
-- Boathouse-backfill trigger).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.replace_content_images(
  p_actor_id uuid, p_content_type text, p_content_id uuid, p_image_urls text[]
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_parent_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage content images';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_content_type NOT IN ('announcement','special_feature','upcoming_event') THEN
    RAISE EXCEPTION 'Invalid content type';
  END IF;
  v_parent_org := CASE p_content_type
    WHEN 'announcement'    THEN (SELECT a.organization_id FROM public.announcements a    WHERE a.id = p_content_id)
    WHEN 'special_feature' THEN (SELECT s.organization_id FROM public.special_features s WHERE s.id = p_content_id)
    WHEN 'upcoming_event'  THEN (SELECT e.organization_id FROM public.upcoming_events e  WHERE e.id = p_content_id)
  END;
  IF v_parent_org IS NULL THEN RAISE EXCEPTION 'Content item not found'; END IF;
  IF v_parent_org <> v_org THEN RAISE EXCEPTION 'Content item is not in your organization'; END IF;
  DELETE FROM public.content_images
   WHERE content_type = p_content_type AND content_id = p_content_id AND organization_id = v_org;
  INSERT INTO public.content_images (content_type, content_id, image_url, display_order, organization_id)
  SELECT p_content_type, p_content_id, u.url, (u.idx - 1)::integer, v_org
    FROM unnest(COALESCE(p_image_urls, ARRAY[]::text[])) WITH ORDINALITY AS u(url, idx);
  RETURN TRUE;
END; $function$;

-- ============================================================================
-- Reorder RPCs — replace the editors' direct display_order updates
-- (move up/down, drag, position picker, and the events expire-resequence).
-- Clones of reorder_menu_items: gate, every id must be in the actor's org, reindex 0..N-1.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reorder_announcements(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reorder announcements';
  END IF;
  IF p_ordered_ids IS NULL OR array_length(p_ordered_ids, 1) IS NULL THEN RETURN TRUE; END IF;
  SELECT count(*) INTO v_n FROM public.announcements a
   WHERE a.id = ANY(p_ordered_ids) AND a.organization_id = v_org;
  IF v_n <> array_length(p_ordered_ids, 1) THEN
    RAISE EXCEPTION 'One or more announcements are not in your organization';
  END IF;
  UPDATE public.announcements a
     SET display_order = ord.idx - 1, updated_at = now()
    FROM (SELECT unnest(p_ordered_ids) AS id, generate_subscripts(p_ordered_ids, 1) AS idx) ord
   WHERE a.id = ord.id AND a.organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_special_features(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reorder special features';
  END IF;
  IF p_ordered_ids IS NULL OR array_length(p_ordered_ids, 1) IS NULL THEN RETURN TRUE; END IF;
  SELECT count(*) INTO v_n FROM public.special_features s
   WHERE s.id = ANY(p_ordered_ids) AND s.organization_id = v_org;
  IF v_n <> array_length(p_ordered_ids, 1) THEN
    RAISE EXCEPTION 'One or more special features are not in your organization';
  END IF;
  UPDATE public.special_features s
     SET display_order = ord.idx - 1, updated_at = now()
    FROM (SELECT unnest(p_ordered_ids) AS id, generate_subscripts(p_ordered_ids, 1) AS idx) ord
   WHERE s.id = ord.id AND s.organization_id = v_org;
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.reorder_upcoming_events(p_actor_id uuid, p_ordered_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n int;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reorder upcoming events';
  END IF;
  IF p_ordered_ids IS NULL OR array_length(p_ordered_ids, 1) IS NULL THEN RETURN TRUE; END IF;
  SELECT count(*) INTO v_n FROM public.upcoming_events e
   WHERE e.id = ANY(p_ordered_ids) AND e.organization_id = v_org;
  IF v_n <> array_length(p_ordered_ids, 1) THEN
    RAISE EXCEPTION 'One or more events are not in your organization';
  END IF;
  UPDATE public.upcoming_events e
     SET display_order = ord.idx - 1, updated_at = now()
    FROM (SELECT unnest(p_ordered_ids) AS id, generate_subscripts(p_ordered_ids, 1) AS idx) ord
   WHERE e.id = ord.id AND e.organization_id = v_org;
  RETURN TRUE;
END; $function$;

-- ============================================================================
-- Grants (DROP+recreate loses prior grants; CREATE OR REPLACE keeps them —
-- granted on everything here anyway for explicitness)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_announcements(uuid, uuid, boolean, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_special_features(uuid, uuid, boolean, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_events(uuid, uuid, boolean, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_images(uuid, text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_announcement(uuid, text, text, text, text, text, text, integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_announcement(uuid, uuid, text, text, text, text, text, text, integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_announcement(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_special_feature(uuid, text, text, text, text, timestamptz, timestamptz, integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_special_feature(uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_special_feature(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_upcoming_event(uuid, text, text, text, text, timestamptz, timestamptz, integer, text, uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_upcoming_event(uuid, uuid, text, text, text, text, timestamptz, timestamptz, integer, text, uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_upcoming_event(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_special_features(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_upcoming_events(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_content_images(uuid, text, uuid, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_announcements(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_special_features(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_upcoming_events(uuid, uuid[]) TO anon, authenticated;
