/**
 * joltRoutes — where the bolt shows, and which bar it expects there (s87).
 *
 * Presence follows the BottomNavBar (Steve's rule): every screen that renders the
 * portal chrome carries the bolt; everything else (Messages, play screens, sheets,
 * onboarding) has none. Pathnames are expo-router's, groups stripped, so the
 * portal tabs read `/manager/menus`, not `/(portal)/manager/menus`.
 *
 * The slot expectation lets the root plan a bar → bar move at dispatch time
 * (park in place and wait for the new bar to measure) instead of flying home
 * first and reversing mid-air.
 */
export type JoltSlotId = 'guides' | 'menu' | 'manage' | 'profile';

const TAB_ROUTES: Record<string, JoltSlotId | null> = {
  '/manager': null,
  '/manager/menus': 'menu',
  '/manager/tools': null,
  '/manager/manage': 'manage',
  '/manager/profile': 'profile',
  '/employee': null,
  '/employee/menus': 'menu',
  '/employee/tools': null,
  '/employee/rewards': null,
  '/employee/profile': 'profile',
};

// Every pushed screen that renders <BottomNavBar /> (grep it before adding one here).
const PUSHED_ROUTES: Record<string, JoltSlotId | null> = {
  '/announcement-editor': null,
  '/assistant-editors': null,
  '/bartender-assistant': null,
  '/bartender-assistant-editor': null,
  '/exam-editor': null,
  '/game-hub': null,
  '/guides-and-training': 'guides',
  '/guides-and-training-editor': 'guides',
  '/host-assistant': null,
  '/host-assistant-editor': null,
  '/kitchen-assistant': null,
  '/kitchen-assistant-editor': null,
  '/manage-menu-categories': null,
  '/master-leaderboard': null,
  '/menu-editor': 'menu',
  '/menu-memory-game': null,
  '/menu-upload': null,
  '/picture-this-game': null,
  '/quiz-hub-editor': null,
  '/redeem': null,
  '/rewards-and-reviews-editor': null,
  '/special-features-editor': null,
  '/upcoming-events-editor': null,
  '/weekly-quizzes': null,
  '/word-search-game': null,
};

const ROUTES: Record<string, JoltSlotId | null> = { ...TAB_ROUTES, ...PUSHED_ROUTES };

/** Strip route groups and a trailing slash so both `/(portal)/manager/` and `/manager` match. */
export function normalizeJoltPath(pathname: string): string {
  const stripped = pathname.replace(/\/\([^/]*\)/g, '').replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

export interface JoltRouteInfo {
  /** The bolt is present on this screen. */
  chrome: boolean;
  /** The bar the screen is expected to mount (null = the bolt rests at home). */
  slot: JoltSlotId | null;
}

export function joltRouteInfo(pathname: string): JoltRouteInfo {
  const key = normalizeJoltPath(pathname);
  if (!(key in ROUTES)) return { chrome: false, slot: null };
  return { chrome: true, slot: ROUTES[key] };
}
