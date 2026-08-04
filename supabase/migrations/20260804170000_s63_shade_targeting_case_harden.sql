-- s63b hardening: Postgres does not formally guarantee OR-operand evaluation
-- order, so the jsonb_array_length guard could in principle run against a
-- present-but-scalar data.job_titles and error the whole shade feed. CASE
-- guarantees sequential evaluation (docs-recommended). Semantics identical
-- to s63_shade_job_title_targeting; scalar/absent job_titles reads as
-- broadcast, non-empty array = holders only.
-- NOTE: deployed LIVE via Supabase MCP apply_migration (s63_shade_targeting_case_harden);
-- this file is the repo record. Visibility matrix re-verified identical post-apply.

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
       -- CASE (not OR) so the array-length guard can never be evaluated
       -- against a non-array value.
       AND (CASE
              WHEN jsonb_typeof(n.data->'job_titles') IS DISTINCT FROM 'array' THEN true
              WHEN jsonb_array_length(n.data->'job_titles') = 0 THEN true
              ELSE EXISTS (
                     SELECT 1 FROM jsonb_array_elements_text(n.data->'job_titles') jt
                      WHERE jt.value = ANY(v_titles)
                   )
            END)
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
     -- CASE (not OR) so the array-length guard can never be evaluated
     -- against a non-array value.
     AND (CASE
            WHEN jsonb_typeof(n.data->'job_titles') IS DISTINCT FROM 'array' THEN true
            WHEN jsonb_array_length(n.data->'job_titles') = 0 THEN true
            ELSE EXISTS (
                   SELECT 1 FROM jsonb_array_elements_text(n.data->'job_titles') jt
                    WHERE jt.value = ANY(v_titles)
                 )
          END);
  RETURN COALESCE(v_count, 0);
END;
$$;
