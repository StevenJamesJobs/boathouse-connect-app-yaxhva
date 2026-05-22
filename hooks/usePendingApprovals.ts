import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllPendingApprovals() {
  listeners.forEach((fn) => fn());
}

/**
 * Manager-only count of redemption_requests in 'pending' status.
 * Returns 0 for employees. Past-dated shift requests are filtered out
 * (read-time guard since pg_cron isn't installed).
 */
export function usePendingApprovals() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const isManager = user?.role === 'manager' || user?.role === 'owner';

  const loadCount = useCallback(async () => {
    if (!isManager || !organizationId) {
      setPendingCount(0);
      setLoading(false);
      return;
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase
        .from('redemption_requests' as any) as any)
        .select('id, request_type, shift_date')
        .eq('status', 'pending')
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error loading pending approvals:', error);
        return;
      }

      const filtered = (data || []).filter((r: any) => {
        if (r.request_type === 'food_beverage') return true;
        return !r.shift_date || r.shift_date >= today;
      });
      setPendingCount(filtered.length);
    } finally {
      setLoading(false);
    }
  }, [isManager, organizationId]);

  useEffect(() => {
    loadCount();
    listeners.add(loadCount);

    const channel = supabase
      .channel(`pending_approvals_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemption_requests' }, () => loadCount())
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
  }, [loadCount]);

  return { pendingCount, loading, refresh: loadCount };
}
