import React, { useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

/**
 * The hero-photo variant of the glass bottom sheet — MenuItemDetailSheet's
 * shell, extracted for the recipe detail sheets (s73: Cocktails A-Z + the
 * Libations viewers) so the photo-flush-to-the-top continuity is one component
 * instead of a fourth hand-mirrored copy.
 *
 * Deliberately NOT composed from <GlassSheet>: GlassSheet unconditionally
 * renders its grab handle + title row ABOVE the body, and the whole point is
 * the hero bleeding to the sheet's top edge. This mirrors the shell
 * byte-for-byte — same scrim, GlassCard variant="glass" radius 26 intensity 32,
 * same 10/18 paddings, Android bottomPad floor, 88% cap — and keeps
 * MenuItemDetailSheet's pull-down-to-dismiss riding the grab handle.
 *
 * `hero` renders inside a full-bleed 196pt box at the very top (pass the image
 * + any scrim/overlays); without it the grab sits in its normal spot and the
 * body starts at the top like a regular sheet. The footer defaults to the
 * pinned Close button; pass `footer` to replace it (per MenuItemDetailSheet,
 * actions that present anything must defer past the dismissal).
 */
interface GlassHeroSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Full-bleed hero content (image + overlays). Box + top radii come from the sheet. */
  hero?: React.ReactNode;
  children: React.ReactNode;
  /** Replaces the default pinned Close button row. */
  footer?: React.ReactNode;
}

export default function GlassHeroSheet({
  visible,
  onClose,
  hero,
  children,
  footer,
}: GlassHeroSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Same expression as GlassSheet, including the Android floor — a Modal does
  // not always report the nav-bar inset.
  const bottomPad = Math.max(20, insets.bottom + 12, Platform.OS === 'android' ? 36 : 0);

  // ─── Pull-down-to-dismiss (the ContentDetailModal recipe, unchanged) ──────
  const translateY = useRef(new Animated.Value(0)).current;
  const dragDismissing = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD) {
          dragDismissing.current = true;
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
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

  return (
    <Modal
      visible={visible}
      animationType={dragDismissing.current ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={() => {
        translateY.setValue(0);
        dragDismissing.current = false;
      }}
    >
      <View style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} />
        {/* The drag translate stays on this OUTER view — GlassCard is a plain
            function component (no forwardRef), so it cannot be wrapped by
            Animated.createAnimatedComponent. The shell owns the 88% cap; the
            card shrinks inside it. */}
        <Animated.View style={[styles.shell, { transform: [{ translateY }] }]}>
          <GlassCard
            variant="glass"
            radius={26}
            intensity={32}
            style={[styles.sheet, { paddingBottom: bottomPad }]}
          >
            {!hero && (
              // No photo → the grab handle keeps its normal GlassSheet
              // position above the body. The pan handlers ride it.
              <View {...panResponder.panHandlers} style={styles.dragArea}>
                <View style={[styles.grab, { backgroundColor: colors.glassBorder }]} />
              </View>
            )}

            <ScrollView
              // The body escapes the shell's padding (10 top / 18 horizontal —
              // GlassSheet's exact values) so the hero can sit flush to the
              // sheet's top edge, then the content container pads the normal
              // sections back in. A negative top margin ON the hero itself
              // would land above scroll offset 0 and be clipped.
              style={[styles.scroll, !!hero && styles.scrollWithHero]}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {!!hero && (
                <View style={[styles.hero, { backgroundColor: colors.thumbPlaceholder }]}>
                  {hero}
                </View>
              )}
              {children}
            </ScrollView>

            {!!hero && (
              // The grab handle floats OVER the photo — pinned at the sheet
              // (not scroll) level so drag-to-dismiss stays reachable after
              // the body scrolls.
              <View {...panResponder.panHandlers} style={styles.dragStrip}>
                <View style={styles.grabOver} />
              </View>
            )}

            {footer ?? (
              <View style={styles.footerRow}>
                <Pressable
                  style={[
                    styles.closeBtn,
                    { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  ]}
                  onPress={onClose}
                >
                  <Text style={[styles.closeLabel, { color: colors.textSecondary }]}>
                    {t('common.close')}
                  </Text>
                </Pressable>
              </View>
            )}
          </GlassCard>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,10,18,0.55)' },
  shell: { maxHeight: '88%' },
  sheet: {
    // Top corners only — the sheet is flush to the bottom edge.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    // Overridden per-render with the safe-area inset; kept as the floor.
    paddingBottom: 20,
    flexShrink: 1,
  },
  // No-hero grab handle — GlassSheet's grab, with the drag target's padding.
  dragArea: { alignItems: 'center', paddingBottom: 10 },
  grab: { width: 40, height: 4, borderRadius: 2 },
  // Hero-mode handle: white-on-photo literal (it always sits on an image).
  dragStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 34,
    alignItems: 'center',
    zIndex: 4,
  },
  grabOver: {
    marginTop: 10,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
    boxShadow: '0px 1px 3px rgba(0,0,0,0.35)',
  },
  scroll: {
    // Escape the sheet's 18pt side padding; scrollContent restores it. This is
    // what lets the hero (with its own -18 margins) bleed to the card's edges.
    marginHorizontal: -18,
    flexGrow: 0,
    flexShrink: 1,
  },
  // Hero mode also cancels the sheet's 10pt top padding so the photo is flush
  // to the top edge.
  scrollWithHero: { marginTop: -10 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 4 },
  hero: {
    marginHorizontal: -18,
    height: 196,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    flexShrink: 0,
  },
  footerRow: { flexDirection: 'row', gap: 11 },
  closeBtn: {
    flex: 1,
    marginTop: 9,
    height: 47,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  closeLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
