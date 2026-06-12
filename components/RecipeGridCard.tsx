import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScaleDecorator } from 'react-native-draggable-flatlist';
import { IconSymbol } from '@/components/IconSymbol';

/**
 * Full-image square thumbnail card for the bartender recipe editors (Phase 2).
 * Mirrors the customer-facing viewer tile (app/libation-recipes.tsx `recipeTile`):
 * the whole image IS the card, name (+ optional price) in a dark bottom overlay.
 * A drag grabber sits top-left and a "···" meatball top-right, both on the
 * translucent dark pill used by menu-editor's card corner buttons.
 *
 * Presentational only — all strings/handlers come from the parent editor, so it
 * stays i18n- and table-agnostic. Rendered inside a horizontal DraggableFlatList,
 * so `drag`/`isActive` arrive from RenderItemParams.
 */
interface RecipeGridCardProps {
  imageUrl: string; // already cache-busted by the caller's getImageUrl()
  name: string;
  price?: string | null;
  onPress: () => void;
  onMeatball: () => void;
  drag: () => void;
  isActive: boolean;
}

export default function RecipeGridCard({
  imageUrl,
  name,
  price,
  onPress,
  onMeatball,
  drag,
  isActive,
}: RecipeGridCardProps) {
  return (
    <ScaleDecorator>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={isActive}
        style={[styles.tile, isActive && styles.tileActive]}
      >
        <Image source={{ uri: imageUrl }} style={styles.tileImage} resizeMode="cover" />

        <View style={styles.tileOverlay}>
          <Text style={styles.tileName} numberOfLines={2}>
            {name}
          </Text>
          {!!price && <Text style={styles.tilePrice}>{price}</Text>}
        </View>

        {/* Drag grabber — long-press to reorder left/right within the category */}
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
            size={18}
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
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}

const TILE_WIDTH = 160;

const styles = StyleSheet.create({
  tile: {
    width: TILE_WIDTH,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#222222',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  tileActive: {
    opacity: 0.9,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
  },
  tileName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tilePrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
  },
  cornerButton: {
    position: 'absolute',
    top: 8,
    padding: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 14,
  },
  cornerLeft: {
    left: 8,
  },
  cornerRight: {
    right: 8,
  },
});
