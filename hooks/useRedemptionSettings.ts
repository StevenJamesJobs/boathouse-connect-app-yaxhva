import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface RedemptionCustomOption {
  id: string;
  label: string;
  label_es?: string | null;
  cost: number;
  is_active: boolean;
  display_order: number;
}

export interface RedemptionSettings {
  redemptions_enabled: boolean;
  food_enabled: boolean;
  food_mode: 'full' | 'half';
  section_enabled: boolean;
  section_cost: number;
  sidework_enabled: boolean;
  sidework_cost: number;
  freeshift_enabled: boolean;
  freeshift_cost: number;
}

// Defaults match the migration — used when no settings row exists yet (an org
// that hasn't opened Redeem Settings still gets the built-in options enabled).
export const REDEMPTION_DEFAULTS: RedemptionSettings = {
  redemptions_enabled: true,
  food_enabled: true,
  food_mode: 'full',
  section_enabled: true,
  section_cost: 10,
  sidework_enabled: true,
  sidework_cost: 5,
  freeshift_enabled: true,
  freeshift_cost: 25,
};

/**
 * Reads the org's redemption config (settings row + active custom options) so
 * the redeem screen, the employee rewards page, and the menu Redeem buttons all
 * reflect the same live, owner-configured options. Falls back to defaults when
 * no row exists.
 */
export function useRedemptionSettings() {
  const { organizationId } = useOrganization();
  const [settings, setSettings] = useState<RedemptionSettings>(REDEMPTION_DEFAULTS);
  const [customOptions, setCustomOptions] = useState<RedemptionCustomOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    try {
      const [rowRes, optsRes] = await Promise.all([
        supabase.from('organization_redemption_settings' as any).select('*').eq('organization_id', organizationId).maybeSingle(),
        supabase.from('redemption_custom_options' as any).select('*').eq('organization_id', organizationId).eq('is_active', true).order('display_order', { ascending: true }),
      ]);
      const row: any = rowRes.data;
      if (row) {
        setSettings({
          redemptions_enabled: row.redemptions_enabled,
          food_enabled: row.food_enabled,
          food_mode: row.food_mode,
          section_enabled: row.section_enabled,
          section_cost: row.section_cost,
          sidework_enabled: row.sidework_enabled,
          sidework_cost: row.sidework_cost,
          freeshift_enabled: row.freeshift_enabled,
          freeshift_cost: row.freeshift_cost,
        });
      } else {
        setSettings(REDEMPTION_DEFAULTS);
      }
      setCustomOptions(((optsRes.data as any) || []) as RedemptionCustomOption[]);
    } catch (e) {
      console.warn('useRedemptionSettings load error', e);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  return { settings, customOptions, loading, reload: load };
}

// Bucks cost for redeeming a menu item / featured special at the org's mode.
export function foodRedeemCost(price: number, mode: 'full' | 'half'): number {
  const base = Math.max(0, price);
  return mode === 'half' ? Math.ceil(base / 2) : Math.ceil(base);
}
