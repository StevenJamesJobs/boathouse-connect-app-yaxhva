-- Batch B1.3b — reset_user_exam_attempt: owner/manager-gated quiz reset with bucks clawback [High]
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708224142).
-- Replaces the raw client-side DELETE (which relied on a public USING(true) RLS policy).
-- NOTE: the clamped explicit balance UPDATE here was later replaced by a single ledger row in
-- 20260709000000_fix_bucks_double_credit_submit_and_reset.sql (the ~2x bucks fix).
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
    INSERT INTO public.rewards_transactions (user_id, amount, description, is_visible, created_by, organization_id)
      VALUES (p_user_id, -v_bucks, 'Weekly Quiz reset — reward reversed', false, p_actor_id, p_organization_id);
    UPDATE public.users
       SET mcloones_bucks = GREATEST(COALESCE(mcloones_bucks, 0) - v_bucks, 0)
     WHERE id = p_user_id;
  END IF;

  DELETE FROM public.exam_reward_dismissals WHERE exam_result_id = v_result_id;
  DELETE FROM public.exam_results WHERE id = v_result_id;
END;
$function$;
