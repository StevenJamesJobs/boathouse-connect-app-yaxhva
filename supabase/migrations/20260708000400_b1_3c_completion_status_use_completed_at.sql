-- Batch B1.3c — get_exam_completion_status: align has_completed with the new completed_at lock.
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708224159).
-- BEFORE: has_completed = (er.id IS NOT NULL) — a started-but-unsubmitted row counted as completed.
-- AFTER : has_completed = (er.completed_at IS NOT NULL). Also pins search_path (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_exam_completion_status(p_exam_id uuid, p_exam_type text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, name text, profile_picture_url text, job_title text, has_completed boolean, correct_count integer, total_questions integer, bucks_awarded integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY WITH eligible AS (SELECT u.id, u.name, u.profile_picture_url, COALESCE(u.job_titles, CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END) AS job_titles_arr, u.job_title AS legacy_title FROM users u WHERE u.is_active = true AND u.role = 'employee' AND (p_organization_id IS NULL OR u.organization_id = p_organization_id)) SELECT e.id AS user_id, e.name::TEXT, e.profile_picture_url::TEXT, COALESCE(e.legacy_title, e.job_titles_arr[1])::TEXT AS job_title, (er.completed_at IS NOT NULL) AS has_completed, COALESCE(er.correct_count, 0)::INTEGER, COALESCE(er.total_questions, 0)::INTEGER, COALESCE(er.bucks_awarded, 0)::INTEGER FROM eligible e LEFT JOIN exam_results er ON er.user_id = e.id AND er.exam_id = p_exam_id WHERE (p_exam_type = 'server' AND e.job_titles_arr && ARRAY['Server','Lead Server','Busser','Runner']) OR (p_exam_type = 'bartender' AND e.job_titles_arr && ARRAY['Bartender']) OR (p_exam_type = 'host' AND e.job_titles_arr && ARRAY['Host']) ORDER BY has_completed ASC, e.name ASC;
END; $function$;
