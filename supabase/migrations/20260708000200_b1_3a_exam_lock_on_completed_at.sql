-- Batch B1.3a — submit_exam_and_award_bucks (+ start_exam_attempt): stop quiz farming [High]
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708224124).
-- Lock on completed_at ALONE (one graded submission per user/exam); award only when
-- rewards_enabled. NOTE: the explicit balance UPDATE here was later removed by
-- 20260709000000_fix_bucks_double_credit_submit_and_reset.sql (the ~2x bucks fix).
CREATE OR REPLACE FUNCTION public.submit_exam_and_award_bucks(
  p_exam_id uuid, p_user_id uuid, p_answers jsonb, p_correct_count integer,
  p_total_questions integer, p_bucks_awarded integer, p_time_seconds integer,
  p_is_timed_out boolean, p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result_id uuid;
  v_existing  RECORD;
  v_rewards_enabled boolean;
BEGIN
  SELECT id, completed_at INTO v_existing
    FROM exam_results WHERE exam_id = p_exam_id AND user_id = p_user_id;

  SELECT rewards_enabled INTO v_rewards_enabled FROM exams WHERE id = p_exam_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.completed_at IS NOT NULL THEN
      RETURN v_existing.id;
    END IF;
    UPDATE exam_results
       SET answers = p_answers, correct_count = p_correct_count,
           total_questions = p_total_questions, bucks_awarded = p_bucks_awarded,
           time_seconds = p_time_seconds, is_timed_out = p_is_timed_out,
           completed_at = now()
     WHERE id = v_existing.id;
    v_result_id := v_existing.id;
  ELSE
    INSERT INTO exam_results
      (exam_id, user_id, answers, correct_count, total_questions,
       bucks_awarded, time_seconds, is_timed_out, started_at, organization_id)
    VALUES
      (p_exam_id, p_user_id, p_answers, p_correct_count, p_total_questions,
       p_bucks_awarded, p_time_seconds, p_is_timed_out, now(), p_organization_id)
    RETURNING id INTO v_result_id;
  END IF;

  IF p_bucks_awarded > 0 AND COALESCE(v_rewards_enabled, false) THEN
    INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (p_user_id, p_bucks_awarded, 'Weekly Quiz Reward', false, p_user_id, p_organization_id);
    UPDATE users SET mcloones_bucks = COALESCE(mcloones_bucks, 0) + p_bucks_awarded WHERE id = p_user_id;
  END IF;

  RETURN v_result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(
  p_exam_id uuid, p_user_id uuid, p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(result_id uuid, started_at timestamp with time zone, is_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_existing RECORD;
BEGIN
  SELECT er.id, er.started_at, er.completed_at INTO v_existing
    FROM exam_results er WHERE er.exam_id = p_exam_id AND er.user_id = p_user_id;
  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing.id, v_existing.started_at, (v_existing.completed_at IS NOT NULL)::BOOLEAN;
    RETURN;
  END IF;
  RETURN QUERY
    INSERT INTO exam_results (exam_id, user_id, started_at, completed_at, organization_id)
    VALUES (p_exam_id, p_user_id, now(), NULL, p_organization_id)
    RETURNING id, exam_results.started_at, false::BOOLEAN;
END;
$function$;
