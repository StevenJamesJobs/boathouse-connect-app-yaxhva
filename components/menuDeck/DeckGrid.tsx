import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * The Deck (s88) — the menu categories as a two-column grid of tiles.
 *
 * REORDER: press and hold a tile to start the wiggle and pick it up in one
 * motion; while the deck wiggles a short hold picks up any tile and a tap
 * anywhere (tile or background) ends the wiggle. The dragged
 * tile follows the finger, the others slide out of its way, and the order is
 * handed to the host when the tile is let go.
 *
 * Built on Reanimated + RNGH (both already in the app): react-native-
 * draggable-flatlist, the app's other drag surface, only sorts single-column
 * lists. Everything that moves is a shared value on the UI thread —
 *   order      the ids in their current slots
 *   activeId   the tile under the finger (null at rest)
 *   trans*     the finger's travel since the grab
 * and a resting tile's position is always derived from its index in `order`,
 * so there is exactly one source of truth for where a tile belongs.
 */

export const DECK_TILE_H = 116;
export const DECK_GAP = 9;
const SLIDE = { duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
const HOLD_MS = 380; // at rest: a deliberate press-and-hold
const HOLD_WIGGLE_MS = 120; // wiggling: a touch that lingers drags, a flick still scrolls
const EDGE = 70; // auto-scroll band at the top / bottom of the viewport
const EDGE_STEP = 9; // px per frame while inside the band

export interface DeckTileModel {
  id: string;
  name: string;
  color: string;
  builtIn: boolean;
  /** Live item count — omitted on "Not in use" tiles, which carry no number. */
  count?: number;
  /** The quiet line under the number: subcategory names, or what a built-in is for. */
  line: string;
}

/** Scroll plumbing the host owns (the grid lives inside the page's ScrollView). */
export interface DeckScroll {
  ref: AnimatedRef<Animated.ScrollView>;
  offset: SharedValue<number>;
  /** Visible height of the scroll view, less whatever floats over its foot. */
  viewportH: SharedValue<number>;
  contentH: SharedValue<number>;
  /** The grid's top edge inside the scroll content. */
  gridTop: SharedValue<number>;
}

interface DeckGridProps {
  colors: ThemeColorSet;
  tiles: DeckTileModel[];
  /** Measured width of the grid's container. */
  width: number;
  wiggle: boolean;
  itemsLabel: string;
  scroll: DeckScroll;
  onPressTile: (id: string) => void;
  /** A tile was picked up (the host enters wiggle mode and locks the page scroll). */
  onGrab: () => void;
  /** The tile was let go; `orderedIds` is the deck's order now, `movedId` the tile. */
  onDrop: (orderedIds: string[], movedId: string) => void;
}

const slotX = (index: number, w: number) => {
  'worklet';
  return (index % 2) * (w + DECK_GAP);
};
const slotY = (index: number) => {
  'worklet';
  return Math.floor(index / 2) * (DECK_TILE_H + DECK_GAP);
};

// ─── The tile face — shared by the deck and the "Not in use" shelf ───────────
export function DeckTileFace({
  colors,
  tile,
  order,
  itemsLabel,
  lifted,
}: {
  colors: ThemeColorSet;
  tile: DeckTileModel;
  /** 1-based position pill; omitted on shelf tiles. */
  order?: number;
  itemsLabel: string;
  /** The tile is under the finger: an opaque ground so nothing reads through. */
  lifted?: boolean;
}) {
  return (
    <View
      style={[
        styles.face,
        {
          backgroundColor: lifted ? colors.card : colors.glass,
          borderColor: lifted ? colors.primary : colors.glassBorder,
        },
        lifted && styles.faceLifted,
      ]}
    >
      <LinearGradient
        colors={[tile.color, tile.color + '4D', 'transparent']}
        locations={[0, 0.34, 0.68]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fade}
        pointerEvents="none"
      />
      {order !== undefined && (
        <View style={[styles.orderPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.orderText, { color: colors.textSecondary }]}>{order}</Text>
        </View>
      )}
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {tile.name}
        </Text>
        {tile.builtIn && (
          <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={10} color={colors.textSecondary} />
        )}
      </View>
      {tile.count !== undefined && (
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: colors.primary }]}>{tile.count}</Text>
          <Text style={[styles.countLabel, { color: colors.textSecondary }]}>{itemsLabel}</Text>
        </View>
      )}
      <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={2}>
        {tile.line}
      </Text>
    </View>
  );
}

// ─── One draggable tile ───────────────────────────────────────────────────────
interface TileProps {
  colors: ThemeColorSet;
  tile: DeckTileModel;
  index: number;
  liveOrder: number;
  lifted: boolean;
  w: number;
  wiggle: boolean;
  reduceMotion: boolean;
  itemsLabel: string;
  order: SharedValue<string[]>;
  activeId: SharedValue<string | null>;
  transX: SharedValue<number>;
  transY: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  startScroll: SharedValue<number>;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  onPress: (id: string) => void;
  onGrab: (id: string) => void;
  onRelease: (orderedIds: string[], movedId: string) => void;
}

const Tile = memo(function Tile({
  colors,
  tile,
  index,
  liveOrder,
  lifted,
  w,
  wiggle,
  reduceMotion,
  itemsLabel,
  order,
  activeId,
  transX,
  transY,
  startX,
  startY,
  startScroll,
  dragX,
  dragY,
  scrollOffset,
  onPress,
  onGrab,
  onRelease,
}: TileProps) {
  const id = tile.id;
  const x = useSharedValue(slotX(index, w));
  const y = useSharedValue(slotY(index));
  const rot = useSharedValue(0);

  // A resting tile lives in the slot its index names. The first run (mount, or
  // a new width) snaps; every later change slides.
  useAnimatedReaction(
    () => ({ idx: order.value.indexOf(id), active: activeId.value === id }),
    (cur, prev) => {
      if (cur.idx < 0 || cur.active) return;
      const tx = slotX(cur.idx, w);
      const ty = slotY(cur.idx);
      if (!prev) {
        x.value = tx;
        y.value = ty;
        return;
      }
      x.value = withTiming(tx, SLIDE);
      y.value = withTiming(ty, SLIDE);
    },
    [w, id],
  );

  useEffect(() => {
    if (wiggle && !reduceMotion) {
      rot.value = withDelay(
        index % 2 ? 120 : 0,
        withRepeat(
          withSequence(withTiming(-0.9, { duration: 170 }), withTiming(0.9, { duration: 170 })),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(rot);
      rot.value = withTiming(0, { duration: 120 });
    }
    // index only staggers the phase — a re-ordered tile need not restart its wiggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiggle, reduceMotion, rot]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activateAfterLongPress(wiggle ? HOLD_WIGGLE_MS : HOLD_MS)
      .onStart(() => {
        // Start values first — the derived drag position reads them the moment
        // activeId flips.
        startX.value = x.value;
        startY.value = y.value;
        startScroll.value = scrollOffset.value;
        transX.value = 0;
        transY.value = 0;
        activeId.value = id;
        runOnJS(onGrab)(id);
      })
      .onUpdate((e) => {
        if (activeId.value !== id) return;
        transX.value = e.translationX;
        transY.value = e.translationY;
      })
      .onFinalize(() => {
        // Fires for a press that never became a drag too.
        if (activeId.value !== id) return;
        // Hand the finger's position to the resting values, THEN let go — the
        // slide home starts from where the tile actually is.
        x.value = dragX.value;
        y.value = dragY.value;
        activeId.value = null;
        runOnJS(onRelease)(order.value, id);
      });
    // A tap while the deck wiggles is the host's exit (iPhone-style: tap
    // anywhere to stop the wiggle) — it never opens the sheet.
    const tap = Gesture.Tap()
      .maxDuration(300)
      .onEnd((_e, ok) => {
        if (ok) runOnJS(onPress)(id);
      });
    return Gesture.Exclusive(pan, tap);
  }, [wiggle, id, x, y, startX, startY, startScroll, scrollOffset, transX, transY, activeId, dragX, dragY, order, onGrab, onRelease, onPress]);

  const outer = useAnimatedStyle(() => {
    const active = activeId.value === id;
    return {
      zIndex: active ? 30 : 1,
      transform: [
        { translateX: active ? dragX.value : x.value },
        { translateY: active ? dragY.value : y.value },
        { scale: withTiming(active ? 1.05 : 1, { duration: 140 }) },
      ],
    };
  });
  const inner = useAnimatedStyle(() => ({
    transform: [{ rotate: `${activeId.value === id ? 0 : rot.value}deg` }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.slot, { width: w }, outer]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={tile.name}
        onAccessibilityTap={() => onPress(id)}
      >
        <Animated.View style={[styles.fill, inner]}>
          <DeckTileFace colors={colors} tile={tile} order={liveOrder} itemsLabel={itemsLabel} lifted={lifted} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

// ─── The grid ─────────────────────────────────────────────────────────────────
export default function DeckGrid({
  colors,
  tiles,
  width,
  wiggle,
  itemsLabel,
  scroll,
  onPressTile,
  onGrab,
  onDrop,
}: DeckGridProps) {
  const reduceMotion = useReducedMotion();
  const w = Math.max(0, (width - DECK_GAP) / 2);
  const ids = useMemo(() => tiles.map((t) => t.id), [tiles]);
  const idsKey = ids.join('|');

  const order = useSharedValue<string[]>(ids);
  const activeId = useSharedValue<string | null>(null);
  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  // The dragged tile's position in GRID coordinates: where it was grabbed, plus
  // the finger's travel, plus however far the page has scrolled under it since.
  const dragX = useDerivedValue(() => startX.value + transX.value);
  const dragY = useDerivedValue(
    () => startY.value + transY.value + (scroll.offset.value - startScroll.value),
  );

  // JS mirrors — the position pills and the lifted face are plain React.
  const [liveIds, setLiveIds] = useState<string[]>(ids);
  const [liftedId, setLiftedId] = useState<string | null>(null);

  // The host's list is the truth at rest (a refresh, a hide, a new category).
  useEffect(() => {
    order.value = ids;
    setLiveIds(ids);
    // idsKey stands in for ids — same ids in the same order is the same deck
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, order]);

  // Which slot is the dragged tile over? Its centre picks the column and row.
  useAnimatedReaction(
    () => (activeId.value === null ? null : { x: dragX.value, y: dragY.value }),
    (p) => {
      const active = activeId.value;
      if (!p || active === null || w <= 0) return;
      const n = order.value.length;
      const col = p.x + w / 2 > w + DECK_GAP / 2 ? 1 : 0;
      const row = Math.max(0, Math.round(p.y / (DECK_TILE_H + DECK_GAP)));
      const target = Math.min(n - 1, row * 2 + col);
      const cur = order.value.indexOf(active);
      if (cur < 0 || target === cur) return;
      const next = order.value.slice();
      next.splice(cur, 1);
      next.splice(target, 0, active);
      order.value = next;
      runOnJS(setLiveIds)(next);
    },
    [w],
  );

  // Carry the page along when the tile is held near the top or bottom edge.
  useFrameCallback(() => {
    if (activeId.value === null) return;
    const top = scroll.gridTop.value + dragY.value - scroll.offset.value;
    const max = Math.max(0, scroll.contentH.value - scroll.viewportH.value);
    let next = scroll.offset.value;
    if (top < EDGE) next = Math.max(0, next - EDGE_STEP);
    else if (top + DECK_TILE_H > scroll.viewportH.value - EDGE) next = Math.min(max, next + EDGE_STEP);
    if (next !== scroll.offset.value) scrollTo(scroll.ref, 0, next, false);
  });

  const handleGrab = (id: string) => {
    setLiftedId(id);
    onGrab();
  };
  const handleRelease = (orderedIds: string[], movedId: string) => {
    setLiftedId(null);
    setLiveIds(orderedIds);
    onDrop(orderedIds, movedId);
  };
  // Stable identities for the worklets' runOnJS targets.
  const grabRef = React.useRef(handleGrab);
  const releaseRef = React.useRef(handleRelease);
  const pressRef = React.useRef(onPressTile);
  grabRef.current = handleGrab;
  releaseRef.current = handleRelease;
  pressRef.current = onPressTile;
  const stable = useMemo(
    () => ({
      grab: (id: string) => grabRef.current(id),
      release: (orderedIds: string[], movedId: string) => releaseRef.current(orderedIds, movedId),
      press: (id: string) => pressRef.current(id),
    }),
    [],
  );

  const rows = Math.ceil(tiles.length / 2);
  const height = rows > 0 ? rows * (DECK_TILE_H + DECK_GAP) - DECK_GAP : 0;

  return (
    <View style={{ height }}>
      {w > 0 &&
        tiles.map((tile, index) => (
          <Tile
            key={tile.id}
            colors={colors}
            tile={tile}
            index={index}
            liveOrder={Math.max(0, liveIds.indexOf(tile.id)) + 1}
            lifted={liftedId === tile.id}
            w={w}
            wiggle={wiggle}
            reduceMotion={reduceMotion}
            itemsLabel={itemsLabel}
            order={order}
            activeId={activeId}
            transX={transX}
            transY={transY}
            startX={startX}
            startY={startY}
            startScroll={startScroll}
            dragX={dragX}
            dragY={dragY}
            scrollOffset={scroll.offset}
            onPress={stable.press}
            onGrab={stable.grab}
            onRelease={stable.release}
          />
        ))}
    </View>
  );
}

// ─── The "Not in use" shelf — the same faces, at rest, in explicit pair rows ──
export function DeckShelf({
  colors,
  tiles,
  itemsLabel,
  dimmed,
  onPressTile,
}: {
  colors: ThemeColorSet;
  tiles: DeckTileModel[];
  itemsLabel: string;
  /** The deck is wiggling — the shelf steps back. */
  dimmed?: boolean;
  onPressTile: (id: string) => void;
}) {
  const pairs: DeckTileModel[][] = [];
  for (let i = 0; i < tiles.length; i += 2) pairs.push(tiles.slice(i, i + 2));
  return (
    <View style={[styles.shelf, { opacity: dimmed ? 0.35 : 0.72 }]}>
      {pairs.map((pair) => (
        <View key={pair[0].id} style={styles.shelfRow}>
          {pair.map((tile) => (
            <Pressable
              key={tile.id}
              style={styles.shelfCell}
              disabled={dimmed}
              onPress={() => onPressTile(tile.id)}
              accessibilityRole="button"
              accessibilityLabel={tile.name}
            >
              <DeckTileFace colors={colors} tile={tile} itemsLabel={itemsLabel} />
            </Pressable>
          ))}
          {pair.length === 1 && <View style={styles.shelfCell} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: 0, left: 0, height: DECK_TILE_H },
  fill: { flex: 1 },
  face: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  faceLifted: { borderWidth: 1.5, boxShadow: '0px 14px 26px rgba(0,0,0,0.38)', elevation: 10 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5 },
  orderPill: {
    position: 'absolute',
    top: 9,
    right: 9,
    minWidth: 18,
    height: 18,
    borderRadius: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderText: { fontFamily: fonts.mono.semibold, fontSize: 9 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 24 },
  name: { fontFamily: fonts.display.bold, fontSize: 14, letterSpacing: -0.2, flexShrink: 1 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 7 },
  count: { fontFamily: fonts.mono.semibold, fontSize: 21, lineHeight: 23 },
  countLabel: { fontFamily: fonts.mono.medium, fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  line: { fontFamily: fonts.body.regular, fontSize: 10.5, lineHeight: 14.5, marginTop: 6 },
  shelf: { gap: DECK_GAP },
  shelfRow: { flexDirection: 'row', gap: DECK_GAP },
  shelfCell: { flex: 1, minHeight: 76 },
});
