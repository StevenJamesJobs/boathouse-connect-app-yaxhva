-- B2/B3 session 47 Batch B-3: member-gated p_actor_id overloads for the 3 ungated subscription
-- fns (org derived server-side; the legacy p_organization_id sigs stay for old clients until
-- teardown). Distinct type signatures via a defaulted p_dummy so CREATE doesn't clobber the
-- legacy uuid sig; PostgREST disambiguates by JSON key name. upsert_organization_subscription
-- already carries p_actor_id (owner-gated, B1.4) -- only the client call site needs the fix.

-- Pin search_path on the 3 legacy sigs.
ALTER FUNCTION public.get_organization_subscription(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.initialize_org_trial(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.expire_org_trial(uuid) SET search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.get_organization_subscription(p_actor_id uuid, p_dummy boolean DEFAULT true)
RETURNS TABLE(
  subscription_tier text, trial_start_date timestamptz, trial_end_date timestamptz,
  revenuecat_customer_id text, current_period_start timestamptz, current_period_end timestamptz,
  trial_7d_notified boolean, trial_2d_notified boolean, trial_1d_notified boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT os.subscription_tier, os.trial_start_date, os.trial_end_date,
         os.revenuecat_customer_id, os.current_period_start, os.current_period_end,
         os.trial_7d_notified, os.trial_2d_notified, os.trial_1d_notified
  FROM public.organization_subscriptions os
  WHERE os.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = p_actor_id);
$$;

CREATE OR REPLACE FUNCTION public.initialize_org_trial(p_actor_id uuid, p_dummy boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  INSERT INTO public.organization_subscriptions (organization_id, subscription_tier, trial_start_date, trial_end_date)
  VALUES (v_org, 'trial', now(), now() + interval '14 days')
  ON CONFLICT (organization_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_org_trial(p_actor_id uuid, p_dummy boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  UPDATE public.organization_subscriptions
  SET subscription_tier = 'expired'
  WHERE organization_id = v_org
    AND subscription_tier = 'trial'
    AND trial_end_date <= now();
END; $$;

GRANT EXECUTE ON FUNCTION
  public.get_organization_subscription(uuid, boolean),
  public.initialize_org_trial(uuid, boolean),
  public.expire_org_trial(uuid, boolean)
TO anon, authenticated;
