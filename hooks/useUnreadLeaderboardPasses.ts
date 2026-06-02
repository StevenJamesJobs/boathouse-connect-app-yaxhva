import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { AppState, AppStateStatus } from 'react-native';

// Mirrors useUnreadQuizzes — global event so any screen can broadcast a refresh
// to every mounted instance (BadgeSyncer, Tools tile, nav icon, Game Hub button).
type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllUnreadLeaderboardPasses() {
  listeners.forEach((fn) => fn());
}

/**
 * Returns the count of leaderboard-pass shade entries the current user has
 * received since they last viewed the master leaderboard. Cleared by calling
 * the mark_leaderboard_viewed RPC + refreshAllUnreadLeaderboardPasses().
 */
export function useUnreadLeaderboardPasses() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    try {
      // Per-user count derived from auth.uid() server-side — takes no args.
      const { data, error } = await supabase.rpc('get_unread_leaderboard_pass_count');
      if (error) {
        console.error('Error loading leaderboard pass count:', error);
        return;
      }
      setUnreadCount(typeof data === 'number' ? data : 0);
    } catch (err) {
      console.error('Error in loadUnreadCount (leaderboard pass):', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, organizationId]);

  useEffect(() => {
    loadUnreadCount();
    listeners.add(loadUnreadCount);

    const channel = supabase
      .channel(`leaderboard_pass_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'custom_notifications' },
        () => loadUnreadCount()
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') loadUnreadCount();
    });

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') loadUnreadCount();
    }, 30000);

    return () => {
      listeners.delete(loadUnreadCount);
      supabase.removeChannel(channel);
      subscription.remove();
      clearInterval(interval);
    };
  }, [loadUnreadCount, user?.id]);

  return { unreadCount, loading, refresh: loadUnreadCount };
}
