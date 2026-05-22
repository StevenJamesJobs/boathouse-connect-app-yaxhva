
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { Organization } from '@/types/user';
import { useAuth } from './AuthContext';

interface OrganizationContextType {
  organization: Organization | null;
  organizationId: string | null;
  isLoading: boolean;
  refreshOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

function mapDbOrgToOrganization(data: any): Organization {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    logoUrl: data.logo_url,
    address: data.address,
    city: data.city,
    state: data.state,
    zip: data.zip,
    latitude: data.latitude ? Number(data.latitude) : null,
    longitude: data.longitude ? Number(data.longitude) : null,
    weatherLocation: data.weather_location,
    googleMapsQuery: data.google_maps_query,
    rewardCurrencyName: data.reward_currency_name,
    joinCode: data.join_code,
    allowSelfSignup: data.allow_self_signup,
    menuCount: data.menu_count,
    menu1Name: data.menu_1_name,
    menu2Name: data.menu_2_name,
    defaultPassword: data.default_password,
    ownerId: data.owner_id,
  };
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrganization = useCallback(async () => {
    if (!user?.organizationId) {
      setOrganization(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', user.organizationId)
        .single();

      if (error) {
        console.log('[OrgContext] Error fetching organization:', error.message);
        setOrganization(null);
      } else {
        setOrganization(mapDbOrgToOrganization(data));
      }
    } catch (err) {
      console.error('[OrgContext] Unexpected error:', err);
      setOrganization(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.organizationId]);

  useEffect(() => {
    if (isAuthenticated && user?.organizationId) {
      fetchOrganization();
    } else {
      setOrganization(null);
      setIsLoading(!isAuthenticated ? true : false);
    }
  }, [isAuthenticated, user?.organizationId, fetchOrganization]);

  const refreshOrganization = useCallback(async () => {
    await fetchOrganization();
  }, [fetchOrganization]);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        organizationId: organization?.id ?? user?.organizationId ?? null,
        isLoading,
        refreshOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
