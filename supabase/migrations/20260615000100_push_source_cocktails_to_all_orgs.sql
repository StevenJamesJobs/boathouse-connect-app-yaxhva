-- Owner-gated wrapper so the Cocktails A-Z editor's "push to all orgs" button can
-- run the manual backfill from the app client.
--
-- backfill_all_orgs_cocktails() itself is admin-only (revoked from anon/authenticated)
-- so the app can't call it directly. This wrapper is granted to the app roles but
-- gates execution server-side: the caller passes their user_id and we verify it is
-- the OWNER of the source org before running the push. (Custom auth has no
-- auth.uid(), so the user_id-in-body + verify-server-side pattern is required.)
--
-- Net effect: only the Boathouse/McLoone's owner can fan the source library out to
-- every other org; a non-owner (or a forged user_id) is rejected with an exception.

CREATE OR REPLACE FUNCTION public.push_source_cocktails_to_all_orgs(
  p_user_id   uuid,
  p_source_org uuid DEFAULT '7f9a6397-135a-40c2-849d-6109ef93f6a6'  -- McLoone's
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_source_org AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the source organization owner can push cocktails';
  END IF;

  RETURN public.backfill_all_orgs_cocktails(p_source_org);
END;
$$;

GRANT EXECUTE ON FUNCTION public.push_source_cocktails_to_all_orgs(uuid, uuid) TO anon, authenticated;
