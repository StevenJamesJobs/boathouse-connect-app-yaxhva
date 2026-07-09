-- Forward fix for the ~2x McLoones-bucks quirk.
-- Applied to production via Supabase MCP on 2026-07-09 (cloud version 20260709030129).
-- Root cause: the AFTER INSERT trigger trigger_update_mcloones_bucks already credits
-- users.mcloones_bucks by NEW.amount on every rewards_transactions row. submit_exam_and_award_bucks
-- and reset_user_exam_attempt ALSO did an explicit UPDATE, double-counting. Fix = make the trigger
-- the single source of truth by removing the explicit UPDATE from both. Mirrors the precedent
-- 20260630000000_fix_redemption_double_deduction.sql. Existing Boathouse balances were separately
-- reconciled (data-only) to GREATEST(ledger_sum, 0). No client/app change required.

-- (1) submit_exam_and_award_bucks: drop the explicit balance UPDATE; keep the INSERT.
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
    -- Balance is credited exactly once by the AFTER INSERT trigger. No explicit UPDATE.
    INSERT INTO rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
    VALUES (p_user_id, p_bucks_awarded, 'Weekly Quiz Reward', false, p_user_id, p_organization_id);
  END IF;

  RETURN v_result_id;
END;
$function$;

-- (2) reset_user_exam_attempt: reverse the reward via a single (clamped) ledger row so the
-- trigger debits once; never negative. No explicit balance UPDATE. Lock the user row to keep
-- the clamp correct under concurrency.
CREATE OR REPLACE FUNCTION public.reset_user_exam_attempt(
  p_exam_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_actor_org  uuid;
  v_result_id  uuid;
  v_bucks      integer;
  v_balance    integer;
  v_clawback   integer;
BEGIN
  SELECT role, organization_id INTO v_actor_role, v_actor_org
    FROM public.users WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can reset a quiz attempt';
  END IF;
  IF v_actor_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cannot reset a quiz attempt in another organization';
  END IF;

  SELECT id, bucks_awarded INTO v_result_id, v_bucks
    FROM public.exam_results
   WHERE exam_id = p_exam_id AND user_id = p_user_id AND organization_id = p_organization_id;

  IF v_result_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(v_bucks, 0) > 0 THEN
    SELECT COALESCE(mcloones_bucks, 0) INTO v_balance FROM public.users WHERE id = p_user_id FOR UPDATE;
    v_clawback := LEAST(v_bucks, GREATEST(v_balance, 0));
    IF v_clawback > 0 THEN
      -- Trigger debits the balance exactly once for this negative ledger row.
      INSERT INTO public.rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
        VALUES (p_user_id, -v_clawback, 'Weekly Quiz reset — reward reversed', false, p_actor_id, p_organization_id);
    END IF;
  END IF;

  DELETE FROM public.exam_reward_dismissals WHERE exam_result_id = v_result_id;
  DELETE FROM public.exam_results WHERE id = v_result_id;
END;
$function$;
