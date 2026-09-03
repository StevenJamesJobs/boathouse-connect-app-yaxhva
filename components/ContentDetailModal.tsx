import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import { StorageExpoImage } from '@/components/StorageImage';
import { IconSymbol } from '@/components/IconSymbol';
import FormattedText from '@/components/FormattedText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { fonts } from '@/constants/fonts';
import { resolveForOpen } from '@/utils/storageResolver';
import { kindHue, priorityHue, type ContentKind } from '@/components/content/contentVisuals';

/**
 * ContentDetailModal (s81 rebuild — Steve's pick "C3 Poster"): the tap-through
 * for Announcements · Special Features · Upcoming Events · Guides.
 *
 * The photo takes ~46% of the window and the TITLE IS SET INTO IT over the
 * banner scrim (the Welcome banner card grown to full size), with the category
 * / priority pill + mono date eyebrow above it and the time line under it.
 * Extra photos page inside the hero (dots + "1 / 3" counter on the photo).
 * Below: a Starts / Ends facts strip, then the ATTACHED rows (link · file) —
 * deliberately ABOVE the description so nobody scrolls past them — then the
 * copy. Rides GlassHeroSheet (pull-down, scrim, safe-area Close).
 *
 * No photo → the hero is a category/priority-hue board carrying the same title
 * block (the quiz "question as hero" trick), so every post opens the same way.
 *
 * Banner-shaped covers (16:9) would lose their sides to a tall cover-crop, so
 * they render CONTAINED over a blurred copy of themselves — the whole image
 * shows and the blur fills the box. Square covers cover-crop (the box is
 * nearly square already, so almost nothing is lost).
 */

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface ContentDetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  thumbnailUrl?: string | null;
  thumbnailShape?: string;
  imageUrls?: string[];
  startDateTime?: string | null;
  endDateTime?: string | null;
  priority?: string;
  /** Upcoming Events only — 'Event' | 'Entertainment' (badge + board hue). */
  category?: string | null;
  /** The post type — drives the title pill (Announcement · Special Feature · Event · Entertainment). Omit for guides. */
  kind?: ContentKind;
  link?: string | null;
  guideFile?: GuideFile | null;
  // ⚠️ DO NOT WIDEN. Six callers pass this, and three of them (view-all-events,
  // view-all-specials, PortalHome) hand-build a five-key literal rather than
  // forwarding the whole ThemeColorSet — adding a required key here breaks all
  // three at once. Everything else (glass tokens, hues) is read from
  // `useThemeColors()` inside; every caller sources this object from that same
  // hook, so the two always describe the same palette.
  colors: {
    background?: string;
    text: string;
    textSecondary: string;
    primary: string;
    fireText: string;
    card: string;
    highlight?: string;
    border?: string;
  };
}

// Fixed-dark scrim + ink literals: they sit on a photo (or the hue board),
// never on a themed surface — the rulebook's ember rule.
const SCRIM = ['rgba(14,11,9,0)', 'rgba(14,11,9,0.62)', 'rgba(14,11,9,0.96)'] as const;
const INK_ON_PHOTO = '#FFFFFF';
const COUNTER_SCRIM = 'rgba(8,10,14,0.55)';
const BOARD_NEUTRAL = '#4A5568';
// The darkening under the blur wash as the panel rises — keeps the white
// title legible over any photo's bright top half.
const WASH_TINT = 'rgba(14,11,9,0.55)';

/** Mix `hex` toward a dark navy for the no-photo board's deep end. */
function deepen(hex: string, amount = 0.5): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const tr = 10, tg = 16, tb = 32;
  const mix = (a: number, t: number) => Math.round(a + (t - a) * amount);
  return `#${[mix(r, tr), mix(g, tg), mix(b, tb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function fileExt(file: GuideFile): string {
  const fromType = (file.file_type || '').split('/').pop() || '';
  const fromName = (file.file_name || '').split('.').pop() || '';
  const raw = (fromName.length <= 4 ? fromName : fromType) || fromType || 'FILE';
  return raw.toUpperCase().slice(0, 4);
}

function linkHost(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export default function ContentDetailModal({
  visible,
  onClose,
  title,
  content,
  thumbnailUrl,
  thumbnailShape,
  imageUrls,
  startDateTime,
  endDateTime,
  priority,
  category,
  kind,
  link,
  guideFile,
  colors,
}: ContentDetailModalProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useThemeColors();
  const isDark = useIsDarkTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const locale = language === 'es' ? 'es' : 'en-US';

  const images = useMemo<string[]>(() => {
    if (imageUrls && imageUrls.length > 0) return imageUrls;
    return thumbnailUrl ? [thumbnailUrl] : [];
  }, [imageUrls, thumbnailUrl]);
  const hasPhoto = images.length > 0;
  // Poster height: ~46% of the window with a photo, a shorter board without.
  const heroHeight = hasPhoto
    ? Math.min(440, Math.max(300, Math.round(windowHeight * 0.46)))
    : Math.min(300, Math.max(210, Math.round(windowHeight * 0.3)));

  // ─── The Poster collapse (Steve, s81 round 2) ─────────────────────────────
  // The photo is PINNED; the title block + details panel ride up over it as
  // the body scrolls, and the photo blurs + darkens behind them (native-driver
  // opacity on a blur wash). Scrolling back down restores the full photo; a
  // pull past the top dismisses. The title block overlaps the hero's bottom by
  // its own measured height + 18 so at rest it sits on the photo's scrim.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [titleBlockHeight, setTitleBlockHeight] = useState(140);
  const onTitleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setTitleBlockHeight(h);
  }, []);
  // The when-row's travel connector: dots are laid out from the measured
  // width (origin dot 5 + gap, disc 20, 7pt pitch), so it always fills the
  // space between the two blocks with whole dots.
  const [travelDots, setTravelDots] = useState(6);
  const onTravelLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTravelDots(Math.max(2, Math.floor((w - 5 - 20 - 12) / 7)));
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
    [windowWidth]
  );

  // ─── Pills + board hue ────────────────────────────────────────────────────
  // The kind pill (Announcement · Special Feature · Event · Entertainment)
  // leads; an announcement's priority rides beside it as a second pill.
  const kindBadge: { label: string; color: string } | null = kind
    ? {
        label:
          kind === 'announcement'
            ? t('notification_center.type_announcement')
            : kind === 'special_feature'
              ? t('notification_center.type_feature')
              : category === 'Entertainment'
                ? t('upcoming_events_editor:category_entertainment')
                : t('upcoming_events_editor:category_event'),
        color: kindHue(kind, category, isDark),
      }
    : null;
  const priorityBadge: { label: string; color: string } | null =
    !!priority && priority !== 'none'
      ? { label: priorityLabel(priority, t), color: priorityHue(priority, theme, isDark) }
      : null;
  const badge = kindBadge ?? priorityBadge;
  // No badge (a plain announcement / special / guide) → a fixed-dark slate
  // board, NOT the theme tint: Mono's tint is near-white and washed the board
  // out under the white title (sim, s81). The board is a photo stand-in, so
  // it follows the photo rule (fixed dark, white ink), not the surface rule.
  const boardHue = badge?.color ?? BOARD_NEUTRAL;

  // ─── Dates ────────────────────────────────────────────────────────────────
  const start = startDateTime ? new Date(startDateTime) : null;
  const end = endDateTime ? new Date(endDateTime) : null;
  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  // ─── Actions (the s74 rule: opening OVER the open sheet is fine) ──────────
  const handleOpenLink = async () => {
    if (!link) return;
    try {
      // Prepend https:// when the stored link has no scheme, else it won't open (e.g. "kevahomes.com").
      const openUrl = /^https?:\/\//i.test(link) ? link : `https://${link}`;
      await WebBrowser.openBrowserAsync(openUrl);
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert(t('content_detail.error_title'), t('content_detail.link_open_failed'));
    }
  };

  const handleViewFile = async () => {
    if (!guideFile) return;
    try {
      await WebBrowser.openBrowserAsync(await resolveForOpen(guideFile.file_url, { tier: 'file' }));
    } catch (error) {
      console.error('Error opening file:', error);
      Alert.alert(t('content_detail.error_title'), t('content_detail.file_open_failed'));
    }
  };

  const handleDownloadFile = async () => {
    if (!guideFile) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('content_detail.sharing_unavailable_title'), t('content_detail.sharing_unavailable_msg'));
        return;
      }
      await WebBrowser.openBrowserAsync(await resolveForOpen(guideFile.file_url, { tier: 'file' }));
      Alert.alert(t('content_detail.download_title'), t('content_detail.download_msg'), [{ text: t('content_detail.ok') }]);
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert(t('content_detail.error_title'), t('content_detail.download_failed'));
    }
  };

  // ─── Hero: photo pager or hue board, title set into it ────────────────────
  const renderSlide = useCallback(
    ({ item }: { item: string }) => (
      <View style={{ width: windowWidth, height: heroHeight }}>
        {thumbnailShape === 'banner' ? (
          <>
            <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
            <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="contain" />
          </>
        ) : (
          <StorageExpoImage source={item} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
      </View>
    ),
    [windowWidth, heroHeight, thumbnailShape]
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
        <LinearGradient
          colors={[boardHue, deepen(boardHue)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={[...SCRIM]}
        locations={[0.36, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* The blur wash — fades in with the scroll so the photo blurs and
          darkens behind the rising title + panel. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: washOpacity }]} pointerEvents="none">
        <BlurView
          intensity={55}
          tint="dark"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
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
      {(!!kindBadge || !!priorityBadge) && (
        <View style={styles.intoLine}>
          {!!kindBadge && (
            <View style={[styles.badge, { backgroundColor: kindBadge.color }]}>
              <Text style={styles.badgeText} numberOfLines={1}>{kindBadge.label.toUpperCase()}</Text>
            </View>
          )}
          {!!priorityBadge && (
            <View style={[styles.badge, { backgroundColor: priorityBadge.color }]}>
              <Text style={styles.badgeText} numberOfLines={1}>{priorityBadge.label.toUpperCase()}</Text>
            </View>
          )}
        </View>
      )}
      <Text style={styles.heroTitle} numberOfLines={3}>{title}</Text>
    </View>
  );

  // ─── Body ─────────────────────────────────────────────────────────────────
  return (
    <GlassHeroSheet
      visible={visible}
      onClose={onClose}
      hero={hero}
      heroHeight={heroHeight}
      scrollY={scrollY}
      pinHero
      onPullDown={onClose}
    >
      {titleBlock}

      {/* The details panel — its own glass over the (blurred) photo as it
          rises; at rest it sits under the hero on the sheet's ground. */}
      <View style={styles.panel}>
        <BlurView
          intensity={28}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        {!!start && (
          // The C1 "when" row (Steve, round 4): calendar tile + STARTS block on
          // the left, a dotted travel line with a chevron, ENDS block on the
          // right — and with no end date the connector and the right block
          // simply aren't there.
          <View style={styles.whenRow}>
            <View style={styles.factsGlyph}>
              <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={16} color={colors.primary} />
            </View>
            <View style={styles.whenBlock}>
              <Text style={[styles.factKey, { color: colors.primary }]}>{t('content_detail.starts').toUpperCase()}</Text>
              <Text style={styles.factDate} numberOfLines={1}>{fmtDate(start)}</Text>
              <Text style={[styles.factTime, { color: colors.primary }]} numberOfLines={1}>{fmtTime(start)}</Text>
            </View>
            {!!end && (
              <>
                <View style={styles.travel} onLayout={onTravelLayout}>
                  {/* Drawn dots (a dotted BORDER renders uneven squares on
                      iOS): a tint origin dot, evenly spaced round dots that
                      fade toward the destination, the chevron in a glass disc. */}
                  <View style={[styles.travelOrigin, { backgroundColor: colors.primary }]} />
                  {Array.from({ length: travelDots }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.travelDot,
                        { backgroundColor: theme.textSecondary, opacity: 0.85 - (i / Math.max(1, travelDots)) * 0.55 },
                      ]}
                    />
                  ))}
                  <View style={styles.travelDisc}>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={11} color={colors.primary} />
                  </View>
                </View>
                <View style={[styles.whenBlock, styles.whenBlockEnd]}>
                  <Text style={[styles.factKey, { color: colors.primary }]}>{t('content_detail.ends').toUpperCase()}</Text>
                  <Text style={styles.factDate} numberOfLines={1}>{fmtDate(end)}</Text>
                  <Text style={[styles.factTime, { color: colors.primary }]} numberOfLines={1}>{fmtTime(end)}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* One row of compact chips (Steve, round 2): the link chip opens the
            link; the file chip's face opens (views) the file and its trailing
            ↓ downloads it. Either alone stretches across the row. */}
        {(!!link || !!guideFile) && (
          <View style={styles.attachedRow}>
            {!!link && (
              <Pressable
                style={styles.attChip}
                onPress={handleOpenLink}
                accessibilityRole="link"
                accessibilityLabel={t('content_detail.open')}
              >
                <View style={[styles.attTile, { backgroundColor: theme.primary + '29', borderColor: theme.primary + '4D' }]}>
                  <IconSymbol ios_icon_name="globe" android_material_icon_name="public" size={15} color={colors.primary} />
                </View>
                <Text style={[styles.attName, { color: colors.text }]} numberOfLines={1}>{linkHost(link)}</Text>
                <IconSymbol ios_icon_name="arrow.up.right" android_material_icon_name="open-in-new" size={13} color={colors.textSecondary} />
              </Pressable>
            )}
            {!!guideFile && (
              <Pressable
                style={styles.attChip}
                onPress={handleViewFile}
                accessibilityLabel={t('content_detail.view')}
              >
                <View style={styles.fileTile}>
                  <Text style={styles.fileTileText}>{fileExt(guideFile)}</Text>
                </View>
                <Text style={[styles.attName, { color: colors.text }]} numberOfLines={1}>
                  {guideFile.title || guideFile.file_name}
                </Text>
                <Pressable
                  style={styles.attDownload}
                  onPress={handleDownloadFile}
                  hitSlop={6}
                  accessibilityLabel={t('content_detail.download')}
                >
                  <IconSymbol ios_icon_name="arrow.down.circle.fill" android_material_icon_name="download" size={16} color={colors.text} />
                </Pressable>
              </Pressable>
            )}
          </View>
        )}

        {/* ⚠️ `desc` deliberately carries NO fontFamily. FormattedText renders
            <b>/<i> by setting fontWeight/fontStyle on nested Text, and
            constants/fonts.ts states outright that fontWeight is unreliable with
            a custom family. Pinning Inter here would flatten authors' bold runs. */}
        {!!content && (
          <FormattedText style={[styles.desc, { color: colors.textSecondary }]}>{content}</FormattedText>
        )}
        {/* The runway: with a photo, the panel can ALWAYS be pulled up over the
            image to read the details on a calm ground, even when the copy is
            two lines — without this a short post has no scroll range and the
            collapse never engages. */}
        {hasPhoto && <View style={{ height: Math.max(0, heroHeight - 120) }} />}
      </View>
    </GlassHeroSheet>
  );
}

function priorityLabel(priority: string, t: (k: string) => string): string {
  switch (priority) {
    case 'new':
      return t('common:priority_new');
    case 'important':
      return t('common:priority_important');
    case 'update':
      return t('common:priority_update');
    default:
      return priority.charAt(0).toUpperCase() + priority.slice(1);
  }
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
    },
    intoLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 9,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
      maxWidth: '55%',
    },
    badgeText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1,
      color: INK_ON_PHOTO,
    },
    heroTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 30,
      lineHeight: 32,
      letterSpacing: -0.6,
      color: INK_ON_PHOTO,
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
    // The "when" row (C1's grammar): calendar tile · STARTS block · dotted
    // travel line + chevron · ENDS block (right-aligned). Start-only posts
    // render the tile + one block and nothing else.
    whenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 9,
      paddingRight: 12,
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.surfaceBorder,
    },
    factsGlyph: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.glassBorder,
    },
    whenBlock: {
      flexShrink: 1,
      minWidth: 0,
      gap: 2,
    },
    whenBlockEnd: {
      alignItems: 'flex-end',
    },
    // The travel connector fills whatever is left between the two blocks —
    // drawn as real round dots (see the JSX note) on a 7pt pitch.
    travel: {
      flex: 1,
      minWidth: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    travelOrigin: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    travelDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
    },
    travelDisc: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 1,
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.glassBorder,
    },
    factKey: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8.5,
      letterSpacing: 1.2,
    },
    factDate: {
      fontFamily: fonts.display.bold,
      fontSize: 15,
      color: theme.text,
    },
    factTime: {
      fontFamily: fonts.mono.semibold,
      fontSize: 11.5,
    },
    // One row of compact attachment chips — 44pt, surface fill, tile · name · glyph.
    attachedRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    attChip: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 44,
      paddingLeft: 7,
      paddingRight: 9,
      borderRadius: 13,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.surfaceBorder,
    },
    attTile: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    // File tile — the PDF red is a fixed pair (dark #E5484D / light #C9363B),
    // matching the mockup; not a theme token because no palette carries one.
    fileTile: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(229,72,77,0.16)',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: 'rgba(229,72,77,0.36)',
    },
    fileTileText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8.5,
      letterSpacing: 0.5,
      color: theme.background === '#181B21' || theme.background === '#1A2332' ? '#E5484D' : '#C9363B',
    },
    attName: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.body.semibold,
      fontSize: 12.5,
    },
    // The ↓ inside the file chip: its own 30pt glass square so the two taps
    // (view vs download) read as two controls.
    attDownload: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: theme.glassBorder,
    },
    desc: {
      fontSize: 15,
      lineHeight: 23,
      marginTop: 14,
      marginBottom: 6,
    },
  });
