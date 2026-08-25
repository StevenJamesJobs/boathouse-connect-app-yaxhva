/**
 * The games' shared color language (s75) — one source for the per-GAME accents
 * (hub tiles, editor rows) and the per-CATEGORY accents that repeat across
 * games (food = red, libations = violet, wine = purple, prices = teal).
 * Screens map their local mode/category keys onto these so a palette tweak or
 * a new category is a one-file change.
 */
export interface GameVisual {
  accent: string;
  gradient: readonly [string, string];
}

// The Blues set (Steve, s75): one scale, light→dark — sky → azure → royal
// indigo → navy. Games and categories take steps on the scale; accents sit a
// step deeper than the gradients so colored text reads on light-theme cards.
export const GAME_VISUALS = {
  word_search: { accent: '#0EA5E9', gradient: ['#0B5E86', '#41B4E8'] },
  memory: { accent: '#3B82F6', gradient: ['#1D3E8F', '#5C8DF0'] },
  picture_this: { accent: '#5B5BD6', gradient: ['#28246E', '#6663E0'] },
} as const satisfies Record<string, GameVisual>;

export const CATEGORY_VISUALS = {
  food: { accent: '#0EA5E9', gradient: ['#0B5E86', '#41B4E8'] },
  libations: { accent: '#3B82F6', gradient: ['#1D3E8F', '#5C8DF0'] },
  wine: { accent: '#5B5BD6', gradient: ['#28246E', '#6663E0'] },
  menu_prices: { accent: '#4C5FC7', gradient: ['#101A45', '#3D4E9E'] },
} as const satisfies Record<string, GameVisual>;
