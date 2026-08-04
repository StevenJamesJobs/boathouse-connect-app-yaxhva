-- s62: leaderboard-pass shade rows carry the Spanish copy in data jsonb so
-- NotificationDropdown can pick the viewer's language (same data.title_es /
-- data.body_es shape the composer uses). DROP+recreate with DEFAULT params —
-- NOT an overload: shipped clients call the 4 original named args and must
-- keep resolving to a single function (PGRST203 ambiguity otherwise).
-- Applied live via Supabase MCP apply_migration (s62_leaderboard_pass_dual_copy);
-- this file is the repo record. Rehearsed both call shapes on MyResto Test.
DROP FUNCTION public.add_leaderboard_pass_notifications(uuid, uuid[], text, text);

CREATE FUNCTION public.add_leaderboard_pass_notifications(
  p_actor_id uuid,
  p_recipient_ids uuid[],
  p_title text,
  p_body text,
  p_title_es text DEFAULT NULL,
  p_body_es text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_count int;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF btrim(COALESCE(p_title, '')) = '' OR btrim(COALESCE(p_body, '')) = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;

  -- One shade row per SAME-ORG recipient; data shape mirrors the old client insert exactly
  -- (NotificationDropdown filters leaderboard_pass rows by data->>'targetUserId').
  -- s62: Spanish copy rides data.title_es/body_es when supplied (blank = omitted).
  INSERT INTO public.custom_notifications (organization_id, sent_by, title, body, data)
  SELECT v_org, p_actor_id, p_title, p_body,
         jsonb_build_object(
           'type', 'custom',
           'notificationType', 'leaderboard_pass',
           'destination', 'master-leaderboard',
           'targetUserId', r.rid)
         || CASE WHEN btrim(COALESCE(p_title_es, '')) <> ''
                 THEN jsonb_build_object('title_es', p_title_es) ELSE '{}'::jsonb END
         || CASE WHEN btrim(COALESCE(p_body_es, '')) <> ''
                 THEN jsonb_build_object('body_es', p_body_es) ELSE '{}'::jsonb END
    FROM unnest(p_recipient_ids) AS r(rid)
    JOIN public.users u ON u.id = r.rid AND u.organization_id = v_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $function$;

-- Rollback: DROP the 6-arg fn and recreate the previous 4-arg definition
-- (see migration fix_leaderboard_pass_notifications).
