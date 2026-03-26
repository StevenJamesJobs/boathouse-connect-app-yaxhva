import * as FileSystem from 'expo-file-system';
import { supabase } from '@/app/integrations/supabase/client';

const BUCKET = 'message-attachments';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validates that an image file is under the size limit.
 * Returns true if valid, false if too large.
 */
export async function validateImageSize(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && info.size) {
      return info.size <= MAX_FILE_SIZE;
    }
    return true; // If we can't determine size, allow it
  } catch {
    return true;
  }
}

/**
 * Uploads a message image to Supabase Storage and returns the public URL.
 * Returns null on failure.
 */
export async function uploadMessageImage(uri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;

    let contentType = 'image/jpeg';
    if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, byteArray, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading message image:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.error('Message image upload error:', err);
    return null;
  }
}
