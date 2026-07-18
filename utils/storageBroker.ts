import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/app/integrations/supabase/client';

/**
 * B4a (session 48): ALL storage WRITES go through the storage-broker edge
 * function. Direct anon-key uploads/deletes are revoked at the DB — the broker
 * verifies the actor (custom auth: p_actor_id, auth.uid() is always NULL),
 * generates an org-prefixed path server-side, and returns a signed upload URL
 * whose token authorizes the write without any storage.objects permissions.
 * READS are unchanged in B4a: buckets stay public and callers keep storing the
 * full public URL this module returns.
 */

export type UploadPurpose =
  | 'announcement_image'
  | 'special_feature_image'
  | 'upcoming_event_image'
  | 'host_section_image'
  | 'menu_item_image'
  | 'quiz_question_image'
  | 'guide_thumbnail'
  | 'guide_file'
  | 'cocktail_image'
  | 'libation_image'
  | 'summer_libation_image'
  | 'puree_syrup_image'
  | 'message_image'
  | 'message_file'
  | 'profile_picture'
  | 'org_logo'
  | 'menu_upload_file'
  | 'schedule_upload_file';

interface SignUploadResponse {
  success: boolean;
  bucket?: string;
  path?: string;
  token?: string;
  signed_url?: string;
  public_url?: string;
  error?: string;
}

/** Decodes a base64 string into bytes (the app-wide upload payload shape). */
export function base64ToBytes(base64: string): Uint8Array {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
}

/** Image content-type for a file extension (same defaults as the old helpers). */
export function imageContentTypeForExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function signUpload(params: {
  actorId: string;
  purpose: UploadPurpose;
  ext?: string;
  contentType: string;
  sizeBytes: number;
  fileName?: string;
  targetUserId?: string;
}): Promise<SignUploadResponse | null> {
  const { data, error } = await supabase.functions.invoke('storage-broker', {
    body: {
      action: 'sign-upload',
      actor_id: params.actorId,
      purpose: params.purpose,
      ext: params.ext,
      content_type: params.contentType,
      size_bytes: params.sizeBytes,
      file_name: params.fileName,
      target_user_id: params.targetUserId,
    },
  });
  if (error || !data?.success) {
    console.error('storage-broker sign-upload failed:', error ?? data?.error);
    return null;
  }
  return data as SignUploadResponse;
}

async function uploadBytes(params: {
  actorId: string;
  purpose: UploadPurpose;
  bytes: Uint8Array;
  ext?: string;
  contentType: string;
  fileName?: string;
  targetUserId?: string;
}): Promise<string | null> {
  const signed = await signUpload({
    actorId: params.actorId,
    purpose: params.purpose,
    ext: params.ext,
    contentType: params.contentType,
    sizeBytes: params.bytes.length,
    fileName: params.fileName,
    targetUserId: params.targetUserId,
  });
  if (!signed?.bucket || !signed.path || !signed.token || !signed.public_url) return null;

  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, params.bytes, {
      contentType: params.contentType,
    });
  if (error) {
    console.error('storage-broker signed upload failed:', error);
    return null;
  }
  return signed.public_url;
}

/**
 * Uploads an image from a local uri and returns its public URL (null on failure
 * — same contract every screen already handles). For profile pictures a
 * manager/owner may pass targetUserId to set another same-org user's photo.
 */
export async function brokerUploadImage(
  purpose: UploadPurpose,
  uri: string,
  actorId: string,
  opts?: { targetUserId?: string }
): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    return await uploadBytes({
      actorId,
      purpose,
      bytes,
      ext,
      contentType: imageContentTypeForExt(ext),
      targetUserId: opts?.targetUserId,
    });
  } catch (err) {
    console.error('Image upload error:', err);
    return null;
  }
}

/**
 * Uploads an arbitrary file (guide files, message attachments) from a local uri.
 * Returns the public URL or null.
 */
export async function brokerUploadFile(
  purpose: UploadPurpose,
  uri: string,
  originalFileName: string,
  contentType: string,
  actorId: string
): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'bin';
    return await uploadBytes({
      actorId,
      purpose,
      bytes,
      ext,
      contentType,
      fileName: originalFileName,
    });
  } catch (err) {
    console.error('File upload error:', err);
    return null;
  }
}

/**
 * Uploads already-read base64 content (menu/schedule upload flows). THROWS on
 * failure to match those callers' existing error style. Returns the public URL.
 */
export async function brokerUploadBase64(
  purpose: UploadPurpose,
  base64: string,
  fileName: string,
  contentType: string,
  actorId: string
): Promise<string> {
  const bytes = base64ToBytes(base64);
  const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
  const publicUrl = await uploadBytes({
    actorId,
    purpose,
    bytes,
    ext,
    contentType,
    fileName,
  });
  if (!publicUrl) throw new Error('File upload failed');
  return publicUrl;
}

/**
 * Best-effort delete of stored objects by their public URLs (or bare paths).
 * The broker derives+validates paths server-side (works for legacy flat paths
 * AND new org-prefixed paths). Errors are logged, never thrown — deletes run
 * after the parent row's delete RPC, as before.
 */
export async function brokerDelete(
  bucket: string,
  storedUrlsOrPaths: (string | null | undefined)[],
  actorId: string
): Promise<void> {
  const urls = storedUrlsOrPaths.filter((u): u is string => !!u);
  if (urls.length === 0) return;
  try {
    const { data, error } = await supabase.functions.invoke('storage-broker', {
      body: { action: 'delete', actor_id: actorId, bucket, urls },
    });
    if (error || !data?.success) {
      console.error('storage-broker delete failed:', error ?? data?.error);
    }
  } catch (err) {
    console.error('storage-broker delete error:', err);
  }
}
