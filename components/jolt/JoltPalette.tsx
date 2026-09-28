/**
 * JoltPalette — the command palette (s87 glass refresh).
 *
 * Rendered by JoltRoot only. The root owns the bolt and tells the palette where
 * to sit: `boxTop` is the box's window-space top and `anchored` means the box
 * grew out of a docked Jolt bar (the bolt never moved), so the box fades and
 * grows in place instead of sliding down.
 *
 * Index (loaded once per session on first open): the favorites catalog (tools),
 * jolt-only tools (approvals · AI menu upload), people, menu items AND the
 * recipe-fed libations (both menus), posts, and the Settings entries. Results
 * group under mono eyebrows; icon discs wear their family hue; Recent replaces
 * Suggested once there is history; aliases in both languages (joltKeywords).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { availableFavorites } from '@/config/favorites';
import { favoriteAccent, AZURE_HUE, GOLD_HUE, TEAM_HUE, hexToRgba } from '@/components/profile/profileVisuals';
import { ASSISTANT_HUES } from '@/components/tools/toolsVisuals';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { fonts } from '@/constants/fonts';
import { JOLT_KEYWORDS } from './joltKeywords';

export type JoltRole = 'employee' | 'manager';
type JoltKind = 'person' | 'menu' | 'tool' | 'post' | 'setting';
type JoltSub = 'dish' | 'drink' | 'event' | 'announcement' | 'feature';

interface JoltResult {
  id: string;
  kind: JoltKind;
  sub?: JoltSub;
  label: string;
  subtitle?: string;
  keywords?: string;
  hue: string;
  iosIcon: string;
  androidIcon: string;
  go: () => void;
}

const SCREEN_H = Dimensions.get('window').height;
const KIND_ORDER: JoltKind[] = ['person', 'menu', 'tool', 'post', 'setting'];
const SLATE = '#5B6270';
const RECENT_KEY = '@jolt_recent:v1';
const RECENT_MAX = 6;
/** Box padding + half the input row: the bolt's slot center sits this far below the box top. */
export const PALETTE_ICON_DY = 7 + 24;
/** Window x of the bolt's slot center inside the box (box left 16 + padding 7 + half of 46). */
export const PALETTE_ICON_X = 16 + 7 + 23;

const fold = (s: string) => {
  const lower = (s || '').toLowerCase();
  try {
    return lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    return lower;
  }
};

export interface JoltPaletteProps {
  open: boolean;
  role: JoltRole;
  boxTop: number;
  anchored: boolean;
  onClose: () => void;
}

export default function JoltPalette({ open, role, boxTop, anchored, onClose }: JoltPaletteProps) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const scheme: 'dark' | 'light' = resolvedMode === 'dark' ? 'dark' : 'light';
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const router = useRouter();
  const { t } = useTranslation();
  const { open: openMiniProfile } = useMiniProfile();

  const [mounted, setMounted] = useState(open);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<JoltKind | 'all'>('all');
  const [people, setPeople] = useState<JoltResult[]>([]);
  const [content, setContent] = useState<JoltResult[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const loadedRef = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(1)).current; // anchored: 0 = bar-sized, 1 = full
  const inputRef = useRef<TextInput>(null);
  const isMgr = role === 'manager';
  const portal = isMgr ? '/(portal)/manager' : '/(portal)/employee';
  const nonce = () => String(Date.now());

  // ── static index: tools + settings (role-filtered) ─────────────────────────
  const staticIndex: JoltResult[] = useMemo(() => {
    const jobTitles: string[] = (user as any)?.jobTitles || (user?.jobTitle ? [user.jobTitle] : []);
    const resolve = (route: string): any => {
      switch (route) {
        case 'hub/rewards': return '/(portal)/employee/rewards';
        case 'hub/schedule-tab': return { pathname: portal, params: { tab: 'schedule' } };
        case 'hub/menus': return `${portal}/menus`;
        case 'hub/team': return { pathname: '/(portal)/manager/manage', params: { pane: 'employees' } };
        default: return route;
      }
    };
    const tools: JoltResult[] = availableFavorites((user?.role as any) || 'employee', jobTitles).map((tl) => {
      const id = `tool-${tl.id}`;
      return {
        id,
        kind: 'tool' as const,
        // Steve's ask: "staff" / "employees" must land on the Manage Employees pane.
        label: tl.id === 'team' ? t('jolt.employees') : t(tl.labelKey, tl.id),
        keywords: JOLT_KEYWORDS[id],
        hue: favoriteAccent(tl.accent, colors, scheme),
        iosIcon: tl.iosIcon,
        androidIcon: tl.androidIcon,
        go: () => router.push(resolve(tl.route)),
      };
    });
    const extra: JoltResult[] = [];
    if (isMgr) {
      extra.push(
        { id: 'jolt-approvals', kind: 'tool', label: t('jolt.approvals'), keywords: JOLT_KEYWORDS['jolt-approvals'], hue: GOLD_HUE[scheme], iosIcon: 'checkmark.seal.fill', androidIcon: 'verified', go: () => router.push('/manager-approvals' as any) },
        { id: 'jolt-menu-upload', kind: 'tool', label: t('menu_upload.title'), keywords: JOLT_KEYWORDS['jolt-menu-upload'], hue: colors.tint, iosIcon: 'doc.viewfinder', androidIcon: 'document-scanner', go: () => router.push('/menu-upload' as any) },
      );
    }
    const settingsPath = t('jolt.settings_path');
    const toSettings = (open: string) => () => router.push({ pathname: `${portal}/profile`, params: { tab: 'settings', open, ts: nonce() } } as any);
    const settings: JoltResult[] = [
      { id: 'jolt-appearance', kind: 'setting', label: t('settings.appearance'), subtitle: settingsPath, keywords: JOLT_KEYWORDS['jolt-appearance'], hue: SLATE, iosIcon: 'paintpalette.fill', androidIcon: 'palette', go: () => router.push('/appearance' as any) },
      { id: 'jolt-notifications', kind: 'setting', label: t('profile_hub.tile_notifications'), subtitle: settingsPath, keywords: JOLT_KEYWORDS['jolt-notifications'], hue: SLATE, iosIcon: 'bell.fill', androidIcon: 'notifications', go: toSettings('notifications') },
      { id: 'jolt-password', kind: 'setting', label: t('profile_hub.tile_password'), subtitle: settingsPath, keywords: JOLT_KEYWORDS['jolt-password'], hue: SLATE, iosIcon: 'key.fill', androidIcon: 'vpn-key', go: toSettings('password') },
      { id: 'jolt-language', kind: 'setting', label: t('settings.language'), subtitle: settingsPath, keywords: JOLT_KEYWORDS['jolt-language'], hue: SLATE, iosIcon: 'globe', androidIcon: 'language', go: toSettings('language') },
    ];
    return [...tools, ...extra, ...settings];
  }, [user, isMgr, portal, t, router, colors, scheme]);

  // ── live index: people · menu (+ libations) · posts ────────────────────────
  const loadIndex = async () => {
    // !user?.id: logout race — an empty actor reaches get_menu_items as uuid '' (22P02).
    if (!organizationId || !user?.id || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const homePath = `/(portal)/${role}` as const;
      const menusPath = `${portal}/menus`;
      const goItem = (id: string) => () => router.push({ pathname: menusPath, params: { openItem: id, ts: nonce() } } as any);
      const tasks: Promise<void>[] = [];
      tasks.push(
        (async () => {
          const data = (await getOrgDirectory(user.id))
            .filter((r) => r.is_active)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setPeople(
            (data || []).map((u: any) => ({
              id: `person-${u.id}`,
              kind: 'person' as const,
              label: u.name,
              subtitle: (Array.isArray(u.job_titles) && u.job_titles.length > 0 ? u.job_titles.join(' · ') : u.job_title) || undefined,
              hue: TEAM_HUE[scheme],
              iosIcon: 'person.fill',
              androidIcon: 'person',
              go: () => openMiniProfile(u.id),
            }))
          );
        })()
      );
      tasks.push(
        (async () => {
          const [menu, winter, summer, events, anns, feats] = await Promise.all([
            supabase.rpc('get_menu_items', { p_actor_id: user.id }),
            supabase.rpc('get_libation_recipes', { p_actor_id: user.id }),
            supabase.rpc('get_summer_libation_recipes', { p_actor_id: user.id }),
            supabase.rpc('get_upcoming_events', { p_actor_id: user.id }),
            supabase.rpc('get_announcements', { p_actor_id: user.id }),
            supabase.rpc('get_special_features', { p_actor_id: user.id }),
          ]);
          const c: JoltResult[] = [];
          (menu.data || []).forEach((m: any) =>
            c.push({ id: `menu-${m.id}`, kind: 'menu', sub: 'dish', label: m.name, subtitle: [m.category, m.subcategory].filter(Boolean).join(' › '), hue: colors.tint, iosIcon: 'fork.knife', androidIcon: 'restaurant', go: goItem(m.id) })
          );
          // Recipe-fed libations: the SAME synthetic ids MenuDisplay injects (lr- / slr-),
          // so the pick lands on the exact menu row and opens its sheet.
          const drink = (prefix: 'lr' | 'slr') => (r: any) =>
            c.push({ id: `menu-${prefix}-${r.id}`, kind: 'menu', sub: 'drink', label: r.name, subtitle: [r.category, r.subcategory].filter(Boolean).join(' › '), keywords: 'cocktail drink libation coctel bebida', hue: ASSISTANT_HUES.bartender[scheme], iosIcon: 'wineglass.fill', androidIcon: 'local-bar', go: goItem(`${prefix}-${r.id}`) });
          (winter.data || []).forEach(drink('lr'));
          (summer.data || []).forEach(drink('slr'));
          (events.data || []).forEach((e: any) =>
            c.push({ id: `event-${e.id}`, kind: 'post', sub: 'event', label: e.title, hue: AZURE_HUE[scheme], iosIcon: 'calendar', androidIcon: 'event', go: () => router.push({ pathname: homePath as any, params: { openEventId: e.id } }) })
          );
          (anns.data || []).forEach((a: any) =>
            c.push({ id: `ann-${a.id}`, kind: 'post', sub: 'announcement', label: a.title, hue: colors.tint, iosIcon: 'megaphone.fill', androidIcon: 'campaign', go: () => router.push({ pathname: homePath as any, params: { openAnnouncementId: a.id } }) })
          );
          (feats.data || []).forEach((f: any) =>
            c.push({ id: `feat-${f.id}`, kind: 'post', sub: 'feature', label: f.title, hue: GOLD_HUE[scheme], iosIcon: 'star.fill', androidIcon: 'star', go: () => router.push({ pathname: homePath as any, params: { openFeatureId: f.id } }) })
          );
          setContent(c);
        })()
      );
      await Promise.all(tasks);
    } catch (e) {
      console.error('Jolt index error', e);
      loadedRef.current = false;
    }
  };

  const allResults = useMemo(() => [...staticIndex, ...people, ...content], [staticIndex, people, content]);
  const byId = useMemo(() => new Map(allResults.map((r) => [r.id, r])), [allResults]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return allResults
      .filter((r) => (kind === 'all' || r.kind === kind) && (fold(r.label).includes(q) || fold(r.subtitle || '').includes(q) || (r.keywords || '').includes(q)))
      .slice(0, 60);
  }, [query, kind, allResults]);

  const recent = useMemo(() => recentIds.map((id) => byId.get(id)).filter((r): r is JoltResult => !!r), [recentIds, byId]);
  const suggested = useMemo(() => [...staticIndex.filter((r) => r.kind === 'tool').slice(0, 3), ...people.slice(0, 2)], [staticIndex, people]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((raw) => {
      if (!raw) return;
      try { const ids = JSON.parse(raw); if (Array.isArray(ids)) setRecentIds(ids.filter((x) => typeof x === 'string')); } catch {}
    }).catch(() => {});
  }, []);
  const remember = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const clearRecent = useCallback(() => {
    setRecentIds([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  }, []);

  // ── open / close choreography ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setMounted(true);
      loadIndex();
      grow.setValue(anchored ? 0 : 1);
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: anchored ? 220 : 320, useNativeDriver: true }),
        Animated.timing(grow, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
      const f = setTimeout(() => inputRef.current?.focus(), 340);
      return () => clearTimeout(f);
    }
    Keyboard.dismiss();
    // Unmount unconditionally: an interrupted close (a reload, a reopen mid-fade)
    // used to leave the invisible full-screen scrim mounted, eating every tap.
    // A reopen flips `open` and re-runs the branch above, which remounts it.
    Animated.timing(anim, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      setMounted(false);
      setQuery('');
      setKind('all');
    });
    const fallback = setTimeout(() => setMounted(false), 400);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (r: JoltResult) => {
    remember(r.id);
    onClose();
    setTimeout(() => r.go(), 80);
  };

  const kindLabel = (k: JoltKind) =>
    k === 'person' ? t('jolt.kind_people') : k === 'menu' ? t('jolt.kind_menu') : k === 'tool' ? t('jolt.kind_tools') : k === 'post' ? t('jolt.kind_posts') : t('jolt.kind_settings');
  const typeLabel = (r: JoltResult) =>
    r.kind === 'tool' ? t('jolt.type_tool')
    : r.kind === 'person' ? t('jolt.type_person')
    : r.kind === 'setting' ? t('jolt.type_setting')
    : r.kind === 'menu' ? (r.sub === 'drink' ? t('jolt.type_drink') : t('jolt.type_dish'))
    : r.sub === 'event' ? t('jolt.type_event')
    : r.sub === 'announcement' ? t('jolt.type_announcement')
    : t('jolt.type_feature');

  // Match highlight: the matched run of the label in the tint.
  const renderLabel = (label: string) => {
    const q = fold(query.trim());
    const i = q ? fold(label).indexOf(q) : -1;
    if (i < 0) return <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>;
    return (
      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
        {label.slice(0, i)}
        <Text style={{ color: colors.tint, fontFamily: fonts.body.semibold }}>{label.slice(i, i + q.length)}</Text>
        {label.slice(i + q.length)}
      </Text>
    );
  };

  const renderRow = (r: JoltResult) => (
    <TouchableOpacity key={r.id} style={styles.row} onPress={() => pick(r)} activeOpacity={0.6}>
      <View style={[styles.disc, { backgroundColor: hexToRgba(r.hue, 0.16) }]}>
        <IconSymbol ios_icon_name={r.iosIcon as any} android_material_icon_name={r.androidIcon as any} size={16} color={r.hue} />
      </View>
      <View style={styles.rowBody}>
        {renderLabel(r.label)}
        {!!r.subtitle && <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>{r.subtitle}</Text>}
      </View>
      <Text style={[styles.rowType, { color: colors.textSecondary }]}>{typeLabel(r)}</Text>
    </TouchableOpacity>
  );

  const eyebrow = (label: string, action?: { label: string; onPress: () => void }) => (
    <View style={styles.eyebrowRow} key={`eb-${label}`}>
      <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.eyebrowLine, { backgroundColor: colors.hairline }]} />
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.eyebrowAction, { color: colors.tint }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );

  if (!mounted) return null;

  const boxTranslate = anchored ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const maxHeight = grow.interpolate({ inputRange: [0, 1], outputRange: [62, SCREEN_H * 0.62] });
  const q = query.trim();
  const kinds: (JoltKind | 'all')[] = ['all', ...KIND_ORDER];

  let body: React.ReactNode;
  if (!q) {
    body = recent.length > 0
      ? <>{eyebrow(t('jolt.recent'), { label: t('jolt.clear'), onPress: clearRecent })}{recent.map(renderRow)}</>
      : <>{eyebrow(t('jolt.suggested'))}{suggested.map(renderRow)}</>;
  } else if (filtered.length === 0) {
    body = <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('jolt.no_results')}</Text>;
  } else {
    body = KIND_ORDER.map((k) => {
      const g = filtered.filter((r) => r.kind === k);
      if (!g.length) return null;
      return <View key={k}>{eyebrow(kindLabel(k))}{g.map(renderRow)}</View>;
    });
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View style={[styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      {/* Outer node: native-driven opacity/transform. Inner node: the JS-driven
          grow (maxHeight) — the two drivers must never share one Animated.View. */}
      <Animated.View style={[styles.box, { top: boxTop, opacity: anim, transform: [{ translateY: boxTranslate }] }]}>
        <Animated.View style={[styles.grow, { maxHeight }]}>
          <GlassCard variant="glass" radius={20} androidBaseAlpha={0.98} style={styles.card}>
            <View style={[styles.inputRow, { borderBottomColor: colors.hairline }]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.text, fontFamily: fonts.body.regular }]}
                placeholder={t('jolt.placeholder')}
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {q.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8} style={[styles.clearBtn, { backgroundColor: colors.glass }]}>
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={11} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.kinds}>
              {kinds.map((k) => {
                const on = kind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[styles.kindChip, { backgroundColor: on ? hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#F99861', 0.12) : colors.glass, borderColor: on ? hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#F99861', 0.24) : colors.glassBorder }]}
                  >
                    <Text style={[styles.kindChipText, { color: on ? colors.tint : colors.textSecondary }]}>{k === 'all' ? t('jolt.kind_all') : kindLabel(k)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.results} contentContainerStyle={styles.resultsContent}>
              {body}
            </ScrollView>
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 9, 8, 0.55)' },
  box: { position: 'absolute', left: 16, right: 16, boxShadow: '0px 24px 50px rgba(0, 0, 0, 0.5)', elevation: 16, borderRadius: 20 },
  grow: { overflow: 'hidden', borderRadius: 20 },
  card: { padding: 7 },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: 46, paddingRight: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  clearBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kinds: { flexDirection: 'row', gap: 6, paddingHorizontal: 5, paddingTop: 9, paddingBottom: 4 },
  kindChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 11, borderWidth: 1 },
  kindChipText: { fontFamily: fonts.display.semibold, fontSize: 11.5 },
  results: { marginTop: 2 },
  resultsContent: { paddingBottom: 6 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 3 },
  eyebrow: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase' },
  eyebrowLine: { flex: 1, height: StyleSheet.hairlineWidth },
  eyebrowAction: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12 },
  disc: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: fonts.body.medium, fontSize: 13.5 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1 },
  rowType: { fontFamily: fonts.mono.medium, fontSize: 10 },
  empty: { fontFamily: fonts.mono.medium, fontSize: 12, textAlign: 'center', paddingVertical: 26 },
});
