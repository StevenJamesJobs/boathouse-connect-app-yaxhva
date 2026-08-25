import type { TFunction } from 'i18next';

/**
 * The "1,240 · 6 games" line under an expanded tile (s75) — one formatter so
 * the plural branch and the not-played fallback can't drift between screens.
 */
export function formatPlayedLine(
  t: TFunction,
  score: number | null | undefined,
  gamesPlayed: number | null | undefined,
): string {
  const games = Number(gamesPlayed ?? 0);
  if (!games) return t('game_hub_ui:not_played');
  const gamesLabel =
    games === 1 ? t('game_hub_ui:games_one') : t('game_hub_ui:games_n', { n: games });
  return `${Number(score ?? 0).toLocaleString()} · ${gamesLabel}`;
}
