-- B2/B3 exams cluster lockdown: exams, exam_questions, exam_results (reads), exam_reward_dismissals,
-- quiz_notification_dismissals.
--
-- Before this migration every policy on these tables is `USING (true) / WITH CHECK (true)` for role
-- public (from 20260331000000_add_exam_tables.sql + 20260406000000 + 20260414000000): anon can read,
-- create, modify AND DELETE any org's exams, exam_questions and exam_results, forge results/scores,
-- and write dismissal rows for anyone. The exam PLAY/RESULTS writes are already centralized in
-- gated RPCs (start_exam_attempt, submit_exam_and_award_bucks, reset_user_exam_attempt) and the
-- manager tracker/activity reads in get_exam_completion_status/get_org_exam_activity — this batch
-- adds the missing surface: exam + exam_questions reads/writes (the editor, generator, player) and
-- the two exam-specific dismissal tables, plus the residual exam_results READS.
--
-- ADDITIVE only — no policies dropped here. Teardown (Phase C) list:
--   exams: "Anyone can view/insert/update exams"
--   exam_questions: "Anyone can view/insert/update/delete exam questions"
--   exam_results: "Anyone can view/insert/update/delete exam results"
--   exam_reward_dismissals: "Anyone can view/insert exam reward dismissals"
--   quiz_notification_dismissals: "qnd_all" (FOR ALL USING true)
-- Realtime: none of these tables are in the supabase_realtime publication → the useUnreadQuizzes
-- postgres_changes subs on exams/exam_results are already inert (badge works via poll/bus).
-- Conventions: org derived from the actor's users row; org written explicitly on INSERT (the
-- trg_default_org_id_* BEFORE INSERT triggers backfill the Boathouse org on NULL — never rely on
-- them). Reads empty-return / 0 on unknown actor; writes RAISE. correct_option is still returned to
-- players by get_exam_questions (behavior-preserving; server-side answer-hiding + server scoring is
-- a separate B5 anti-cheat item). exams UNIQUE(exam_type, cycle_key) is GLOBAL (cross-tenant) — a
-- known pre-existing quirk; create_exam mirrors the client's suffix-retry rather than rescoping it.

-- ============================================================================
-- READ RPCS
-- ============================================================================

-- One exam by id, or the most-recent exam of a type within an optional status set.
CREATE OR REPLACE FUNCTION public.get_exam(
  p_actor_id uuid, p_exam_id uuid DEFAULT NULL, p_exam_type text DEFAULT NULL, p_statuses text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid, exam_type text, cycle_key text, status text, time_limit_seconds integer,
  created_by uuid, activated_at timestamptz, closed_at timestamptz, created_at timestamptz,
  close_at timestamptz, notify_on_activate boolean, rewards_enabled boolean, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT e.id, e.exam_type, e.cycle_key, e.status, e.time_limit_seconds,
           e.created_by, e.activated_at, e.closed_at, e.created_at,
           e.close_at, e.notify_on_activate, e.rewards_enabled, e.organization_id
      FROM public.exams e
     WHERE e.organization_id = v_org
       AND (p_exam_id IS NULL OR e.id = p_exam_id)
       AND (p_exam_type IS NULL OR e.exam_type = p_exam_type)
       AND (p_statuses IS NULL OR e.status = ANY(p_statuses))
     ORDER BY e.created_at DESC
     LIMIT CASE WHEN p_exam_id IS NOT NULL THEN 1
                WHEN p_exam_type IS NOT NULL THEN 1
                ELSE 2147483647 END;
END; $function$;

-- Full question rows (incl. correct_option), ordered by question_order.
CREATE OR REPLACE FUNCTION public.get_exam_questions(p_actor_id uuid, p_exam_id uuid)
RETURNS TABLE(
  id uuid, exam_id uuid, question_order integer, question_text text,
  option_a text, option_b text, option_c text, option_d text, correct_option text,
  is_bonus boolean, bonus_bucks_value integer, source_type text, source_table text,
  created_at timestamptz, question_text_es text, option_a_es text, option_b_es text,
  option_c_es text, option_d_es text, question_image_url text, bucks_value integer,
  category_label text, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT q.id, q.exam_id, q.question_order, q.question_text,
           q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option,
           q.is_bonus, q.bonus_bucks_value, q.source_type, q.source_table,
           q.created_at, q.question_text_es, q.option_a_es, q.option_b_es,
           q.option_c_es, q.option_d_es, q.question_image_url, q.bucks_value,
           q.category_label, q.organization_id
      FROM public.exam_questions q
      JOIN public.exams e ON e.id = q.exam_id
     WHERE q.exam_id = p_exam_id AND e.organization_id = v_org
     ORDER BY q.question_order ASC;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_exam_question_count(p_actor_id uuid, p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_n integer;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  SELECT count(*)::int INTO v_n FROM public.exam_questions q JOIN public.exams e ON e.id = q.exam_id
   WHERE q.exam_id = p_exam_id AND e.organization_id = v_org;
  RETURN COALESCE(v_n, 0);
END; $function$;

-- Employee badge count: active exams the actor is eligible for (by job title) and hasn't completed.
-- Managers/owners return 0 (they administer quizzes, never take them).
CREATE OR REPLACE FUNCTION public.get_my_unread_quiz_count(p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_titles text[]; v_types text[] := ARRAY[]::text[]; v_n integer;
BEGIN
  SELECT u.role, u.organization_id,
         COALESCE(u.job_titles, CASE WHEN u.job_title IS NOT NULL THEN ARRAY[u.job_title] ELSE ARRAY[]::text[] END)
    INTO v_role, v_org, v_titles FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR v_role IN ('manager','owner') THEN RETURN 0; END IF;
  IF v_titles && ARRAY['Server','Lead Server','Busser','Runner'] THEN v_types := array_append(v_types, 'server'); END IF;
  IF v_titles && ARRAY['Bartender'] THEN v_types := array_append(v_types, 'bartender'); END IF;
  IF v_titles && ARRAY['Host'] THEN v_types := array_append(v_types, 'host'); END IF;
  IF array_length(v_types, 1) IS NULL THEN RETURN 0; END IF;
  SELECT count(*)::int INTO v_n
    FROM public.exams e
   WHERE e.organization_id = v_org AND e.status = 'active' AND e.exam_type = ANY(v_types)
     AND NOT EXISTS (SELECT 1 FROM public.exam_results r
                      WHERE r.exam_id = e.id AND r.user_id = p_actor_id AND r.completed_at IS NOT NULL);
  RETURN COALESCE(v_n, 0);
END; $function$;

-- Actor's own result for one exam (score + answers).
CREATE OR REPLACE FUNCTION public.get_my_exam_result(p_actor_id uuid, p_exam_id uuid)
RETURNS TABLE(
  id uuid, exam_id uuid, user_id uuid, answers jsonb, correct_count integer, total_questions integer,
  bucks_awarded integer, time_seconds integer, is_timed_out boolean, completed_at timestamptz,
  started_at timestamptz, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.exam_id, r.user_id, r.answers, r.correct_count, r.total_questions,
           r.bucks_awarded, r.time_seconds, r.is_timed_out, r.completed_at, r.started_at, r.organization_id
      FROM public.exam_results r
     WHERE r.exam_id = p_exam_id AND r.user_id = p_actor_id AND r.organization_id = v_org;
END; $function$;

-- Actor's own most-recent results (ExamRewardBlurb).
CREATE OR REPLACE FUNCTION public.get_my_recent_exam_results(p_actor_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(
  id uuid, exam_id uuid, correct_count integer, total_questions integer, bucks_awarded integer,
  completed_at timestamptz, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.exam_id, r.correct_count, r.total_questions, r.bucks_awarded, r.completed_at, r.organization_id
      FROM public.exam_results r
     WHERE r.user_id = p_actor_id AND r.organization_id = v_org AND r.completed_at IS NOT NULL
     ORDER BY r.completed_at DESC
     LIMIT COALESCE(p_limit, 5);
END; $function$;

-- Manager/owner reads one same-org member's result (exam-answer-review).
CREATE OR REPLACE FUNCTION public.get_user_exam_result(p_actor_id uuid, p_exam_id uuid, p_user_id uuid)
RETURNS TABLE(
  id uuid, exam_id uuid, user_id uuid, answers jsonb, correct_count integer, total_questions integer,
  bucks_awarded integer, time_seconds integer, is_timed_out boolean, completed_at timestamptz,
  started_at timestamptz, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can review other results'; END IF;
  RETURN QUERY
    SELECT r.id, r.exam_id, r.user_id, r.answers, r.correct_count, r.total_questions,
           r.bucks_awarded, r.time_seconds, r.is_timed_out, r.completed_at, r.started_at, r.organization_id
      FROM public.exam_results r
      JOIN public.users tu ON tu.id = r.user_id
     WHERE r.exam_id = p_exam_id AND r.user_id = p_user_id
       AND r.organization_id = v_org AND tu.organization_id = v_org;
END; $function$;

-- ============================================================================
-- EXAM WRITE RPCS (manager/owner)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_exam(p_actor_id uuid, p_exam_type text, p_cycle_key text)
RETURNS TABLE(
  id uuid, exam_type text, cycle_key text, status text, time_limit_seconds integer,
  created_by uuid, activated_at timestamptz, closed_at timestamptz, created_at timestamptz,
  close_at timestamptz, notify_on_activate boolean, rewards_enabled boolean, organization_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_key text := p_cycle_key;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can create exams'; END IF;
  BEGIN
    RETURN QUERY
      INSERT INTO public.exams (exam_type, cycle_key, status, time_limit_seconds, created_by, organization_id)
      VALUES (p_exam_type, v_key, 'draft', 300, p_actor_id, v_org)
      RETURNING exams.id, exams.exam_type, exams.cycle_key, exams.status, exams.time_limit_seconds,
                exams.created_by, exams.activated_at, exams.closed_at, exams.created_at,
                exams.close_at, exams.notify_on_activate, exams.rewards_enabled, exams.organization_id;
  EXCEPTION WHEN unique_violation THEN
    -- GLOBAL UNIQUE(exam_type, cycle_key) collision (cross-tenant) — mirror the client's suffix retry.
    v_key := p_cycle_key || '-' || substr(md5(random()::text), 1, 6);
    RETURN QUERY
      INSERT INTO public.exams (exam_type, cycle_key, status, time_limit_seconds, created_by, organization_id)
      VALUES (p_exam_type, v_key, 'draft', 300, p_actor_id, v_org)
      RETURNING exams.id, exams.exam_type, exams.cycle_key, exams.status, exams.time_limit_seconds,
                exams.created_by, exams.activated_at, exams.closed_at, exams.created_at,
                exams.close_at, exams.notify_on_activate, exams.rewards_enabled, exams.organization_id;
  END;
END; $function$;

-- Draft settings: only the provided fields change (COALESCE-merge). p_clear_close_at sets close_at NULL.
CREATE OR REPLACE FUNCTION public.update_exam_settings(
  p_actor_id uuid, p_exam_id uuid,
  p_time_limit_seconds integer DEFAULT NULL, p_close_at timestamptz DEFAULT NULL,
  p_clear_close_at boolean DEFAULT false, p_rewards_enabled boolean DEFAULT NULL,
  p_notify_on_activate boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can edit exams'; END IF;
  UPDATE public.exams e SET
     time_limit_seconds = COALESCE(p_time_limit_seconds, e.time_limit_seconds),
     close_at = CASE WHEN p_clear_close_at THEN NULL ELSE COALESCE(p_close_at, e.close_at) END,
     rewards_enabled = COALESCE(p_rewards_enabled, e.rewards_enabled),
     notify_on_activate = COALESCE(p_notify_on_activate, e.notify_on_activate)
   WHERE e.id = p_exam_id AND e.organization_id = v_org;
END; $function$;

-- Atomic activation: close any other active exam of the same type in-org, then activate this one.
CREATE OR REPLACE FUNCTION public.activate_exam(p_actor_id uuid, p_exam_id uuid, p_close_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_type text;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can activate exams'; END IF;
  SELECT e.exam_type INTO v_type FROM public.exams e WHERE e.id = p_exam_id AND e.organization_id = v_org;
  IF v_type IS NULL THEN RAISE EXCEPTION 'Exam not found'; END IF;
  UPDATE public.exams e SET status = 'closed', closed_at = now()
   WHERE e.organization_id = v_org AND e.exam_type = v_type AND e.status = 'active' AND e.id <> p_exam_id;
  UPDATE public.exams e SET
     status = 'active', activated_at = now(),
     close_at = COALESCE(p_close_at, e.close_at, (now() + interval '7 days')),
     notify_on_activate = false
   WHERE e.id = p_exam_id AND e.organization_id = v_org;
END; $function$;

-- Status transitions for pause/resume/close (resume does NOT re-close others — preserves current UX).
CREATE OR REPLACE FUNCTION public.set_exam_status(p_actor_id uuid, p_exam_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can change exam status'; END IF;
  IF p_status NOT IN ('active','paused','closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.exams e SET
     status = p_status,
     closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE e.closed_at END
   WHERE e.id = p_exam_id AND e.organization_id = v_org;
END; $function$;

-- ============================================================================
-- QUESTION WRITE RPCS (manager/owner)
-- ============================================================================

-- Bulk-insert generated questions; question_order = 1-based array position (mirrors the client).
CREATE OR REPLACE FUNCTION public.create_exam_questions(p_actor_id uuid, p_exam_id uuid, p_questions jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can add questions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = p_exam_id AND e.organization_id = v_org) THEN
    RAISE EXCEPTION 'Exam not found'; END IF;
  INSERT INTO public.exam_questions (
    exam_id, organization_id, question_order, question_text, option_a, option_b, option_c, option_d,
    correct_option, is_bonus, bonus_bucks_value, source_type, source_table, question_text_es,
    option_a_es, option_b_es, option_c_es, option_d_es, question_image_url, bucks_value, category_label)
  SELECT p_exam_id, v_org, ord::int,
         e->>'question_text', e->>'option_a', e->>'option_b', e->>'option_c', e->>'option_d',
         e->>'correct_option', COALESCE((e->>'is_bonus')::boolean, false),
         NULLIF(e->>'bonus_bucks_value','')::int, COALESCE(NULLIF(e->>'source_type',''),'auto'),
         e->>'source_table', e->>'question_text_es', e->>'option_a_es', e->>'option_b_es',
         e->>'option_c_es', e->>'option_d_es', e->>'question_image_url',
         NULLIF(e->>'bucks_value','')::int, e->>'category_label'
    FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS t(e, ord);
END; $function$;

-- Append a single custom/bonus question after the current max order.
CREATE OR REPLACE FUNCTION public.add_exam_question(p_actor_id uuid, p_exam_id uuid, p_question jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid; v_next integer; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can add questions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = p_exam_id AND e.organization_id = v_org) THEN
    RAISE EXCEPTION 'Exam not found'; END IF;
  SELECT COALESCE(max(q.question_order), 0) + 1 INTO v_next FROM public.exam_questions q WHERE q.exam_id = p_exam_id;
  INSERT INTO public.exam_questions (
    exam_id, organization_id, question_order, question_text, option_a, option_b, option_c, option_d,
    correct_option, is_bonus, bonus_bucks_value, source_type, source_table, question_text_es,
    option_a_es, option_b_es, option_c_es, option_d_es, question_image_url, bucks_value, category_label)
  VALUES (p_exam_id, v_org, v_next,
    p_question->>'question_text', p_question->>'option_a', p_question->>'option_b', p_question->>'option_c',
    p_question->>'option_d', p_question->>'correct_option', COALESCE((p_question->>'is_bonus')::boolean, false),
    NULLIF(p_question->>'bonus_bucks_value','')::int, COALESCE(NULLIF(p_question->>'source_type',''),'custom'),
    p_question->>'source_table', p_question->>'question_text_es', p_question->>'option_a_es',
    p_question->>'option_b_es', p_question->>'option_c_es', p_question->>'option_d_es',
    p_question->>'question_image_url', NULLIF(p_question->>'bucks_value','')::int, p_question->>'category_label')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- Flexible per-field update: only keys present in p_fields change.
CREATE OR REPLACE FUNCTION public.update_exam_question(p_actor_id uuid, p_question_id uuid, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can edit questions'; END IF;
  UPDATE public.exam_questions q SET
     question_text     = CASE WHEN p_fields ? 'question_text' THEN p_fields->>'question_text' ELSE q.question_text END,
     option_a          = CASE WHEN p_fields ? 'option_a' THEN p_fields->>'option_a' ELSE q.option_a END,
     option_b          = CASE WHEN p_fields ? 'option_b' THEN p_fields->>'option_b' ELSE q.option_b END,
     option_c          = CASE WHEN p_fields ? 'option_c' THEN p_fields->>'option_c' ELSE q.option_c END,
     option_d          = CASE WHEN p_fields ? 'option_d' THEN p_fields->>'option_d' ELSE q.option_d END,
     correct_option    = CASE WHEN p_fields ? 'correct_option' THEN p_fields->>'correct_option' ELSE q.correct_option END,
     is_bonus          = CASE WHEN p_fields ? 'is_bonus' THEN (p_fields->>'is_bonus')::boolean ELSE q.is_bonus END,
     bonus_bucks_value = CASE WHEN p_fields ? 'bonus_bucks_value' THEN NULLIF(p_fields->>'bonus_bucks_value','')::int ELSE q.bonus_bucks_value END,
     bucks_value       = CASE WHEN p_fields ? 'bucks_value' THEN NULLIF(p_fields->>'bucks_value','')::int ELSE q.bucks_value END,
     source_type       = CASE WHEN p_fields ? 'source_type' THEN p_fields->>'source_type' ELSE q.source_type END,
     source_table      = CASE WHEN p_fields ? 'source_table' THEN p_fields->>'source_table' ELSE q.source_table END,
     category_label    = CASE WHEN p_fields ? 'category_label' THEN p_fields->>'category_label' ELSE q.category_label END,
     question_text_es  = CASE WHEN p_fields ? 'question_text_es' THEN p_fields->>'question_text_es' ELSE q.question_text_es END,
     option_a_es       = CASE WHEN p_fields ? 'option_a_es' THEN p_fields->>'option_a_es' ELSE q.option_a_es END,
     option_b_es       = CASE WHEN p_fields ? 'option_b_es' THEN p_fields->>'option_b_es' ELSE q.option_b_es END,
     option_c_es       = CASE WHEN p_fields ? 'option_c_es' THEN p_fields->>'option_c_es' ELSE q.option_c_es END,
     option_d_es       = CASE WHEN p_fields ? 'option_d_es' THEN p_fields->>'option_d_es' ELSE q.option_d_es END,
     question_image_url = CASE WHEN p_fields ? 'question_image_url' THEN p_fields->>'question_image_url' ELSE q.question_image_url END
   WHERE q.id = p_question_id AND q.organization_id = v_org;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_exam_question(p_actor_id uuid, p_question_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can delete questions'; END IF;
  DELETE FROM public.exam_questions q WHERE q.id = p_question_id AND q.organization_id = v_org;
END; $function$;

-- ============================================================================
-- DISMISSAL RPCS (self-scoped)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dismiss_exam_reward(p_actor_id uuid, p_exam_result_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  INSERT INTO public.exam_reward_dismissals (user_id, exam_result_id, organization_id)
  VALUES (p_actor_id, p_exam_result_id, v_org)
  ON CONFLICT (user_id, exam_result_id) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_exam_reward_dismissals(p_actor_id uuid, p_result_ids uuid[])
RETURNS TABLE(exam_result_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.exam_result_id FROM public.exam_reward_dismissals d
     WHERE d.user_id = p_actor_id AND d.exam_result_id = ANY(p_result_ids);
END; $function$;

CREATE OR REPLACE FUNCTION public.dismiss_quiz_notification(p_actor_id uuid, p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  INSERT INTO public.quiz_notification_dismissals (user_id, exam_id, organization_id)
  VALUES (p_actor_id, p_exam_id, v_org)
  ON CONFLICT (user_id, exam_id) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_quiz_dismissals(p_actor_id uuid)
RETURNS TABLE(exam_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT d.exam_id FROM public.quiz_notification_dismissals d WHERE d.user_id = p_actor_id;
END; $function$;

-- ============================================================================
-- Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_exam(uuid, uuid, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_question_count(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_unread_quiz_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_exam_result(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_recent_exam_results(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_exam_result(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_exam_settings(uuid, uuid, integer, timestamptz, boolean, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_exam(uuid, uuid, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_exam_status(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_questions(uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_exam_question(uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_exam_question(uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exam_question(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_exam_reward(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_exam_reward_dismissals(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_quiz_notification(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quiz_dismissals(uuid) TO anon, authenticated;
