import { supabase } from '@/app/integrations/supabase/client';

/**
 * A single row from the get_org_directory RPC. Field names match the users-table columns
 * (snake_case) so call sites that previously did `.from('users').select(...)` can keep reading
 * the same field names off each row.
 *
 * PII gating: `email`, `phone_number`, and `is_test_user` are returned ONLY when the acting user
 * is a manager or owner; they are NULL for regular employees.
 */
export interface OrgDirectoryRow {
  id: string;
  name: string;
  username: string;
  job_title: string | null;
  job_titles: string[] | null;
  role: string;
  profile_picture_url: string | null;
  is_active: boolean;
  mcloones_bucks: number | null;
  badge_title: string | null;
  is_test_user: boolean | null;
  email: string | null;
  phone_number: string | null;
}

/**
 * Fetch the roster for the acting user's organization via the hardened get_org_directory RPC.
 * The org is derived server-side from `actorId` (never a client-supplied org id), and the base
 * table is not read directly. Returns ALL members (active + inactive) — apply is_active / name /
 * limit / ordering filters client-side to match the previous direct-query behavior.
 *
 * Returns an empty array on error (callers already tolerate an empty roster).
 */
export async function getOrgDirectory(actorId: string | null | undefined): Promise<OrgDirectoryRow[]> {
  if (!actorId) return [];
  const { data, error } = await supabase.rpc('get_org_directory', { p_actor_id: actorId });
  if (error) {
    console.error('[orgDirectory] get_org_directory error:', error.message);
    return [];
  }
  return (data ?? []) as OrgDirectoryRow[];
}
