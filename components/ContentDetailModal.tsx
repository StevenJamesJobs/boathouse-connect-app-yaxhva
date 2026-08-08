
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import GlassCard from '@/components/GlassCard';
import ImageCarousel from '@/components/ImageCarousel';
import FormattedText from '@/components/FormattedText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { resolveForOpen } from '@/utils/storageResolver';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

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
  link?: string | null;
  guideFile?: GuideFile | null;
  redeemAction?: {
    label: string;
    onPress: () => void;
  } | null;
  // ⚠️ DO NOT WIDEN. Six callers pass this, and three of them (view-all-events,
  // view-all-specials, PortalHome) hand-build a five-key literal rather than
  // forwarding the whole ThemeColorSet — adding a required key here breaks all
  // three at once. The glass tokens are read from `useThemeColors()` inside the
  // component instead; every caller sources this object from that same hook, so
  // the two always describe the same palette.
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
  link,
  guideFile,
  redeemAction,
  colors,
}: ContentDetailModalProps) {
  // ─── Pull-down-to-dismiss ─────────────────────────────────────────────────
  const { t } = useTranslation();
  // Glass tokens only — everything the `colors` PROP already covers keeps
  // reading from the prop, so a caller passing the five-key literal is unaffected.
  const theme = useThemeColors();
  // The sheet is anchored to the bottom edge, so its last row lands under the
  // Android nav dock / iOS home indicator without this. Same expression as
  // GlassSheet, including the Android floor — a Modal does not always report
  // the nav-bar inset.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(20, insets.bottom + 12, Platform.OS === 'android' ? 36 : 0);
  const translateY = useRef(new Animated.Value(0)).current;
  const dragDismissing = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture downward vertical gestures from the handle area
        return gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward movement
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD) {
          dragDismissing.current = true;
          // Animate off screen then close — don't reset translateY until modal reopens
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    try {
      const date = new Date(dateTime);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateTime;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'new':
        // The palette's own "NEW / notification badge" hue.
        return theme.blue;
      case 'important':
        // Destructive red stays a literal: no palette carries a danger token.
        return '#E74C3C';
      case 'update':
        return theme.tint;
      default:
        return colors.textSecondary;
    }
  };

  const getPriorityLabel = (priority: string) => {
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
  };

  const handleOpenLink = async () => {
    if (!link) return;

    try {
      // Prepend https:// when the stored link has no scheme, else it won't open (e.g. "kevahomes.com").
      const openUrl = /^https?:\/\//i.test(link) ? link : `https://${link}`;
      console.log('Opening link:', openUrl);
      await WebBrowser.openBrowserAsync(openUrl);
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('Error', 'Could not open the link');
    }
  };

  const handleViewFile = async () => {
    if (!guideFile) return;

    try {
      console.log('Opening file:', guideFile.file_url);
      await WebBrowser.openBrowserAsync(await resolveForOpen(guideFile.file_url, { tier: 'file' }));
    } catch (error) {
      console.error('Error opening file:', error);
      Alert.alert('Error', 'Could not open the file');
    }
  };

  const handleDownloadFile = async () => {
    if (!guideFile) return;

    try {
      console.log('Downloading file:', guideFile.file_url);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Available', 'Sharing is not available on this device. Please use the View button to open the file.');
        return;
      }

      await WebBrowser.openBrowserAsync(await resolveForOpen(guideFile.file_url, { tier: 'file' }));

      Alert.alert(
        'Download',
        'The file will be downloaded by your browser. You can find it in your downloads folder.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert('Error', 'Could not download the file');
    }
  };

  const startDateTimeFormatted = formatDateTime(startDateTime || null);
  const endDateTimeFormatted = formatDateTime(endDateTime || null);
  const priorityColor = priority ? getPriorityColor(priority) : colors.textSecondary;
  const priorityUpperCase = priority ? getPriorityLabel(priority).toUpperCase() : '';

  const allImages: string[] = [];
  if (imageUrls && imageUrls.length > 0) {
    allImages.push(...imageUrls);
  } else if (thumbnailUrl) {
    allImages.push(thumbnailUrl);
  }

  return (
    <Modal
      visible={visible}
      animationType={dragDismissing.current ? 'none' : 'slide'}
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={() => {
        translateY.setValue(0);
        dragDismissing.current = false;
      }}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* The drag translate stays on this OUTER view. GlassCard is a plain
            function component (no forwardRef), so it cannot be wrapped by
            Animated.createAnimatedComponent — the shell animates and the glass
            rides inside it. The shell owns the 90% height; the card fills it. */}
        <Animated.View style={[styles.sheetShell, { transform: [{ translateY }] }]}>
          <GlassCard
            variant="glass"
            radius={26}
            intensity={32}
            style={[styles.sheet, { paddingBottom: bottomPad }]}
          >
            {/* Drag Handle — the pan handlers stay on THIS node, unchanged. */}
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={[styles.dragHandle, { backgroundColor: theme.glassBorder }]} />
            </View>

            <View style={[styles.modalHeader, { borderBottomColor: theme.hairline }]}>
              {/* No numberOfLines: this is a CONTENT title (a guide/event/special
                  name), not a fixed sheet label — it wraps rather than truncating.
                  flexShrink:1 (RN defaults it to 0) keeps the 44pt close box on
                  the row when the title is long. */}
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {allImages.length > 0 && (
                <ImageCarousel
                  images={allImages}
                  thumbnailShape={thumbnailShape}
                />
              )}

              {link && (
                <View style={styles.buttonSection}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={handleOpenLink}
                    activeOpacity={0.8}
                  >
                    <IconSymbol
                      ios_icon_name="link"
                      android_material_icon_name="link"
                      size={20}
                      color={colors.fireText}
                    />
                    <Text style={[styles.actionButtonText, { color: colors.fireText }]}>View More Information</Text>
                  </TouchableOpacity>
                </View>
              )}

              {redeemAction && (
                <View style={styles.buttonSection}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={redeemAction.onPress}
                    activeOpacity={0.8}
                  >
                    <IconSymbol
                      ios_icon_name="gift.fill"
                      android_material_icon_name="card-giftcard"
                      size={20}
                      color={colors.fireText}
                    />
                    <Text style={[styles.actionButtonText, { color: colors.fireText }]}>{redeemAction.label}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {guideFile && (
                <View style={styles.buttonSection}>
                  <View style={styles.fileButtons}>
                    <TouchableOpacity
                      style={[styles.fileButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={handleViewFile}
                      activeOpacity={0.8}
                    >
                      <IconSymbol
                        ios_icon_name="eye.fill"
                        android_material_icon_name="visibility"
                        size={20}
                        color={colors.fireText}
                      />
                      <Text style={[styles.fileButtonText, { color: colors.fireText }]}>View</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.fileButton, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
                      onPress={handleDownloadFile}
                      activeOpacity={0.8}
                    >
                      <IconSymbol
                        ios_icon_name="arrow.down.circle.fill"
                        android_material_icon_name="download"
                        size={20}
                        color={colors.text}
                      />
                      <Text style={[styles.fileButtonText, { color: colors.text }]}>Download</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {priority && priority !== 'none' && (
                <View style={styles.detailSection}>
                  {/* Stays a SOLID hue pill — a status flag is the one place the
                      glass language keeps saturation (cf. the nav count badge).
                      `fireText` is the palette's on-fill ink, so the label now
                      inverts correctly in dark mode instead of being fixed white. */}
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
                    {priority === 'new' && (
                      <IconSymbol
                        ios_icon_name="star.fill"
                        android_material_icon_name="star"
                        size={12}
                        color={colors.fireText}
                      />
                    )}
                    <Text style={[styles.priorityText, { color: colors.fireText }]}>{priorityUpperCase}</Text>
                  </View>
                </View>
              )}

              {(startDateTime || endDateTime) && (
                <View style={styles.detailSection}>
                  {startDateTime && (
                    <View style={styles.dateTimeRow}>
                      <IconSymbol
                        ios_icon_name="calendar"
                        android_material_icon_name="event"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>Start:</Text>
                      <Text style={[styles.dateTimeText, { color: colors.text }]}>
                        {startDateTimeFormatted}
                      </Text>
                    </View>
                  )}
                  {endDateTime && (
                    <View style={styles.dateTimeRow}>
                      <IconSymbol
                        ios_icon_name="clock"
                        android_material_icon_name="schedule"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>End:</Text>
                      <Text style={[styles.dateTimeText, { color: colors.text }]}>
                        {endDateTimeFormatted}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.detailSection}>
                {/* ⚠️ `detailText` deliberately carries NO fontFamily. FormattedText
                    renders <b>/<i> by setting fontWeight/fontStyle on nested Text,
                    and constants/fonts.ts states outright that fontWeight is
                    unreliable with a custom family (weight is baked into the family
                    name instead). Pinning Inter here would silently flatten every
                    bold run authors have written into announcements, events,
                    specials and guides. Body copy stays on the system face until
                    FormattedText itself is taught to map bold → fonts.body.semibold. */}
                <FormattedText style={[styles.detailText, { color: colors.textSecondary }]}>{content}</FormattedText>
              </View>
            </ScrollView>
          </GlassCard>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,10,18,0.55)',
  },
  // Layout box + the animated transform only. All fill/blur/border/radius live
  // on the GlassCard inside it.
  sheetShell: {
    height: '90%',
  },
  sheet: {
    flex: 1,
    // Top corners only — the sheet is flush to the bottom edge.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    // No horizontal padding: the header and the scroll body each own their 20pt
    // inset, because ImageCarousel sizes its pages to `window.width - 40` and
    // would tear if the sheet inset the content a second time.
    paddingHorizontal: 0,
    paddingTop: 0,
    // Overridden per-render with the safe-area inset; kept as the floor.
    paddingBottom: 20,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth + 0.5,
  },
  modalTitle: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fonts.display.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  // 44×44 (the HIG minimum) as a REAL layout box, matching GlassSheet: hitSlop
  // cannot do this job because neither platform dispatches a touch landing
  // outside the PARENT. flex-end keeps the glyph flush to the header's inset.
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    // 20pt horizontal is a contract with ImageCarousel — see `sheet` above.
    padding: 20,
    // The sheet's safe-area inset now carries the dock clearance the old flat
    // 60 was standing in for.
    paddingBottom: 24,
  },
  buttonSection: {
    marginBottom: 18,
  },
  detailSection: {
    marginBottom: 18,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 9,
  },
  priorityText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateTimeLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  dateTimeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    flex: 1,
  },
  detailText: {
    fontSize: 15,
    lineHeight: 23,
    whiteSpace: 'pre-line',
  } as any,
  // The hairline border is on BOTH button variants so the filled and the glass
  // one measure to the same height in a row.
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 10,
  },
  actionButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
  fileButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 8,
  },
  fileButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
});
