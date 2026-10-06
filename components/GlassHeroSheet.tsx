import React, { useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { Platform } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { SheetHeaderZone, useSheetDismiss } from '@/components/sheetDismiss';

/**
 * The hero-photo variant of the glass bottom sheet — the shell under the
 * Poster (components/PosterSheet.tsx) and the plain hero sheets.
 *
 * Deliberately NOT composed from <GlassSheet>: GlassSheet unconditionally
 * renders its grab handle + title row ABOVE the body, and the whole point is
 * the hero bleeding to the sheet's top edge. This mirrors the shell
 * byte-for-byte — same scrim, GlassCard variant="glass" radius 26 intensity 32,
 * same 10/18 paddings, Android bottomPad floor, 88% cap.
 *
 * `hero` renders inside a full-bleed box at the very top (pass the image +
 * any scrim/overlays); without it the grab sits in its normal spot and the
 * body starts at the top like a regular sheet. The footer defaults to the
 * pinned Close button; pass `footer` to replace it (actions that present
 * anything must defer past the dismissal — useSheetHandoff).
 *
 * s89: swipe-down-to-dismiss from anywhere (components/sheetDismiss.tsx) —
 * the grab strip always, the body whenever its scroll is at the top. That is
 * also the Poster's two-stage pull: a drag that begins with the panel UP only
 * restores the photo; a fresh drag at rest pulls the sheet down.
 */
interface GlassHeroSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Full-bleed hero content (image + overlays). Box + top radii come from the sheet. */
  hero?: React.ReactNode;
  /** Hero box height — 196 (plain hero sheets); the Poster passes ~46% of the window. */
  heroHeight?: number;
  /**
   * The Poster collapse (s81): pass an Animated.Value and the sheet drives it
   * from the body scroll (native driver). With `pinHero` the hero is
   * translated by that same value so it STAYS PUT while the children slide up
   * over it — the caller uses the value to blur / darken its hero as the
   * panel rises. Without `pinHero` the hero scrolls away like any content.
   */
  scrollY?: Animated.Value;
  pinHero?: boolean;
  children: React.ReactNode;
  /** Replaces the default pinned Close button row. */
  footer?: React.ReactNode;
  /** s89 escape hatch — see GlassSheet. */
  dragToDismiss?: boolean;
}

export default function GlassHeroSheet({
  visible,
  onClose,
  hero,
  heroHeight = 196,
  scrollY,
  pinHero = false,
  children,
  footer,
  dragToDismiss = true,
}: GlassHeroSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Same expression as GlassSheet, including the Android floor — a Modal does
  // not always report the nav-bar inset.
  const bottomPad = Math.max(20, insets.bottom + 12, Platform.OS === 'android' ? 36 : 0);

  const dragDismissingRef = useRef(false);
  const { gesture, bodyNative, shellStyle, trackBodyScroll, reset, contextValue, SheetDismissProvider } = useSheetDismiss({
    onClose,
    dragDismissingRef,
    enabled: dragToDismiss,
    bodyTracked: true,
  });

  // The body scroll feeds the Poster's scrollY (native driver) AND the dismiss
  // pan's at-top check (JS listener) from the one event.
  const onBodyScroll = scrollY
    ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: trackBodyScroll,
      })
    : trackBodyScroll;

  return (
    <Modal
      visible={visible}
      animationType={dragDismissingRef.current ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={reset}
    >
      <GestureHandlerRootView style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <SheetDismissProvider value={contextValue}>
          <GestureDetector gesture={gesture}>
            {/* The drag translate stays on this OUTER view — GlassCard is a plain
                function component (no forwardRef), so it cannot be wrapped by
                Animated.createAnimatedComponent. The shell owns the 88% cap; the
                card shrinks inside it. */}
            <Reanimated.View style={[styles.shell, shellStyle]}>
              <GlassCard
                variant="glass"
                radius={26}
                androidBaseAlpha={0.98}
                intensity={32}
                style={[styles.sheet, { paddingBottom: bottomPad }]}
              >
                {!hero && (
                  // No photo → the grab handle keeps its normal GlassSheet
                  // position above the body.
                  <SheetHeaderZone style={styles.dragArea}>
                    <View style={[styles.grab, { backgroundColor: colors.glassBorder }]} />
                  </SheetHeaderZone>
                )}

                <GestureDetector gesture={bodyNative}>
                <Animated.ScrollView
                  // The body escapes the shell's padding (10 top / 18 horizontal —
                  // GlassSheet's exact values) so the hero can sit flush to the
                  // sheet's top edge, then the content container pads the normal
                  // sections back in. A negative top margin ON the hero itself
                  // would land above scroll offset 0 and be clipped.
                  style={[styles.scroll, !!hero && styles.scrollWithHero]}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  onScroll={onBodyScroll}
                  scrollEventThrottle={16}
                  // The dismiss pan takes an at-top pull; no rubber-band to fight it.
                  bounces={false}
                >
                  {!!hero && (
                    <Animated.View
                      style={[
                        styles.hero,
                        { height: heroHeight, backgroundColor: colors.thumbPlaceholder },
                        // Pinned: translate by the scroll offset so the hero holds
                        // the sheet's top while the children ride up over it.
                        pinHero && scrollY
                          ? {
                              transform: [
                                {
                                  translateY: scrollY.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 1],
                                    extrapolateLeft: 'clamp',
                                  }),
                                },
                              ],
                            }
                          : null,
                      ]}
                    >
                      {hero}
                    </Animated.View>
                  )}
                  {pinHero ? <View style={styles.overHero}>{children}</View> : children}
                </Animated.ScrollView>
                </GestureDetector>

                {!!hero && (
                  // The grab handle floats OVER the photo — pinned at the sheet
                  // (not scroll) level so it stays reachable after the body scrolls.
                  <SheetHeaderZone style={styles.dragStrip}>
                    <View style={styles.grabOver} />
                  </SheetHeaderZone>
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
            </Reanimated.View>
          </GestureDetector>
        </SheetDismissProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,10,18,0.55)' },
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
  // Pinned-hero mode: the children draw ABOVE the translated hero.
  overHero: { zIndex: 1 },
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
