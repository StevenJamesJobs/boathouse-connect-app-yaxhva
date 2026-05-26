import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface OrgJobTitle {
  id: string;
  title: string;
  display_order: number;
  is_active: boolean;
}

export function useOrgJobTitles() {
  const { organizationId } = useOrganization();
  const [jobTitles, setJobTitles] = useState<OrgJobTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobTitles = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    const { data, error } = await (supabase
      .from('organization_job_titles' as any)
      .select('id, title, display_order, is_active')
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true }) as any);

    if (!error && data) {
      setJobTitles(data);
    }
    setIsLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchJobTitles();
  }, [fetchJobTitles]);

  const activeJobTitles = jobTitles.filter(jt => jt.is_active).map(jt => jt.title);

  return { jobTitles, activeJobTitles, isLoading, refetch: fetchJobTitles };
}
