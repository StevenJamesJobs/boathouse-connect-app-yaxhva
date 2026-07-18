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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (action !== 'sign-upload' && action !== 'delete') {
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
      // New-style paths are org-prefixed: enforce the actor's own org. Legacy
      // flat paths (pre-B4a) have no org segment and pass — documented residual
      // until B4b org-prefixes the historical objects.
      const first = p.split('/')[0];
      if (UUID_RE.test(first) && first.toLowerCase() !== String(actor.organization_id).toLowerCase()) {
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
