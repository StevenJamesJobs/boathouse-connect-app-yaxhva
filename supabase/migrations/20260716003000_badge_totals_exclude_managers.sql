-- Owners/managers administer weekly quizzes (create/reset/track completion) but never take
-- them — yet their accounts carry every job title, so the eligibility math counted the active
-- quiz and badged them (a phantom Tools "1" in-app and on the OS app-icon). Exclude
-- manager/owner roles from the quiz portion of the app-icon badge total. The client-side
-- useUnreadQuizzes hook gets the parallel role gate. Messages portion is unchanged.
CREATE OR REPLACE FUNCTION public.get_user_badge_totals(p_user_ids uuid[], p_organization_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, badge_total integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH target_users AS (
    SELECT u.id, u.role,
           COALESCE(u.job_titles, CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END) AS job_titles
      FROM users u WHERE u.id = ANY(p_user_ids)
  ),
  unread_msgs AS (
    SELECT mr.recipient_id AS uid, COUNT(*)::int AS cnt
      FROM message_recipients mr
     WHERE mr.recipient_id = ANY(p_user_ids) AND mr.is_read = FALSE AND mr.is_deleted = FALSE
     GROUP BY mr.recipient_id
  ),
  active_quizzes AS (
    SELECT e.id, e.exam_type FROM exams e
     WHERE e.status = 'active' AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
  ),
  user_eligible AS (
    SELECT tu.id AS uid, aq.id AS exam_id
      FROM target_users tu CROSS JOIN active_quizzes aq
     WHERE tu.role NOT IN ('manager','owner')   -- managers/owners don't take quizzes
       AND ((aq.exam_type = 'server' AND tu.job_titles && ARRAY['Server','Lead Server','Busser','Runner'])
         OR (aq.exam_type = 'bartender' AND tu.job_titles && ARRAY['Bartender'])
         OR (aq.exam_type = 'host' AND tu.job_titles && ARRAY['Host']))
  ),
  completed AS (
    SELECT ue.uid, ue.exam_id FROM user_eligible ue
      JOIN exam_results er ON er.exam_id = ue.exam_id AND er.user_id = ue.uid
     WHERE er.correct_count IS NOT NULL
  ),
  unread_quizzes AS (
    SELECT ue.uid, COUNT(*)::int AS cnt
      FROM user_eligible ue
      LEFT JOIN completed c ON c.uid = ue.uid AND c.exam_id = ue.exam_id
     WHERE c.exam_id IS NULL GROUP BY ue.uid
  )
  SELECT tu.id AS user_id, (COALESCE(um.cnt, 0) + COALESCE(uq.cnt, 0))::int AS badge_total
    FROM target_users tu
    LEFT JOIN unread_msgs um ON um.uid = tu.id
    LEFT JOIN unread_quizzes uq ON uq.uid = tu.id;
END; $function$;
