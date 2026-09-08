-- s82b (2026-09-08, Steve): delete a saved-for-later (ready_for_review) or failed menu
-- scan from Recent Uploads. The scan credit is NOT refunded — a scan costs its credit
-- whether or not the result is applied. Applied uploads are not deletable: they are the
-- audit trail behind the menu items they inserted (and their parsed snapshot outlives
-- replaces, s72). Returns the stored file_url so the client can broker-delete the object
-- (storage-broker v14 adds 'menu-uploads' to DELETE_BUCKETS). menu_uploads has no
-- dependent tables (pg_constraint checked s82).
CREATE OR REPLACE FUNCTION public.delete_menu_upload(p_actor_id uuid, p_upload_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_status text; v_file_url text;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL OR NOT public._may_upload_menu(v_org, p_actor_id) THEN
    RAISE EXCEPTION 'You do not have permission to delete menu uploads';
  END IF;
  SELECT mu.status, mu.file_url INTO v_status, v_file_url
    FROM public.menu_uploads mu
   WHERE mu.id = p_upload_id AND mu.organization_id = v_org;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;
  IF v_status NOT IN ('ready_for_review', 'failed') THEN
    RAISE EXCEPTION 'Only unapplied uploads can be deleted';
  END IF;
  DELETE FROM public.menu_uploads mu WHERE mu.id = p_upload_id;
  RETURN v_file_url;
END; $function$;

GRANT EXECUTE ON FUNCTION public.delete_menu_upload(uuid, uuid) TO anon, authenticated;
