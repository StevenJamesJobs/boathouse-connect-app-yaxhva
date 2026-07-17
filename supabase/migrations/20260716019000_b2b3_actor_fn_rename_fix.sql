-- B2/B3 session 47 FIX: the dummy-param actor overloads (initialize_org_trial(uuid,boolean) etc.)
-- were one-arg-callable, colliding at the SQL positional-call level with the legacy single-uuid
-- sigs. signup_owner_with_org calls initialize_org_trial(v_org_id) POSITIONALLY -> 42725 "not
-- unique" -> onboarding "Create Restaurant" broke. Replace the 4 dummy overloads with distinctly
-- NAMED *_actor functions; the legacy single-arg sigs (used by old clients AND by internal server
-- callers like signup_owner_with_org) are untouched and now resolve unambiguously.
-- Client re-pointed: SubscriptionContext -> *_actor (3), setup-wizard -> seed_..._actor.

DROP FUNCTION IF EXISTS public.get_organization_subscription(uuid, boolean);
DROP FUNCTION IF EXISTS public.initialize_org_trial(uuid, boolean);
DROP FUNCTION IF EXISTS public.expire_org_trial(uuid, boolean);
DROP FUNCTION IF EXISTS public.seed_default_job_title_assistants(uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_organization_subscription_actor(p_actor_id uuid)
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

CREATE OR REPLACE FUNCTION public.initialize_org_trial_actor(p_actor_id uuid)
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

CREATE OR REPLACE FUNCTION public.expire_org_trial_actor(p_actor_id uuid)
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

CREATE OR REPLACE FUNCTION public.seed_default_job_title_assistants_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id = p_actor_id AND role = 'owner';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.job_title_assistants (organization_id, job_title, assistant_key)
  SELECT v_org, jt.title, m.assistant_key
  FROM public.organization_job_titles jt
  JOIN (VALUES
    ('server','server'), ('lead server','server'), ('manager','server'),
    ('bartender','bartender'), ('manager','bartender'), ('lead server','bartender'), ('banquet captain','bartender'),
    ('host','host'), ('manager','host'),
    ('busser','kitchen'), ('chef','kitchen'), ('cook','kitchen'), ('kitchen','kitchen'), ('manager','kitchen'), ('runner','kitchen'),
    ('server','check_outs'), ('lead server','check_outs'), ('manager','check_outs')
  ) AS m(std_title, assistant_key)
    ON lower(btrim(jt.title)) = m.std_title
  WHERE jt.organization_id = v_org
  ON CONFLICT (organization_id, job_title, assistant_key) DO NOTHING;
END; $$;

GRANT EXECUTE ON FUNCTION
  public.get_organization_subscription_actor(uuid),
  public.initialize_org_trial_actor(uuid),
  public.expire_org_trial_actor(uuid),
  public.seed_default_job_title_assistants_actor(uuid)
TO anon, authenticated;
