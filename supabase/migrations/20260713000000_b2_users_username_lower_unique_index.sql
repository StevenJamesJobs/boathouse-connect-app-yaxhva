-- Batch B2 (users lockdown) — foundation for case-insensitive login.
-- Enforce GLOBAL case-insensitive username uniqueness so login_user always resolves to one user.
-- Safe: verified 0 case-insensitive duplicates across all orgs on 2026-07-13. ~100-row table,
-- plain (non-CONCURRENT) build is instant. Additive; does not change any existing behavior.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username));
