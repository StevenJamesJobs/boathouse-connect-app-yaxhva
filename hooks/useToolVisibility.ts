import { useState, useEffect } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgAssistant {
  assistant_key: string;
  display_name: string | null;
  is_active: boolean;
}

export function useToolVisibility() {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const [assistants, setAssistants] = useState<OrgAssistant[]>([]);
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId || !user?.id) return;

    async function fetch() {
      setIsLoading(true);

      const [assistantsRes, mappingsRes] = await Promise.all([
        (supabase.rpc as any)('get_org_assistants', { p_actor_id: user?.id }),
        (supabase.rpc as any)('get_job_title_assistants', { p_actor_id: user?.id }),
      ]);

      const orgAssistants: OrgAssistant[] = assistantsRes.data || [];
      setAssistants(orgAssistants);

      const mappings: { assistant_key: string; job_title: string }[] = mappingsRes.data || [];
      const userJobTitles = user?.jobTitles || [];
      const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';

      const activeKeys = new Set(
        orgAssistants.filter(a => a.is_active).map(a => a.assistant_key)
      );

      const allowed = new Set<string>();
      for (const key of activeKeys) {
        if (isOwnerOrManager) {
          allowed.add(key);
        } else {
          const titleMappings = mappings.filter(m => m.assistant_key === key);
          if (titleMappings.some(m => userJobTitles.includes(m.job_title))) {
            allowed.add(key);
          }
        }
      }

      setAllowedKeys(allowed);
      setIsLoading(false);
    }

    fetch();
  }, [organizationId, user?.id, user?.jobTitles, user?.role]);

  const canSee = (key: string) => allowedKeys.has(key);

  return { assistants, canSee, isLoading };
}
