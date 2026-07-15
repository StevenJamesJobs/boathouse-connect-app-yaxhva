import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

export interface Organization {
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  weather_location: string | null;
  google_maps_query: string | null;
  reward_currency_name: string;
  join_code: string;
  allow_self_signup: boolean;
  menu_count: 1 | 2;
  menu_category_scope: 'shared' | 'per_menu';
  menu_1_name: string;
  menu_2_name: string;
  menu_1_icon: string;
  menu_2_icon: string;
  header_icon: string;
  default_password: string;
  owner_id: string | null;
  games_use_sample_data: boolean;
  staff_can_view_roster: boolean;
}

interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization;
  isLoading: boolean;
  refreshOrganization: () => Promise<void>;
}

const DEFAULT_ORG: Organization = {
  name: "McLoone's Boathouse",
  slug: 'mcloones-boathouse',
  logo_url: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  latitude: null,
  longitude: null,
  // No hardcoded location — each org's weather_location comes from the DB
  // (auto-derived from their address at onboarding). Null until real org loads.
  weather_location: null,
  google_maps_query: null,
  reward_currency_name: "McLoone's Bucks",
  join_code: '',
  allow_self_signup: true,
  menu_count: 2,
  menu_category_scope: 'shared',
  menu_1_name: 'Winter',
  menu_2_name: 'Summer',
  menu_1_icon: 'snowflake',
  menu_2_icon: 'sun.max.fill',
  header_icon: 'sailboat.fill',
  default_password: 'boathouseconnect',
  owner_id: null,
  games_use_sample_data: true,
  staff_can_view_roster: true,
};

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: DEFAULT_ORG,
  isLoading: true,
  refreshOrganization: async () => {},
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization>(DEFAULT_ORG);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrgById = useCallback(async (orgId: string) => {
    // Org derived from the acting user server-side (member-gated); orgId is always the user's own org.
    const { data: orgRows, error: orgError } = await supabase.rpc('get_org', { p_actor_id: user?.id });
    const orgData: any = Array.isArray(orgRows) ? orgRows[0] : orgRows;

    if (orgError || !orgData) {
      console.error('[OrganizationContext] Error fetching organization:', orgError);
      setOrganization(DEFAULT_ORG);
    } else {
      setOrganization({
        name: orgData.name || DEFAULT_ORG.name,
        slug: orgData.slug || DEFAULT_ORG.slug,
        logo_url: orgData.logo_url || null,
        address: orgData.address || null,
        city: orgData.city || null,
        state: orgData.state || null,
        zip: orgData.zip || null,
        latitude: orgData.latitude ? Number(orgData.latitude) : null,
        longitude: orgData.longitude ? Number(orgData.longitude) : null,
        weather_location: orgData.weather_location || null,
        google_maps_query: orgData.google_maps_query || null,
        reward_currency_name: orgData.reward_currency_name || DEFAULT_ORG.reward_currency_name,
        join_code: orgData.join_code || '',
        allow_self_signup: orgData.allow_self_signup ?? true,
        menu_count: (orgData.menu_count as 1 | 2) || DEFAULT_ORG.menu_count,
        menu_category_scope: orgData.menu_category_scope === 'per_menu' ? 'per_menu' : 'shared',
        menu_1_name: orgData.menu_1_name || DEFAULT_ORG.menu_1_name,
        menu_2_name: orgData.menu_2_name || DEFAULT_ORG.menu_2_name,
        menu_1_icon: orgData.menu_1_icon || DEFAULT_ORG.menu_1_icon,
        menu_2_icon: orgData.menu_2_icon || DEFAULT_ORG.menu_2_icon,
        header_icon: orgData.header_icon || DEFAULT_ORG.header_icon,
        default_password: orgData.default_password || DEFAULT_ORG.default_password,
        owner_id: orgData.owner_id || null,
        games_use_sample_data: orgData.games_use_sample_data ?? true,
        staff_can_view_roster: orgData.staff_can_view_roster ?? true,
      });
    }
  }, [user?.id]);

  const refreshOrganization = useCallback(async () => {
    if (organizationId) {
      await fetchOrgById(organizationId);
    }
  }, [organizationId, fetchOrgById]);

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
        const { data, error } = await supabase.rpc('get_me', { p_user_id: user!.id });

        if (cancelled) return;

        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row?.organization_id) {
          console.error('[OrganizationContext] Error fetching organization_id:', error);
          setOrganizationId(null);
          setOrganization(DEFAULT_ORG);
          setIsLoading(false);
          return;
        }

        setOrganizationId(row.organization_id);
        await fetchOrgById(row.organization_id);
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[OrganizationContext] Exception:', err);
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
  }, [user?.id, user?.organizationId, fetchOrgById]);

  return (
    <OrganizationContext.Provider value={{ organizationId, organization, isLoading, refreshOrganization }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
