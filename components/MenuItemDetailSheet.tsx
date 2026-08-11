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
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '@/components/GlassCard';
import FormattedText from '@/components/FormattedText';
import { StorageExpoImage } from '@/components/StorageImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { fonts } from '@/constants/fonts';
import type { DietKey } from '@/components/MenuFilterSheet';

export type { DietKey } from '@/components/MenuFilterSheet';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

/**
 * The structured shape MenuDisplay hands this sheet — the retirement of
 * buildDetailedDescription's one-big-string blob. Every field maps 1:1 onto a
 * get_menu_items row except `dietary`, which folds the nine is_* booleans into
 * one keyed object.
 */
export interface MenuItemForDetail {
  id: string;
  name: string;
  name_es?: string | null;
  description: string | null;
  description_es?: string | null;
  price: string;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  location?: string | null;
  location_es?: string | null;
  glass_price?: string | null;
  bottle_price?: string | null;
  member_bottle_price?: string | null;
  flavor_profile?: string | null;
  flavor_profile_es?: string | null;
  unique_selling_points?: string | null;
  unique_selling_points_es?: string | null;
  is_active: boolean;
  dietary: Record<DietKey, boolean>;
}

export interface MenuItemDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  item: MenuItemForDetail | null;
  /** Which menu the item lives on — '' on a single-menu org (dropped from the eyebrow). */
  menuLabel: string;
  categoryLabel: string;
  subcategoryLabel?: string | null;
  isWine: boolean;
  /**
   * Carried in the lane contract alongside isWine (MenuDisplay computes both
   * from system_key); Redeem gating already happened in the caller and a
   * libations item renders like any other non-wine item here, so the sheet
   * reads only isWine today.
   */
  isLibations: boolean;
  /** null hides the button — MenuDisplay owns the whole gating chain. */
  redeem: { label: string; onPress: () => void } | null;
}

// Same normalization as MenuDisplay's card price.
const formatPrice = (price: string) => {
  if (price.includes('$')) return price;
  return `$${price}`;
};

// Literal key strings (not `dietary.${k}`) so the i18n harvester can see every
// reference when it cross-checks locales against source.
const DIET_CHIPS: { key: DietKey; abbrevKey: string; labelKey: string }[] = [
  { key: 'gf', abbrevKey: 'dietary.gf_abbrev', labelKey: 'dietary.gf' },
  { key: 'gfa', abbrevKey: 'dietary.gfa_abbrev', labelKey: 'dietary.gfa' },
  { key: 'v', abbrevKey: 'dietary.v_abbrev', labelKey: 'dietary.v' },
  { key: 'va', abbrevKey: 'dietary.va_abbrev', labelKey: 'dietary.va' },
  { key: 'df', abbrevKey: 'dietary.df_abbrev', labelKey: 'dietary.df' },
  { key: 'ef', abbrevKey: 'dietary.ef_abbrev', labelKey: 'dietary.ef' },
  { key: 'nf', abbrevKey: 'dietary.nf_abbrev', labelKey: 'dietary.nf' },
  { key: 'sf', abbrevKey: 'dietary.sf_abbrev', labelKey: 'dietary.sf' },
  { key: 'nos', abbrevKey: 'dietary.nos_abbrev', labelKey: 'dietary.nos' },
];

/**
 * The menu item detail sheet — the approved mockup's hero treatment on the
 * GlassSheet shell language.
 *
 * ⚠️ Deliberately NOT composed from <GlassSheet>: GlassSheet unconditionally
 * renders its grab handle + title row ABOVE the body, and the whole point here
 * is the hero photo flush to the sheet's top edge (the body escapes the shell
 * padding with margins matching GlassSheet's exact 10/18 padding). So, like
 * ContentDetailModal, this mirrors the shell byte-for-byte — same scrim,
 * GlassCard variant="glass" radius 26 intensity 32, same paddings, the same
 * Android bottomPad floor and 88% height cap — and adds the drag-to-dismiss
 * PanResponder riding the grab handle.
 */
export default function MenuItemDetailSheet({
  visible,
  onClose,
  colors,
  item,
  menuLabel,
  categoryLabel,
  subcategoryLabel,
  isWine,
  redeem,
}: MenuItemDetailSheetProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  // The sheet is anchored to the bottom edge, so its last row lands under the
  // Android nav dock / iOS home indicator without this. Same expression as
  // GlassSheet, including the Android floor — a Modal does not always report
  // the nav-bar inset.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(20, insets.bottom + 12, Platform.OS === 'android' ? 36 : 0);

  // ─── Pull-down-to-dismiss (the ContentDetailModal recipe, unchanged) ──────
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

  // ─── Derived content (all guarded — `item` is null while nothing is open) ─
  const name = item ? getLocalizedField(item, 'name', language) : '';
  const description = item ? getLocalizedField(item, 'description', language) : '';
  const location = item && isWine ? getLocalizedField(item, 'location', language) : '';
  const flavor = item ? getLocalizedField(item, 'flavor_profile', language).trim() : '';
  const usp = item ? getLocalizedField(item, 'unique_selling_points', language).trim() : '';

  const heroUrl = item?.thumbnail_url || null;
  // Menu · Category · Subcategory — this line replaces the old blob's
  // Availability/Category/Subcategory tail. Empty parts (single-menu org,
  // no subcategory) drop out.
  const eyebrow = [menuLabel, categoryLabel, subcategoryLabel]
    .filter((p): p is string => !!p && !!p.trim())
    .join(' · ');
  const priceText = item && item.price.trim() ? formatPrice(item.price.trim()) : null;
  // The Redeem button carries the price; the tint chip appears only without it.
  const showPriceChip = !redeem && !!priceText;

  const dietChips = item ? DIET_CHIPS.filter((d) => item.dietary[d.key]) : [];

  type PriceRow = { key: string; labelKey: string; value: string; member?: boolean };
  const priceRows: PriceRow[] = [];
  if (item && isWine) {
    if (item.glass_price?.trim())
      priceRows.push({ key: 'glass', labelKey: 'menu_detail.by_the_glass', value: item.glass_price });
    if (item.bottle_price?.trim())
      priceRows.push({ key: 'bottle', labelKey: 'menu_detail.bottle', value: item.bottle_price });
    if (item.member_bottle_price?.trim())
      priceRows.push({
        key: 'member',
        labelKey: 'menu_detail.member_bottle',
        value: item.member_bottle_price,
        member: true,
      });
  }

  const redeemButton = redeem ? (
    <Pressable
      onPress={redeem.onPress}
      style={[styles.redeemBtn, { backgroundColor: colors.primary }]}
    >
      <Text style={[styles.redeemLabel, { color: colors.fireText }]}>{redeem.label}</Text>
    </Pressable>
  ) : null;

  const priceChip = showPriceChip ? (
    <View style={[styles.priceChip, { backgroundColor: colors.tint }]}>
      {/* Dark ink literal from the mockup: the chip sits on the warm tint over a
          photo, so it must not follow the theme's fireText (white in light mode). */}
      <Text style={styles.priceChipText}>{priceText}</Text>
    </View>
  ) : null;

  // Title, description and the structured sections — shared by the hero and
  // no-hero layouts.
  const body = (
    <>
      <Text style={[styles.title, { color: colors.text }]}>{name}</Text>
      {isWine && !!location && (
        <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
          📍 {location}
        </Text>
      )}
      {!!description && (
        // ⚠️ No fontFamily here, same as ContentDetailModal: FormattedText
        // renders authored <b>/<i> via fontWeight/fontStyle on nested Text, and
        // constants/fonts.ts warns fontWeight is unreliable with custom
        // families — pinning Inter would flatten authors' bold runs.
        <FormattedText style={[styles.desc, { color: colors.textSecondary }]}>
          {description}
        </FormattedText>
      )}

      {dietChips.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_detail.dietary')}
          </Text>
          <View style={styles.chipsWrap}>
            {dietChips.map((d) => (
              <View
                key={d.key}
                style={[
                  styles.dietChip,
                  // 16% fill / 34% border of the badge blue (the mockup's
                  // color-mix values); colors.blue is a 6-digit hex in all four
                  // palettes, so the alpha-suffix idiom applies.
                  { backgroundColor: colors.blue + '29', borderColor: colors.blue + '57' },
                ]}
              >
                <Text style={[styles.dietAbbrev, { color: colors.blueText }]}>{t(d.abbrevKey)}</Text>
                <Text style={[styles.dietLabel, { color: colors.blueText }]}>{t(d.labelKey)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {priceRows.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_detail.pricing')}
          </Text>
          {/* Compact 3-up cells, not full-width stacked rows — the stacked
              version spanned the whole sheet and ate vertical space (Steve's
              smoke call). Label above value, side by side. */}
          <View style={styles.priceCells}>
            {priceRows.map((row) => (
              <View
                key={row.key}
                style={[
                  styles.priceCell,
                  { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                ]}
              >
                <Text
                  style={[styles.priceCellLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {t(row.labelKey)}
                </Text>
                {/* blueText (not blue) for the member price — blue is the badge
                    BACKGROUND token and goes near-invisible as text in dark. */}
                <Text
                  style={[styles.priceCellValue, { color: row.member ? colors.blueText : colors.primary }]}
                  numberOfLines={1}
                >
                  {formatPrice(row.value.trim())}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!!flavor && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_detail.tasting_notes')}
          </Text>
          <FormattedText style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {flavor}
          </FormattedText>
        </View>
      )}

      {!!usp && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_detail.selling_points')}
          </Text>
          <FormattedText style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {usp}
          </FormattedText>
        </View>
      )}
    </>
  );

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
            {item && (
              <>
                {!heroUrl && (
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
                  style={[styles.scroll, !!heroUrl && styles.scrollWithHero]}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {!!heroUrl && (
                    <View style={[styles.hero, { backgroundColor: isWine ? '#FFFFFF' : colors.thumbPlaceholder }]}>
                      {/* Wine bottles are portrait cut-outs — contain on a WHITE
                          ground (Steve's smoke call: labels/bottles are shot on
                          white, so the contained image reads as one continuous
                          edge-to-edge photo). NEVER cover-crop them. */}
                      <StorageExpoImage
                        source={heroUrl}
                        style={styles.heroImage}
                        contentFit={isWine ? 'contain' : 'cover'}
                      />
                      {/* Bottom scrim so the eyebrow/redeem stay legible on any
                          photo — fixed warm-dark literals from the mockup, not
                          theme tokens (the photo is the background). */}
                      <LinearGradient
                        colors={['rgba(14,11,9,0)', 'rgba(14,11,9,0.92)']}
                        locations={[0.42, 0.94]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />
                      {!!eyebrow && (
                        <Text
                          style={[
                            styles.heroEyebrow,
                            // Photo-anchored literal (the mockup's dark-theme
                            // ember): the scrim under it is fixed dark, and
                            // colors.ember goes DARK in the light themes.
                            { color: '#FFB07A' },
                            // Redeem shares the bottom edge — cap the eyebrow so
                            // they sit side by side; otherwise let it run wide.
                            redeem ? styles.heroEyebrowCapped : styles.heroEyebrowWide,
                          ]}
                          numberOfLines={1}
                        >
                          {eyebrow}
                        </Text>
                      )}
                      {priceChip && <View style={styles.heroPriceSlot}>{priceChip}</View>}
                      {redeemButton && <View style={styles.heroRedeemSlot}>{redeemButton}</View>}
                    </View>
                  )}

                  {!heroUrl && (!!eyebrow || !!priceChip || !!redeemButton) && (
                    // Without a hero the overlays still need a home: the same
                    // eyebrow + price-chip-or-Redeem, folded into one row.
                    <View style={styles.metaRow}>
                      {!!eyebrow && (
                        <Text
                          style={[styles.metaEyebrow, { color: colors.ember }]}
                          numberOfLines={1}
                        >
                          {eyebrow}
                        </Text>
                      )}
                      {redeemButton ?? priceChip}
                    </View>
                  )}

                  {body}
                </ScrollView>

                {!!heroUrl && (
                  // The grab handle floats OVER the photo — pinned at the sheet
                  // (not scroll) level so drag-to-dismiss stays reachable after
                  // the body scrolls. At rest it sits exactly where the mockup
                  // draws it: 10pt down, centered.
                  <View {...panResponder.panHandlers} style={styles.dragStrip}>
                    <View style={styles.grabOver} />
                  </View>
                )}

                <View>
                  <Text style={[styles.allergenNote, { color: colors.textSecondary }]}>
                    {t('menu_detail.allergen_note')}
                  </Text>
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
              </>
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
  // Layout box + the animated transform only; all fill/blur/border/radius live
  // on the GlassCard inside. maxHeight here (against the full-height wrap) so
  // the card's flexShrink has a real bound to shrink against.
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
  // Hero-mode handle: white-on-photo literal from the mockup (theme-blind on
  // purpose — it always sits on an image), with a soft shadow for dark photos.
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
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroEyebrow: {
    position: 'absolute',
    left: 14,
    bottom: 16,
    zIndex: 2,
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroEyebrowCapped: { maxWidth: '52%' },
  heroEyebrowWide: { right: 14 },
  heroPriceSlot: { position: 'absolute', top: 12, right: 14, zIndex: 2 },
  heroRedeemSlot: { position: 'absolute', right: 14, bottom: 12, zIndex: 3 },
  priceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  // Mockup literal: dark ink on the warm tint chip, independent of theme.
  priceChipText: { fontFamily: fonts.mono.semibold, fontSize: 14, color: '#14171E' },
  redeemBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(0,0,0,0.4)',
  },
  redeemLabel: { fontFamily: fonts.display.semibold, fontSize: 13.5 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaEyebrow: {
    flexShrink: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: -0.4,
    marginTop: 12,
  },
  // Mono per the mockup, no italic — no italic instance of any bundled family
  // exists, and fontStyle is unreliable with custom families (constants/fonts).
  location: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 6 },
  // ⚠️ No fontFamily — see the FormattedText note at the render site.
  desc: { fontSize: 13.5, lineHeight: 20, marginTop: 7 },
  section: { marginTop: 13 },
  sectionLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  sectionBody: { fontSize: 13.5, lineHeight: 20 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  dietAbbrev: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.4 },
  dietLabel: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  priceCells: { flexDirection: 'row', gap: 7 },
  priceCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 3,
  },
  priceCellLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  priceCellValue: { fontFamily: fonts.mono.semibold, fontSize: 14.5 },
  allergenNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 12,
  },
  closeBtn: {
    marginTop: 9,
    height: 47,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
