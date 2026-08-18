import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScaleDecorator } from 'react-native-draggable-flatlist';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * Full-image square shelf tile for the bartender recipe editors (s73 Shelf
 * Flow). The whole image IS the card: gradient scrim carries the name + price,
 * a drag grabber sits top-left and a "···" meatball top-right on translucent
 * dark pills, and a Featured pill marks starred recipes (it slides left of the
 * meatball). The user-side shelves render the same geometry without controls,
 * so user ↔ editor flips never resize the tiles.
 *
 * Scrim text colors are LITERALS on purpose — the scrim is a fixed-dark photo
 * surface in both themes, so white + #FFB07A (the fixed-dark ember) hold; theme
 * tokens here would invert in light mode (the rulebook's ember lesson).
 *
 * Presentational only — strings/handlers come from the parent editor. Rendered
 * inside a horizontal DraggableFlatList, so `drag`/`isActive` arrive from
 * RenderItemParams.
 */
interface RecipeGridCardProps {
  imageUrl: string; // already cache-busted by the caller's getImageUrl()
  name: string;
  price?: string | null;
  featured?: boolean;
  onPress: () => void;
  onMeatball: () => void;
  drag: () => void;
  isActive: boolean;
}

export const RECIPE_TILE_SIZE = 132;

export default function RecipeGridCard({
  imageUrl,
  name,
  price,
  featured,
  onPress,
  onMeatball,
  drag,
  isActive,
}: RecipeGridCardProps) {
  const colors = useThemeColors();
  return (
    <ScaleDecorator>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={isActive}
        style={[
          styles.tile,
          { borderColor: colors.glassBorder },
          isActive && { borderColor: colors.primary, opacity: 0.92 },
        ]}
      >
        <StorageImage source={{ uri: imageUrl }} style={styles.tileImage} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(8,10,14,0.30)', 'rgba(8,10,14,0.84)']}
          style={styles.tileScrim}
        />

        <View style={styles.tileMeta}>
          <Text style={styles.tileName} numberOfLines={2}>
            {name}
          </Text>
          {!!price && <Text style={styles.tilePrice}>{price}</Text>}
        </View>

        {featured && (
          <View style={styles.featuredPill}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={9}
              color="#1A1E24"
            />
          </View>
        )}

        {/* Drag grabber — long-press to reorder left/right within the shelf */}
        <TouchableOpacity
          onLongPress={drag}
          delayLongPress={150}
          disabled={isActive}
          style={[styles.cornerButton, styles.cornerLeft]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="line.3.horizontal"
            android_material_icon_name="drag-indicator"
            size={15}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* Meatball — Edit / Move / Order Position / Delete */}
        <TouchableOpacity
          onPress={onMeatball}
          style={[styles.cornerButton, styles.cornerRight]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="ellipsis"
            android_material_icon_name="more-vert"
            size={15}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: RECIPE_TILE_SIZE,
    aspectRatio: 1,
    borderRadius: 13,
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#1C2026',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  tileMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 9,
    paddingBottom: 8,
  },
  tileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tilePrice: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    color: '#FFB07A',
  },
  // Featured pill hugs the top-right, shifted left of the meatball pill.
  featuredPill: {
    position: 'absolute',
    top: 8,
    right: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB07A',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    zIndex: 3,
  },
  cornerButton: {
    position: 'absolute',
    top: 7,
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    backgroundColor: 'rgba(8,10,14,0.5)',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  cornerLeft: {
    left: 7,
  },
  cornerRight: {
    right: 7,
  },
});
