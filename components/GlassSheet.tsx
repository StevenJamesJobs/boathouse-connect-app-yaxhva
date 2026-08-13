import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

// `Modal.onDismiss` is the exact "the sheet is gone" signal, but RN fires it on
// iOS ONLY — so the timer is what actually runs the action on Android and merely
// backstops iOS. Hence two durations: Android's tracks the slide-out, while
// iOS's is deliberately long so it can never preempt onDismiss.
const DISMISSED_MS = Platform.OS === 'ios' ? 500 : 300;

/**
 * Hands off from a closing sheet to whatever it opens next.
 *
 * Any sheet action that presents ANOTHER root-level Modal or an Alert must not
 * fire in the same commit as `onClose`: both present on the same parent view
 * controller, and UIKit silently DROPS a presentation issued while a dismissal
 * is still animating — the tap just does nothing, intermittently.
 *
 * Wrap the action in `defer(fn)` and pass `onDismiss` to the GlassSheet.
 * Whichever of onDismiss / the timer lands first runs it; the other finds an
 * empty slot, so it runs exactly once. A still-pending action is DROPPED on
 * unmount rather than flushed — firing a confirmation into a torn-down screen
 * is worse than losing the tap.
 */
export function useSheetHandoff(onClose: () => void) {
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  const defer = useCallback(
    (action: () => void) => {
      // A second tap while the sheet slides out would orphan the first action
      // and leak its timer.
      if (pending.current) return;
      pending.current = action;
      onClose();
      timer.current = setTimeout(onDismiss, DISMISSED_MS);
    },
    [onClose, onDismiss],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
    },
    [],
  );

  return { defer, onDismiss };
}

interface GlassSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Pinned under the title — a "which item is this about" line that must stay
   * visible while a long body scrolls. Rendered inside the styled Text, so pass
   * a string or nested <Text>, not a View.
   */
  subtitle?: React.ReactNode;
  /**
   * Optional control in the title row, left of the ✕ — e.g. the category
   * sheet's Edit / Done toggle. Keeps a sheet-level mode switch out of the body,
   * so it stays put while the body scrolls or turns into a drag list.
   */
  headerAction?: React.ReactNode;
  /** Set false when the body does its own scrolling (e.g. a nested list). */
  scroll?: boolean;
  /** Pinned under the scroll body — button rows that must never scroll away. */
  footer?: React.ReactNode;
  /**
   * iOS ONLY (RN exposes it nowhere else): fires once the Modal has finished
   * dismissing. A sheet that hands off to another root-level modal or an Alert
   * uses it to sequence the presentation — see GlassActionSheet.
   */
  onDismiss?: () => void;
}

/**
 * The shared glass bottom sheet — the `sheetShell` language from
 * app/rewards-and-reviews-editor.tsx:997 (scrim + GlassCard variant="glass"
 * radius 26 intensity 32 + grab handle), lifted into a real component so the
 * sheets across a screen animate and measure identically.
 *
 * ⚠️ This is a TOP-LEVEL component on purpose. The rewards editor's in-file
 * comment (:994-996) warns that a `<Sheet/>` *redefined inside a screen's
 * render* remounts every render and drops TextInput focus on each keystroke.
 * A stable module-level component has none of that problem — but do NOT copy
 * this file's shape back inside a screen function.
 *
 * Uses `animationType="slide"` + a separate Pressable scrim, matching the
 * rewards-editor / redeem-settings family (the MultiSelectField family fades
 * instead — two conventions exist; a screen should not mix them).
 */
export default function GlassSheet({
  visible,
  onClose,
  title,
  children,
  subtitle,
  headerAction,
  scroll = true,
  footer,
  onDismiss,
}: GlassSheetProps) {
  const colors = useThemeColors();
  // The sheet is anchored to the bottom edge, so its last row lands under the
  // Android nav dock / iOS home indicator without this. The Android floor is
  // deliberate: a Modal does not always report the nav-bar inset, and the rows
  // that suffered are the ones you must be able to hit — `＋ New category…`
  // and the Cancel/Save pair.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(20, insets.bottom + 12, Platform.OS === 'android' ? 36 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.scrim} onPress={onClose} />
        <GlassCard
          variant="glass"
          radius={26}
          intensity={32}
          style={[styles.sheet, { paddingBottom: bottomPad }]}
        >
          <View style={[styles.grab, { backgroundColor: colors.glassBorder }]} />
          <View style={[styles.titleRow, !!subtitle && styles.titleRowTight]}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {headerAction}
            <Pressable onPress={onClose} style={styles.close}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {!!subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          )}

          {scroll ? (
            <ScrollView
              style={styles.bodyScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.bodyContent}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}

          {footer}
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,10,18,0.55)' },
  sheet: {
    // Top corners only — the sheet is flush to the bottom edge.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    // Overridden per-render with the safe-area inset; kept as the floor.
    paddingBottom: 20,
    maxHeight: '88%',
    // Shrinkable against the KAV wrap's DEFINITE height (maxHeight alone does
    // not give Yoga a constraint context to shrink children under) — this is
    // what lets bodyScroll's flexShrink actually bound the viewport when a
    // sheet's content is taller than the cap, keyboard open included.
    flexShrink: 1,
  },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  // A subtitle belongs to the title, not to the body — pair it tight and let it
  // own the 12pt gap above the scroll instead.
  titleRowTight: { marginBottom: 4 },
  // flexShrink:1 (RN defaults it to 0) so a long ES sheet title ellipsizes
  // instead of shoving the ✕ off the row.
  title: { flex: 1, flexShrink: 1, fontFamily: fonts.display.bold, fontSize: 19, letterSpacing: -0.2 },
  // 44×44 (the HIG minimum) as a REAL layout box — it, not the 20pt glyph, sets
  // the row's height. hitSlop cannot do this job: neither platform dispatches a
  // touch that lands outside the PARENT, so slop escaping a ~23pt-tall titleRow
  // is dead space. flex-end keeps the glyph flush to the sheet's right padding
  // and grows the target inward.
  close: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  // flexShrink:1 on the SCROLLVIEW (RN defaults it to 0): when a sheet's body
  // is taller than GlassCard's `maxHeight: '88%'`, the unshrinkable ScrollView
  // used to take its full content height and get CLIPPED by the card's
  // overflow:'hidden' — contentSize equalled the view's height, so there was
  // nothing to scroll, just the iOS rubber-band (the s69 Add/Edit form was the
  // first body tall enough to hit it). Shrinking bounds the viewport inside
  // the card, which is what makes the body actually scrollable; sheets that
  // fit keep their content-sized height (flexGrow stays 0), so shorter sheets
  // render exactly as before.
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  // ⚠️ The SCROLL branch's content container must NOT be shrinkable: Yoga
  // shrinks it to the viewport, contentSize == bounds, and the sheet "scrolls"
  // by rubber-band only while everything past the fold is clipped (the s69
  // Add/Edit smoke, twice). Shrink belongs to bodyScroll (the viewport), never
  // to the content.
  bodyContent: { gap: 9, paddingBottom: 4 },
  // flexShrink:1 (RN defaults it to 0) so the non-scroll body can give height
  // back under GlassCard's `maxHeight: '88%'`. Without it the negative free
  // space stops here and never reaches a child that CAN shrink — a nested drag
  // list would simply be clipped, since GlassCard is overflow:'hidden'.
  body: { gap: 9, paddingBottom: 4, flexShrink: 1 },
});
