/**
 * useToolsPageData (s79) — one focus-refetched pass that feeds the Tools
 * page's live tile lines and the Priority Hero ladder. Everything here is an
 * EXISTING RPC (no new server surface this wave); a single failed query
 * degrades its own line to a quiet default instead of blanking the page (the
 * Manage cockpit's resilient-extraction rule).
 *
 * Tips numbers come from the ON-DEVICE journal (personal income never touches
 * the shared DB — the s78 contract); "new reviews" is detected device-side by
 * comparing the fetched review count against the last count this user SAW
 * (stored per device), because review rows carry no client-visible fetch
 * timestamp — the hero clears itself the moment the user opens it.
 */
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { eventFallsOnDate } from '@/utils/dateUtils';
import { dateKey, entryTotalTips, loadEntries, startOfWeek } from '@/utils/tips/journal';

const REVIEWS_SEEN_KEY = '@tools_reviews_seen:v1';
const EXAM_TYPES = ['server', 'bartender', 'host'] as const;

export interface ToolsPageData {
  loaded: boolean;
  guides: { count: number; sets: number; newThisWeek: number };
  /** The actor's standing on the completed-only overall board (null = unranked). */
  gameRank: { rank: number; total: number } | null;
  todayCounts: { announcements: number; specials: number; events: number };
  tips: { weekTotal: number; weekShifts: number; hasEntryToday: boolean };
  /** Manager-only (zeroed for employees): */
  quizLive: number;
  reviews: { avg: number | null; count: number; newCount: number };
}

const EMPTY: ToolsPageData = {
  loaded: false,
  guides: { count: 0, sets: 0, newThisWeek: 0 },
  gameRank: null,
  todayCounts: { announcements: 0, specials: 0, events: 0 },
  tips: { weekTotal: 0, weekShifts: 0, hasEntryToday: false },
  quizLive: 0,
  reviews: { avg: null, count: 0, newCount: 0 },
};

export function useToolsPageData(opts: { manager: boolean; includeTips: boolean }) {
  const { manager, includeTips } = opts;
  const { user } = useAuth();
  const [data, setData] = useState<ToolsPageData>(EMPTY);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const actorId = user.id;
    try {
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const today = new Date();

      const settled = await Promise.allSettled([
        supabase.rpc('get_guides', { p_actor_id: actorId }),
        // Full board (small orgs — ~100 rows of 5 fields) so the tile can say
        // "You're #4 of 25"; rank from the completed-only source (the Games
        // Kit rule for any displayed standing).
        supabase.rpc('get_master_leaderboard_overall_actor', { p_limit: 500, p_actor_id: actorId }),
        supabase.rpc('get_announcements', { p_actor_id: actorId, p_limit: 6 }),
        supabase.rpc('get_special_features', { p_actor_id: actorId, p_limit: 6 }),
        supabase.rpc('get_upcoming_events', { p_actor_id: actorId }),
        includeTips ? loadEntries() : Promise.resolve([]),
        manager
          ? supabase.rpc('get_org_google_reviews', { p_actor_id: actorId })
          : Promise.resolve({ data: [] }),
        ...(manager
          ? EXAM_TYPES.map((examType) =>
              supabase.rpc('get_exam', {
                p_actor_id: actorId,
                p_exam_type: examType,
                p_statuses: ['active'],
              })
            )
          : []),
      ]);

      const val = (i: number): any =>
        settled[i]?.status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<any>).value : null;

      // Guides — count / distinct categories / created_at within 7 days.
      const guideRows: any[] = val(0)?.data || [];
      const guideSets = new Set(guideRows.map((g) => g.category)).size;
      const newThisWeek = guideRows.filter(
        (g) => g.created_at && new Date(g.created_at).getTime() >= weekAgo
      ).length;

      // Leaderboard — the actor's own rank (Steve's punch call: their standing
      // motivates; the leader's name doesn't).
      const boardRows: any[] = val(1)?.data || [];
      const myIndex = boardRows.findIndex((r) => r.user_id === actorId);
      const gameRank =
        myIndex >= 0 ? { rank: myIndex + 1, total: boardRows.length } : null;

      const announcements = (val(2)?.data || []).length;
      const specials = (val(3)?.data || []).length;
      const eventRows: any[] = val(4)?.data || [];
      const events = eventRows.filter((r) =>
        eventFallsOnDate(r.start_date_time, r.end_date_time, today)
      ).length;

      // Tips — this calendar week (the Tracker's own startOfWeek), device-only.
      let weekTotal = 0;
      let weekShifts = 0;
      let hasEntryToday = false;
      if (includeTips) {
        const entries: any[] = (val(5) as any[]) || [];
        const weekStartKey = dateKey(startOfWeek(today));
        const todayKey = dateKey(today);
        for (const entry of entries) {
          if (entry.date >= weekStartKey) {
            weekTotal += entryTotalTips(entry);
            weekShifts += 1;
          }
          if (entry.date === todayKey) hasEntryToday = true;
        }
      }

      // Reviews (manager) — avg/count + device-side new-detection.
      let reviews: ToolsPageData['reviews'] = { avg: null, count: 0, newCount: 0 };
      if (manager) {
        const reviewRows: any[] = val(6)?.data || [];
        const count = reviewRows.length;
        const avg = count
          ? reviewRows.reduce((s, r) => s + (r.review_rating || 0), 0) / count
          : null;
        let newCount = 0;
        try {
          const raw = await AsyncStorage.getItem(REVIEWS_SEEN_KEY);
          const seen = raw ? Number(JSON.parse(raw)?.count) || 0 : 0;
          // First run seeds silently (everything would otherwise be "new").
          if (raw !== null && count > seen) newCount = count - seen;
          if (raw === null && count > 0) {
            await AsyncStorage.setItem(REVIEWS_SEEN_KEY, JSON.stringify({ count }));
          }
        } catch {
          // Convenience signal only — the tile still shows avg/count.
        }
        reviews = { avg, count, newCount };
      }

      // Quiz hub live count (manager) — one light get_exam per role.
      let quizLive = 0;
      if (manager) {
        for (let i = 0; i < EXAM_TYPES.length; i++) {
          const rows = val(7 + i)?.data || [];
          if (rows.length > 0) quizLive += 1;
        }
      }

      setData({
        loaded: true,
        guides: { count: guideRows.length, sets: guideSets, newThisWeek },
        gameRank,
        todayCounts: { announcements, specials, events },
        tips: { weekTotal, weekShifts, hasEntryToday },
        quizLive,
        reviews,
      });
    } catch {
      // Leave the previous (or empty) data — tiles render their quiet state.
    }
  }, [user?.id, manager, includeTips]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return data;
}

/** The reviews hero clears itself: call when the user acts on it (or opens the editor). */
export async function markReviewsSeen(count: number): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEWS_SEEN_KEY, JSON.stringify({ count }));
  } catch {
    // Next fetch just shows the hero again — harmless.
  }
}
