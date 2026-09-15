/**
 * Live data for the Favorites tiles. Composes the hooks the app already polls (messages,
 * quizzes, schedule attention, upload quota, the Tools-page bundle, pending redemptions,
 * subscription) with a few focus-time fetches of its own, throttled. Only tiles present on
 * the hub drive the extra fetches; every field stays undefined until it truly loaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router/react-navigation';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { useScheduleAttention } from '@/hooks/useScheduleAttention';
import { useScheduleQuota } from '@/hooks/useScheduleQuota';
import { useToolsPageData } from '@/hooks/useToolsPageData';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import { loadEntries, summarizeRange, dateKey, startOfWeek, addDays as addJournalDays } from '@/utils/tips/journal';
import { todayISO, toISODate, addDays, parseISODate, formatTime, localeFor, minutesOf } from '@/utils/schedule/format';
import { getWeekStartDate } from '@/utils/dateUtils';
import type { LiveData, FavoriteTile } from '@/config/favorites';
import { PROFILE_FOCUS_THROTTLE_MS } from './profileVisuals';
import { useTranslation } from 'react-i18next';

function fmtShort(iso: string, locale: string): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

export function useFavoriteData(tiles: FavoriteTile[]): LiveData {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const ids = useMemo(() => new Set(tiles.map((t) => t.id)), [tiles]);
  const wants = useCallback((id: string) => ids.has(id), [ids]);

  const { unreadCount } = useUnreadMessages();
  const { unreadCount: quizzesWaiting } = useUnreadQuizzes();
  const { attention } = useScheduleAttention();
  const { quota, refresh: refreshQuota } = useScheduleQuota();
  const tools = useToolsPageData({ manager: isManager, includeTips: wants('tips') });
  const { pendingCount: pendingRedemptions } = usePendingApprovals();
  const { tier } = useSubscription();

  const [extra, setExtra] = useState<Partial<LiveData>>({});
  const lastLoad = useRef(0);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const now = Date.now();
    if (now - lastLoad.current < PROFILE_FOCUS_THROTTLE_MS) return;
    lastLoad.current = now;
    const req = ++reqRef.current;
    const actor = user.id;
    const today = todayISO();
    const weekStart = getWeekStartDate(new Date());
    const weekStartIso = toISODate(weekStart);
    const weekEndStr = toISODate(addDays(weekStart, 6));

    const jobs: PromiseLike<void>[] = [];
    const out: Partial<LiveData> = {};

    if (wants('my-schedule') || wants('pick-up-shifts')) {
      jobs.push(
        supabase.rpc('get_my_shifts', { p_actor_id: actor, p_start_date: weekStartIso, p_limit: 60 }).then(({ data, error }) => {
          if (error) return;
          const rows = (Array.isArray(data) ? data : []) as any[];
          const thisWeek = rows.filter((r) => r.shift_date >= weekStartIso && r.shift_date <= weekEndStr);
          const hours = thisWeek.reduce((sum, r) => {
            const m = minutesOf(r.end_time) - minutesOf(r.start_time);
            return sum + Math.max(0, m) / 60;
          }, 0);
          const upcoming = rows.find((r) => r.shift_date >= today);
          out.schedule = {
            hoursThisWeek: Math.round(hours),
            shiftsThisWeek: thisWeek.length,
            nextShift: upcoming ? `${fmtShort(upcoming.shift_date, locale)} ${formatTime(upcoming.start_time, locale)}` : null,
            pickUpsOpen: attention.availableShifts,
          };
        })
      );
    }
    if (wants('tips')) {
      jobs.push(
        loadEntries().then((entries) => {
          const ws = startOfWeek(new Date());
          const s = summarizeRange(entries, dateKey(ws), dateKey(addJournalDays(ws, 6)));
          out.tips = {
            weekTotal: s.tips,
            weekShifts: s.shiftCount,
            avgPerShift: s.shiftCount > 0 ? s.tips / s.shiftCount : null,
            lastVerdict: null,
            scheduledToday: !!(out.schedule?.nextShift) || false,
          };
        })
      );
    }
    if (wants('menus')) {
      jobs.push(
        supabase.rpc('get_menu_items', { p_actor_id: actor, p_weekly_special: true }).then(({ data, error }) => {
          if (!error) out.specialsToday = (Array.isArray(data) ? data : []).length;
        })
      );
    }
    if (wants('events')) {
      jobs.push(
        supabase.rpc('get_upcoming_events', { p_actor_id: actor }).then(({ data, error }) => {
          if (error) return;
          const rows = ((Array.isArray(data) ? data : []) as any[])
            .filter((r) => r.start_date_time && new Date(r.start_date_time).getTime() >= Date.now() - 86400000)
            .sort((a, b) => new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime());
          const nx = rows[0];
          out.nextEvent = nx ? `${new Date(nx.start_date_time).toLocaleDateString(locale, { weekday: 'short' })} · ${nx.title}` : null;
        })
      );
    }
    if (wants('todays-roster')) {
      jobs.push(
        supabase.rpc('get_org_roster', { p_actor_id: actor, p_date: today }).then(({ data, error }) => {
          if (error) return;
          const rows = (Array.isArray(data) ? data : []) as any[];
          const am = rows.filter((r) => minutesOf(r.start_time) < 12 * 60).length;
          out.roster = { am, pm: rows.length - am };
        })
      );
    }
    if (isManager && wants('team')) {
      // staffCount comes from useProfileStats; nothing extra here.
    }
    if (isManager && wants('announcement-editor')) {
      jobs.push(
        supabase.rpc('get_announcements', { p_actor_id: actor, p_include_inactive: true }).then(({ data, error }) => {
          if (error) return;
          const rows = (Array.isArray(data) ? data : []) as any[];
          const live = rows.filter((r) => r.is_active !== false).length;
          out.announcements = { live, scheduled: rows.length - live };
        })
      );
    }
    if (isManager && wants('notification-center')) {
      jobs.push(
        supabase.rpc('get_recent_sent_notifications', { p_actor_id: actor, p_limit: 40 }).then(({ data, error }) => {
          if (error) return;
          const rows = (Array.isArray(data) ? data : []) as any[];
          out.sentThisWeek = rows.filter((r) => new Date(r.created_at).getTime() >= weekStart.getTime()).length;
        })
      );
    }
    if (isManager && wants('schedule-upload')) {
      jobs.push(Promise.resolve(refreshQuota()).then(() => undefined));
    }

    await Promise.allSettled(jobs);
    if (req !== reqRef.current) return;
    setExtra(out);
  }, [user?.id, isManager, wants, locale, attention.availableShifts, refreshQuota]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Keep pick-ups live while the hub is open (the attention hook polls on its own).
  useEffect(() => {
    setExtra((e) => (e.schedule ? { ...e, schedule: { ...e.schedule, pickUpsOpen: attention.availableShifts } } : e));
  }, [attention.availableShifts]);

  return useMemo<LiveData>(() => {
    const d: LiveData = { ...extra };
    d.unreadMessages = unreadCount;
    if (!isManager) d.quizzesWaiting = quizzesWaiting;
    if (tools.loaded) {
      d.guidesNew = tools.guides.newThisWeek;
      d.guidesCount = tools.guides.count;
      d.game = tools.gameRank ? { rank: tools.gameRank.rank, score: 0 } : { rank: null, score: 0 };
      if (isManager) d.reviews = { newCount: tools.reviews.newCount, avg: tools.reviews.avg, count: tools.reviews.count };
    }
    if (isManager) {
      d.approvals = { waiting: attention.pendingApprovals, preview: [] };
      d.pendingRedemptions = pendingRedemptions;
      if (quota) d.uploadCredits = { remaining: quota.remaining, max: quota.max, lastScan: null, renews: null };
      d.subscriptionTier = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : undefined;
    }
    if (typeof user?.mcloonesBucks === 'number') d.bucks = user.mcloonesBucks;
    return d;
  }, [extra, unreadCount, quizzesWaiting, isManager, tools, attention.pendingApprovals, pendingRedemptions, quota, tier, user?.mcloonesBucks]);
}
