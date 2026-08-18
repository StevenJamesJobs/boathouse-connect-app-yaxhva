import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Circular progress ring in PURE Views — react-native-svg is not a dependency
 * and the SDK-54 lockfile must not be disturbed, so this uses the classic
 * pre-svg technique: the arc is composed from two half-rings (a border circle
 * with two adjacent sides transparent reads as a semicircle after a 45°
 * alignment rotation), each revealed through an overflow-hidden half-window.
 * 0–50% rotates an arc into the right window (12 o'clock, clockwise);
 * 50–100% continues through the left window.
 *
 * `children` render centered inside (the percentage / count label).
 */
interface ProgressRingProps {
  /** 0–100; values outside are clamped. */
  pct: number;
  size?: number;
  stroke?: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}

function HalfRing({
  size,
  stroke,
  color,
  rotate,
}: {
  size: number;
  stroke: number;
  color: string;
  rotate: number;
}) {
  // borderLeft+borderBottom coloured + 45° = the LEFT semicircle; the outer
  // wrapper then swings that half by the progress angle.
  return (
    <View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate: `${rotate}deg` }] }]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderLeftColor: color,
          borderBottomColor: color,
          borderRightColor: 'transparent',
          borderTopColor: 'transparent',
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export default function ProgressRing({
  pct,
  size = 52,
  stroke = 5,
  color,
  trackColor,
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const deg = clamped * 3.6;
  const half = size / 2;
  // Right window reveals the first 180°, left window the rest. At 0° both
  // coloured halves are parked in their window's hidden side.
  const rightRot = Math.min(deg, 180);
  const leftRot = Math.max(deg - 180, 0);

  return (
    <View style={{ width: size, height: size }}>
      {/* track */}
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: trackColor,
        }}
      />
      {/* 0–50%: arc sweeps the right half from 12 o'clock */}
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: -half, width: size, height: size }}>
          <HalfRing size={size} stroke={stroke} color={color} rotate={rightRot} />
        </View>
      </View>
      {/* 50–100%: arc continues through the left half */}
      {leftRot > 0 && (
        <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, width: size, height: size }}>
            <HalfRing size={size} stroke={stroke} color={color} rotate={leftRot} />
          </View>
        </View>
      )}
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
