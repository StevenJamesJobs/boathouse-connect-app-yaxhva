export function getImageUrl(url: string | null, updatedAt?: string | null): string | null {
  if (!url) return null;
  return updatedAt ? `${url}?v=${updatedAt}` : url;
}

export function getImageUrlFresh(url: string | null): string | null {
  if (!url) return null;
  return `${url}?t=${Date.now()}`;
}
