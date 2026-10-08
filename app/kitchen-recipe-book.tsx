import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeepAwake } from 'expo-keep-awake';
import AmbientGlow from '@/components/AmbientGlow';
import GlassBlur from '@/components/GlassBlur';
import ImageLightbox from '@/components/ImageLightbox';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageExpoImage } from '@/components/StorageImage';
import { PosterPill, POSTER_SLATE, INK_ON_PHOTO, deepen } from '@/components/PosterSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { fonts } from '@/constants/fonts';
import { lockLandscape, lockPortrait } from '@/utils/screenOrientation';
import {
  getRotateHintSeen,
  setRotateHintSeen,
  pickLang,
  requestScrollOpen,
  type KitchenRecipeFull,
  type KitchenViewMode,
} from '@/hooks/useKitchenRecipes';
import {
  ChipsRow,
  FactsStrip,
  GlassSquare,
  IngredientRows,
  PhotoGrid,
  RecipeActionChips,
  SPECIAL_GOLD,
  SPECIAL_INK,
  TintEyebrow,
  ViewCapsule,
  recipeFacts,
  recipeImages,
  recipeKindLabel,
  recipeTitle,
  stationLabel,
  stepTitle,
  useKitchenRecipeLoad,
  useLang,
  useRecipeActions,
  type RecipeFact,
} from '@/components/kitchen/kitchenReaderKit';

/**
 * Kitchen recipe · BOOK view (s91, mockup frame 5): the phone turns sideways
 * and the recipe reads as two-page spreads. Spread 0 = the cover (photo) +
 * "At a glance"; one spread per step = the step's text on the left, its
 * photos on the right; the last spread = plating notes + the cover again.
 * Swipe anywhere on the spread, or tap the edge arrows.
 *
 * Steve's device round: the spread runs EDGE TO EDGE (the book was small with
 * a bar above and a footer below); the ✕ + title, the bookmark · share ·
 * capsule, and the page dots float over it in blurred glass pills (the pages
 * clear the top pill with their padding; a cover photo runs under it). The
 * capsule's Scroll pops this screen and the host reopens the Poster
 * (requestScrollOpen); any photo opens the lightbox.
 *
 * Orientation: the first time, a glass prompt asks the cook to turn the phone
 * (the choice to hide it is remembered); then `lockLandscape()`. The unmount
 * ALWAYS restores portrait (back chip, swipe back, hardware back alike). A
 * host that cannot rotate (web, a stale Expo Go) gets the same spread stacked
 * vertically instead of failing.
 */
type Spread = { kind: 'cover' } | { kind: 'step'; index: number } | { kind: 'plating' };

const SCRIM = 'rgba(6,10,18,0.6)';
const COVER_SCRIM = ['rgba(8,10,14,0)', 'rgba(8,10,14,0.2)', 'rgba(8,10,14,0.88)'] as const;
const GUTTER = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'] as const;
const GUTTER_SHADE = 'rgba(0,0,0,0.22)';

export default function KitchenRecipeBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useKeepAwake();
  const router = useRouter();
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { recipe, loading, error, notFound, reload, setRecipe } = useKitchenRecipeLoad(id);
  const { isSaved, toggleSaved, share } = useRecipeActions(recipe, setRecipe);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const openLightbox = useCallback((images: string[], index: number) => setLightbox({ images, index }), []);

  // ── the rotate prompt + orientation lifecycle ──
  const [prompt, setPrompt] = useState<'checking' | 'show' | 'hidden'>('checking');
  useEffect(() => {
    let cancelled = false;
    getRotateHintSeen().then((seen) => { if (!cancelled) setPrompt(seen ? 'hidden' : 'show'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (prompt === 'hidden') lockLandscape();
  }, [prompt]);
  useEffect(() => () => { lockPortrait(); }, []);

  const openBook = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) setRotateHintSeen(true);
    setPrompt('hidden');
  }, []);
  const readSteps = useCallback(() => {
    // Typed routes learn the new screens on the next dev-server run.
    router.replace({ pathname: '/kitchen-recipe-steps', params: { id } } as any);
  }, [router, id]);
  const switchView = useCallback(
    (mode: KitchenViewMode) => {
      if (mode === 'scroll') {
        requestScrollOpen(id);
        router.back();
      } else if (mode === 'steps') readSteps();
    },
    [router, readSteps, id],
  );

  // ── spreads ──
  const spreads = useMemo<Spread[]>(() => {
    if (!recipe) return [{ kind: 'cover' }];
    return [{ kind: 'cover' }, ...recipe.steps.map((_, index) => ({ kind: 'step' as const, index })), { kind: 'plating' }];
  }, [recipe]);
  const lastIndex = spreads.length - 1;
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<Spread>>(null);
  const [spreadH, setSpreadH] = useState(0);
  const onSpreadLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== spreadH) setSpreadH(h);
  }, [spreadH]);

  const pageW = width - insets.left - insets.right;
  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(lastIndex, i));
      if (next === page) return;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setPage(next);
    },
    [lastIndex, page],
  );
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.max(0, Math.min(lastIndex, Math.round(e.nativeEvent.contentOffset.x / pageW))));
    },
    [pageW, lastIndex],
  );

  const renderSpread = useCallback(
    ({ item, index }: { item: Spread; index: number }) => (
      <View style={[styles.spread, { width: pageW, height: spreadH, flexDirection: landscape ? 'row' : 'column' }]}>
        {!!recipe && <SpreadPages spread={item} spreadIndex={index} recipe={recipe} landscape={landscape} onPressImage={openLightbox} />}
      </View>
    ),
    [pageW, spreadH, landscape, recipe, openLightbox],
  );

  const title = recipe ? recipeTitle(recipe, lang) : '';
  const kind = recipe ? recipeKindLabel(recipe, lang) : '';
  const chromeTop = Math.max(insets.top, 8) + 4;
  const chromeBottom = Math.max(insets.bottom, 8) + 4;
  const pillTint = isDark ? 'dark' : 'light';
  const pill = [styles.pill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ImageLightbox visible={!!lightbox} images={lightbox?.images ?? []} index={lightbox?.index ?? 0} onClose={() => setLightbox(null)} />

      {/* Everything sits inside the horizontal safe area (the notch, sideways). */}
      <View style={[styles.inner, { marginLeft: insets.left, marginRight: insets.right }]}>
        {/* the spread — edge to edge; the chrome floats over it */}
        <View style={styles.spreadWrap} onLayout={onSpreadLayout}>
          {!recipe ? (
            <View style={styles.center}>
              {loading && <ActivityIndicator color={colors.tint} />}
              {(error || notFound) && !loading && (
                <>
                  <Text style={[styles.failText, { color: colors.textSecondary }]}>{t('kitchen_recipe.load_failed')}</Text>
                  {error && (
                    <Pressable onPress={reload} style={[styles.retry, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                      <Text style={[styles.retryText, { color: colors.text }]}>{t('kitchen_recipe.retry')}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          ) : spreadH > 0 ? (
            <>
              <FlatList
                // Remount on a size change so the paging offsets realign.
                key={`${pageW}x${spreadH}`}
                ref={listRef}
                data={spreads}
                renderItem={renderSpread}
                keyExtractor={(sp) => (sp.kind === 'step' ? `step-${sp.index}` : sp.kind)}
                horizontal
                pagingEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumScrollEnd}
                getItemLayout={(_, index) => ({ length: pageW, offset: pageW * index, index })}
                initialScrollIndex={Math.min(page, lastIndex)}
                initialNumToRender={2}
                windowSize={3}
              />
              {page > 0 && (
                <GlassSquare
                  ios="chevron.left"
                  android="chevron-left"
                  width={28}
                  height={52}
                  onPress={() => goTo(page - 1)}
                  accessibilityLabel={t('kitchen_recipe.back')}
                  style={[styles.edge, styles.edgeL]}
                />
              )}
              {page < lastIndex && (
                <GlassSquare
                  ios="chevron.right"
                  android="chevron-right"
                  width={28}
                  height={52}
                  onPress={() => goTo(page + 1)}
                  accessibilityLabel={t('kitchen_recipe.next_step')}
                  style={[styles.edge, styles.edgeR]}
                />
              )}
            </>
          ) : null}
        </View>

        {/* floating chrome — ✕ + title on the left · bookmark · share · capsule on the right */}
        <View style={[styles.chromeTop, { top: chromeTop }]} pointerEvents="box-none">
          <GlassBlur intensity={40} tint={pillTint} style={[...pill, styles.pillLeft]}>
            <GlassSquare ios="xmark" android="close" size={32} onPress={() => router.back()} accessibilityLabel={t('kitchen_recipe.close')} />
            <View style={styles.barMid}>
              {!!kind && <Text style={[styles.eyebrow, { color: colors.textSecondary }]} numberOfLines={1}>{kind.toUpperCase()}</Text>}
              <Text style={[styles.barTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            </View>
          </GlassBlur>
          <View style={styles.chromeGap} pointerEvents="none" />
          <GlassBlur intensity={40} tint={pillTint} style={pill}>
            <RecipeActionChips isSaved={isSaved} onToggleSaved={toggleSaved} onShare={share} size={32} />
            <ViewCapsule active="book" onChange={switchView} compact iconOnly />
          </GlassBlur>
        </View>

        {/* floating footer — COVER · dots · PLATING */}
        <View style={[styles.chromeBottom, { bottom: chromeBottom }]} pointerEvents="box-none">
          <GlassBlur intensity={40} tint={pillTint} style={[...pill, styles.pillFoot]}>
            <Text style={[styles.footText, { color: colors.textSecondary }]}>{t('kitchen_recipe.cover').toUpperCase()}</Text>
            <View style={styles.dots}>
              {spreads.map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === page ? colors.tint : colors.glassBorder }]} />
              ))}
            </View>
            <Text style={[styles.footText, { color: colors.textSecondary }]}>{t('kitchen_recipe.plating').toUpperCase()}</Text>
          </GlassBlur>
        </View>
      </View>

      {prompt === 'show' && <RotatePrompt onOpen={openBook} onSteps={readSteps} />}
    </View>
  );
}

// ─── the two pages of a spread ───────────────────────────────────────────────
function SpreadPages({
  spread,
  spreadIndex,
  recipe,
  landscape,
  onPressImage,
}: {
  spread: Spread;
  spreadIndex: number;
  recipe: KitchenRecipeFull;
  landscape: boolean;
  onPressImage: (images: string[], index: number) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const leftNo = spreadIndex * 2 + 1;
  const rightNo = leftNo + 1;
  const stepCount = recipe.steps.length;
  const gutter = (
    <LinearGradient
      colors={[...GUTTER]}
      start={landscape ? { x: 0, y: 0 } : { x: 0, y: 0 }}
      end={landscape ? { x: 0, y: 1 } : { x: 1, y: 0 }}
      style={landscape ? styles.gutterV : styles.gutterH}
    />
  );

  if (spread.kind === 'cover') {
    const facts: RecipeFact[] = recipeFacts(recipe, t);
    const st = stationLabel(recipe.station, t);
    if (st) facts.splice(Math.min(2, facts.length), 0, { key: 'station', label: t('kitchen_recipe.fact_station'), value: st });
    return (
      <>
        <CoverPage recipe={recipe} side="left" landscape={landscape} label={t('kitchen_recipe.cover')} onPressImage={onPressImage} />
        {gutter}
        <BookPage side="right" landscape={landscape} pageNo={rightNo}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageScroll}>
            <TintEyebrow style={styles.eb}>{t('kitchen_recipe.at_a_glance').toUpperCase()}</TintEyebrow>
            <FactsStrip facts={facts} columns={3} compact />
            <ChipsRow station={null} allergens={recipe.allergens} style={styles.pageChips} />
            {recipe.ingredients.length > 0 && (
              <>
                <TintEyebrow style={styles.eb}>{`${t('kitchen_recipe.ingredients')} · ${recipe.ingredients.length}`.toUpperCase()}</TintEyebrow>
                <IngredientRows ingredients={recipe.ingredients} lang={lang} compact />
              </>
            )}
          </ScrollView>
        </BookPage>
      </>
    );
  }

  if (spread.kind === 'step') {
    const step = recipe.steps[spread.index];
    const text = pickLang(step.text, step.text_es, lang).trim();
    const st = stationLabel(recipe.station, t);
    const eyebrow = `${t('kitchen_recipe.step_label')} ${spread.index + 1} ${t('kitchen_recipe.of_label')} ${stepCount}${st ? ` · ${st}` : ''}`;
    const isLastStep = spread.index === stepCount - 1;
    const note = isLastStep ? pickLang(recipe.plating_notes, recipe.plating_notes_es, lang).trim() : '';
    return (
      <>
        <BookPage side="left" landscape={landscape} pageNo={leftNo}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageScroll}>
            <TintEyebrow style={styles.eb}>{eyebrow.toUpperCase()}</TintEyebrow>
            <Text style={[styles.pageTitle, { color: colors.text }]}>{stepTitle(step, spread.index, lang, t)}</Text>
            {!!text && <Text style={[styles.pageText, { color: colors.text }]}>{text}</Text>}
            {!!note && (
              <Text style={[styles.chefNote, { color: colors.textSecondary }]}>{`${t('kitchen_recipe.chefs_note')}: ${note}`}</Text>
            )}
          </ScrollView>
        </BookPage>
        {gutter}
        <BookPage side="right" landscape={landscape} pageNo={rightNo}>
          {step.images.length > 0 ? (
            <PhotoGrid images={step.images} fill gap={8} radius={12} style={styles.photoFill} onPressImage={(i) => onPressImage(step.images, i)} />
          ) : (
            <View style={styles.center}>
              <IconSymbol ios_icon_name="photo" android_material_icon_name="image" size={22} color={colors.textSecondary} />
              <Text style={[styles.failText, { color: colors.textSecondary }]}>{t('kitchen_recipe.no_step_photos')}</Text>
            </View>
          )}
        </BookPage>
      </>
    );
  }

  // plating
  const plating = pickLang(recipe.plating_notes, recipe.plating_notes_es, lang).trim();
  return (
    <>
      <BookPage side="left" landscape={landscape} pageNo={leftNo}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageScroll}>
          <TintEyebrow style={styles.eb}>{t('kitchen_recipe.plating').toUpperCase()}</TintEyebrow>
          <Text style={[styles.pageTitle, { color: colors.text }]}>{t('kitchen_recipe.plating_notes')}</Text>
          <Text style={[styles.pageText, { color: plating ? colors.text : colors.textSecondary }]}>
            {plating || t('kitchen_recipe.no_plating_notes')}
          </Text>
          <ChipsRow station={recipe.station} allergens={recipe.allergens} style={styles.pageChips} />
        </ScrollView>
      </BookPage>
      {gutter}
      <CoverPage recipe={recipe} side="right" landscape={landscape} label={String(rightNo)} onPressImage={onPressImage} />
    </>
  );
}

// ─── a page ──────────────────────────────────────────────────────────────────
function BookPage({ side, landscape, pageNo, children }: { side: 'left' | 'right'; landscape: boolean; pageNo: number; children: React.ReactNode }) {
  const colors = useThemeColors();
  const radius = landscape
    ? side === 'left'
      ? { borderTopLeftRadius: 16, borderBottomLeftRadius: 16, borderTopRightRadius: 3, borderBottomRightRadius: 3 }
      : { borderTopRightRadius: 16, borderBottomRightRadius: 16, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }
    : side === 'left'
      ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }
      : { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderTopLeftRadius: 3, borderTopRightRadius: 3 };
  // The top pill floats over the page's head: clear it (both pages sideways,
  // the top page when stacked).
  const clearTop = landscape || side === 'left';
  return (
    <View style={[styles.page, radius, clearTop && styles.pageClearTop, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      {children}
      {/* the soft shade toward the gutter */}
      <LinearGradient
        colors={side === 'left' ? ['rgba(0,0,0,0)', GUTTER_SHADE] : [GUTTER_SHADE, 'rgba(0,0,0,0)']}
        start={{ x: landscape ? 0 : 0.5, y: landscape ? 0.5 : 0 }}
        end={{ x: landscape ? 1 : 0.5, y: landscape ? 0.5 : 1 }}
        style={landscape ? (side === 'left' ? styles.shadeR : styles.shadeL) : side === 'left' ? styles.shadeB : styles.shadeT}
        pointerEvents="none"
      />
      <Text style={[styles.pno, side === 'left' ? styles.pnoL : styles.pnoR, { color: colors.textSecondary }]}>{pageNo}</Text>
    </View>
  );
}

function CoverPage({
  recipe,
  side,
  landscape,
  label,
  onPressImage,
}: {
  recipe: KitchenRecipeFull;
  side: 'left' | 'right';
  landscape: boolean;
  label: string;
  onPressImage: (images: string[], index: number) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const images = recipeImages(recipe);
  const kind = recipeKindLabel(recipe, lang);
  const radius = landscape
    ? side === 'left'
      ? { borderTopLeftRadius: 16, borderBottomLeftRadius: 16, borderTopRightRadius: 3, borderBottomRightRadius: 3 }
      : { borderTopRightRadius: 16, borderBottomRightRadius: 16, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }
    : side === 'left'
      ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }
      : { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderTopLeftRadius: 3, borderTopRightRadius: 3 };
  return (
    <Pressable
      style={[styles.page, styles.cover, radius]}
      onPress={images.length > 0 ? () => onPressImage(images, 0) : undefined}
      disabled={images.length === 0}
      accessibilityRole={images.length > 0 ? 'imagebutton' : undefined}
    >
      {images.length > 0 ? (
        <StorageExpoImage source={images[0]} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={[POSTER_SLATE, deepen(POSTER_SLATE)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={[...COVER_SCRIM]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.tblock} pointerEvents="none">
        <View style={styles.pills}>
          {!!kind && <PosterPill label={kind} color={POSTER_SLATE} />}
          {recipe.is_special && <PosterPill label={t('kitchen_recipe.special')} color={SPECIAL_GOLD} textColor={SPECIAL_INK} />}
          {recipe.off_menu && <PosterPill label={t('kitchen_recipe.off_menu')} color={POSTER_SLATE} />}
        </View>
        <Text style={styles.coverTitle} numberOfLines={3}>{recipeTitle(recipe, lang)}</Text>
      </View>
      <Text style={[styles.pno, side === 'left' ? styles.pnoL : styles.pnoR, { color: 'rgba(255,255,255,0.6)' }]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

// ─── the rotate prompt ───────────────────────────────────────────────────────
function RotatePrompt({ onOpen, onSteps }: { onOpen: (dontShowAgain: boolean) => void; onSteps: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [dontShow, setDontShow] = useState(true);
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(spin, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] });

  return (
    <View style={styles.rot}>
      <View style={[styles.rotCard, { backgroundColor: colors.card, borderColor: colors.glassBorder }]}>
        <View style={styles.rotIco}>
          <View style={[styles.ph1, { borderColor: colors.text }]} />
          <Animated.View style={[styles.ph2, { borderColor: colors.tint, transform: [{ rotate }] }]} />
        </View>
        <Text style={[styles.rotTitle, { color: colors.text }]}>{t('kitchen_recipe.rotate_title')}</Text>
        <Text style={[styles.rotBody, { color: colors.textSecondary }]}>{t('kitchen_recipe.rotate_body')}</Text>
        <Pressable onPress={() => setDontShow((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: dontShow }} style={styles.ckrow}>
          <View style={[styles.ck, { borderColor: dontShow ? colors.tint : colors.glassBorder, backgroundColor: dontShow ? colors.tint : colors.glass }]}>
            {dontShow && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.fireText} />}
          </View>
          <Text style={[styles.ckText, { color: colors.text }]}>{t('kitchen_recipe.rotate_dont_show')}</Text>
        </Pressable>
        <Pressable onPress={() => onOpen(dontShow)} accessibilityRole="button" style={[styles.cta, { backgroundColor: colors.tint }]}>
          <Text style={[styles.ctaText, { color: colors.fireText }]}>{t('kitchen_recipe.rotate_open')}</Text>
        </Pressable>
        <Pressable onPress={onSteps} accessibilityRole="link" hitSlop={8} style={styles.lnk}>
          <Text style={[styles.lnkText, { color: colors.tint }]}>{t('kitchen_recipe.rotate_steps_instead')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, position: 'relative' },

  // the floating chrome
  chromeTop: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', zIndex: 5 },
  chromeGap: { flex: 1, minWidth: 8 },
  chromeBottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
  },
  pillLeft: { maxWidth: '46%' },
  pillFoot: { height: 28, paddingHorizontal: 10, gap: 7, borderRadius: 10 },
  barMid: { minWidth: 0, flexShrink: 1, paddingRight: 6 },
  eyebrow: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 1.2, marginBottom: 2 },
  barTitle: { fontFamily: fonts.display.bold, fontSize: 15, letterSpacing: -0.2 },

  spreadWrap: { flex: 1, minHeight: 0, position: 'relative' },
  spread: { paddingHorizontal: 6, paddingVertical: 6, alignItems: 'stretch' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  failText: { fontFamily: fonts.body.regular, fontSize: 13.5, textAlign: 'center' },
  retry: { paddingHorizontal: 16, height: 40, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: fonts.body.semibold, fontSize: 14 },

  page: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 36,
    overflow: 'hidden',
    position: 'relative',
  },
  // Clears the floating top pill (12 + 44 from the inner top, the spread's 6 taken off).
  pageClearTop: { paddingTop: 60 },
  pageScroll: { paddingBottom: 6 },
  cover: { padding: 0, borderColor: 'transparent' },
  gutterV: { width: 2, alignSelf: 'stretch' },
  gutterH: { height: 2, alignSelf: 'stretch' },
  shadeR: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 18 },
  shadeL: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 18 },
  shadeB: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 18 },
  shadeT: { position: 'absolute', left: 0, right: 0, top: 0, height: 18 },
  pno: { position: 'absolute', bottom: 9, fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 1 },
  pnoL: { left: 18 },
  pnoR: { right: 18 },

  eb: { marginBottom: 6 },
  pageChips: { marginTop: 8, marginBottom: 8 },
  pageTitle: { fontFamily: fonts.display.bold, fontSize: 24, letterSpacing: -0.5, lineHeight: 26, marginBottom: 10 },
  pageText: { fontFamily: fonts.body.regular, fontSize: 14.5, lineHeight: 22 },
  chefNote: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 19, marginTop: 10 },
  photoFill: { flex: 1 },

  tblock: { position: 'absolute', left: 16, right: 16, bottom: 44 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 },
  coverTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: INK_ON_PHOTO,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  edge: { position: 'absolute', top: '50%', marginTop: -26, borderRadius: 9 },
  edgeL: { left: 16 },
  edgeR: { right: 16 },

  footText: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 1 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  rot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM, alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 10 },
  rotCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    paddingTop: 26,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    boxShadow: '0px 30px 60px -20px rgba(0,0,0,0.6)',
  },
  rotIco: { width: 84, height: 84, marginBottom: 14, position: 'relative' },
  ph1: { position: 'absolute', left: 28, top: 6, width: 28, height: 52, borderRadius: 7, borderWidth: 2.5, opacity: 0.35 },
  ph2: { position: 'absolute', left: 10, top: 30, width: 64, height: 30, borderRadius: 7, borderWidth: 2.5 },
  rotTitle: { fontFamily: fonts.display.bold, fontSize: 21, letterSpacing: -0.4, marginBottom: 6, textAlign: 'center' },
  rotBody: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 19.5, textAlign: 'center', marginBottom: 16 },
  ckrow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  ck: { width: 22, height: 22, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center', justifyContent: 'center' },
  ckText: { fontFamily: fonts.body.semibold, fontSize: 13 },
  cta: { alignSelf: 'stretch', height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 16 },
  lnk: { marginTop: 12 },
  lnkText: { fontFamily: fonts.body.semibold, fontSize: 13 },
});
