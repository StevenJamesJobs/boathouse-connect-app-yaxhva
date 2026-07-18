import * as FileSystem from 'expo-file-system/legacy';
import { brokerUploadImage } from '@/utils/storageBroker';

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
 * Uploads a message image via the storage broker and returns the public URL.
 * Returns null on failure. B4a: any active member may attach an image
 * (send_message doesn't role-gate p_image_url); the broker enforces the same.
 */
export async function uploadMessageImage(uri: string, actorId: string): Promise<string | null> {
  return brokerUploadImage('message_image', uri, actorId);
}
