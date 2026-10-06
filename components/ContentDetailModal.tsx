import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import PosterSheet, { PosterPill, POSTER_SLATE } from '@/components/PosterSheet';
import { StorageExpoImage } from '@/components/StorageImage';
import { IconSymbol } from '@/components/IconSymbol';
import FormattedText from '@/components/FormattedText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSheetHandoff } from '@/components/GlassSheet';
import { fonts } from '@/constants/fonts';
import { resolveForOpen } from '@/utils/storageResolver';
import { kindHue, priorityHue, type ContentKind } from '@/components/content/contentVisuals';

/**
 * ContentDetailModal (s81 "C3 Poster"; s89: rides the shared PosterSheet):
 * the tap-through for Announcements · Special Features · Upcoming Events ·
 * Guides · general Notifications.
 *
 * The Poster shell (photo pager ~46% of the window, title set INTO the photo
 * under a pill row, blur wash + glass panel sliding over the pinned hero,
 * swipe-to-dismiss) lives in components/PosterSheet.tsx. This file owns the
 * CONTENT grammar: the kind / priority pills, the C1 "when" row (calendar
 * tile · STARTS · travel connector · ENDS), the ONE row of attachment chips
 * ABOVE the description, the copy.
 *
 * Notifications (s89, D1): `kind='notification'` draws a "Notification" pill;
 * with no photo attached the board is tinted from the theme primary and
 * carries the org's LOGO (`orgLogoUrl`, the Memory-card-back grammar) instead
 * of the old grey slab; `meta` is the sender line under the title; `action`
 * is the "Opens to" destination as the one chip.
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
  /** The post type — drives the title pill. Omit for guides. 'notification' = a general push (s89). */
  kind?: ContentKind | 'notification';
  link?: string | null;
  guideFile?: GuideFile | null;
  /** Notifications: the org logo for the no-photo board (public bucket URL). */
  orgLogoUrl?: string | null;
  /** Notifications: "Sender · when · opens to" line under the title. */
  meta?: string | null;
  /** Notifications: the destination chip (navigates → runs after the sheet closes). */
  action?: { label: string; onPress: () => void } | null;
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

function fileExt(file: GuideFile): string {
  const fromType = (file.file_type || '').split('/').pop() || '';
  const fromName = (file.file_name || '').split('.').pop() || '';
  const raw = (fromName.length <= 4 ? fromName : fromType) || fromType || 'FILE';
  return raw.toUpperCase().slice(0, 4);
}

function linkHost(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Mix a hex toward a dark navy — the notification board's deep end. */
function tintBoard(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return POSTER_SLATE;
  const n = parseInt(clean, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // 70% primary over the ring navy (#1F2334) — the mockup's logoboard top.
  const mix = (a: number, t: number) => Math.round(a * 0.7 + t * 0.3);
  return `#${[mix(r, 31), mix(g, 35), mix(b, 52)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
  orgLogoUrl,
  meta,
  action,
  colors,
}: ContentDetailModalProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const locale = language === 'es' ? 'es' : 'en-US';
  // The destination chip navigates — never in the same commit as the close.
  const { defer } = useSheetHandoff(onClose);

  const images = useMemo<string[]>(() => {
    if (imageUrls && imageUrls.length > 0) return imageUrls;
    return thumbnailUrl ? [thumbnailUrl] : [];
  }, [imageUrls, thumbnailUrl]);
  const hasPhoto = images.length > 0;
  const isNotification = kind === 'notification';

  // The when-row's travel connector: dots are laid out from the measured
  // width (origin dot 5 + gap, disc 20, 7pt pitch), so it always fills the
  // space between the two blocks with whole dots.
  const [travelDots, setTravelDots] = useState(6);
  const onTravelLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTravelDots(Math.max(2, Math.floor((w - 5 - 20 - 12) / 7)));
  }, []);

  // ─── Pills + board hue ────────────────────────────────────────────────────
  // The kind pill (Announcement · Special Feature · Event · Entertainment ·
  // Notification) leads; an announcement's priority rides beside it.
  const kindBadge: { label: string; color: string } | null = isNotification
    ? { label: t('notification_center.type_notification'), color: POSTER_SLATE }
    : kind
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
  // No badge (a plain announcement / special / guide) → fixed-dark slate, NOT
  // the theme tint (near-white on Mono, washed out under the white title).
  // A notification's board is tinted from the primary so the org logo reads
  // as branding, not as a missing photo.
  const boardHue = isNotification ? tintBoard(colors.primary) : (badge?.color ?? POSTER_SLATE);

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

  // The org logo on the notification board: contained, ~46% wide, lifted a
  // little above centre so the title block's scrim never crowds it.
  const boardContent =
    isNotification && !!orgLogoUrl ? (
      <View style={styles.logoWrap} pointerEvents="none">
        <View style={styles.logoPlate}>
          <StorageExpoImage source={orgLogoUrl} style={styles.logo} contentFit="contain" />
        </View>
      </View>
    ) : undefined;

  const pills =
    kindBadge || priorityBadge ? (
      <>
        {!!kindBadge && <PosterPill label={kindBadge.label} color={kindBadge.color} />}
        {!!priorityBadge && <PosterPill label={priorityBadge.label} color={priorityBadge.color} />}
      </>
    ) : undefined;

  return (
    <PosterSheet
      visible={visible}
      onClose={onClose}
      images={images}
      imageShape={thumbnailShape}
      boardColor={boardHue}
      boardContent={boardContent}
      pills={pills}
      title={title}
    >
      {!!meta && (
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>
          {meta}
        </Text>
      )}

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
          ↓ downloads it; a notification's destination is its own chip.
          Either alone stretches across the row. */}
      {(!!link || !!guideFile || !!action) && (
        <View style={styles.attachedRow}>
          {!!action && (
            <Pressable
              style={[styles.attChip, styles.actionChip, { backgroundColor: colors.primary }]}
              onPress={() => defer(action.onPress)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <IconSymbol ios_icon_name="arrow.up.right.square" android_material_icon_name="open-in-new" size={15} color={colors.fireText} />
              <Text style={[styles.attName, { color: colors.fireText }]} numberOfLines={1}>{action.label}</Text>
            </Pressable>
          )}
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
      {/* No-photo posts get a short runway too (the photo case gets its own
          in PosterSheet) so the panel can still rise over the board a little. */}
      {!hasPhoto && <View style={{ height: 24 }} />}
    </PosterSheet>
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
    // The org logo on the notification board.
    logoWrap: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 44,
    },
    logoPlate: {
      width: '46%',
      aspectRatio: 1.6,
      borderRadius: 18,
      backgroundColor: '#F4F2EE',
      padding: 10,
      boxShadow: '0px 10px 30px rgba(0,0,0,0.35)',
    },
    logo: { width: '100%', height: '100%' },
    // Sender · when · opens-to line (mono, quiet).
    meta: {
      fontFamily: fonts.mono.medium,
      fontSize: 10.5,
      letterSpacing: 0.3,
      marginBottom: 10,
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
    // The notification's destination chip: filled primary, centred.
    actionChip: {
      justifyContent: 'center',
      paddingLeft: 12,
      paddingRight: 12,
      borderWidth: 0,
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
      flexShrink: 1,
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
