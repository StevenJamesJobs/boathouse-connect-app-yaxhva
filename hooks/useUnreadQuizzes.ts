import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { flushPendingSubmits, pendingExamIds } from '@/utils/exam/pendingSubmits';
import { AppState, AppStateStatus } from 'react-native';

// Global event system so any screen can trigger an immediate refresh across
// all instances of useUnreadQuizzes (tab bar, tools tile, badge syncer).
type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllUnreadQuizzes() {
  listeners.forEach((fn) => fn());
}

/**
 * Returns the number of active weekly quizzes the current user is eligible for
 * but has NOT yet completed (no row in exam_results for their user_id).
 * Dismissing a bell entry does not clear this — only actually taking the quiz does.
 */
export function useUnreadQuizzes() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    // Owners/managers administer quizzes (create/reset/track) but don't take them —
    // their accounts carry every job title, so eligibility would always badge them.
    if (user.role === 'manager' || user.role === 'owner') {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      // Opportunistic outbox flush (this hook already runs on foreground +
      // 30s poll); anything STILL queued shouldn't badge as unread.
      await flushPendingSubmits(user.id);
      const { data } = await (supabase.rpc as any)('get_my_unread_quiz_count', {
        p_actor_id: user.id,
      });
      let count = typeof data === 'number' ? data : 0;
      if (count > 0) {
        const pending = await pendingExamIds(user.id);
        count = Math.max(0, count - pending.size);
      }
      setUnreadCount(count);
    } catch (err) {
      console.error('Error loading unread quizzes:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, user?.jobTitles]);

  useEffect(() => {
    loadUnreadCount();
    listeners.add(loadUnreadCount);

    // Realtime: watch exam status changes and user's exam_results inserts
    const examsChannel = supabase
      .channel(`quiz_exams_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exams' },
        () => loadUnreadCount()
      )
      .subscribe();

    const resultsChannel = supabase
      .channel(`quiz_results_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_results',
          filter: `user_id=eq.${user?.id}`,
        },
        () => loadUnreadCount()
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') loadUnreadCount();
    });

    // Lighter polling than messages — quizzes don't change often
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') loadUnreadCount();
    }, 30000);

    return () => {
      listeners.delete(loadUnreadCount);
      supabase.removeChannel(examsChannel);
      supabase.removeChannel(resultsChannel);
      subscription.remove();
      clearInterval(interval);
    };
  }, [loadUnreadCount, user?.id]);

  return { unreadCount, loading, refresh: loadUnreadCount };
}
