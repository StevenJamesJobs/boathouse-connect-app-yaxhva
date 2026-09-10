import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';

/**
 * Everything the Schedule tab pulses for (s83), in one poll:
 *  - managers/owners: pending schedule approvals (time off + shift pick-ups)
 *  - everyone: unseen decisions on my own requests / releases / pick-ups
 *  - everyone: open shifts I'm qualified to pick up
 *
 * 30s while active + a reload on foreground (the usePendingApprovals contract),
 * plus a module-level broadcast so a decision / an ack / a release refreshes
 * every mounted badge at once. Feeds the ConnectBar dot + ring, the Approvals
 * tile pulse, the ⚙ sheet's Approvals bubble, and BadgeSyncer's home-icon sum.
 */
export interface ScheduleAttention {
  pendingApprovals: number;
  unseenDecisions: number;
  availableShifts: number;
}

const ZERO: ScheduleAttention = { pendingApprovals: 0, unseenDecisions: 0, availableShifts: 0 };
const POLL_MS = 30000;

const listeners = new Set<() => void>();
export function refreshAllScheduleAttention() {
  listeners.forEach((fn) => fn());
}

export function useScheduleAttention() {
  const { user } = useAuth();
  const isMgr = isManagerOrOwner(user);
  const [attention, setAttention] = useState<ScheduleAttention>(ZERO);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setAttention(ZERO);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [pendingRes, decisionsRes, availableRes] = await Promise.all([
        isMgr
          ? supabase.rpc('get_pending_schedule_approval_count', { p_actor_id: user.id })
          : Promise.resolve({ data: 0, error: null } as any),
        supabase.rpc('get_my_schedule_decisions', { p_actor_id: user.id }),
        supabase.rpc('get_available_shifts', { p_actor_id: user.id }),
      ]);
      const available = Array.isArray(availableRes.data)
        ? availableRes.data.filter((r: any) => !r.claimed_by_me).length
        : 0;
      setAttention({
        pendingApprovals: pendingRes.error ? 0 : Number(pendingRes.data) || 0,
        unseenDecisions: decisionsRes.error ? 0 : (decisionsRes.data?.length ?? 0),
        availableShifts: availableRes.error ? 0 : available,
      });
    } catch (e) {
      console.error('[useScheduleAttention] load error:', e);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [user?.id, isMgr]);

  useEffect(() => {
    load();
    listeners.add(load);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') load();
    });
    return () => {
      listeners.delete(load);
      clearInterval(interval);
      sub.remove();
    };
  }, [load]);

  return { attention, loading, refresh: load };
}

/**
 * Seeing ANY of the decision surfaces clears them all (blurb · shade rows · tab
 * dot/ring · home-icon badge): one RPC stamps the seen fields and drops the
 * per-user shade rows, then every badge re-polls.
 */
export async function ackScheduleDecisions(userId: string | null | undefined) {
  if (!userId) return;
  try {
    await supabase.rpc('ack_schedule_decisions', { p_actor_id: userId });
  } catch (e) {
    console.error('[ackScheduleDecisions] error:', e);
  }
  refreshAllScheduleAttention();
}
