
import { supabase } from '@/app/integrations/supabase/client';

export function orgFrom(table: string, organizationId: string) {
  return supabase.from(table).select('*').eq('organization_id', organizationId);
}

export function orgInsert(table: string, organizationId: string, data: Record<string, any> | Record<string, any>[]) {
  const rows = Array.isArray(data)
    ? data.map(row => ({ ...row, organization_id: organizationId }))
    : { ...data, organization_id: organizationId };
  return supabase.from(table).insert(rows);
}
