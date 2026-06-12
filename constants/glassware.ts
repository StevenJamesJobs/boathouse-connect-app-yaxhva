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
