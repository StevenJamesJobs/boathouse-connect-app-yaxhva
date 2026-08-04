-- s63b (Steve smoke finding 2026-08-04): composer "By Job Title" broadcasts
-- filtered the PUSH correctly but the shade row appeared for the whole org.
-- Fix: rows whose data.job_titles is a non-empty array are visible only to
-- users holding one of those titles (legacy singular job_title honored, same
-- fallback the push edge fn uses). Broadcast rows (no job_titles key) and
-- every other notificationType keep their existing visibility. Both shade
-- readers (list + unread count) get the identical clause; signatures
-- unchanged so shipped clients are unaffected.
-- NOTE: deployed LIVE via Supabase MCP apply_migration (s63_shade_job_title_targeting);
-- this file is the repo record.

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_actor_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, title text, body text, created_at timestamptz, data jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_role text; v_org uuid; v_titles text[];
BEGIN
  SELECT u.role, u.organization_id,
         COALESCE(u.job_titles,
                  CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title]
                       ELSE ARRAY[]::text[] END)
    INTO v_role, v_org, v_titles
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.created_at, n.data
      FROM public.custom_notifications n
     WHERE n.organization_id = v_org
       AND COALESCE(n.data->>'notificationType','')
           NOT IN ('announcement','special_feature','event','weekly_special')
       AND (CASE COALESCE(n.data->>'notificationType','')
              WHEN 'redemption_requested' THEN v_role IN ('manager','owner')
              WHEN 'redemption_decision'  THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'leaderboard_pass'     THEN n.data->>'targetUserId' = p_actor_id::text
              WHEN 'retake_granted'       THEN v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text
              ELSE true
            END)
       -- Job-title-targeted rows are only for holders of a targeted title.
       AND (
         jsonb_typeof(n.data->'job_titles') IS DISTINCT FROM 'array'
         OR jsonb_array_length(n.data->'job_titles') = 0
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(n.data->'job_titles') jt
               WHERE jt.value = ANY(v_titles)
            )
       )
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT COALESCE(p_limit, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_actor_id uuid, p_since timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_role text; v_org uuid; v_titles text[]; v_count integer;
BEGIN
  SELECT u.role, u.organization_id,
         COALESCE(u.job_titles,
                  CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title]
                       ELSE ARRAY[]::text[] END)
    INTO v_role, v_org, v_titles
    FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  SELECT count(*)::integer INTO v_count
    FROM public.custom_notifications n
   WHERE n.organization_id = v_org
     AND n.created_at > COALESCE(p_since, '-infinity'::timestamptz)
     AND (CASE COALESCE(n.data->>'notificationType','')
            WHEN 'custom'         THEN true
            WHEN 'retake_granted' THEN v_role IN ('manager','owner') OR n.data->>'targetUserId' = p_actor_id::text
            ELSE false
          END)
     -- Job-title-targeted rows are only for holders of a targeted title.
     AND (
       jsonb_typeof(n.data->'job_titles') IS DISTINCT FROM 'array'
       OR jsonb_array_length(n.data->'job_titles') = 0
       OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(n.data->'job_titles') jt
             WHERE jt.value = ANY(v_titles)
          )
     );
  RETURN COALESCE(v_count, 0);
END;
$$;
