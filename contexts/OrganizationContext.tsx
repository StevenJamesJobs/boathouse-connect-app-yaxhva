import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

/** Organization-level settings surfaced to every screen via useOrganization(). */
export interface Organization {
  /** Human-readable organization name (e.g. "McLoone's Boathouse"). */
  name: string;
  /** Display name for the reward currency (e.g. "McLoone's Bucks"). */
  reward_currency_name: string;
  /** Default password shown in the employee-editor reset flow. */
  default_password: string;
  /** Location string used for weather widgets. */
  weather_location: string;
}

interface OrganizationContextType {
  organizationId: string | null;
  /** Org-level settings. Always non-null once loading completes (falls back to defaults). */
  organization: Organization;
  isLoading: boolean;
}

/** Sensible defaults used when no org-specific override is found. */
const DEFAULT_ORG: Organization = {
  name: "McLoone's Boathouse",
  reward_currency_name: "McLoone's Bucks",
  default_password: 'boathouseconnect',
  weather_location: 'Long Branch, NJ',
};

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: DEFAULT_ORG,
  isLoading: true,
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization>(DEFAULT_ORG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setOrganizationId(null);
      setOrganization(DEFAULT_ORG);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchOrg() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user!.id)
          .single();

        if (cancelled) return;

        if (error || !data?.organization_id) {
          console.error('[OrganizationContext] Error fetching organization_id:', error);
          setOrganizationId(null);
          setOrganization(DEFAULT_ORG);
          setIsLoading(false);
          return;
        }

        setOrganizationId(data.organization_id);

        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('name, reward_currency_name, default_password, weather_location')
          .eq('id', data.organization_id)
          .single();

        if (!cancelled) {
          if (orgError || !orgData) {
            console.error('[OrganizationContext] Error fetching organization:', orgError);
            setOrganization(DEFAULT_ORG);
          } else {
            setOrganization({
              name: orgData.name || DEFAULT_ORG.name,
              reward_currency_name: orgData.reward_currency_name || DEFAULT_ORG.reward_currency_name,
              default_password: orgData.default_password || DEFAULT_ORG.default_password,
              weather_location: orgData.weather_location || DEFAULT_ORG.weather_location,
            });
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[OrganizationContext] Exception fetching organization_id:', err);
          setOrganizationId(null);
          setOrganization(DEFAULT_ORG);
          setIsLoading(false);
        }
      }
    }

    fetchOrg();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <OrganizationContext.Provider value={{ organizationId, organization, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
