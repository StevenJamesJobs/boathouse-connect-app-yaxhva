/**
 * Board standing for the s76 results header — where the player sits on the
 * category board of the game they just played, and the gap to the player
 * above (the chase line). Board semantics differ per game and the math holds
 * for both: memory/word_search boards rank best SINGLE run (MAX), so the gap
 * means "your best needs +N"; picture_this accumulates (SUM), so the gap
 * means "bank +N more".
 *
 * Uses get_game_category_board with a deep limit — no server changes. A
 * player outside the window just gets no rank/chase (the header hides them).
 */
import { fetchCategoryBoard } from '@/utils/game/boards';

export interface BoardStanding {
  /** 1-based rank, or null when not on the fetched board window. */
  rank: number | null;
  /** The player's board score (best run, or accumulated for picture_this). */
  myBoardScore: number;
  /** Points to the player directly above (null at #1 or when unranked). */
  gapToAbove: number | null;
  isTop: boolean;
  boardSize: number;
}

const STANDING_DEPTH = 100;

export async function fetchStanding(
  actorId: string,
  game: 'memory' | 'word_search' | 'picture_this',
  category: string,
): Promise<BoardStanding | null> {
  const rows = await fetchCategoryBoard(actorId, game, category, STANDING_DEPTH);
  if (!rows) return null;
  const idx = rows.findIndex((r) => r.user_id === actorId);
  if (idx < 0) {
    return { rank: null, myBoardScore: 0, gapToAbove: null, isTop: false, boardSize: rows.length };
  }
  const above = idx > 0 ? rows[idx - 1] : null;
  return {
    rank: idx + 1,
    myBoardScore: rows[idx].score,
    gapToAbove: above ? Math.max(0, above.score - rows[idx].score) : null,
    isTop: idx === 0,
    boardSize: rows.length,
  };
}
