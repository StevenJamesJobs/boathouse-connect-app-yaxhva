-- Session 13 Part 2 — per-user badge total RPC
--
-- Returns, for each user_id passed in, the sum of:
--   1) unread messages (mirrors get_unread_message_count logic)
--   2) active weekly quizzes the user is eligible for but has NOT yet completed
--
-- Used by the send-push-notification edge function to stamp the correct
-- per-recipient badge on APNs payloads, so that a quiz push does not stomp
-- a user's existing unread-message count (and vice versa) while the app is
-- backgrounded.

CREATE OR REPLACE FUNCTION public.get_user_badge_totals(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, badge_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH target_users AS (
    SELECT u.id,
           COALESCE(u.job_titles, CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END) AS job_titles
    FROM users u
    WHERE u.id = ANY(p_user_ids)
  ),
  -- Unread messages per user
  unread_msgs AS (
    SELECT mr.recipient_id AS uid, COUNT(*)::int AS cnt
    FROM message_recipients mr
    WHERE mr.recipient_id = ANY(p_user_ids)
      AND mr.is_read = FALSE
      AND mr.is_deleted = FALSE
    GROUP BY mr.recipient_id
  ),
  -- Active quizzes (one row per exam_type)
  active_quizzes AS (
    SELECT e.id, e.exam_type
    FROM exams e
    WHERE e.status = 'active'
  ),
  -- Per-user eligible active quizzes derived from job_titles.
  -- Mapping mirrors app/weekly-quizzes.tsx getEligibleQuizTypes:
  --   server   -> Server, Lead Server, Busser, Runner
  --   bartender-> Bartender
  --   host     -> Host
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
  -- Quizzes the user has already completed (has a results row with a score)
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
  SELECT
    tu.id AS user_id,
    (COALESCE(um.cnt, 0) + COALESCE(uq.cnt, 0))::int AS badge_total
  FROM target_users tu
  LEFT JOIN unread_msgs um ON um.uid = tu.id
  LEFT JOIN unread_quizzes uq ON uq.uid = tu.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_badge_totals(uuid[]) TO anon, authenticated, service_role;
