/**
 * JoltRoot — the ONE bolt (s87 relay). Mounted once in app/_layout.tsx above the
 * navigator, so it survives every push, replace and tab switch. It owns:
 *
 *  • presence — the bolt shows only on chrome routes (joltRoutes; "follows the
 *    BottomNavBar"), fading out in place on everything else;
 *  • flights — home ⇄ bar and bar → bar, native-driver transforms along a
 *    quadratic arc (5-stop interpolations on one eased progress value);
 *  • the palette — anchored on a docked bar (the bar grows into the box, the
 *    bolt never moves) or, from the corner, the classic fly-into-the-box.
 *
 * Steve's locked policy (s87 study, re-tuned on device): PLANTED. Bar → bar in
 * the same spot = nothing moves (a quiet mini-bolt hand-off); a different spot =
 * the old mini fades with its page and the new bar's mini FLASHES in (no glide —
 * "not playing catch-up"); only a destination WITHOUT a bar sends the bolt home,
 * and that flight starts on the tap. Reduce Motion swaps every flight for a
 * cross-fade.
 *
 * The rest state lives in refs (never React state) so re-plans are synchronous:
 *  home | docked (a JoltDockSlot draws the bolt) | parked (waiting for the next
 *  bar to measure) | flying | hidden (a route without Jolt).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, Pressable, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import JoltPalette, { PALETTE_ICON_DY, PALETTE_ICON_X } from './JoltPalette';
import { joltRouteInfo } from './joltRoutes';
import {
  getJoltState,
  registerJoltOpener,
  setJoltDocked,
  setJoltPaletteOpen,
  useJoltStore,
  type JoltSlot,
} from './joltStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SIZE = 56;
const FAB_RIGHT = 18;
const FAB_BOTTOM = 118;
const MINI = 32 / FAB_SIZE;
const SAME_SPOT = 4; // pt — two bars closer than this share a spot: no flight
/** Timings (ms) — the 1× set Steve approved on the motion study. */
const T = { up: 380, home: 360, glide: 360, palette: 320, paletteBack: 240, fade: 160, xfade: 120 };
const SAFETY_MS = 1200; // parked with no bar showing up → go home
const BOX_TOP_EXTRA = 56; // palette box top below the safe area when opened from the corner

type Pose = { x: number; y: number; s: number; m: number }; // window center · scale · face mix (0 FAB, 1 mini)
type Rest = 'home' | 'docked' | 'parked' | 'flying' | 'hidden';
interface Flight { from: Pose; to: Pose; cx: number; cy: number }

const STOPS = [0, 0.25, 0.5, 0.75, 1];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Quadratic arc whose control point sits above the straight line (a rising arc reads best). */
function makeFlight(from: Pose, to: Pose, arc: number): Flight {
  const d = dist(from, to);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  let nx = (to.y - from.y) / (d || 1);
  let ny = -(to.x - from.x) / (d || 1);
  if (ny > 0) { nx = -nx; ny = -ny; }
  return { from, to, cx: mx + nx * arc * d, cy: my + ny * arc * d };
}
function poseAt(f: Flight, t: number): Pose {
  const u = 1 - t;
  return {
    x: u * u * f.from.x + 2 * u * t * f.cx + t * t * f.to.x,
    y: u * u * f.from.y + 2 * u * t * f.cy + t * t * f.to.y,
    s: f.from.s + (f.to.s - f.from.s) * t,
    m: f.from.m + (f.to.m - f.from.m) * t,
  };
}
const still = (p: Pose): Flight => ({ from: p, to: p, cx: p.x, cy: p.y });

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (on) setRm(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setRm(!!v));
    return () => { on = false; sub?.remove?.(); };
  }, []);
  return rm;
}

export default function JoltRoot() {
  const colors = useThemeColors();
  const { user, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const slot = useJoltStore((s) => s.slot);

  const route = useMemo(() => joltRouteInfo(pathname), [pathname]);
  const visible = isAuthenticated && !!user && route.chrome;
  const role: 'manager' | 'employee' = isManagerOrOwner(user) ? 'manager' : 'employee';

  // ── the home corner (measured; computed fallback until the anchor lands) ──
  const anchorRef = useRef<View>(null);
  const [home, setHome] = useState<{ x: number; y: number }>({ x: SCREEN_W - FAB_RIGHT - FAB_SIZE / 2, y: SCREEN_H - FAB_BOTTOM - FAB_SIZE / 2 });
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => {
    let tries = 0;
    let t: any;
    const measure = () => {
      const n = anchorRef.current as any;
      if (n && typeof n.measureInWindow === 'function') {
        n.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (w || h) setHome({ x: x + w / 2, y: y + h / 2 });
          else if (tries++ < 6) t = setTimeout(measure, 300);
        });
      } else if (tries++ < 6) t = setTimeout(measure, 300);
    };
    t = setTimeout(measure, 350);
    return () => clearTimeout(t);
  }, []);
  const homePose = useCallback((): Pose => ({ x: homeRef.current.x, y: homeRef.current.y, s: 1, m: 0 }), []);

  // ── the flyer ──
  const progress = useRef(new Animated.Value(1)).current;
  const presence = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const flyerOpacity = useRef(new Animated.Value(1)).current;
  const [flight, setFlight] = useState<Flight>(() => still({ x: SCREEN_W - FAB_RIGHT - FAB_SIZE / 2, y: SCREEN_H - FAB_BOTTOM - FAB_SIZE / 2, s: 1, m: 0 }));
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const [flyerShown, setFlyerShown] = useState(true);
  const pendingRun = useRef<{ ms: number; done?: () => void } | null>(null);
  const restRef = useRef<Rest>(visible ? 'home' : 'hidden');
  const dockedRef = useRef<JoltSlot | null>(null);
  const parkedRef = useRef<Pose | null>(null);
  const handoffRef = useRef(false); // parked while docked: waiting for the next bar to take the dock
  const safetyRef = useRef<any>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const showFlyer = useCallback((on: boolean, ms = 0) => {
    setFlyerShown(on);
    if (ms > 0) Animated.timing(flyerOpacity, { toValue: on ? 1 : 0, duration: ms, useNativeDriver: true }).start();
    else flyerOpacity.setValue(on ? 1 : 0);
  }, [flyerOpacity]);

  const place = useCallback((p: Pose) => {
    pendingRun.current = null;
    progress.stopAnimation();
    setFlight(still(p));
    progress.setValue(1);
  }, [progress]);

  // Start the pending timing only once the new interpolations are attached
  // (a setValue(0) before commit would flash the old flight's start pose).
  useLayoutEffect(() => {
    const run = pendingRun.current;
    if (!run) return;
    pendingRun.current = null;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: run.ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) run.done?.();
    });
  }, [flight, progress]);

  /** Fly from wherever the flyer is right now to `to` (or cross-fade under Reduce Motion). */
  const travel = useCallback((to: Pose, ms: number, arc: number, done?: () => void) => {
    progress.stopAnimation((v: number) => {
      const cur = poseAt(flightRef.current, Math.max(0, Math.min(1, v)));
      if (reduceMotion) {
        pendingRun.current = null;
        Animated.timing(flyerOpacity, { toValue: 0, duration: T.xfade, useNativeDriver: true }).start(({ finished }) => {
          if (!finished) return;
          setFlight(still(to));
          progress.setValue(1);
          Animated.timing(flyerOpacity, { toValue: 1, duration: T.xfade, useNativeDriver: true }).start(({ finished: f2 }) => { if (f2) done?.(); });
        });
        return;
      }
      pendingRun.current = { ms, done };
      setFlight(makeFlight(cur, to, arc));
    });
  }, [progress, flyerOpacity, reduceMotion]);

  const clearSafety = () => { if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; } };

  // ── rest transitions ──
  const dockAt = useCallback((s: JoltSlot, animate: boolean) => {
    clearSafety();
    dockedRef.current = s;
    parkedRef.current = null;
    handoffRef.current = false;
    restRef.current = 'docked';
    showFlyer(false);
    setJoltDocked(s.id, animate);
  }, [showFlyer]);

  /** The flyer takes over from the slot's mini bolt, in place. */
  const liftFrom = useCallback((s: JoltSlot) => {
    const p: Pose = { x: s.x, y: s.y, s: MINI, m: 1 };
    place(p);
    showFlyer(true);
    setJoltDocked(null);
    dockedRef.current = null;
    return p;
  }, [place, showFlyer]);

  const flyHome = useCallback(() => {
    clearSafety();
    parkedRef.current = null;
    handoffRef.current = false;
    if (dockedRef.current) { setJoltDocked(null); dockedRef.current = null; }
    restRef.current = 'flying';
    travel(homePose(), T.home, 0.16, () => { restRef.current = 'home'; });
  }, [travel, homePose]);

  const flyTo = useCallback((s: JoltSlot, ms: number, arc: number) => {
    clearSafety();
    parkedRef.current = null;
    handoffRef.current = false;
    restRef.current = 'flying';
    travel({ x: s.x, y: s.y, s: MINI, m: 1 }, ms, arc, () => dockAt(s, true));
  }, [travel, dockAt]);

  const restHome = useCallback((fadeMs = 0) => {
    clearSafety();
    parkedRef.current = null;
    handoffRef.current = false;
    if (dockedRef.current) { setJoltDocked(null); dockedRef.current = null; }
    place(homePose());
    showFlyer(true, fadeMs);
    restRef.current = 'home';
  }, [place, homePose, showFlyer]);

  const armSafety = useCallback((ms: number) => {
    clearSafety();
    safetyRef.current = setTimeout(() => {
      safetyRef.current = null;
      if (restRef.current !== 'parked') return;
      if (parkedRef.current) flyHome(); else restHome(T.fade);
    }, ms);
  }, [flyHome, restHome]);

  /**
   * Bar → bar: HAND-OFF. The bolt keeps its dock (the leaving page carries the
   * mini out with it) and waits for the next bar to measure; that bar then either
   * takes the dock quietly (same spot) or flashes its mini in (different spot).
   * The flyer never shows. Bar → no bar: lift and fly home NOW, on the tap.
   */
  const handoff = useCallback(() => {
    parkedRef.current = null;
    handoffRef.current = true;
    restRef.current = 'parked';
    armSafety(SAFETY_MS);
  }, [armSafety]);

  const depart = useCallback((destHasBar: boolean) => {
    const s = dockedRef.current;
    if (!s) return;
    if (destHasBar) { handoff(); return; }
    if (s.hidden) {
      // The bar is collapsed/faded — nothing visible to fly from.
      setJoltDocked(null);
      dockedRef.current = null;
      restHome(T.fade);
      return;
    }
    liftFrom(s);
    flyHome();
  }, [handoff, liftFrom, flyHome, restHome]);

  // ── palette ──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boxTop, setBoxTop] = useState(0);
  const [anchored, setAnchored] = useState(false);
  const paletteFromRef = useRef<'home' | JoltSlot | null>(null);
  const paletteOpenRef = useRef(false);

  const openPalette = useCallback(() => {
    if (paletteOpenRef.current || restRef.current === 'hidden') return;
    const d = dockedRef.current;
    if (restRef.current === 'docked' && d && !d.hidden) {
      // Anchored: the bar grows into the box; the bolt stays exactly where it is.
      setAnchored(true);
      setBoxTop(Math.round(d.y - PALETTE_ICON_DY));
      liftFrom(d);
      paletteFromRef.current = d;
    } else {
      const top = insets.top + BOX_TOP_EXTRA;
      setAnchored(false);
      setBoxTop(top);
      if (restRef.current === 'docked') { setJoltDocked(null); dockedRef.current = null; restHome(); }
      clearSafety();
      parkedRef.current = null;
      paletteFromRef.current = 'home';
      travel({ x: PALETTE_ICON_X, y: top + PALETTE_ICON_DY, s: MINI, m: 1 }, T.palette, 0.14);
    }
    paletteOpenRef.current = true;
    setPaletteOpen(true);
    setJoltPaletteOpen(true);
  }, [insets.top, liftFrom, restHome, travel]);

  const closePalette = useCallback((instant: boolean) => {
    if (!paletteOpenRef.current) return;
    paletteOpenRef.current = false;
    setPaletteOpen(false);
    setJoltPaletteOpen(false);
    const from = paletteFromRef.current;
    paletteFromRef.current = null;
    if (from === 'home') {
      if (instant) restHome();
      else { restRef.current = 'flying'; travel(homePose(), T.paletteBack, 0.14, () => { restRef.current = 'home'; }); }
      return;
    }
    if (from) {
      const cur = getJoltState().slot;
      if (cur && cur.id === from.id) dockAt(cur, false);
      else { parkedRef.current = { x: from.x, y: from.y, s: MINI, m: 1 }; restRef.current = 'parked'; armSafety(900); }
    }
  }, [restHome, travel, homePose, dockAt, armSafety]);

  useEffect(() => {
    registerJoltOpener(openPalette);
    return () => registerJoltOpener(null);
  }, [openPalette]);

  // ── A · presence ──
  useEffect(() => {
    if (!visible) {
      clearSafety();
      if (paletteOpenRef.current) closePalette(true);
      progress.stopAnimation();
      pendingRun.current = null;
      Animated.timing(presence, { toValue: 0, duration: T.fade, useNativeDriver: true }).start();
      if (dockedRef.current) { setJoltDocked(null); dockedRef.current = null; }
      parkedRef.current = null;
      handoffRef.current = false;
      restRef.current = 'hidden';
      return;
    }
    if (restRef.current !== 'hidden') return;
    const s = getJoltState().slot;
    if (routeRef.current.slot) {
      // Wait for the bar to measure, then fade in already docked (effect C);
      // if it never does, fade in at home.
      if (s && !s.hidden) { dockAt(s, false); Animated.timing(presence, { toValue: 1, duration: T.fade, useNativeDriver: true }).start(); return; }
      safetyRef.current = setTimeout(() => {
        safetyRef.current = null;
        if (restRef.current !== 'hidden') return;
        restHome();
        Animated.timing(presence, { toValue: 1, duration: T.fade, useNativeDriver: true }).start();
      }, 900);
      return;
    }
    restHome();
    Animated.timing(presence, { toValue: 1, duration: T.fade, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── B · route change (dispatch time: we know whether the destination has a bar) ──
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    if (!visible) return;
    if (paletteOpenRef.current) closePalette(true);
    const destHasBar = !!route.slot;
    switch (restRef.current) {
      case 'docked': depart(destHasBar); break;
      case 'parked':
        if (destHasBar) armSafety(SAFETY_MS);
        else if (parkedRef.current) flyHome();
        else if (handoffRef.current && dockedRef.current && !dockedRef.current.hidden) { liftFrom(dockedRef.current); flyHome(); } // the bar withdrew first: fly from where it was
        else restHome(T.fade);
        break;
      case 'flying': if (!destHasBar) flyHome(); break;
      default: break; // home: effect C flies up when the bar measures
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, visible]);

  // ── C · the focused bar (its measured center) ──
  useEffect(() => {
    if (paletteOpenRef.current) return; // the palette owns the flyer while open
    if (!slot) {
      // The bar we rest in blurred/unmounted (a route change usually follows):
      // hand off and wait for the next bar.
      if (restRef.current === 'docked') handoff();
      return;
    }
    const prev = dockedRef.current;
    switch (restRef.current) {
      case 'hidden':
        if (visible) { dockAt(slot, false); Animated.timing(presence, { toValue: 1, duration: T.fade, useNativeDriver: true }).start(); }
        break;
      case 'docked':
        if (prev?.id === slot.id) dockedRef.current = slot; // coords / hidden refresh
        else dockAt(slot, !slot.hidden && !(prev && dist(prev, slot) < SAME_SPOT));
        break;
      case 'home':
        if (slot.hidden) dockAt(slot, false); else flyTo(slot, T.up, 0.18);
        break;
      case 'parked': {
        const p = parkedRef.current;
        if (p && !slot.hidden) { flyTo(slot, T.glide, 0.12); break; } // a visible flyer (palette close) still flies in
        const sameSpot = handoffRef.current && !!prev && dist(prev, slot) < SAME_SPOT;
        dockAt(slot, !slot.hidden && !sameSpot); // hand-off: quiet in the same spot, a flash anywhere else
        break;
      }
      case 'flying':
        if (slot.hidden) dockAt(slot, false); else flyTo(slot, T.glide, 0.12);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, visible]);

  // ── render ──
  const xs = STOPS.map((t) => poseAt(flight, t).x - home.x);
  const ys = STOPS.map((t) => poseAt(flight, t).y - home.y);
  const translateX = progress.interpolate({ inputRange: STOPS, outputRange: xs });
  const translateY = progress.interpolate({ inputRange: STOPS, outputRange: ys });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.s, flight.to.s] });
  const mix = progress.interpolate({ inputRange: [0, 1], outputRange: [flight.from.m, flight.to.m] });
  const fabOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1 - flight.from.m, 1 - flight.to.m] });
  const opacity = Animated.multiply(presence, flyerOpacity);
  const interactive = visible && flyerShown && !paletteOpen;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <JoltPalette open={paletteOpen} role={role} boxTop={boxTop} anchored={anchored} onClose={() => closePalette(false)} />
      {/* Invisible twin of the resting FAB: measured once for the true home center. */}
      <View ref={anchorRef} style={styles.fab} pointerEvents="none" collapsable={false} />
      <Animated.View
        style={[styles.fab, { opacity, transform: [{ translateX }, { translateY }, { scale }] }]}
        pointerEvents={interactive ? 'box-none' : 'none'}
      >
        <Pressable onPress={openPalette} style={styles.press} disabled={!interactive}>
          <Animated.View style={[styles.fabCircle, { backgroundColor: colors.primary, borderColor: colors.ember, shadowColor: colors.tint, opacity: fabOpacity }]} />
          <Animated.View style={[styles.miniFace, { backgroundColor: colors.tint + '2B', opacity: mix }]}>
            <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={31} color={colors.tint} />
          </Animated.View>
          <Animated.View style={{ opacity: fabOpacity }}>
            <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={26} color={colors.fireText} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: FAB_RIGHT, bottom: FAB_BOTTOM, width: FAB_SIZE, height: FAB_SIZE, zIndex: 30 },
  press: { width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  fabCircle: {
    ...StyleSheet.absoluteFill,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 9,
  },
  miniFace: { ...StyleSheet.absoluteFill, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
