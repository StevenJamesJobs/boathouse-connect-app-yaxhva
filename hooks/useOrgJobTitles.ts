import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgJobTitle {
  id: string;
  title: string;
  display_order: number;
  is_active: boolean;
}

export function useOrgJobTitles() {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const [jobTitles, setJobTitles] = useState<OrgJobTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobTitles = useCallback(async () => {
    if (!organizationId || !user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await (supabase.rpc as any)('get_org_job_titles', {
      p_actor_id: user.id,
    });

    if (!error && data) {
      setJobTitles(data);
    }
    setIsLoading(false);
  }, [organizationId, user?.id]);

  useEffect(() => {
    fetchJobTitles();
  }, [fetchJobTitles]);

  const activeJobTitles = jobTitles.filter(jt => jt.is_active).map(jt => jt.title);

  return { jobTitles, activeJobTitles, isLoading, refetch: fetchJobTitles };
}
