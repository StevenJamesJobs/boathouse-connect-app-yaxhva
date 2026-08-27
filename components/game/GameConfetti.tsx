import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { GameVisual } from './gameVisuals';

/**
 * The s76 win burst, shared by every game's results surface: two mirrored
 * cannons from the top corners instead of the old single left-edge cannon,
 * colored from the game's own Blues entry (gameVisuals is the ONLY color
 * source for game hues) plus the app-wide trophy gold. Slightly different
 * speeds per side so the streams cross instead of mirroring sterilely.
 *
 * Mount it over the results card inside an absoluteFill pointerEvents:none
 * layer (this component brings its own); render only on wins.
 */
interface GameConfettiProps {
  /** The game's gameVisuals entry — drives the palette. Omit for mixed Blues. */
  visual?: GameVisual;
  /** Pieces per cannon (two cannons total). */
  count?: number;
}

// Trophy gold pair — the one non-Blues hue, shared with the hub's trophy chrome.
const GOLD = '#F59E0B';
const GOLD_PALE = '#FDE68A';

// Mixed-Blues fallback: one step from each game's scale.
const MIXED_BLUES = ['#0EA5E9', '#41B4E8', '#3B82F6', '#5C8DF0', '#6663E0', GOLD, GOLD_PALE];

export default function GameConfetti({ visual, count = 90 }: GameConfettiProps) {
  const { width } = useWindowDimensions();

  const palette = visual
    ? [visual.gradient[0], visual.gradient[1], visual.accent, GOLD, GOLD_PALE]
    : MIXED_BLUES;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ConfettiCannon
        count={count}
        origin={{ x: -12, y: -8 }}
        colors={palette}
        fadeOut
        autoStart
        explosionSpeed={380}
        fallSpeed={2600}
      />
      <ConfettiCannon
        count={count}
        origin={{ x: width + 12, y: -8 }}
        colors={palette}
        fadeOut
        autoStart
        explosionSpeed={460}
        fallSpeed={3000}
      />
    </View>
  );
}
