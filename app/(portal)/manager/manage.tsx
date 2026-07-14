import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  Dimensions,
  Animated,
  Easing,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import WelcomeHeader from '@/components/WelcomeHeader';
import GlassCard from '@/components/GlassCard';
import NotificationDropdown from '@/components/NotificationDropdown';
import ContentDetailModal from '@/components/ContentDetailModal';
import WeatherDetailModal from '@/components/WeatherDetailModal';
import { triggerJolt, setJoltDockTarget, setJoltDockHidden } from '@/components/JoltOverlay';
import ManageEmployeesPane from '@/components/ManageEmployeesPane';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/app/integrations/supabase/client';
import { weeklySpecialsNames } from '@/utils/categoryNames';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { getWeekStartDate, eventFallsOnDate } from '@/utils/dateUtils';
import { fonts } from '@/constants/fonts';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const H_PAD = 16;
const TILE_GAP = 10;
const TILE_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - TILE_GAP) / 2;
const TILE_HEIGHT = 118;
const CHIP_GAP = 8;
const CHIP_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - CHIP_GAP) / 2;

type PaneKey = 'today' | 'tools' | 'employees';
const PANES: PaneKey[] = ['today', 'tools', 'employees'];

interface ActItem {
  key: string;
  icon: string;
  ios: string;
  blue?: boolean;
  text: string;
  ts: number;
}
const MEDALS = ['🥇', '🥈', '🥉'];
const tsOf = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
const agoLabel = (ts: number) => {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

// ===================================================================
// Attention pulse — a gentle, native-driven glow ring drawn over a tile
// that needs setup (mirrors the mockup's @keyframes attn).
// ===================================================================
function AttentionPulse({ active, color, radius = 16 }: { active: boolean; color: string; radius?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  if (!active) return null;
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return <Animated.View pointerEvents="none" style={[styles.pulse, { borderRadius: radius, borderColor: color, shadowColor: color, opacity }]} />;
}

// ===================================================================
// FlipTile — a cockpit card that flips (reanimated-style rotateY) to reveal
// action buttons. Three visual levels via highlight / attention.
// ===================================================================
interface TileButton {
  label: string;
  android: string;
  ios: string;
  primary?: boolean;
  onPress: () => void;
}
interface FlipTileProps {
  colors: ReturnType<typeof useThemeColors>;
  icon?: string;
  ios?: string;
  title?: string;
  headerLeft?: React.ReactNode;
  highlight?: boolean;
  attention?: boolean;
  setupLabel: string;
  backTitle: string;
  buttons: TileButton[];
  children: React.ReactNode;
}
function FlipTile({
  colors,
  icon,
  ios,
  title,
  headerLeft,
  highlight,
  attention,
  setupLabel,
  backTitle,
  buttons,
  children,
}: FlipTileProps) {
  const [flipped, setFlipped] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    Animated.timing(spin, {
      toValue: flipped ? 0 : 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
    setFlipped((f) => !f);
  }, [flipped, spin]);

  const frontRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  // Front face fill: glow > highlight > neutral surface.
  const frontFace = attention
    ? { backgroundColor: colors.tint + '26', borderColor: colors.tint + 'B3' }
    : highlight
    ? { backgroundColor: colors.tint + '12', borderColor: colors.tint + '3D' }
    : { backgroundColor: colors.surface, borderColor: colors.surfaceBorder };

  const headerTextColor = attention ? colors.tint : colors.textSecondary;

  return (
    <View style={styles.tile}>
      <Pressable onPress={toggle} style={styles.tilePress}>
        {/* FRONT */}
        <Animated.View
          pointerEvents={flipped ? 'none' : 'auto'}
          style={[styles.faceWrap, { transform: [{ perspective: 1100 }, { rotateY: frontRotate }] }]}
        >
          <View style={[styles.face, frontFace]}>
            <View style={styles.cth}>
              {headerLeft ?? (
                <>
                  {icon ? (
                    <IconSymbol ios_icon_name={ios as any} android_material_icon_name={icon as any} size={14} color={colors.tint} />
                  ) : null}
                  <Text style={[styles.cthText, { color: headerTextColor }]} numberOfLines={1}>
                    {title}
                  </Text>
                </>
              )}
              {attention ? (
                <View style={[styles.setupCue, { backgroundColor: colors.tint + '2E', borderColor: colors.tint + '66' }]}>
                  <Text style={[styles.setupCueText, { color: colors.tint }]}>{setupLabel}</Text>
                </View>
              ) : (
                <View style={styles.flipHint}>
                  <IconSymbol ios_icon_name="arrow.left.arrow.right" android_material_icon_name="swap-horiz" size={13} color={colors.textSecondary} />
                </View>
              )}
            </View>
            {children}
          </View>
        </Animated.View>

        {/* BACK */}
        <Animated.View
          pointerEvents={flipped ? 'auto' : 'none'}
          style={[styles.faceWrap, { transform: [{ perspective: 1100 }, { rotateY: backRotate }] }]}
        >
          <View style={[styles.face, styles.faceBack, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <TouchableOpacity style={styles.fclose} onPress={toggle} hitSlop={8}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.backh, { color: colors.textSecondary }]}>{backTitle}</Text>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.fbtn,
                  b.primary
                    ? { backgroundColor: colors.primary, borderColor: 'transparent' }
                    : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                ]}
                onPress={b.onPress}
                activeOpacity={0.8}
              >
                <IconSymbol ios_icon_name={b.ios as any} android_material_icon_name={b.android as any} size={13} color={b.primary ? colors.fireText : colors.text} />
                <Text style={[styles.fbtnText, { color: b.primary ? colors.fireText : colors.text }]} numberOfLines={1}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </Pressable>
      {/* Glow ring at the tile level (outside the face's overflow:hidden) so the
          pulsing halo reads clearly around the card. */}
      <AttentionPulse active={!!attention} color={colors.tint} />
    </View>
  );
}

// ===================================================================
// DirectoryChip — an All-Tools entry.
// ===================================================================
interface ChipProps {
  colors: ReturnType<typeof useThemeColors>;
  icon: string;
  ios: string;
  title: string;
  sub: string;
  ownerTag?: string;
  glow?: boolean;
  onPress: () => void;
}
function DirectoryChip({ colors, icon, ios, title, sub, ownerTag, glow, onPress }: ChipProps) {
  const face = glow
    ? { backgroundColor: colors.tint + '17', borderColor: colors.tint + 'B3' }
    : { backgroundColor: colors.surface, borderColor: colors.surfaceBorder };
  return (
    <TouchableOpacity style={[styles.dchip, face]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.gic, { backgroundColor: colors.tint + '26' }]}>
        <IconSymbol ios_icon_name={ios as any} android_material_icon_name={icon as any} size={18} color={colors.tint} />
      </View>
      <View style={styles.dchipBody}>
        <View style={styles.dchipTitleRow}>
          <Text style={[styles.dchipTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {ownerTag ? (
            <View style={[styles.ownerTag, { backgroundColor: colors.blue + '2E', borderColor: colors.blue + '4D' }]}>
              <Text style={[styles.ownerTagText, { color: colors.blueText }]}>{ownerTag}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.dchipSub, { color: colors.textSecondary }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {glow ? <AttentionPulse active color={colors.tint} radius={14} /> : null}
    </TouchableOpacity>
  );
}

// ===================================================================
// Screen
// ===================================================================
export default function ManagerManageScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const { tier, isTrialActive, trialDaysRemaining, hasPremium } = useSubscription();
  const isOwner = user?.role === 'owner';

  // ---- Live tile data (refetched on focus) ----
  const [tiles, setTiles] = useState({
    loaded: false,
    annCount: 0,
    featCount: 0,
    eventCount: 0,
    entCount: 0,
    amCount: 0,
    pmCount: 0,
    myShift: null as string | null,
    hasScheduleThisWeek: false,
    ratingAvg: null as number | null,
    ratingCount: 0,
    reviewsConnected: false,
    menuCount: organization.menu_count,
    itemCount: 0,
    featuredCount: 0,
    staffCount: 0,
    rewardsTop: [] as { name: string; bucks: number }[],
    gamesTop: [] as { name: string; score: number }[],
  });
  const [activity, setActivity] = useState<ActItem[]>([]);
  // All-Tools "more to explore" glow — default seen (no glow) until loaded.
  const [seenChips, setSeenChips] = useState({ assistants: true, guides: true, notifications: true });

  // Google Maps connect prompt (Rating tile setup flow)
  const [gmModalOpen, setGmModalOpen] = useState(false);
  const [gmQuery, setGmQuery] = useState('');
  const [gmSaving, setGmSaving] = useState(false);
  const openGmModal = useCallback(() => {
    setGmQuery(organization.google_maps_query || '');
    setGmModalOpen(true);
  }, [organization.google_maps_query]);

  const isoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtShift = (tStr: string) => {
    const [h, m] = tStr.split(':').map(Number);
    const ap = h >= 12 ? 'p' : 'a';
    const dh = h % 12 || 12;
    return m ? `${dh}:${String(m).padStart(2, '0')}${ap}` : `${dh}${ap}`;
  };

  const loadTileData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const today = new Date();
      const todayIso = isoDate(today);
      const weekStartIso = isoDate(getWeekStartDate(today));
      const next7 = Array.from({ length: 7 }, (_, n) => {
        const d = new Date(today);
        d.setDate(today.getDate() + n);
        return d;
      });
      const wsNames = await weeklySpecialsNames(organizationId).catch(() => [] as string[]);
      const settled = await Promise.allSettled([
        supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true).in('visibility', ['everyone', 'managers']),
        supabase.from('special_features').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
        supabase.from('upcoming_events').select('category, start_date_time, end_date_time').eq('organization_id', organizationId).eq('is_active', true),
        supabase.from('staff_schedules').select('start_time, end_time, user_id').eq('organization_id', organizationId).eq('shift_date', todayIso),
        supabase.from('schedule_uploads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('week_start', weekStartIso),
        supabase.from('google_reviews').select('review_rating').eq('organization_id', organizationId).eq('is_published', true),
        supabase.from('menu_items').select('category, is_weekly_special').eq('organization_id', organizationId).eq('is_active', true),
        getOrgDirectory(user?.id).then((rows) => ({ count: rows.filter((r) => r.is_active).length })),
        getOrgDirectory(user?.id).then((rows) => ({ data: rows.filter((r) => r.is_active).sort((a, b) => (b.mcloones_bucks || 0) - (a.mcloones_bucks || 0)).slice(0, 3) })),
        supabase.rpc('get_master_leaderboard_overall', { p_limit: 3, p_organization_id: organizationId }),
      ]);
      // Resilient extraction — a single failed query degrades to zeros instead
      // of blanking the whole cockpit.
      const val = (i: number): any => (settled[i].status === 'fulfilled' ? (settled[i] as any).value : {});
      const ann = val(0), feat = val(1), eventsRes = val(2), shiftsRes = val(3), uploadRes = val(4), reviewsRes = val(5), itemsRes = val(6), staffRes = val(7), rewardsRes = val(8), gamesRes = val(9);
      const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
      const rewardsTop = (rewardsRes.data || []).map((r: any) => ({ name: firstName(r.name), bucks: r.mcloones_bucks || 0 }));
      const gamesTop = (gamesRes.data || []).map((r: any) => ({ name: firstName(r.name), score: Number(r.total_score) || 0 }));

      const evRows = eventsRes.data || [];
      const inNext7 = (s: string | null, e: string | null) => next7.some((d) => eventFallsOnDate(s, e, d));
      const eventCount = evRows.filter((r: any) => r.category === 'Event' && inNext7(r.start_date_time, r.end_date_time)).length;
      const entCount = evRows.filter((r: any) => r.category === 'Entertainment' && inNext7(r.start_date_time, r.end_date_time)).length;

      const shiftRows = (shiftsRes.data || []).filter((r: any) => !!r.start_time);
      const amCount = shiftRows.filter((r: any) => Number(r.start_time.split(':')[0]) < 12).length;
      const pmCount = shiftRows.filter((r: any) => Number(r.start_time.split(':')[0]) >= 12).length;
      const mine = shiftRows.find((r: any) => r.user_id === user?.id);
      const myShift = mine && mine.end_time ? `${fmtShift(mine.start_time)}–${fmtShift(mine.end_time)}` : null;

      const reviewRows = reviewsRes.data || [];
      const ratingCount = reviewRows.length;
      const ratingAvg = ratingCount ? reviewRows.reduce((s: number, r: any) => s + (r.review_rating || 0), 0) / ratingCount : null;

      const itemRows = itemsRes.data || [];
      const featuredCount = itemRows.filter((r: any) => r.is_weekly_special || wsNames.includes(r.category)).length;

      setTiles({
        loaded: true,
        annCount: ann.count || 0,
        featCount: feat.count || 0,
        eventCount,
        entCount,
        amCount,
        pmCount,
        myShift,
        hasScheduleThisWeek: (uploadRes.count || 0) > 0,
        ratingAvg,
        ratingCount,
        reviewsConnected: !!(organization.google_maps_query && organization.google_maps_query.trim()),
        menuCount: organization.menu_count,
        itemCount: itemRows.length,
        featuredCount,
        staffCount: staffRes.count || 0,
        rewardsTop,
        gamesTop,
      });
    } catch (e) {
      console.error('Manage tile load error', e);
    }
  }, [organizationId, organization.menu_count, organization.google_maps_query, user?.id]);

  // Recent Activity — curated, client-side cross-app feed (distinct from the
  // notification bell). Each source is resilient (allSettled) so one missing
  // table never blanks the feed.
  const loadActivity = useCallback(async () => {
    if (!organizationId) return;
    try {
      const since = new Date();
      since.setDate(since.getDate() - 2);
      const settled = await Promise.allSettled([
        supabase.from('google_reviews').select('review_id, author_title, review_rating, review_datetime_utc').eq('organization_id', organizationId).eq('is_published', true).order('review_datetime_utc', { ascending: false }).limit(3),
        supabase.from('announcements').select('id, title, created_at').eq('organization_id', organizationId).eq('is_active', true).order('created_at', { ascending: false }).limit(3),
        supabase.from('special_features').select('id, title, created_at').eq('organization_id', organizationId).eq('is_active', true).order('created_at', { ascending: false }).limit(2),
        supabase.from('upcoming_events').select('id, title, created_at').eq('organization_id', organizationId).eq('is_active', true).order('created_at', { ascending: false }).limit(2),
        supabase.from('schedule_uploads').select('id, week_start, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1),
        supabase.from('menu_items').select('id, name, created_at').eq('organization_id', organizationId).eq('is_active', true).order('created_at', { ascending: false }).limit(2),
        supabase.from('guides_and_training').select('id, title, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(2),
        supabase.from('exam_results').select('id, completed_at').eq('organization_id', organizationId).not('completed_at', 'is', null).gte('completed_at', since.toISOString()),
      ]);
      const dataOf = (i: number): any[] => (settled[i].status === 'fulfilled' ? (settled[i] as any).value.data || [] : []);
      const items: ActItem[] = [];
      dataOf(0).forEach((r: any) => items.push({ key: 'rev-' + r.review_id, icon: 'star', ios: 'star.fill', blue: true, text: t('manager_manage.act_review_t', { rating: r.review_rating, author: r.author_title || t('manager_manage.act_a_guest', 'a guest'), defaultValue: 'New {{rating}}★ Google review from {{author}}' }), ts: tsOf(r.review_datetime_utc) }));
      dataOf(1).forEach((a: any) => items.push({ key: 'ann-' + a.id, icon: 'campaign', ios: 'megaphone.fill', text: t('manager_manage.act_announcement_t', { title: a.title, defaultValue: 'Announcement "{{title}}" posted' }), ts: tsOf(a.created_at) }));
      dataOf(2).forEach((f: any) => items.push({ key: 'feat-' + f.id, icon: 'star', ios: 'star.fill', text: t('manager_manage.act_feature_t', { title: f.title, defaultValue: 'Special feature "{{title}}" added' }), ts: tsOf(f.created_at) }));
      dataOf(3).forEach((e: any) => items.push({ key: 'evt-' + e.id, icon: 'event', ios: 'calendar', text: t('manager_manage.act_event_t', { title: e.title, defaultValue: 'Event "{{title}}" posted' }), ts: tsOf(e.created_at) }));
      const dl = language === 'es' ? 'es-ES' : 'en-US';
      dataOf(4).forEach((u: any) => {
        const parts = String(u.week_start || '').split('-').map(Number);
        const wk = parts.length === 3 && parts.every((n) => !isNaN(n))
          ? new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(dl, { month: 'short', day: 'numeric' })
          : '';
        items.push({ key: 'sch-' + u.id, icon: 'upload', ios: 'calendar.badge.clock', text: t('manager_manage.act_schedule_t', { week: wk, defaultValue: 'Schedule uploaded — week of {{week}}' }), ts: tsOf(u.created_at) });
      });
      dataOf(5).forEach((m: any) => items.push({ key: 'menu-' + m.id, icon: 'restaurant', ios: 'fork.knife', text: t('manager_manage.act_menu_t', { name: m.name, defaultValue: '{{name}} added to the menu' }), ts: tsOf(m.created_at) }));
      dataOf(6).forEach((g: any) => items.push({ key: 'guide-' + g.id, icon: 'upload-file', ios: 'doc.fill', text: t('manager_manage.act_guide_t', { title: g.title, defaultValue: 'New file "{{title}}" uploaded' }), ts: tsOf(g.created_at) }));
      const exams = dataOf(7);
      if (exams.length) {
        items.push({ key: 'exam', icon: 'sports-esports', ios: 'gamecontroller.fill', text: t('manager_manage.act_quiz_t', { count: exams.length, defaultValue: '{{count}} staff completed a training quiz' }), ts: Math.max(...exams.map((e: any) => tsOf(e.completed_at))) });
      }
      items.sort((a, b) => b.ts - a.ts);
      setActivity(items.slice(0, 8));
    } catch (e) {
      console.error('Manage activity load error', e);
    }
  }, [organizationId, t, language]);

  // useFocusEffect fires on the initial focus (mount) and on every return to
  // the tab — so this is the single load+refresh trigger (no separate mount
  // useEffect, which would double-fetch).
  // "More to explore" glow on Assistants / Guides / Notifications until visited.
  const loadSeen = useCallback(async () => {
    if (!organizationId) return;
    const base = `@manage_seen:${organizationId}:`;
    try {
      const [a, g, n] = await Promise.all([
        AsyncStorage.getItem(base + 'assistants'),
        AsyncStorage.getItem(base + 'guides'),
        AsyncStorage.getItem(base + 'notifications'),
      ]);
      setSeenChips({ assistants: a === '1', guides: g === '1', notifications: n === '1' });
    } catch {}
  }, [organizationId]);
  const markChipSeen = useCallback(
    (k: 'assistants' | 'guides' | 'notifications', route: string) => {
      setSeenChips((s) => ({ ...s, [k]: true }));
      if (organizationId) AsyncStorage.setItem(`@manage_seen:${organizationId}:${k}`, '1').catch(() => {});
      router.push(route as any);
    },
    [organizationId, router]
  );

  // Jolt bolt "fly-in" — the bolt flies up from the nav-corner direction and
  // settles into the search bar each time the manager lands on Manage (the
  // mockup's @keyframes landed). Start at 0 (off-screen/invisible) so there's no
  // first-frame pop at the landed position before the focus effect runs.
  const boltAnim = useRef(new Animated.Value(0)).current;
  const playBoltLand = useCallback(() => {
    boltAnim.setValue(0);
    Animated.timing(boltAnim, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [boltAnim]);

  // Jolt FAB docking: hand the real corner bolt this bar's slot coords so it flies
  // in physically. dockActive hides the static boltAnim placeholder (the FAB sits
  // there instead). If measurement ever fails, dockActive stays false and the
  // boltAnim fly-in remains the safe fallback — the app-wide launcher is untouched.
  const joltIconRef = useRef<any>(null);
  const [dockActive, setDockActive] = useState(false);
  const dockActiveRef = useRef(false);
  const dockHiddenRef = useRef(false);
  // Resets the pager to the top (expanded header) on focus, so the bolt always
  // measures the search bar's EXPANDED slot — never a collapsed/translated-up
  // position from a prior visit. Assigned below where the leaf refs exist.
  const resetCollapseRef = useRef<(() => void) | null>(null);
  const measureAndDock = useCallback(() => {
    if (dockActiveRef.current) return; // already docked this focus
    const node = joltIconRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (!w && !h) return; // not laid out yet
      setJoltDockTarget({ x: x + w / 2, y: y + h / 2 });
      dockActiveRef.current = true;
      setDockActive(true);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    loadTileData();
    loadActivity();
    loadSeen();
    // Return to the top so the header is expanded before we measure the slot
    // (prevents docking to a collapsed/translated-up position on return visits).
    resetCollapseRef.current?.();
    // Try to dock the real FAB into the bar slot (a couple of attempts as layout
    // settles). If docking never takes, fall back to the safe static fly-in so
    // the bar still shows a bolt — the app-wide launcher is never left bare.
    const t1 = setTimeout(measureAndDock, 200);
    const t2 = setTimeout(measureAndDock, 480);
    const tFallback = setTimeout(() => { if (!dockActiveRef.current) playBoltLand(); }, 540);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tFallback);
      // FAB flies back to its corner ONLY on navigation away.
      setJoltDockTarget(null);
      setJoltDockHidden(false);
      dockActiveRef.current = false;
      dockHiddenRef.current = false;
      setDockActive(false);
    };
  }, [loadTileData, loadActivity, loadSeen, playBoltLand, measureAndDock]));

  // Manual Google-review refresh (premium-gated; honors the same path as the
  // Reviews editor). The 10/month cap is a deferred follow-up.
  // Consume one manual refresh (owner-gated, billing-period cap) then fire the
  // async import. The Mon/Thu auto-refresh is free and doesn't count.
  const doRefreshReviews = useCallback(async () => {
    try {
      const { data: cap } = await (supabase as any).rpc('consume_review_refresh', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
      });
      if (!cap?.ok) {
        Alert.alert(
          t('manager_manage.refresh_limit_title', 'No refreshes left'),
          t('manager_manage.refresh_limit_msg', "You've used all your manual refreshes for this subscription period. Reviews still refresh automatically every Monday & Thursday.")
        );
        return;
      }
      Alert.alert(
        t('manager_manage.refresh_started_title', 'Refreshing reviews'),
        t('manager_manage.refresh_started_msg', "We're fetching your latest Google reviews — they'll update on the tile shortly.")
      );
      supabase.functions
        .invoke('import-google-reviews', { body: { source: 'manual', user_id: user?.id, organization_id: organizationId } })
        .then(() => loadTileData())
        .catch((e) => console.warn('[Manage] review refresh failed', e));
    } catch (e) {
      console.warn('[Manage] consume refresh failed', e);
    }
  }, [user?.id, organizationId, t, loadTileData]);

  // Owner-only manual refresh, capped per billing period. Shows the count + the
  // auto-refresh reminder before consuming a credit. Managers never see this.
  const handleRefreshReviews = useCallback(async () => {
    if (!hasPremium) {
      router.push('/subscription-management');
      return;
    }
    if (!isOwner) return;
    let remaining = 0;
    try {
      const { data } = await (supabase as any).rpc('get_review_refresh_quota', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
      });
      if (data?.success) remaining = data.remaining ?? 0;
    } catch {
      // fall through with remaining = 0
    }
    Alert.alert(
      t('manager_manage.refresh_confirm_title', 'Refresh Google Reviews?'),
      t('manager_manage.refresh_confirm_msg', {
        count: remaining,
        defaultValue: `Reviews refresh automatically every Monday & Thursday morning and don't count toward your limit. You have ${remaining} manual refreshes left this subscription period.`,
      }),
      [
        { text: t('common:not_now', 'Not now'), style: 'cancel' },
        { text: t('manager_manage.refresh_now', 'Refresh now'), onPress: () => doRefreshReviews() },
      ]
    );
  }, [hasPremium, isOwner, organizationId, user?.id, t, router, doRefreshReviews]);

  // Save the org's Google Maps location (owner-gated RPC, COALESCE-safe) then
  // import reviews — the Rating tile's "Add Google Maps Location" setup flow.
  const handleSaveGoogleMaps = useCallback(async () => {
    const q = gmQuery.trim();
    if (!q) {
      Alert.alert(t('manager_manage.gm_required_title', 'Location required'), t('manager_manage.gm_required_msg', 'Enter your restaurant name and address as it appears on Google Maps.'));
      return;
    }
    setGmSaving(true);
    try {
      const { data: saveRes, error: saveErr } = await (supabase.rpc as any)('update_organization_settings', {
        p_organization_id: organizationId,
        p_user_id: user?.id,
        p_google_maps_query: q,
      });
      if (saveErr) throw saveErr;
      let parsed: any;
      try {
        parsed = typeof saveRes === 'string' ? JSON.parse(saveRes) : saveRes;
      } catch {
        parsed = null;
      }
      if (!parsed?.success) throw new Error(parsed?.error || 'Save failed');
      await refreshOrganization();
      setGmSaving(false);
      setGmModalOpen(false);
      // Location is saved (fast). The review scrape can be slow / time out
      // server-side, so kick it off in the background — the tile refetches when
      // it lands, and the Mon/Thu auto-refresh + the Refresh button retry it.
      Alert.alert(
        t('manager_manage.gm_saved_title', 'Location saved'),
        t('manager_manage.gm_importing_msg', "Saved! We're importing your Google reviews now — they'll appear on the Rating tile shortly. You can also tap Refresh Reviews anytime.")
      );
      supabase.functions
        .invoke('import-google-reviews', { body: { source: 'manual', user_id: user?.id, organization_id: organizationId } })
        .then(() => loadTileData())
        .catch((e) => console.warn('[Manage] review import failed', e));
      loadTileData();
    } catch (e: any) {
      setGmSaving(false);
      Alert.alert(t('common.error', 'Error'), e?.message || 'Save failed');
    }
  }, [gmQuery, organizationId, user?.id, refreshOrganization, t, loadTileData]);

  // ---- Plan tile copy (derived from subscription state) ----
  const planBig =
    isTrialActive || tier === 'premium'
      ? t('manager_manage.plan_premium', 'Premium')
      : tier === 'base'
      ? t('manager_manage.plan_base', 'Base')
      : tier === 'expired'
      ? t('manager_manage.plan_expired', 'Expired')
      : t('manager_manage.plan_none', 'No Plan');
  const planSub = isTrialActive
    ? t('manager_manage.trial_left', { count: trialDaysRemaining, defaultValue: '{{count}}-day trial left' })
    : tier === 'premium' || tier === 'base'
    ? t('manager_manage.plan_active', 'Active')
    : tier === 'expired'
    ? t('manager_manage.plan_renew', 'Renew your plan')
    : t('manager_manage.plan_choose', 'Choose a plan');

  // ---- Dynamic glow conditions (only after data lands, to avoid a flash) ----
  const L = tiles.loaded;
  const livePostsAttn = L && tiles.annCount === 0 && tiles.featCount === 0;
  // Shifts glow until they have ANY of: employees, shifts, or a schedule.
  const shiftsEmpty = tiles.staffCount === 0 && !tiles.hasScheduleThisWeek && tiles.amCount === 0 && tiles.pmCount === 0;
  const shiftsAttn = L && shiftsEmpty;
  const noScheduleYet = L && !tiles.hasScheduleThisWeek;
  const next7Attn = L && tiles.eventCount === 0 && tiles.entCount === 0;
  const ratingAttn = L && (!tiles.reviewsConnected || tiles.ratingCount === 0);
  const menuAttn = L && tiles.itemCount === 0;
  const planAttn = L && ((isTrialActive && trialDaysRemaining < 3) || tier === 'expired' || tier === 'none');

  const ratingOk = tiles.reviewsConnected && tiles.ratingCount > 0;

  // Directory sub-stat labels
  const dateLocale = language === 'es' ? 'es-ES' : 'en-US';
  const weekLabel = getWeekStartDate(new Date()).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }).toUpperCase();
  const subStat = `${planBig.toUpperCase()}${isTrialActive ? ` · ${trialDaysRemaining}D` : ''}`;

  const [activeTab, setActiveTab] = useState(0); // 0 = today, 1 = tools
  const [activityOpen, setActivityOpen] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [weatherVisible, setWeatherVisible] = useState(false);

  // Notification-shade item → content detail (same modal as the Welcome page).
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    imageUrls?: string[];
    startDateTime?: string | null;
    endDateTime?: string | null;
    priority?: string;
    link?: string | null;
    guideFile?: any;
  } | null>(null);
  const openDetailModal = useCallback((item: NonNullable<typeof selectedItem>) => {
    setSelectedItem(item);
    setDetailVisible(true);
  }, []);

  const pagerRef = useRef<FlatList>(null);
  const todayLeafRef = useRef<any>(null);
  const toolsLeafRef = useRef<any>(null);
  const employeesLeafRef = useRef<any>(null);
  const leafRefs = [todayLeafRef, toolsLeafRef, employeesLeafRef];
  const activeLeafRef = useRef(0);

  // Single shared scroll value drives the collapsing header (Jolt bar slides up
  // and clips; the seg tabs pin). Both leaves write the same scroll-synced
  // offset so the collapsed state carries across a horizontal swipe.
  const manageScrollY = useRef(new Animated.Value(0)).current;
  const [headerAreaHeight, setHeaderAreaHeight] = useState(0);
  const [joltBarHeight, setJoltBarHeight] = useState(64);
  const [segTabsHeight, setSegTabsHeight] = useState(54);
  // Seed with the screen height so the collapse-lock minHeight is in force from
  // the first frame (corrected to the exact pager height on layout).
  const [pagerHeight, setPagerHeight] = useState(SCREEN_HEIGHT);
  const headerHeight = joltBarHeight + segTabsHeight;
  // The collapse transform (Jolt bar slides up as the active leaf scrolls). Used
  // by the fixed overlay AND passed to the Employees pane so its A-Z rail tracks
  // the collapse in lockstep.
  const collapsible = joltBarHeight;
  const overlayTranslate = manageScrollY.interpolate({
    inputRange: [0, Math.max(1, collapsible)],
    outputRange: [0, -collapsible],
    extrapolate: 'clamp',
  });

  // While docked, FADE the bolt out with the search bar when the header collapses
  // and back in when it reappears — it stays put (no fly-to-corner). The bolt only
  // returns to the corner on navigation away (cleared in the focus cleanup above).
  useEffect(() => {
    const id = manageScrollY.addListener(({ value }) => {
      if (!dockActiveRef.current) return;
      const collapsed = value > collapsible * 0.45;
      if (collapsed && !dockHiddenRef.current) {
        setJoltDockHidden(true);
        dockHiddenRef.current = true;
      } else if (!collapsed && dockHiddenRef.current) {
        setJoltDockHidden(false);
        dockHiddenRef.current = false;
      }
    });
    return () => manageScrollY.removeListener(id);
  }, [collapsible, manageScrollY]);

  const goTab = useCallback((index: number) => {
    setActiveTab(index);
    activeLeafRef.current = index;
    pagerRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const onPagerMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveTab(index);
    activeLeafRef.current = index;
  }, []);

  // Update the active seg-tab highlight live as the user swipes across. Also
  // keep activeLeafRef live mid-swipe so the sibling scroll-sync targets the
  // pane the user has crossed into (not just after momentum settles).
  const onPagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      activeLeafRef.current = index;
      if (index !== activeTab) setActiveTab(index);
    },
    [activeTab]
  );

  const makeLeafScroll = (leafIndex: number) =>
    Animated.event([{ nativeEvent: { contentOffset: { y: manageScrollY } } }], {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (activeLeafRef.current !== leafIndex) return;
        const y = e.nativeEvent.contentOffset.y;
        // Keep the other leaves vertically aligned so the collapsed header state
        // carries across a horizontal swipe (no jump).
        leafRefs.forEach((ref, i) => {
          if (i !== leafIndex) ref.current?.scrollTo({ y, animated: false });
        });
      },
    });

  // Reset every leaf + the shared collapse value to the top. Called on focus so
  // the bolt docks to the expanded slot (see resetCollapseRef above).
  resetCollapseRef.current = () => {
    manageScrollY.setValue(0);
    leafRefs.forEach((ref) => ref.current?.scrollTo?.({ y: 0, animated: false }));
  };

  // ---- Cockpit — 6 live flip tiles with dynamic setup-glow ----
  const setUp = t('manager_manage.set_up', 'Set up →');
  const renderCockpit = () => (
    <View style={styles.cock}>
      {/* Live Posts (left) */}
      <FlipTile
        colors={colors}
        icon="campaign"
        ios="megaphone.fill"
        title={t('manager_manage.tile_live_posts', 'Live Posts')}
        attention={livePostsAttn}
        setupLabel={setUp}
        backTitle={t('manager_manage.back_open_editor', 'Open editor')}
        buttons={[
          { label: t('manager_home.announcements', 'Announcements'), android: 'campaign', ios: 'megaphone.fill', primary: true, onPress: () => router.push('/announcement-editor') },
          { label: t('manager_home.special_features', 'Special Features'), android: 'star', ios: 'star.fill', onPress: () => router.push('/special-features-editor') },
        ]}
      >
        <View style={styles.rows2}>
          <View style={styles.r}>
            <Text style={[styles.rb, { color: colors.tint }]}>{tiles.annCount}</Text>
            <Text style={[styles.rt, { color: colors.text }]}>{t('manager_home.announcements', 'Announcements')}</Text>
          </View>
          <View style={styles.r}>
            <Text style={[styles.rb, { color: colors.tint }]}>{tiles.featCount}</Text>
            <Text style={[styles.rt, { color: colors.text }]}>{t('manager_home.special_features', 'Special Features')}</Text>
          </View>
        </View>
      </FlipTile>

      {/* Scheduled Shifts (right, highlighted) */}
      <FlipTile
        colors={colors}
        icon="date-range"
        ios="calendar"
        title={t('manager_manage.tile_shifts', 'Shifts')}
        highlight
        attention={shiftsAttn}
        setupLabel={setUp}
        backTitle={shiftsAttn ? t('manager_manage.back_set_up', 'Set up') : t('manager_manage.back_open', 'Open')}
        buttons={
          shiftsAttn
            ? [
                { label: t('manager_manage.add_employees', 'Add Employees'), android: 'group-add', ios: 'person.badge.plus', primary: true, onPress: () => router.push('/employee-editor') },
                { label: t('manager_manage.add_schedules', 'Add Schedules'), android: 'upload-file', ios: 'calendar.badge.plus', onPress: () => router.push('/manual-schedule') },
              ]
            : [
                { label: t('manager_manage.open_roster', 'Open Roster'), android: 'groups', ios: 'person.3.fill', primary: true, onPress: () => router.push('/todays-roster') },
                { label: t('manager_manage.open_schedules', 'Open Schedules'), android: 'schedule', ios: 'calendar.badge.clock', onPress: () => router.push('/manual-schedule') },
              ]
        }
      >
        <View style={styles.ssBottom}>
          <View style={styles.duo}>
            <View style={styles.di}>
              <IconSymbol ios_icon_name="sun.max.fill" android_material_icon_name="wb-sunny" size={15} color={colors.tint} />
              <Text style={[styles.diB, { color: colors.tint }]}>{tiles.amCount}</Text>
              <Text style={[styles.diSpan, { color: colors.textSecondary }]}>AM</Text>
            </View>
            <View style={styles.di}>
              <IconSymbol ios_icon_name="moon.fill" android_material_icon_name="bedtime" size={15} color={colors.tint} />
              <Text style={[styles.diB, { color: colors.tint }]}>{tiles.pmCount}</Text>
              <Text style={[styles.diSpan, { color: colors.textSecondary }]}>PM</Text>
            </View>
          </View>
          <View style={[styles.myshift, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={13} color={colors.tint} />
            <Text style={[styles.myshiftText, { color: colors.text }]} numberOfLines={1}>
              {noScheduleYet
                ? t('manager_manage.upload_first_schedule', 'Upload your first schedule')
                : tiles.myShift
                ? `${t('manager_manage.your_shift', 'Your shift')} · ${tiles.myShift}`
                : t('manager_manage.off_today', "You're off today")}
            </Text>
          </View>
        </View>
      </FlipTile>

      {/* Next 7 Days (left) */}
      <FlipTile
        colors={colors}
        icon="event"
        ios="calendar"
        title={t('manager_manage.tile_next_7_days', 'Next 7 Days')}
        attention={next7Attn}
        setupLabel={setUp}
        backTitle={t('manager_manage.back_open', 'Open')}
        buttons={[
          { label: t('manager_manage.view_all', 'View All'), android: 'list', ios: 'list.bullet', primary: true, onPress: () => router.push('/view-all-upcoming-events') },
          { label: t('manager_manage.events_editor', 'Events Editor'), android: 'event', ios: 'calendar', onPress: () => router.push('/upcoming-events-editor') },
        ]}
      >
        <View style={styles.rows2}>
          <View style={styles.r}>
            <Text style={[styles.rb, { color: colors.tint }]}>{tiles.eventCount}</Text>
            <Text style={[styles.rt, { color: colors.text }]}>{t('upcoming_events.events', 'Events')}</Text>
          </View>
          <View style={styles.r}>
            <Text style={[styles.rb, { color: colors.tint }]}>{tiles.entCount}</Text>
            <Text style={[styles.rt, { color: colors.text }]}>{t('upcoming_events.entertainment', 'Entertainment')}</Text>
          </View>
        </View>
      </FlipTile>

      {/* Rating (right, highlighted) */}
      <FlipTile
        colors={colors}
        icon="star"
        ios="star.fill"
        title={t('manager_manage.tile_rating', 'Rating')}
        highlight
        attention={ratingAttn}
        setupLabel={setUp}
        backTitle={ratingOk ? t('manager_manage.back_reviews', 'Reviews') : t('manager_manage.back_set_up', 'Set up')}
        buttons={
          ratingOk
            ? [
                { label: t('manager_manage.open_reviews', 'Open Reviews'), android: 'star', ios: 'star.fill', primary: true, onPress: () => router.push({ pathname: '/rewards-and-reviews-editor', params: { tab: 'reviews' } }) },
                ...(isOwner ? [{ label: t('manager_manage.refresh_reviews', 'Refresh Reviews'), android: 'refresh', ios: 'arrow.clockwise', onPress: handleRefreshReviews }] : []),
              ]
            : tiles.reviewsConnected
            ? [
                { label: t('manager_manage.edit_google_maps', 'Edit Location'), android: 'edit-location-alt', ios: 'mappin.and.ellipse', primary: true, onPress: openGmModal },
                ...(isOwner ? [{ label: t('manager_manage.refresh_reviews', 'Refresh Reviews'), android: 'refresh', ios: 'arrow.clockwise', onPress: handleRefreshReviews }] : []),
              ]
            : [
                { label: t('manager_manage.add_google_maps', 'Add Google Maps Location'), android: 'add-location-alt', ios: 'mappin.and.ellipse', primary: true, onPress: openGmModal },
              ]
        }
      >
        <Text style={[styles.bignum, { color: colors.text }]}>
          {ratingOk ? tiles.ratingAvg!.toFixed(1) : '—'}
          {ratingOk ? <Text style={[styles.bignumSmall, { color: colors.textSecondary }]}> ★</Text> : null}
        </Text>
        <Text style={[styles.csub, { color: colors.textSecondary }]}>
          {ratingOk
            ? `${tiles.ratingCount} ${t('manager_manage.google_reviews', 'Google reviews')}`
            : t('manager_manage.connect_reviews', 'Connect Google reviews')}
        </Text>
      </FlipTile>

      {/* Rewards (left) — top-3 bucks leaders */}
      <FlipTile
        colors={colors}
        icon="emoji-events"
        ios="trophy.fill"
        title={t('manager_manage.tile_rewards', 'Rewards')}
        setupLabel={setUp}
        backTitle={t('manager_manage.back_rewards', 'Rewards')}
        buttons={[
          { label: t('manager_manage.open_rewards', 'Open Rewards'), android: 'emoji-events', ios: 'trophy.fill', primary: true, onPress: () => router.push({ pathname: '/rewards-and-reviews-editor', params: { tab: 'rewards' } }) },
        ]}
      >
        <View style={styles.lbRows}>
          {tiles.rewardsTop.length === 0 ? (
            <Text style={[styles.lbEmpty, { color: colors.textSecondary }]}>{t('manager_manage.no_rewards_yet', 'No rewards yet')}</Text>
          ) : (
            tiles.rewardsTop.map((r, i) => (
              <View key={i} style={styles.lbRow}>
                <Text style={styles.lbMedal}>{MEDALS[i]}</Text>
                <Text style={[styles.lbName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[styles.lbVal, { color: colors.tint }]}>{r.bucks.toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>
      </FlipTile>

      {/* Game Hub (right, highlighted) — top-3 leaderboard */}
      <FlipTile
        colors={colors}
        icon="sports-esports"
        ios="gamecontroller.fill"
        title={t('manager_manage.tile_game_hub', 'Game Hub')}
        highlight
        setupLabel={setUp}
        backTitle={t('manager_manage.back_games', 'Games')}
        buttons={[
          { label: t('manager_manage.open_game_hub', 'Game Hub'), android: 'sports-esports', ios: 'gamecontroller.fill', primary: true, onPress: () => router.push('/game-hub') },
          { label: t('manager_manage.game_hub_editor', 'Game Hub Editor'), android: 'edit', ios: 'pencil', onPress: () => router.push('/game-hub-editor') },
        ]}
      >
        <View style={styles.lbRows}>
          {tiles.gamesTop.length === 0 ? (
            <Text style={[styles.lbEmpty, { color: colors.textSecondary }]}>{t('manager_manage.no_games_yet', 'No games played yet')}</Text>
          ) : (
            tiles.gamesTop.map((r, i) => (
              <View key={i} style={styles.lbRow}>
                <Text style={styles.lbMedal}>{MEDALS[i]}</Text>
                <Text style={[styles.lbName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[styles.lbVal, { color: colors.tint }]}>{r.score.toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>
      </FlipTile>

      {/* Menu (left) */}
      <FlipTile
        colors={colors}
        headerLeft={<Text style={[styles.menutop, { color: colors.tint }]}>{tiles.menuCount} {t('manager_manage.menus', 'Menus')}</Text>}
        attention={menuAttn}
        setupLabel={setUp}
        backTitle={t('manager_manage.back_menu', 'Menu')}
        buttons={[
          { label: t('manager_manage.menu_editor', 'Menu Editor'), android: 'restaurant', ios: 'fork.knife', primary: true, onPress: () => router.push('/menu-editor') },
          { label: t('manager_manage.menu_config', 'Menu Config'), android: 'tune', ios: 'slider.horizontal.3', onPress: () => router.push('/organization-settings') },
        ]}
      >
        <Text style={[styles.bignum, { color: colors.text }]}>
          {tiles.itemCount}
          <Text style={[styles.bignumSmall, { color: colors.textSecondary }]}> {t('manager_manage.items', 'items')}</Text>
        </Text>
        <Text style={[styles.csub, { color: colors.textSecondary }]}>
          {tiles.itemCount > 0
            ? `${tiles.featuredCount} ${t('manager_manage.featured_specials', 'Featured Specials')}`
            : t('manager_manage.setup_menu', 'Set up your menu')}
        </Text>
      </FlipTile>

      {/* Plan (right, highlighted) */}
      <FlipTile
        colors={colors}
        icon="workspace-premium"
        ios="crown.fill"
        title={t('manager_manage.tile_plan', 'Plan')}
        highlight
        attention={planAttn}
        setupLabel={setUp}
        backTitle={t('manager_manage.back_manage', 'Manage')}
        buttons={
          isOwner
            ? [
                { label: t('manager_manage.open_org_settings', 'Organization Settings'), android: 'settings', ios: 'gearshape.fill', primary: true, onPress: () => router.push('/organization-settings') },
                { label: t('manager_manage.manage_subscription', 'Manage Subscription'), android: 'credit-card', ios: 'creditcard.fill', onPress: () => router.push('/subscription-management') },
              ]
            : [
                { label: t('manager_manage.manage_subscription', 'Manage Subscription'), android: 'credit-card', ios: 'creditcard.fill', primary: true, onPress: () => router.push('/subscription-management') },
              ]
        }
      >
        {!!organization.name && (
          <Text style={[styles.planOrg, { color: colors.text }]} numberOfLines={1}>{organization.name}</Text>
        )}
        <Text style={[styles.bignum, styles.bignumPlan, { color: colors.text }]}>{planBig}</Text>
        <Text style={[styles.csub, { color: colors.textSecondary }]}>{planSub}</Text>
      </FlipTile>
    </View>
  );

  // ---- Recent Activity — live, collapsed by default ----
  const renderActivity = () => (
    <View style={[styles.activity, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <TouchableOpacity style={styles.acth} onPress={() => setActivityOpen((o) => !o)} activeOpacity={0.7}>
        <View style={[styles.ai, { backgroundColor: colors.tint + '26' }]}>
          <IconSymbol ios_icon_name="waveform.path.ecg" android_material_icon_name="timeline" size={16} color={colors.tint} />
        </View>
        <Text style={[styles.acthTitle, { color: colors.text }]}>{t('manager_manage.recent_activity', 'Recent Activity')}</Text>
        {activity.length > 0 && (
          <View style={[styles.cnt, { backgroundColor: colors.blue }]}>
            <Text style={[styles.cntText, { color: colors.background }]}>{activity.length}</Text>
          </View>
        )}
        <IconSymbol
          ios_icon_name={activityOpen ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={activityOpen ? 'expand-less' : 'expand-more'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {activityOpen &&
        (activity.length === 0 ? (
          <View style={[styles.frow, { borderTopColor: colors.hairline }]}>
            <Text style={[styles.ftText, { color: colors.textSecondary }]}>{t('manager_manage.act_empty', 'No recent activity yet')}</Text>
          </View>
        ) : (
          activity.map((a) => (
            <View key={a.key} style={[styles.frow, { borderTopColor: colors.hairline }]}>
              <View style={[styles.fic, { backgroundColor: (a.blue ? colors.blue : colors.tint) + '24' }]}>
                <IconSymbol ios_icon_name={a.ios as any} android_material_icon_name={a.icon as any} size={14} color={a.blue ? colors.blueText : colors.tint} />
              </View>
              <Text style={[styles.ftText, { color: colors.text }]} numberOfLines={2}>
                {a.text}
              </Text>
              <Text style={[styles.ago, { color: colors.textSecondary }]}>{agoLabel(a.ts)}</Text>
            </View>
          ))
        ))}
    </View>
  );

  // ---- All Tools directory ----
  const renderDirectory = () => (
    <View>
      <Text style={[styles.glabel, { color: colors.tint }]}>{t('manager_manage.group_news_feed', 'News Feed')}</Text>
      <View style={styles.dir}>
        <DirectoryChip colors={colors} icon="campaign" ios="megaphone.fill" title={t('manager_home.announcements', 'Announcements')} sub={`${tiles.annCount} ${t('manager_manage.dir_sub_live', 'LIVE')}`} onPress={() => router.push('/announcement-editor')} />
        <DirectoryChip colors={colors} icon="star" ios="star.fill" title={t('manager_home.special_features', 'Special Features')} sub={`${tiles.featCount} ${t('manager_manage.dir_sub_active', 'ACTIVE')}`} onPress={() => router.push('/special-features-editor')} />
        <DirectoryChip colors={colors} icon="event" ios="calendar" title={t('upcoming_events.events', 'Events')} sub={`${tiles.eventCount} ${t('manager_manage.dir_sub_upcoming', 'UPCOMING')}`} onPress={() => router.push('/upcoming-events-editor')} />
        <DirectoryChip colors={colors} icon="notifications" ios="bell.fill" title={t('manager_manage.grid_notifications', 'Notifications')} sub={t('manager_manage.dir_sub_broadcast', 'BROADCAST')} glow={!seenChips.notifications} onPress={() => markChipSeen('notifications', '/notification-center')} />
      </View>

      <Text style={[styles.glabel, { color: colors.tint }]}>{t('manager_manage.group_team_training', 'Team & Training')}</Text>
      <View style={styles.dir}>
        <DirectoryChip colors={colors} icon="forum" ios="bubble.left.and.bubble.right.fill" title={t('manager_manage.dir_assistants', 'Assistants')} sub={t('manager_manage.dir_sub_roles', '4 ROLES')} glow={!seenChips.assistants} onPress={() => markChipSeen('assistants', '/assistant-editors')} />
        <DirectoryChip colors={colors} icon="menu-book" ios="book.fill" title={t('manager_manage.dir_guides', 'Guides & Training')} sub={t('manager_manage.dir_sub_training', 'TRAINING')} glow={!seenChips.guides} onPress={() => markChipSeen('guides', '/guides-and-training-editor')} />
        <DirectoryChip colors={colors} icon="sports-esports" ios="gamecontroller.fill" title={t('manager_manage.grid_game_hub', 'Game Hub')} sub={t('manager_manage.dir_sub_games', 'GAMES')} onPress={() => router.push('/game-hub-editor')} />
        <DirectoryChip colors={colors} icon="restaurant" ios="fork.knife" title={t('manager_manage.grid_menu', 'Menu Editor')} sub={`${tiles.itemCount} ${t('manager_manage.dir_sub_items', 'ITEMS')}`} onPress={() => router.push('/menu-editor')} />
      </View>

      <Text style={[styles.glabel, styles.glabelOwn, { color: colors.blueText }]}>{t('manager_manage.group_management', 'Management · Owner')}</Text>
      <View style={styles.dir}>
        <DirectoryChip colors={colors} icon="people" ios="person.2.fill" title={t('manager_manage.dir_employees', 'Employees')} sub={`${tiles.staffCount} ${t('manager_manage.dir_sub_staff', 'STAFF')}`} onPress={() => router.push('/employee-editor')} />
        <DirectoryChip colors={colors} icon="event" ios="calendar.badge.clock" title={t('manager_manage.dir_schedules', 'Schedules')} sub={`${t('manager_manage.dir_sub_wk', 'WK')} ${weekLabel}`} onPress={() => router.push('/manual-schedule')} />
        {isOwner && (
          <DirectoryChip colors={colors} icon="settings" ios="gearshape.fill" title={t('manager_manage.dir_org_settings', 'Org Settings')} ownerTag={t('manager_manage.owner_tag', 'Owner')} sub={t('manager_manage.dir_sub_org', 'BRANDING · ACCESS')} onPress={() => router.push('/organization-settings')} />
        )}
        {isOwner && (
          <DirectoryChip colors={colors} icon="credit-card" ios="creditcard.fill" title={t('manager_manage.dir_subscription', 'Subscription')} ownerTag={t('manager_manage.owner_tag', 'Owner')} sub={subStat} onPress={() => router.push('/subscription-management')} />
        )}
      </View>
    </View>
  );

  const renderPane = ({ item }: { item: PaneKey }) => {
    if (item === 'employees') {
      return (
        <ManageEmployeesPane
          width={SCREEN_WIDTH}
          scrollRef={employeesLeafRef}
          onScroll={makeLeafScroll(2)}
          headerHeight={headerHeight}
          minHeight={pagerHeight > 0 ? pagerHeight + joltBarHeight : undefined}
          collapseTranslate={overlayTranslate}
        />
      );
    }
    const leafIndex = item === 'today' ? 0 : 1;
    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <Animated.ScrollView
          ref={item === 'today' ? todayLeafRef : toolsLeafRef}
          style={styles.leaf}
          contentContainerStyle={[
            styles.leafContent,
            // Reserve the overlay height, and guarantee the content is always at
            // least one collapse-distance taller than the viewport so the header
            // can fully collapse AND lock (no rubber-band snap-back / flicker).
            { paddingTop: headerHeight, minHeight: pagerHeight > 0 ? pagerHeight + joltBarHeight : undefined },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          onScroll={makeLeafScroll(leafIndex)}
        >
          {item === 'today' ? (
            <>
              {renderCockpit()}
              {renderActivity()}
            </>
          ) : (
            renderDirectory()
          )}
        </Animated.ScrollView>
      </View>
    );
  };

  // ---- Collapsing header overlay (Jolt bar collapses; seg tabs pin) ----
  const renderOverlay = () => {
    if (headerAreaHeight === 0) return null;
    return (
      <View style={[styles.overlayClip, { top: headerAreaHeight, height: headerHeight }]} pointerEvents="box-none">
        <Animated.View style={{ transform: [{ translateY: overlayTranslate }] }} pointerEvents="box-none">
          {/* Jolt search bar (collapses) */}
          <View onLayout={(e: LayoutChangeEvent) => setJoltBarHeight(e.nativeEvent.layout.height)} style={styles.joltWrap}>
            <GlassCard variant="glass" radius={15} style={styles.joltBar}>
              <Pressable style={styles.joltPress} onPress={triggerJolt}>
                {/* Static slot wrapper — the ref the FAB measures (no transform,
                    so measureInWindow returns the true slot position). The
                    animated bolt inside is the fallback fly-in / placeholder. */}
                <View ref={joltIconRef} style={styles.joltIcon}>
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      styles.joltIconFill,
                      { backgroundColor: colors.tint + '2B' },
                      {
                        // Hidden while the real FAB is docked here (it sits in this
                        // slot instead); otherwise plays the safe fly-in fallback.
                        opacity: dockActive
                          ? 0
                          : boltAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                        transform: [
                          { translateX: boltAnim.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) },
                          { translateY: boltAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) },
                          { scale: boltAnim.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) },
                        ],
                      },
                    ]}
                  >
                    <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={18} color={colors.tint} />
                  </Animated.View>
                </View>
                <Text style={[styles.joltText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('manager_manage.jolt_bar', 'Search or jump to anything…')}
                </Text>
              </Pressable>
            </GlassCard>
          </View>

          {/* Two-tab segmented control (pins) */}
          <View onLayout={(e: LayoutChangeEvent) => setSegTabsHeight(e.nativeEvent.layout.height)} style={styles.segWrap}>
            <GlassCard variant="glass" radius={13} style={styles.seg}>
              {PANES.map((p, i) => {
                const on = activeTab === i;
                const meta =
                  p === 'today'
                    ? { ios: 'square.grid.2x2.fill', android: 'dashboard', label: t('manager_manage.tab_today_glance', 'Command Center') }
                    : p === 'tools'
                    ? { ios: 'square.grid.2x2', android: 'apps', label: t('manager_manage.tab_all_tools', 'All Tools') }
                    : { ios: 'person.2.fill', android: 'people', label: t('manager_manage.tab_employees', 'Employees') };
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.segTab, on && { backgroundColor: colors.primary }]}
                    onPress={() => goTab(i)}
                    activeOpacity={0.8}
                  >
                    <IconSymbol ios_icon_name={meta.ios} android_material_icon_name={meta.android} size={14} color={on ? colors.fireText : colors.textSecondary} />
                    <Text style={[styles.segText, { color: on ? colors.fireText : colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </GlassCard>
          </View>
        </Animated.View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Locked Welcome header (outside the pager) */}
      <View style={styles.headerArea} onLayout={(e: LayoutChangeEvent) => setHeaderAreaHeight(e.nativeEvent.layout.height)}>
        <View style={styles.headerPadding}>
          <WelcomeHeader
            onWeatherPress={() => setWeatherVisible(true)}
            onNotificationPress={() => setNotificationVisible(true)}
          />
        </View>
      </View>

      {/* Two-leaf horizontal pager — content only (header is the fixed overlay) */}
      <FlatList
        ref={pagerRef}
        data={PANES}
        renderItem={renderPane}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        onMomentumScrollEnd={onPagerMomentumEnd}
        scrollEventThrottle={16}
        initialScrollIndex={0}
        onLayout={(e: LayoutChangeEvent) => setPagerHeight(e.nativeEvent.layout.height)}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
      />

      {renderOverlay()}

      <NotificationDropdown
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        onItemPress={openDetailModal}
        visibility="managers"
        isManager
      />

      {selectedItem && (
        <ContentDetailModal
          visible={detailVisible}
          onClose={() => setDetailVisible(false)}
          title={selectedItem.title}
          content={selectedItem.content}
          thumbnailUrl={selectedItem.thumbnailUrl}
          thumbnailShape={selectedItem.thumbnailShape}
          imageUrls={selectedItem.imageUrls}
          startDateTime={selectedItem.startDateTime}
          endDateTime={selectedItem.endDateTime}
          priority={selectedItem.priority}
          link={selectedItem.link}
          guideFile={selectedItem.guideFile}
          colors={{
            text: colors.text,
            textSecondary: colors.textSecondary,
            card: colors.card,
            primary: colors.primary,
            fireText: colors.fireText,
          }}
        />
      )}

      <WeatherDetailModal
        visible={weatherVisible}
        onClose={() => setWeatherVisible(false)}
        language={language}
        colors={{
          text: colors.text,
          textSecondary: colors.textSecondary,
          card: colors.card,
          primary: colors.primary,
          border: colors.border,
        }}
      />

      {/* Google Maps connect prompt — the Rating tile setup flow */}
      <Modal visible={gmModalOpen} transparent animationType="fade" onRequestClose={() => !gmSaving && setGmModalOpen(false)}>
        <Pressable style={styles.gmScrim} onPress={() => !gmSaving && setGmModalOpen(false)}>
          <Pressable style={[styles.gmCard, { backgroundColor: colors.card, borderColor: colors.glassBorder }]} onPress={() => {}}>
            {!isOwner ? (
              /* Owner-gate — only the owner can manage the Google Maps location */
              <View style={styles.gmGate}>
                <View style={[styles.gmHeaderIcon, { backgroundColor: colors.tint + '26' }]}>
                  <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={colors.tint} />
                </View>
                <Text style={[styles.gmGateText, { color: colors.text }]}>
                  {t('manager_manage.gm_owner_only_msg', 'Only the restaurant owner can manage Google Maps Location.')}
                </Text>
                <TouchableOpacity style={[styles.gmBtn, styles.gmBtnPrimary, { backgroundColor: colors.primary }]} onPress={() => setGmModalOpen(false)} activeOpacity={0.8}>
                  <Text style={[styles.gmBtnText, { color: colors.fireText }]}>{t('manager_manage.go_back', 'Go Back')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.gmHeaderRow}>
                  <View style={[styles.gmHeaderIcon, { backgroundColor: colors.tint + '26' }]}>
                    <IconSymbol ios_icon_name="mappin.and.ellipse" android_material_icon_name="add-location-alt" size={18} color={colors.tint} />
                  </View>
                  <Text style={[styles.gmTitle, { color: colors.text }]}>{t('manager_manage.gm_title', 'Connect Google Reviews')}</Text>
                </View>
                <TextInput
                  style={[styles.gmInput, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}
                  value={gmQuery}
                  onChangeText={setGmQuery}
                  placeholder={t('manager_manage.gm_placeholder', 'Restaurant name & address')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  autoFocus
                  editable={!gmSaving}
                />
                <Text style={[styles.gmDesc, { color: colors.textSecondary }]}>
                  {t('manager_manage.gm_desc', "Enter your restaurant's name and address exactly as it appears on Google Maps. We'll import your Google Reviews from this location — saving a new or changed entry imports them right away.")}
                </Text>
                <View style={styles.gmBtns}>
                  <TouchableOpacity style={[styles.gmBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={() => setGmModalOpen(false)} disabled={gmSaving} activeOpacity={0.8}>
                    <Text style={[styles.gmBtnText, { color: colors.text }]}>{t('common.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.gmBtn, styles.gmBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleSaveGoogleMaps} disabled={gmSaving} activeOpacity={0.8}>
                    {gmSaving ? (
                      <ActivityIndicator size="small" color={colors.fireText} />
                    ) : (
                      <Text style={[styles.gmBtnText, { color: colors.fireText }]}>{t('manager_manage.gm_save', 'Search & Save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerArea: { zIndex: 10 },
  headerPadding: { paddingTop: 12, paddingHorizontal: 16 },

  // Collapsing header overlay
  overlayClip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 5 },
  joltWrap: { paddingHorizontal: 16, paddingTop: 0 },
  joltBar: { paddingHorizontal: 14, paddingVertical: 11 },
  joltPress: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  joltIcon: { width: 32, height: 32 },
  joltIconFill: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  joltText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 13.5 },
  segWrap: { paddingHorizontal: 16, paddingTop: 11 },
  seg: { flexDirection: 'row', padding: 4, gap: 4 },
  segTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 9 },
  segText: { fontFamily: fonts.display.semibold, fontSize: 11.5, flexShrink: 1 },

  // Pager leaves
  leaf: { flex: 1 },
  leafContent: { paddingHorizontal: 16, paddingBottom: 150 },

  // Cockpit
  cock: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, marginTop: 12 },
  tile: { width: TILE_WIDTH, height: TILE_HEIGHT },
  tilePress: { width: '100%', height: '100%' },
  faceWrap: { position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden' },
  face: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, overflow: 'hidden', backfaceVisibility: 'hidden' },
  faceBack: { justifyContent: 'center', gap: 7 },
  pulse: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 2, shadowOffset: { width: 0, height: 0 }, shadowRadius: 9, shadowOpacity: 0.9, elevation: 7 },

  cth: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cthText: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase' },
  flipHint: { marginLeft: 'auto', opacity: 0.5 },
  setupCue: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  setupCueText: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase' },

  bignum: { fontFamily: fonts.mono.semibold, fontSize: 26, lineHeight: 28, letterSpacing: -0.5, marginTop: 'auto' },
  bignumPlan: { fontFamily: fonts.display.bold, fontSize: 19, lineHeight: 22 },
  bignumSmall: { fontFamily: fonts.mono.medium, fontSize: 12 },
  csub: { fontFamily: fonts.body.regular, fontSize: 10.5, marginTop: 3 },

  ssBottom: { marginTop: 'auto', gap: 7 },
  duo: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  di: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  diB: { fontFamily: fonts.mono.semibold, fontSize: 23, letterSpacing: -0.5 },
  diSpan: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  myshift: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  myshiftText: { fontFamily: fonts.body.medium, fontSize: 10.5, flex: 1 },

  rows2: { marginTop: 'auto', gap: 5 },
  r: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rb: { fontFamily: fonts.mono.semibold, fontSize: 14, minWidth: 14 },
  rt: { fontFamily: fonts.body.regular, fontSize: 12 },
  menutop: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  // Leaderboard rows (Rewards / Game Hub tiles)
  lbRows: { marginTop: 'auto', gap: 4 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lbMedal: { fontSize: 12 },
  lbName: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12 },
  lbVal: { fontFamily: fonts.mono.semibold, fontSize: 11.5 },
  lbEmpty: { marginTop: 'auto', fontFamily: fonts.body.regular, fontSize: 11 },
  planOrg: { fontFamily: fonts.display.semibold, fontSize: 12.5, marginTop: 2 },

  // Flip back
  fclose: { position: 'absolute', top: 7, right: 9, opacity: 0.6, zIndex: 2 },
  backh: { fontFamily: fonts.mono.medium, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 1 },
  fbtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, borderRadius: 10, borderWidth: 1 },
  fbtnText: { fontFamily: fonts.display.semibold, fontSize: 11 },

  // Recent activity
  activity: { borderWidth: 1, borderRadius: 16, marginTop: 11, overflow: 'hidden' },
  acth: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  ai: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  acthTitle: { flex: 1, fontFamily: fonts.display.bold, fontSize: 14 },
  cnt: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  cntText: { fontFamily: fonts.mono.semibold, fontSize: 9 },
  frow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  fic: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  ftText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12, lineHeight: 16 },
  ago: { fontFamily: fonts.mono.medium, fontSize: 9 },

  // Directory
  glabel: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 15, marginBottom: 9, marginHorizontal: 2 },
  glabelOwn: {},
  dir: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP },
  dchip: { width: CHIP_WIDTH, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  gic: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dchipBody: { flex: 1, minWidth: 0 },
  dchipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dchipTitle: { fontFamily: fonts.display.semibold, fontSize: 13, flexShrink: 1 },
  dchipSub: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 0.3, marginTop: 3 },
  ownerTag: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  ownerTagText: { fontFamily: fonts.mono.semibold, fontSize: 7.5, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Google Maps connect modal
  gmScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  gmCard: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  gmHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gmHeaderIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  gmTitle: { fontFamily: fonts.display.bold, fontSize: 16, flex: 1 },
  gmInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 68, fontFamily: fonts.body.regular, fontSize: 14, textAlignVertical: 'top' },
  gmDesc: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  gmBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  gmBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  gmBtnPrimary: { borderColor: 'transparent' },
  gmBtnText: { fontFamily: fonts.display.semibold, fontSize: 13 },
  gmGate: { alignItems: 'center', gap: 14, paddingVertical: 10 },
  gmGateText: { fontFamily: fonts.display.semibold, fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
