import * as FileSystem from 'expo-file-system';
import { supabase } from '@/app/integrations/supabase/client';

const BUCKET = 'message-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for files

/**
 * Validates that a file is under the size limit.
 * Returns true if valid, false if too large.
 */
export async function validateFileSize(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && info.size) {
      return info.size <= MAX_FILE_SIZE;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Uploads a message file to Supabase Storage and returns the public URL.
 * Returns null on failure.
 */
export async function uploadMessageFile(uri: string, originalFileName: string): Promise<string | null> {
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

    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'pdf';
    const fileName = `files/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;

    const contentType = getContentType(ext);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, byteArray, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading message file:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.error('Message file upload error:', err);
    return null;
  }
}

/**
 * Returns the appropriate content type for a file extension.
 */
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Returns an icon name and color based on file extension.
 */
export function getFileIconInfo(fileName: string): { iosIcon: string; androidIcon: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return { iosIcon: 'doc.fill', androidIcon: 'picture-as-pdf', color: '#E74C3C' };
    case 'doc':
    case 'docx':
      return { iosIcon: 'doc.text.fill', androidIcon: 'description', color: '#2B579A' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { iosIcon: 'tablecells.fill', androidIcon: 'table-chart', color: '#217346' };
    case 'ppt':
    case 'pptx':
      return { iosIcon: 'rectangle.fill.on.rectangle.fill', androidIcon: 'slideshow', color: '#D24726' };
    case 'txt':
      return { iosIcon: 'doc.plaintext.fill', androidIcon: 'article', color: '#6C757D' };
    case 'zip':
      return { iosIcon: 'doc.zipper', androidIcon: 'folder-zip', color: '#F39C12' };
    default:
      return { iosIcon: 'doc.fill', androidIcon: 'insert-drive-file', color: '#6C757D' };
  }
}
