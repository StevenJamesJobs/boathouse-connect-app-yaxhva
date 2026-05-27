-- Organization subscriptions table — caches RevenueCat subscription state per org
CREATE TABLE public.organization_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Subscription state
  subscription_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (subscription_tier IN ('trial', 'base', 'premium', 'expired', 'none')),

  -- Trial tracking
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,

  -- RevenueCat integration
  revenuecat_customer_id TEXT,
  revenuecat_product_id TEXT,
  revenuecat_entitlement_id TEXT,

  -- Store metadata
  store TEXT CHECK (store IS NULL OR store IN ('app_store', 'play_store', 'stripe')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  is_sandbox BOOLEAN DEFAULT false,

  -- Notification tracking (for trial reminders)
  trial_7d_notified BOOLEAN DEFAULT false,
  trial_2d_notified BOOLEAN DEFAULT false,
  trial_1d_notified BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_org_subscription UNIQUE (organization_id)
);

CREATE INDEX idx_org_subscriptions_org_id ON public.organization_subscriptions(organization_id);
CREATE INDEX idx_org_subscriptions_tier ON public.organization_subscriptions(subscription_tier);
CREATE INDEX idx_org_subscriptions_trial_end ON public.organization_subscriptions(trial_end_date)
  WHERE subscription_tier = 'trial';

-- RLS — reads allowed via public (custom auth, not Supabase Auth), writes through RPCs only
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to organization subscriptions"
  ON public.organization_subscriptions
  FOR SELECT
  USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_org_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_org_subscription_updated_at
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_org_subscription_timestamp();

-- ═══════════════════════════════════════════════════════════
-- RPC Functions (SECURITY DEFINER — validates internally)
-- ═══════════════════════════════════════════════════════════

-- Initialize a 14-day trial for a new org (idempotent)
CREATE OR REPLACE FUNCTION initialize_org_trial(
  p_organization_id UUID
) RETURNS void AS $$
BEGIN
  INSERT INTO public.organization_subscriptions (
    organization_id,
    subscription_tier,
    trial_start_date,
    trial_end_date
  ) VALUES (
    p_organization_id,
    'trial',
    now(),
    now() + interval '14 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upsert subscription state (from RevenueCat purchase or webhook)
CREATE OR REPLACE FUNCTION upsert_organization_subscription(
  p_organization_id UUID,
  p_subscription_tier TEXT,
  p_revenuecat_customer_id TEXT DEFAULT NULL,
  p_revenuecat_product_id TEXT DEFAULT NULL,
  p_revenuecat_entitlement_id TEXT DEFAULT NULL,
  p_store TEXT DEFAULT NULL,
  p_current_period_start TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_is_sandbox BOOLEAN DEFAULT false
) RETURNS void AS $$
BEGIN
  INSERT INTO public.organization_subscriptions (
    organization_id, subscription_tier,
    revenuecat_customer_id, revenuecat_product_id, revenuecat_entitlement_id,
    store, current_period_start, current_period_end, is_sandbox
  ) VALUES (
    p_organization_id, p_subscription_tier,
    p_revenuecat_customer_id, p_revenuecat_product_id, p_revenuecat_entitlement_id,
    p_store, p_current_period_start, p_current_period_end, p_is_sandbox
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    subscription_tier = EXCLUDED.subscription_tier,
    revenuecat_customer_id = COALESCE(EXCLUDED.revenuecat_customer_id, organization_subscriptions.revenuecat_customer_id),
    revenuecat_product_id = EXCLUDED.revenuecat_product_id,
    revenuecat_entitlement_id = EXCLUDED.revenuecat_entitlement_id,
    store = EXCLUDED.store,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    is_sandbox = EXCLUDED.is_sandbox;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read subscription for an org
CREATE OR REPLACE FUNCTION get_organization_subscription(
  p_organization_id UUID
) RETURNS TABLE (
  subscription_tier TEXT,
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,
  revenuecat_customer_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_7d_notified BOOLEAN,
  trial_2d_notified BOOLEAN,
  trial_1d_notified BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.subscription_tier,
    os.trial_start_date,
    os.trial_end_date,
    os.revenuecat_customer_id,
    os.current_period_start,
    os.current_period_end,
    os.trial_7d_notified,
    os.trial_2d_notified,
    os.trial_1d_notified
  FROM public.organization_subscriptions os
  WHERE os.organization_id = p_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire a trial (called when context detects trial has ended)
CREATE OR REPLACE FUNCTION expire_org_trial(
  p_organization_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE public.organization_subscriptions
  SET subscription_tier = 'expired'
  WHERE organization_id = p_organization_id
    AND subscription_tier = 'trial'
    AND trial_end_date <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
