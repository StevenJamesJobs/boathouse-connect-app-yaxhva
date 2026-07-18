import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadImage, UploadPurpose } from '@/utils/storageBroker';

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
 * Maps content types to their storage-broker upload purposes (B4a: direct
 * bucket writes are revoked; uploads go through the broker edge function).
 */
const CONTENT_TYPE_TO_PURPOSE: Record<ContentType, UploadPurpose> = {
  announcement: 'announcement_image',
  special_feature: 'special_feature_image',
  upcoming_event: 'upcoming_event_image',
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
 * Uploads a content image (announcement, special-feature, upcoming-event) via
 * the storage broker and returns the public URL. B4a: the broker verifies the
 * actor's role, builds the org-prefixed path, and signs the upload — direct
 * bucket writes no longer exist.
 */
export async function uploadImageToStorage(
  uri: string,
  contentType: ContentType,
  actorId: string
): Promise<string | null> {
  return brokerUploadImage(CONTENT_TYPE_TO_PURPOSE[contentType], uri, actorId);
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
