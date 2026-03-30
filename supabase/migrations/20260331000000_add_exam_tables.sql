-- ============================================
-- Weekly Quiz / Exam System
-- Tables: exams, exam_questions, exam_results, exam_reward_dismissals
-- RPCs: submit_exam_and_award_bucks, get_exam_completion_status
-- ============================================

-- 1. EXAMS TABLE
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('server', 'bartender', 'host')),
  cycle_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  time_limit_seconds INTEGER NOT NULL DEFAULT 300,
  created_by UUID REFERENCES users(id),
  activated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_type, cycle_key)
);

CREATE INDEX idx_exams_type_status ON exams(exam_type, status);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exams"
  ON exams FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can insert exams"
  ON exams FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update exams"
  ON exams FOR UPDATE TO public
  USING (true);

-- 2. EXAM QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  is_bonus BOOLEAN NOT NULL DEFAULT false,
  bonus_bucks_value INTEGER,
  source_type TEXT NOT NULL DEFAULT 'auto' CHECK (source_type IN ('auto', 'custom', 'bonus')),
  source_table TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exam_questions_exam_order ON exam_questions(exam_id, question_order);

ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exam questions"
  ON exam_questions FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can insert exam questions"
  ON exam_questions FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update exam questions"
  ON exam_questions FOR UPDATE TO public
  USING (true);

CREATE POLICY "Anyone can delete exam questions"
  ON exam_questions FOR DELETE TO public
  USING (true);

-- 3. EXAM RESULTS TABLE
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  bucks_awarded INTEGER NOT NULL DEFAULT 0,
  time_seconds INTEGER NOT NULL DEFAULT 0,
  is_timed_out BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id, user_id)
);

CREATE INDEX idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX idx_exam_results_user ON exam_results(user_id);

ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exam results"
  ON exam_results FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can insert exam results"
  ON exam_results FOR INSERT TO public
  WITH CHECK (true);

-- 4. EXAM REWARD DISMISSALS TABLE
CREATE TABLE IF NOT EXISTS exam_reward_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_result_id UUID NOT NULL REFERENCES exam_results(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exam_result_id)
);

ALTER TABLE exam_reward_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exam reward dismissals"
  ON exam_reward_dismissals FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can insert exam reward dismissals"
  ON exam_reward_dismissals FOR INSERT TO public
  WITH CHECK (true);

-- 5. RPC: submit_exam_and_award_bucks
-- Atomic transaction: insert result + create hidden reward transaction + update user balance
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
  v_existing UUID;
BEGIN
  -- Idempotency check: if result already exists, return existing id
  SELECT id INTO v_existing
  FROM exam_results
  WHERE exam_id = p_exam_id AND user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Insert exam result
  INSERT INTO exam_results (exam_id, user_id, answers, correct_count, total_questions, bucks_awarded, time_seconds, is_timed_out)
  VALUES (p_exam_id, p_user_id, p_answers, p_correct_count, p_total_questions, p_bucks_awarded, p_time_seconds, p_is_timed_out)
  RETURNING id INTO v_result_id;

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

-- 6. RPC: get_exam_completion_status
-- Returns employees who should take this exam type and their completion status
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
  SELECT
    u.id AS user_id,
    u.name::TEXT,
    u.profile_picture_url::TEXT,
    u.job_title::TEXT,
    (er.id IS NOT NULL) AS has_completed,
    COALESCE(er.correct_count, 0) AS correct_count,
    COALESCE(er.total_questions, 0) AS total_questions,
    COALESCE(er.bucks_awarded, 0) AS bucks_awarded
  FROM users u
  LEFT JOIN exam_results er ON er.user_id = u.id AND er.exam_id = p_exam_id
  WHERE u.is_active = true
    AND u.role = 'employee'
    AND (
      (p_exam_type = 'server' AND (u.job_title ILIKE '%Server%' OR u.job_title ILIKE '%Lead Server%' OR u.job_title ILIKE '%Busser%' OR u.job_title ILIKE '%Runner%'))
      OR (p_exam_type = 'bartender' AND u.job_title ILIKE '%Bartender%')
      OR (p_exam_type = 'host' AND u.job_title ILIKE '%Host%')
    )
  ORDER BY has_completed ASC, u.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
