-- B2/B3 session 47 Batch A: pin search_path on the 4 menu-upload/review-refresh credit fns.
-- Bodies untouched (already _is_org_owner-gated + org-pair-verified); ALTER avoids body
-- transcription risk on a billing-adjacent table.
ALTER FUNCTION public.get_menu_upload_quota(uuid, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.consume_menu_upload_credits(uuid, uuid, text, integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_review_refresh_quota(uuid, uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.consume_review_refresh(uuid, uuid) SET search_path = public, extensions, pg_temp;
