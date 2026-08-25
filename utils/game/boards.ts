import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import type { GameBoardRow } from '@/components/game/GameBoardCard';

/**
 * Shared fetchers for the s75 board cards (top-3 rows under an expanded tile).
 * Both return `null` on error so callers can KEEP a previously-cached board
 * instead of rendering a false "no scores yet" empty state — GameBoardCard
 * shows its spinner for an uncached `null`.
 */

/** Top-N of one game category, merged across play modes (get_game_category_board). */
export async function fetchCategoryBoard(
  actorId: string,
  game: 'memory' | 'word_search' | 'picture_this',
  category: string,
  limit = 3,
): Promise<GameBoardRow[] | null> {
  const { data, error } = await supabase.rpc('get_game_category_board', {
    p_actor_id: actorId,
    p_game: game,
    p_category: category,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error('[game/boards] category board error:', error);
    return null;
  }
  return data.map((r: any) => ({
    user_id: r.user_id,
    name: r.name,
    profile_picture_url: r.profile_picture_url,
    score: Number(r.score ?? 0),
  }));
}

/** Top-N of a game's master board (accumulated totals, master_* RPC family). */
export async function fetchMasterTop(
  actorId: string,
  rpc: keyof Database['public']['Functions'],
  limit = 3,
): Promise<GameBoardRow[] | null> {
  const { data, error } = await supabase.rpc(rpc as any, {
    p_actor_id: actorId,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error('[game/boards] master board error:', error);
    return null;
  }
  return data.map((r: any) => ({
    user_id: r.user_id,
    name: r.name,
    profile_picture_url: r.profile_picture_url,
    score: Number(r.total_score ?? 0),
  }));
}
