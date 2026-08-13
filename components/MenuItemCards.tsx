import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StorageExpoImage } from '@/components/StorageImage';
import { IconSymbol } from '@/components/IconSymbol';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * Presentational menu-item cards (s69 extraction from MenuDisplay) — shared by
 * the user-facing menu AND the manager editor so both render the identical
 * card. Every string/price/label is PRE-COMPUTED by the caller (MenuDisplay /
 * menu-editor: getLocalizedField, stripFormattingTags, formatPrice, dietary
 * abbrevs, the "Gl $x" / "Btl $x" wine-price strings, eyebrow, badges) — these
 * components own layout + the editor-mode affordances ONLY, nothing else.
 * Wine items always use the square card; the caller decides isBanner
 * (!isWine && banner shape && has photo) before choosing which to render.
 */

/** Editor-mode affordances, present only when a card renders inside the
 *  manager editor's DraggableFlatList. `onMeatball` opens the action sheet;
 *  `drag` is the long-press activator DraggableFlatList's renderItem hands
 *  back; `showGrabber` hides the grab affordance only (Featured Specials /
 *  search results aren't reorderable) — the meatball still shows either way. */
export interface MenuCardEditor {
  onMeatball: () => void;
  drag?: () => void;
  dragActive?: boolean;
  showGrabber: boolean;
}

export interface MenuItemSquareCardProps {
  colors: ThemeColorSet;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isWine: boolean;
  priceLabel: string | null;
  winePrices: { gl?: string; btl?: string; mbr?: string } | null;
  wineLocation?: string | null;
  dietaryAbbrevs: string[];
  metaTags?: string[];
  menuBadge?: { icon: string; label: string } | null;
  catColor: string | null;
  onPress?: () => void;
  editor?: MenuCardEditor;
}

export interface MenuItemBannerCardProps {
  colors: ThemeColorSet;
  title: string;
  description: string | null;
  thumbnailUrl: string;
  updatedAt?: string;
  eyebrow: string;
  priceLabel: string | null;
  catColor: string | null;
  onPress?: () => void;
  editor?: MenuCardEditor;
}

// The 2.5pt category-colour fade across the top edge of both card shapes —
// module-scope helper shared by both components below (not exported).
function renderTopFade(styles: ReturnType<typeof createStyles>, categoryColor: string) {
  return (
    <LinearGradient
      colors={[categoryColor, categoryColor + '4D', 'transparent']}
      locations={[0, 0.34, 0.68]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.cardTopFade}
      pointerEvents="none"
    />
  );
}

export function MenuItemSquareCard({
  colors,
  title,
  description,
  thumbnailUrl,
  isWine,
  priceLabel,
  winePrices,
  wineLocation,
  dietaryAbbrevs,
  metaTags,
  menuBadge,
  catColor,
  onPress,
  editor,
}: MenuItemSquareCardProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasTags = (metaTags && metaTags.length > 0) || dietaryAbbrevs.length > 0;

  return (
    <TouchableOpacity
      style={[styles.squareCard, editor?.dragActive && styles.dragActive]}
      // Editor mode suppresses tap-to-preview entirely — grab + meatball are
      // the only surfaces (mockup-authoritative, contract §6).
      onPress={editor ? undefined : onPress}
      activeOpacity={0.7}
    >
      {catColor ? renderTopFade(styles, catColor) : null}
      <View style={styles.cardRow}>
        {editor?.showGrabber ? (
          <Pressable onLongPress={editor.drag} style={styles.grabCol} hitSlop={8}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {thumbnailUrl ? (
          <StorageExpoImage
            source={thumbnailUrl}
            style={isWine ? [styles.cardThumb, styles.cardThumbWine] : styles.cardThumb}
            contentFit={isWine ? 'contain' : 'cover'}
          />
        ) : null}
        <View style={styles.cardContent}>
          {menuBadge ? (
            <View style={styles.menuBadge}>
              <IconSymbol ios_icon_name={menuBadge.icon} android_material_icon_name={menuIconAndroid(menuBadge.icon)} size={11} color={colors.primary} />
              <Text style={styles.menuBadgeText} numberOfLines={1}>{menuBadge.label}</Text>
            </View>
          ) : null}
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            {isWine ? (
              <View style={styles.winePriceStack}>
                {winePrices?.gl ? (
                  <Text style={[styles.winePriceLine, { color: colors.primary }]}>{winePrices.gl}</Text>
                ) : null}
                {winePrices?.btl ? (
                  <Text style={[styles.winePriceLine, { color: colors.primary }]}>{winePrices.btl}</Text>
                ) : null}
                {winePrices?.mbr ? (
                  <Text style={[styles.winePriceLine, { color: colors.textSecondary }]}>{winePrices.mbr}</Text>
                ) : null}
              </View>
            ) : (
              priceLabel ? <Text style={styles.cardPrice}>{priceLabel}</Text> : null
            )}
          </View>
          {isWine && wineLocation ? (
            <Text style={styles.wineLocation} numberOfLines={1}>📍 {wineLocation}</Text>
          ) : null}
          {description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{description}</Text>
          ) : null}
          {/* Chips sit BELOW the description — the mockup's card stack. */}
          {hasTags ? (
            <View style={styles.tagsRow}>
              {metaTags?.map((tag, i) => (
                <View key={`meta-${i}`} style={styles.metaTag}>
                  <Text style={styles.metaTagText}>{tag}</Text>
                </View>
              ))}
              {dietaryAbbrevs.map((abbrev, i) => (
                <View key={`diet-${abbrev}-${i}`} style={styles.dietChip}>
                  <Text style={styles.dietChipText}>{abbrev}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {editor ? (
          <Pressable
            onPress={editor.onMeatball}
            style={[styles.meatball, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            hitSlop={6}
          >
            <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-vert" size={17} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Banner card — the photo IS the card. Wine never banners (the caller gates
// isBanner on !isWine before choosing which component to render).
export function MenuItemBannerCard({
  colors,
  title,
  description,
  thumbnailUrl,
  eyebrow,
  priceLabel,
  catColor,
  onPress,
  editor,
}: MenuItemBannerCardProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.bannerCard, editor?.dragActive && styles.dragActive]}
      onPress={editor ? undefined : onPress}
      activeOpacity={0.85}
    >
      <StorageExpoImage source={thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
      {/* Bottom scrim so the white body copy reads on any photo. */}
      <LinearGradient
        colors={['rgba(14,11,9,0.94)', 'rgba(14,11,9,0.05)']}
        locations={[0.08, 0.64]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {catColor ? renderTopFade(styles, catColor) : null}

      {editor?.showGrabber ? (
        <Pressable onLongPress={editor.drag} style={styles.bannerGrabStrip} hitSlop={6}>
          <LinearGradient
            colors={['rgba(10,8,6,0.62)', 'rgba(10,8,6,0.28)', 'transparent']}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={18} color="#F4F2EE" />
        </Pressable>
      ) : null}

      <View style={[styles.bannerEyebrow, editor && styles.bannerEyebrowEditor]}>
        <Text style={styles.bannerEyebrowText} numberOfLines={1}>{eyebrow}</Text>
      </View>
      {priceLabel ? (
        <View style={[styles.bannerPriceChip, editor && styles.bannerPriceChipEditor]}>
          <Text style={styles.bannerPriceText}>{priceLabel}</Text>
        </View>
      ) : null}
      <View style={[styles.bannerBody, editor && styles.bannerBodyEditor]}>
        <Text style={styles.bannerTitle} numberOfLines={1}>{title}</Text>
        {description ? (
          <Text style={styles.bannerDesc} numberOfLines={2}>{description}</Text>
        ) : null}
      </View>

      {editor ? (
        <Pressable onPress={editor.onMeatball} style={styles.bannerMeatball} hitSlop={6}>
          <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-vert" size={17} color="#F4F2EE" />
        </Pressable>
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    // Square card — translucent surface (NO per-card blur), category fade on top.
    squareCard: {
      borderRadius: 16,
      marginBottom: 10,
      padding: 11,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
      overflow: 'hidden',
    },
    // Drag-active dim — ScaleDecorator (DraggableFlatList) supplies the scale
    // transform; this is just the visual "lifted" cue layered on top of it.
    dragActive: {
      opacity: 0.92,
    },
    cardTopFade: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 2.5,
      opacity: 0.85,
      zIndex: 1,
    },
    cardRow: {
      flexDirection: 'row',
      gap: 11,
    },
    // Editor-only grab column — 20pt, stretches the row's full height so a
    // long-press anywhere along the left edge activates drag (contract §6).
    grabCol: {
      width: 20,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardThumb: {
      width: 62,
      height: 62,
      borderRadius: 12,
    },
    // Wine thumbs contain on a white ground — label/bottle shots are almost
    // always on white, so the square reads as one continuous image.
    cardThumbWine: {
      backgroundColor: '#FFFFFF',
    },
    cardContent: {
      flex: 1,
      justifyContent: 'center',
    },
    // Editor-only meatball — 32x32 fixed size opts out of the row's default
    // stretch, so it centers on the row regardless of card height.
    meatball: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    menuBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.primary + '18',
      marginBottom: 4,
      maxWidth: 150,
    },
    menuBadgeText: {
      fontFamily: fonts.mono.medium,
      fontSize: 10,
      color: colors.primary,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 3,
      gap: 8,
    },
    cardTitle: {
      flex: 1,
      fontFamily: fonts.display.semibold,
      fontSize: 14.5,
      color: colors.text,
    },
    cardPrice: {
      fontFamily: fonts.mono.semibold,
      fontSize: 13.5,
      color: colors.primary,
    },
    winePriceStack: {
      alignItems: 'flex-end',
    },
    winePriceLine: {
      fontFamily: fonts.mono.semibold,
      fontSize: 12,
      lineHeight: 15,
    },
    wineLocation: {
      // No italic — fontStyle synthesis is unreliable with the bundled custom
      // families, and the detail sheet's location line made the same call.
      fontFamily: fonts.body.regular,
      fontSize: 12,
      marginTop: 1,
      marginBottom: 2,
      color: colors.textSecondary,
    },
    cardDesc: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 1,
      marginBottom: 3,
    },
    // Specials meta tags (menu + home category) — token-tinted, no fixed hexes.
    metaTag: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 7,
      backgroundColor: colors.primary + '12',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.primary + '42',
    },
    metaTagText: {
      fontFamily: fonts.mono.medium,
      fontSize: 9,
      letterSpacing: 0.4,
      color: colors.primary,
    },
    dietChip: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 7,
      backgroundColor: colors.primary + '12',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.primary + '42',
    },
    dietChipText: {
      fontFamily: fonts.mono.medium,
      fontSize: 9,
      letterSpacing: 0.4,
      color: colors.primary,
    },
    // Banner card — the photo IS the card.
    bannerCard: {
      height: 152,
      borderRadius: 18,
      overflow: 'hidden',
      marginBottom: 10,
      backgroundColor: colors.thumbPlaceholder,
    },
    // Editor-only 34pt left grab strip — full height, its own scrim gradient
    // (independent of the card's bottom scrim) so the grip glyph reads on
    // any photo.
    bannerGrabStrip: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 34,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      zIndex: 2,
    },
    bannerEyebrow: {
      position: 'absolute',
      top: 9,
      left: 9,
      maxWidth: '62%',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
      backgroundColor: 'rgba(20,16,14,0.55)',
    },
    // Editor mode clears the 34pt grab strip + a 6pt gap.
    bannerEyebrowEditor: {
      left: 40,
    },
    bannerEyebrowText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1,
      textTransform: 'uppercase',
      // Photo-anchored literal (the mockup's dark-theme ember): the pill behind
      // it is fixed dark, and colors.ember goes DARK in the light themes.
      color: '#FFB07A',
    },
    bannerPriceChip: {
      position: 'absolute',
      top: 9,
      right: 9,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.tint,
    },
    // Editor mode clears the meatball (top:11 right:11, 32pt wide).
    bannerPriceChipEditor: {
      right: 51,
    },
    bannerPriceText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 13,
      // Deliberate literal: the chip sits on a photo over the warm tint fill in
      // both themes, so the ink stays dark regardless of palette.
      color: '#14100E',
    },
    bannerBody: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 10,
    },
    bannerBodyEditor: {
      left: 40,
    },
    bannerTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 19,
      // Deliberate literals: body copy sits on the photo scrim, not a themed surface.
      color: '#FFFFFF',
    },
    bannerDesc: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 2,
      color: '#D7D0C6',
    },
    // Editor-only meatball over the photo — dark glass literal (sits on an
    // arbitrary photo, matching the grab strip's own literal treatment; not a
    // themed surface so no token applies).
    bannerMeatball: {
      position: 'absolute',
      top: 11,
      right: 11,
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(20,16,14,0.55)',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: 'rgba(255,255,255,0.18)',
      zIndex: 3,
    },
  });
