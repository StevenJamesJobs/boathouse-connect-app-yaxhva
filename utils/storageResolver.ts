import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL } from '@/app/integrations/supabase/client';
import { brokerSignRead, brokerStorageMode } from '@/utils/storageBroker';

/**
 * B4b (session 49): the storage-URL resolver. Every stored image/file URL is
 * resolved AT THE LEAF (components/StorageImage.tsx or resolveForOpen) — state,
 * props and arrays keep flowing stored-URL-shaped strings unchanged.
 *
 * While the buckets are PUBLIC (today) this module is pure pass-through: zero
 * async work, zero broker calls beyond one storage-mode check per app session,
 * byte-identical output. When the buckets flip PRIVATE (a server-side-only
 * event — see the broker's storage-mode action), already-shipped clients switch
 * to broker-minted signed URLs on their own: app-start mode refresh + an
 * on-image-error re-check discover the flip without an app update.
 *
 * Stored values stay full-public-URL-shaped FOREVER (decision, session 49):
 * after the flip they are opaque identifiers this module parses bucket/path out
 * of. New code must never raw-fetch a stored storage URL.
 */

const PUBLIC_MARKER = '/storage/v1/object/public/';
const SIGN_MARKER = '/storage/v1/object/sign/';

// Buckets that stay PUBLIC forever (decision, session 49): org logos are public
// branding and must render on the PRE-AUTH login screen, where no actor exists
// to mint signed URLs. The flip session must NOT set these buckets private.
const ALWAYS_PUBLIC_BUCKETS = new Set(['organization-logos']);

function isAlwaysPublicUrl(url: string): boolean {
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx === -1) return false;
  const rest = url.slice(idx + PUBLIC_MARKER.length);
  const slash = rest.indexOf('/');
  return slash > 0 && ALWAYS_PUBLIC_BUCKETS.has(rest.slice(0, slash));
}

const MODE_STORAGE_KEY = '@mrc_storage_mode';
const MODE_TTL_MS = 6 * 60 * 60 * 1000; // re-check cadence while foregrounded
const MODE_FAIL_COOLDOWN_MS = 60 * 1000;
const ERROR_RECHECK_DEBOUNCE_MS = 30 * 1000;
const NEGATIVE_CACHE_MS = 30 * 1000;
const REMINT_CAP = 2; // error-triggered re-mints per URL...
const REMINT_WINDOW_MS = 5 * 60 * 1000; // ...per window
const BATCH_DELAY_MS = 50;
const BATCH_SIZE = 25; // broker caps at 60; stay well under
const CACHE_MAX_ENTRIES = 300; // largest real surface is a ~200-row leaderboard

type StorageMode = 'public' | 'private';

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
  mintedAt: number;
}

let mode: StorageMode = 'public'; // optimistic: pre-auth screens render sync
let devOverride: StorageMode | null = null;
let actorId: string | null = null;

let initPromise: Promise<void> | null = null;
let modeCheckedThisSession = false;
let lastModeCheckAt = 0;
let modeFailCooldownUntil = 0;
let lastErrorRecheckAt = 0;
let pendingRecheck = false;

const signedCache = new Map<string, CacheEntry>(); // key = `${base}|${version}`
const negativeCache = new Map<string, number>(); // key -> retry-after timestamp
const remintCounts = new Map<string, { n: number; windowStart: number }>(); // by base
const pendingKeys = new Set<string>();
const inFlightKeys = new Set<string>();
const keyToBase = new Map<string, string>();
const subscribers = new Map<string, Set<() => void>>(); // by cache key
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function effectiveMode(): StorageMode {
  if (__DEV__ && devOverride) return devOverride;
  return mode;
}

/** True for a string holding one of OUR stored public storage URLs. */
export function isOurStorageUrl(v: unknown): v is string {
  return typeof v === 'string' && v.includes(PUBLIC_MARKER);
}

/**
 * Bare stored filename/path -> full public URL for a bucket; full URLs pass
 * through. Replaces the per-screen getPublicUrl normalizers and the hardcoded
 * profile-pictures builders (all current DB values are already full URLs — the
 * bare branch is kept defensively).
 */
export function toPublicUrl(bucket: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `${SUPABASE_URL}${PUBLIC_MARKER}${bucket}/${pathOrUrl.replace(/^\/+/, '')}`;
}

/** Splits a stored URL into its base and any embedded ?v= cache-bust version. */
function splitStored(url: string): { base: string; version: string | null } {
  const q = url.indexOf('?');
  if (q === -1) return { base: url, version: null };
  const base = url.slice(0, q);
  const m = /(?:^|&)v=([^&]*)/.exec(url.slice(q + 1));
  return { base, version: m ? m[1] : null };
}

function cacheKey(base: string, version: string | null): string {
  return `${base}|${version ?? ''}`;
}

function notifyKey(key: string): void {
  const subs = subscribers.get(key);
  if (subs) [...subs].forEach((cb) => cb());
}

function notifyAll(): void {
  [...subscribers.keys()].forEach(notifyKey);
}

function persistMode(): void {
  AsyncStorage.setItem(
    MODE_STORAGE_KEY,
    JSON.stringify({ private: mode === 'private', checkedAt: Date.now() })
  ).catch(() => {});
}

function setMode(next: StorageMode): void {
  if (mode === next) return;
  mode = next;
  persistMode();
  notifyAll();
  if (next === 'private') void flushPending();
}

function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = AsyncStorage.getItem(MODE_STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as { private?: boolean };
      // Only ever UPGRADE to private from disk — public is the safe default and
      // the broker check is the authority for private -> public reversions.
      if (saved?.private === true) setMode('private');
    })
    .catch(() => {});
  void maybeRefreshMode(false);
  return initPromise;
}

async function maybeRefreshMode(force: boolean): Promise<void> {
  if (!actorId) return;
  const now = Date.now();
  if (now < modeFailCooldownUntil) return;
  if (!force && modeCheckedThisSession && now - lastModeCheckAt < MODE_TTL_MS) return;
  modeCheckedThisSession = true; // claim before await so concurrent calls no-op
  const result = await brokerStorageMode(actorId);
  if (!result) {
    modeCheckedThisSession = false;
    modeFailCooldownUntil = Date.now() + MODE_FAIL_COOLDOWN_MS;
    return; // unreachable broker: keep last-known mode
  }
  lastModeCheckAt = Date.now();
  setMode(result);
}

/**
 * Wire-up from AuthContext: the resolver reads the actor from module scope so
 * leaf components never thread it (same current-auth motivation as the
 * useUnreadContent userIdRef pattern). Null on logout clears the signed cache.
 */
export function setResolverActorId(id: string | null): void {
  const prev = actorId;
  actorId = id;
  if (!id) {
    signedCache.clear();
    negativeCache.clear();
    pendingKeys.clear();
    keyToBase.clear();
    remintCounts.clear();
    return;
  }
  if (id !== prev) {
    void ensureInit();
    if (pendingRecheck) {
      pendingRecheck = false;
      void maybeRefreshMode(true);
    } else {
      void maybeRefreshMode(false);
    }
    void flushPending(); // parked mints from renders that ran before auth settled
  }
}

function lruTouch(key: string, entry: CacheEntry): void {
  signedCache.delete(key);
  signedCache.set(key, entry);
  if (signedCache.size > CACHE_MAX_ENTRIES) {
    const oldest = signedCache.keys().next().value;
    if (oldest !== undefined) signedCache.delete(oldest);
  }
}

function isFresh(entry: CacheEntry): boolean {
  const lifetime = entry.expiresAt - entry.mintedAt;
  return lifetime > 0 && Date.now() - entry.mintedAt < 0.8 * lifetime;
}

function enqueue(base: string, version: string | null): void {
  const key = cacheKey(base, version);
  if (pendingKeys.has(key) || inFlightKeys.has(key)) return;
  const negUntil = negativeCache.get(key);
  if (negUntil && Date.now() < negUntil) return;
  pendingKeys.add(key);
  keyToBase.set(key, base);
  if (!actorId) return; // parked; setResolverActorId flushes on arrival
  if (pendingKeys.size >= BATCH_SIZE) {
    void flushPending();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPending();
    }, BATCH_DELAY_MS);
  }
}

async function flushPending(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!actorId || effectiveMode() !== 'private') return;
  while (pendingKeys.size > 0) {
    const actor = actorId;
    if (!actor) return;
    const batchKeys = [...pendingKeys].slice(0, BATCH_SIZE);
    batchKeys.forEach((k) => {
      pendingKeys.delete(k);
      inFlightKeys.add(k);
    });
    const baseToKeys = new Map<string, string[]>();
    batchKeys.forEach((k) => {
      const base = keyToBase.get(k);
      if (!base) return;
      const list = baseToKeys.get(base) ?? [];
      list.push(k);
      baseToKeys.set(base, list);
    });
    const bases = [...baseToKeys.keys()];
    const results = await brokerSignRead(bases, actor, 'image');
    const now = Date.now();
    batchKeys.forEach((k) => inFlightKeys.delete(k));
    if (!results) {
      // Broker unreachable: short negative-cache so re-renders don't hammer it.
      batchKeys.forEach((k) => negativeCache.set(k, now + NEGATIVE_CACHE_MS));
      continue;
    }
    results.forEach((r) => {
      const keys = baseToKeys.get(r.input) ?? [];
      keys.forEach((k) => {
        if (r.signed_url) {
          const expiresAt = r.expires_at ? Date.parse(r.expires_at) : now + 60_000;
          lruTouch(k, { signedUrl: r.signed_url, expiresAt, mintedAt: now });
          negativeCache.delete(k);
        } else {
          negativeCache.set(k, now + NEGATIVE_CACHE_MS);
        }
        notifyKey(k);
      });
    });
  }
}

/**
 * The sync leaf resolver. Public mode: pure string math, byte-identical to the
 * legacy getImageUrl output (`base?v=version` / base). Private mode: cached
 * signed URL (same string instance until ~80% TTL — stable for memo/FlatList),
 * a stale one while a renewal is in flight, or null while a mint is pending.
 * Non-storage values (null/''/external/file:/already-signed) pass through.
 */
export function resolveUrlSync(
  url: string | null | undefined,
  version?: string | null
): string | null {
  if (url == null || url === '') return url ?? null;
  if (typeof url !== 'string' || !url.includes(PUBLIC_MARKER)) return url;
  if (url.includes(SIGN_MARKER)) return url; // already signed — never re-wrap
  void ensureInit();
  const { base, version: embedded } = splitStored(url);
  const v = version ?? embedded;
  if (effectiveMode() === 'public' || isAlwaysPublicUrl(base)) {
    return v ? `${base}?v=${v}` : base;
  }
  const key = cacheKey(base, v);
  const entry = signedCache.get(key);
  if (entry) {
    if (!isFresh(entry)) enqueue(base, v); // stale-while-revalidate
    return entry.signedUrl;
  }
  enqueue(base, v);
  return null;
}

/**
 * Subscription pairing resolveUrlSync for the useStorageUrl hook: fires when a
 * signed URL lands/renews for this url+version or when the mode flips.
 */
export function subscribeToUrl(
  url: string | null | undefined,
  version: string | null,
  cb: () => void
): () => void {
  if (!isOurStorageUrl(url)) return () => {};
  if (isAlwaysPublicUrl(url)) return () => {}; // resolves sync in every mode
  const { base, version: embedded } = splitStored(url);
  const key = cacheKey(base, version ?? embedded);
  let subs = subscribers.get(key);
  if (!subs) {
    subs = new Set();
    subscribers.set(key, subs);
  }
  subs.add(cb);
  return () => {
    const set = subscribers.get(key);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) subscribers.delete(key);
  };
}

/**
 * Imperative resolution for file opens (WebBrowser/Linking/downloadAsync/share).
 * Public mode returns the input unchanged. Private mode mints a FRESH long-TTL
 * URL outside the image cache — handed-off URLs (Safari video playback,
 * downloads) can't be transparently re-minted, so they get the long tier every
 * time. Falls back to the original URL on failure (existing caller error
 * handling covers it).
 */
export async function resolveForOpen(
  url: string,
  opts?: { tier?: 'image' | 'file' }
): Promise<string> {
  if (!isOurStorageUrl(url)) return url;
  if (isAlwaysPublicUrl(url)) return url;
  await ensureInit();
  if (effectiveMode() === 'public') return url;
  if (!actorId) return url;
  const { base } = splitStored(url);
  const results = await brokerSignRead([base], actorId, opts?.tier ?? 'file');
  return results?.[0]?.signed_url ?? url;
}

/**
 * Wired to StorageImage onError. Public mode: an erroring stored URL may mean
 * the buckets just flipped — debounced mode re-check (this is how the fleet
 * discovers the flip fast). Private mode: evict + re-mint that URL, capped so a
 * genuinely broken object can't loop.
 */
export function reportImageError(url: string | null | undefined): void {
  if (!isOurStorageUrl(url)) return;
  // Always-public buckets never flip — their failures signal nothing about the
  // mode and there is no signed entry to re-mint.
  if (isAlwaysPublicUrl(url)) return;
  const now = Date.now();
  if (effectiveMode() === 'public') {
    if (now - lastErrorRecheckAt < ERROR_RECHECK_DEBOUNCE_MS) return;
    lastErrorRecheckAt = now;
    if (!actorId) {
      pendingRecheck = true;
      return;
    }
    void maybeRefreshMode(true);
    return;
  }
  const { base } = splitStored(url);
  const counter = remintCounts.get(base);
  if (counter && now - counter.windowStart < REMINT_WINDOW_MS) {
    if (counter.n >= REMINT_CAP) return;
    counter.n += 1;
  } else {
    remintCounts.set(base, { n: 1, windowStart: now });
  }
  [...signedCache.keys()].forEach((k) => {
    if (k === base || k.startsWith(`${base}|`)) {
      signedCache.delete(k);
      const b = keyToBase.get(k) ?? base;
      const version = k.includes('|') ? k.slice(k.indexOf('|') + 1) || null : null;
      enqueue(b, version);
    }
  });
}

/**
 * DEV-ONLY: force the resolver into private mode against today's public buckets
 * (signed URLs work on public buckets) to E2E the post-flip pipeline. The body
 * is dead code in release builds (__DEV__ is compiled false) and gate #5
 * verifies no call site ships.
 */
export function setStorageModeOverride(m: StorageMode | null): void {
  if (!__DEV__) return;
  devOverride = m;
  notifyAll();
  if (m === 'private') void flushPending();
}
