// B4b note: this stays a pure sync string builder. The ?v= suffix is parsed
// back off by utils/storageResolver.ts at the render leaf (StorageImage), which
// owns final URL assembly — in private mode the version becomes part of the
// signed-URL cache key and is never appended to a signed URL.
export function getImageUrl(url: string | null, updatedAt?: string | null): string | null {
  if (!url) return null;
  return updatedAt ? `${url}?v=${updatedAt}` : url;
}
