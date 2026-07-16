-- Follow-up to b2b3_messages_rpcs: fix the thread root-exclusion bug found in device smoke.
--
-- BUG: get_message_thread + mark_thread_read used a LITERAL (id = p_message_id OR thread_id =
-- p_thread_id) expansion. When a Reply-All made a user a recipient of a REPLY, that reply became
-- the newest message and thus the inbox thread-card's representative; tapping it passed the
-- reply's id as p_message_id, and the expansion excluded the thread ROOT (whose thread_id is
-- NULL, so it matches neither id=reply nor thread_id=root). Result: the recipient saw only the
-- reply, not the original message + its image/attachment. Worse, inbox delete only soft-deleted
-- the representative message's recipient row, so the thread "came back" showing the other
-- messages. FIX: derive the canonical thread root server-side and always operate on the WHOLE
-- thread. This intentionally supersedes the "root-exclusion / single-reply push view" quirk the
-- prior migration preserved — that quirk is the bug.
--
-- Also replaces the received-side delete with a whole-thread delete (delete_received_thread),
-- mirroring delete_sent_thread, so "delete" on an inbox card removes the entire thread for that
-- user. delete_received_messages + delete_sent_messages (both introduced in b2b3_messages_rpcs,
-- never shipped) are dropped; every caller is repointed in the same change set.

CREATE OR REPLACE FUNCTION public.get_message_thread(p_actor_id uuid, p_message_id uuid, p_thread_id uuid)
RETURNS TABLE(
  id uuid, sender_id uuid, subject text, body text, image_url text,
  file_url text, file_name text, created_at timestamptz, recipient_ids uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_root uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  -- Canonical thread root, resolved from whichever arg points at a real in-org message.
  v_root := COALESCE(
    (SELECT COALESCE(m.thread_id, m.id) FROM public.messages m WHERE m.id = p_message_id AND m.organization_id = v_org),
    (SELECT COALESCE(m.thread_id, m.id) FROM public.messages m WHERE m.id = p_thread_id AND m.organization_id = v_org)
  );
  IF v_root IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE (m.id = v_root OR m.thread_id = v_root)
       AND m.organization_id = v_org
       AND (m.sender_id = p_actor_id
            OR EXISTS (SELECT 1 FROM public.message_recipients r
                        WHERE r.message_id = m.id AND r.recipient_id = p_actor_id))
  ) THEN
    RAISE EXCEPTION 'Not a participant in this thread';
  END IF;
  RETURN QUERY
    SELECT m.id, m.sender_id, m.subject, m.body, m.image_url,
           m.file_url, m.file_name, m.created_at,
           (SELECT COALESCE(array_agg(r.recipient_id ORDER BY r.created_at, r.id), '{}')
              FROM public.message_recipients r WHERE r.message_id = m.id)
      FROM public.messages m
     WHERE (m.id = v_root OR m.thread_id = v_root)
       AND m.organization_id = v_org
     ORDER BY m.created_at ASC, m.id ASC;
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_actor_id uuid, p_message_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid; v_root uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  v_root := COALESCE(
    (SELECT COALESCE(m.thread_id, m.id) FROM public.messages m WHERE m.id = p_message_id AND m.organization_id = v_org),
    (SELECT COALESCE(m.thread_id, m.id) FROM public.messages m WHERE m.id = p_thread_id AND m.organization_id = v_org)
  );
  IF v_root IS NULL THEN RETURN; END IF;
  UPDATE public.message_recipients mr
     SET is_read = true, read_at = now()
   WHERE mr.recipient_id = p_actor_id
     AND mr.message_id IN (SELECT m.id FROM public.messages m
                            WHERE (m.id = v_root OR m.thread_id = v_root)
                              AND m.organization_id = v_org);
END; $function$;

-- Whole-thread received delete: soft-delete every one of the actor's recipient rows across the
-- given thread roots (p_thread_ids are inbox-card roots = thread_id||id).
CREATE OR REPLACE FUNCTION public.delete_received_thread(p_actor_id uuid, p_thread_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.message_recipients mr
     SET is_deleted = true, deleted_at = now()
   WHERE mr.recipient_id = p_actor_id
     AND mr.organization_id = v_org
     AND mr.message_id IN (SELECT m.id FROM public.messages m
                            WHERE (m.id = ANY(p_thread_ids) OR m.thread_id = ANY(p_thread_ids))
                              AND m.organization_id = v_org);
END; $function$;

DROP FUNCTION IF EXISTS public.delete_received_messages(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.delete_sent_messages(uuid, uuid[]);

GRANT EXECUTE ON FUNCTION public.delete_received_thread(uuid, uuid[]) TO anon, authenticated;
