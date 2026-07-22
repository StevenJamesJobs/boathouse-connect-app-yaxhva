import { supabase } from '@/app/integrations/supabase/client';

// Whether the acting user's OWN org currently shows a Wine category on the
// menu. Game screens hide their wine surfaces (Picture This wine tile/tab,
// Memory wine-pairings mode) when the owner has hidden Wine in the Category
// Editor — deliberately keyed to the OWN org even when the sample-data toggle
// is on. Only the slots the org actually RENDERS count: per-menu orgs render
// slots 1/2 (slot 0 is an unused template copy there), shared orgs render
// slot 0. Errors fail open (wine stays visible).
export async function fetchOwnWineVisible(
  actorId: string | undefined | null,
  perMenu: boolean,
): Promise<boolean> {
  if (!actorId) return true;
  try {
    const { data } = await supabase.rpc('get_menu_categories', { p_actor_id: actorId });
    if (!data) return true;
    return (data as any[]).some(
      (c) =>
        c.system_key === 'cat.wine' &&
        !c.is_hidden &&
        (perMenu ? c.menu_slot === 1 || c.menu_slot === 2 : c.menu_slot === 0),
    );
  } catch {
    return true;
  }
}
