/**
 * s80 — one-time post attachments + the storage retire path.
 *
 * Postgres cannot delete storage objects, so every server routine that retires
 * a file (set_content_attachment replacing one, retire_content_storage before a
 * manual delete, sweep_expired_content on expiry) queues the URL in
 * storage_pending_deletes and hands it back. This module is the other half:
 * broker-delete what came back (10 per call, per bucket), then ack ONLY the
 * URLs the broker confirmed. Anything un-acked is handed back again by the
 * next sweep — the safety net Steve chose over a scheduled job (Option A).
 */
import { supabase } from '@/app/integrations/supabase/client';
import { brokerDeleteChecked, brokerUploadFile } from '@/utils/storageBroker';
import { CONTENT_ATTACHMENT_PURPOSE, type ContentKind } from '@/components/content/contentVisuals';

export interface ContentAttachment {
  file_url: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number | null;
}

export interface RetiredFile {
  bucket: string;
  file_url: string;
}

/** Batch read — a Map of content_id → attachment (posts without one are absent). */
export async function fetchContentAttachmentsBatch(
  actorId: string | undefined | null,
  kind: ContentKind,
  contentIds: string[]
): Promise<Map<string, ContentAttachment>> {
  const result = new Map<string, ContentAttachment>();
  if (!actorId || contentIds.length === 0) return result;
  try {
    const { data, error } = await supabase.rpc('get_content_attachments', {
      p_actor_id: actorId,
      p_content_type: kind,
      p_content_ids: contentIds,
    });
    if (error) {
      console.error('Error fetching content attachments:', error);
      return result;
    }
    for (const row of data || []) {
      result.set(row.content_id, {
        file_url: row.file_url,
        file_name: row.file_name,
        file_type: row.file_type ?? null,
        // int8 arrives as a JSON number, but the NUMERIC-as-string gotcha (s79)
        // makes a defensive Number() the house habit.
        size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
      });
    }
  } catch (err) {
    console.error('Content attachments batch fetch error:', err);
  }
  return result;
}

/** Uploads a picked file through the broker; returns its stored URL or null. */
export async function uploadContentAttachment(
  kind: ContentKind,
  uri: string,
  fileName: string,
  mimeType: string,
  actorId: string
): Promise<string | null> {
  return brokerUploadFile(CONTENT_ATTACHMENT_PURPOSE[kind], uri, fileName, mimeType, actorId);
}

/**
 * Deletes the handed-back files through the broker and acks the confirmed ones.
 * Best-effort and never throws — the row delete that preceded it already
 * succeeded, and an un-acked URL is simply handed back on the next sweep.
 */
export async function brokerRetire(actorId: string, files: RetiredFile[]): Promise<void> {
  if (files.length === 0) return;
  const byBucket = new Map<string, string[]>();
  for (const f of files) {
    if (!f.bucket || !f.file_url) continue;
    const list = byBucket.get(f.bucket) ?? [];
    if (!list.includes(f.file_url)) list.push(f.file_url);
    byBucket.set(f.bucket, list);
  }
  const confirmed: string[] = [];
  for (const [bucket, urls] of byBucket) {
    for (let i = 0; i < urls.length; i += 10) {
      const chunk = urls.slice(i, i + 10);
      const ok = await brokerDeleteChecked(bucket, chunk, actorId);
      if (ok) confirmed.push(...chunk);
    }
  }
  if (confirmed.length === 0) return;
  try {
    const { error } = await supabase.rpc('ack_pending_deletes', {
      p_actor_id: actorId,
      p_file_urls: confirmed,
    });
    if (error) console.error('ack_pending_deletes failed:', error);
  } catch (err) {
    console.error('ack_pending_deletes error:', err);
  }
}

/**
 * Upserts (or clears with null) a post's attachment, then retires whatever it
 * replaced. Returns false only when the RPC itself failed.
 */
export async function setContentAttachment(
  actorId: string,
  kind: ContentKind,
  contentId: string,
  attachment: ContentAttachment | null
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('set_content_attachment', {
      p_actor_id: actorId,
      p_content_type: kind,
      p_content_id: contentId,
      p_file_url: attachment?.file_url ?? null,
      p_file_name: attachment?.file_name ?? null,
      p_file_type: attachment?.file_type ?? null,
      p_size_bytes: attachment?.size_bytes ?? null,
    });
    if (error) {
      console.error('set_content_attachment failed:', error);
      return false;
    }
    const retired = (data || []) as string[];
    if (retired.length > 0) {
      const bucket = bucketFor(kind);
      await brokerRetire(actorId, retired.map((file_url) => ({ bucket, file_url })));
    }
    return true;
  } catch (err) {
    console.error('set_content_attachment error:', err);
    return false;
  }
}

/**
 * Call BEFORE the post's delete_* RPC: queues thumbnail + extra images +
 * attachment server-side and returns them. The caller deletes the row, then
 * hands the list to brokerRetire. (Queue first, delete second — the URLs are
 * unreachable once the row is gone.)
 */
export async function retireContentStorage(
  actorId: string,
  kind: ContentKind,
  contentId: string
): Promise<RetiredFile[]> {
  try {
    const { data, error } = await supabase.rpc('retire_content_storage', {
      p_actor_id: actorId,
      p_content_type: kind,
      p_content_id: contentId,
    });
    if (error) {
      console.error('retire_content_storage failed:', error);
      return [];
    }
    return (data || []).map((r) => ({ bucket: r.bucket, file_url: r.file_url }));
  } catch (err) {
    console.error('retire_content_storage error:', err);
    return [];
  }
}

/**
 * The expiry sweep (replaces the two delete_expired_* calls). Deletes expired
 * specials + events server-side and hands back EVERY pending file for the org.
 * Only a manager/owner can broker-delete (the broker's delete action is
 * manager-only), so employees just refresh and the rows wait. Returns true when
 * the sweep ran (callers refetch regardless).
 */
export async function sweepExpiredContent(
  actorId: string | undefined | null,
  canDelete: boolean
): Promise<boolean> {
  if (!actorId) return false;
  try {
    const { data, error } = await supabase.rpc('sweep_expired_content', { p_actor_id: actorId });
    if (error) {
      console.error('sweep_expired_content failed:', error);
      return false;
    }
    if (canDelete && data && data.length > 0) {
      // Fire-and-forget: the list refresh must not wait on storage.
      void brokerRetire(actorId, data.map((r) => ({ bucket: r.bucket, file_url: r.file_url })));
    }
    return true;
  } catch (err) {
    console.error('sweep_expired_content error:', err);
    return false;
  }
}

function bucketFor(kind: ContentKind): string {
  return kind === 'announcement' ? 'announcements' : kind === 'special_feature' ? 'special-features' : 'upcoming-events';
}
