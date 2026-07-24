-- B8 — harden legacy upsert_organization_subscription (the client reconcile write path).
--
-- Since B7 Fix 5 the RevenueCat webhook maintains the rich subscription record (store,
-- periods, product/entitlement ids, is_sandbox, last_webhook_event_timestamp_ms). The
-- client reconcile calls this RPC with ONLY (org, tier, actor) — but the old body
-- blind-overwrote product/entitlement/store/periods with NULL and is_sandbox with false
-- on every such write, wiping webhook state. Changes:
--   * every RC detail column is now COALESCE-preserved (an omitted/NULL arg means "keep");
--   * p_is_sandbox DEFAULT changes false -> NULL so omission preserves the stored flag
--     (COALESCE falls back to false only when the row never had a value);
--   * subscription_tier stays caller-set — that is the RPC's purpose, and as of B8 the
--     client only writes it after fresh-verifying against RevenueCat
--     (SubscriptionContext.reconcileWithRevenueCat invalidates the SDK cache pre-write);
--   * last_webhook_event_timestamp_ms remains untouched (webhook-owned);
--   * owner gate, signature (arg types/names), RETURNS void, search_path pin unchanged —
--     CREATE OR REPLACE is safe (a default is present before and after; session-48
--     lesson only forbids REMOVING defaults).
--
-- Rollback: re-apply the previous definition (blind overwrites + p_is_sandbox DEFAULT
-- false) from git history or pg_get_functiondef prior to this migration.

CREATE OR REPLACE FUNCTION public.upsert_organization_subscription(
  p_organization_id uuid,
  p_subscription_tier text,
  p_revenuecat_customer_id text DEFAULT NULL::text,
  p_revenuecat_product_id text DEFAULT NULL::text,
  p_revenuecat_entitlement_id text DEFAULT NULL::text,
  p_store text DEFAULT NULL::text,
  p_current_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_is_sandbox boolean DEFAULT NULL::boolean,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
    p_store, p_current_period_start, p_current_period_end, COALESCE(p_is_sandbox, false)
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    subscription_tier          = EXCLUDED.subscription_tier,
    revenuecat_customer_id     = COALESCE(EXCLUDED.revenuecat_customer_id, organization_subscriptions.revenuecat_customer_id),
    revenuecat_product_id      = COALESCE(EXCLUDED.revenuecat_product_id, organization_subscriptions.revenuecat_product_id),
    revenuecat_entitlement_id  = COALESCE(EXCLUDED.revenuecat_entitlement_id, organization_subscriptions.revenuecat_entitlement_id),
    store                      = COALESCE(EXCLUDED.store, organization_subscriptions.store),
    current_period_start       = COALESCE(EXCLUDED.current_period_start, organization_subscriptions.current_period_start),
    current_period_end         = COALESCE(EXCLUDED.current_period_end, organization_subscriptions.current_period_end),
    is_sandbox                 = COALESCE(p_is_sandbox, organization_subscriptions.is_sandbox, false);
END;
$function$;
