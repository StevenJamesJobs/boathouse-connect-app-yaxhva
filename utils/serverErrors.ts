/**
 * Server-error → i18n map. Phase 1 (s62): the auth/onboarding RPCs
 * (join_signup, signup_owner_with_org, update_password, create_user).
 * Phase 2 (s63): the shared guard/validation/race strings of the RPCs the
 * editor screens call (~83 rewired error.message sites).
 *
 * Every mapped RAISE (and json 'error'-field value from the manage_menu_*
 * family) is a static literal verified against pg_proc.prosrc, so an
 * exact-match map is sufficient. The dynamic messages are: raw Postgres
 * 23505 duplicate-key errors (regex) and two interpolated redemption
 * RAISEs (regex, one with value capture).
 *
 * DELIBERATELY UNMAPPED: the ~45 per-action permission strings ("Only
 * managers can update cocktails", …) — they are role/nav-gated to
 * near-zero reachability and pass through RAW exactly as before; the
 * long-term fix is stable server error codes, for which these slugs are
 * forward-compatible.
 *
 * Unmapped messages pass through RAW (debuggable) — callers supply their
 * existing generic fallback for the empty-message case.
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

  // ——— Phase 2 (s63): editor-RPC shared guards ———
  'Not authorized': 'server_errors.not_authorized',
  // Token-style variant thrown from json-returning RPCs' reason fields
  // (e.g. update_redemption_settings, set_my_preferred_language).
  'not_authorized': 'server_errors.not_authorized',
  'Invalid actor': 'server_errors.invalid_actor',
  'Organization mismatch': 'server_errors.org_mismatch',
  'Org mismatch': 'server_errors.org_mismatch',
  'Actor has no organization': 'server_errors.actor_no_org',
  'User not found': 'server_errors.user_not_found',
  // Not-found races (another manager deleted the row)
  'Exam not found': 'server_errors.exam_not_found',
  'Upload not found': 'server_errors.upload_not_found',
  'Shift not found': 'server_errors.shift_not_found',
  'Review not found': 'server_errors.review_not_found',
  'Section not found': 'server_errors.section_not_found',
  'Tile not found': 'server_errors.tile_not_found',
  'Wine pairing not found': 'server_errors.wine_pairing_not_found',
  'Redemption request not found': 'server_errors.redemption_not_found',
  'Transaction not found': 'server_errors.transaction_not_found',
  'Category not found': 'server_errors.category_not_found',
  'Subcategory not found': 'server_errors.subcategory_not_found',
  // Validation
  'Title required': 'server_errors.title_required',
  'Title and body are required': 'server_errors.title_body_required',
  'Employee name is required': 'server_errors.employee_name_required',
  'A description is required': 'server_errors.description_required',
  'Amount must be non-zero': 'server_errors.amount_non_zero',
  'Wine and entree are required': 'server_errors.wine_entree_required',
  'Guest name and review text are required': 'server_errors.guest_review_required',
  'Rating must be between 1 and 5': 'server_errors.rating_range',
  'Invalid bucks amount': 'server_errors.invalid_bucks_amount',
  // manage_menu_* json 'error' values (surfaced via callRpc data.error)
  'Category name is required': 'server_errors.category_name_required',
  'Subcategory name is required': 'server_errors.subcategory_name_required',
  'A category with that name already exists': 'server_errors.category_name_taken',
  'A subcategory with that name already exists': 'server_errors.subcategory_name_taken',
  'Built-in categories cannot be deleted; hide them instead': 'server_errors.builtin_category_undeletable',
  'Built-in subcategories cannot be deleted; hide them instead': 'server_errors.builtin_subcategory_undeletable',
  'Only Libations subcategories can be recipe-backed': 'server_errors.libations_only_recipe_backed',
  'The specials category cannot hold subcategories': 'server_errors.weekly_specials_no_subcategories',
  'Template subcategories are always recipe-linked and cannot be unlinked': 'server_errors.template_subcategory_locked',
  // Owner protections
  'The primary owner account cannot be deleted': 'server_errors.primary_owner_undeletable',
  "The primary owner's role cannot be changed": 'server_errors.primary_owner_role_locked',
  // Redemption decision race
  'Employee balance insufficient at approval time': 'server_errors.balance_insufficient_at_approval',

  // ——— s68: parse-menu edge-fn upload guards (static literals verified against
  // the deployed source). The credits raise lands in menu_uploads.error_message
  // on the failed row (surfaced by the upload poll); the permission string is
  // the invoke response's error field. U+2019 in You’re is byte-exact.
  'You do not have permission to upload menus.': 'server_errors.menu_upload_forbidden',
  // The upload RPCs RAISE the same denial without the period (parse-menu's 403
  // carries it) — map every variant or a revoked-mid-flow manager sees raw English.
  'You do not have permission to upload menus': 'server_errors.menu_upload_forbidden',
  // import-google-reviews v16 (s70b): a revoked-mid-flow manager's manual refresh.
  'You do not have permission to refresh reviews.': 'server_errors.review_refresh_forbidden',
  // update_organization_settings (s70b field groups): reachable when a scoped
  // manager's grant is revoked while they sit in the screen (perms are fetched
  // per mount) — the Save still sends that group's params and gets this back.
  'You do not have permission to change these settings.': 'server_errors.org_settings_forbidden',
  'You do not have permission to view menu uploads': 'server_errors.menu_upload_forbidden',
  'You’re out of menu-upload credits this month. They reset next month, or upgrade for more.': 'server_errors.menu_upload_out_of_credits',
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
    // The two interpolated redemption RAISEs (s63; the only dynamic RAISE
    // templates among the mapped RPCs).
    if (/^Redemption request is not pending/.test(msg)) return i18n.t('server_errors.redemption_not_pending');
    const balance = msg.match(/^Insufficient balance\. Available: (.+), Required: (.+)$/);
    if (balance) {
      return i18n.t('server_errors.insufficient_balance', { available: balance[1], required: balance[2] });
    }
    return msg;
  }
  return fallback || i18n.t('onboarding.something_went_wrong');
}
