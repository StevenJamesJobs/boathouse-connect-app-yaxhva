import React, { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { SheetNoDragZone } from '@/components/sheetDismiss';

// The handle's touch target reaches this far past its visible box.
const SLOP = 12;

/**
 * Bottom-right drag grabber for the auto-growing Procedure text areas in the
 * bartender recipe editors. The field still auto-grows with its content; this
 * handle lets the user drag DOWN to manually enlarge it further (the effective
 * height is max(content, manual, min) in the caller). Absolutely positioned, so
 * render it as a sibling of the TextInput inside a wrapping View.
 *
 * It owns a vertical pan, and the recipe editors render it inside a
 * swipe-to-dismiss GlassSheet — so it fences itself with <SheetNoDragZone>
 * (components/sheetDismiss.tsx): a touch that starts on the handle, slop ring
 * included, is the handle's and never pulls the sheet down. Outside a sheet
 * (notification-center) the zone is an inert View.
 */
interface ProcedureResizeHandleProps {
  height: number; // current effective height
  minHeight?: number;
  onResize: (h: number) => void; // receives the new manual height
}

export default function ProcedureResizeHandle({
  height,
  minHeight = 120,
  onResize,
}: ProcedureResizeHandleProps) {
  // Refs keep the PanResponder (created once) reading live values, not stale closures.
  const heightRef = useRef(height);
  heightRef.current = height;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const startH = useRef(height);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        startH.current = heightRef.current;
      },
      onPanResponderMove: (_, g) => {
        onResizeRef.current(Math.max(minHeight, Math.round(startH.current + g.dy)));
      },
    })
  ).current;

  return (
    <SheetNoDragZone style={styles.zone}>
      <View
        style={styles.handle}
        hitSlop={{ top: SLOP, bottom: SLOP, left: SLOP, right: SLOP }}
        {...pan.panHandlers}
      >
        <IconSymbol
          ios_icon_name="line.3.horizontal"
          android_material_icon_name="drag-handle"
          size={16}
          color="#9E9E9E"
        />
      </View>
    </SheetNoDragZone>
  );
}

const styles = StyleSheet.create({
  // The fence is the absolutely positioned box: anchored SLOP further out and
  // padded SLOP back in, so the handle lands at the same right:5 / bottom:5 as
  // before while the whole slop ring sits inside the fenced rect.
  zone: {
    position: 'absolute',
    right: 5 - SLOP,
    bottom: 5 - SLOP,
    padding: SLOP,
  },
  handle: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
});
