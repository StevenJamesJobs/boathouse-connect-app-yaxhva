import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import PosterSheet, { PosterPill, POSTER_SLATE } from '@/components/PosterSheet';
import { useSheetHandoff } from '@/components/GlassSheet';
import ImageLightbox from '@/components/ImageLightbox';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { pickLang, type KitchenRecipeFull, type KitchenViewMode } from '@/hooks/useKitchenRecipes';
import {
  ActionChip,
  ChipsRow,
  FactsStrip,
  IngredientRows,
  KeepAwakeLine,
  NoteCard,
  PhotoGrid,
  RecipeActionChips,
  SectionEyebrow,
  SPECIAL_GOLD,
  SPECIAL_INK,
  StepNumber,
  ViewCapsule,
  minutesLabel,
  recipeFacts,
  recipeImages,
  recipeKindLabel,
  recipeTitle,
  stepTitle,
  useKitchenRecipeLoad,
  useLang,
  useRecipeActions,
} from '@/components/kitchen/kitchenReaderKit';

/**
 * KitchenRecipeSheet — the Kitchen Assistant's SCROLL view (s91, mockup frame
 * 3): the whole recipe on one Poster. Self-fetching by id so the hub, the
 * Saved book and the Menu tab's "View Recipe" chip all open the same thing.
 *
 * Into the photo: the placement pill ("Dinner › Entrees" for menu recipes, the
 * group for section recipes), a gold ★ Special pill, a slate "Off the menu"
 * pill; the title is the recipe name (ES when the app runs in Spanish).
 *
 * The panel: the Scroll | Steps | Book capsule + bookmark + share (+ Edit for
 * editors) · the keep-awake line · facts · station + allergen chips ·
 * description · ingredients · numbered steps with their photo grids · plating
 * notes. Switching to Steps / Book NAVIGATES, so it runs through the sheet
 * handoff's `defer` (never a push in the same commit as the close). The view
 * choice is not persisted from here; only the first-open picker remembers.
 */
export interface KitchenRecipeSheetProps {
  visible: boolean;
  recipeId: string | null;
  onClose: () => void;
  /** Editors: the pencil chip. Navigates, so it is deferred past the close. */
  onEdit?: (recipeId: string) => void;
}

const KEEP_AWAKE_TAG = 'kitchen-recipe-sheet';

export default function KitchenRecipeSheet({ visible, recipeId, onClose, onEdit }: KitchenRecipeSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const router = useRouter();
  const { defer } = useSheetHandoff(onClose);
  const { recipe, loading, notFound, setRecipe } = useKitchenRecipeLoad(recipeId, visible);

  // Keep the last recipe so the Poster slides out intact when the host nulls
  // the id in the same commit as `visible: false`.
  const lastRecipe = useRef<KitchenRecipeFull | null>(null);
  if (recipe && recipe.id === recipeId) lastRecipe.current = recipe;
  const r = recipe && recipe.id === recipeId ? recipe : visible ? null : lastRecipe.current;

  // Screen stays on only while the sheet is up.
  useEffect(() => {
    if (!visible) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}); };
  }, [visible]);

  // A recipe that no longer exists closes quietly.
  useEffect(() => {
    if (visible && notFound) onClose();
  }, [visible, notFound, onClose]);

  // Bookmark + share (the kit's shared pair).
  const { isSaved, toggleSaved, share } = useRecipeActions(r, setRecipe);

  // The lightbox: any photo on the Poster (hero or a step grid) opens full screen.
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const switchView = useCallback(
    (mode: KitchenViewMode) => {
      if (!r || mode === 'scroll') return;
      const pathname = mode === 'steps' ? '/kitchen-recipe-steps' : '/kitchen-recipe-book';
      // Typed routes learn the new screens on the next dev-server run.
      defer(() => router.push({ pathname, params: { id: r.id } } as any));
    },
    [r, defer, router],
  );

  const images = r ? recipeImages(r) : [];
  const kind = r ? recipeKindLabel(r, lang) : '';
  const pills = r ? (
    <>
      {!!kind && <PosterPill label={kind} color={POSTER_SLATE} />}
      {r.is_special && <PosterPill label={t('kitchen_recipe.special')} color={SPECIAL_GOLD} textColor={SPECIAL_INK} />}
      {r.off_menu && <PosterPill label={t('kitchen_recipe.off_menu')} color={POSTER_SLATE} />}
    </>
  ) : undefined;

  const description = r ? pickLang(r.description, r.description_es, lang).trim() : '';
  const plating = r ? pickLang(r.plating_notes, r.plating_notes_es, lang).trim() : '';
  const facts = r ? recipeFacts(r, t) : [];

  return (
    <PosterSheet
      visible={visible}
      onClose={onClose}
      images={images}
      pills={pills}
      title={r ? recipeTitle(r, lang) : ''}
      onImagePress={(index) => setLightbox({ images, index })}
    >
      <ImageLightbox visible={!!lightbox} images={lightbox?.images ?? []} index={lightbox?.index ?? 0} onClose={() => setLightbox(null)} />
      {!r ? (
        <View style={styles.loading}>
          {loading && <ActivityIndicator color={colors.tint} />}
        </View>
      ) : (
        <View style={styles.body}>
          {/* (a) the action row */}
          <View style={styles.actrow}>
            <ViewCapsule active="scroll" onChange={switchView} style={styles.capFlex} />
            <RecipeActionChips isSaved={isSaved} onToggleSaved={toggleSaved} onShare={share} />
            {!!onEdit && (
              <ActionChip ios="pencil" android="edit" onPress={() => defer(() => onEdit(r.id))} accessibilityLabel={t('kitchen_recipe.edit')} />
            )}
          </View>

          {/* (b) keep-awake line */}
          <KeepAwakeLine label={t('kitchen_recipe.keep_awake')} style={styles.keep} />

          {/* (c) facts */}
          <FactsStrip facts={facts} />

          {/* (d) station + allergens */}
          <ChipsRow station={r.station} allergens={r.allergens} />

          {/* (e) description */}
          {!!description && <Text style={[styles.desc, { color: colors.text }]}>{description}</Text>}

          {/* (f) ingredients */}
          {r.ingredients.length > 0 && (
            <View style={styles.section}>
              <SectionEyebrow label={t('kitchen_recipe.ingredients')} count={r.ingredients.length} />
              <IngredientRows ingredients={r.ingredients} lang={lang} />
            </View>
          )}

          {/* (g) steps */}
          {r.steps.length > 0 && (
            <View style={styles.section}>
              <SectionEyebrow label={t('kitchen_recipe.steps')} count={r.steps.length} />
              {r.steps.map((s, i) => {
                const text = pickLang(s.text, s.text_es, lang).trim();
                const last = i === r.steps.length - 1;
                return (
                  <View key={i} style={[styles.step, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }]}>
                    <StepNumber n={i + 1} />
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepTitle, { color: colors.text }]}>{stepTitle(s, i, lang, t)}</Text>
                      {!!text && <Text style={[styles.stepText, { color: colors.text }]}>{text}</Text>}
                      {!!s.minutes && (
                        <Text style={[styles.stepMin, { color: colors.textSecondary }]}>{`⏱ ${minutesLabel(s.minutes, t)}`}</Text>
                      )}
                      {s.images.length > 0 && (
                        <PhotoGrid images={s.images} style={styles.stepPhotos} onPressImage={(index) => setLightbox({ images: s.images, index })} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* (h) plating notes */}
          {!!plating && (
            <View style={styles.section}>
              <SectionEyebrow label={t('kitchen_recipe.plating_notes')} />
              <NoteCard label={t('kitchen_recipe.plating_notes')} text={plating} />
            </View>
          )}
        </View>
      )}
    </PosterSheet>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 12 },
  actrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capFlex: { flex: 1, minWidth: 0 },
  keep: { marginTop: -4, marginHorizontal: 2 },
  desc: { fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 21 },
  section: { gap: 4 },
  step: { flexDirection: 'row', gap: 11, paddingVertical: 12, alignItems: 'flex-start' },
  stepBody: { flex: 1, minWidth: 0 },
  stepTitle: { fontFamily: fonts.display.semibold, fontSize: 15, marginBottom: 3 },
  stepText: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 20 },
  stepMin: { fontFamily: fonts.mono.medium, fontSize: 10.5, letterSpacing: 0.4, marginTop: 6 },
  stepPhotos: { marginTop: 9 },
});
