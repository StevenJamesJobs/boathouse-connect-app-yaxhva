/**
 * Appearance kit — shared bits for the s84 Appearance screen (gallery tiles,
 * the honest preview, the custom-accent editor).
 */
import type { PresetPaletteId } from '@/styles/commonStyles';

/** Alpha a hex token (#RRGGBB). Non-hex tokens (the rgba glass set) pass through. */
export function alpha(color: string, a: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Theme-name keys as LITERALS (colon form) so the i18n harvester can see them —
 * a template key (`appearance.theme_${id}`) is invisible to it.
 */
export const THEME_LABEL_KEY: Record<PresetPaletteId | 'custom', string> = {
  moonstone: 'appearance:theme_moonstone',
  ocean: 'appearance:theme_ocean',
  midnight: 'appearance:theme_midnight',
  emerald: 'appearance:theme_emerald',
  gilded: 'appearance:theme_gilded',
  ember: 'appearance:theme_ember',
  custom: 'appearance:theme_custom',
};

/**
 * The rainbow the mockup paints on the hue track and the Custom tile's ring
 * (design-mockups/profile-hub-redesign-v2.html `.hue` / `.tcard.custom .ring`).
 * `locations` sit each stop at its real hue so the knob colour matches the
 * track under it.
 */
export const HUE_GRADIENT_COLORS = [
  '#FF5A3C', '#FFB020', '#7BE04A', '#2DD4BF', '#3B82F6', '#8B5CF6', '#EC4899', '#FF5A3C',
] as const;
export const HUE_GRADIENT_LOCATIONS = [0, 0.108, 0.278, 0.478, 0.603, 0.717, 0.917, 1] as const;
