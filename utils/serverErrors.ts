/**
 * Server-error → i18n map, Phase 1 (s62).
 *
 * The auth/onboarding RPCs (join_signup, signup_owner_with_org, update_password,
 * create_user) RAISE static English strings that some screens show verbatim.
 * Every RAISE in those functions is a static literal (verified against
 * pg_proc.prosrc), so an exact-match map is sufficient; the only dynamic
 * messages are raw Postgres 23505 duplicate-key errors from the manager
 * create_user path, matched by regex.
 *
 * Unmapped messages pass through RAW (debuggable) — callers supply their
 * existing generic fallback for the empty-message case. Phase 2 widens this
 * to the ~45 editor-screen error.message sites; the long-term fix is stable
 * server error codes, for which these slugs are forward-compatible.
 */
import i18n from '@/i18n';

const EXACT_MAP: Record<string, string> = {
  // join_signup
  'Invalid join code': 'server_errors.invalid_join_code',
  'Self-registration is disabled for this organization': 'server_errors.self_signup_disabled',
  'This organization has no default password configured': 'server_errors.org_no_default_password',
  'Name is required': 'server_errors.name_required',
  'Name is too long': 'server_errors.name_too_long',
  'A valid email address is required': 'server_errors.email_invalid',
  'Please enter an email address': 'server_errors.email_required',
  'That email address is already in use': 'server_errors.email_in_use',
  'Could not create the account, please try again': 'server_errors.account_create_failed',
  // signup_owner_with_org
  'First name is required': 'server_errors.first_name_required',
  'Last name is required': 'server_errors.last_name_required',
  'Restaurant name is required': 'server_errors.restaurant_name_required',
  'Password must be at least 6 characters': 'server_errors.password_min_6',
  // create_user
  'Only managers or owners can create users': 'server_errors.create_user_forbidden',
  'Cannot create a user in another organization': 'server_errors.create_user_cross_org',
  'Only an owner can create a manager or owner': 'server_errors.create_role_owner_only',
  'Self-signup requires a join code': 'server_errors.self_signup_needs_code',
  // update_password
  'Current password is incorrect': 'server_errors.current_password_incorrect',
  "Only managers can reset another user's password": 'server_errors.reset_password_managers_only',
  "Only an owner can reset an owner's password": 'server_errors.reset_password_owner_only',
  // _throttle_check token (login/join rate limiting)
  'rate_limited': 'server_errors.rate_limited',
};

export function translateServerError(
  err: { message?: string | null } | null | undefined,
  fallback?: string
): string {
  const msg = (err?.message || '').trim();
  if (msg) {
    const key = EXACT_MAP[msg];
    if (key) return i18n.t(key);
    // users has BOTH a raw and a lower(username) unique index — a case-variant
    // duplicate violates only the _lower_ one.
    if (/duplicate key value.*users_username(_lower)?_key/.test(msg)) return i18n.t('server_errors.username_taken');
    if (/duplicate key value.*users_email_key/.test(msg)) return i18n.t('server_errors.email_in_use');
    return msg;
  }
  return fallback || i18n.t('onboarding.something_went_wrong');
}
