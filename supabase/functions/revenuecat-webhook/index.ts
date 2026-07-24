// @ts-nocheck
//
// revenuecat-webhook — receives RevenueCat server-to-server webhook events and keeps
// organization_subscriptions in sync as the server-side source of truth (B7 Fix 5).
// The client reconcile (SubscriptionContext.reconcileWithRevenueCat) is upgrade-only
// belt-and-braces; THIS function is what handles downgrades (EXPIRATION).
//
// Auth (fail-closed, two layers; verify_jwt MUST stay false — RC sends no Supabase JWT):
//   1. Authorization header — constant-time compare vs service_config
//      'revenuecat_webhook_secret' (the value pasted into the RC dashboard's
//      "Authorization header value"; raw or "Bearer <secret>" both accepted).
//   2. HMAC signature — 'X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>'
//      over `${t}.${rawBody}`, verified against service_config
//      'revenuecat_webhook_signing_secret' BEFORE JSON.parse (re-serializing changes
//      bytes), with a 300s replay window. While that key is ABSENT (HMAC signing not yet
//      enabled in the RC dashboard) the Authorization secret alone gates; once the key
//      exists a missing/invalid/stale signature is a hard 401.
//
// Envelope: { api_version, event }. event.app_user_id == organization UUID because the
// client calls Purchases.logIn(organizationId); event.aliases is the fallback;
// original_app_user_id is NEVER trusted for org resolution (it's the $RCAnonymousID).
// Unknown org → 200 + no write (avoids the set_default_organization_id Boathouse
// mis-attribution hazard and RC retry storms).
//
// Event type → action:
//   INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / SUBSCRIPTION_EXTENDED / REFUND_REVERSED
//     → set active paid tier (entitlement_ids primary, product_id fallback)
//   EXPIRATION → the ONLY downgrade ('expired')
//   CANCELLATION / BILLING_ISSUE / SUBSCRIPTION_PAUSED / PRODUCT_CHANGE / TEST /
//     SUBSCRIBER_ALIAS and any unrecognized type → acknowledged no-op (CANCELLATION ≠
//     access lost — the user keeps access until EXPIRATION; that split is the load-bearing
//     correctness point. PRODUCT_CHANGE fires at change INITIATION and per RC event-flows
//     always ships with a companion RENEWAL / INITIAL_PURCHASE that carries the definitive
//     product+entitlements at effect time — the companion does the write; acting on
//     PRODUCT_CHANGE itself would flip the tier early and could drop a same-ms companion
//     via the strict timestamp guard.)
//   TRANSFER → downgrade resolvable transferred_from orgs (no period info on the event, so
//     the event-timestamp guard orders it); transferred_to carries no product/entitlement →
//     deferred to the client reconcile (documented v1 gap).
//
// All writes go through the service-role-only RPC apply_revenuecat_webhook_event, whose
// single-statement compare-and-set enforces: strict event_timestamp_ms monotonicity
// (ordering + duplicate dedup), the downgrade period guard, and sandbox-can't-clobber-prod.
// EXPIRATION with expiration_reason CUSTOMER_SUPPORT (store refund) or DEVELOPER_INITIATED
// (Play 'refund and revoke' / promotional-entitlement revocation) skips the period guard —
// those revocations legitimately end access BEFORE the stored period end, and blocking them
// would let a pay-then-refund org keep its paid tier forever (the B1.4 class). Documented
// residual: revoking a superseded product while ANOTHER product still covers the org
// (requires one org double-subscribed across stores) briefly downgrades a live entitlement —
// self-heals via the upgrade-only client reconcile / next RENEWAL.
//
// Known v1 residual (→ B8 stale-session bucket): the UNCHANGED client reconcile
// (SubscriptionContext.reconcileWithRevenueCat) can act on a stale RC-SDK customerInfo
// cache (<5 min old, or older when RC's API errors) and re-upsert a paid tier right after a
// webhook downgrade via the legacy owner-gated upsert_organization_subscription (which
// ignores last_webhook_event_timestamp_ms). Queued B8 fixes: FETCH_CURRENT cache policy in
// reconcileWithRevenueCat and/or server-side hardening of that legacy RPC.
//
// Response contract: 200 for applied/ignored/unknown-org/stale/duplicate; 401 only for
// auth failures; 413 only for oversized crafted payloads (real RC events are a few KB);
// 5xx only for transient infra (RC's 5x backoff is the free retry path).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ACTIVE_TIER_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
]);

// Explicitly acknowledged no-ops; anything not recognized anywhere is also ignored.
// PRODUCT_CHANGE is deliberately here: its companion RENEWAL/INITIAL_PURCHASE carries the
// authoritative product+entitlements at effect time (see header).
const NO_OP_EVENTS = new Set([
  'CANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'PRODUCT_CHANGE',
  'TEST',
  'SUBSCRIBER_ALIAS',
]);

// EXPIRATION reasons that revoke access immediately (before the stored period end) — the
// period guard must not block these; the timestamp guard still orders them.
const EARLY_REVOCATION_REASONS = new Set(['CUSTOMER_SUPPORT', 'DEVELOPER_INITIATED']);

// Timestamps far outside plausible epoch-ms range would overflow to_timestamp() in the RPC
// (a deterministic 500 → pointless RC retry burst) — treat them as absent instead.
const inEpochRangeMs = (n: number) => Number.isFinite(n) && n >= 0 && n < 9e15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// MAP-OR-NULL: an unmapped store value (e.g. RC_BILLING, AMAZON) would violate the
// organization_subscriptions store CHECK and lose the whole write. NULL store is
// COALESCE-kept server-side, so mapping to null means "leave whatever is stored".
const STORE_MAP: Record<string, string> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  STRIPE: 'stripe',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Constant-time string compare (leaks only length, which is standard/acceptable).
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parse "t=<unix>,v1=<hex>[,v1=<hex>...]" (Stripe-style scheme; tolerate multiple v1
// entries, e.g. during an RC signing-secret rotation).
function parseSignatureHeader(header: string): { t: string | null; v1: string[] } {
  const out = { t: null as string | null, v1: [] as string[] };
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') out.t = v;
    else if (k === 'v1') out.v1.push(v);
  }
  return out;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Cheap size guards before any real work (no legit RC event is near these bounds; the
    // platform request cap is the true backstop). Then the RAW body — the HMAC is over the
    // exact bytes RC sent.
    const declaredLen = Number(req.headers.get('content-length') ?? '0');
    if (declaredLen > 600_000) {
      return json(413, { error: 'payload_too_large' });
    }
    const rawBody = await req.text();
    if (rawBody.length > 200_000) {
      return json(413, { error: 'payload_too_large' });
    }

    // --- Load both secrets in one round-trip ---
    const { data: cfgRows, error: cfgErr } = await adminClient
      .from('service_config')
      .select('key, value')
      .in('key', ['revenuecat_webhook_secret', 'revenuecat_webhook_signing_secret']);
    if (cfgErr) {
      console.error('service_config read failed:', cfgErr);
      return json(500, { error: 'config_unavailable' }); // transient infra → RC retries
    }
    const authSecret = cfgRows?.find((r) => r.key === 'revenuecat_webhook_secret')?.value;
    const signingSecret = cfgRows?.find(
      (r) => r.key === 'revenuecat_webhook_signing_secret'
    )?.value;

    if (!authSecret) {
      // Fail closed: no configured secret means nobody gets in.
      console.error('revenuecat_webhook_secret not configured');
      return json(401, { error: 'unauthorized' });
    }

    // --- Layer 1: Authorization header (raw secret or "Bearer <secret>") ---
    const authHeader = req.headers.get('authorization') ?? '';
    const okPlain = timingSafeEqual(authHeader, authSecret);
    const okBearer = timingSafeEqual(authHeader, `Bearer ${authSecret}`);
    if (!okPlain && !okBearer) {
      return json(401, { error: 'unauthorized' });
    }

    // --- Layer 2: HMAC signature (enforced once the signing secret exists) ---
    const sigHeader = req.headers.get('x-revenuecat-webhook-signature');
    if (signingSecret) {
      if (!sigHeader) return json(401, { error: 'missing_signature' });
      const { t, v1 } = parseSignatureHeader(sigHeader);
      if (!t || v1.length === 0) return json(401, { error: 'malformed_signature' });
      const ts = Number(t);
      // RC's docs don't state t's units; a value > 1e12 can only be milliseconds (seconds
      // would mean year 33658+), so normalize for the window check. The HMAC itself signs
      // the literal header t either way.
      const tsSeconds = ts > 1e12 ? ts / 1000 : ts;
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
        console.warn(`signature timestamp out of window: t=${t}`);
        return json(401, { error: 'signature_timestamp_out_of_window' });
      }
      const expected = await hmacSha256Hex(signingSecret, `${t}.${rawBody}`);
      let anyMatch = false;
      for (const candidate of v1) {
        if (timingSafeEqual(candidate.toLowerCase(), expected)) anyMatch = true;
      }
      if (!anyMatch) return json(401, { error: 'bad_signature' });
    } else if (sigHeader) {
      // RC is signing but our signing secret isn't stored yet (dashboard-side enabled
      // before the service_config insert). The Authorization layer still gates; log so
      // the config gap is visible. An attacker gains nothing here — omitting the header
      // reaches the same path.
      console.warn('signature header present but no signing secret configured');
    }

    // --- Parse (only after auth) ---
    let envelope: any;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      console.warn('unparseable body after valid auth');
      return json(200, { handled: false, reason: 'unparseable_body' });
    }

    const event = envelope?.event;
    const type = String(event?.type ?? '');
    if (!event || !type) {
      return json(200, { handled: false, reason: 'no_event' });
    }

    const environment = String(event.environment ?? '');
    // Missing/unknown environment → treat as sandbox: it can never clobber a prod row.
    const isSandbox = environment !== 'PRODUCTION';
    const store = STORE_MAP[String(event.store ?? '')] ?? null;
    const eventTsRaw = Number(event.event_timestamp_ms);
    const eventTs = inEpochRangeMs(eventTsRaw) ? Math.trunc(eventTsRaw) : null;

    const orgExists = async (id: string): Promise<boolean> => {
      const { data, error } = await adminClient
        .from('organizations')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`org lookup failed: ${error.message}`);
      return !!data;
    };

    // app_user_id first (== org UUID via Purchases.logIn), then aliases; NEVER
    // original_app_user_id.
    const resolveOrgId = async (): Promise<string | null> => {
      const primary = String(event.app_user_id ?? '');
      if (UUID_RE.test(primary) && (await orgExists(primary))) return primary;
      const aliases: unknown[] = Array.isArray(event.aliases) ? event.aliases : [];
      for (const a of aliases) {
        const s = String(a ?? '');
        if (!UUID_RE.test(s)) continue;
        if (s.toLowerCase() === primary.toLowerCase()) continue;
        if (await orgExists(s)) return s;
      }
      return null;
    };

    // --- TRANSFER: downgrade the transferred_from orgs; transferred_to → client reconcile ---
    if (type === 'TRANSFER') {
      if (eventTs === null) {
        return json(200, { handled: false, type, reason: 'missing_event_timestamp' });
      }
      // environment is only Sometimes-included on TRANSFER (docs-verified), unlike
      // lifecycle events where it is Always — an absent value must NOT read as sandbox
      // here, or the sandbox guard would silently skip the production transferred_from
      // downgrade. An explicit SANDBOX transfer still can't clobber a prod row.
      const transferIsSandbox = environment === 'SANDBOX';
      const from: unknown[] = Array.isArray(event.transferred_from)
        ? event.transferred_from
        : [];
      const transfers: unknown[] = [];
      for (const candidate of from) {
        const s = String(candidate ?? '');
        if (!UUID_RE.test(s)) continue;
        if (!(await orgExists(s))) continue;
        const { data, error } = await adminClient.rpc('apply_revenuecat_webhook_event', {
          p_organization_id: s,
          p_new_tier: 'expired',
          p_is_downgrade: true,
          p_period_guard: false, // no period info on TRANSFER; the ts guard orders it
          p_event_timestamp_ms: eventTs,
          p_store: store,
          p_is_sandbox: transferIsSandbox,
        });
        if (error) {
          console.error('transfer RPC error:', error);
          return json(500, { error: 'db_error' }); // retry-safe: ts guard dedups applied orgs
        }
        transfers.push({ org: s, result: data });
      }
      console.log(`TRANSFER handled: ${JSON.stringify(transfers)}`);
      return json(200, { handled: true, type, transfers });
    }

    // --- Everything that isn't an active-tier event or EXPIRATION is an acked no-op ---
    if (!ACTIVE_TIER_EVENTS.has(type) && type !== 'EXPIRATION') {
      console.log(`no-op event type=${type}`);
      return json(200, {
        handled: false,
        type,
        reason: NO_OP_EVENTS.has(type) ? 'no_op_type' : 'unrecognized_type',
      });
    }

    const orgId = await resolveOrgId();
    if (!orgId) {
      console.log(`unknown org: type=${type} app_user_id=${String(event.app_user_id ?? '')}`);
      return json(200, { handled: false, type, reason: 'unknown_org' });
    }
    if (eventTs === null) {
      console.log(`missing event_timestamp_ms: type=${type} org=${orgId}`);
      return json(200, { handled: false, type, reason: 'missing_event_timestamp' });
    }

    // --- Tier: entitlement_ids primary ('premium' wins), product_id fallback ---
    let newTier: string | null = null;
    let entitlementId: string | null = null;
    if (type === 'EXPIRATION') {
      newTier = 'expired';
    } else {
      const ents: string[] = Array.isArray(event.entitlement_ids)
        ? event.entitlement_ids.map((e: unknown) => String(e))
        : [];
      if (ents.includes('premium')) {
        newTier = 'premium';
        entitlementId = 'premium';
      } else if (ents.includes('base')) {
        newTier = 'base';
        entitlementId = 'base';
      } else {
        // Google product ids arrive as "product:base_plan_id", hence the split.
        const productRaw = String(event.product_id ?? '');
        const productBase = productRaw.split(':')[0];
        if (productBase === 'mrc_premium_monthly') newTier = 'premium';
        else if (productBase === 'mrc_base_monthly') newTier = 'base';
      }
      if (!newTier) {
        console.log(
          `cannot derive tier: type=${type} org=${orgId} product=${String(event.product_id ?? '')}`
        );
        return json(200, { handled: false, type, reason: 'unknown_tier' });
      }
    }

    const isDowngrade = type === 'EXPIRATION';
    // The period guard protects against a product-level EXPIRATION arriving while a newer
    // purchase already extended the period. Early-revocation reasons (store refund /
    // developer revoke) legitimately end access BEFORE the stored period end, so they rely
    // on the event-timestamp guard alone — otherwise pay-then-refund keeps the tier forever.
    const expirationReason = String(event.expiration_reason ?? '');
    const periodGuard = isDowngrade && !EARLY_REVOCATION_REASONS.has(expirationReason);

    const startMs = Number(event.purchased_at_ms);
    const endMs = Number(event.expiration_at_ms);

    const { data: result, error: rpcError } = await adminClient.rpc(
      'apply_revenuecat_webhook_event',
      {
        p_organization_id: orgId,
        p_new_tier: newTier,
        p_is_downgrade: isDowngrade,
        p_period_guard: periodGuard,
        p_event_timestamp_ms: eventTs,
        p_period_start_ms: inEpochRangeMs(startMs) ? Math.trunc(startMs) : null,
        p_period_end_ms: inEpochRangeMs(endMs) ? Math.trunc(endMs) : null,
        p_store: store,
        p_is_sandbox: isSandbox,
        p_product_id: event.product_id ? String(event.product_id) : null,
        p_entitlement_id: entitlementId,
        p_customer_id: event.original_app_user_id ? String(event.original_app_user_id) : null,
      }
    );
    if (rpcError) {
      console.error('apply RPC error:', rpcError);
      return json(500, { error: 'db_error' }); // transient infra → RC retries
    }

    console.log(
      `event type=${type} org=${orgId} tier=${newTier} sandbox=${isSandbox} → ${JSON.stringify(result)}`
    );
    return json(200, { handled: true, type, org: orgId, result });
  } catch (error) {
    console.error('revenuecat-webhook error:', error);
    return json(500, { error: 'internal_error' });
  }
});
