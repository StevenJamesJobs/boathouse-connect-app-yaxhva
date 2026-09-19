-- s86 · One email per TEAM, not per app.  APPLIED 2026-09-19 on Steve's word (pre-flight: 121 users, 0 blanks,
-- 0 per-team duplicates; verified after: join_prepare reports another team's email as free, a same-team one as in use).
--
-- Today users.email carries a GLOBAL unique constraint (users_email_key UNIQUE (email)), so someone
-- who works at two restaurants on MyResto — Boathouse AND Robinson Ale House, or any multi-location
-- group — cannot use the same address on both teams. Steve's s86 decision: one email per team.
--
-- This swap only RELAXES the rule (global → per organization), so every existing row already
-- complies: at s86 there were 117 users, 117 distinct non-blank emails, 0 blanks.
-- Nothing signs in or is looked up by email alone (login is by username); the only functions that
-- compare emails are join_signup / join_prepare (already per-team aware — join_prepare checks
-- pg_constraint and stops reporting cross-team matches the moment this lands), update_employee_info
-- and update_profile_info.
--
-- utils/serverErrors.ts already maps a violation of EITHER index name to the "email in use" copy.

BEGIN;

ALTER TABLE public.users DROP CONSTRAINT users_email_key;

-- Case-insensitive, per organization; blank emails (legacy rows, if any ever appear) stay exempt.
CREATE UNIQUE INDEX users_org_email_key
    ON public.users (organization_id, lower(email))
 WHERE email <> '';

COMMIT;
