-- Session 13 Part 2: Quiz refinements — picture questions, auto-close,
-- notify-on-activate, and per-user quiz notification dismissals.

-- ─── Picture questions ───────────────────────────────────────────────────
ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS question_image_url TEXT;

-- ─── Auto-close scheduling ──────────────────────────────────────────────
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS close_at TIMESTAMPTZ;

-- Push notification opt-in toggle (manager sets this on a draft exam,
-- then pressing Activate fires the push if it's on).
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS notify_on_activate BOOLEAN DEFAULT FALSE;

-- ─── Lazy auto-close RPC ────────────────────────────────────────────────
-- Client calls this at the top of fetchQuizzes — mirrors the
-- delete_expired_upcoming_events pattern from Session 8.
CREATE OR REPLACE FUNCTION close_expired_exams()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE exams
     SET status = 'closed',
         closed_at = now()
   WHERE status = 'active'
     AND close_at IS NOT NULL
     AND close_at < now();
$$;

GRANT EXECUTE ON FUNCTION close_expired_exams() TO public;

-- ─── Per-user quiz notification dismissals ─────────────────────────────
-- Used by the Welcome page notification bell dropdown to hide a quiz
-- notification entry after it's been tapped. Intentionally does NOT
-- drive the icon/tab/tile badges, which are derived from exam_results
-- presence so they persist until the quiz is actually taken.
CREATE TABLE IF NOT EXISTS quiz_notification_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exam_id)
);

ALTER TABLE quiz_notification_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qnd_all" ON quiz_notification_dismissals;
CREATE POLICY "qnd_all" ON quiz_notification_dismissals
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_quiz_notification_dismissals_user
  ON quiz_notification_dismissals(user_id);

-- ─── Per-user notification preference for quizzes ──────────────────────
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS quiz_notifications_enabled BOOLEAN DEFAULT TRUE;
