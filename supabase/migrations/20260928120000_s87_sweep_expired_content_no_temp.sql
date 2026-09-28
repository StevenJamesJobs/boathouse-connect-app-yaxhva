-- s87: sweep_expired_content without the per-call TEMP TABLE.
-- The app calls this as `anon` (statement_timeout 3s). The old body created a temp
-- table on EVERY call (catalog writes) and ran four DELETEs even when nothing had
-- expired; the Welcome page fires the sweep from three mount effects at once, so the
-- parallel calls queued behind each other's row locks and the 3s cap cancelled them
-- (57014 "canceling statement due to statement timeout"). Same signature, same
-- contract: delete the actor org's expired specials + events, queue their files in
-- storage_pending_deletes, return the org's pending files (200). Fast exit when
-- nothing has expired — the common case is now three cheap SELECTs and no writes.
-- Grants are untouched (CREATE OR REPLACE keeps them).
CREATE OR REPLACE FUNCTION public.sweep_expired_content(p_actor_id uuid)
 RETURNS TABLE(bucket text, file_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_sf uuid[];
  v_ue uuid[];
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;

  SELECT COALESCE(array_agg(s.id), '{}'::uuid[]) INTO v_sf
    FROM public.special_features s
   WHERE s.organization_id = v_org AND s.is_active = true
     AND s.end_date_time IS NOT NULL AND s.end_date_time < now();
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[]) INTO v_ue
    FROM public.upcoming_events e
   WHERE e.organization_id = v_org AND e.is_active = true
     AND e.end_date_time IS NOT NULL AND e.end_date_time < now();

  IF cardinality(v_sf) + cardinality(v_ue) > 0 THEN
    INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
      SELECT DISTINCT v_org, 'special-features', u.url
        FROM (
          SELECT s.thumbnail_url AS url FROM public.special_features s WHERE s.id = ANY(v_sf)
          UNION ALL
          SELECT ci.image_url FROM public.content_images ci
           WHERE ci.organization_id = v_org AND ci.content_type = 'special_feature' AND ci.content_id = ANY(v_sf)
          UNION ALL
          SELECT a.file_url FROM public.content_attachments a
           WHERE a.organization_id = v_org AND a.content_type = 'special_feature' AND a.content_id = ANY(v_sf)
        ) u
       WHERE u.url IS NOT NULL AND u.url <> ''
      ON CONFLICT (bucket, file_url) DO NOTHING;

    INSERT INTO public.storage_pending_deletes (organization_id, bucket, file_url)
      SELECT DISTINCT v_org, 'upcoming-events', u.url
        FROM (
          SELECT e.thumbnail_url AS url FROM public.upcoming_events e WHERE e.id = ANY(v_ue)
          UNION ALL
          SELECT ci.image_url FROM public.content_images ci
           WHERE ci.organization_id = v_org AND ci.content_type = 'upcoming_event' AND ci.content_id = ANY(v_ue)
          UNION ALL
          SELECT a.file_url FROM public.content_attachments a
           WHERE a.organization_id = v_org AND a.content_type = 'upcoming_event' AND a.content_id = ANY(v_ue)
        ) u
       WHERE u.url IS NOT NULL AND u.url <> ''
      ON CONFLICT (bucket, file_url) DO NOTHING;

    DELETE FROM public.content_attachments a
     WHERE a.organization_id = v_org
       AND ((a.content_type = 'special_feature' AND a.content_id = ANY(v_sf))
         OR (a.content_type = 'upcoming_event' AND a.content_id = ANY(v_ue)));
    DELETE FROM public.content_images ci
     WHERE ci.organization_id = v_org
       AND ((ci.content_type = 'special_feature' AND ci.content_id = ANY(v_sf))
         OR (ci.content_type = 'upcoming_event' AND ci.content_id = ANY(v_ue)));
    DELETE FROM public.special_features s WHERE s.organization_id = v_org AND s.id = ANY(v_sf);
    DELETE FROM public.upcoming_events e WHERE e.organization_id = v_org AND e.id = ANY(v_ue);
  END IF;

  RETURN QUERY
    SELECT p.bucket, p.file_url FROM public.storage_pending_deletes p
     WHERE p.organization_id = v_org
     ORDER BY p.created_at ASC
     LIMIT 200;
END; $function$;
