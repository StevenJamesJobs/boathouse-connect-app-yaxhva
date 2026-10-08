import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Share, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StorageExpoImage } from '@/components/StorageImage';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import {
  fetchKitchenRecipe,
  pickLang,
  setKitchenRecipeSaved,
  KITCHEN_STATIONS,
  type KitchenAllergen,
  type KitchenIngredient,
  type KitchenRecipeFull,
  type KitchenViewMode,
} from '@/hooks/useKitchenRecipes';

/**
 * s91 — the Kitchen Assistant's READER kit: the pieces the three reading views
 * (Scroll = KitchenRecipeSheet · Steps = app/kitchen-recipe-steps · Book =
 * app/kitchen-recipe-book) share so a fact tile, an allergen chip or a step
 * photo grid looks the same whichever way the cook reads. Mockup:
 * design-mockups/kitchen-assistant.html frames 3 · 4 · 5.
 */

// ─── fixed hues ──────────────────────────────────────────────────────────────
// The ★ Special pill sits on the photo / cover — photo-ink literals (the ember
// rule). Flame and danger have no theme token yet; the pair below follows the
// Content Kit's RED convention (contentVisuals.ts) so they read on both themes.
export const SPECIAL_GOLD = '#F5B942';
export const SPECIAL_INK = '#1F1A10';
export const FLAME = '#FF6B1A';
const RED = { dark: '#EF4444', light: '#DC2626' };
export function useDangerColor(): string {
  return useIsDarkTheme() ? RED.dark : RED.light;
}

type T = (k: string, o?: any) => string;

// ─── labels ──────────────────────────────────────────────────────────────────
/** Allergen key → label. Literal t() calls so the i18n key check sees them. */
export function allergenLabel(key: KitchenAllergen, t: T): string {
  switch (key) {
    case 'gluten': return t('kitchen_recipe.allergen_gluten');
    case 'dairy': return t('kitchen_recipe.allergen_dairy');
    case 'egg': return t('kitchen_recipe.allergen_egg');
    case 'tree_nuts': return t('kitchen_recipe.allergen_tree_nuts');
    case 'peanuts': return t('kitchen_recipe.allergen_peanuts');
    case 'soy': return t('kitchen_recipe.allergen_soy');
    case 'fish': return t('kitchen_recipe.allergen_fish');
    case 'shellfish': return t('kitchen_recipe.allergen_shellfish');
    case 'sesame': return t('kitchen_recipe.allergen_sesame');
  }
}

/** Station key → label; a value outside the list is free text and renders as-is. */
export function stationLabel(station: string | null | undefined, t: T): string {
  const s = (station || '').trim();
  if (!s) return '';
  switch (s as (typeof KITCHEN_STATIONS)[number]) {
    case 'grill': return t('kitchen_recipe.station_grill');
    case 'saute': return t('kitchen_recipe.station_saute');
    case 'fry': return t('kitchen_recipe.station_fry');
    case 'pantry': return t('kitchen_recipe.station_pantry');
    case 'pastry': return t('kitchen_recipe.station_pastry');
    case 'prep': return t('kitchen_recipe.station_prep');
    case 'expo': return t('kitchen_recipe.station_expo');
    case 'pizza': return t('kitchen_recipe.station_pizza');
    case 'wok': return t('kitchen_recipe.station_wok');
    default: return s;
  }
}

export function recipeTitle(r: KitchenRecipeFull, lang: string): string {
  return pickLang(r.name, r.name_es, lang);
}

/** "Dinner › Entrees" for menu recipes, the group name for section recipes. */
export function recipeKindLabel(r: KitchenRecipeFull, lang: string): string {
  if (r.section === 'menu') {
    return [r.category, r.subcategory].map((s) => (s || '').trim()).filter(Boolean).join(' › ');
  }
  return pickLang(r.group_name, r.group_name_es, lang).trim();
}

/** Cover first, then the recipe's own photos; nulls and repeats dropped. */
export function recipeImages(r: KitchenRecipeFull): string[] {
  const out: string[] = [];
  for (const u of [r.thumbnail_url, ...(r.images || [])]) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

export function stepTitle(step: { title?: string | null; title_es?: string | null }, index: number, lang: string, t: T): string {
  const own = pickLang(step.title, step.title_es, lang).trim();
  return own || t('kitchen_recipe.step_n', { n: index + 1 });
}

export function minutesLabel(min: number, t: T): string {
  return t('kitchen_recipe.minutes_short', { n: min });
}

// ─── facts ───────────────────────────────────────────────────────────────────
export type RecipeFact = { key: string; label: string; value: string };

/** Yield · Portion · Prep · Cook · Shelf life — empties skipped. */
export function recipeFacts(r: KitchenRecipeFull, t: T): RecipeFact[] {
  const out: RecipeFact[] = [];
  if (r.yield_text?.trim()) out.push({ key: 'yield', label: t('kitchen_recipe.fact_yield'), value: r.yield_text.trim() });
  if (r.portions_text?.trim()) out.push({ key: 'portion', label: t('kitchen_recipe.fact_portion'), value: r.portions_text.trim() });
  if (r.prep_minutes) out.push({ key: 'prep', label: t('kitchen_recipe.fact_prep'), value: minutesLabel(r.prep_minutes, t) });
  if (r.cook_minutes) out.push({ key: 'cook', label: t('kitchen_recipe.fact_cook'), value: minutesLabel(r.cook_minutes, t) });
  if (r.shelf_life?.trim()) out.push({ key: 'shelf', label: t('kitchen_recipe.fact_shelf'), value: r.shelf_life.trim() });
  return out;
}

// ─── share text ──────────────────────────────────────────────────────────────
export function buildShareText(r: KitchenRecipeFull, lang: string, t: T): string {
  const lines: string[] = [recipeTitle(r, lang)];
  const kind = recipeKindLabel(r, lang);
  if (kind) lines.push(kind);
  const facts = recipeFacts(r, t);
  if (r.station) facts.push({ key: 'station', label: t('kitchen_recipe.fact_station'), value: stationLabel(r.station, t) });
  if (facts.length) lines.push('', ...facts.map((f) => `${f.label}: ${f.value}`));
  const desc = pickLang(r.description, r.description_es, lang).trim();
  if (desc) lines.push('', desc);
  if (r.ingredients.length) {
    lines.push('', `${t('kitchen_recipe.ingredients')}:`);
    for (const i of r.ingredients) {
      const name = pickLang(i.ingredient, i.ingredient_es, lang).trim();
      const prep = pickLang(i.prep, i.prep_es, lang).trim();
      lines.push(`- ${[i.amount?.trim(), name].filter(Boolean).join(' ')}${prep ? ` · ${prep}` : ''}`);
    }
  }
  if (r.steps.length) {
    lines.push('', `${t('kitchen_recipe.steps')}:`);
    r.steps.forEach((s, i) => {
      const text = pickLang(s.text, s.text_es, lang).trim();
      lines.push(`${i + 1}. ${stepTitle(s, i, lang, t)}${text ? `: ${text}` : ''}`);
    });
  }
  const plating = pickLang(r.plating_notes, r.plating_notes_es, lang).trim();
  if (plating) lines.push('', `${t('kitchen_recipe.plating_notes')}: ${plating}`);
  return lines.join('\n');
}

// ─── loading ─────────────────────────────────────────────────────────────────
/**
 * Self-fetch by id. `notFound` is the "close quietly" signal; `error` is a
 * failed request. The last recipe is kept across id changes so a sheet can
 * slide out intact.
 */
export function useKitchenRecipeLoad(recipeId: string | null | undefined, enabled = true) {
  const { user } = useAuth();
  const actorId = user?.id;
  const [recipe, setRecipe] = useState<KitchenRecipeFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!enabled || !recipeId || !actorId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNotFound(false);
    fetchKitchenRecipe(actorId, recipeId)
      .then((r) => {
        if (cancelled || !alive.current) return;
        if (r) setRecipe(r);
        else setNotFound(true);
      })
      .catch((e) => {
        console.log('[kitchen reader] load failed', e);
        if (!cancelled && alive.current) setError(true);
      })
      .finally(() => {
        if (!cancelled && alive.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, recipeId, actorId, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { recipe, loading, error, notFound, reload, setRecipe };
}

// ─── bookmark + share (every reader) ─────────────────────────────────────────
/**
 * The optimistic bookmark and the share sheet, shared by Scroll · Steps · Book
 * (Steve's device round: the two chips on EVERY view, not just the Poster).
 */
export function useRecipeActions(recipe: KitchenRecipeFull | null, setRecipe: (r: KitchenRecipeFull) => void) {
  const { t } = useTranslation();
  const lang = useLang();
  const { user } = useAuth();
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const recipeId = recipe?.id ?? null;
  useEffect(() => { setSavedOverride(null); }, [recipeId]);
  const isSaved = savedOverride ?? recipe?.is_saved ?? false;

  const toggleSaved = useCallback(() => {
    if (!recipe || !user?.id) return;
    const next = !isSaved;
    setSavedOverride(next);
    setKitchenRecipeSaved(user.id, recipe.id, next)
      .then(() => setRecipe({ ...recipe, is_saved: next }))
      .catch((e) => {
        console.log('[kitchen recipe] save toggle failed', e);
        setSavedOverride(!next);
      });
  }, [recipe, user?.id, isSaved, setRecipe]);

  const share = useCallback(() => {
    if (!recipe) return;
    Share.share({ title: recipeTitle(recipe, lang), message: buildShareText(recipe, lang, t) }).catch(() => {});
  }, [recipe, lang, t]);

  return { isSaved, toggleSaved, share };
}

/** The bookmark + share pair, sized to a reader's bar. */
export function RecipeActionChips({
  isSaved,
  onToggleSaved,
  onShare,
  size = 44,
}: {
  isSaved: boolean;
  onToggleSaved: () => void;
  onShare: () => void;
  size?: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ActionChip
        ios={isSaved ? 'bookmark.fill' : 'bookmark'}
        android={isSaved ? 'bookmark' : 'bookmark-border'}
        on={isSaved}
        size={size}
        onPress={onToggleSaved}
        accessibilityLabel={isSaved ? t('kitchen_recipe.saved') : t('kitchen_recipe.save')}
      />
      <ActionChip ios="square.and.arrow.up" android="share" size={size} onPress={onShare} accessibilityLabel={t('kitchen_recipe.share')} />
    </>
  );
}

// ─── the Scroll | Steps | Book capsule ───────────────────────────────────────
export const VIEW_ICONS: Record<KitchenViewMode, { ios: string; android: string }> = {
  scroll: { ios: 'scroll', android: 'notes' },
  steps: { ios: 'list.number', android: 'format-list-numbered' },
  book: { ios: 'book', android: 'menu-book' },
};
const VIEW_ORDER: KitchenViewMode[] = ['scroll', 'steps', 'book'];

export function viewLabel(mode: KitchenViewMode, t: T): string {
  switch (mode) {
    case 'scroll': return t('kitchen_recipe.view_scroll');
    case 'steps': return t('kitchen_recipe.view_steps');
    case 'book': return t('kitchen_recipe.view_book');
  }
}

export function ViewCapsule({
  active,
  onChange,
  compact = false,
  iconOnly = false,
  style,
}: {
  active: KitchenViewMode;
  onChange: (mode: KitchenViewMode) => void;
  /** The 11pt variant for the reader top bars. */
  compact?: boolean;
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={[kit.cap, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, style]}>
      {VIEW_ORDER.map((m) => {
        const on = m === active;
        const ink = on ? colors.fireText : colors.textSecondary;
        return (
          <Pressable
            key={m}
            onPress={() => { if (!on) onChange(m); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={viewLabel(m, t)}
            style={[kit.capOpt, compact && kit.capOptSm, iconOnly && kit.capOptIcon, on && { backgroundColor: colors.tint }]}
          >
            <IconSymbol ios_icon_name={VIEW_ICONS[m].ios} android_material_icon_name={VIEW_ICONS[m].android} size={13} color={ink} />
            {!iconOnly && (
              <Text style={[kit.capLabel, compact && kit.capLabelSm, { color: ink }]} numberOfLines={1}>{viewLabel(m, t)}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── the 44pt action chip ────────────────────────────────────────────────────
export function ActionChip({
  ios,
  android,
  onPress,
  on = false,
  label,
  accessibilityLabel,
  size = 44,
}: {
  ios: string;
  android: string;
  onPress: () => void;
  /** Tinted glyph + 12% tint fill (the saved bookmark). */
  on?: boolean;
  /** Optional text → the wide variant. */
  label?: string;
  accessibilityLabel?: string;
  /** Square size (44 on the Poster, 38 on the reader bars). */
  size?: number;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        kit.achip,
        size !== 44 && { width: size, height: size, borderRadius: Math.round(size * 0.28) },
        !!label && kit.achipWide,
        { backgroundColor: on ? colors.tint + '1F' : colors.glass, borderColor: on ? colors.tint + '66' : colors.glassBorder },
      ]}
    >
      <IconSymbol ios_icon_name={ios} android_material_icon_name={android} size={17} color={on ? colors.tint : colors.text} />
      {!!label && <Text style={[kit.achipLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}

// ─── eyebrows ────────────────────────────────────────────────────────────────
/** Mono "SCREEN STAYS ON WHILE YOU READ" with the eye glyph. */
export function KeepAwakeLine({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <View style={[kit.keep, style]}>
      <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={11} color={colors.textSecondary} />
      <Text style={[kit.keepText, { color: colors.textSecondary }]} numberOfLines={1}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Mono section eyebrow with the hairline and an optional count. */
export function SectionEyebrow({ label, count }: { label: string; count?: number }) {
  const colors = useThemeColors();
  return (
    <View style={kit.sech}>
      <Text style={[kit.sechText, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <View style={[kit.sechLine, { backgroundColor: colors.hairline }]} />
      {count !== undefined && <Text style={[kit.sechText, { color: colors.textSecondary }]}>{count}</Text>}
    </View>
  );
}

/** The tinted mono eyebrow (the reader pages' "STEP 3 OF 7 · SAUTÉ"). */
export function TintEyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <View style={style}>
      <Text style={[kit.eb, { color: colors.tint }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

// ─── facts strip ─────────────────────────────────────────────────────────────
export function FactsStrip({ facts, columns, compact = false }: { facts: RecipeFact[]; columns?: number; compact?: boolean }) {
  const colors = useThemeColors();
  if (!facts.length) return null;
  const cols = columns ?? facts.length;
  // Fixed-column basis so a 3-column grid (the Book's glance page) wraps evenly.
  const basis = `${Math.floor(100 / cols) - 2}%` as `${number}%`;
  return (
    <View style={kit.facts}>
      {facts.map((f) => (
        <View
          key={f.key}
          style={[kit.fact, compact && kit.factCompact, { flexBasis: basis, backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        >
          <Text style={[kit.factKey, { color: colors.textSecondary }]} numberOfLines={1}>{f.label.toUpperCase()}</Text>
          <Text style={[kit.factValue, { color: colors.text }]} numberOfLines={1}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── chips: station + allergens ──────────────────────────────────────────────
export function ChipsRow({
  station,
  allergens,
  style,
}: {
  station?: string | null;
  allergens: KitchenAllergen[];
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const danger = useDangerColor();
  const st = stationLabel(station, t);
  if (!st && allergens.length === 0) return null;
  return (
    <View style={[kit.chips, style]}>
      {!!st && (
        <View style={[kit.chip, { backgroundColor: FLAME + '1F', borderColor: FLAME + '4D' }]}>
          <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local-fire-department" size={12} color={FLAME} />
          <Text style={[kit.chipText, { color: colors.text }]} numberOfLines={1}>{st}</Text>
        </View>
      )}
      {allergens.map((a) => (
        <View key={a} style={[kit.chip, { backgroundColor: danger + '1F', borderColor: danger + '4D' }]}>
          <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={12} color={danger} />
          <Text style={[kit.chipText, { color: colors.text }]} numberOfLines={1}>{allergenLabel(a, t)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── ingredients ─────────────────────────────────────────────────────────────
export function IngredientRows({ ingredients, lang, compact = false }: { ingredients: KitchenIngredient[]; lang: string; compact?: boolean }) {
  const colors = useThemeColors();
  return (
    <View>
      {ingredients.map((i, idx) => {
        const amount = (i.amount || '').trim();
        const name = pickLang(i.ingredient, i.ingredient_es, lang).trim();
        const prep = pickLang(i.prep, i.prep_es, lang).trim();
        const last = idx === ingredients.length - 1;
        return (
          <View key={idx} style={[kit.ing, compact && kit.ingCompact, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }]}>
            <Text style={[kit.ingAmount, compact && kit.ingAmountCompact, { color: colors.tint }]} numberOfLines={2}>{amount}</Text>
            <Text style={[kit.ingName, compact && kit.ingNameCompact, { color: colors.text }]}>
              {name}
              {!!prep && <Text style={[kit.ingPrep, { color: colors.textSecondary }]}>{` · ${prep}`}</Text>}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── step photos ─────────────────────────────────────────────────────────────
/**
 * 1 photo = full width 16:10 · 2 = two across · 3–4 = a 2×2 grid. `fill`
 * (the Book's right page) drops the aspect ratios and lets the rows fill the
 * parent's height instead.
 */
export function PhotoGrid({
  images,
  fill = false,
  gap = 6,
  radius = 10,
  style,
  onPressImage,
}: {
  images: string[];
  fill?: boolean;
  gap?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** s91: a tap on a photo (its index in `images`) — hosts open the lightbox. */
  onPressImage?: (index: number) => void;
}) {
  const colors = useThemeColors();
  const pics = images.filter(Boolean).slice(0, 4);
  if (pics.length === 0) return null;
  const rows: string[][] = pics.length <= 2 ? [pics] : [pics.slice(0, 2), pics.slice(2)];
  const aspect = pics.length === 1 ? 16 / 10 : pics.length === 2 ? 1.6 : 1;
  return (
    <View style={[fill && { flex: 1 }, { gap }, style]}>
      {rows.map((row, ri) => (
        <View key={ri} style={[kit.pgRow, { gap }, fill && { flex: 1 }]}>
          {row.map((uri, ci) => (
            <Pressable
              key={`${ri}-${ci}`}
              onPress={onPressImage ? () => onPressImage(ri * 2 + ci) : undefined}
              disabled={!onPressImage}
              accessibilityRole={onPressImage ? 'imagebutton' : undefined}
              style={[
                kit.pgCell,
                { borderRadius: radius, borderColor: colors.glassBorder, backgroundColor: colors.thumbPlaceholder },
                fill ? { flex: 1 } : { flex: 1, aspectRatio: aspect },
              ]}
            >
              <StorageExpoImage source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
            </Pressable>
          ))}
          {/* an odd last row keeps the 2-column rhythm */}
          {fill && row.length === 1 && rows.length > 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

// ─── step number ─────────────────────────────────────────────────────────────
export function StepNumber({ n }: { n: number }) {
  const colors = useThemeColors();
  return (
    <View style={[kit.stepN, { backgroundColor: colors.tint + '24' }]}>
      <Text style={[kit.stepNText, { color: colors.tint }]}>{n}</Text>
    </View>
  );
}

// ─── plating notes ───────────────────────────────────────────────────────────
export function NoteCard({ label, text, style }: { label: string; text: string; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <View style={[kit.note, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, style]}>
      <Text style={[kit.noteLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <Text style={[kit.noteText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

/** A 38pt glass square button (the readers' ✕ and edge arrows). */
export function GlassSquare({
  ios,
  android,
  onPress,
  size = 38,
  width,
  height,
  accessibilityLabel,
  style,
}: {
  ios: string;
  android: string;
  onPress: () => void;
  size?: number;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        kit.square,
        { width: width ?? size, height: height ?? size, backgroundColor: colors.glass, borderColor: colors.glassBorder },
        style,
      ]}
    >
      <IconSymbol ios_icon_name={ios} android_material_icon_name={android} size={Math.round((width ?? size) * 0.42)} color={colors.textSecondary} />
    </Pressable>
  );
}

export function useLang(): string {
  const { i18n } = useTranslation();
  return i18n.language || 'en';
}

export const kit = StyleSheet.create({
  cap: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  capOpt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9,
    minWidth: 0,
  },
  capOptSm: { paddingVertical: 6, paddingHorizontal: 7 },
  // Icon-only (the reader bars): fixed cells so the capsule HUGS its three
  // glyphs instead of flexing to the screen edge (Steve's device round).
  capOptIcon: { flex: 0, width: 40, paddingHorizontal: 0 },
  capLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  capLabelSm: { fontSize: 11 },

  achip: {
    height: 44,
    width: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    flexShrink: 0,
  },
  achipWide: { width: undefined, paddingHorizontal: 13 },
  achipLabel: { fontFamily: fonts.body.semibold, fontSize: 13 },

  keep: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  keepText: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 0.8 },

  sech: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  sechText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4 },
  sechLine: { flex: 1, height: StyleSheet.hairlineWidth },
  eb: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.6 },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    flexGrow: 1,
    minWidth: 0,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 3,
  },
  factCompact: { paddingVertical: 6 },
  factKey: { fontFamily: fonts.mono.medium, fontSize: 7.5, letterSpacing: 0.9 },
  factValue: { fontFamily: fonts.display.bold, fontSize: 13 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 11 },

  ing: { flexDirection: 'row', gap: 10, paddingVertical: 9, alignItems: 'flex-start' },
  ingCompact: { paddingVertical: 6 },
  ingAmount: { fontFamily: fonts.mono.semibold, fontSize: 12, width: 64, flexShrink: 0, paddingTop: 1 },
  ingAmountCompact: { width: 54, fontSize: 11 },
  ingName: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 19, flex: 1 },
  ingNameCompact: { fontSize: 12.5, lineHeight: 17 },
  ingPrep: { fontFamily: fonts.body.regular, fontSize: 12 },

  pgRow: { flexDirection: 'row' },
  pgCell: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, minWidth: 0 },

  stepN: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNText: { fontFamily: fonts.mono.semibold, fontSize: 12 },

  note: { borderRadius: 13, paddingVertical: 12, paddingHorizontal: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, gap: 4 },
  noteLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2 },
  noteText: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 19.5 },

  square: { borderRadius: 11, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center', justifyContent: 'center' },
});
