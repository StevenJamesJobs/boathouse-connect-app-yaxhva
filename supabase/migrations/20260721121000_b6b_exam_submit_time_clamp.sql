-- B6b: server-side elapsed-time clamp in submit_exam_and_award_bucks.
-- The client reports p_time_seconds/p_is_timed_out from ITS OWN attempt clock,
-- so an offline-retake submit could claim a fresh small time. The server now
-- compares now() - exam_results.started_at (set once at start_exam_attempt and
-- never reset on re-entry) against exams.time_limit_seconds + 120s grace; past
-- that, the row is recorded timed-out regardless of what the client said.
-- Untimed quizzes (time_limit_seconds = 0) are unaffected. Grading trust
-- (p_correct_count/p_bucks_awarded) is unchanged - deeper anti-cheat stays on
-- the B5 backlog.
--
-- ROLLBACK: re-apply 20260709000000_fix_bucks_double_credit_submit_and_reset.sql's
-- definition of submit_exam_and_award_bucks (identical minus the clamp block).

CREATE OR REPLACE FUNCTION public.submit_exam_and_award_bucks(p_exam_id uuid, p_user_id uuid, p_answers jsonb, p_correct_count integer, p_total_questions integer, p_bucks_awarded integer, p_time_seconds integer, p_is_timed_out boolean, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result_id uuid;
  v_existing  RECORD;
  v_rewards_enabled boolean;
  v_time_limit integer;
  v_elapsed integer;
  v_time_seconds integer := p_time_seconds;
  v_is_timed_out boolean := p_is_timed_out;
BEGIN
  SELECT id, completed_at, started_at INTO v_existing
    FROM exam_results WHERE exam_id = p_exam_id AND user_id = p_user_id;

  SELECT rewards_enabled, time_limit_seconds INTO v_rewards_enabled, v_time_limit
    FROM exams WHERE id = p_exam_id;

  -- Server clock beats the client's attempt clock: past the limit (+120s
  -- grace for submit latency), the attempt is timed out no matter what the
  -- client reported. started_at is the ORIGINAL attempt start (idempotent in
  -- start_exam_attempt), so offline-retake submits can't reset it.
  IF v_existing.id IS NOT NULL AND v_existing.started_at IS NOT NULL
     AND COALESCE(v_time_limit, 0) > 0 THEN
    v_elapsed := GREATEST(0, floor(extract(epoch FROM (now() - v_existing.started_at))))::integer;
    IF v_elapsed > v_time_limit + 120 THEN
      v_is_timed_out := true;
      v_time_seconds := GREATEST(p_time_seconds, v_elapsed);
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.completed_at IS NOT NULL THEN
      RETURN v_existing.id;
    END IF;
    UPDATE exam_results
       SET answers = p_answers, correct_count = p_correct_count,
           total_questions = p_total_questions, bucks_awarded = p_bucks_awarded,
           time_seconds = v_time_seconds, is_timed_out = v_is_timed_out,
           completed_at = now()
     WHERE id = v_existing.id;
    v_result_id := v_existing.id;
  ELSE
    INSERT INTO exam_results
      (exam_id, user_id, answers, correct_count, total_questions,
       bucks_awarded, time_seconds, is_timed_out, started_at, organization_id)
    VALUES
      (p_exam_id, p_user_id, p_answers, p_correct_count, p_total_questions,
       p_bucks_awarded, v_time_seconds, v_is_timed_out, now(), p_organization_id)
    RETURNING id INTO v_result_id;
  END IF;

  IF p_bucks_awarded > 0 AND COALESCE(v_rewards_enabled, false) THEN
    -- Balance is credited exactly once by the AFTER INSERT trigger. No explicit UPDATE.
    INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (p_user_id, p_bucks_awarded, 'Weekly Quiz Reward', false, p_user_id, p_organization_id);
  END IF;

  RETURN v_result_id;
END;
$function$;
