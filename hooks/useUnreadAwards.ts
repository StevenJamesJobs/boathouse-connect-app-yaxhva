import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

const KEY_EMPLOYEE = (userId: string) => `lastViewedAwards_${userId}`;
const KEY_MANAGER = (userId: string) => `lastViewedManagerRecent_${userId}`;

type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllUnreadAwards() {
  listeners.forEach((fn) => fn());
}

/**
 * Tracks "new" entries in the rewards Recent tab for the current user.
 *
 * Employee: red dot when one of their own redemption requests was decided
 * (approved or denied) since the last time they swiped to Recent Awards.
 *
 * Manager: red dot when any new visible rewards_transactions row appeared
 * since the last time they swiped to the Recent tab in the Rewards & Reviews
 * Editor (covers manager rewards, deductions, and approved redemptions).
 *
 * Cleared by calling markRecentViewed().
 */
export function useUnreadAwards() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [count, setCount] = useState(0);
  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const hasNew = count > 0;

  const check = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    try {
      const key = isManager ? KEY_MANAGER(user.id) : KEY_EMPLOYEE(user.id);
      let cutoff = await AsyncStorage.getItem(key);
      if (!cutoff) {
        cutoff = new Date().toISOString();
        await AsyncStorage.setItem(key, cutoff);
      }

      if (isManager) {
        const { data: c } = await supabase.rpc('get_unread_awards_count', {
          p_actor_id: user.id,
          p_since: cutoff,
        });
        setCount(c || 0);
        return;
      }

      const { data: rows } = await supabase.rpc('get_my_redemptions', {
        p_user_id: user.id,
        p_statuses: ['approved', 'denied'],
      });
      const c = ((rows as any[]) || []).filter((r) => r.decided_at && r.decided_at > cutoff).length;
      setCount(c || 0);
    } catch (err) {
      console.error('Error checking unread awards:', err);
    }
  }, [user?.id, isManager, organizationId]);

  const markRecentViewed = useCallback(async () => {
    if (!user?.id) return;
    const key = isManager ? KEY_MANAGER(user.id) : KEY_EMPLOYEE(user.id);
    await AsyncStorage.setItem(key, new Date().toISOString());
    setCount(0);
    // Broadcast to other instances (FloatingTabBar nav, BadgeSyncer for home-screen icon)
    // so they re-read the new cutoff from AsyncStorage immediately instead of waiting
    // for the next realtime event or app foreground.
    refreshAllUnreadAwards();

    // Also clear shade entries tied to this user's decisions / approvals.
    try {
      if (isManager) {
        // Manager swiping to Recent doesn't clear shade entries — those are
        // cleared when they actually approve/deny.
      } else {
        // Employee viewed their Recent Awards — drop redemption_decision rows for them.
        const { data: shadeRows } = await (supabase
          .from('custom_notifications') as any)
          .select('id, data')
          .order('created_at', { ascending: false })
          .limit(50);
        const idsToDelete = ((shadeRows as any[]) || [])
          .filter((r) =>
            r.data?.notificationType === 'redemption_decision' &&
            r.data?.targetUserId === user.id
          )
          .map((r) => r.id);
        if (idsToDelete.length > 0) {
          await (supabase.from('custom_notifications') as any).delete().in('id', idsToDelete);
        }
      }
    } catch (err) {
      console.error('Error clearing shade entries:', err);
    }
  }, [user?.id, isManager]);

  useEffect(() => {
    check();
    listeners.add(check);

    const txChannel = supabase
      .channel(`awards_tx_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rewards_transactions' }, () => check())
      .subscribe();

    const reqChannel = supabase
      .channel(`awards_req_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemption_requests' }, () => check())
      .subscribe();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') check();
    });

    return () => {
      listeners.delete(check);
      supabase.removeChannel(txChannel);
      supabase.removeChannel(reqChannel);
      subscription.remove();
    };
  }, [check]);

  return { hasNew, count, markRecentViewed, refresh: check };
}
