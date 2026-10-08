import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Animated,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import GlassBlur from '@/components/GlassBlur';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import { StorageExpoImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { fonts } from '@/constants/fonts';

/**
 * PosterSheet — the s81 "C3 Poster" shell, lifted out of ContentDetailModal
 * (s89) so ONE component carries the detail grammar for Announcements ·
 * Special Features · Events · Guides · menu items · bartender recipes ·
 * notifications. Steve: "keep this consistent across the app".
 *
 * The photo takes ~46% of the window and the TITLE IS SET INTO IT over the
 * banner scrim, with ONLY a pill row above it (kind / subcategory / price —
 * the caller's choice; never a date eyebrow). Extra photos page inside the
 * hero (dots + "1 / N" counter). Below, inside a glass details panel, the
 * caller's content. Rides GlassHeroSheet: the photo is PINNED while the title
 * block + panel slide up over it under a blur wash; scroll back = full photo;
 * a drag at rest pulls the sheet down (the app-wide dismiss).
 *
 * No photo → a hue board (`boardColor`, default fixed-dark slate — never the
 * theme tint, which washes out under the white title) at ~30% carrying the
 * same pill row + title; `boardContent` can draw something on it (the
 * notification sheet's org logo).
 *
 * Banner-shaped covers render CONTAINED over a blurred copy of themselves so
 * nothing is cut; square covers cover-crop; `containOnWhite` is the wine rule
 * (bottle cut-outs contain on a WHITE ground — never cover-cropped).
 */
export interface PosterSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Cover first, extras after. Empty → the hue board. */
  images: string[];
  /** 'banner' → contain over its own blurred copy; anything else cover-crops. */
  imageShape?: string | null;
  /** Wine: contain on white. */
  containOnWhite?: boolean;
  /** No-photo board hue. Default POSTER_SLATE. */
  boardColor?: string | null;
  /** Drawn on the board under the scrim (e.g. the org logo). */
  boardContent?: React.ReactNode;
  /** The pill row set into the photo — build with <PosterPill>. */
  pills?: React.ReactNode;
  title: string;
  /** Lines under the title, still on the photo (mono, white) — optional. */
  subtitle?: React.ReactNode;
  /** Panel content. */
  children: React.ReactNode;
  /** Replaces the pinned Close row (GlassHeroSheet contract). */
  footer?: React.ReactNode;
  /** s91: a tap on a hero photo (its index) — hosts open a lightbox. */
  onImagePress?: (index: number) => void;
}

// Fixed-dark scrim + ink literals: they sit on a photo (or the hue board),
// never on a themed surface — the rulebook's ember rule.
const SCRIM = ['rgba(14,11,9,0)', 'rgba(14,11,9,0.62)', 'rgba(14,11,9,0.96)'] as const;
const WHITE_SCRIM = ['rgba(14,11,9,0)', 'rgba(14,11,9,0.35)', 'rgba(14,11,9,0.88)'] as const;
export const INK_ON_PHOTO = '#FFFFFF';
export const POSTER_SLATE = '#4A5568';
const COUNTER_SCRIM = 'rgba(8,10,14,0.55)';
// The darkening under the blur wash as the panel rises — keeps the white
// title legible over any photo's bright top half.
const WASH_TINT = 'rgba(14,11,9,0.55)';

/** Mix `hex` toward a dark navy for the board's deep end. */
export function deepen(hex: string, amount = 0.5): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const n = parseInt(clean, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const tr = 10, tg = 16, tb = 32;
  const mix = (a: number, t: number) => Math.round(a + (t - a) * amount);
  return `#${[mix(r, tr), mix(g, tg), mix(b, tb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A pill for the row set into the photo. `tone='price'` is the bigger
 * tint-filled money pill (Steve: "make the price a bit bigger so it's more
 * readable"); default = the mono uppercase kind pill.
 */
export function PosterPill({
  label,
  color,
  textColor = INK_ON_PHOTO,
  tone = 'kind',
}: {
  label: string;
  color: string;
  textColor?: string;
  tone?: 'kind' | 'price';
}) {
  return (
    <View style={[pillStyles.pill, tone === 'price' ? pillStyles.pricePill : pillStyles.kindPill, { backgroundColor: color }]}>
      <Text
        style={[pillStyles.pillText, tone === 'price' && pillStyles.priceText, { color: textColor }]}
        numberOfLines={1}
      >
        {tone === 'price' ? label : label.toUpperCase()}
      </Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    flexShrink: 0,
  },
  // Only the kind pill is capped — a percentage maxWidth on the price pill
  // resolved against its own auto-margin wrapper and clipped "$12" to "$".
  kindPill: {
    maxWidth: '60%',
    flexShrink: 1,
  },
  pillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1,
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.25)',
  },
  priceText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    letterSpacing: 0.2,
  },
});

export default function PosterSheet({
  visible,
  onClose,
  images,
  imageShape,
  containOnWhite = false,
  boardColor,
  boardContent,
  pills,
  title,
  subtitle,
  children,
  footer,
  onImagePress,
}: PosterSheetProps) {
  const theme = useThemeColors();
  const isDark = useIsDarkTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const hasPhoto = images.length > 0;
  // Poster height: ~46% of the window with a photo, a shorter board without.
  const heroHeight = hasPhoto
    ? Math.min(440, Math.max(300, Math.round(windowHeight * 0.46)))
    : Math.min(300, Math.max(210, Math.round(windowHeight * 0.3)));

  // ─── The Poster collapse (Steve, s81 round 2) ─────────────────────────────
  // The photo is PINNED; the title block + details panel ride up over it as
  // the body scrolls, and the photo blurs + darkens behind them (native-driver
  // opacity on a blur wash). The title block overlaps the hero's bottom by
  // its own measured height + 18 so at rest it sits on the photo's scrim.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [titleBlockHeight, setTitleBlockHeight] = useState(140);
  const onTitleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setTitleBlockHeight(h);
  }, []);
  const washOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(1, Math.round(heroHeight * 0.32))],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const [page, setPage] = useState(0);
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(e.nativeEvent.contentOffset.x / windowWidth));
    },
    [windowWidth],
  );

  const boardHue = boardColor || POSTER_SLATE;

  // ─── Hero: photo pager or hue board, title set into it ────────────────────
  const renderSlide = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <View style={{ width: windowWidth, height: heroHeight, backgroundColor: containOnWhite ? '#FFFFFF' : undefined }}>
        {containOnWhite ? (
          <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : imageShape === 'banner' ? (
          <>
            <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
            <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="contain" />
          </>
        ) : (
          <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
        {!!onImagePress && (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onImagePress(index)} accessibilityRole="imagebutton" />
        )}
      </View>
    ),
    [windowWidth, heroHeight, imageShape, containOnWhite, onImagePress],
  );

  const hero = (
    <View style={{ width: windowWidth, height: heroHeight }}>
      {hasPhoto ? (
        <FlatList
          data={images}
          renderItem={renderSlide}
          keyExtractor={(item, i) => `${i}-${item}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          bounces={false}
          nestedScrollEnabled
          getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
        />
      ) : (
        <>
          <LinearGradient
            colors={[boardHue, deepen(boardHue)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {boardContent}
        </>
      )}
      <LinearGradient
        colors={[...(containOnWhite ? WHITE_SCRIM : SCRIM)]}
        locations={[0.36, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* The blur wash — fades in with the scroll so the photo blurs and
          darkens behind the rising title + panel. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: washOpacity }]} pointerEvents="none">
        <GlassBlur intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: WASH_TINT }]} />
      </Animated.View>
      {images.length > 1 && (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{page + 1} / {images.length}</Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        </>
      )}
    </View>
  );

  // The title block rides WITH the panel (it is the first child of the body),
  // pulled up over the hero's scrim by its own height so at rest it reads on
  // the photo exactly where the mockup drew it.
  const titleBlock = (
    <View
      style={[styles.into, { marginTop: -(titleBlockHeight + 18) }]}
      onLayout={onTitleLayout}
      pointerEvents="none"
    >
      {!!pills && <View style={styles.intoLine}>{pills}</View>}
      <Text style={styles.heroTitle} numberOfLines={3}>{title}</Text>
      {subtitle}
    </View>
  );

  return (
    <GlassHeroSheet
      visible={visible}
      onClose={onClose}
      hero={hero}
      heroHeight={heroHeight}
      scrollY={scrollY}
      pinHero
      footer={footer}
    >
      {titleBlock}

      {/* The details panel — its own glass over the (blurred) photo as it
          rises; at rest it sits under the hero on the sheet's ground. */}
      <View style={styles.panel}>
        <GlassBlur intensity={28} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {children}
        {/* The runway: with a photo, the panel can ALWAYS be pulled up over the
            image to read the details on a calm ground, even when the copy is
            two lines — without this a short post has no scroll range and the
            collapse never engages. */}
        {hasPhoto && <View style={{ height: Math.max(0, heroHeight - 120) }} />}
      </View>
    </GlassHeroSheet>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    // ── on the photo ──
    counter: {
      position: 'absolute',
      top: 12,
      right: 14,
      zIndex: 3,
      backgroundColor: COUNTER_SCRIM,
      borderRadius: 13,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    counterText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 11,
      letterSpacing: 0.3,
      color: INK_ON_PHOTO,
    },
    // Under the floating grab handle, above the scrim — white so they read on
    // any photo's top edge.
    dots: {
      position: 'absolute',
      top: 24,
      left: 0,
      right: 0,
      zIndex: 3,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.45)',
      boxShadow: '0px 1px 2px rgba(0,0,0,0.35)',
    },
    dotOn: { width: 18, backgroundColor: INK_ON_PHOTO },
    // The title block lives in the body (first child) and is pulled up over the
    // hero by its measured height — see `titleBlock`.
    into: {
      paddingHorizontal: 2,
      paddingBottom: 18,
      // Transparent room above the title: at rest it sits over the photo (the
      // block is pulled up by its measured height, padding included), and at
      // FULL collapse it keeps the title under the floating grab handle
      // (strip 34pt, bar at 10–14) instead of colliding with it.
      paddingTop: 22,
    },
    intoLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 9,
    },
    heroTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 30,
      lineHeight: 32,
      letterSpacing: -0.6,
      color: INK_ON_PHOTO,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },

    // ── the details panel ──
    // Spans the sheet edge to edge (escapes the body's 18pt inset), rounded top
    // corners so it reads as a card sliding up over the photo; its BlurView
    // blurs whatever is behind it.
    panel: {
      marginHorizontal: -18,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 8,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: 'hidden',
      // navTint = the blur-over-content tint (the nav bar's) — stronger than
      // glass so the pinned hero's bottom edge doesn't read through as a seam.
      backgroundColor: theme.navTint,
      borderTopWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.glassBorder,
    },
  });
