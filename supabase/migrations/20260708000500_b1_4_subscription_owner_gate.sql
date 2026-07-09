-- Batch B1.4 — upsert_organization_subscription: close the billing bypass [High, interim]
-- Applied to production via Supabase MCP on 2026-07-08 (cloud version 20260708224502).
-- Requires p_actor_id to be the ORG OWNER of p_organization_id. Interim: the real fix (B7) is
-- service_role-only, driven by a signature-verified RevenueCat webhook.
DROP FUNCTION IF EXISTS public.upsert_organization_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean);

CREATE FUNCTION public.upsert_organization_subscription(
  p_organization_id uuid,
  p_subscription_tier text,
  p_revenuecat_customer_id text DEFAULT NULL,
  p_revenuecat_product_id text DEFAULT NULL,
  p_revenuecat_entitlement_id text DEFAULT NULL,
  p_store text DEFAULT NULL,
  p_current_period_start timestamptz DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL,
  p_is_sandbox boolean DEFAULT false,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_organization_id;
  IF v_owner_id IS NULL OR p_actor_id IS NULL OR p_actor_id <> v_owner_id THEN
    RAISE EXCEPTION 'Only the organization owner can change the subscription';
  END IF;

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
    subscription_tier          = EXCLUDED.subscription_tier,
    revenuecat_customer_id     = COALESCE(EXCLUDED.revenuecat_customer_id, organization_subscriptions.revenuecat_customer_id),
    revenuecat_product_id      = EXCLUDED.revenuecat_product_id,
    revenuecat_entitlement_id  = EXCLUDED.revenuecat_entitlement_id,
    store                      = EXCLUDED.store,
    current_period_start       = EXCLUDED.current_period_start,
    current_period_end         = EXCLUDED.current_period_end,
    is_sandbox                 = EXCLUDED.is_sandbox;
END;
$function$;
