import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Listener = () => void;
const listeners = new Set<Listener>();

// Broadcast an immediate refresh to every mounted instance (Rewards tab badge)
// — call after a quiz is submitted or its reward blurb is dismissed.
export function refreshAllUnreadQuizReward() {
  listeners.forEach((fn) => fn());
}

/**
 * 1 when the employee has an unclaimed quiz reward waiting (i.e. the
 * ExamRewardBlurb on the Rewards page would show), else 0. Tracks exactly what
 * the blurb shows: the most-recent UNdismissed completed result with bucks > 0.
 * Cleared when the blurb is dismissed (dismiss_exam_reward) via the refresh bus.
 */
export function useUnreadQuizReward() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const check = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    try {
      const { data: results } = await (supabase.rpc as any)('get_my_recent_exam_results', {
        p_actor_id: user.id,
        p_limit: 5,
      });
      const list = (results as any[]) || [];
      if (list.length === 0) {
        setCount(0);
        return;
      }
      const resultIds = list.map((r) => r.id);
      const { data: dismissals } = await (supabase.rpc as any)('get_my_exam_reward_dismissals', {
        p_actor_id: user.id,
        p_result_ids: resultIds,
      });
      const dismissed = new Set(((dismissals as any[]) || []).map((d) => d.exam_result_id));
      // Mirror ExamRewardBlurb: the first (most recent) undismissed result drives
      // the blurb; the badge shows only when that result carries a reward.
      const undismissed = list.find((r) => !dismissed.has(r.id));
      setCount(undismissed && undismissed.bucks_awarded > 0 ? 1 : 0);
    } catch (err) {
      console.error('Error checking quiz reward:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    check();
    listeners.add(check);

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') check();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') check();
    }, 30000);

    return () => {
      listeners.delete(check);
      subscription.remove();
      clearInterval(interval);
    };
  }, [check]);

  return { count, refresh: check };
}
