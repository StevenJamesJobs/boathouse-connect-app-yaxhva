/**
 * Favorites (s84) — the Profile hub's personal tile catalog. Successor of the Quick Tools
 * catalog: same ids where a tool existed before (so a saved `quick_tools` array upgrades in
 * place), plus the families that arrived since (Tips, Schedule, Approvals, …).
 *
 * The catalog is pure data + pure functions — no React, no i18n. Screens resolve labels via
 * the `labelKey`s and feed the live lines from `LiveData` (components/profile/useFavoriteData).
 *
 * Storage: users.quick_tools (jsonb) —
 *   v1 (legacy):  ["bartender-assistant", "guides-training", ...]         → Simple tiles, in order
 *   v2:           { v: 2, tiles: [{ id, size, simple, facts: { key: bool } }, ...] }
 */

export type FavoriteSize = 'square' | 'wide';
export type FavoriteCategory = 'work' | 'learn' | 'play' | 'manage';
export type FavoriteAccent = 'tint' | 'azure' | 'violet' | 'emerald' | 'gold' | 'kitchen' | 'bartender' | 'host';
export type FavoriteAudience = 'all' | 'employee' | 'manager' | 'owner';
/** Visibility gates the hub resolves at render time. */
export type FavoriteGate = 'tips' | 'quizzes' | 'roster' | 'schedule_uploads';

export interface FactDef {
  key: string;
  labelKey: string;
  hintKey?: string;
  default: boolean;
}

/** A square tile's live line: plain text with optional strong runs. */
export interface LiveLine {
  parts: { text: string; strong?: boolean }[];
}

/** A wide tile's body. */
export interface LiveBody {
  big: string;
  small?: string;
  /** Fact rows; each carries the fact key so the tile's toggles can hide it. */
  kv: { key: string; label: string; value: string }[];
  chip?: { label: string; route?: string; iosIcon?: string; androidIcon?: string };
}

/** Everything a live line may read. Every field optional: missing = "not loaded", never faked. */
export interface LiveData {
  unreadMessages?: number;
  quizzesWaiting?: number;
  guidesNew?: number;
  guidesCount?: number;
  tips?: { weekTotal: number; weekShifts: number; avgPerShift: number | null; lastVerdict: string | null; scheduledToday: boolean };
  schedule?: { hoursThisWeek: number; shiftsThisWeek: number; nextShift: string | null; pickUpsOpen: number };
  bucks?: number;
  pendingRedemptions?: number;
  game?: { rank: number | null; score: number };
  staffCount?: number;
  scheduledToday?: number;
  approvals?: { waiting: number; preview: string[] };
  announcements?: { live: number; scheduled: number };
  uploadCredits?: { remaining: number; max: number; lastScan: string | null; renews: string | null };
  sentThisWeek?: number;
  reviews?: { newCount: number; avg: number | null; count: number };
  specialsToday?: number;
  nextEvent?: string | null;
  roster?: { am: number; pm: number };
  subscriptionTier?: string;
}

export type LabelFn = (key: string, opts?: Record<string, unknown>) => string;

export interface FavoriteDef {
  id: string;
  labelKey: string;
  iosIcon: string;
  androidIcon: string;
  /** expo-router href, or a hub verb: 'hub/rewards' | 'hub/schedule-tab' | 'hub/team' */
  route: string;
  category: FavoriteCategory;
  accent: FavoriteAccent;
  availableTo: FavoriteAudience;
  requiredJobTitles?: string[];
  gate?: FavoriteGate;
  /** Org tool-visibility key (useToolVisibility.canSee): 'check_outs' | 'bartender' | 'host' | 'kitchen'. */
  visibilityKey?: string;
  sizes: FavoriteSize[];
  facts?: FactDef[];
  /** Square live line (also the Simple tile's line). Return null while unloaded. */
  line?: (d: LiveData, t: LabelFn) => LiveLine | null;
  /** Wide body; only for defs whose `sizes` include 'wide'. */
  body?: (d: LiveData, t: LabelFn) => LiveBody | null;
  /** Badge count + pulse (waiting work), from live data. */
  attention?: (d: LiveData) => { badge?: number; pulse?: boolean } | null;
}

export interface FavoriteTile {
  id: string;
  size: FavoriteSize;
  simple: boolean;
  facts: Record<string, boolean>;
}

export const MAX_FAVORITES = 8;
export const FAVORITES_VERSION = 2;

const n = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const money = (v: number) => `$${Math.round(v).toLocaleString()}`;

// ── the catalog ──────────────────────────────────────────────────────────────

export const FAVORITES_CATALOG: FavoriteDef[] = [
  // ═══ WORK ═══
  {
    id: 'tips',
    labelKey: 'favorites.tips',
    iosIcon: 'banknote.fill',
    androidIcon: 'point-of-sale',
    route: '/tips-and-checkouts',
    category: 'work',
    accent: 'emerald',
    availableTo: 'all',
    gate: 'tips',
    visibilityKey: 'check_outs',
    sizes: ['square', 'wide'],
    facts: [
      { key: 'weekTotal', labelKey: 'favorites.fact_tips_week_total', hintKey: 'favorites.fact_tips_week_total_hint', default: true },
      { key: 'avg', labelKey: 'favorites.fact_tips_avg', hintKey: 'favorites.fact_tips_avg_hint', default: true },
      { key: 'verdict', labelKey: 'favorites.fact_tips_verdict', hintKey: 'favorites.fact_tips_verdict_hint', default: false },
      { key: 'logTonight', labelKey: 'favorites.fact_tips_log_tonight', hintKey: 'favorites.fact_tips_log_tonight_hint', default: true },
    ],
    line: (d, t) => {
      if (!d.tips) return null;
      return { parts: [{ text: t('favorites.line_this_week') + ' ' }, { text: money(d.tips.weekTotal), strong: true }] };
    },
    body: (d, t) => {
      if (!d.tips) return null;
      const kv: LiveBody['kv'] = [];
      if (d.tips.avgPerShift != null) kv.push({ key: 'avg', label: t('favorites.fact_tips_avg'), value: money(d.tips.avgPerShift) });
      if (d.tips.lastVerdict) kv.push({ key: 'verdict', label: t('favorites.kv_last_checkout'), value: d.tips.lastVerdict });
      return {
        big: money(d.tips.weekTotal),
        small: t('favorites.small_shifts', { count: d.tips.weekShifts }),
        kv,
        chip: d.tips.scheduledToday ? { label: t('favorites.chip_log_tonight'), route: '/tips-and-checkouts', iosIcon: 'plus', androidIcon: 'add' } : undefined,
      };
    },
  },
  {
    id: 'my-schedule',
    labelKey: 'quick_tools.my_schedule',
    iosIcon: 'calendar',
    androidIcon: 'event',
    route: 'hub/schedule-tab', // the Welcome Schedule tab (Steve's round 2), not the full-schedule page
    category: 'work',
    accent: 'tint',
    availableTo: 'all',
    sizes: ['square', 'wide'],
    facts: [
      { key: 'hours', labelKey: 'favorites.fact_sched_hours', default: true },
      { key: 'next', labelKey: 'favorites.fact_sched_next', default: true },
      { key: 'pickups', labelKey: 'favorites.fact_sched_pickups', default: true },
    ],
    line: (d, t) => {
      if (!d.schedule) return null;
      return d.schedule.nextShift
        ? { parts: [{ text: t('favorites.line_next') + ' ' }, { text: d.schedule.nextShift, strong: true }] }
        : { parts: [{ text: t('favorites.line_no_shift') }] };
    },
    body: (d, t) => {
      if (!d.schedule) return null;
      const kv: LiveBody['kv'] = [];
      if (d.schedule.nextShift) kv.push({ key: 'next', label: t('favorites.kv_next'), value: d.schedule.nextShift });
      kv.push({ key: 'pickups', label: t('favorites.kv_pickups'), value: t('favorites.val_shifts', { count: d.schedule.pickUpsOpen }) });
      return {
        big: String(d.schedule.hoursThisWeek),
        small: t('favorites.small_hours_shifts', { count: d.schedule.shiftsThisWeek }),
        kv,
        chip: d.schedule.pickUpsOpen > 0 ? { label: t('favorites.chip_pick_up'), route: 'hub/schedule-tab', iosIcon: 'arrow.left.arrow.right', androidIcon: 'swap-horiz' } : undefined,
      };
    },
  },
  {
    id: 'pick-up-shifts',
    labelKey: 'favorites.pick_up_shifts',
    iosIcon: 'arrow.left.arrow.right',
    androidIcon: 'swap-horiz',
    route: 'hub/schedule-tab',
    category: 'work',
    accent: 'tint',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => (d.schedule ? { parts: [{ text: String(d.schedule.pickUpsOpen), strong: true }, { text: ' ' + t('favorites.line_open') }] } : null),
    attention: (d) => (d.schedule && d.schedule.pickUpsOpen > 0 ? { badge: d.schedule.pickUpsOpen } : null),
  },
  {
    id: 'messages',
    labelKey: 'quick_tools.messages',
    iosIcon: 'envelope.fill',
    androidIcon: 'mail',
    route: '/messages',
    category: 'work',
    accent: 'tint',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => (n(d.unreadMessages) != null ? { parts: [{ text: String(d.unreadMessages), strong: true }, { text: ' ' + t('favorites.line_unread') }] } : null),
    attention: (d) => (d.unreadMessages ? { badge: d.unreadMessages } : null),
  },
  {
    id: 'menus',
    labelKey: 'quick_tools.menus',
    iosIcon: 'fork.knife',
    androidIcon: 'restaurant',
    route: 'hub/menus',
    category: 'work',
    accent: 'tint',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => (n(d.specialsToday) != null ? { parts: [{ text: String(d.specialsToday), strong: true }, { text: ' ' + t('favorites.line_specials_today') }] } : null),
  },
  {
    id: 'todays-roster',
    labelKey: 'quick_tools.todays_roster',
    iosIcon: 'list.clipboard.fill',
    androidIcon: 'assignment',
    route: '/todays-roster',
    category: 'work',
    accent: 'azure',
    availableTo: 'all',
    gate: 'roster',
    sizes: ['square'],
    line: (d) => (d.roster ? { parts: [{ text: 'AM ' }, { text: String(d.roster.am), strong: true }, { text: ' · PM ' }, { text: String(d.roster.pm), strong: true }] } : null),
  },
  {
    id: 'bartender-assistant',
    labelKey: 'quick_tools.bartender_assistant',
    iosIcon: 'wineglass.fill',
    androidIcon: 'local-bar',
    route: '/bartender-assistant',
    category: 'work',
    accent: 'bartender',
    availableTo: 'all',
    visibilityKey: 'bartender',
    requiredJobTitles: ['Bartender', 'Lead Server', 'Banquet Captain'],
    sizes: ['square'],
  },
  {
    id: 'host-assistant',
    labelKey: 'quick_tools.host_assistant',
    iosIcon: 'person.2.fill',
    androidIcon: 'people',
    route: '/host-assistant',
    category: 'work',
    accent: 'host',
    availableTo: 'all',
    visibilityKey: 'host',
    requiredJobTitles: ['Host'],
    sizes: ['square'],
  },
  {
    id: 'kitchen-assistant',
    labelKey: 'quick_tools.kitchen_assistant',
    iosIcon: 'flame.fill',
    androidIcon: 'local-fire-department',
    route: '/kitchen-assistant',
    category: 'work',
    accent: 'kitchen',
    availableTo: 'all',
    visibilityKey: 'kitchen',
    requiredJobTitles: ['Busser', 'Chef', 'Kitchen', 'Runner'],
    sizes: ['square'],
  },

  // ═══ LEARN ═══
  {
    id: 'weekly-quizzes',
    labelKey: 'quick_tools.weekly_quizzes',
    iosIcon: 'questionmark.circle.fill',
    androidIcon: 'quiz',
    route: '/weekly-quizzes',
    category: 'learn',
    accent: 'violet',
    availableTo: 'employee',
    gate: 'quizzes',
    sizes: ['square'],
    line: (d, t) => (n(d.quizzesWaiting) != null ? { parts: [{ text: String(d.quizzesWaiting), strong: true }, { text: ' ' + t('favorites.line_waiting') }] } : null),
    attention: (d) => (d.quizzesWaiting ? { badge: d.quizzesWaiting, pulse: true } : null),
  },
  {
    id: 'guides-training',
    labelKey: 'quick_tools.guides_training',
    iosIcon: 'book.fill',
    androidIcon: 'menu-book',
    route: '/guides-and-training',
    category: 'learn',
    accent: 'tint',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => (n(d.guidesNew) != null ? { parts: [{ text: String(d.guidesNew), strong: true }, { text: ' ' + t('favorites.line_new_this_week') }] } : null),
  },
  {
    id: 'events',
    labelKey: 'favorites.events',
    iosIcon: 'calendar.badge.clock',
    androidIcon: 'event-note',
    route: '/view-all-upcoming-events',
    category: 'learn',
    accent: 'violet',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => (d.nextEvent !== undefined ? { parts: d.nextEvent ? [{ text: d.nextEvent, strong: true }] : [{ text: t('favorites.line_no_events') }] } : null),
  },

  // ═══ PLAY ═══
  {
    id: 'rewards',
    labelKey: 'quick_tools.rewards',
    iosIcon: 'star.fill',
    androidIcon: 'star',
    route: 'hub/rewards',
    category: 'play',
    accent: 'gold',
    availableTo: 'employee',
    sizes: ['square'],
    line: (d, t) => {
      if (n(d.bucks) == null) return null;
      const parts: LiveLine['parts'] = [{ text: money(d.bucks!), strong: true }];
      if (d.pendingRedemptions) parts.push({ text: ' · ' + t('favorites.line_pending', { count: d.pendingRedemptions }) });
      return { parts };
    },
  },
  {
    id: 'game-hub',
    labelKey: 'quick_tools.game_hub',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/game-hub',
    category: 'play',
    accent: 'gold',
    availableTo: 'all',
    sizes: ['square'],
    line: (d, t) => {
      if (!d.game) return null;
      return d.game.rank
        ? { parts: [{ text: t('favorites.line_rank') + ' ' }, { text: `#${d.game.rank}`, strong: true }, { text: ` · ${t('favorites.line_best')} ${d.game.score.toLocaleString()}` }] }
        : { parts: [{ text: t('favorites.line_unranked') }] };
    },
  },
  { id: 'memory-game', labelKey: 'quick_tools.memory_game', iosIcon: 'gamecontroller.fill', androidIcon: 'sports-esports', route: '/menu-memory-game', category: 'play', accent: 'azure', availableTo: 'all', sizes: ['square'] },
  { id: 'picture-this', labelKey: 'quick_tools.picture_this', iosIcon: 'photo.fill', androidIcon: 'photo-camera', route: '/picture-this-game', category: 'play', accent: 'azure', availableTo: 'all', sizes: ['square'] },
  { id: 'word-search', labelKey: 'quick_tools.word_search', iosIcon: 'textformat.abc', androidIcon: 'spellcheck', route: '/word-search-game', category: 'play', accent: 'azure', availableTo: 'all', sizes: ['square'] },

  // ═══ MANAGE (O/M) ═══
  {
    id: 'team',
    labelKey: 'favorites.team',
    iosIcon: 'person.2.fill',
    androidIcon: 'people',
    route: 'hub/team',
    category: 'manage',
    accent: 'azure',
    availableTo: 'manager',
    sizes: ['square'],
    line: (d, t) => (n(d.staffCount) != null ? { parts: [{ text: String(d.staffCount), strong: true }, { text: ' ' + t('favorites.line_staff') }] } : null),
  },
  {
    id: 'schedule-approvals',
    labelKey: 'quick_tools.schedule_approvals',
    iosIcon: 'checkmark.circle.fill',
    androidIcon: 'task-alt',
    route: '/schedule-approvals',
    category: 'manage',
    accent: 'gold',
    availableTo: 'manager',
    sizes: ['square', 'wide'],
    facts: [{ key: 'preview', labelKey: 'favorites.fact_appr_preview', hintKey: 'favorites.fact_appr_preview_hint', default: true }],
    line: (d, t) => (d.approvals ? { parts: [{ text: String(d.approvals.waiting), strong: true }, { text: ' ' + t('favorites.line_waiting') }] } : null),
    body: (d, t) => {
      if (!d.approvals) return null;
      return {
        big: String(d.approvals.waiting),
        small: t('favorites.small_requests', { count: d.approvals.waiting }),
        kv: d.approvals.preview.slice(0, 2).map((p, i) => ({ key: 'preview', label: p.split('·')[0]?.trim() || '', value: p.split('·').slice(1).join('·').trim() || p, })).map((x, i) => ({ ...x, key: 'preview' })),
        chip: d.approvals.waiting > 0 ? { label: t('favorites.chip_review'), route: '/schedule-approvals', iosIcon: 'chevron.right', androidIcon: 'chevron-right' } : undefined,
      };
    },
    attention: (d) => (d.approvals && d.approvals.waiting > 0 ? { badge: d.approvals.waiting, pulse: true } : null),
  },
  {
    id: 'announcement-editor',
    labelKey: 'quick_tools.announcement_editor',
    iosIcon: 'megaphone.fill',
    androidIcon: 'campaign',
    route: '/announcement-editor',
    category: 'manage',
    accent: 'tint',
    availableTo: 'manager',
    sizes: ['square'],
    line: (d, t) => (d.announcements ? { parts: [{ text: String(d.announcements.live), strong: true }, { text: ' ' + t('favorites.line_live') }] } : null),
  },
  {
    id: 'schedule-upload',
    labelKey: 'quick_tools.schedule_upload',
    iosIcon: 'arrow.up.doc.fill',
    androidIcon: 'upload-file',
    route: '/schedule-upload',
    category: 'manage',
    accent: 'tint',
    availableTo: 'manager',
    gate: 'schedule_uploads',
    sizes: ['square', 'wide'],
    facts: [
      { key: 'lastScan', labelKey: 'favorites.fact_up_last_scan', default: true },
      { key: 'renews', labelKey: 'favorites.fact_up_renews', default: true },
    ],
    line: (d, t) => (d.uploadCredits ? { parts: [{ text: String(d.uploadCredits.remaining), strong: true }, { text: ' ' + t('favorites.line_credits_left') }] } : null),
    body: (d, t) => {
      if (!d.uploadCredits) return null;
      const kv: LiveBody['kv'] = [];
      if (d.uploadCredits.lastScan) kv.push({ key: 'lastScan', label: t('favorites.kv_last_scan'), value: d.uploadCredits.lastScan });
      if (d.uploadCredits.renews) kv.push({ key: 'renews', label: t('favorites.kv_renews'), value: d.uploadCredits.renews });
      return {
        big: String(d.uploadCredits.remaining),
        small: t('favorites.small_of_max', { max: d.uploadCredits.max }),
        kv,
        chip: { label: t('favorites.chip_scan'), route: '/schedule-upload', iosIcon: 'arrow.up', androidIcon: 'arrow-upward' },
      };
    },
  },
  { id: 'schedules', labelKey: 'quick_tools.schedules', iosIcon: 'calendar.badge.clock', androidIcon: 'edit-calendar', route: '/manual-schedule', category: 'manage', accent: 'tint', availableTo: 'manager', sizes: ['square'] },
  {
    id: 'notification-center',
    labelKey: 'quick_tools.notification_center',
    iosIcon: 'bell.fill',
    androidIcon: 'notifications',
    route: '/notification-center',
    category: 'manage',
    accent: 'tint',
    availableTo: 'manager',
    sizes: ['square'],
    line: (d, t) => (n(d.sentThisWeek) != null ? { parts: [{ text: String(d.sentThisWeek), strong: true }, { text: ' ' + t('favorites.line_sent_this_week') }] } : null),
  },
  {
    id: 'rewards-reviews-editor',
    labelKey: 'quick_tools.rewards_reviews_editor',
    iosIcon: 'star.circle.fill',
    androidIcon: 'stars',
    route: '/rewards-and-reviews-editor',
    category: 'manage',
    accent: 'gold',
    availableTo: 'manager',
    sizes: ['square'],
    line: (d, t) => {
      if (!d.reviews) return null;
      const parts: LiveLine['parts'] = [{ text: String(d.reviews.newCount), strong: true }, { text: ' ' + t('favorites.line_new_reviews') }];
      if (d.reviews.avg != null) parts.push({ text: ` · ${d.reviews.avg.toFixed(1)} ★` });
      return { parts };
    },
    attention: (d) => (d.reviews && d.reviews.newCount > 0 ? { badge: d.reviews.newCount } : null),
  },
  { id: 'quiz-hub-editor', labelKey: 'quick_tools.quiz_hub_editor', iosIcon: 'questionmark.circle.fill', androidIcon: 'quiz', route: '/quiz-hub-editor', category: 'manage', accent: 'violet', availableTo: 'manager', sizes: ['square'] },
  { id: 'guides-training-editor', labelKey: 'quick_tools.guides_training_editor', iosIcon: 'square.and.pencil', androidIcon: 'book', route: '/guides-and-training-editor', category: 'manage', accent: 'tint', availableTo: 'manager', sizes: ['square'] },
  { id: 'menu-editor', labelKey: 'quick_tools.menu_editor', iosIcon: 'fork.knife', androidIcon: 'restaurant', route: '/menu-editor', category: 'manage', accent: 'tint', availableTo: 'manager', sizes: ['square'] },
  { id: 'game-hub-editor', labelKey: 'quick_tools.game_hub_editor', iosIcon: 'gamecontroller.fill', androidIcon: 'sports-esports', route: '/game-hub-editor', category: 'manage', accent: 'azure', availableTo: 'manager', sizes: ['square'] },
  { id: 'special-features-editor', labelKey: 'quick_tools.special_features_editor', iosIcon: 'star.fill', androidIcon: 'star', route: '/special-features-editor', category: 'manage', accent: 'emerald', availableTo: 'manager', sizes: ['square'] },
  { id: 'upcoming-events-editor', labelKey: 'quick_tools.upcoming_events_editor', iosIcon: 'calendar', androidIcon: 'event', route: '/upcoming-events-editor', category: 'manage', accent: 'violet', availableTo: 'manager', sizes: ['square'] },
  { id: 'bartender-assistant-editor', labelKey: 'quick_tools.bartender_assistant_editor', iosIcon: 'wineglass.fill', androidIcon: 'local-bar', route: '/bartender-assistant-editor', category: 'manage', accent: 'bartender', availableTo: 'manager', sizes: ['square'] },
  { id: 'host-assistant-editor', labelKey: 'quick_tools.host_assistant_editor', iosIcon: 'person.2.fill', androidIcon: 'people', route: '/host-assistant-editor', category: 'manage', accent: 'host', availableTo: 'manager', sizes: ['square'] },
  { id: 'kitchen-assistant-editor', labelKey: 'quick_tools.kitchen_assistant_editor', iosIcon: 'flame.fill', androidIcon: 'local-fire-department', route: '/kitchen-assistant-editor', category: 'manage', accent: 'kitchen', availableTo: 'manager', sizes: ['square'] },
  { id: 'org-settings', labelKey: 'favorites.org_settings', iosIcon: 'gearshape.fill', androidIcon: 'settings', route: '/organization-settings', category: 'manage', accent: 'azure', availableTo: 'owner', sizes: ['square'] },
  {
    id: 'subscription',
    labelKey: 'favorites.subscription',
    iosIcon: 'creditcard.fill',
    androidIcon: 'credit-card',
    route: '/subscription-management',
    category: 'manage',
    accent: 'gold',
    availableTo: 'owner',
    sizes: ['square'],
    line: (d) => (d.subscriptionTier ? { parts: [{ text: d.subscriptionTier, strong: true }] } : null),
  },
];

/** Legacy quick-tool ids that were renamed or folded. */
const LEGACY_IDS: Record<string, string> = {
  'employee-hub': 'team',
  'menus-manager': 'menus',
};

export function defForId(id: string): FavoriteDef | undefined {
  const real = LEGACY_IDS[id] ?? id;
  return FAVORITES_CATALOG.find((d) => d.id === real);
}

export function defaultFacts(def: FavoriteDef): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of def.facts ?? []) out[f.key] = f.default;
  return out;
}

/** Which defs a user may pick — role + job titles; gates are applied by the hub at render. */
export function availableFavorites(role: 'employee' | 'manager' | 'owner', jobTitles: string[] = []): FavoriteDef[] {
  const mgr = role === 'manager' || role === 'owner';
  return FAVORITES_CATALOG.filter((d) => {
    if (d.availableTo === 'owner' && role !== 'owner') return false;
    if (d.availableTo === 'manager' && !mgr) return false;
    if (d.availableTo === 'employee' && mgr) return false;
    if (mgr) return true; // managers see every role assistant
    if (d.requiredJobTitles?.length) {
      return jobTitles.some((jt) => d.requiredJobTitles!.some((req) => jt.toLowerCase().includes(req.toLowerCase())));
    }
    return true;
  });
}

/** Parse whatever users.quick_tools holds (v1 array, v2 object, JSON string, null). */
export function parseFavorites(raw: unknown): FavoriteTile[] {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  const tiles: FavoriteTile[] = [];
  const seen = new Set<string>();
  const push = (t: FavoriteTile) => {
    if (seen.has(t.id) || tiles.length >= MAX_FAVORITES) return;
    seen.add(t.id);
    tiles.push(t);
  };
  if (Array.isArray(v)) {
    for (const id of v) {
      if (typeof id !== 'string') continue;
      const def = defForId(id);
      if (def) push({ id: def.id, size: 'square', simple: true, facts: defaultFacts(def) });
    }
    return tiles;
  }
  if (v && typeof v === 'object' && Array.isArray((v as any).tiles)) {
    for (const t of (v as any).tiles) {
      if (!t || typeof t.id !== 'string') continue;
      const def = defForId(t.id);
      if (!def) continue;
      const size: FavoriteSize = t.size === 'wide' && def.sizes.includes('wide') ? 'wide' : 'square';
      const facts = { ...defaultFacts(def), ...(t.facts && typeof t.facts === 'object' ? t.facts : {}) };
      push({ id: def.id, size, simple: !!t.simple, facts });
    }
  }
  return tiles;
}

export function serializeFavorites(tiles: FavoriteTile[]): { v: number; tiles: FavoriteTile[] } {
  return { v: FAVORITES_VERSION, tiles: tiles.slice(0, MAX_FAVORITES) };
}

/** Sample data for the editor's previews and the new-user empty state — clearly illustrative. */
export const SAMPLE_LIVE_DATA: LiveData = {
  unreadMessages: 3,
  quizzesWaiting: 1,
  guidesNew: 2,
  guidesCount: 12,
  tips: { weekTotal: 412, weekShifts: 3, avgPerShift: 137, lastVerdict: null, scheduledToday: true },
  schedule: { hoursThisWeek: 22, shiftsThisWeek: 4, nextShift: 'Thu 4:00 PM', pickUpsOpen: 2 },
  bucks: 42,
  pendingRedemptions: 1,
  game: { rank: 4, score: 1280 },
  staffCount: 14,
  scheduledToday: 9,
  approvals: { waiting: 2, preview: ['Time off · Sam · Sep 20', 'Pick-up · Daisy · Sat patio'] },
  announcements: { live: 3, scheduled: 1 },
  uploadCredits: { remaining: 11, max: 15, lastScan: 'Sep 9', renews: 'Oct 1' },
  sentThisWeek: 2,
  reviews: { newCount: 2, avg: 4.8, count: 61 },
  specialsToday: 4,
  nextEvent: 'Fri · Live jazz',
  roster: { am: 9, pm: 12 },
  subscriptionTier: 'Premium',
};
