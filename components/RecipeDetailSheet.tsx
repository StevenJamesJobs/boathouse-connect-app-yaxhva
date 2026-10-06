import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import PosterSheet, { PosterPill, POSTER_SLATE } from '@/components/PosterSheet';
import { useSheetHandoff } from '@/components/GlassSheet';
import FormattedText from '@/components/FormattedText';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { fonts } from '@/constants/fonts';

/**
 * RecipeDetailSheet — the s89 "B2" Poster for bartender recipes (the locked
 * mockup design-mockups/poster-menu-recipes.html, frame R). ONE sheet for the
 * Bartender Assistant's Featured shelf, Menu 1 / Menu 2 libation recipes,
 * Cocktails A–Z and Mixes & Essentials; each screen maps its own row into
 * `RecipeForDetail` and this file owns the detail grammar.
 *
 * Rides PosterSheet: cocktail thumbs are 1:1 so the hero cover-crops the
 * square (no imageShape); no real thumbnail → the slate board (never the
 * screens' Unsplash placeholder — that is a tile stand-in, not a photo).
 *
 * INTO the photo: the subcategory / category label on a slate pill when the
 * host knows it + the price as the bigger tint pill (pushed to the row's right
 * edge, dark ink — the photo-ink literal) when there is one; the 30pt white
 * title is the recipe name.
 *
 * The panel, top to bottom:
 *   · an optional 44pt glass Edit chip row — only when the host passes
 *     `editAction`. The press NAVIGATES, so it runs through useSheetHandoff's
 *     `defer`, never in the same commit as the close (the dropped-presentation
 *     race). PosterSheet exposes no Modal onDismiss, so the handoff's timer
 *     backstop is what fires the action here.
 *   · the facts row — Glassware · Garnish (· Yield): a 34pt tinted glass square
 *     with an icon, a mono uppercase key, the value. Cells with no value drop
 *     out; the row itself drops out when every cell is empty.
 *   · INGREDIENTS — mono eyebrow + hairline, then surface rows: amount in
 *     colors.primary mono in a 54pt column, name 14pt. A row with no amount
 *     (s90's scanned recipes) renders without the amount column. No rows →
 *     the existing no_ingredients text.
 *   · PROCEDURE — same eyebrow; FormattedText inside a surface box, localized
 *     via getLocalizedField(recipe, 'procedure', language).
 */
export interface RecipeIngredient {
  /** May be empty/missing — s90 scanned recipes carry no amounts. */
  amount?: string | null;
  ingredient: string;
}

export interface RecipeForDetail {
  name: string;
  /** Absent on cocktails A–Z and purées. Rendered as-is (the tiles show it raw). */
  price?: string | null;
  glassware?: string | null;
  garnish?: string | null;
  /** Batch recipes: shown as a third facts cell when present. */
  yield?: string | null;
  ingredients?: RecipeIngredient[] | null;
  procedure?: string | null;
  procedure_es?: string | null;
  thumbnail_url?: string | null;
  /** The slate pill set into the photo — subcategory, category or alcohol type. */
  subcategoryLabel?: string | null;
}

export interface RecipeDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  recipe: RecipeForDetail | null;
  /** Managers' Edit chip row above the facts; the press navigates (deferred). */
  editAction?: { label: string; onPress: () => void } | null;
}

// Dark ink on the warm tint price pill, independent of theme — it sits on a
// photo (or the slate board), never on a themed surface: the ember rule.
const PRICE_INK = '#14171E';

type Fact = { key: string; label: string; value: string; ios: string; android: string };

export default function RecipeDetailSheet({ visible, onClose, recipe, editAction }: RecipeDetailSheetProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { defer } = useSheetHandoff(onClose);

  // Hosts null the recipe in the same commit as `visible: false`; keeping the
  // last one lets the Poster slide out intact instead of collapsing to an
  // empty board mid-animation.
  const lastRecipe = useRef<RecipeForDetail | null>(null);
  if (recipe) lastRecipe.current = recipe;
  const r = recipe ?? lastRecipe.current;

  const price = r?.price?.trim() || '';
  const subcategoryLabel = r?.subcategoryLabel?.trim() || '';
  const images = r?.thumbnail_url ? [r.thumbnail_url] : [];
  const ingredients = (r?.ingredients || []).filter((i) => !!i && !!(i.ingredient || '').trim());
  const procedure = r ? getLocalizedField(r, 'procedure', language).trim() : '';

  const facts: Fact[] = [];
  if (r?.glassware?.trim()) {
    facts.push({ key: 'glassware', label: t('libation_recipes.glassware'), value: r.glassware.trim(), ios: 'wineglass', android: 'local-bar' });
  }
  if (r?.garnish?.trim()) {
    facts.push({ key: 'garnish', label: t('libation_recipes.garnish'), value: r.garnish.trim(), ios: 'leaf', android: 'eco' });
  }
  if (r?.yield?.trim()) {
    facts.push({ key: 'yield', label: t('libation_recipes.yield'), value: r.yield.trim(), ios: 'drop.fill', android: 'opacity' });
  }

  const pills =
    subcategoryLabel || price ? (
      <>
        {!!subcategoryLabel && <PosterPill label={subcategoryLabel} color={POSTER_SLATE} />}
        {!!price && (
          // marginLeft auto = the mockup's `.pill.price.on-photo`: the money
          // pill rides the row's right edge.
          <View style={styles.pricePillSlot}>
            <PosterPill label={price} color={colors.tint} textColor={PRICE_INK} tone="price" />
          </View>
        )}
      </>
    ) : undefined;

  const eyebrow = (label: string) => (
    <View style={styles.sec}>
      <Text style={[styles.secText, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <View style={[styles.secLine, { backgroundColor: colors.hairline }]} />
    </View>
  );

  return (
    <PosterSheet visible={visible} onClose={onClose} images={images} pills={pills} title={r?.name ?? ''}>
      {!!r && (
        <View style={styles.body}>
          {!!editAction && (
            <View style={styles.acts}>
              <Pressable
                onPress={() => defer(editAction.onPress)}
                style={[styles.act, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={15} color={colors.tint} />
                <Text style={[styles.actText, { color: colors.text }]} numberOfLines={1}>{editAction.label}</Text>
              </Pressable>
            </View>
          )}

          {facts.length > 0 && (
            <View style={styles.facts}>
              {facts.map((f) => (
                <View
                  key={f.key}
                  style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                >
                  {/* 16% fill / 30% border of the tint (the mockup's color-mix
                      values); tint is a 6-digit hex in every palette, so the
                      alpha-suffix idiom applies. */}
                  <View style={[styles.factSquare, { backgroundColor: colors.tint + '29', borderColor: colors.tint + '4D' }]}>
                    <IconSymbol ios_icon_name={f.ios} android_material_icon_name={f.android} size={18} color={colors.tint} />
                  </View>
                  <View style={styles.factText}>
                    <Text style={[styles.factKey, { color: colors.textSecondary }]} numberOfLines={1}>{f.label.toUpperCase()}</Text>
                    <Text style={[styles.factValue, { color: colors.text }]} numberOfLines={1}>{f.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            {eyebrow(t('libation_recipes.ingredients'))}
            {ingredients.length > 0 ? (
              <View style={styles.ing}>
                {ingredients.map((item, index) => {
                  const amount = (item.amount || '').trim();
                  return (
                    <View
                      key={index}
                      style={[styles.ingRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                    >
                      {!!amount && (
                        <Text style={[styles.ingAmount, { color: colors.primary }]} numberOfLines={1}>{amount}</Text>
                      )}
                      <Text style={[styles.ingName, { color: colors.text }]}>{item.ingredient.trim()}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.noData, { color: colors.textSecondary }]}>{t('libation_recipes.no_ingredients')}</Text>
            )}
          </View>

          {!!procedure && (
            <View style={styles.section}>
              {eyebrow(t('libation_recipes.procedure'))}
              <View style={[styles.proc, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                {/* ⚠️ No fontFamily, same as MenuItemDetailSheet: FormattedText
                    renders authored <b>/<i> via fontWeight/fontStyle on nested
                    Text, and constants/fonts.ts warns fontWeight is unreliable
                    with custom families — pinning Inter would flatten them. */}
                <FormattedText style={[styles.procText, { color: colors.text }]}>{procedure}</FormattedText>
              </View>
            </View>
          )}
        </View>
      )}
    </PosterSheet>
  );
}

const styles = StyleSheet.create({
  // ── into the photo ──
  pricePillSlot: { marginLeft: 'auto' },

  // ── the panel (the mockup's 12pt block rhythm) ──
  body: { gap: 12 },
  acts: { flexDirection: 'row', gap: 8 },
  act: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  actText: { fontFamily: fonts.display.semibold, fontSize: 13.5, flexShrink: 1 },

  // Two cells per row (the mockup's 1fr 1fr); a third wraps to a full row and
  // a lone cell fills the row.
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  factSquare: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  factText: { flex: 1, minWidth: 0, gap: 2 },
  factKey: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2 },
  factValue: { fontFamily: fonts.body.semibold, fontSize: 13.5 },

  section: { gap: 8 },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  secText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.4 },
  secLine: { flex: 1, height: StyleSheet.hairlineWidth },

  ing: { gap: 6 },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // Semibold is the heaviest bundled mono instance (constants/fonts.ts).
  ingAmount: { fontFamily: fonts.mono.semibold, fontSize: 12, width: 54, flexShrink: 0 },
  ingName: { fontFamily: fonts.body.medium, fontSize: 14, flex: 1 },
  noData: { fontFamily: fonts.body.regular, fontSize: 13 },

  proc: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // ⚠️ No fontFamily — see the FormattedText note at the render site.
  procText: { fontSize: 14, lineHeight: 21 },
});
