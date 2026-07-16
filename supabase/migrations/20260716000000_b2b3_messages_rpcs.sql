-- B2/B3 messages lockdown: messages, message_recipients (private-message PII)
--
-- Before this migration: both tables' SELECT/INSERT/UPDATE policies (roles {public}) used the
-- tautology pattern `sender_id IN (SELECT id FROM users WHERE id = messages.sender_id)` (resp.
-- recipient_id) OR auth.uid() — auth.uid() is always NULL under this app's custom auth, and the
-- subquery is true for every valid FK, so any anon-key holder could read every org's private
-- messages, forge messages as any sender, fan out recipient rows, and flip is_read/is_deleted/
-- deleted_by_sender flags for anyone. There are NO DELETE policies (every app delete is a
-- soft-flag UPDATE; the only hard delete is the auto_delete_old_messages trigger, AFTER INSERT
-- on message_recipients, which caps each recipient at 40 non-deleted rows).
--
-- This migration is ADDITIVE only — no policies are dropped here. Teardown (Phase C) list:
--   messages: "Users can view their sent messages" (SELECT), "Users can insert their own
--     messages" (INSERT), "Users can update their own messages" (UPDATE)
--   message_recipients: "Users can view their received messages" (SELECT), "Users can insert
--     message recipients" (INSERT), "Users can update their message recipient records" (UPDATE)
-- Realtime note: the supabase_realtime publication contains ZERO tables, so the app's
-- postgres_changes subscriptions (incl. useUnreadMessages' sub on message_recipients) are
-- already inert — badges work via polling. No realtime pairing needed at teardown.
--
-- Conventions: org is always derived from the actor's users row (never a client param);
-- organization_id is written EXPLICITLY on every INSERT (the trg_default_org_id_* BEFORE INSERT
-- triggers backfill the Boathouse org on NULL — never rely on them). Reads empty-return on an
-- unknown actor; writes RAISE. get_message_thread/mark_thread_read take BOTH p_message_id and
-- p_thread_id and use the literal `(id = p_message_id OR thread_id = p_thread_id)` expansion the
-- client used — this preserves two live behaviors: the root-exclusion quirk (expanding from a
-- reply id excludes the thread root, whose thread_id is NULL) and the push-notification deep link
-- (payload has no threadId, so a pushed reply opens as a single-message view).

-- ============================================================================
-- READ RPCS
-- ============================================================================

-- Inbox: one row per non-deleted message_recipients row of the actor, message fields flattened,
-- plus the three per-thread computations the client previously did as a 4-query-per-thread loop.
-- Deliberately NO [FEEDBACK]-subject filter and NO deleted_by_sender filter (the client filters
-- [FEEDBACK] rows itself, and the "inbox almost full" banner counts raw rows — rows.length here
-- must equal the old head-count query). thread_has_unread deliberately has NO is_deleted filter
-- (mirrors the old loop: a deleted-but-unread row keeps the thread styled unread).
CREATE OR REPLACE FUNCTION public.get_inbox(p_actor_id uuid)
RETURNS TABLE(
  mr_id uuid, is_read boolean, mr_created_at timestamptz, recipient_id uuid,
  message_id uuid, sender_id uuid, subject text, body text, image_url text,
  file_url text, file_name text, parent_message_id uuid, thread_id uuid,
  message_created_at timestamptz, recipient_ids uuid[], reply_count integer,
  thread_has_unread boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT mr.id, mr.is_read, mr.created_at, mr.recipient_id,
           m.id, m.sender_id, m.subject, m.body, m.image_url,
           m.file_url, m.file_name, m.parent_message_id, m.thread_id,
           m.created_at,
           (SELECT COALESCE(array_agg(r.recipient_id ORDER BY r.created_at, r.id), '{}')
              FROM public.message_recipients r WHERE r.message_id = m.id),
           (SELECT count(*)::int FROM public.messages c
             WHERE c.thread_id = COALESCE(m.thread_id, m.id)
               AND c.id <> COALESCE(m.thread_id, m.id)),
           EXISTS(SELECT 1 FROM public.message_recipients r2
                    JOIN public.messages m2 ON m2.id = r2.message_id
                   WHERE r2.recipient_id = p_actor_id AND r2.is_read = false
                     AND (m2.id = COALESCE(m.thread_id, m.id)
                          OR m2.thread_id = COALESCE(m.thread_id, m.id)))
      FROM public.message_recipients mr
      JOIN public.messages m ON m.id = mr.message_id
     WHERE mr.recipient_id = p_actor_id
       AND mr.is_deleted = false
       AND mr.organization_id = v_org
     ORDER BY mr.created_at DESC, mr.id DESC;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_sent_messages(p_actor_id uuid)
RETURNS TABLE(
  id uuid, sender_id uuid, subject text, body text, image_url text, file_url text,
  file_name text, parent_message_id uuid, thread_id uuid, created_at timestamptz,
  recipient_ids uuid[], reply_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.sender_id, m.subject, m.body, m.image_url, m.file_url,
           m.file_name, m.parent_message_id, m.thread_id, m.created_at,
           (SELECT COALESCE(array_agg(r.recipient_id ORDER BY r.created_at, r.id), '{}')
              FROM public.message_recipients r WHERE r.message_id = m.id),
           (SELECT count(*)::int FROM public.messages c
             WHERE c.thread_id = COALESCE(m.thread_id, m.id)
               AND c.id <> COALESCE(m.thread_id, m.id))
      FROM public.messages m
     WHERE m.sender_id = p_actor_id
       AND m.deleted_by_sender = false
       AND m.organization_id = v_org
     ORDER BY m.created_at DESC, m.id DESC;
END; $function$;

-- Thread view for message-detail. Literal (id = p_message_id OR thread_id = p_thread_id)
-- expansion — see header. Participant-gated: the actor must be the sender of, or a recipient
-- on, at least one message in the expansion.
CREATE OR REPLACE FUNCTION public.get_message_thread(p_actor_id uuid, p_message_id uuid, p_thread_id uuid)
RETURNS TABLE(
  id uuid, sender_id uuid, subject text, body text, image_url text,
  file_url text, file_name text, created_at timestamptz, recipient_ids uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messages m
                  WHERE m.id = p_message_id AND m.organization_id = v_org) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE (m.id = p_message_id OR m.thread_id = p_thread_id)
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
     WHERE (m.id = p_message_id OR m.thread_id = p_thread_id)
       AND m.organization_id = v_org
     ORDER BY m.created_at ASC, m.id ASC;
END; $function$;

-- Re-create of the pre-existing badge-count fn: identical signature, param names, and body —
-- adds only the search_path pin. (Legacy param naming kept; both client callers pass user_id.)
CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  RETURN (SELECT COUNT(*) FROM message_recipients mr JOIN messages m ON m.id = mr.message_id WHERE mr.recipient_id = user_id AND mr.is_read = FALSE AND mr.is_deleted = FALSE AND (p_organization_id IS NULL OR m.organization_id = p_organization_id));
END; $function$;

-- ============================================================================
-- WRITE RPCS
-- ============================================================================

-- The send path: replaces the client's reply-thread lookup + messages INSERT +
-- message_recipients fan-out (now one transaction — a failed fan-out no longer orphans the
-- message row). Recipients must all belong to the actor's org; self and inactive recipients are
-- ALLOWED (reply/reply-all rely on both). File attachments are manager/owner-only (server
-- enforcement of what was previously a UI-only gate). The auto_delete_old_messages trigger
-- fires on the fan-out exactly as it did on client inserts.
CREATE OR REPLACE FUNCTION public.send_message(
  p_actor_id uuid,
  p_recipient_ids uuid[],
  p_subject text,
  p_body text,
  p_image_url text DEFAULT NULL,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_reply_to_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_role text; v_org uuid; v_recipients uuid[]; v_valid int;
  v_reply_id uuid; v_reply_thread uuid; v_reply_org uuid;
  v_thread uuid; v_parent uuid; v_id uuid;
BEGIN
  SELECT u.role, u.organization_id INTO v_role, v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  v_recipients := ARRAY(SELECT DISTINCT rid FROM unnest(p_recipient_ids) AS rid WHERE rid IS NOT NULL);
  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one recipient is required';
  END IF;
  SELECT count(*) INTO v_valid FROM public.users u
   WHERE u.id = ANY(v_recipients) AND u.organization_id = v_org;
  IF v_valid <> array_length(v_recipients, 1) THEN
    RAISE EXCEPTION 'All recipients must belong to your organization';
  END IF;
  IF p_file_url IS NOT NULL AND v_role NOT IN ('manager','owner') THEN
    RAISE EXCEPTION 'Only managers or owners can attach files';
  END IF;
  IF p_reply_to_message_id IS NOT NULL THEN
    SELECT m.id, m.thread_id, m.organization_id INTO v_reply_id, v_reply_thread, v_reply_org
      FROM public.messages m WHERE m.id = p_reply_to_message_id;
    IF v_reply_id IS NULL OR v_reply_org <> v_org THEN
      RAISE EXCEPTION 'Original message not found';
    END IF;
    v_thread := COALESCE(v_reply_thread, v_reply_id);
    v_parent := p_reply_to_message_id;
  END IF;
  INSERT INTO public.messages (sender_id, subject, body, image_url, file_url, file_name,
                               thread_id, parent_message_id, organization_id)
  VALUES (p_actor_id, p_subject, COALESCE(p_body, ''), p_image_url, p_file_url, p_file_name,
          v_thread, v_parent, v_org)
  RETURNING messages.id INTO v_id;
  INSERT INTO public.message_recipients (message_id, recipient_id, organization_id)
  SELECT v_id, rid, v_org FROM unnest(v_recipients) AS rid;
  RETURN v_id;
END; $function$;

-- Whole-thread mark-read for the actor's own recipient rows. Same literal expansion as
-- get_message_thread; NO is_read predicate (read_at is deliberately re-stamped on every detail
-- focus, as the client always did) and NO is_deleted filter (mirrors the old update). Missing /
-- foreign message ids simply match zero rows (the old client update was equally silent).
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_actor_id uuid, p_message_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.message_recipients mr
     SET is_read = true, read_at = now()
   WHERE mr.recipient_id = p_actor_id
     AND mr.message_id IN (SELECT m.id FROM public.messages m
                            WHERE (m.id = p_message_id OR m.thread_id = p_thread_id)
                              AND m.organization_id = v_org);
END; $function$;

-- Recipient-side soft delete: exact message ids, NO thread expansion (mirrors all three client
-- sites — the batch path passes the selected card ids as-is).
CREATE OR REPLACE FUNCTION public.delete_received_messages(p_actor_id uuid, p_message_ids uuid[])
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
     AND mr.message_id = ANY(p_message_ids);
END; $function$;

-- Sender-side soft delete, exact ids (the batch path on the sent tab).
CREATE OR REPLACE FUNCTION public.delete_sent_messages(p_actor_id uuid, p_message_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.messages m
     SET deleted_by_sender = true
   WHERE m.sender_id = p_actor_id
     AND m.organization_id = v_org
     AND m.id = ANY(p_message_ids);
END; $function$;

-- Sender-side soft delete, thread expansion (single-card swipe on the sent tab and the detail
-- screen's sender delete): flags every message the ACTOR sent in the expansion; other
-- participants' replies are untouched.
CREATE OR REPLACE FUNCTION public.delete_sent_thread(p_actor_id uuid, p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT u.organization_id INTO v_org FROM public.users u WHERE u.id = p_actor_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  UPDATE public.messages m
     SET deleted_by_sender = true
   WHERE m.sender_id = p_actor_id
     AND m.organization_id = v_org
     AND (m.id = p_thread_id OR m.thread_id = p_thread_id);
END; $function$;

-- ============================================================================
-- Grants (CREATE OR REPLACE keeps prior grants; granted explicitly anyway)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_inbox(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sent_messages(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_thread(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_message_count(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, uuid[], text, text, text, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_received_messages(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sent_messages(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sent_thread(uuid, uuid) TO anon, authenticated;
