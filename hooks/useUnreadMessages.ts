
import { useState, useEffect } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUnreadCount = async () => {
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
        setUnreadCount(data);
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnreadCount();

    // Set up real-time subscription for new messages
    const channel = supabase
      .channel('message_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_recipients',
          filter: `recipient_id=eq.${user?.id}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { unreadCount, loading, refresh: loadUnreadCount };
}
