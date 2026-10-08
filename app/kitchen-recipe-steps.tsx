import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeepAwake } from 'expo-keep-awake';
import AmbientGlow from '@/components/AmbientGlow';
import ImageLightbox from '@/components/ImageLightbox';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { pickLang, requestScrollOpen, type KitchenStep, type KitchenViewMode } from '@/hooks/useKitchenRecipes';
import {
  ChipsRow,
  FactsStrip,
  GlassSquare,
  IngredientRows,
  NoteCard,
  PhotoGrid,
  RecipeActionChips,
  SectionEyebrow,
  TintEyebrow,
  ViewCapsule,
  minutesLabel,
  recipeFacts,
  recipeTitle,
  stationLabel,
  stepTitle,
  useKitchenRecipeLoad,
  useLang,
  useRecipeActions,
} from '@/components/kitchen/kitchenReaderKit';

/**
 * Kitchen recipe · STEPS view (s91, mockup frame 4): one step at a time in big
 * type, portrait, full screen. Page 0 is "At a glance" (title · facts ·
 * allergens · ingredients), then one page per step; the last page carries the
 * plating notes. Swipe, tap the right edge of the page, or use the two big
 * buttons. The screen stays on while it is open.
 *
 * Route param: `id` (the kitchen recipe id). The capsule's Scroll pops this
 * screen and asks the host that regains focus to open the Poster
 * (requestScrollOpen); Book replaces this screen. Bookmark + share ride the
 * top bar; any step photo opens the lightbox.
 */
type Page = { kind: 'glance' } | { kind: 'step'; step: KitchenStep; index: number };

export default function KitchenRecipeStepsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useKeepAwake();
  const router = useRouter();
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { recipe, loading, error, notFound, reload, setRecipe } = useKitchenRecipeLoad(id);
  const { isSaved, toggleSaved, share } = useRecipeActions(recipe, setRecipe);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<Page>>(null);

  const pages = useMemo<Page[]>(() => {
    if (!recipe) return [{ kind: 'glance' }];
    return [{ kind: 'glance' }, ...recipe.steps.map((step, index) => ({ kind: 'step' as const, step, index }))];
  }, [recipe]);
  const stepCount = recipe?.steps.length ?? 0;
  const lastIndex = pages.length - 1;
  const isLast = page >= lastIndex;

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(lastIndex, i));
      if (next === page) return;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setPage(next);
    },
    [lastIndex, page],
  );
  const onNext = useCallback(() => {
    if (isLast) router.back();
    else goTo(page + 1);
  }, [isLast, page, goTo, router]);
  const onBack = useCallback(() => {
    if (page === 0) router.back();
    else goTo(page - 1);
  }, [page, goTo, router]);
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.max(0, Math.min(lastIndex, Math.round(e.nativeEvent.contentOffset.x / width))));
    },
    [width, lastIndex],
  );

  const switchView = useCallback(
    (mode: KitchenViewMode) => {
      if (mode === 'scroll') {
        requestScrollOpen(id);
        router.back();
      }
      // Typed routes learn the new screens on the next dev-server run.
      else if (mode === 'book') router.replace({ pathname: '/kitchen-recipe-book', params: { id } } as any);
    },
    [router, id],
  );

  const renderPage = useCallback(
    ({ item }: { item: Page }) => (
      <View style={{ width }}>
        <ScrollView
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {item.kind === 'glance' ? (
            !!recipe && (
              <View style={styles.glance}>
                <TintEyebrow>{t('kitchen_recipe.at_a_glance').toUpperCase()}</TintEyebrow>
                <Text style={[styles.h2, { color: colors.text }]}>{recipeTitle(recipe, lang)}</Text>
                <FactsStrip facts={recipeFacts(recipe, t)} />
                <ChipsRow station={recipe.station} allergens={recipe.allergens} />
                {!!pickLang(recipe.description, recipe.description_es, lang).trim() && (
                  <Text style={[styles.desc, { color: colors.text }]}>{pickLang(recipe.description, recipe.description_es, lang).trim()}</Text>
                )}
                {recipe.ingredients.length > 0 && (
                  <View>
                    <SectionEyebrow label={t('kitchen_recipe.ingredients')} count={recipe.ingredients.length} />
                    <IngredientRows ingredients={recipe.ingredients} lang={lang} />
                  </View>
                )}
              </View>
            )
          ) : (
            !!recipe && (
              <StepPage
                step={item.step}
                index={item.index}
                total={stepCount}
                station={recipe.station}
                plating={item.index === stepCount - 1 ? pickLang(recipe.plating_notes, recipe.plating_notes_es, lang).trim() : ''}
                onPressImage={(index) => setLightbox({ images: item.step.images, index })}
              />
            )
          )}
          {/* The right-edge tap zone lives INSIDE the page's scroll content so a
              drag that starts on it still pages horizontally (and scrolls the
              page): both scrollables are its ancestors. */}
          <Pressable style={styles.tapZone} onPress={onNext} accessible={false} />
        </ScrollView>
      </View>
    ),
    [width, recipe, t, lang, colors.text, stepCount, onNext],
  );

  const title = recipe ? recipeTitle(recipe, lang) : '';

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 14) }]}>
      <AmbientGlow />

      <ImageLightbox visible={!!lightbox} images={lightbox?.images ?? []} index={lightbox?.index ?? 0} onClose={() => setLightbox(null)} />

      {/* top row: ✕ · capsule (hugging) · bookmark · share */}
      <View style={styles.top}>
        <GlassSquare ios="xmark" android="close" onPress={() => router.back()} accessibilityLabel={t('kitchen_recipe.close')} />
        <ViewCapsule active="steps" onChange={switchView} compact iconOnly />
        <View style={styles.spacer} />
        <RecipeActionChips isSaved={isSaved} onToggleSaved={toggleSaved} onShare={share} size={38} />
      </View>

      {/* progress: eyebrow + title · the step segments */}
      <View style={styles.prog}>
          <View style={styles.progLine}>
            <Text style={[styles.progLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {page === 0 ? (
                t('kitchen_recipe.at_a_glance').toUpperCase()
              ) : (
                <>
                  {t('kitchen_recipe.step_label').toUpperCase()} <Text style={{ color: colors.tint }}>{page}</Text> {t('kitchen_recipe.of_label').toUpperCase()} {stepCount}
                </>
              )}
            </Text>
            <Text style={[styles.progLabel, styles.progTitle, { color: colors.textSecondary }]} numberOfLines={1}>{title.toUpperCase()}</Text>
          </View>
          <View style={styles.segs}>
            {Array.from({ length: Math.max(1, stepCount) }, (_, i) => {
              const done = i < page - 1;
              const current = i === page - 1;
              return (
                <View
                  key={i}
                  style={[
                    styles.seg,
                    { backgroundColor: done || current ? colors.tint : colors.glassBorder, opacity: current ? 0.55 : 1 },
                  ]}
                />
              );
            })}
          </View>
      </View>

      {/* body: the pager */}
      <View style={styles.body}>
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
        ) : (
          <FlatList
            ref={listRef}
            data={pages}
            renderItem={renderPage}
            keyExtractor={(p) => (p.kind === 'glance' ? 'glance' : `step-${p.index}`)}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            initialNumToRender={2}
            windowSize={3}
          />
        )}
      </View>

      {/* bottom: Back · Next step / Done · hint */}
      <View style={styles.bottom}>
        <View style={styles.bigrow}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            style={[styles.big, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.text} />
            <Text style={[styles.bigText, { color: colors.text }]}>{t('kitchen_recipe.back')}</Text>
          </Pressable>
          <Pressable
            onPress={onNext}
            disabled={!recipe}
            accessibilityRole="button"
            style={[styles.big, styles.bigGo, { backgroundColor: colors.tint, borderColor: 'transparent', opacity: recipe ? 1 : 0.5 }]}
          >
            {isLast && !!recipe ? (
              <>
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color={colors.fireText} />
                <Text style={[styles.bigText, { color: colors.fireText }]}>{t('kitchen_recipe.done')}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.bigText, { color: colors.fireText }]}>{t('kitchen_recipe.next_step')}</Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.fireText} />
              </>
            )}
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('kitchen_recipe.swipe_hint').toUpperCase()}</Text>
      </View>
    </View>
  );
}

function StepPage({
  step,
  index,
  total,
  station,
  plating,
  onPressImage,
}: {
  step: KitchenStep;
  index: number;
  total: number;
  station: string | null;
  plating: string;
  onPressImage: (index: number) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const eyebrowParts = [stationLabel(station, t), step.minutes ? minutesLabel(step.minutes, t) : ''].filter(Boolean);
  const eyebrow = eyebrowParts.length ? eyebrowParts.join(' · ') : `${t('kitchen_recipe.step_label')} ${index + 1} ${t('kitchen_recipe.of_label')} ${total}`;
  const text = pickLang(step.text, step.text_es, lang).trim();
  return (
    <View style={styles.stepPage}>
      <TintEyebrow>{eyebrow.toUpperCase()}</TintEyebrow>
      <Text style={[styles.h2, { color: colors.text }]}>{stepTitle(step, index, lang, t)}</Text>
      {!!text && <Text style={[styles.stepText, { color: colors.text }]}>{text}</Text>}
      {step.images.length > 0 && <PhotoGrid images={step.images} style={styles.photos} onPressImage={onPressImage} />}
      {!!plating && <NoteCard label={t('kitchen_recipe.plating_notes')} text={plating} style={styles.plating} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, marginBottom: 10 },
  spacer: { flex: 1 },
  prog: { paddingHorizontal: 18, gap: 6, marginBottom: 10 },
  progLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  progLabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4 },
  progTitle: { flexShrink: 1, textAlign: 'right' },
  segs: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2 },

  body: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  failText: { fontFamily: fonts.body.regular, fontSize: 14, textAlign: 'center' },
  retry: { paddingHorizontal: 16, height: 40, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: fonts.body.semibold, fontSize: 14 },

  pageContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 16 },
  tapZone: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '34%' },
  glance: { gap: 12 },
  h2: { fontFamily: fonts.display.bold, fontSize: 27, letterSpacing: -0.5, lineHeight: 30, marginTop: 6 },
  desc: { fontFamily: fonts.body.regular, fontSize: 14.5, lineHeight: 21 },
  stepPage: { gap: 0 },
  stepText: { fontFamily: fonts.body.regular, fontSize: 17, lineHeight: 25.5, marginTop: 8 },
  photos: { marginTop: 14 },
  plating: { marginTop: 14 },

  bottom: { paddingHorizontal: 18, paddingTop: 10 },
  bigrow: { flexDirection: 'row', gap: 10 },
  big: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  bigGo: { flex: 1.6 },
  bigText: { fontFamily: fonts.display.bold, fontSize: 17 },
  hint: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textAlign: 'center', marginTop: 10 },
});
