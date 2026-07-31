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
  labelKey: string; // i18n key for the picker caption (stored value is `sf`, never the caption)
}

export const MENU_ICON_OPTIONS: MenuIconOption[] = [
  { sf: 'snowflake', android: 'ac-unit', labelKey: 'menu_icons.snowflake' },
  { sf: 'sun.max.fill', android: 'wb-sunny', labelKey: 'menu_icons.sun' },
  { sf: 'leaf.fill', android: 'eco', labelKey: 'menu_icons.leaf' },
  { sf: 'sparkles', android: 'auto-awesome', labelKey: 'menu_icons.sparkles' },
  { sf: 'moon.stars.fill', android: 'nights-stay', labelKey: 'menu_icons.night' },
  { sf: 'flame.fill', android: 'local-fire-department', labelKey: 'menu_icons.flame' },
  { sf: 'fork.knife', android: 'restaurant', labelKey: 'menu_icons.dining' },
  { sf: 'wineglass.fill', android: 'wine-bar', labelKey: 'menu_icons.wine' },
  { sf: 'cup.and.saucer.fill', android: 'local-cafe', labelKey: 'menu_icons.coffee' },
  { sf: 'mug.fill', android: 'sports-bar', labelKey: 'menu_icons.drinks' },
  { sf: 'fish.fill', android: 'set-meal', labelKey: 'menu_icons.seafood' },
  { sf: 'takeoutbag.and.cup.and.straw.fill', android: 'takeout-dining', labelKey: 'menu_icons.takeout' },
  { sf: 'popcorn.fill', android: 'fastfood', labelKey: 'menu_icons.snacks' },
  { sf: 'birthday.cake.fill', android: 'cake', labelKey: 'menu_icons.cake' },
  { sf: 'carrot.fill', android: 'local-florist', labelKey: 'menu_icons.produce' },
  { sf: 'star.fill', android: 'star', labelKey: 'menu_icons.star' },
  { sf: 'heart.fill', android: 'favorite', labelKey: 'menu_icons.heart' },
  { sf: 'gift.fill', android: 'card-giftcard', labelKey: 'menu_icons.gift' },
  { sf: 'drop.fill', android: 'water-drop', labelKey: 'menu_icons.drop' },
  { sf: 'bolt.fill', android: 'bolt', labelKey: 'menu_icons.bolt' },
  { sf: 'trophy.fill', android: 'emoji-events', labelKey: 'menu_icons.trophy' },
  { sf: 'sailboat.fill', android: 'sailing', labelKey: 'menu_icons.sailboat' },
  { sf: 'globe.americas.fill', android: 'public', labelKey: 'menu_icons.globe' },
  { sf: 'building.2.fill', android: 'storefront', labelKey: 'menu_icons.building' },
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
