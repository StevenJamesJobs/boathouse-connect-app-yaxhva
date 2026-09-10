import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The org's Schedule Settings (s83): Roster view · Request time off · Release
 * shifts · AM/PM cutoff — the toggles that moved out of Org Settings → Access
 * into the ⚙ Schedule sheet.
 *
 * Contract = the grants pattern: fresh on mount and on every screen focus, plus
 * a module-level broadcast so the settings sheet's writes reach every mounted
 * consumer at once. Toggles gate SURFACES only — the server enforces regardless
 * (get_org_roster / request_time_off / release_shift / claim_shift all check the
 * org row themselves), so this FAILS OPEN like wineVisibility: an unreadable
 * setting shows the surface and lets the RPC decide.
 */
export interface ScheduleSettings {
  staffCanViewRoster: boolean;
  timeOffEnabled: boolean;
  shiftReleaseEnabled: boolean;
  /** "HH:MM:SS" — shifts starting before this are AM on the roster */
  rosterPmCutoff: string;
}

const DEFAULTS: ScheduleSettings = {
  staffCanViewRoster: true,
  timeOffEnabled: true,
  shiftReleaseEnabled: true,
  rosterPmCutoff: '12:00:00',
};

const listeners = new Set<() => void>();
export function refreshAllScheduleSettings() {
  listeners.forEach((fn) => fn());
}

export function useScheduleSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ScheduleSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_schedule_settings', { p_actor_id: user.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setSettings({
          staffCanViewRoster: row.staff_can_view_roster ?? true,
          timeOffEnabled: row.time_off_requests_enabled ?? true,
          shiftReleaseEnabled: row.shift_release_enabled ?? true,
          rosterPmCutoff: row.roster_pm_cutoff || '12:00:00',
        });
      }
    } catch (e) {
      // fail open — see the docblock
      console.error('[useScheduleSettings] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { settings, loading, refresh: load };
}
