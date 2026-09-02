-- ============================================================================
-- s80 fix: sweep_expired_content / retire_content_storage RETURN TABLE
-- (bucket, file_url) — those OUT names collided with the ON CONFLICT
-- (bucket, file_url) column list (42702 "column reference is ambiguous",
-- caught on the first simulator load) AND the bare DELETEs on the temp tables
-- tripped the API role's safe-update guard (21000 "DELETE requires a WHERE
-- clause") — TRUNCATE instead. `#variable_conflict use_column` makes
-- bare names resolve to table columns inside the SQL; the OUT columns are
-- only ever fed by RETURN QUERY, which never references them bare.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.retire_content_storage(
  p_actor_id uuid, p_content_type text, p_content_id uuid
)
RETURNS TABLE (bucket text, file_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
#variable_conflict use_column
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

CREATE OR REPLACE FUNCTION public.sweep_expired_content(p_actor_id uuid)
RETURNS TABLE (bucket text, file_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
#variable_conflict use_column
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

GRANT EXECUTE ON FUNCTION public.retire_content_storage(uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_content(uuid) TO anon, authenticated;
