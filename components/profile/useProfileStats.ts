/**
 * The hub's own numbers: the stat strip (bucks · rank · next shift · team), the identity
 * card's tagline, and the Team drop's counts. One `Promise.allSettled` on Profile focus,
 * throttled; every field stays null until it has really loaded (never a fake zero).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router/react-navigation';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { todayISO } from '@/utils/schedule/format';
import { PROFILE_FOCUS_THROTTLE_MS } from './profileVisuals';

export interface NextShift {
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
}

export interface ProfileStats {
  loaded: boolean;
  bucks: number | null;
  rank: number | null;
  score: number | null;
  nextShift: NextShift | null | undefined; // undefined = unloaded, null = none scheduled
  tagline: string | null | undefined;
  staffCount: number | null;
  scheduledToday: number | null;
}

const EMPTY: ProfileStats = {
  loaded: false,
  bucks: null,
  rank: null,
  score: null,
  nextShift: undefined,
  tagline: undefined,
  staffCount: null,
  scheduledToday: null,
};

export function useProfileStats() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const [stats, setStats] = useState<ProfileStats>(EMPTY);
  const lastLoad = useRef(0);
  const reqRef = useRef(0);

  const load = useCallback(async (force = false) => {
    if (!user?.id) return;
    const now = Date.now();
    if (!force && now - lastLoad.current < PROFILE_FOCUS_THROTTLE_MS) return;
    lastLoad.current = now;
    const req = ++reqRef.current;
    const actor = user.id;

    const [card, board, shift, dir, roster] = await Promise.allSettled([
      supabase.rpc('get_user_card', { p_actor_id: actor, p_user_id: actor }),
      supabase.rpc('get_master_leaderboard_overall_actor', { p_limit: 500, p_actor_id: actor }),
      supabase.rpc('get_my_shifts', { p_actor_id: actor, p_start_date: todayISO(), p_limit: 1 }),
      isManager ? getOrgDirectory(actor) : Promise.resolve(null),
      isManager ? supabase.rpc('get_org_roster', { p_actor_id: actor, p_date: todayISO() }) : Promise.resolve(null),
    ]);
    if (req !== reqRef.current) return; // superseded

    const next: ProfileStats = { ...EMPTY, loaded: true, bucks: user.mcloonesBucks ?? 0 };

    if (card.status === 'fulfilled' && !card.value.error) {
      const row = Array.isArray(card.value.data) ? card.value.data[0] : card.value.data;
      if (row) {
        next.tagline = (row as any).tagline ?? null;
        if (typeof (row as any).mcloones_bucks === 'number') next.bucks = (row as any).mcloones_bucks;
      }
    }
    if (board.status === 'fulfilled' && !board.value.error && Array.isArray(board.value.data)) {
      const rows = board.value.data as any[];
      const idx = rows.findIndex((r) => r.user_id === actor);
      if (idx >= 0) {
        next.rank = idx + 1;
        next.score = Number(rows[idx].total_score) || 0;
      } else {
        next.rank = null;
        next.score = 0;
      }
    }
    if (shift.status === 'fulfilled' && !shift.value.error) {
      const row = Array.isArray(shift.value.data) ? shift.value.data[0] : shift.value.data;
      next.nextShift = (row as NextShift) || null;
    }
    if (isManager) {
      if (dir.status === 'fulfilled' && Array.isArray(dir.value)) {
        next.staffCount = (dir.value as any[]).filter((u) => u.is_active !== false).length;
      }
      if (roster.status === 'fulfilled' && roster.value && !(roster.value as any).error) {
        const rows = ((roster.value as any).data || []) as any[];
        next.scheduledToday = new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
      }
    }
    setStats(next);
  }, [user?.id, user?.mcloonesBucks, isManager]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Bucks arrive through the auth context too (rewards flows call refreshUser).
  useEffect(() => {
    if (typeof user?.mcloonesBucks === 'number') {
      setStats((s) => (s.loaded ? { ...s, bucks: user.mcloonesBucks ?? s.bucks } : s));
    }
  }, [user?.mcloonesBucks]);

  return { stats, reload: () => load(true) };
}
