import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppState, AppStateStatus } from 'react-native';
import { getEligibleQuizTypes } from '@/app/weekly-quizzes';

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

    try {
      const eligibleTypes = getEligibleQuizTypes(user?.jobTitles || []);
      if (eligibleTypes.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Find active exams for the eligible types
      const { data: activeExams } = await (supabase
        .from('exams' as any) as any)
        .select('id')
        .in('exam_type', eligibleTypes)
        .eq('status', 'active');

      if (!activeExams || activeExams.length === 0) {
        setUnreadCount(0);
        return;
      }

      const examIds = activeExams.map((e: any) => e.id);

      // Find results the user has already submitted for those exams
      const { data: results } = await (supabase
        .from('exam_results' as any) as any)
        .select('exam_id, completed_at')
        .in('exam_id', examIds)
        .eq('user_id', user.id);

      const completedExamIds = new Set(
        (results || [])
          .filter((r: any) => r.completed_at || r.correct_count != null)
          .map((r: any) => r.exam_id)
      );

      const unread = examIds.filter((id: string) => !completedExamIds.has(id)).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error('Error loading unread quizzes:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.jobTitles]);

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
