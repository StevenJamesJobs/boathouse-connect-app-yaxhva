import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';

// Offline outbox for quiz submissions. A failed submit_exam_and_award_bucks
// call parks its exact RPC payload here; flushPendingSubmits replays it when
// connectivity returns (root layout reconnect effect, weekly-quizzes mount,
// unread-badge refresh). While an entry exists the quiz is treated as TAKEN
// (weekly-quizzes card + unread badge), which closes the offline-retake
// loophole: the first attempt's answers are what ultimately gets submitted.
// The server's completed_at early-return makes replays idempotent.

const STORAGE_KEY = '@mrc_pending_quiz_submits';

export interface PendingQuizSubmit {
  key: string; // `${userId}:${examId}`
  payload: Record<string, any>; // exact submit_exam_and_award_bucks args
  queuedAt: string;
}

async function readAll(): Promise<Record<string, PendingQuizSubmit>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeAll(map: Record<string, PendingQuizSubmit>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export async function enqueuePendingSubmit(userId: string, examId: string, payload: Record<string, any>): Promise<void> {
  const map = await readAll();
  const key = `${userId}:${examId}`;
  map[key] = { key, payload, queuedAt: new Date().toISOString() };
  await writeAll(map);
}

export async function removePendingSubmit(userId: string, examId: string): Promise<void> {
  const map = await readAll();
  const key = `${userId}:${examId}`;
  if (map[key]) {
    delete map[key];
    await writeAll(map);
  }
}

export async function getPendingSubmit(userId: string, examId: string): Promise<PendingQuizSubmit | null> {
  const map = await readAll();
  return map[`${userId}:${examId}`] ?? null;
}

export async function pendingExamIds(userId: string): Promise<Set<string>> {
  const map = await readAll();
  const out = new Set<string>();
  for (const k of Object.keys(map)) {
    if (k.startsWith(`${userId}:`)) out.add(k.slice(userId.length + 1));
  }
  return out;
}

let flushing = false;
/** Replay queued submissions for this user. Safe to call often (no-ops while
 *  a flush is already running). Returns how many entries were submitted. */
export async function flushPendingSubmits(userId: string | undefined | null): Promise<number> {
  if (!userId || flushing) return 0;
  flushing = true;
  let flushed = 0;
  try {
    const map = await readAll();
    for (const [key, entry] of Object.entries(map)) {
      if (!key.startsWith(`${userId}:`)) continue;
      const { error } = await supabase.rpc('submit_exam_and_award_bucks', entry.payload as any);
      if (!error) {
        delete map[key];
        flushed++;
      }
    }
    if (flushed > 0) await writeAll(map);
  } catch {
  } finally {
    flushing = false;
  }
  return flushed;
}
