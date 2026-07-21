// storage-broker — B4a (session 48): ALL client storage WRITES go through here.
//
// Custom auth: auth.uid() is always NULL, so the client supplies actor_id and we
// verify it against public.users with the SERVICE ROLE — never trust the
// Authorization header (same pattern as parse-menu). Buckets stay public for
// READS in B4a; direct anon writes are dropped/revoked, so:
//   - uploads happen via signed upload URLs minted here (signed-upload tokens
//     need NO storage.objects permissions — proven in the Phase-0 rehearsal),
//   - deletes happen here with the service role.
// New object paths are org-prefixed (`${orgId}/…`); legacy objects are flat.
//
// B4b (session 49) adds READ groundwork: `sign-read` batch-mints signed read
// URLs (member-gated, org/sample rules) and `storage-mode` reports public|private
// derived live from bucket metadata — so flipping buckets private later is a
// server-side-only event: already-shipped resolver clients switch on their own.
//
// v5 (session 50, TEMPORARY — remove after the ~30-day post-move soak): adds
// `admin-move-batch`, the org-prefix mover for the teardown window. Guarded by
// an OWNER actor AND a one-off secret held in the sealed `service_config` table
// (RLS on, zero grants — service-role only; deleting the row disables the
// action instantly). Deviation from the runbook's env-var spec, recorded in
// SESSION_50_PROGRESS.md: MCP cannot set edge secrets and the CLI is
// unauthenticated; a sealed-table secret is equivalent and MCP-manageable.
//
// v6 STRICT (session 50, post-move + post-flip): sign-read allows ONLY own-org
// + sample-org prefixes (legacy-flat/user-prefix allowances removed — every
// live object is org-prefixed now); v2 delete requires the actor's own org
// prefix. admin-move-batch stays until the ~30-day soak closes (rollback tool).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// Mirrors utils/messageFiles.ts getContentType (docs the picker produces) + images.
const MESSAGE_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/octet-stream',
  ...IMAGES,
];
const UPLOAD_DOC_TYPES = ['application/pdf', ...IMAGES];

const MB = 1024 * 1024;

type Role = 'member' | 'manager' | 'owner';
interface PathCtx {
  orgId: string;
  targetUserId: string;
  ts: number;
  rand: string;
  ext: string;
  safeName: string;
}
interface Gate {
  bucket: string;
  roles: Role;
  maxBytes: number;
  mimes: string[] | null;
  path: (c: PathCtx) => string;
}

const GATES: Record<string, Gate> = {
  announcement_image: {
    bucket: 'announcements', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  special_feature_image: {
    bucket: 'special-features', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  upcoming_event_image: {
    bucket: 'upcoming-events', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  host_section_image: {
    bucket: 'host-section-images', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  menu_item_image: {
    bucket: 'menu-items', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  quiz_question_image: {
    bucket: 'menu-items', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/quiz-questions/${c.ts}-${c.rand}.${c.ext}`,
  },
  guide_thumbnail: {
    bucket: 'guides-and-training', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/thumbnails/thumbnail_${c.ts}.${c.ext}`,
  },
  guide_file: {
    // Guide files include video/PDF; the picker's declared type varies — no mime
    // allowlist, size-capped instead (largest legacy object is 29MB).
    bucket: 'guides-and-training', roles: 'manager', maxBytes: 50 * MB, mimes: null,
    path: (c) => `${c.orgId}/files/${c.ts}_${c.safeName}`,
  },
  cocktail_image: {
    bucket: 'cocktail-images', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}.${c.ext}`,
  },
  libation_image: {
    // Bucket has a pre-existing 5MB limit + image allowlist — keep parity.
    bucket: 'libation-recipe-images', roles: 'manager', maxBytes: 5 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}.${c.ext}`,
  },
  summer_libation_image: {
    bucket: 'summer-libation-recipe-images', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}.${c.ext}`,
  },
  puree_syrup_image: {
    bucket: 'puree-syrup-recipe-images', roles: 'manager', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}.${c.ext}`,
  },
  message_image: {
    // send_message does NOT role-gate p_image_url — any active member may attach an image.
    bucket: 'message-attachments', roles: 'member', maxBytes: 5 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.ts}-${c.rand}.${c.ext}`,
  },
  message_file: {
    // send_message DOES gate p_file_url to manager/owner — mirror it.
    bucket: 'message-attachments', roles: 'manager', maxBytes: 10 * MB, mimes: MESSAGE_FILE_TYPES,
    path: (c) => `${c.orgId}/files/${c.ts}-${c.rand}.${c.ext}`,
  },
  profile_picture: {
    // self, or manager/owner for a same-org target (matches 4-arg update_profile_picture).
    bucket: 'profile-pictures', roles: 'member', maxBytes: 10 * MB, mimes: IMAGES,
    path: (c) => `${c.orgId}/${c.targetUserId}/${c.ts}.${c.ext}`,
  },
  org_logo: {
    bucket: 'organization-logos', roles: 'owner', maxBytes: 5 * MB,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    path: (c) => `${c.orgId}/logo_${c.ts}.${c.ext}`,
  },
  menu_upload_file: {
    // parse-menu enforces owner server-side — mirror the tightest gate.
    bucket: 'menu-uploads', roles: 'owner', maxBytes: 25 * MB, mimes: UPLOAD_DOC_TYPES,
    path: (c) => `${c.orgId}/${c.ts}-${c.safeName}`,
  },
  schedule_upload_file: {
    bucket: 'schedules', roles: 'manager', maxBytes: 25 * MB, mimes: UPLOAD_DOC_TYPES,
    path: (c) => `${c.orgId}/${c.ts}-${c.safeName}`,
  },
};

// Only buckets with real client delete flows accept broker deletes.
const DELETE_BUCKETS = new Set([
  'guides-and-training', 'announcements', 'special-features', 'upcoming-events', 'menu-items',
]);

// The 15 real buckets sign-read will mint READ URLs for (excludes the inert,
// empty b4a-proof bucket).
const READ_BUCKETS = new Set([
  'announcements', 'cocktail-images', 'guides-and-training', 'host-section-images',
  'libation-recipe-images', 'menu-items', 'menu-uploads', 'message-attachments',
  'organization-logos', 'profile-pictures', 'puree-syrup-recipe-images', 'schedules',
  'special-features', 'summer-libation-recipe-images', 'upcoming-events',
]);

// Signed-read expiry tiers. `image` keeps in-app renders cache-stable for a full
// shift; `file` must outlive URLs handed to external viewers (Safari video
// playback, downloads) that the app cannot transparently re-mint.
const READ_EXPIRY: Record<string, number> = { image: 43200, file: 86400 };

const ACTIONS = new Set(['sign-upload', 'delete', 'sign-read', 'storage-mode', 'admin-move-batch']);

// admin-move-batch: the ONLY (table, column) pairs the mover may rewrite —
// hardcoded allowlist (runbook §Mover), no dynamic SQL beyond exact-match
// UPDATE ... WHERE col = old_url built from these literals via PostgREST.
const REWRITE_MAP: Record<string, string[]> = {
  users: ['profile_picture_url'],
  organizations: ['logo_url'],
  menu_items: ['thumbnail_url'],
  exam_questions: ['question_image_url'],
  cocktails: ['thumbnail_url'],
  libation_recipes: ['thumbnail_url'],
  summer_libation_recipes: ['thumbnail_url'],
  puree_syrup_recipes: ['thumbnail_url'],
  announcements: ['thumbnail_url'],
  special_features: ['thumbnail_url'],
  upcoming_events: ['thumbnail_url'],
  content_images: ['image_url'],
  guides_and_training: ['thumbnail_url', 'file_url'],
  host_sections: ['card_image_url'],
  host_section_tiles: ['image_url'],
  menu_uploads: ['file_url'],
  schedule_uploads: ['file_url'],
  messages: ['image_url', 'file_url'],
};

const MAX_MOVES_PER_BATCH = 50;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PUBLIC_MARKER = '/storage/v1/object/public/';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bucket-agnostic public-URL → {bucket, path} (same marker approach as
// parse-menu's fetchFileAsBase64). Tolerates ?v=/?t= suffixes; rejects traversal.
function parsePublicStorageUrl(input: string): { bucket: string; path: string } | null {
  const idx = input.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  const rest = input.slice(idx + PUBLIC_MARKER.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  let path: string;
  try {
    path = decodeURIComponent(rest.slice(slash + 1).split('?')[0]);
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, '');
  if (!path || path.includes('..')) return null;
  return { bucket, path };
}

// Games' "use sample data" renders the sample org's objects cross-org (shared
// recipe library). Resolve its id by slug once per isolate — the slug is the
// single authority (mirrors SQL _recipe_source_org); fail closed on error.
let _sampleOrgId: string | null | undefined;
async function getSampleOrgId(supabase: any): Promise<string | null> {
  if (_sampleOrgId !== undefined) return _sampleOrgId;
  const { data, error } = await supabase
    .from('organizations').select('id').eq('slug', 'mcloones-boathouse').maybeSingle();
  if (error) {
    console.error('sample-org lookup failed', error.message);
    return null; // do not cache — retry next request
  }
  _sampleOrgId = data?.id ?? null;
  return _sampleOrgId;
}

// storage-mode: ANY read bucket with public=false ⇒ 'private'. Derived live so
// flipping buckets IS the fleet-wide switch (no separate flag to keep in sync);
// signed URLs already work on public buckets, so early switchers are harmless.
let _modeCache: { mode: 'public' | 'private'; at: number } | null = null;
async function getStorageMode(supabase: any): Promise<'public' | 'private'> {
  if (_modeCache && Date.now() - _modeCache.at < 60_000) return _modeCache.mode;
  const { data, error } = await supabase.storage.listBuckets();
  if (error || !data) {
    console.error('storage-mode listBuckets failed', error?.message);
    return _modeCache?.mode ?? 'public'; // stale answer over failing the caller
  }
  const anyPrivate = data.some((b: any) => READ_BUCKETS.has(b.name) && b.public === false);
  _modeCache = { mode: anyPrivate ? 'private' : 'public', at: Date.now() };
  return _modeCache.mode;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

function sanitizeExt(ext: unknown): string {
  const e = String(ext ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return e || 'bin';
}

function sanitizeName(name: unknown): string {
  const n = String(name ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 80);
  return n || 'file.bin';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const action = body?.action;
    const actorId = String(body?.actor_id ?? '');

    if (!ACTIONS.has(action)) {
      return json({ success: false, error: 'Unknown action' }, 400);
    }
    if (!UUID_RE.test(actorId)) {
      return json({ success: false, error: 'Not authorized' }, 403);
    }

    // Server-side actor verification (custom auth — never trust the JWT).
    const { data: actor, error: actorErr } = await supabase
      .from('users')
      .select('id, role, organization_id, is_active')
      .eq('id', actorId)
      .single();
    if (actorErr || !actor || actor.is_active === false || !actor.organization_id) {
      return json({ success: false, error: 'Not authorized' }, 403);
    }
    const isManager = actor.role === 'manager' || actor.role === 'owner';
    const isOwner = actor.role === 'owner';

    if (action === 'sign-upload') {
      const gate = GATES[String(body?.purpose ?? '')];
      if (!gate) return json({ success: false, error: 'Unknown purpose' }, 400);

      if (gate.roles === 'owner' && !isOwner) return json({ success: false, error: 'Not authorized' }, 403);
      if (gate.roles === 'manager' && !isManager) return json({ success: false, error: 'Not authorized' }, 403);

      // profile_picture: default target self; managers may target same-org users.
      let targetUserId = actor.id as string;
      if (body?.purpose === 'profile_picture' && body?.target_user_id && body.target_user_id !== actor.id) {
        if (!isManager || !UUID_RE.test(String(body.target_user_id))) {
          return json({ success: false, error: 'Not authorized' }, 403);
        }
        const { data: target, error: targetErr } = await supabase
          .from('users')
          .select('id, organization_id')
          .eq('id', body.target_user_id)
          .single();
        if (targetErr || !target || target.organization_id !== actor.organization_id) {
          return json({ success: false, error: 'Not authorized' }, 403);
        }
        targetUserId = target.id;
      }

      const sizeBytes = Number(body?.size_bytes ?? 0);
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > gate.maxBytes) {
        return json({ success: false, error: 'File too large' }, 400);
      }
      const contentType = String(body?.content_type ?? '');
      if (gate.mimes && !gate.mimes.includes(contentType)) {
        return json({ success: false, error: 'File type not allowed' }, 400);
      }

      const ctx: PathCtx = {
        orgId: actor.organization_id,
        targetUserId,
        ts: Date.now(),
        rand: Math.random().toString(36).slice(2, 8),
        ext: sanitizeExt(body?.ext),
        safeName: sanitizeName(body?.file_name),
      };
      const path = gate.path(ctx);

      const { data: signed, error: signErr } = await supabase.storage
        .from(gate.bucket)
        .createSignedUploadUrl(path);
      if (signErr || !signed) {
        console.error('sign-upload failed', gate.bucket, path, signErr?.message);
        return json({ success: false, error: 'Could not authorize upload' }, 500);
      }
      const { data: pub } = supabase.storage.from(gate.bucket).getPublicUrl(path);

      return json({
        success: true,
        bucket: gate.bucket,
        path,
        token: signed.token,
        signed_url: signed.signedUrl,
        public_url: pub.publicUrl,
      }, 200);
    }

    if (action === 'sign-read') {
      // Batch-mint signed READ URLs. Member-gated: any verified active actor.
      // While buckets are public the resolver never calls this (pass-through);
      // it exists so the private flip needs no client update. Per-item errors —
      // one bad row must not blank a screenful of good images.
      const tier = String(body?.expiry ?? 'image');
      const expiresIn = READ_EXPIRY[tier];
      if (!expiresIn) return json({ success: false, error: 'Bad expiry' }, 400);

      const items = body?.urls;
      if (!Array.isArray(items) || items.length === 0 || items.length > 60) {
        return json({ success: false, error: 'Provide 1-60 urls' }, 400);
      }

      type ReadItem = { input: string; bucket?: string; path?: string; error?: string };
      const parsed: ReadItem[] = items.map((raw: unknown): ReadItem => {
        if (typeof raw === 'string') {
          const hit = parsePublicStorageUrl(raw);
          return hit ? { input: raw, ...hit } : { input: raw, error: 'invalid_url' };
        }
        if (raw && typeof raw === 'object') {
          const bucket = String((raw as Record<string, unknown>).bucket ?? '');
          let path = String((raw as Record<string, unknown>).path ?? '');
          try { path = decodeURIComponent(path); } catch { /* keep as-is */ }
          path = path.split('?')[0].replace(/^\/+/, '');
          if (!bucket || !path || path.includes('..')) {
            return { input: `${bucket}/${path}`, error: 'invalid_url' };
          }
          return { input: `${bucket}/${path}`, bucket, path };
        }
        return { input: String(raw ?? ''), error: 'invalid_url' };
      });

      const orgIdLc = String(actor.organization_id).toLowerCase();
      const sampleOrgId = (await getSampleOrgId(supabase))?.toLowerCase() ?? null;

      for (const it of parsed) {
        if (it.error || !it.bucket || !it.path) continue;
        if (!READ_BUCKETS.has(it.bucket)) { it.error = 'invalid_url'; continue; }
        // _orphaned/ is the quarantine namespace — never readable via the broker.
        if (it.path.startsWith('_orphaned/')) { it.error = 'forbidden'; continue; }
        // STRICT MODE (session 50, post-move): every live object is org-prefixed,
        // so the ONLY readable paths are the actor's own org and the sample org
        // (shared recipe library + games' sample-data renders). The pre-move
        // legacy-flat and legacy-user-prefix allowances are gone.
        const first = it.path.split('/')[0];
        if (!UUID_RE.test(first)) { it.error = 'forbidden'; continue; }
        const f = first.toLowerCase();
        if (f === orgIdLc) continue;
        if (sampleOrgId && f === sampleOrgId) continue;
        it.error = 'forbidden';
      }

      const byBucket = new Map<string, ReadItem[]>();
      for (const it of parsed) {
        if (it.error || !it.bucket || !it.path) continue;
        const group = byBucket.get(it.bucket) ?? [];
        group.push(it);
        byBucket.set(it.bucket, group);
      }
      const signedByItem = new Map<ReadItem, string>();
      for (const [bucket, group] of byBucket) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrls(group.map((g) => g.path as string), expiresIn);
        if (signErr || !signed) {
          console.error('sign-read failed', bucket, signErr?.message);
          group.forEach((g) => { g.error = 'sign_failed'; });
          continue;
        }
        signed.forEach((row: { error: string | null; signedUrl: string | null }, i: number) => {
          const it = group[i];
          if (row.error || !row.signedUrl) {
            // storage-api wording varies ("Object not found" / "Either the object
            // does not exist or …") — map both; log the raw text for diagnosis.
            it.error = /not.?found|does not exist/i.test(String(row.error ?? ''))
              ? 'not_found' : 'sign_failed';
            console.log('sign-read item error', bucket, it.path, String(row.error ?? ''));
          } else {
            signedByItem.set(it, row.signedUrl);
          }
        });
      }

      console.log('sign-read', {
        actor: actor.id, n: parsed.length,
        signed: signedByItem.size, tier,
      });
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      return json({
        success: true,
        mode: await getStorageMode(supabase),
        expires_in: expiresIn,
        results: parsed.map((it) =>
          it.error
            ? { input: it.input, error: it.error }
            : {
                input: it.input, bucket: it.bucket, path: it.path,
                signed_url: signedByItem.get(it), expires_at: expiresAt,
              }),
      }, 200);
    }

    if (action === 'storage-mode') {
      // public|private from live bucket metadata (see getStorageMode). Actor-
      // gated for dispatch consistency only — the mode is publicly inferable
      // (HEAD any public URL), so the gate protects nothing; don't "harden" it.
      return json({
        success: true,
        mode: await getStorageMode(supabase),
        checked_at: new Date().toISOString(),
      }, 200);
    }

    if (action === 'admin-move-batch') {
      // TEMPORARY teardown-window mover (session 50). Moves legacy objects to
      // org-prefixed paths and rewrites the referencing URL columns, one move
      // at a time: move-object-FIRST, then exact-match column UPDATE (public
      // buckets + CDN edge cache cover the seconds in between; runbook §4).
      // dry_run (the default — executing requires the literal `false`) returns
      // the manifest without mutating anything.
      if (!isOwner) return json({ success: false, error: 'Not authorized' }, 403);

      const { data: secretRow } = await supabase
        .from('service_config').select('value').eq('key', 'admin_move_secret').maybeSingle();
      const expected = String(secretRow?.value ?? '');
      if (!expected || !safeEqual(String(body?.admin_secret ?? ''), expected)) {
        // Missing row = window closed = action disabled.
        return json({ success: false, error: 'Not authorized' }, 403);
      }

      const bucket = String(body?.bucket ?? '');
      if (!READ_BUCKETS.has(bucket)) return json({ success: false, error: 'Unknown bucket' }, 400);
      const dryRun = body?.dry_run !== false; // anything but explicit false stays non-destructive

      const rawMoves = body?.moves;
      if (!Array.isArray(rawMoves) || rawMoves.length === 0 || rawMoves.length > MAX_MOVES_PER_BATCH) {
        return json({ success: false, error: `Provide 1-${MAX_MOVES_PER_BATCH} moves` }, 400);
      }

      // Validate every move BEFORE touching anything (all-or-nothing on shape).
      const orgCache = new Map<string, boolean>();
      const isOrgId = async (id: string): Promise<boolean> => {
        const k = id.toLowerCase();
        if (!orgCache.has(k)) {
          const { data: row } = await supabase
            .from('organizations').select('id').eq('id', id).maybeSingle();
          orgCache.set(k, !!row);
        }
        return orgCache.get(k)!;
      };

      type MoveSpec = {
        from: string; to: string;
        rewrites: { table: string; column: string }[];
      };
      const moves: MoveSpec[] = [];
      for (const raw of rawMoves) {
        const from = String((raw as Record<string, unknown>)?.from ?? '').replace(/^\/+/, '');
        const to = String((raw as Record<string, unknown>)?.to ?? '').replace(/^\/+/, '');
        if (!from || !to || from.includes('..') || to.includes('..') || from === to) {
          return json({ success: false, error: `Bad move path: ${from} -> ${to}` }, 400);
        }
        // Prefix-only invariant, both directions. FORWARD: `to` is
        // `<realOrgId>/<from>` or `_orphaned/<from>`, and `from` is not already
        // org-prefixed (no double-prefixing). REVERSE (the manifest rollback
        // path — move(to, from)): the exact mirror. Anything else is rejected.
        const fromFirst = from.split('/')[0];
        const toFirst = to.split('/')[0];
        const fromOrg = UUID_RE.test(fromFirst) && await isOrgId(fromFirst);
        const toOrg = UUID_RE.test(toFirst) && await isOrgId(toFirst);
        const forward = !fromOrg &&
          (to === `_orphaned/${from}` || (toOrg && to === `${toFirst}/${from}`));
        const reverse = !toOrg &&
          (from === `_orphaned/${to}` || (fromOrg && from === `${fromFirst}/${to}`));
        if (!forward && !reverse) {
          return json({ success: false, error: `Move violates prefix-only rule: ${from} -> ${to}` }, 400);
        }

        const rawRewrites = (raw as Record<string, unknown>)?.rewrites ?? [];
        if (!Array.isArray(rawRewrites)) return json({ success: false, error: 'Bad rewrites' }, 400);
        const rewrites: { table: string; column: string }[] = [];
        for (const rw of rawRewrites) {
          const table = String((rw as Record<string, unknown>)?.table ?? '');
          const column = String((rw as Record<string, unknown>)?.column ?? '');
          if (!REWRITE_MAP[table]?.includes(column)) {
            return json({ success: false, error: `Rewrite not allowlisted: ${table}.${column}` }, 400);
          }
          rewrites.push({ table, column });
        }
        moves.push({ from, to, rewrites });
      }

      const publicBase = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
      const results: Record<string, unknown>[] = [];
      let movedCount = 0, skippedCount = 0, failedCount = 0, rewritesUpdated = 0;

      for (const mv of moves) {
        // Stored URLs come in exactly two dialects (measured 2026-07-21):
        // raw path (ts-style names) and encodeURI (space→%20; : & ' kept raw —
        // storage-js getPublicUrl's historical behavior). Exact-match both; the
        // prefix (org uuid / _orphaned) is encoding-invariant so the same
        // surgery applies to each variant. When the name is plain the two
        // strings coincide and the second UPDATE matches 0 rows — harmless.
        const oldVariants = [publicBase + mv.from, publicBase + encodeURI(mv.from)];
        const newVariants = [publicBase + mv.to, publicBase + encodeURI(mv.to)];
        const dual = oldVariants[0] !== oldVariants[1];
        const entry: Record<string, unknown> = {
          from: mv.from, to: mv.to,
          old_url: oldVariants[0], new_url: newVariants[0],
          ...(dual ? { old_url_encoded: oldVariants[1], new_url_encoded: newVariants[1] } : {}),
        };

        if (dryRun) {
          // Existence + collision probes (signed URLs need no read policies).
          const { error: srcErr } = await supabase.storage.from(bucket).createSignedUrl(mv.from, 60);
          const { error: dstErr } = await supabase.storage.from(bucket).createSignedUrl(mv.to, 60);
          entry.source_exists = !srcErr;
          entry.target_exists = !dstErr;
          const expectedCounts: Record<string, unknown>[] = [];
          for (const rw of mv.rewrites) {
            let expected = 0; let cntError: string | null = null;
            for (let v = 0; v < (dual ? 2 : 1); v++) {
              const { count, error: cntErr } = await supabase
                .from(rw.table).select(rw.column, { count: 'exact', head: true })
                .eq(rw.column, oldVariants[v]);
              if (cntErr) { cntError = cntErr.message; break; }
              expected += count ?? 0;
            }
            expectedCounts.push({
              table: rw.table, column: rw.column,
              expected: cntError ? null : expected,
              ...(cntError ? { error: cntError } : {}),
            });
          }
          entry.rewrites = expectedCounts;
          results.push(entry);
          continue;
        }

        // EXECUTE: move first…
        const { error: mvErr } = await supabase.storage.from(bucket).move(mv.from, mv.to);
        if (mvErr) {
          const msg = String(mvErr.message ?? '');
          if (/already exists|duplicate/i.test(msg)) {
            entry.status = 'skipped_exists'; skippedCount++;
          } else {
            entry.status = 'move_failed'; entry.error = msg; failedCount++;
          }
          results.push(entry);
          continue; // never rewrite columns for a move that did not happen
        }
        movedCount++;
        // …then exact-match column UPDATEs (both dialects), capturing counts.
        const done: Record<string, unknown>[] = [];
        for (const rw of mv.rewrites) {
          let updated = 0; let updError: string | null = null;
          for (let v = 0; v < (dual ? 2 : 1); v++) {
            const { count, error: updErr } = await supabase
              .from(rw.table)
              .update({ [rw.column]: newVariants[v] }, { count: 'exact' })
              .eq(rw.column, oldVariants[v]);
            if (updErr) { updError = updErr.message; break; }
            updated += count ?? 0;
          }
          if (updError) {
            done.push({ table: rw.table, column: rw.column, updated: null, error: updError });
          } else {
            done.push({ table: rw.table, column: rw.column, updated });
            rewritesUpdated += updated;
          }
        }
        entry.status = 'moved';
        entry.rewrites = done;
        results.push(entry);
      }

      console.log('admin-move-batch', {
        actor: actor.id, bucket, dry_run: dryRun, n: moves.length,
        moved: movedCount, skipped: skippedCount, failed: failedCount,
      });
      return json({
        success: true, dry_run: dryRun, bucket,
        summary: {
          total: moves.length, moved: movedCount, skipped_exists: skippedCount,
          move_failed: failedCount, rewrites_updated: rewritesUpdated,
        },
        results,
      }, 200);
    }

    // action === 'delete'
    const bucket = String(body?.bucket ?? '');
    if (!DELETE_BUCKETS.has(bucket)) return json({ success: false, error: 'Bucket not deletable' }, 400);
    if (!isManager) return json({ success: false, error: 'Not authorized' }, 403);

    const urls = body?.urls;
    if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10) {
      return json({ success: false, error: 'Provide 1-10 urls' }, 400);
    }

    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
    const paths: string[] = [];
    for (const raw of urls) {
      let p = String(raw ?? '');
      if (p.startsWith('http')) {
        if (!p.startsWith(publicPrefix)) return json({ success: false, error: 'URL not in bucket' }, 403);
        p = p.slice(publicPrefix.length);
      }
      p = decodeURIComponent(p).replace(/^\/+/, '');
      if (!p || p.includes('..')) return json({ success: false, error: 'Bad path' }, 400);
      // STRICT MODE (session 50, post-move): deletes must target the actor's
      // OWN org prefix — the legacy-flat pass is gone (no flat objects remain),
      // and _orphaned/ + other orgs' prefixes fail this same check.
      const first = p.split('/')[0];
      if (!UUID_RE.test(first) || first.toLowerCase() !== String(actor.organization_id).toLowerCase()) {
        return json({ success: false, error: 'Not authorized' }, 403);
      }
      paths.push(p);
    }

    console.log('storage-broker delete', { actor: actor.id, bucket, paths });
    const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
    if (rmErr) {
      console.error('delete failed', bucket, rmErr.message);
      return json({ success: false, error: 'Delete failed' }, 400);
    }
    return json({ success: true, deleted: paths.length }, 200);
  } catch (err) {
    console.error('storage-broker error', err instanceof Error ? err.message : err);
    return json({ success: false, error: 'Bad request' }, 400);
  }
});
