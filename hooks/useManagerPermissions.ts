import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// s68 Manager Permissions — the keyed grants an owner flips in Org Settings →
// Jobs & Tools. A `manager_permissions` row exists only when a grant has been
// touched, so absence of a key simply means "not granted". Three keys are live:
//   'org_settings.menu'       → manager may open the scoped Menu tab of Org Settings
//   'menu.edit_categories'    → manager may open Edit Categories (manage_menu_* suite)
//   'premium.ai_menu_upload'  → manager may run the AI menu upload (spends the org's credits)

export interface ManagerPermissions {
  menuConfig: boolean;
  editCategories: boolean;
  aiUpload: boolean;
}

const NONE: ManagerPermissions = { menuConfig: false, editCategories: false, aiUpload: false };
const ALL: ManagerPermissions = { menuConfig: true, editCategories: true, aiUpload: true };

interface UseManagerPermissionsResult {
  perms: ManagerPermissions;
  loading: boolean;
  reload: () => void;
}

/**
 * Resolves the signed-in user's manager grants.
 *
 * Only MANAGERS hit the RPC: an owner's answer is constant (owners hold every
 * grant unconditionally — gate owner-only UI on `role === 'owner'`, never on a
 * permission key), and the server RAISEs for employees, so both roles skip the
 * call entirely and resolve synchronously.
 */
export function useManagerPermissions(): UseManagerPermissionsResult {
  const { user } = useAuth();
  const role = user?.role;
  const [granted, setGranted] = useState<ManagerPermissions>(NONE);
  // Only a manager has anything to load; everyone else is settled from render one.
  const [loading, setLoading] = useState(role === 'manager');

  const load = useCallback(async () => {
    if (!user?.id || role !== 'manager') {
      setGranted(NONE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_manager_permissions', {
        p_actor_id: user.id,
      });
      if (error) throw error;
      const byKey = new Map<string, boolean>(
        (data || []).map((r): [string, boolean] => [r.permission_key, !!r.granted]),
      );
      setGranted({
        menuConfig: byKey.get('org_settings.menu') ?? false,
        editCategories: byKey.get('menu.edit_categories') ?? false,
        aiUpload: byKey.get('premium.ai_menu_upload') ?? false,
      });
    } catch (e) {
      // Fail CLOSED — an unreadable grant must never unlock anything.
      console.error('[useManagerPermissions] load error:', e);
      setGranted(NONE);
    } finally {
      setLoading(false);
    }
  }, [user?.id, role]);

  useEffect(() => {
    load();
  }, [load]);

  const perms = useMemo<ManagerPermissions>(
    () => (role === 'owner' ? ALL : granted),
    [role, granted],
  );

  return { perms, loading: role === 'owner' ? false : loading, reload: load };
}
