-- B7 Fix 5 — RevenueCat webhook support (Session 53, 2026-07-24).
-- Applied to the live shared DB via Supabase MCP apply_migration; this file is the repo record.
--
-- 1) organization_subscriptions.last_webhook_event_timestamp_ms — RC event ordering-guard
--    state: strict monotonic event ordering + exact-duplicate dedup (RC retries reuse
--    id + event_timestamp_ms, and deliveries can arrive out of order).
-- 2) service_config 'revenuecat_webhook_secret' — the Authorization-header value RC sends.
--    Generated server-side (never printed into any session log); read it once via the
--    Supabase dashboard SQL editor when pasting into the RC webhook config. A second key
--    'revenuecat_webhook_signing_secret' is inserted manually when HMAC signing is enabled
--    in the RC dashboard (RC generates that value); while that key is ABSENT the edge fn
--    gates on the Authorization secret alone.
-- 3) apply_revenuecat_webhook_event — the webhook's ONLY write path. SECURITY DEFINER,
--    EXECUTE revoked from PUBLIC/anon/authenticated (session-50 lesson: CREATE FUNCTION
--    carries an implicit PUBLIC grant), granted to service_role only. Single-statement
--    compare-and-set upsert:
--      * p_event_timestamp_ms must EXCEED stored last_webhook_event_timestamp_ms
--        (ordering + dedup in one guard);
--      * downgrades additionally require current_period_end <= new end when p_period_guard
--        (protects against a product-level EXPIRATION arriving while a newer purchase of a
--        different product already extended the entitlement period); a period-less guarded
--        downgrade (EXCLUDED end NULL) deliberately falls through to the timestamp guard
--        rather than NULL-blocking forever; TRANSFER-from and early-revocation EXPIRATIONs
--        (expiration_reason CUSTOMER_SUPPORT or DEVELOPER_INITIATED — refunds/revocations
--        legitimately ending access BEFORE the stored period end) pass p_period_guard=false
--        and rely on the event-timestamp guard alone;
--      * SANDBOX events apply only to rows already is_sandbox=true or in tier
--        none/expired/trial — a TestFlight tester can never clobber a production-paid org.
--    Deliberately NOT reusing upsert_organization_subscription (owner-gated RAISE on NULL
--    actor; blind overwrite of periods/store; no ordering guard).
--
-- Rollback:
--   DROP FUNCTION public.apply_revenuecat_webhook_event(uuid,text,boolean,boolean,bigint,bigint,bigint,text,boolean,text,text,text);
--   ALTER TABLE public.organization_subscriptions DROP COLUMN last_webhook_event_timestamp_ms;
--   DELETE FROM public.service_config WHERE key IN ('revenuecat_webhook_secret','revenuecat_webhook_signing_secret');

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS last_webhook_event_timestamp_ms bigint;

-- Server-generated secret: two v4 UUIDs stripped of dashes = 64 hex chars (~244 bits).
-- Core-only (no pgcrypto dependency) and the value never transits a session transcript.
INSERT INTO public.service_config (key, value)
SELECT 'revenuecat_webhook_secret',
       replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_config WHERE key = 'revenuecat_webhook_secret'
);

CREATE OR REPLACE FUNCTION public.apply_revenuecat_webhook_event(
  p_organization_id uuid,
  p_new_tier text,
  p_is_downgrade boolean,
  p_period_guard boolean,
  p_event_timestamp_ms bigint,
  p_period_start_ms bigint DEFAULT NULL,
  p_period_end_ms bigint DEFAULT NULL,
  p_store text DEFAULT NULL,
  p_is_sandbox boolean DEFAULT true,
  p_product_id text DEFAULT NULL,
  p_entitlement_id text DEFAULT NULL,
  p_customer_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_id    uuid;
BEGIN
  IF p_organization_id IS NULL
     OR p_event_timestamp_ms IS NULL
     OR p_is_downgrade IS NULL
     OR p_period_guard IS NULL
     OR p_new_tier IS NULL
     OR p_new_tier NOT IN ('base', 'premium', 'expired')
     OR (p_store IS NOT NULL AND p_store NOT IN ('app_store', 'play_store', 'stripe')) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_args');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'unknown_org');
  END IF;

  v_start := CASE WHEN p_period_start_ms IS NULL THEN NULL
                  ELSE to_timestamp(p_period_start_ms / 1000.0) END;
  v_end   := CASE WHEN p_period_end_ms IS NULL THEN NULL
                  ELSE to_timestamp(p_period_end_ms / 1000.0) END;

  INSERT INTO public.organization_subscriptions AS os (
    organization_id, subscription_tier, store,
    current_period_start, current_period_end, is_sandbox,
    revenuecat_product_id, revenuecat_entitlement_id, revenuecat_customer_id,
    last_webhook_event_timestamp_ms, updated_at
  ) VALUES (
    p_organization_id, p_new_tier, p_store,
    v_start, v_end, COALESCE(p_is_sandbox, true),
    p_product_id, p_entitlement_id, p_customer_id,
    p_event_timestamp_ms, now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    subscription_tier               = EXCLUDED.subscription_tier,
    store                           = COALESCE(EXCLUDED.store, os.store),
    current_period_start            = COALESCE(EXCLUDED.current_period_start, os.current_period_start),
    current_period_end              = CASE
                                        WHEN p_is_downgrade
                                          THEN COALESCE(EXCLUDED.current_period_end, os.current_period_end)
                                        ELSE GREATEST(os.current_period_end, EXCLUDED.current_period_end)
                                      END,
    is_sandbox                      = EXCLUDED.is_sandbox,
    revenuecat_product_id           = COALESCE(EXCLUDED.revenuecat_product_id, os.revenuecat_product_id),
    revenuecat_entitlement_id       = COALESCE(EXCLUDED.revenuecat_entitlement_id, os.revenuecat_entitlement_id),
    revenuecat_customer_id          = COALESCE(EXCLUDED.revenuecat_customer_id, os.revenuecat_customer_id),
    last_webhook_event_timestamp_ms = EXCLUDED.last_webhook_event_timestamp_ms,
    updated_at                      = now()
  WHERE p_event_timestamp_ms > COALESCE(os.last_webhook_event_timestamp_ms, 0)
    AND (NOT p_is_downgrade
         OR NOT p_period_guard
         OR os.current_period_end IS NULL
         OR EXCLUDED.current_period_end IS NULL
         OR os.current_period_end <= EXCLUDED.current_period_end)
    AND (NOT COALESCE(p_is_sandbox, true)
         OR COALESCE(os.is_sandbox, false)
         OR os.subscription_tier IN ('none', 'expired', 'trial'))
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'guarded_noop');
  END IF;

  RETURN jsonb_build_object('applied', true);
END;
$$;

-- Session-50 lesson: CREATE FUNCTION carries an implicit PUBLIC EXECUTE grant, and Supabase
-- default privileges add anon/authenticated — revoke all three; service_role only.
REVOKE ALL ON FUNCTION public.apply_revenuecat_webhook_event(uuid, text, boolean, boolean, bigint, bigint, bigint, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_webhook_event(uuid, text, boolean, boolean, bigint, bigint, bigint, text, boolean, text, text, text) TO service_role;
