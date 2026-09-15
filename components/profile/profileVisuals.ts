/**
 * Profile hub visuals (s84). Colours for the family live ONLY here; tiles reuse the Tools
 * kit alphas (tinted glass) and the family accents already locked in toolsVisuals.
 */
import { FAMILY_ACCENTS, ASSISTANT_HUES, TILE_BG_ALPHA, TILE_BORDER_ALPHA } from '@/components/tools/toolsVisuals';
import type { FavoriteAccent } from '@/config/favorites';
import type { ThemeColorSet } from '@/styles/commonStyles';

export type Scheme = 'light' | 'dark';

/** The Team cell / drop hue — azure, fixed (the Manage page's people chip family). */
export const TEAM_HUE = { dark: '#3B82F6', light: '#2563EB' } as const;
/** Gold for rank + rewards + approvals. */
export const GOLD_HUE = { dark: '#F59E0B', light: '#B45309' } as const;
export const VIOLET_HUE = { dark: '#7C5CE0', light: '#6D28D9' } as const;
export const EMERALD_HUE = { dark: '#10A56F', light: '#087A52' } as const;
export const AZURE_HUE = { dark: '#3B82F6', light: '#2563EB' } as const;
/** Destructive ink (log out, remove). */
export const RED_HUE = { dark: '#EF4444', light: '#DC2626' } as const;

export { TILE_BG_ALPHA, TILE_BORDER_ALPHA };

/** Resolve a catalog accent to a hex for the scheme; 'tint' follows the theme. */
export function favoriteAccent(accent: FavoriteAccent, colors: ThemeColorSet, scheme: Scheme): string {
  switch (accent) {
    case 'tint': return colors.tint;
    case 'azure': return AZURE_HUE[scheme];
    case 'violet': return VIOLET_HUE[scheme];
    case 'emerald': return EMERALD_HUE[scheme];
    case 'gold': return GOLD_HUE[scheme];
    case 'kitchen': return ASSISTANT_HUES.kitchen[scheme];
    case 'bartender': return ASSISTANT_HUES.bartender[scheme];
    case 'host': return ASSISTANT_HUES.host[scheme];
    default: return colors.tint;
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Geometry. */
export const GRID_GAP = 10;
export const TILE_RADIUS = 16;
export const SQUARE_MIN_HEIGHT = 88;
export const STAT_RADIUS = 14;
export const SETTINGS_TILE_HEIGHT = 100;
/** Settings-B motion: the row slide, then the content opens as the slide finishes. */
export const SETTINGS_SLIDE_MS = 340;
export const SETTINGS_OPEN_DELAY_MS = 200;
export const SETTINGS_OPEN_MS = 360;
/** Team drop open / close. */
export const TEAM_DROP_MS = 300;

export type ProfileTab = 'hub' | 'info' | 'settings';
export const PROFILE_TABS: ProfileTab[] = ['hub', 'info', 'settings'];

export const TAGLINE_MAX = 60;
export const PROFILE_FOCUS_THROTTLE_MS = 30_000;

// re-export for tiles that want the raw family map
export { FAMILY_ACCENTS };
