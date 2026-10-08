import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import PosterSheet, { PosterPill, POSTER_SLATE } from '@/components/PosterSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useSheetHandoff } from '@/components/GlassSheet';
import FormattedText from '@/components/FormattedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { fonts } from '@/constants/fonts';
import type { DietKey } from '@/components/MenuFilterSheet';

export type { DietKey } from '@/components/MenuFilterSheet';

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
  /** s90: the stored photo list (cover first); the Poster pages it. */
  images?: string[] | null;
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
  /** On the weekly-specials list → the gold ★ pill on the photo. */
  is_weekly_special?: boolean;
  dietary: Record<DietKey, boolean>;
}

export interface MenuItemDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  item: MenuItemForDetail | null;
  /**
   * Which menu the item lives on — '' on a single-menu org. Carried in the
   * lane contract; the Poster has no eyebrow (the subcategory lives in the
   * pill), so this sheet does not render it.
   */
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
  /** null hides the chip — MenuDisplay owns the whole gating chain. */
  redeem: { label: string; onPress: () => void } | null;
  /**
   * Optional editor-side action chip (label passed in pre-translated — this
   * sheet stays i18n-agnostic about it). Used by the menu EDITOR's recipe-fed
   * libations cards: view the item here, jump to its Recipes Editor from the
   * chip. The press navigates, so it runs through the sheet's dismissal
   * handoff — never in the same commit as the close.
   */
  editAction?: { label: string; onPress: () => void } | null;
  /**
   * s87: "View Recipe" for recipe-fed libations, shown to viewers who may open
   * the Bartender Assistant (MenuDisplay gates it). A glass chip in the
   * panel's action row. Navigates → deferred.
   */
  recipe?: { label: string; onPress: () => void; icon?: { ios: string; android: string } } | null;
  /**
   * The item's category colour — the no-photo board's hue (mockup N: "a 30%
   * board in the item's category colour", never a grey slab). Null/omitted →
   * PosterSheet's default slate.
   */
  categoryColor?: string | null;
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

// ─── Photo-ink literals ──────────────────────────────────────────────────────
// The pills sit INTO the photo (or the hue board) over the Poster's fixed-dark
// scrim, never on a themed surface — the rulebook's ember rule — so they take
// literals, not theme tokens.
//
// The ★ Special pill is the menu kit's gold (MenuItemCards' SPECIAL_GOLD,
// which is module-private there) in its on-photo form: the kit's own banner
// pill takes the dark-theme gold as a literal for exactly this reason, and
// the locked mockup (.pill.gold) draws it fixed #F5B942 with dark ink.
const SPECIAL_GOLD_ON_PHOTO = '#F5B942';
const SPECIAL_INK = '#1F1A10';
// Dark ink on the warm tint price pill — it must not follow the theme's
// fireText (white in the light themes).
const PRICE_INK = '#14171E';

/**
 * The menu item detail sheet — the s89 "Poster for menu items" (mockup
 * design-mockups/poster-menu-recipes.html, frame P1, Steve's pick), composed
 * from the shared <PosterSheet>.
 *
 * The photo takes ~46% of the window with the pills SET INTO IT over the
 * scrim — the subcategory (else category) pill on slate, the gold ★ Special
 * pill when the item is a weekly special, and the bigger tint price pill at
 * the right — then the 30pt white title. No photo → PosterSheet draws a
 * board in the item's category colour. Wine keeps the standing rule: bottle
 * cut-outs CONTAIN on a white ground, never cover-cropped (`containOnWhite`);
 * banner thumbs contain over their own blurred copy, square ones cover-crop.
 *
 * The panel opens with ONE row of 44pt action chips — Redeem (filled
 * primary, gift), View Recipe (glass, wineglass), the editor's Open Recipes
 * Editor (glass, pencil) — then the diet chips, the description, and the
 * wine extras (location, the 3-up pricing cells, tasting notes, selling
 * points), with the allergen note last.
 *
 * PosterSheet / GlassHeroSheet own the sheet, the grab handle, the scrim, the
 * pinned-photo collapse and the swipe-to-dismiss. Navigation chips (recipe,
 * editAction) run through useSheetHandoff's `defer` — PosterSheet exposes no
 * Modal onDismiss, so the hook's timer fallback fires the deferred action
 * after the dismissal, never in the same commit as the close.
 */
export default function MenuItemDetailSheet({
  visible,
  onClose,
  colors,
  item,
  categoryLabel,
  subcategoryLabel,
  isWine,
  redeem,
  editAction,
  recipe,
  categoryColor,
}: MenuItemDetailSheetProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { defer } = useSheetHandoff(onClose);

  // ─── Derived content (all guarded — `item` is null while nothing is open) ─
  const name = item ? getLocalizedField(item, 'name', language) : '';
  const description = item ? getLocalizedField(item, 'description', language) : '';
  const location = item && isWine ? getLocalizedField(item, 'location', language) : '';
  const flavor = item ? getLocalizedField(item, 'flavor_profile', language).trim() : '';
  const usp = item ? getLocalizedField(item, 'unique_selling_points', language).trim() : '';

  // The Poster pages the stored list (cover first, s90); a pre-s90 row has
  // only its thumbnail, which still makes a one-page hero.
  const images = useMemo<string[]>(() => {
    const list = item?.images;
    if (list && list.length > 0) return list;
    return item?.thumbnail_url ? [item.thumbnail_url] : [];
  }, [item?.images, item?.thumbnail_url]);

  // ─── The pill row set into the photo ──────────────────────────────────────
  // Subcategory when the item has one, else its category.
  const kindLabel = subcategoryLabel?.trim() || categoryLabel.trim();
  const isSpecial = !!item?.is_weekly_special;
  // Wine leads with the by-the-glass price (the pricing cells carry the rest).
  const rawPrice = item ? (isWine ? item.glass_price?.trim() || item.price.trim() : item.price.trim()) : '';
  const priceText = rawPrice ? formatPrice(rawPrice) : null;
  const hasPills = !!kindLabel || isSpecial || !!priceText;

  const pills = hasPills ? (
    <>
      {!!kindLabel && <PosterPill label={kindLabel} color={POSTER_SLATE} />}
      {isSpecial && (
        <PosterPill label={`★ ${t('menu_display.special')}`} color={SPECIAL_GOLD_ON_PHOTO} textColor={SPECIAL_INK} />
      )}
      {!!priceText && (
        // Pushed to the row's right edge (the mockup's .pill.price.on-photo).
        <View style={styles.pricePillSlot}>
          <PosterPill label={priceText} tone="price" color={colors.tint} textColor={PRICE_INK} />
        </View>
      )}
    </>
  ) : undefined;

  // ─── Panel sections ───────────────────────────────────────────────────────
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

  const hasActions = !!redeem || !!recipe || !!editAction;

  return (
    <PosterSheet
      visible={visible}
      onClose={onClose}
      images={images}
      imageShape={item?.thumbnail_shape ?? null}
      containOnWhite={isWine}
      boardColor={categoryColor}
      pills={pills}
      title={name}
    >
      {/* One column, one rhythm: the stack's gap spaces every block, so
          whichever block comes first sits flush under the panel's padding. */}
      <View style={styles.stack}>
        {hasActions && (
          <View style={styles.actsRow}>
            {!!redeem && (
              <Pressable
                onPress={redeem.onPress}
                style={[styles.act, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <IconSymbol ios_icon_name="gift.fill" android_material_icon_name="card-giftcard" size={16} color={colors.fireText} />
                <Text style={[styles.actLabel, { color: colors.fireText }]} numberOfLines={1}>{redeem.label}</Text>
              </Pressable>
            )}
            {!!recipe && (
              <Pressable
                onPress={() => defer(recipe.onPress)}
                style={[styles.act, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <IconSymbol ios_icon_name={(recipe.icon?.ios ?? 'wineglass.fill') as any} android_material_icon_name={(recipe.icon?.android ?? 'local-bar') as any} size={15} color={colors.tint} />
                <Text style={[styles.actLabel, { color: colors.text }]} numberOfLines={1}>{recipe.label}</Text>
              </Pressable>
            )}
            {!!editAction && (
              <Pressable
                onPress={() => defer(editAction.onPress)}
                style={[styles.act, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={15} color={colors.tint} />
                <Text style={[styles.actLabel, { color: colors.text }]} numberOfLines={1}>{editAction.label}</Text>
              </Pressable>
            )}
          </View>
        )}

        {dietChips.length > 0 && (
          <View>
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

        {!!description && (
          // ⚠️ No fontFamily here, same as ContentDetailModal: FormattedText
          // renders authored <b>/<i> via fontWeight/fontStyle on nested Text, and
          // constants/fonts.ts warns fontWeight is unreliable with custom
          // families — pinning Inter would flatten authors' bold runs.
          <FormattedText style={[styles.desc, { color: colors.textSecondary }]}>
            {description}
          </FormattedText>
        )}

        {isWine && !!location && (
          <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
            📍 {location}
          </Text>
        )}

        {priceRows.length > 0 && (
          <View>
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
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {t('menu_detail.tasting_notes')}
            </Text>
            <FormattedText style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {flavor}
            </FormattedText>
          </View>
        )}

        {!!usp && (
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {t('menu_detail.selling_points')}
            </Text>
            <FormattedText style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {usp}
            </FormattedText>
          </View>
        )}

        <Text style={[styles.allergenNote, { color: colors.textSecondary }]}>
          {t('menu_detail.allergen_note')}
        </Text>
      </View>
    </PosterSheet>
  );
}

const styles = StyleSheet.create({
  // ── on the photo ──
  pricePillSlot: { marginLeft: 'auto' },

  // ── the panel ──
  stack: { gap: 13 },
  // The mockup's .acts / .act: one row, every chip 44pt and equal width.
  actsRow: { flexDirection: 'row', gap: 8 },
  act: {
    flex: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  actLabel: { flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 13.5 },
  // ⚠️ No fontFamily — see the FormattedText note at the render site.
  desc: { fontSize: 14, lineHeight: 21 },
  // Mono per the mockup, no italic — no italic instance of any bundled family
  // exists, and fontStyle is unreliable with custom families (constants/fonts).
  location: { fontFamily: fonts.mono.medium, fontSize: 11 },
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
    marginTop: 2,
  },
});
