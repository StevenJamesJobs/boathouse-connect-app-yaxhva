-- Manual Google-review refresh cap (10 / billing period, owner-only).
--
-- The refresh counter shares the org's existing credit period
-- (organization_menu_upload_credits.period_start) so it resets in LOCKSTEP with
-- the menu-upload credits — i.e. "everything resets at the same time." The
-- period is the existing rolling 1-month cycle; whichever credit RPC first
-- crosses the month boundary resets BOTH counters together.
--
-- Owners only: managers may not manually refresh (the owner pays for the
-- subscription / Outscraper usage). Auto-refresh (Mon/Thu cron) is free and does
-- NOT touch this counter.

ALTER TABLE public.organization_menu_upload_credits
  ADD COLUMN IF NOT EXISTS manual_refresh_used      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_refresh_allowance int NOT NULL DEFAULT 10;

-- ── Owner-only: read remaining manual refreshes (lazy-resets the shared period) ──
CREATE OR REPLACE FUNCTION public.get_review_refresh_quota(p_user_id uuid, p_organization_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'owner_only');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id RETURNING * INTO r;
  END IF;
  RETURN json_build_object(
    'success', true,
    'remaining', GREATEST(0, r.manual_refresh_allowance - r.manual_refresh_used),
    'allowance', r.manual_refresh_allowance,
    'used', r.manual_refresh_used,
    'period_start', r.period_start
  );
END;
$function$;

-- ── Owner-only: consume one manual refresh (lazy-reset, check, increment) ──
CREATE OR REPLACE FUNCTION public.consume_review_refresh(p_user_id uuid, p_organization_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE r public.organization_menu_upload_credits; v_remaining int;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id RETURNING * INTO r;
  END IF;
  v_remaining := r.manual_refresh_allowance - r.manual_refresh_used;
  IF v_remaining <= 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'limit_reached', 'remaining', 0,
      'allowance', r.manual_refresh_allowance);
  END IF;
  UPDATE public.organization_menu_upload_credits
     SET manual_refresh_used = r.manual_refresh_used + 1, updated_at = now()
   WHERE organization_id = p_organization_id;
  RETURN json_build_object('ok', true, 'remaining', GREATEST(0, v_remaining - 1),
    'allowance', r.manual_refresh_allowance);
END;
$function$;

-- ── Update the two menu-credit RPCs so a period reset ALSO clears the refresh
--    counter (keeps every credit in lockstep). Faithful reproductions of the
--    live definitions + `manual_refresh_used = 0` on reset; consume's in-memory
--    reset becomes an explicit UPDATE so the reset is actually persisted. ──
CREATE OR REPLACE FUNCTION public.get_menu_upload_quota(p_user_id uuid, p_organization_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE r public.organization_menu_upload_credits;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only the organization owner can view upload credits');
  END IF;
  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id
    RETURNING * INTO r;
  END IF;
  RETURN json_build_object(
    'success', true,
    'free_available', (NOT r.free_menu_upload_used),
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used),
    'monthly_allowance', r.monthly_allowance,
    'period_start', r.period_start,
    'costs', json_build_object('pdf', 3, 'image_per_page', 1, 'website', 5)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_menu_upload_credits(p_user_id uuid, p_organization_id uuid, p_source_type text, p_page_count integer DEFAULT 1)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE r public.organization_menu_upload_credits; v_cost int; v_remaining int;
BEGIN
  IF NOT public._is_org_owner(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'owner_only');
  END IF;
  IF p_source_type NOT IN ('pdf','image','website') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_source');
  END IF;
  IF p_source_type = 'website' THEN
    RETURN json_build_object('ok', false, 'reason', 'website_disabled');
  END IF;

  INSERT INTO public.organization_menu_upload_credits (organization_id)
    VALUES (p_organization_id) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO r FROM public.organization_menu_upload_credits
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF now() > r.period_start + interval '1 month' THEN
    UPDATE public.organization_menu_upload_credits
       SET period_used = 0, manual_refresh_used = 0, period_start = now(), updated_at = now()
     WHERE organization_id = p_organization_id
    RETURNING * INTO r;
  END IF;

  IF NOT r.free_menu_upload_used THEN
    UPDATE public.organization_menu_upload_credits
       SET free_menu_upload_used = true, updated_at = now()
     WHERE organization_id = p_organization_id;
    RETURN json_build_object('ok', true, 'charged', 0, 'free_used', true,
      'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used));
  END IF;

  v_cost := CASE p_source_type
              WHEN 'pdf'   THEN 3
              WHEN 'image' THEN GREATEST(1, COALESCE(p_page_count, 1))
            END;
  v_remaining := r.monthly_allowance - r.period_used;
  IF v_remaining < v_cost THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_credits',
      'required', v_cost, 'credits_remaining', GREATEST(0, v_remaining));
  END IF;
  UPDATE public.organization_menu_upload_credits
     SET period_used = r.period_used + v_cost, updated_at = now()
   WHERE organization_id = p_organization_id;
  RETURN json_build_object('ok', true, 'charged', v_cost, 'free_used', false,
    'credits_remaining', GREATEST(0, r.monthly_allowance - r.period_used - v_cost));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_review_refresh_quota(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_review_refresh(uuid, uuid) TO anon, authenticated;
