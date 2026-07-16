import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppState, AppStateStatus } from 'react-native';

// Mirrors useUnreadLeaderboardPasses — global event so any screen can broadcast a
// refresh to every mounted instance.
type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllUnreadNotifications() {
  listeners.forEach((fn) => fn());
}

const cutoffKey = (userId: string) => `lastViewedNotifications_${userId}`;

/**
 * Count of "general" notification-shade entries (Notification-Center broadcasts and
 * quiz retake grants) the current user has received since they last opened the bell.
 * These are the notifications that have no dedicated badge of their own — leaderboard
 * passes, redemption requests/decisions each drive their own badge and are excluded
 * server-side. Cleared by markViewed() (advances the AsyncStorage cutoff) when the
 * shade is opened.
 */
export function useUnreadNotifications() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadCount = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      setLoading(false);
      return;
    }
    try {
      const since = await AsyncStorage.getItem(cutoffKey(user.id));
      const { data, error } = await supabase.rpc('get_unread_notification_count', {
        p_actor_id: user.id,
        p_since: since || null,
      });
      if (error) {
        console.error('Error loading notification count:', error);
        return;
      }
      setCount(typeof data === 'number' ? data : 0);
    } catch (err) {
      console.error('Error in loadCount (notifications):', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Advance the cutoff to now — call when the user opens the notification shade.
  const markViewed = useCallback(async () => {
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(cutoffKey(user.id), new Date().toISOString());
      setCount(0);
      refreshAllUnreadNotifications();
    } catch (err) {
      console.error('Error marking notifications viewed:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCount();
    listeners.add(loadCount);

    const channel = supabase
      .channel(`custom_notifs_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'custom_notifications' },
        () => loadCount()
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') loadCount();
    });

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') loadCount();
    }, 30000);

    return () => {
      listeners.delete(loadCount);
      supabase.removeChannel(channel);
      subscription.remove();
      clearInterval(interval);
    };
  }, [loadCount, user?.id]);

  return { count, loading, markViewed, refresh: loadCount };
}
