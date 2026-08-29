-- s77 Quizzes & Exams wave: quiz-level default Bucks value (fully additive).
-- NULL = legacy behavior ($1 split across the user's eligible quizzes).
-- A set value (0 allowed) is the per-correct fallback for questions without
-- their own bucks_value; 0 = a no-reward quiz.
-- Read/write ride two NEW fns (no drops, no overloads): get_exam/create_exam
-- keep their RETURNS TABLE shape untouched — folding the column into them is
-- a later, Steve-approved drop+recreate.

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS default_bucks_value integer;

CREATE OR REPLACE FUNCTION public.set_exam_default_bucks_value(p_actor_id uuid, p_exam_id uuid, p_value integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_role text; v_org uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF v_role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Only managers or owners can edit exams'; END IF;
  IF p_value IS NOT NULL AND p_value < 0 THEN RAISE EXCEPTION 'Invalid value'; END IF;
  UPDATE public.exams e SET default_bucks_value = p_value
   WHERE e.id = p_exam_id AND e.organization_id = v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.get_exam_default_bucks_value(p_actor_id uuid, p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_org uuid; v_val integer;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  SELECT e.default_bucks_value INTO v_val FROM public.exams e
   WHERE e.id = p_exam_id AND e.organization_id = v_org;
  RETURN v_val;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_exam_default_bucks_value(uuid, uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_exam_default_bucks_value(uuid, uuid) TO anon, authenticated, service_role;
