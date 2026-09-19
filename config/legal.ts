/**
 * Public web links the pre-login / onboarding family points at. PLACEHOLDERS until the
 * MyRestoConnect.com site ships (the compliance phase finalizes them) — every screen reads
 * them from here so the swap is one edit.
 */
export const LEGAL = {
  termsUrl: 'https://myrestoconnect.com/terms',
  privacyUrl: 'https://myrestoconnect.com/privacy',
  /** One web link that forwards to the right store, so the share text never forks per platform. */
  appUrl: 'https://myrestoconnect.com/app',
  /** Shown as plain text in the finish-line blurb. */
  tutorialsHost: 'MyRestoConnect.com',
  tutorialsUrl: 'https://myrestoconnect.com',
  /** Recorded with the owner's clickwrap tick (signup_owner_with_org p_tos_version). */
  tosVersion: '2026-09',
} as const;
