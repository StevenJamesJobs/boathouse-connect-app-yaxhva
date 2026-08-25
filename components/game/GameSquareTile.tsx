import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * Square arcade tile for the Game Hub and the per-game category grids (s75
 * Arcade Shelf). A game-colored gradient IS the card: big white glyph in the
 * middle, name on a dark scrim at the foot, and a caret chip top-right that
 * flips while the tile's board card is expanded below the shelf. Premium-locked
 * tiles swap the caret for a lock chip.
 *
 * Scrim text/pill colors are LITERALS on purpose — the gradient is a fixed-dark
 * photo-class surface in both themes (the rulebook's ember lesson), so white +
 * translucent dark pills hold everywhere. Only the selected ring uses a theme
 * token (colors.tint), matching the recipes shelf's active-drag ring.
 */
export interface GameSquareTileProps {
  label: string;
  iosIcon: string;
  androidIcon: string;
  /** Two-stop gradient, dark→light along the 150° diagonal. */
  gradient: readonly [string, string];
  /** Flips the caret and draws the tint ring while the board card is open. */
  selected?: boolean;
  /** Premium-locked: lock chip instead of the caret. */
  locked?: boolean;
  /** 1 (default) for 3-across shelves; ~1.45 for 2-column grids. */
  aspectRatio?: number;
  onPress: () => void;
}

export default function GameSquareTile({
  label,
  iosIcon,
  androidIcon,
  gradient,
  selected,
  locked,
  aspectRatio = 1,
  onPress,
}: GameSquareTileProps) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.tile,
        { aspectRatio, borderColor: colors.glassBorder },
        selected && { borderColor: colors.tint, borderWidth: 1.5 },
      ]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glyphBox}>
        <IconSymbol
          ios_icon_name={iosIcon as any}
          android_material_icon_name={androidIcon as any}
          size={28}
          color="#FFFFFF"
        />
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(8,10,14,0.72)']}
        style={styles.scrim}
      />
      <View style={styles.cornerChip}>
        <IconSymbol
          ios_icon_name={locked ? 'lock.fill' : selected ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={locked ? 'lock' : selected ? 'expand-less' : 'expand-more'}
          size={11}
          color="#FFFFFF"
        />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  glyphBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the glyph above the name strip's visual weight.
    paddingBottom: 14,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '56%',
  },
  cornerChip: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,14,0.45)',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  name: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    fontFamily: fonts.display.semibold,
    fontSize: 11.5,
    lineHeight: 14,
    color: '#FFFFFF',
  },
});
