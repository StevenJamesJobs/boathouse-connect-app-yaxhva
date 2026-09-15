import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { clampHue, hslToHex } from '@/utils/theme/customAccent';
import { HUE_GRADIENT_COLORS, HUE_GRADIENT_LOCATIONS } from '@/components/appearance/appearanceKit';

const TRACK_H = 14;
const KNOB = 24;
const KNOB_BORDER = '#FFFFFF';
const TICK_W = 2;
const TICK_H = 6;
// Vertical rhythm: the knob overhangs the track by 5pt above; ticks sit 2pt under it.
const KNOB_OVERHANG = (KNOB - TRACK_H) / 2;
const TICK_TOP = TRACK_H + 2;
const WRAP_H = KNOB_OVERHANG + TICK_TOP + TICK_H;

interface HueSliderProps {
  /** 0–360 */
  value: number;
  onChange: (hue: number) => void;
  /** Preset hues to mark under the track. */
  ticks?: number[];
}

/**
 * The hue track (mockup `.hue`): a 14pt rainbow with a 24pt knob filled with the
 * live hue, preset ticks under it, driven by a PanResponder — tap to jump, drag
 * to slide; `onChange` fires continuously while dragging.
 */
export default function HueSlider({ value, onChange, ticks }: HueSliderProps) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startX = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const w = widthRef.current;
          if (!w) return;
          startX.current = evt.nativeEvent.locationX;
          onChangeRef.current(hueAt(startX.current, w));
        },
        onPanResponderMove: (_evt, g) => {
          const w = widthRef.current;
          if (!w) return;
          onChangeRef.current(hueAt(startX.current + g.dx, w));
        },
      }),
    [],
  );

  const hue = clampHue(value);
  const knobLeft = width ? (hue / 360) * width - KNOB / 2 : -KNOB / 2;

  return (
    <View style={styles.wrap} onLayout={onLayout} {...pan.panHandlers} accessibilityRole="adjustable">
      <LinearGradient
        colors={HUE_GRADIENT_COLORS}
        locations={HUE_GRADIENT_LOCATIONS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.track}
        pointerEvents="none"
      />
      {width > 0 &&
        ticks?.map((h, i) => (
          <View
            key={`${h}-${i}`}
            pointerEvents="none"
            style={[
              styles.tick,
              { left: (clampHue(h) / 360) * width - TICK_W / 2, backgroundColor: colors.textSecondary },
            ]}
          />
        ))}
      <View
        pointerEvents="none"
        style={[styles.knob, { left: knobLeft, backgroundColor: hslToHex(hue, 86, 60) }]}
      />
    </View>
  );
}

function hueAt(x: number, width: number): number {
  const ratio = Math.min(1, Math.max(0, x / width));
  return clampHue(ratio * 360);
}

const styles = StyleSheet.create({
  wrap: { height: WRAP_H, paddingTop: KNOB_OVERHANG, marginTop: 10, marginBottom: 6, justifyContent: 'flex-start' },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2 },
  tick: {
    position: 'absolute',
    top: KNOB_OVERHANG + TICK_TOP,
    width: TICK_W,
    height: TICK_H,
    borderRadius: 1,
    opacity: 0.7,
  },
  knob: {
    position: 'absolute',
    top: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 3,
    borderColor: KNOB_BORDER,
    boxShadow: '0px 2px 6px rgba(0,0,0,0.4)',
    elevation: 4,
  },
});
