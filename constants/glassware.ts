// Common bar glassware presets for the libation recipe editors' Glassware picker.
// Owners can still enter a custom value via the picker's "Custom…" option, so
// this list is a convenience, not an exhaustive constraint. English-only by
// design (mirrors the existing ALCOHOL_TYPES constant in the cocktails editor).
export const GLASSWARE_OPTIONS = [
  'Wine Glass',
  'Rocks',
  'Collins',
  'Highball',
  'Martini',
  'Cocktail',
  'Coupe',
  'Champagne',
  'Brandy Snifter',
  'Pint',
  'Tumbler',
] as const;

// Visual glyph per glassware preset for the GlasswareIconPicker. Pulls from two
// bundled @expo/vector-icons families (no new deps): MaterialCommunityIcons ('mci')
// and FontAwesome5 solid ('fa5'). Each preset gets a distinct glyph; only Brandy
// Snifter is approximate (no true snifter glyph exists in the bundled fonts).
// Names not in this map (e.g. owner-entered "Custom…" values) fall back to a
// generic glass glyph in the picker.
export type GlasswareIconDef = { family: 'mci' | 'fa5'; glyph: string };

export const GLASSWARE_ICONS: Record<string, GlasswareIconDef> = {
  'Wine Glass': { family: 'mci', glyph: 'glass-wine' },
  'Rocks': { family: 'fa5', glyph: 'glass-whiskey' },
  'Collins': { family: 'mci', glyph: 'glass-stange' },
  'Highball': { family: 'mci', glyph: 'cup-water' },
  'Martini': { family: 'fa5', glyph: 'glass-martini' },
  'Cocktail': { family: 'fa5', glyph: 'cocktail' },
  'Coupe': { family: 'mci', glyph: 'glass-tulip' },
  'Champagne': { family: 'mci', glyph: 'glass-flute' },
  'Brandy Snifter': { family: 'mci', glyph: 'glass-fragile' },
  'Pint': { family: 'mci', glyph: 'beer' },
  'Tumbler': { family: 'mci', glyph: 'cup' },
};

// Generic glass glyph for custom/unknown glassware values.
export const GLASSWARE_FALLBACK_ICON: GlasswareIconDef = { family: 'mci', glyph: 'glass-fragile' };
