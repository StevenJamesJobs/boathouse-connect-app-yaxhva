
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppState, AppStateStatus } from 'react-native';

// Global event system so any screen can trigger an immediate refresh
// across ALL instances of useUnreadMessages (tab bar, WelcomeHeader, etc.)
type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Call this from ANY screen after marking messages as read, deleting, etc.
 * All useUnreadMessages hook instances will immediately re-fetch.
 */
export function refreshAllUnreadCounts() {
  listeners.forEach(fn => fn());
}

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_unread_message_count', {
        user_id: user.id,
      });

      if (!error && data !== null) {
        console.log('Unread count:', data);
        setUnreadCount(data);
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUnreadCount();

    // Register this instance to listen for global refresh events
    listeners.add(loadUnreadCount);

    // Set up real-time subscription for new messages
    const channel = supabase
      .channel(`message_updates_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_recipients',
          filter: `recipient_id=eq.${user?.id}`,
        },
        () => {
          console.log('Message update detected, refreshing unread count...');
          loadUnreadCount();
        }
      )
      .subscribe();

    // Refresh when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        loadUnreadCount();
      }
    });

    // Reduced polling interval: 15 seconds instead of 30
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        loadUnreadCount();
      }
    }, 15000);

    return () => {
      listeners.delete(loadUnreadCount);
      supabase.removeChannel(channel);
      subscription.remove();
      clearInterval(interval);
    };
  }, [loadUnreadCount, user?.id]);

  return { unreadCount, loading, refresh: loadUnreadCount };
}
