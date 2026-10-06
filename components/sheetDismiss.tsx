import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Dimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, type NativeGesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * Swipe-to-dismiss for the glass sheets (s89, app-wide).
 *
 * Before this, GlassSheet had NO swipe at all and GlassHeroSheet only panned
 * from its 34pt grab strip with a 120pt threshold — Steve: "the user has to
 * pull from the grabber or really close to it". Now a downward drag almost
 * anywhere on a sheet pulls it down, the way iOS sheets behave:
 *
 *   • the HEADER zone (grab + title row + pinned header) always drags;
 *   • the BODY drags only while its scrollable is at the top (offset ≤ 0) —
 *     scrolled content keeps scrolling; a drag that begins while scrolled is
 *     the scroll's, and a fresh drag at rest is the sheet's (this is also the
 *     Poster's two-stage pull, now shared);
 *   • a sheet that scrolls its own body (`scroll={false}` hosts) opts its
 *     scrollable in with `useSheetBodyScroll()`; until it does, its body is
 *     left alone and only the header drags (so a nested drag list or wheel
 *     can never be stolen by accident);
 *   • `<SheetNoDragZone>` fences sliders / wheels / resize handles that own
 *     a vertical pan of their own.
 *
 * Mechanics: an RNGH Pan with MANUAL activation on the sheet shell. We decide
 * in onTouchesMove: fail fast on horizontal intent or a scrolled body, activate
 * once the finger has travelled DRAG_START down. Activation cancels the native
 * scroll's touch (the body scroll view runs `bounces={false}`, so an at-top
 * pull has nothing to rubber-band). Release past DISMISS_DISTANCE, or a flick
 * past DISMISS_VELOCITY, slides the shell off (220 ms) and then calls onClose;
 * anything less springs back. Reanimated drives the translate on the UI thread.
 *
 * The Modal still owns presentation: the host sets `animationType='none'`
 * for the dismissal we already animated (the dragDismissingRef contract from
 * GlassHeroSheet) and the scrim tap + ✕ keep working as before.
 */
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DRAG_START = 8;         // pt down before the sheet takes the touch
const H_FAIL = 12;            // pt sideways (and dominant) → not ours
const DISMISS_DISTANCE = 90;  // release past this → close
const DISMISS_VELOCITY = 900; // pt/s flick → close (with a little travel)

type Rect = { x: number; y: number; w: number; h: number };

interface SheetDismissContextValue {
  /** Report a body scrollable's offset (opts the body in for dragging). */
  onBodyScroll: (y: number) => void;
  /**
   * The body scrollable's native gesture — wrap the scrollable in
   * `<GestureDetector gesture={bodyNative}>` so the dismiss pan may run
   * SIMULTANEOUSLY with the native scroll. Without it UIKit lets the scroll
   * view's own recognizer win every touch and the pan never activates (the
   * s89 sim finding).
   */
  bodyNative: NativeGesture;
  /** Register / unregister a rectangle (window coords) the pan must ignore. */
  setNoDragZone: (id: string, rect: Rect | null) => void;
  /** Register the always-draggable header rectangle (window coords). */
  setHeaderZone: (rect: Rect | null) => void;
}

const SheetDismissContext = createContext<SheetDismissContextValue | null>(null);

export interface UseSheetDismissOptions {
  onClose: () => void;
  /** Set true right before onClose when WE animated the exit — the host then renders the Modal with animationType 'none'. */
  dragDismissingRef: React.MutableRefObject<boolean>;
  enabled?: boolean;
  /**
   * The base owns a body scrollable it feeds through `trackBodyScroll` — so
   * the body is draggable from the first frame (a scroll view at rest fires
   * no scroll event, and an untracked body is left alone by design).
   */
  bodyTracked?: boolean;
}

export function useSheetDismiss({ onClose, dragDismissingRef, enabled = true, bodyTracked: bodyTrackedInit = false }: UseSheetDismissOptions) {
  const translateY = useSharedValue(0);
  // Body scroll offset — written from the JS onScroll listener, read on the UI
  // thread in the gesture worklets.
  const bodyOffset = useSharedValue(0);
  const bodyTracked = useSharedValue(bodyTrackedInit);
  useEffect(() => { if (bodyTrackedInit) bodyTracked.value = true; }, [bodyTrackedInit, bodyTracked]);
  const headerZone = useSharedValue<Rect | null>(null);
  const noDragZones = useSharedValue<Rect[]>([]);
  const zonesRef = useRef<Map<string, Rect>>(new Map());

  const finishClose = useCallback(() => {
    dragDismissingRef.current = true;
    onClose();
  }, [onClose, dragDismissingRef]);

  const reset = useCallback(() => {
    translateY.value = 0;
    bodyOffset.value = 0;
    dragDismissingRef.current = false;
  }, [translateY, bodyOffset, dragDismissingRef]);

  const onBodyScroll = useCallback(
    (y: number) => {
      bodyTracked.value = true;
      bodyOffset.value = y;
    },
    [bodyTracked, bodyOffset],
  );

  const setNoDragZone = useCallback(
    (id: string, rect: Rect | null) => {
      if (rect) zonesRef.current.set(id, rect);
      else zonesRef.current.delete(id);
      noDragZones.value = Array.from(zonesRef.current.values());
    },
    [noDragZones],
  );

  const setHeaderZone = useCallback(
    (rect: Rect | null) => {
      headerZone.value = rect;
    },
    [headerZone],
  );

  // Per-touch bookkeeping lives in SHARED values: every gesture callback is a
  // worklet on the UI runtime, where a captured plain object is a frozen copy
  // and a captured plain function cannot be called (it throws, and an uncaught
  // worklet throw aborts the app — the s89 sim crash).
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const inHeader = useSharedValue(false);
  const blocked = useSharedValue(false);

  // The body scrollable's native recognizer. The pan is declared simultaneous
  // with it: at the top (bounces off) the scroll view has nothing to do and
  // the pan moves the sheet; scrolled, the pan fails on its first move and
  // the scroll runs alone.
  const bodyNative = useMemo(() => Gesture.Native(), []);

  const gesture = useMemo(() => {
    const hit = (r: Rect | null, x: number, y: number): boolean => {
      'worklet';
      return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    };

    return Gesture.Pan()
      .enabled(enabled)
      .manualActivation(true)
      .simultaneousWithExternalGesture(bodyNative)
      .onTouchesDown((e, manager) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        downX.value = t.absoluteX;
        downY.value = t.absoluteY;
        let fenced = false;
        const zones = noDragZones.value;
        for (let i = 0; i < zones.length; i++) {
          if (hit(zones[i], t.absoluteX, t.absoluteY)) { fenced = true; break; }
        }
        blocked.value = fenced;
        inHeader.value = hit(headerZone.value, t.absoluteX, t.absoluteY);
        if (fenced) manager.fail();
      })
      .onTouchesMove((e, manager) => {
        'worklet';
        if (blocked.value) return;
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.absoluteX - downX.value;
        const dy = t.absoluteY - downY.value;
        if (Math.abs(dx) > H_FAIL && Math.abs(dx) > Math.abs(dy)) {
          manager.fail();
          return;
        }
        if (dy < -DRAG_START) {
          // Upward intent — the body's scroll (or nothing); never the sheet.
          manager.fail();
          return;
        }
        if (dy > DRAG_START) {
          const bodyMayDrag = bodyTracked.value ? bodyOffset.value <= 0.5 : false;
          if (inHeader.value || bodyMayDrag) manager.activate();
          else manager.fail();
        }
      })
      .onUpdate((e) => {
        'worklet';
        translateY.value = Math.max(0, e.translationY - DRAG_START);
      })
      .onEnd((e) => {
        'worklet';
        const dy = translateY.value;
        const flick = e.velocityY > DISMISS_VELOCITY && dy > 24;
        if (dy > DISMISS_DISTANCE || flick) {
          translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (done) => {
            if (done) runOnJS(finishClose)();
          });
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.8 });
        }
      })
      .onFinalize((_e, success) => {
        'worklet';
        // A cancelled (stolen) drag must never leave the shell displaced.
        if (!success && translateY.value > 0 && translateY.value < SCREEN_HEIGHT) {
          translateY.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.8 });
        }
      });
  }, [enabled, bodyNative, translateY, bodyOffset, bodyTracked, headerZone, noDragZones, downX, downY, inHeader, blocked, finishClose]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const contextValue = useMemo<SheetDismissContextValue>(
    () => ({ onBodyScroll, setNoDragZone, setHeaderZone, bodyNative }),
    [onBodyScroll, setNoDragZone, setHeaderZone, bodyNative],
  );

  /** Attach to the body scrollable's onScroll (JS listener). */
  const trackBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => onBodyScroll(e.nativeEvent.contentOffset.y),
    [onBodyScroll],
  );

  return { gesture, bodyNative, shellStyle, trackBodyScroll, reset, contextValue, SheetDismissProvider: SheetDismissContext.Provider };
}

/** Measures a view in window coordinates after layout. */
function measureRect(ref: React.RefObject<View | null>, cb: (r: Rect | null) => void) {
  const node = ref.current;
  if (!node) return cb(null);
  node.measureInWindow((x, y, w, h) => cb({ x, y, w, h }));
}

/**
 * For a sheet that scrolls its OWN body (`scroll={false}` hosts): spread the
 * returned props on the inner ScrollView / FlatList so the sheet knows when it
 * is at the top and may take a downward drag. Without this the body is left
 * alone (only the header drags).
 */
/** The sheet's body native gesture (null outside a sheet) — for the SheetBody* wrappers. */
export function useSheetBodyNative(): NativeGesture | null {
  const ctx = useContext(SheetDismissContext);
  return ctx?.bodyNative ?? null;
}

export function useSheetBodyScroll() {
  const ctx = useContext(SheetDismissContext);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => ctx?.onBodyScroll(e.nativeEvent.contentOffset.y),
    [ctx],
  );
  // Report "at top" once so the body is draggable before any scroll happens.
  useEffect(() => { ctx?.onBodyScroll(0); }, [ctx]);
  return useMemo(() => ({ onScroll, scrollEventThrottle: 32, bounces: false as const }), [onScroll]);
}

/** The always-draggable header area (the bases use it; hosts never need to). */
export function SheetHeaderZone({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(SheetDismissContext);
  const ref = useRef<View>(null);
  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    // measureInWindow needs the frame to have landed — defer a tick.
    requestAnimationFrame(() => measureRect(ref, (r) => ctx?.setHeaderZone(r)));
  }, [ctx]);
  useEffect(() => () => ctx?.setHeaderZone(null), [ctx]);
  return (
    <View ref={ref} onLayout={onLayout} style={style} collapsable={false}>
      {children}
    </View>
  );
}

let zoneSeq = 0;

/**
 * Fence for a control that owns a vertical pan of its own (hue slider, wheel
 * picker, resize handle, drag list): touches that land inside never drag the
 * sheet. Wrap the control; it measures itself on layout.
 */
export function SheetNoDragZone({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(SheetDismissContext);
  const ref = useRef<View>(null);
  const id = useRef(`z${++zoneSeq}`).current;
  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    requestAnimationFrame(() => measureRect(ref, (r) => ctx?.setNoDragZone(id, r)));
  }, [ctx, id]);
  useEffect(() => () => ctx?.setNoDragZone(id, null), [ctx, id]);
  return (
    <View ref={ref} onLayout={onLayout} style={style} collapsable={false}>
      {children}
    </View>
  );
}
