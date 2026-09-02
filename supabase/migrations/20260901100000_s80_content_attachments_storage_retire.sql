-- ============================================================================
-- s80 · Content & Posts wave — one-time attachments + storage retirement
--
-- ADDITIVE. Nothing existing is dropped or re-signatured.
--
-- 1. content_attachments — one optional file per post (announcement /
--    special_feature / upcoming_event), the sibling of content_images. A
--    "one-time upload" that never lands in Guides & Training; deleted WITH the
--    post (manual delete and auto-expiry alike).
-- 2. storage_pending_deletes — the safety net. Postgres cannot delete storage
--    objects, so every retired URL is queued here FIRST, handed back to the
--    client, broker-deleted, then acked. A phone that loses signal between the
--    two calls leaves the row behind, and the next sweep hands it back again.
-- 3. RPCs (house discipline: DEFINER + search_path pin + actor gate + org
--    derived from the actor's row):
--      get_content_attachments   member  — batch read, like get_content_images
--      set_content_attachment    manager — upsert/clear; queues a replaced URL
--      retire_content_storage    manager — call BEFORE delete_<post>: queues
--                                          thumbnail + extra images + attachment
--      sweep_expired_content     member  — the expiry sweep for specials +
--                                          events; returns EVERY pending URL for
--                                          the org (older un-acked rows included)
--      ack_pending_deletes       manager — clears rows the broker has deleted
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.content_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('announcement', 'special_feature', 'upcoming_event')),
  content_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_attachments_org_lookup
  ON public.content_attachments (organization_id, content_type, content_id);
-- Deny-all by design (RLS on, zero policies): every read/write is a DEFINER RPC.
ALTER TABLE public.content_attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.storage_pending_deletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  bucket text NOT NULL,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, file_url)
);
CREATE INDEX IF NOT EXISTS idx_storage_pending_deletes_org
  ON public.storage_pending_deletes (organization_id);
ALTER TABLE public.storage_pending_deletes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- get_content_attachments — member-gated batch read (org derived from actor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_content_attachments(
  p_actor_id uuid, p_content_type text, p_content_ids uuid[]
)
RETURNS TABLE (content_id uuid, file_url text, file_name text, file_type text, size_bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT a.content_id, a.file_url, a.file_name, a.file_type, a.size_bytes
      FROM public.content_attachments a
     WHERE a.organization_id = v_org
       AND a.content_type = p_content_type
       AND a.content_id = ANY(COALESCE(p_content_ids, ARRAY[]::uuid[]));
END; $function$;

-- ----------------------------------------------------------------------------
-- set_content_attachment — upsert (or clear with NULL url). Returns the URLs it
-- retired (a replaced or cleared file), already queued in pending deletes, so
-- the client broker-deletes them and acks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_content_attachment(
  p_actor_id uuid, p_content_type text, p_content_id uuid,
  p_file_url text, p_file_name text,
  p_file_type text DEFAULT NULL, p_size_bytes bigint DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_parent_org uuid; v_old_url text; v_bucket text; v_retired text[] := ARRAY[]::text[];
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage content attachments';
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
  v_bucket := CASE p_content_type
    WHEN 'announcement' THEN 'announcements'
    WHEN 'special_feature' THEN 'special-features'
    ELSE 'upcoming-events' END;

  SELECT a.file_url INTO v_old_url FROM public.content_attachments a
   WHERE a.content_type = p_content_type AND a.content_id = p_content_id AND a.organization_id = v_org;

  IF v_old_url IS NOT NULL AND (p_file_url IS NULL OR v_old_url <> p_file_url) THEN
    INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    VALUES (v_org, v_bucket, v_old_url) ON CONFLICT (bucket, file_url) DO NOTHING;
    v_retired := array_append(v_retired, v_old_url);
  END IF;

  IF p_file_url IS NULL THEN
    DELETE FROM public.content_attachments
     WHERE content_type = p_content_type AND content_id = p_content_id AND organization_id = v_org;
  ELSE
    INSERT INTO public.content_attachments (organization_id, content_type, content_id, file_url, file_name, file_type, size_bytes)
    VALUES (v_org, p_content_type, p_content_id, p_file_url, COALESCE(p_file_name, ''), p_file_type, p_size_bytes)
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET file_url = EXCLUDED.file_url, file_name = EXCLUDED.file_name,
          file_type = EXCLUDED.file_type, size_bytes = EXCLUDED.size_bytes,
          organization_id = EXCLUDED.organization_id, created_at = now();
  END IF;
  RETURN v_retired;
END; $function$;

-- ----------------------------------------------------------------------------
-- retire_content_storage — call BEFORE delete_<post>. Queues every file the
-- post owns (thumbnail, extra images, attachment), drops the attachment row,
-- and returns (bucket, url) pairs for the broker delete. Leaves content_images
-- rows and the post itself to the existing delete_* RPC (atomic there).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retire_content_storage(
  p_actor_id uuid, p_content_type text, p_content_id uuid
)
RETURNS TABLE (bucket text, file_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_parent_org uuid; v_bucket text; v_thumb text;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage content attachments';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  IF p_content_type NOT IN ('announcement','special_feature','upcoming_event') THEN
    RAISE EXCEPTION 'Invalid content type';
  END IF;
  v_bucket := CASE p_content_type
    WHEN 'announcement' THEN 'announcements'
    WHEN 'special_feature' THEN 'special-features'
    ELSE 'upcoming-events' END;
  CASE p_content_type
    WHEN 'announcement' THEN
      SELECT a.organization_id, a.thumbnail_url INTO v_parent_org, v_thumb FROM public.announcements a WHERE a.id = p_content_id;
    WHEN 'special_feature' THEN
      SELECT s.organization_id, s.thumbnail_url INTO v_parent_org, v_thumb FROM public.special_features s WHERE s.id = p_content_id;
    ELSE
      SELECT e.organization_id, e.thumbnail_url INTO v_parent_org, v_thumb FROM public.upcoming_events e WHERE e.id = p_content_id;
  END CASE;
  IF v_parent_org IS NULL THEN RAISE EXCEPTION 'Content item not found'; END IF;
  IF v_parent_org <> v_org THEN RAISE EXCEPTION 'Content item is not in your organization'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _retired (url text) ON COMMIT DROP;
  TRUNCATE _retired;  -- not DELETE: the API role runs under safe-update (21000 without WHERE)
  IF v_thumb IS NOT NULL AND v_thumb <> '' THEN INSERT INTO _retired VALUES (v_thumb); END IF;
  INSERT INTO _retired
    SELECT ci.image_url FROM public.content_images ci
     WHERE ci.content_type = p_content_type AND ci.content_id = p_content_id AND ci.organization_id = v_org;
  INSERT INTO _retired
    SELECT a.file_url FROM public.content_attachments a
     WHERE a.content_type = p_content_type AND a.content_id = p_content_id AND a.organization_id = v_org;

  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT DISTINCT v_org, v_bucket, r.url FROM _retired r WHERE r.url IS NOT NULL AND r.url <> ''
    ON CONFLICT (bucket, file_url) DO NOTHING;

  DELETE FROM public.content_attachments
   WHERE content_type = p_content_type AND content_id = p_content_id AND organization_id = v_org;

  RETURN QUERY SELECT DISTINCT v_bucket, r.url FROM _retired r WHERE r.url IS NOT NULL AND r.url <> '';
END; $function$;

-- ----------------------------------------------------------------------------
-- sweep_expired_content — replaces the client's two delete_expired_* calls.
-- Member-gated (employees trigger it from Home, as before). Deletes expired
-- specials + events with their image and attachment rows, queues every file,
-- then returns ALL pending rows for the org — the safety-net drain. A manager
-- client broker-deletes and acks; an employee client just refreshes (the
-- broker's delete action is manager-only) and the rows wait for a manager.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_content(p_actor_id uuid)
RETURNS TABLE (bucket text, file_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _expired (ctype text, cid uuid, thumb text) ON COMMIT DROP;
  TRUNCATE _expired;  -- not DELETE: the API role runs under safe-update (21000 without WHERE)
  INSERT INTO _expired
    SELECT 'special_feature', s.id, s.thumbnail_url FROM public.special_features s
     WHERE s.organization_id = v_org AND s.end_date_time IS NOT NULL
       AND s.end_date_time < now() AND s.is_active = true;
  INSERT INTO _expired
    SELECT 'upcoming_event', e.id, e.thumbnail_url FROM public.upcoming_events e
     WHERE e.organization_id = v_org AND e.end_date_time IS NOT NULL
       AND e.end_date_time < now() AND e.is_active = true;

  INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
    SELECT DISTINCT v_org,
           CASE x.ctype WHEN 'special_feature' THEN 'special-features' ELSE 'upcoming-events' END,
           u.url
      FROM _expired x
      CROSS JOIN LATERAL (
        SELECT x.thumb AS url
        UNION ALL
        SELECT ci.image_url FROM public.content_images ci
         WHERE ci.content_type = x.ctype AND ci.content_id = x.cid AND ci.organization_id = v_org
        UNION ALL
        SELECT a.file_url FROM public.content_attachments a
         WHERE a.content_type = x.ctype AND a.content_id = x.cid AND a.organization_id = v_org
      ) u
     WHERE u.url IS NOT NULL AND u.url <> ''
    ON CONFLICT (bucket, file_url) DO NOTHING;

  DELETE FROM public.content_attachments a
   USING _expired x
   WHERE a.content_type = x.ctype AND a.content_id = x.cid AND a.organization_id = v_org;
  DELETE FROM public.content_images ci
   USING _expired x
   WHERE ci.content_type = x.ctype AND ci.content_id = x.cid AND ci.organization_id = v_org;
  DELETE FROM public.special_features s
   USING _expired x
   WHERE x.ctype = 'special_feature' AND s.id = x.cid AND s.organization_id = v_org;
  DELETE FROM public.upcoming_events e
   USING _expired x
   WHERE x.ctype = 'upcoming_event' AND e.id = x.cid AND e.organization_id = v_org;

  RETURN QUERY
    SELECT p.bucket, p.file_url FROM public.storage_pending_deletes p
     WHERE p.organization_id = v_org
     ORDER BY p.created_at ASC
     LIMIT 200;
END; $function$;

-- ----------------------------------------------------------------------------
-- ack_pending_deletes — the broker has removed these; forget them.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ack_pending_deletes(p_actor_id uuid, p_file_urls text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_n integer;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_role IS NULL OR v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can manage content attachments';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Actor has no organization'; END IF;
  DELETE FROM public.storage_pending_deletes p
   WHERE p.organization_id = v_org AND p.file_url = ANY(COALESCE(p_file_urls, ARRAY[]::text[]));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_content_attachments(uuid, text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_content_attachment(uuid, text, uuid, text, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_content_storage(uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_content(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_pending_deletes(uuid, text[]) TO anon, authenticated;
