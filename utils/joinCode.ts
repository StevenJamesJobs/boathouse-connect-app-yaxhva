/**
 * Generate a join code like "JOES-7X4K" from a restaurant name.
 *
 * - 4-char prefix: uppercase alpha chars from the name (padded with 'X' if
 *   the name yields fewer than 4 letters).
 * - Hyphen separator.
 * - 4-char random alphanumeric suffix (uppercase).
 */
export function generateJoinCode(restaurantName: string): string {
  const ALPHA_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // Strip non-alpha, uppercase, take first 4, pad with X
  const alpha = restaurantName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = (alpha + 'XXXX').slice(0, 4);

  // 4 random alphanumeric (uppercase)
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += ALPHA_CHARS.charAt(Math.floor(Math.random() * ALPHA_CHARS.length));
  }

  return `${prefix}-${suffix}`;
}
