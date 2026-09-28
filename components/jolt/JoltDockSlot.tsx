/**
 * JoltDockSlot — the resting place for the bolt inside a search bar (s87 relay).
 *
 * Drop one into any bar that should hold Jolt. While its screen is focused it
 * measures itself and publishes its window-space center to the store; JoltRoot
 * flies the bolt in and, on landing, hands the bolt to this slot: the slot draws
 * the "mini" bolt (32pt tinted disc) and the root's flyer hides. Blur withdraws
 * the slot, and the root decides what the bolt does next.
 *
 * Resting content is the magnifier, so a bar whose slot never measures (cold
 * start, slow layout) still reads as a search field — never a blank indent.
 *
 * Geometry rule: keep the View UNTRANSFORMED — measureInWindow on a transformed
 * node reports the animated position. Hosts whose chrome collapses pass `hidden`
 * so nothing is flown from an invisible bar.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { openJolt, setJoltSlot, useJoltStore, type JoltSlotKind } from './joltStore';

export const JOLT_MINI_SIZE = 32;

export interface JoltDockSlotProps {
  id: string;
  kind: JoltSlotKind;
  /** Slot box (30 in the search fields, 32 in the Jolt bars). */
  size?: number;
  /** The host's chrome is collapsed/faded. */
  hidden?: boolean;
  /** Magnifier size while resting. */
  iconSize?: number;
}

export default function JoltDockSlot({ id, kind, size = 30, hidden = false, iconSize = 20 }: JoltDockSlotProps) {
  const colors = useThemeColors();
  const owner = useRef({}).current;
  const ref = useRef<View>(null);
  const focusedRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  const publish = useCallback(
    (x: number, y: number) => {
      lastRef.current = { x, y };
      setJoltSlot(owner, { id, kind, x, y, hidden: hiddenRef.current });
    },
    [id, kind, owner]
  );

  // Measure while focused. measureInWindow is async: the focus check inside the
  // callback keeps a late result from re-arming a slot that has since blurred.
  const measure = useCallback(() => {
    if (!focusedRef.current) return;
    const node = ref.current as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (!focusedRef.current) return;
      if (!w && !h) return; // not laid out yet — a later onLayout/retry will land
      const cx = x + w / 2;
      const cy = y + h / 2;
      const last = lastRef.current;
      if (last && Math.abs(last.x - cx) < 0.5 && Math.abs(last.y - cy) < 0.5) return;
      publish(cx, cy);
    });
  }, [publish]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      lastRef.current = null;
      // First try once the push/tab transition has settled, then a couple of
      // layout-settling retries (all idempotent — identical coords are ignored).
      const task = InteractionManager.runAfterInteractions(measure);
      const t1 = setTimeout(measure, 200);
      const t2 = setTimeout(measure, 480);
      return () => {
        task.cancel();
        clearTimeout(t1);
        clearTimeout(t2);
        focusedRef.current = false;
        lastRef.current = null;
        setJoltSlot(owner, null);
      };
    }, [measure, owner])
  );

  // A hidden flip re-publishes the same coords with the flag (no re-measure).
  useEffect(() => {
    if (!focusedRef.current || !lastRef.current) return;
    setJoltSlot(owner, { id, kind, x: lastRef.current.x, y: lastRef.current.y, hidden });
  }, [hidden, id, kind, owner]);

  // ── the resting look ──────────────────────────────────────────────────────
  const docked = useJoltStore((s) => s.docked === id);
  const dockEvent = useJoltStore((s) => s.dockEvent);
  const dockAnim = useRef(new Animated.Value(docked ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [showMini, setShowMini] = useState(docked);

  // JS-driven on purpose (a 32pt disc — the cost is nil): the magnifier's native-driver
  // fade never applied on Android (it kept painting under the mini's translucent disc),
  // and a JS-driven opacity works on both platforms with no attach-order caveats.
  useEffect(() => {
    if (docked) setShowMini(true);
    Animated.timing(dockAnim, {
      toValue: docked ? 1 : 0,
      duration: docked ? 120 : 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !docked) setShowMini(false);
    });
  }, [docked, dockAnim]);

  // Landing pulse: only when the bolt actually flew in (never on a quiet swap).
  const seenEvent = useRef(0);
  useEffect(() => {
    if (!dockEvent || dockEvent.id !== id || dockEvent.n === seenEvent.current) return;
    seenEvent.current = dockEvent.n;
    if (!dockEvent.animate) return;
    pulse.setValue(1);
    Animated.timing(pulse, { toValue: 0, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [dockEvent, id, pulse]);

  const miniScale = Animated.multiply(
    dockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })
  );
  const magOpacity = dockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const styles = useMemo(() => createStyles(size), [size]);

  const mini = (
    <Animated.View
      style={[
        styles.mini,
        { backgroundColor: colors.tint + '2B', opacity: dockAnim, transform: [{ scale: miniScale }] },
      ]}
      pointerEvents={kind === 'field' && docked ? 'auto' : 'none'}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: colors.tint, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.55, 1] }) }] }]}
      />
      <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="bolt" size={18} color={colors.tint} />
    </Animated.View>
  );

  return (
    <View ref={ref} style={styles.slot} onLayout={measure} collapsable={false}>
      {/* ALWAYS mounted. Unmounting it while docked detaches its opacity node from
          `dockAnim` in the same commit the mini mounts — and a value whose last
          consumer detaches STOPS its running animation, so the dock fade died at 0
          and the mini stayed invisible (the s87 emulator pass). */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: magOpacity }]} pointerEvents="none">
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={iconSize} color={colors.textSecondary} />
      </Animated.View>
      {showMini &&
        (kind === 'field' ? (
          // In a local search field the mini bolt is its own tap target → the palette.
          <Pressable onPress={openJolt} hitSlop={8} style={StyleSheet.absoluteFill}>
            {mini}
          </Pressable>
        ) : (
          mini
        ))}
    </View>
  );
}

const createStyles = (size: number) =>
  StyleSheet.create({
    slot: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    center: { alignItems: 'center', justifyContent: 'center' },
    mini: {
      ...StyleSheet.absoluteFill,
      borderRadius: Math.round(size * 0.31),
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      ...StyleSheet.absoluteFill,
      borderRadius: Math.round(size * 0.31),
      borderWidth: 1.5,
    },
  });
