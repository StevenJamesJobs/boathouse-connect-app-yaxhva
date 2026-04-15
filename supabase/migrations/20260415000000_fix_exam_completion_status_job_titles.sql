-- Session 14 pre-work fix: tracker was missing users assigned to secondary roles
-- because it filtered on the legacy singular `job_title` column only.
-- Example: John Smith has job_title='Server' but job_titles=['Server','Bartender','Host']
-- — he would appear in the server tracker but not in bartender/host trackers even
-- though the quiz eligibility + badge system already honored job_titles.
-- Fix: mirror the COALESCE+array-operator pattern used by get_user_badge_totals.

CREATE OR REPLACE FUNCTION get_exam_completion_status(
  p_exam_id UUID,
  p_exam_type TEXT
) RETURNS TABLE (
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  job_title TEXT,
  has_completed BOOLEAN,
  correct_count INTEGER,
  total_questions INTEGER,
  bucks_awarded INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT
      u.id,
      u.name,
      u.profile_picture_url,
      COALESCE(
        u.job_titles,
        CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END
      ) AS job_titles_arr,
      u.job_title AS legacy_title
    FROM users u
    WHERE u.is_active = true
      AND u.role = 'employee'
  )
  SELECT
    e.id AS user_id,
    e.name::TEXT,
    e.profile_picture_url::TEXT,
    -- Surface the legacy singular column for display consistency, falling back
    -- to the first array entry if the legacy column is empty.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
