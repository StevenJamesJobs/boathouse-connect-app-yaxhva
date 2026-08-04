/**
 * Composer draft storage (s63b, Steve's design).
 *
 * Drafts are DEVICE-LOCAL AsyncStorage, keyed per user — deliberately not a
 * DB table: the flow that creates them is "no connection", where a server
 * save would fail exactly when it's needed. Newest first.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationDraft {
  id: string;
  savedAt: number;
  title: string;
  body: string;
  titleEs: string;
  bodyEs: string;
  destination: string;
  audienceMode: 'all' | 'job_titles';
  selectedJobTitles: string[];
  sendPush: boolean;
}

const storageKey = (userId: string) => `@notification_drafts:${userId}`;

export function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Internal read that DISTINGUISHES "no drafts" ([]) from "could not read"
 * (null). Writers must abort on null — rewriting the key after a failed read
 * would silently drop every other stored draft.
 */
async function readDrafts(userId: string): Promise<NotificationDraft[] | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationDraft[];
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.error('[notificationDrafts] read failed:', e);
    return null;
  }
}

export async function listDrafts(userId: string): Promise<NotificationDraft[]> {
  const drafts = await readDrafts(userId);
  return (drafts ?? []).sort((a, b) => b.savedAt - a.savedAt);
}

/** Upsert by id (editing a loaded draft updates it in place). */
export async function saveDraft(userId: string, draft: NotificationDraft): Promise<boolean> {
  try {
    const drafts = await readDrafts(userId);
    if (drafts === null) return false; // don't clobber unreadable storage
    const next = [draft, ...drafts.filter(d => d.id !== draft.id)];
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
    return true;
  } catch (e) {
    console.error('[notificationDrafts] save failed:', e);
    return false;
  }
}

export async function deleteDraft(userId: string, draftId: string): Promise<void> {
  try {
    const drafts = await readDrafts(userId);
    if (drafts === null) return; // don't clobber unreadable storage
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(drafts.filter(d => d.id !== draftId)));
  } catch (e) {
    console.error('[notificationDrafts] delete failed:', e);
  }
}
