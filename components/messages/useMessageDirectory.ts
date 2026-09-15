/**
 * The Messages list data hook (s84, L-B). Owns every RPC the old screen called —
 * get_inbox / get_sent_messages / get_unread_message_count / mark_thread_read /
 * delete_received_thread / delete_sent_thread — plus the getOrgDirectory hydration,
 * the [FEEDBACK] subject filter and the client-side grouping by thread_id||id.
 *
 * Inbox and Sent are fetched together (the filter rail is client-side over both),
 * and every attachment-bearing ROW (not thread) is kept aside for the Files gallery.
 */
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getOrgDirectory, OrgDirectoryRow } from '@/utils/orgDirectory';
import { supabase } from '@/app/integrations/supabase/client';
import { refreshAllUnreadCounts } from '@/hooks/useUnreadMessages';
import type { AvatarPerson } from './AvatarStack';
import type { MessageFilter } from './messageVisuals';

export type MessageBox = 'inbox' | 'sent';

export interface MessageThread {
  /** `${box}:${threadId}` — the selection / list key. */
  key: string;
  box: MessageBox;
  /** The row pushed to /message-detail as `messageId` (the entry row, as before). */
  id: string;
  /** thread_id || id — the thread root, pushed as `threadId`. */
  threadId: string;
  senderId: string;
  subject: string | null;
  body: string;
  imageUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  /** The newest message in the thread. */
  createdAt: string;
  isRead: boolean;
  recipientIds: string[];
  /** sender + recipients, minus me — the Reply-all set and the Groups test. */
  participantIds: string[];
  /** Faces for the AvatarStack: inbox = sender then the other recipients; sent = the recipients. */
  people: AvatarPerson[];
  /** Organisation / system sender (not in the directory). */
  isOrg: boolean;
}

export interface MessageAttachment {
  key: string;
  kind: 'photo' | 'file';
  url: string;
  fileName: string | null;
  messageId: string;
  threadId: string;
  box: MessageBox;
  sender: AvatarPerson;
  isMine: boolean;
  createdAt: string;
}

function isFeedback(subject: unknown): boolean {
  return typeof subject === 'string' && subject.startsWith('[FEEDBACK]');
}

function personOf(
  id: string,
  dirById: Map<string, OrgDirectoryRow>,
  fallbackName: string,
): AvatarPerson {
  const row = dirById.get(id);
  return { id, name: row?.name || fallbackName, profile_picture_url: row?.profile_picture_url ?? null };
}

export function useMessageDirectory() {
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const me = user?.id;
  const myName = user?.name || '';
  const myPicture = user?.profilePictureUrl || null;
  const orgName = organization?.name || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inboxThreads, setInboxThreads] = useState<MessageThread[]>([]);
  const [sentThreads, setSentThreads] = useState<MessageThread[]>([]);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadInbox = useCallback(
    async (dirById: Map<string, OrgDirectoryRow>): Promise<{ threads: MessageThread[]; files: MessageAttachment[] }> => {
      if (!me) return { threads: [], files: [] };
      const { data, error } = await supabase.rpc('get_inbox', { p_actor_id: me });
      if (error) {
        console.error('Error loading inbox:', error);
        throw error;
      }
      const rows: any[] = data || [];
      // The meter counts raw (pre-filter) rows — the same set the server caps.
      setInboxCount(rows.length);

      const threadMap = new Map<string, MessageThread>();
      const files: MessageAttachment[] = [];

      for (const item of rows) {
        if (isFeedback(item.subject)) continue;
        const threadId: string = item.thread_id || item.message_id;
        const recipientIds: string[] = item.recipient_ids || [];

        if (!threadMap.has(threadId)) {
          const inDir = dirById.has(item.sender_id);
          const isOrg = !inDir && item.sender_id !== me;
          const sender = personOf(item.sender_id, dirById, isOrg ? orgName : '');
          const others = recipientIds.filter((id) => id !== me && id !== item.sender_id);
          threadMap.set(threadId, {
            key: `inbox:${threadId}`,
            box: 'inbox',
            id: item.message_id,
            threadId,
            senderId: item.sender_id,
            subject: item.subject,
            body: item.body || '',
            imageUrl: item.image_url || null,
            fileUrl: item.file_url || null,
            fileName: item.file_name || null,
            createdAt: item.message_created_at,
            isRead: !item.thread_has_unread,
            recipientIds,
            participantIds: [item.sender_id, ...recipientIds].filter((id, i, arr) => id !== me && arr.indexOf(id) === i),
            people: [sender, ...others.map((id) => personOf(id, dirById, ''))].filter((p) => !!p.name),
            isOrg,
          });
        } else {
          const existing = threadMap.get(threadId)!;
          if (new Date(item.message_created_at) > new Date(existing.createdAt)) {
            existing.createdAt = item.message_created_at;
          }
          if (!item.is_read) existing.isRead = false;
        }

        if (item.image_url || item.file_url) {
          const inDir = dirById.has(item.sender_id);
          const sender = personOf(item.sender_id, dirById, !inDir ? orgName : '');
          files.push({
            key: `inbox:${item.message_id}`,
            kind: item.image_url ? 'photo' : 'file',
            url: item.image_url || item.file_url,
            fileName: item.file_name || null,
            messageId: item.message_id,
            threadId,
            box: 'inbox',
            sender,
            isMine: item.sender_id === me,
            createdAt: item.message_created_at,
          });
        }
      }

      const threads = Array.from(threadMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return { threads, files };
    },
    [me, orgName],
  );

  const loadSent = useCallback(
    async (dirById: Map<string, OrgDirectoryRow>): Promise<{ threads: MessageThread[]; files: MessageAttachment[] }> => {
      if (!me) return { threads: [], files: [] };
      const { data, error } = await supabase.rpc('get_sent_messages', { p_actor_id: me });
      if (error) {
        console.error('Error loading sent messages:', error);
        throw error;
      }
      const rows: any[] = data || [];
      const threadMap = new Map<string, MessageThread>();
      const files: MessageAttachment[] = [];
      const meAsPerson: AvatarPerson = { id: me, name: myName, profile_picture_url: myPicture };

      for (const msg of rows) {
        if (isFeedback(msg.subject)) continue;
        const threadId: string = msg.thread_id || msg.id;
        const recipientIds: string[] = msg.recipient_ids || [];

        if (!threadMap.has(threadId)) {
          const recipients = recipientIds.filter((id) => id !== me).map((id) => personOf(id, dirById, ''));
          threadMap.set(threadId, {
            key: `sent:${threadId}`,
            box: 'sent',
            id: msg.id,
            threadId,
            senderId: msg.sender_id,
            subject: msg.subject,
            body: msg.body || '',
            imageUrl: msg.image_url || null,
            fileUrl: msg.file_url || null,
            fileName: msg.file_name || null,
            createdAt: msg.created_at,
            isRead: true,
            recipientIds,
            participantIds: [msg.sender_id, ...recipientIds].filter((id, i, arr) => id !== me && arr.indexOf(id) === i),
            people: recipients.filter((p) => !!p.name),
            isOrg: false,
          });
        } else {
          const existing = threadMap.get(threadId)!;
          if (new Date(msg.created_at) > new Date(existing.createdAt)) {
            existing.createdAt = msg.created_at;
          }
        }

        if (msg.image_url || msg.file_url) {
          files.push({
            key: `sent:${msg.id}`,
            kind: msg.image_url ? 'photo' : 'file',
            url: msg.image_url || msg.file_url,
            fileName: msg.file_name || null,
            messageId: msg.id,
            threadId,
            box: 'sent',
            sender: meAsPerson,
            isMine: true,
            createdAt: msg.created_at,
          });
        }
      }

      const threads = Array.from(threadMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return { threads, files };
    },
    [me, myName, myPicture],
  );

  const loadUnreadCount = useCallback(async () => {
    if (!me) return;
    const { data, error } = await supabase.rpc('get_unread_message_count', {
      user_id: me,
      p_organization_id: organizationId,
    });
    if (!error && data !== null) setUnreadCount(Number(data) || 0);
  }, [me, organizationId]);

  /** Full reload: directory once, then inbox + sent together; throws on failure. */
  const loadAll = useCallback(async () => {
    if (!me) return;
    const dir = await getOrgDirectory(me);
    const dirById = new Map(dir.map((r) => [r.id, r]));
    const [inbox, sent] = await Promise.all([loadInbox(dirById), loadSent(dirById)]);
    setInboxThreads(inbox.threads);
    setSentThreads(sent.threads);
    // Every row with a photo or a file, newest first, inbox + sent (deduped by message id).
    const seen = new Set<string>();
    const all = [...inbox.files, ...sent.files]
      .filter((a) => (seen.has(a.messageId) ? false : (seen.add(a.messageId), true)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setAttachments(all);
  }, [me, loadInbox, loadSent]);

  /** Focus / initial load — spinner while it runs. Returns false if it failed. */
  const reload = useCallback(async (): Promise<boolean> => {
    if (!me) return false;
    try {
      setLoading(true);
      await Promise.all([loadAll(), loadUnreadCount()]);
      return true;
    } catch (error) {
      console.error('Error loading messages:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [me, loadAll, loadUnreadCount]);

  /** Pull-to-refresh — no spinner swap. */
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!me) return false;
    try {
      setRefreshing(true);
      await Promise.all([loadAll(), loadUnreadCount()]);
      return true;
    } catch (error) {
      console.error('Error refreshing messages:', error);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [me, loadAll, loadUnreadCount]);

  /** Silent reload after a mutation, then the badge refresh the old screen did. */
  const afterMutation = useCallback(async () => {
    await Promise.all([loadAll(), loadUnreadCount()]);
    refreshAllUnreadCounts();
  }, [loadAll, loadUnreadCount]);

  /** mark_thread_read for each inbox thread (whole thread, expanded server-side). */
  const markThreadsRead = useCallback(
    async (threads: MessageThread[]) => {
      if (!me) return;
      for (const th of threads) {
        if (th.box !== 'inbox') continue;
        await supabase.rpc('mark_thread_read', {
          p_actor_id: me,
          p_message_id: th.id,
          p_thread_id: th.threadId,
        });
      }
      await afterMutation();
    },
    [me, afterMutation],
  );

  /** delete_received_thread (one call, all inbox roots) + delete_sent_thread per sent thread. */
  const deleteThreads = useCallback(
    async (threads: MessageThread[]) => {
      if (!me) return;
      const inboxRoots = threads.filter((t) => t.box === 'inbox').map((t) => t.threadId);
      if (inboxRoots.length > 0) {
        await supabase.rpc('delete_received_thread', { p_actor_id: me, p_thread_ids: inboxRoots });
      }
      for (const th of threads) {
        if (th.box !== 'sent') continue;
        await supabase.rpc('delete_sent_thread', { p_actor_id: me, p_thread_id: th.threadId });
      }
      await afterMutation();
    },
    [me, afterMutation],
  );

  const unreadThreads = useMemo(() => inboxThreads.filter((t) => !t.isRead), [inboxThreads]);
  const groupThreads = useMemo(() => inboxThreads.filter((t) => t.participantIds.length > 1), [inboxThreads]);

  const threadsFor = useCallback(
    (filter: MessageFilter): MessageThread[] => {
      switch (filter) {
        case 'unread':
          return unreadThreads;
        case 'sent':
          return sentThreads;
        case 'groups':
          return groupThreads;
        case 'files':
          return [];
        case 'all':
        default:
          return inboxThreads;
      }
    },
    [inboxThreads, sentThreads, unreadThreads, groupThreads],
  );

  const threadByKey = useCallback(
    (key: string): MessageThread | undefined =>
      inboxThreads.find((t) => t.key === key) || sentThreads.find((t) => t.key === key),
    [inboxThreads, sentThreads],
  );

  return {
    me,
    loading,
    refreshing,
    inboxThreads,
    sentThreads,
    unreadThreads,
    groupThreads,
    attachments,
    inboxCount,
    unreadCount,
    threadsFor,
    threadByKey,
    reload,
    refresh,
    markThreadsRead,
    deleteThreads,
  };
}
