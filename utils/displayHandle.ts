/**
 * Social "@handle" shown on mini-profile cards (and future social surfaces).
 *
 * Most orgs use a `jinitial+lastname` username (e.g. "jsmith"), which is safe to
 * show. But McLoone's/Boathouse usernames are the staff member's 4-digit Aloha
 * POS PIN — showing that publicly would leak POS access. So when the username is
 * purely numeric, we DERIVE a privacy-safe handle from the person's name
 * (first initial + last name, e.g. "John Smith" → "jsmith") instead of exposing
 * the login. The numeric username remains their real login credential.
 */
export function displayHandle(name?: string | null, username?: string | null): string | null {
  const u = (username || '').trim();
  // Non-numeric usernames (the standard jinitial+lastname format) are shown as-is.
  if (u && !/^\d+$/.test(u)) return u;

  // Numeric login (Aloha PIN) → derive from the name.
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0];
  const last = parts.slice(1).join('');
  const derived = (last ? first.charAt(0) + last : first).toLowerCase().replace(/[^a-z0-9]/g, '');
  return derived || null;
}
