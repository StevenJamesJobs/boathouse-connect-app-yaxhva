import { supabase } from '@/app/integrations/supabase/client';

// Cache the resolved sample-org id for the session ('mcloones-boathouse' = the
// Boathouse demo data). undefined = not looked up yet; null = not found.
let _sampleOrgId: string | null | undefined;

async function getSampleOrgId(): Promise<string | null> {
  if (_sampleOrgId !== undefined) return _sampleOrgId;
  const { data } = await supabase.rpc('get_org_id_by_slug', { p_slug: 'mcloones-boathouse' });
  const resolved: string | null = (data as any) ?? null;
  _sampleOrgId = resolved;
  return resolved;
}

/**
 * Which organization's menu/recipe data the games (Picture This, Memory Tiles,
 * Word Search) should draw from.
 *
 * When the owner's "Use sample game data" toggle (Game Hub Editor) is ON, the
 * games use the Boathouse sample org so a brand-new restaurant has playable
 * demo content immediately. When OFF, they use the org's own data only. Falls
 * back to the org's own id if the sample org can't be resolved.
 */
export async function resolveGameSourceOrgId(
  organizationId: string,
  useSampleData: boolean,
): Promise<string> {
  if (!useSampleData) return organizationId;
  const sample = await getSampleOrgId();
  return sample ?? organizationId;
}
