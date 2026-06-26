import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Pressable,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { getAvailableTools } from '@/config/quickTools';
import { fonts } from '@/constants/fonts';

type JoltRole = 'employee' | 'manager';

type JoltType = 'tool' | 'person' | 'menu' | 'event' | 'announcement' | 'feature';

interface JoltResult {
  id: string;
  type: JoltType;
  label: string;
  subtitle?: string;
  iosIcon: string;
  androidIcon: string;
  go: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SIZE = 56;
const FAB_RIGHT = 18;
const FAB_BOTTOM = 118;
const DOCK_SCALE = 32 / FAB_SIZE; // shrink the 56px FAB to the bar's 32px slot

// Lets other surfaces (e.g. the Manage Command Center's Jolt search bar) open
// the palette without prop-drilling. Only the active portal's JoltOverlay is
// mounted, so the registry holds the live instance.
const joltOpeners = new Set<() => void>();
export function triggerJolt() {
  joltOpeners.forEach((open) => open());
}

// Lets the Manage Command Center hand the bolt a docking target — the screen-
// space center of its search-bar bolt slot. When set, the FAB flies from its
// corner into that slot; cleared (null) → it flies back. ONLY Manage uses this,
// gated to that screen's focus + expanded-header state, so the app-wide launcher
// is untouched everywhere else. Mirrors joltOpeners (live active-portal instance).
const joltDockSetters = new Set<(t: { x: number; y: number } | null) => void>();
export function setJoltDockTarget(target: { x: number; y: number } | null) {
  joltDockSetters.forEach((set) => set(target));
}

// Lets Manage fade the docked bolt out WITH the search bar when the header
// collapses (instead of flying it back to the corner) and fade it back in when
// the bar reappears. The bolt only returns to its corner on navigation away
// (Manage clears the dock target on blur).
const joltDockHiddenSetters = new Set<(hidden: boolean) => void>();
export function setJoltDockHidden(hidden: boolean) {
  joltDockHiddenSetters.forEach((set) => set(hidden));
}

/**
 * Jolt — the floating bolt command palette. Mounted as a sibling in each portal
 * _layout so it floats above the tab screens. Tap the bolt → it flies up and
 * lands as the search box's leading icon; the palette searches a client-side,
 * role-filtered index (tools + people + menu/events/announcements/features).
 */
export default function JoltOverlay({ role }: { role: JoltRole }) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<JoltResult[]>([]);
  const [content, setContent] = useState<JoltResult[]>([]);
  const loadedRef = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // FAB docking (Manage only). dockTarget = the bar slot's screen center, or null.
  // dockAnim 0 = corner, 1 = docked; it composes ADDITIVELY with `anim` (palette
  // open), so a tap on the docked bolt flies smoothly dock → palette box.
  const [dockTarget, setDockTarget] = useState<{ x: number; y: number } | null>(null);
  // Last non-null dock coords. Kept even after dockTarget clears so the fly-BACK
  // (dockAnim 1→0) has real coords to animate from — otherwise the distance
  // recomputes to 0 the instant the target clears and the bolt JUMPS to the
  // corner instead of flying. dockAnim=0 pins it to the corner regardless.
  const [dockCoords, setDockCoords] = useState<{ x: number; y: number } | null>(null);
  const dockAnim = useRef(new Animated.Value(0)).current;
  const openStateRef = useRef(open);
  openStateRef.current = open;

  // dockHidden fades the bolt out in place when the Manage header collapses
  // (stays docked, just invisible) and back in when the bar reappears.
  const [dockHidden, setDockHidden] = useState(false);
  const dockHideAnim = useRef(new Animated.Value(1)).current; // 1 = visible, 0 = hidden

  // The FAB's measured resting center (window coords). Measuring beats computing
  // from Dimensions, which mis-handles the safe-area bottom inset and made the
  // bolt land ~30px too low. dockTranslate uses this so it lands exactly on the
  // bar slot (also measured, in the same window coordinate space).
  const fabRef = useRef<any>(null);
  const [fabRest, setFabRest] = useState<{ x: number; y: number } | null>(null);

  const isMgr = role === 'manager';

  // Fly-up geometry: move the bolt from the FAB slot to the search-box icon slot.
  const fabCenterX = SCREEN_W - FAB_RIGHT - FAB_SIZE / 2;
  const fabCenterY = SCREEN_H - FAB_BOTTOM - FAB_SIZE / 2;
  const boxTop = insets.top + 56;
  const iconCenterX = 16 + 7 + 24;
  const iconCenterY = boxTop + 7 + 24;
  const flyX = iconCenterX - fabCenterX;
  const flyY = iconCenterY - fabCenterY;

  // Tools index (static, role-filtered).
  const tools: JoltResult[] = useMemo(() => {
    const jobTitles: string[] =
      (user as any)?.jobTitles || (user?.jobTitle ? [user.jobTitle] : []);
    return getAvailableTools(isMgr ? 'manager' : 'employee', jobTitles).map((tl) => ({
      id: `tool-${tl.id}`,
      type: 'tool' as const,
      label: t(tl.labelKey, tl.id),
      iosIcon: tl.iosIcon,
      androidIcon: tl.androidIcon,
      go: () => router.push(tl.route as any),
    }));
  }, [user, isMgr, t, router]);

  const loadIndex = async () => {
    if (!organizationId || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const homePath = `/(portal)/${role}` as const;
      const tasks: Promise<void>[] = [];

      if (isMgr) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('users')
              .select('id, name, job_title')
              .eq('organization_id', organizationId)
              .eq('is_active', true)
              .order('name', { ascending: true });
            setPeople(
              (data || []).map((u: any) => ({
                id: `person-${u.id}`,
                type: 'person' as const,
                label: u.name,
                subtitle: u.job_title || undefined,
                iosIcon: 'person.fill',
                androidIcon: 'person',
                go: () => router.push({ pathname: '/employee-detail', params: { employeeId: u.id } } as any),
              }))
            );
          })()
        );
      }

      tasks.push(
        (async () => {
          const [menu, events, anns, feats] = await Promise.all([
            supabase.from('menu_items').select('id, name, category').eq('organization_id', organizationId).eq('is_active', true),
            supabase.from('upcoming_events').select('id, title').eq('organization_id', organizationId).eq('is_active', true),
            supabase.from('announcements').select('id, title').eq('organization_id', organizationId).eq('is_active', true),
            supabase.from('special_features').select('id, title').eq('organization_id', organizationId).eq('is_active', true),
          ]);
          const c: JoltResult[] = [];
          (menu.data || []).forEach((m: any) =>
            c.push({ id: `menu-${m.id}`, type: 'menu', label: m.name, subtitle: m.category, iosIcon: 'fork.knife', androidIcon: 'restaurant', go: () => router.push(`/(portal)/${role}/menus` as any) })
          );
          (events.data || []).forEach((e: any) =>
            c.push({ id: `event-${e.id}`, type: 'event', label: e.title, iosIcon: 'calendar', androidIcon: 'event', go: () => router.push({ pathname: homePath as any, params: { openEventId: e.id } }) })
          );
          (anns.data || []).forEach((a: any) =>
            c.push({ id: `ann-${a.id}`, type: 'announcement', label: a.title, iosIcon: 'megaphone.fill', androidIcon: 'campaign', go: () => router.push({ pathname: homePath as any, params: { openAnnouncementId: a.id } }) })
          );
          (feats.data || []).forEach((f: any) =>
            c.push({ id: `feat-${f.id}`, type: 'feature', label: f.title, iosIcon: 'star.fill', androidIcon: 'star', go: () => router.push({ pathname: homePath as any, params: { openFeatureId: f.id } }) })
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

  const allResults = useMemo(() => [...tools, ...people, ...content], [tools, people, content]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allResults
      .filter((r) => r.label.toLowerCase().includes(q) || (r.subtitle || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, allResults]);

  const suggested = useMemo(() => [...tools.slice(0, 3), ...people.slice(0, 2)], [tools, people]);
  const quickChips = tools.slice(0, 5);

  const openJolt = () => {
    setOpen(true);
    loadIndex();
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    // If docked in the Manage bar, release the dock as the palette opens so the
    // additive transforms blend dock → palette box (no jump back to the corner).
    if (dockTarget) {
      Animated.timing(dockAnim, { toValue: 0, duration: 320, useNativeDriver: true }).start();
    }
    setTimeout(() => inputRef.current?.focus(), 340);
  };

  // Register a stable opener (calls the latest openJolt closure) so external
  // surfaces can trigger the palette via triggerJolt().
  const openRef = useRef(openJolt);
  openRef.current = openJolt;
  useEffect(() => {
    const opener = () => openRef.current();
    joltOpeners.add(opener);
    return () => { joltOpeners.delete(opener); };
  }, []);

  // Register the dock-target setter (Manage hands us the bar-slot coords). Cache
  // the coords on the way in so the fly-back keeps a real start point.
  useEffect(() => {
    const set = (t: { x: number; y: number } | null) => {
      setDockTarget(t);
      if (t) setDockCoords(t);
    };
    joltDockSetters.add(set);
    return () => { joltDockSetters.delete(set); };
  }, []);

  // Register the dock-hidden setter (Manage fades the bolt with its collapsing bar).
  useEffect(() => {
    const set = (h: boolean) => setDockHidden(h);
    joltDockHiddenSetters.add(set);
    return () => { joltDockHiddenSetters.delete(set); };
  }, []);

  // Fade the bolt out/in when Manage hides it (collapsed header) — in place, not
  // back to the corner.
  useEffect(() => {
    Animated.timing(dockHideAnim, {
      toValue: dockHidden ? 0 : 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [dockHidden, dockHideAnim]);

  // Measure the FAB's true resting center once (after layout), with retries.
  useEffect(() => {
    let tries = 0;
    const measure = () => {
      const n = fabRef.current;
      if (n && typeof n.measureInWindow === 'function') {
        n.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (w || h) setFabRest({ x: x + w / 2, y: y + h / 2 });
          else if (tries++ < 6) setTimeout(measure, 300);
        });
      } else if (tries++ < 6) {
        setTimeout(measure, 300);
      }
    };
    const t = setTimeout(measure, 350);
    return () => clearTimeout(t);
  }, []);

  // Fly the FAB to/from the dock target when it changes — but NOT while the
  // palette is open (openJolt/closeJolt own dockAnim during open/close). The
  // fly-BACK to the corner is a touch longer for a graceful "return home".
  useEffect(() => {
    if (openStateRef.current) return;
    Animated.timing(dockAnim, {
      toValue: dockTarget ? 1 : 0,
      duration: dockTarget ? 380 : 440,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dockTarget, dockAnim]);

  const closeJolt = () => {
    Keyboard.dismiss();
    Animated.timing(anim, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      setOpen(false);
      setQuery('');
    });
    // Re-dock into the Manage bar if we're still there (target still set).
    if (dockTarget) {
      Animated.timing(dockAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    }
  };

  const pick = (r: JoltResult) => {
    closeJolt();
    setTimeout(() => r.go(), 80);
  };

  const typeLabel = (type: JoltType) =>
    type === 'tool' ? t('jolt.type_tool', 'tool')
    : type === 'person' ? t('jolt.type_person', 'person')
    : type === 'menu' ? t('jolt.type_dish', 'dish')
    : type === 'event' ? t('jolt.type_event', 'event')
    : type === 'announcement' ? t('jolt.type_announcement', 'post')
    : t('jolt.type_feature', 'feature');

  const renderRow = (r: JoltResult) => (
    <TouchableOpacity key={r.id} style={styles.palr} onPress={() => pick(r)} activeOpacity={0.6}>
      <IconSymbol ios_icon_name={r.iosIcon as any} android_material_icon_name={r.androidIcon as any} size={18} color={colors.textSecondary} />
      <View style={styles.palrBody}>
        <Text style={[styles.palrLabel, { color: colors.text }]} numberOfLines={1}>
          {r.label}{r.subtitle ? <Text style={{ color: colors.textSecondary }}>{`  ·  ${r.subtitle}`}</Text> : null}
        </Text>
      </View>
      <Text style={[styles.palrType, { color: colors.textSecondary }]}>{typeLabel(r.type)}</Text>
    </TouchableOpacity>
  );

  const scrimOpacity = anim;
  const boxOpacity = anim;
  const boxTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const flyTranslateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, flyX] });
  const flyTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, flyY] });
  const flyScale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const circleOpacity = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] });

  // Dock = corner → Manage bar slot. Composes additively with the fly-to-box.
  // Use the MEASURED rest center when available (exact landing); fall back to the
  // computed center before the first measurement resolves.
  const fcx = fabRest ? fabRest.x : fabCenterX;
  const fcy = fabRest ? fabRest.y : fabCenterY;
  // Drive the distance off the CACHED coords (persist through the fly-back);
  // dockAnim (0=corner, 1=docked) decides where along that path the bolt sits.
  const dockX = dockCoords ? dockCoords.x - fcx : 0;
  const dockY = dockCoords ? dockCoords.y - fcy : 0;
  const dockTranslateX = dockAnim.interpolate({ inputRange: [0, 1], outputRange: [0, dockX] });
  const dockTranslateY = dockAnim.interpolate({ inputRange: [0, 1], outputRange: [0, dockY] });
  const dockScaleV = dockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, DOCK_SCALE] });
  const fabTranslateX = Animated.add(dockTranslateX, flyTranslateX);
  const fabTranslateY = Animated.add(dockTranslateY, flyTranslateY);
  const fabScale = Animated.multiply(dockScaleV, flyScale);

  return (
    <>
      {/* Command palette */}
      {open && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeJolt} />
          </Animated.View>

          <Animated.View
            style={[
              styles.palbox,
              {
                top: boxTop,
                backgroundColor: colors.background,
                borderColor: colors.glassBorder,
                opacity: boxOpacity,
                transform: [{ translateY: boxTranslate }],
              },
            ]}
          >
            <View style={[styles.palin, { borderBottomColor: colors.hairline }]}>
              <TextInput
                ref={inputRef}
                style={[styles.palinInput, { color: colors.text, fontFamily: fonts.body.regular }]}
                placeholder={t('jolt.placeholder', 'Search anything — people, menu, tools.')}
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.palScroll}>
              {/* Quick tools chips */}
              {quickChips.length > 0 && query.trim().length === 0 && (
                <View style={styles.palqt}>
                  {quickChips.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, { backgroundColor: colors.tint + '1F', borderColor: colors.tint + '3D' }]}
                      onPress={() => pick(c)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, { color: colors.tint }]} numberOfLines={1}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {query.trim().length === 0 ? (
                <>
                  <Text style={[styles.palh, { color: colors.textSecondary }]}>{t('jolt.suggested', 'Suggested')}</Text>
                  {suggested.map(renderRow)}
                </>
              ) : filtered.length === 0 ? (
                <Text style={[styles.palEmpty, { color: colors.textSecondary }]}>{t('jolt.no_results', 'No matches')}</Text>
              ) : (
                filtered.map(renderRow)
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {/* The bolt — FAB that flies up to become the search icon (and docks into
          the Manage bar when given a target). */}
      <Animated.View
        ref={fabRef}
        style={[styles.fab, { opacity: dockHideAnim, transform: [{ translateX: fabTranslateX }, { translateY: fabTranslateY }, { scale: fabScale }] }]}
        pointerEvents={dockHidden ? 'none' : 'box-none'}
      >
        <Pressable onPress={open ? undefined : openJolt} style={styles.fabPress} disabled={open}>
          <Animated.View
            style={[
              styles.fabCircle,
              { backgroundColor: colors.primary, borderColor: colors.ember, opacity: circleOpacity, shadowColor: colors.tint },
            ]}
          />
          <IconSymbol
            ios_icon_name="bolt.fill"
            android_material_icon_name="bolt"
            size={26}
            color={open ? colors.primary : colors.fireText}
          />
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: FAB_RIGHT,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 30,
  },
  fabPress: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 9,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 9, 8, 0.55)',
  },
  palbox: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 7,
    maxHeight: SCREEN_H * 0.62,
    boxShadow: '0px 24px 50px rgba(0, 0, 0, 0.5)',
    elevation: 16,
  },
  palin: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingLeft: 46,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  palinInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  palScroll: {
    marginTop: 4,
  },
  palqt: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 11.5,
  },
  palh: {
    fontFamily: fonts.mono.medium,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 3,
  },
  palr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 11,
  },
  palrBody: {
    flex: 1,
    minWidth: 0,
  },
  palrLabel: {
    fontFamily: fonts.body.medium,
    fontSize: 13.5,
  },
  palrType: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
  },
  palEmpty: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 26,
  },
});
