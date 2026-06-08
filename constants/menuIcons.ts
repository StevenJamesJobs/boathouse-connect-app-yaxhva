// Curated catalog of icons an owner can pick for their seasonal menus
// (SeasonSelector / MenuDisplay) and for the portal header brand mark.
//
// Each entry pairs an iOS SF Symbol name with an Android MaterialIcons glyph.
// SF Symbol names are chosen from the iOS 15–16 catalog (the app's min target)
// so they render on device instead of showing blank; every Android glyph is
// verified present in @expo/vector-icons MaterialIcons. When adding a new
// option, keep both sides in sync and sanity-check the iOS name on a device.
export interface MenuIconOption {
  sf: string;      // iOS SF Symbol name
  android: string; // MaterialIcons glyph name
  label: string;   // shown in the picker
}

export const MENU_ICON_OPTIONS: MenuIconOption[] = [
  { sf: 'snowflake', android: 'ac-unit', label: 'Snowflake' },
  { sf: 'sun.max.fill', android: 'wb-sunny', label: 'Sun' },
  { sf: 'leaf.fill', android: 'eco', label: 'Leaf' },
  { sf: 'sparkles', android: 'auto-awesome', label: 'Sparkles' },
  { sf: 'moon.stars.fill', android: 'nights-stay', label: 'Night' },
  { sf: 'flame.fill', android: 'local-fire-department', label: 'Flame' },
  { sf: 'fork.knife', android: 'restaurant', label: 'Dining' },
  { sf: 'wineglass.fill', android: 'wine-bar', label: 'Wine' },
  { sf: 'cup.and.saucer.fill', android: 'local-cafe', label: 'Coffee' },
  { sf: 'cup.and.straw.fill', android: 'local-bar', label: 'Drinks' },
  { sf: 'fish.fill', android: 'set-meal', label: 'Seafood' },
  { sf: 'takeoutbag.and.cup.and.straw.fill', android: 'takeout-dining', label: 'Takeout' },
  { sf: 'popcorn.fill', android: 'fastfood', label: 'Snacks' },
  { sf: 'birthday.cake.fill', android: 'cake', label: 'Cake' },
  { sf: 'carrot.fill', android: 'local-florist', label: 'Produce' },
  { sf: 'star.fill', android: 'star', label: 'Star' },
  { sf: 'heart.fill', android: 'favorite', label: 'Heart' },
  { sf: 'gift.fill', android: 'card-giftcard', label: 'Gift' },
  { sf: 'drop.fill', android: 'water-drop', label: 'Drop' },
  { sf: 'bolt.fill', android: 'bolt', label: 'Bolt' },
  { sf: 'trophy.fill', android: 'emoji-events', label: 'Trophy' },
  { sf: 'sailboat.fill', android: 'sailing', label: 'Sailboat' },
  { sf: 'globe.americas.fill', android: 'public', label: 'Globe' },
  { sf: 'building.2.fill', android: 'storefront', label: 'Building' },
];

const ANDROID_BY_SF: Record<string, string> = MENU_ICON_OPTIONS.reduce(
  (acc, o) => {
    acc[o.sf] = o.android;
    return acc;
  },
  {} as Record<string, string>,
);

// Resolve an SF Symbol name to its Android MaterialIcons glyph. Falls back to
// the SF name itself (IconSymbol's ICON_MAP may still resolve it) when unknown.
export function menuIconAndroid(sf: string): string {
  return ANDROID_BY_SF[sf] ?? sf;
}
