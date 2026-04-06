-- ============================================
-- Quiz Anti-Cheat: Server-Side started_at
-- Adds started_at column, UPDATE policy,
-- start_exam_attempt RPC, updated submit RPC
-- ============================================

-- 1. Add started_at column to exam_results
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- 2. Add UPDATE policy (currently only SELECT + INSERT exist)
CREATE POLICY "Anyone can update exam results"
  ON exam_results FOR UPDATE TO public
  USING (true);

-- 2b. Add DELETE policy for exam_results (needed for manager retake feature)
CREATE POLICY "Anyone can delete exam results"
  ON exam_results FOR DELETE TO public
  USING (true);

-- 3. RPC: start_exam_attempt
-- Called when user taps "Start Quiz". Creates partial row with started_at.
-- If already started, returns existing started_at for timer resume.
-- If already completed, returns completed flag.
CREATE OR REPLACE FUNCTION start_exam_attempt(
  p_exam_id UUID,
  p_user_id UUID
) RETURNS TABLE (
  result_id UUID,
  started_at TIMESTAMPTZ,
  is_completed BOOLEAN
) AS $$
DECLARE
  v_existing RECORD;
BEGIN
  SELECT er.id, er.started_at, er.completed_at, er.correct_count
  INTO v_existing
  FROM exam_results er
  WHERE er.exam_id = p_exam_id AND er.user_id = p_user_id;

  IF v_existing.id IS NOT NULL THEN
    -- Already has a row — check if completed (has answers submitted)
    RETURN QUERY SELECT
      v_existing.id,
      v_existing.started_at,
      (v_existing.completed_at IS NOT NULL AND v_existing.correct_count > 0)::BOOLEAN;
    RETURN;
  END IF;

  -- Fresh start: insert partial row with just started_at
  RETURN QUERY
  INSERT INTO exam_results (exam_id, user_id, started_at, completed_at)
  VALUES (p_exam_id, p_user_id, now(), NULL)
  RETURNING id, exam_results.started_at, false::BOOLEAN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Updated submit_exam_and_award_bucks
-- Now handles the case where a partial row exists from start_exam_attempt
CREATE OR REPLACE FUNCTION submit_exam_and_award_bucks(
  p_exam_id UUID,
  p_user_id UUID,
  p_answers JSONB,
  p_correct_count INTEGER,
  p_total_questions INTEGER,
  p_bucks_awarded INTEGER,
  p_time_seconds INTEGER,
  p_is_timed_out BOOLEAN
) RETURNS UUID AS $$
DECLARE
  v_result_id UUID;
  v_existing RECORD;
BEGIN
  -- Check for existing row
  SELECT id, completed_at, correct_count
  INTO v_existing
  FROM exam_results
  WHERE exam_id = p_exam_id AND user_id = p_user_id;

  IF v_existing.id IS NOT NULL THEN
    -- If already completed (has answers submitted), return existing id (idempotent)
    IF v_existing.completed_at IS NOT NULL AND v_existing.correct_count > 0 THEN
      RETURN v_existing.id;
    END IF;

    -- Partial row from start_exam_attempt — UPDATE with final results
    UPDATE exam_results
    SET answers = p_answers,
        correct_count = p_correct_count,
        total_questions = p_total_questions,
        bucks_awarded = p_bucks_awarded,
        time_seconds = p_time_seconds,
        is_timed_out = p_is_timed_out,
        completed_at = now()
    WHERE id = v_existing.id;

    v_result_id := v_existing.id;
  ELSE
    -- No existing row — INSERT as before (fallback for edge cases)
    INSERT INTO exam_results (exam_id, user_id, answers, correct_count, total_questions, bucks_awarded, time_seconds, is_timed_out, started_at)
    VALUES (p_exam_id, p_user_id, p_answers, p_correct_count, p_total_questions, p_bucks_awarded, p_time_seconds, p_is_timed_out, now())
    RETURNING id INTO v_result_id;
  END IF;

  -- Award McLoone's Bucks (only if > 0)
  IF p_bucks_awarded > 0 THEN
    -- Create hidden reward transaction
    INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by)
    VALUES (p_user_id, p_bucks_awarded, 'Weekly Quiz Reward', false, p_user_id);

    -- Update user balance
    UPDATE users
    SET mcloones_bucks = COALESCE(mcloones_bucks, 0) + p_bucks_awarded
    WHERE id = p_user_id;
  END IF;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
