import { supabase } from '@/app/integrations/supabase/client';

export type ContentType = 'announcement' | 'special_feature' | 'upcoming_event';

interface ContentImage {
  id: string;
  content_type: ContentType;
  content_id: string;
  image_url: string;
  display_order: number;
  created_at: string;
}

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
 */
export async function fetchContentImages(
  contentType: ContentType,
  contentId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('content_images')
      .select('image_url')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching content images:', error);
      return [];
    }

    return (data || []).map((row) => row.image_url);
  } catch (err) {
    console.error('Content images fetch error:', err);
    return [];
  }
}

/**
 * Fetches additional images for multiple content items in a single query.
 * Returns a Map of content_id -> image URLs array.
 */
export async function fetchContentImagesBatch(
  contentType: ContentType,
  contentIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (contentIds.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('content_images')
      .select('content_id, image_url')
      .eq('content_type', contentType)
      .in('content_id', contentIds)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching content images batch:', error);
      return result;
    }

    for (const row of data || []) {
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
 * Saves additional images for a content item.
 * Handles uploading new images and syncing the content_images table.
 *
 * @param contentType - The type of content ('announcement', 'special_feature', 'upcoming_event')
 * @param contentId - The UUID of the content item
 * @param imageUrls - The full ordered array of image URLs to save (existing + newly uploaded)
 */
export async function saveContentImages(
  contentType: ContentType,
  contentId: string,
  imageUrls: string[]
): Promise<boolean> {
  try {
    // Delete all existing images for this content item
    const { error: deleteError } = await supabase
      .from('content_images')
      .delete()
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    if (deleteError) {
      console.error('Error deleting old content images:', deleteError);
      return false;
    }

    // Insert new images if any
    if (imageUrls.length > 0) {
      const rows = imageUrls.map((url, index) => ({
        content_type: contentType,
        content_id: contentId,
        image_url: url,
        display_order: index,
      }));

      const { error: insertError } = await supabase
        .from('content_images')
        .insert(rows);

      if (insertError) {
        console.error('Error inserting content images:', insertError);
        return false;
      }
    }

    console.log(`Saved ${imageUrls.length} additional images for ${contentType} ${contentId}`);
    return true;
  } catch (err) {
    console.error('Save content images error:', err);
    return false;
  }
}

/**
 * Uploads an image to the appropriate storage bucket and returns the public URL.
 * Shared across all editor types to avoid code duplication.
 */
export async function uploadImageToStorage(
  uri: string,
  contentType: ContentType,
  readAsBase64: (uri: string) => Promise<string>
): Promise<string | null> {
  try {
    const bucket = CONTENT_TYPE_TO_BUCKET[contentType];
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
 * Deletes all content images for a content item (used when deleting the content itself).
 */
export async function deleteContentImages(
  contentType: ContentType,
  contentId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('content_images')
      .delete()
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    if (error) {
      console.error('Error deleting content images:', error);
    }
  } catch (err) {
    console.error('Delete content images error:', err);
  }
}

/**
 * Helper to get the content type from a table name.
 */
export function getContentType(tableName: string): ContentType | null {
  return TABLE_TO_CONTENT_TYPE[tableName] || null;
}
