import { supabase } from '@/app/integrations/supabase/client';

export type ContentType = 'announcement' | 'special_feature' | 'upcoming_event';

/**
 * Maps table names to content_type values used in the content_images table
 */
const TABLE_TO_CONTENT_TYPE: Record<string, ContentType> = {
  announcements: 'announcement',
  special_features: 'special_feature',
  upcoming_events: 'upcoming_event',
};

/**
 * Maps content types to their storage bucket names
 */
const CONTENT_TYPE_TO_BUCKET: Record<ContentType, string> = {
  announcement: 'announcements',
  special_feature: 'special-features',
  upcoming_event: 'upcoming-events',
};

/**
 * Fetches additional images for a single content item.
 * Returns an array of image URLs ordered by display_order.
 * Member-gated RPC — org derived server-side from the actor (the old optional
 * org filter was passed by nobody, so reads spanned every org).
 */
export async function fetchContentImages(
  actorId: string | undefined | null,
  contentType: ContentType,
  contentId: string
): Promise<string[]> {
  if (!actorId) return [];
  try {
    const { data, error } = await supabase.rpc('get_content_images', {
      p_actor_id: actorId,
      p_content_type: contentType,
      p_content_ids: [contentId],
    });

    if (error) {
      console.error('Error fetching content images:', error);
      return [];
    }

    return ((data as any[]) || []).map((row) => row.image_url);
  } catch (err) {
    console.error('Content images fetch error:', err);
    return [];
  }
}

/**
 * Fetches additional images for multiple content items in a single query.
 * Returns a Map of content_id -> image URLs array (rows arrive display_order ASC).
 */
export async function fetchContentImagesBatch(
  actorId: string | undefined | null,
  contentType: ContentType,
  contentIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!actorId || contentIds.length === 0) return result;

  try {
    const { data, error } = await supabase.rpc('get_content_images', {
      p_actor_id: actorId,
      p_content_type: contentType,
      p_content_ids: contentIds,
    });

    if (error) {
      console.error('Error fetching content images batch:', error);
      return result;
    }

    for (const row of (data as any[]) || []) {
      const existing = result.get(row.content_id) || [];
      existing.push(row.image_url);
      result.set(row.content_id, existing);
    }

    return result;
  } catch (err) {
    console.error('Content images batch fetch error:', err);
    return result;
  }
}

/**
 * Saves additional images for a content item — atomic full-set replace via the
 * manager-gated RPC (verifies the parent row is in the actor's org; empty array
 * clears the set). display_order = array position, org set server-side.
 *
 * @param contentType - The type of content ('announcement', 'special_feature', 'upcoming_event')
 * @param contentId - The UUID of the content item
 * @param imageUrls - The full ordered array of image URLs to save (existing + newly uploaded)
 */
export async function saveContentImages(
  actorId: string | undefined | null,
  contentType: ContentType,
  contentId: string,
  imageUrls: string[]
): Promise<boolean> {
  if (!actorId) return false;
  try {
    const { error } = await supabase.rpc('replace_content_images', {
      p_actor_id: actorId,
      p_content_type: contentType,
      p_content_id: contentId,
      p_image_urls: imageUrls,
    });

    if (error) {
      console.error('Error saving content images:', error);
      return false;
    }

    console.log(`Saved ${imageUrls.length} additional images for ${contentType} ${contentId}`);
    return true;
  } catch (err) {
    console.error('Save content images error:', err);
    return false;
  }
}

/**
 * Uploads an image to a specific storage bucket and returns the public URL.
 * The lowest-level shared upload helper.
 */
export async function uploadImageToBucket(
  uri: string,
  bucket: string,
  readAsBase64: (uri: string) => Promise<string>
): Promise<string | null> {
  try {
    const base64 = await readAsBase64(uri);

    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;

    let contentTypeHeader = 'image/jpeg';
    if (ext === 'png') contentTypeHeader = 'image/png';
    else if (ext === 'gif') contentTypeHeader = 'image/gif';
    else if (ext === 'webp') contentTypeHeader = 'image/webp';

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, byteArray, {
        contentType: contentTypeHeader,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image to storage:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.error('Image upload error:', err);
    return null;
  }
}

/**
 * Uploads an image to the bucket mapped from a content type (announcements,
 * special-features, upcoming-events). Thin wrapper over uploadImageToBucket.
 */
export async function uploadImageToStorage(
  uri: string,
  contentType: ContentType,
  readAsBase64: (uri: string) => Promise<string>
): Promise<string | null> {
  return uploadImageToBucket(uri, CONTENT_TYPE_TO_BUCKET[contentType], readAsBase64);
}

// deleteContentImages is gone: the delete_announcement / delete_special_feature /
// delete_upcoming_event RPCs now cascade this content's image rows server-side
// (the old client call ran AFTER the parent row was deleted, unscoped by org).

/**
 * Helper to get the content type from a table name.
 */
export function getContentType(tableName: string): ContentType | null {
  return TABLE_TO_CONTENT_TYPE[tableName] || null;
}
