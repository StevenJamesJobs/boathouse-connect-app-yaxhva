import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';

/**
 * s91 — the "Who can edit recipes" grant, client side.
 *
 * Org Settings › Jobs & Tools maps job titles to assistant keys in
 * job_title_assistants. Two keys ride the same table — 'kitchen_editor' and
 * 'bartender_editor' — and a user holding a mapped title may open that family's
 * EDITOR (recipes + checklists) without Manager powers (no Menu Categories, no
 * Edit Menu, no uploads). Owners / managers always can.
 *
 * The server is the authority (_may_edit_assistant gates every write RPC and
 * the storage-broker's editor purposes); this hook only decides what to SHOW:
 * the To Editor chip, the ＋, the ⋯ rows. It refetches on focus (the s72
 * grants contract: fresh per open, not live-while-open).
 */
export type AssistantEditorKey = 'bartender' | 'kitchen' | 'host';

export interface UseAssistantEditorResult {
  /** True while the first answer is in flight (owners / managers resolve synchronously). */
  isLoading: boolean;
  /** May this user open the family's editor? */
  canEdit: (key: AssistantEditorKey) => boolean;
  /** The raw set — handy for the Tools pages' rails. */
  keys: Set<AssistantEditorKey>;
  refresh: () => Promise<void>;
}

export function useAssistantEditor(): UseAssistantEditorResult {
  const { user } = useAuth();
  const manager = isManagerOrOwner(user);
  const [keys, setKeys] = useState<Set<AssistantEditorKey>>(() =>
    manager ? new Set<AssistantEditorKey>(['bartender', 'kitchen', 'host']) : new Set()
  );
  const [isLoading, setIsLoading] = useState(!manager);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    if (isManagerOrOwner(user)) {
      setKeys(new Set<AssistantEditorKey>(['bartender', 'kitchen', 'host']));
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_my_assistant_editor_keys', { p_actor_id: user.id });
      if (error) throw error;
      setKeys(new Set((data || []).map((r: { assistant_key: string }) => r.assistant_key as AssistantEditorKey)));
    } catch (e) {
      // Fail closed: an employee with no answer gets no editor chip (the server
      // would refuse the writes anyway).
      console.error('[useAssistantEditor] fetch failed', e);
      setKeys(new Set());
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const canEdit = useCallback((key: AssistantEditorKey) => keys.has(key), [keys]);

  return { isLoading, canEdit, keys, refresh };
}
