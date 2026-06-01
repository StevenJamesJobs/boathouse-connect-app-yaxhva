/**
 * Derive a login username from a person's name: first initial + last name,
 * lowercased, alphanumeric only. e.g. "Steven Eccles" -> "seccles".
 *
 * Collisions (two people who share a first initial + last name) are resolved
 * by the caller — the atomic `signup_owner_with_org` RPC does it server-side
 * for owners; `findAvailableUsername` below does it for employee self-signup.
 */
export function deriveUsername(firstName: string, lastName: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const initial = first.charAt(0).toLowerCase();
  const lastClean = last.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = `${initial}${lastClean}`.replace(/[^a-z0-9]/g, '');
  return base;
}

/**
 * Resolve a unique username from a base, checking availability with the
 * provided predicate. Appends 2, 3, 4… until a free one is found.
 *
 * @param base       the derived base username (e.g. "seccles")
 * @param isTaken    async predicate returning true if a username already exists
 * @param maxTries   safety bound on attempts
 */
export async function findAvailableUsername(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxTries = 50,
): Promise<string> {
  const safeBase = base || 'user';
  let candidate = safeBase;
  let counter = 1;
  while (await isTaken(candidate)) {
    counter += 1;
    candidate = `${safeBase}${counter}`;
    if (counter > maxTries) break;
  }
  return candidate;
}
