import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { GlassToggle } from '@/components/content/FormKit';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import {
  fetchKitchenRecipe,
  getKitchenViewMode,
  pickLang,
  setKitchenViewMode,
  takeScrollOpen,
  type KitchenViewMode,
} from '@/hooks/useKitchenRecipes';
import KitchenRecipeSheet from '@/components/kitchen/KitchenRecipeSheet';
import { VIEW_ICONS, useLang, viewLabel } from '@/components/kitchen/kitchenReaderKit';

/**
 * useKitchenRecipeOpener — ONE way to open a kitchen recipe from anywhere (the
 * hub's books, Saved, the Menu tab's "View Recipe" chip). The caller renders
 * `node` once and calls `openRecipe(id)`.
 *
 * First open on a device (no remembered view) → the picker sheet (mockup frame
 * 3, "First open · pick a view"): Scroll / Steps / Book rows + a "Remember my
 * choice" toggle. Then: scroll → the Poster sheet right here; steps / book →
 * the full-screen readers by route. The picker is a GlassSheet, so what it
 * opens next runs through useSheetHandoff's `defer` (a nested Modal or a push
 * in the same commit as the close is dropped by UIKit).
 *
 * A reader route's capsule set to Scroll pops the reader and leaves the id in
 * `requestScrollOpen`; whichever host regains focus consumes it here and
 * shows the Poster (Steve's device round, ask #3 — the Scroll tab used to
 * land on the book list).
 */
export function useKitchenRecipeOpener(opts?: { onEdit?: (recipeId: string) => void }): {
  openRecipe: (id: string) => void;
  node: React.ReactNode;
} {
  const router = useRouter();
  const onEdit = opts?.onEdit;

  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [pickVisible, setPickVisible] = useState(false);

  const go = useCallback(
    (mode: KitchenViewMode, id: string) => {
      if (mode === 'scroll') {
        setSheetId(id);
        setSheetVisible(true);
        return;
      }
      const pathname = mode === 'steps' ? '/kitchen-recipe-steps' : '/kitchen-recipe-book';
      // Typed routes learn the new screens on the next dev-server run.
      router.push({ pathname, params: { id } } as any);
    },
    [router],
  );

  const openRecipe = useCallback(
    (id: string) => {
      getKitchenViewMode().then((mode) => {
        if (mode) go(mode, id);
        else {
          setPickId(id);
          setPickVisible(true);
        }
      });
    },
    [go],
  );

  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const closePicker = useCallback(() => setPickVisible(false), []);

  useFocusEffect(
    useCallback(() => {
      const pending = takeScrollOpen();
      if (!pending) return;
      // Let the pop finish before presenting the Modal.
      const tm = setTimeout(() => {
        setSheetId(pending);
        setSheetVisible(true);
      }, 380);
      return () => clearTimeout(tm);
    }, []),
  );

  const node = useMemo(
    () => (
      <>
        <ViewPickerSheet visible={pickVisible} recipeId={pickId} onClose={closePicker} onPick={go} />
        <KitchenRecipeSheet visible={sheetVisible} recipeId={sheetId} onClose={closeSheet} onEdit={onEdit} />
      </>
    ),
    [pickVisible, pickId, closePicker, go, sheetVisible, sheetId, closeSheet, onEdit],
  );

  return { openRecipe, node };
}

// ─── the picker ──────────────────────────────────────────────────────────────
function ViewPickerSheet({
  visible,
  recipeId,
  onClose,
  onPick,
}: {
  visible: boolean;
  recipeId: string | null;
  onClose: () => void;
  onPick: (mode: KitchenViewMode, id: string) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState('');

  // The title is the recipe name once it lands; "Read it as…" until then.
  const nameFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !recipeId || !user?.id) return;
    if (nameFor.current === recipeId) return;
    setName('');
    let cancelled = false;
    fetchKitchenRecipe(user.id, recipeId)
      .then((r) => {
        if (cancelled || !r) return;
        nameFor.current = recipeId;
        setName(pickLang(r.name, r.name_es, lang));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, recipeId, user?.id, lang]);

  const pick = useCallback(
    (mode: KitchenViewMode) => {
      if (!recipeId) return;
      if (remember) setKitchenViewMode(mode);
      defer(() => onPick(mode, recipeId));
    },
    [recipeId, remember, defer, onPick],
  );

  const rows: { mode: KitchenViewMode; sub: string }[] = [
    { mode: 'scroll', sub: t('kitchen_recipe.pick_scroll_sub') },
    { mode: 'steps', sub: t('kitchen_recipe.pick_steps_sub') },
    { mode: 'book', sub: t('kitchen_recipe.pick_book_sub') },
  ];

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={name || t('kitchen_recipe.pick_title_fallback')}
      subtitle={t('kitchen_recipe.pick_subtitle')}
    >
      <View style={styles.rows}>
        {rows.map((row) => (
          <Pressable
            key={row.mode}
            onPress={() => pick(row.mode)}
            accessibilityRole="button"
            style={[styles.arow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
          >
            <IconSymbol ios_icon_name={VIEW_ICONS[row.mode].ios} android_material_icon_name={VIEW_ICONS[row.mode].android} size={17} color={colors.tint} />
            <View style={styles.arowBody}>
              <Text style={[styles.arowTitle, { color: colors.text }]}>{viewLabel(row.mode, t)}</Text>
              <Text style={[styles.arowSub, { color: colors.textSecondary }]}>{row.sub}</Text>
            </View>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
          </Pressable>
        ))}

        <View style={[styles.trow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.arowBody}>
            <Text style={[styles.trowTitle, { color: colors.text }]}>{t('kitchen_recipe.remember_choice')}</Text>
            <Text style={[styles.arowSub, { color: colors.textSecondary }]}>{t('kitchen_recipe.remember_choice_sub')}</Text>
          </View>
          <GlassToggle value={remember} onValueChange={setRemember} />
        </View>
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8, paddingBottom: 4 },
  arow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  arowBody: { flex: 1, minWidth: 0 },
  arowTitle: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  arowSub: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1, lineHeight: 15 },
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginTop: 4,
  },
  trowTitle: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
});
