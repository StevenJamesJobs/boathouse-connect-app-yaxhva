import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import StepSheet, { type StepDef } from '@/components/content/StepSheet';
import { FieldLabel, Hint, GlassTextInput, GlassToggle, SelectRow, StepTitle, useFormStyles } from '@/components/content/FormKit';
import GlassSheet from '@/components/GlassSheet';
import GlassActionSheet, { type GlassAction } from '@/components/GlassActionSheet';
import MultiImageField from '@/components/MultiImageField';
import StepPhotoStrip from '@/components/kitchen/StepPhotoStrip';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { doneHue, EMBER } from '@/components/content/contentVisuals';
import { useAuth } from '@/contexts/AuthContext';
import { translateServerError } from '@/utils/serverErrors';
import { translateTextsDetailed } from '@/utils/translateContent';
import { toPublicUrl } from '@/utils/storageResolver';
import { fonts } from '@/constants/fonts';
import {
  fetchKitchenRecipe,
  fetchKitchenGroups,
  createKitchenRecipe,
  updateKitchenRecipe,
  KITCHEN_ALLERGENS,
  KITCHEN_STATIONS,
  type KitchenAllergen,
  type KitchenGroup,
  type KitchenIngredient,
  type KitchenRecipeFull,
  type KitchenRecipePayload,
  type KitchenSection,
  type KitchenStep,
} from '@/hooks/useKitchenRecipes';

/**
 * KitchenRecipeFormSheet — the Kitchen Assistant's recipe editor (s91,
 * mockup frame 6): a StepSheet with Basics · Details · Ingredients · Steps ·
 * Review. Create opens on Basics; edit fetches the recipe and opens on Review
 * with every step visited (the house "edit opens on Review" rule).
 *
 * A MENU-FED recipe (menu_item_id set) keeps the menu's name, cover and
 * placement read-only here; a SECTION recipe (prep / desserts / banquets)
 * owns its name, group and photos. Photos upload through the broker as they
 * are picked; the server queues removed photos itself on save, so this host
 * never broker-deletes.
 */

export type KitchenEditorSection = 'prep' | 'desserts' | 'banquets';
export type KitchenRecipeFormTarget =
  | { kind: 'edit'; recipeId: string }
  | { kind: 'create'; section: KitchenEditorSection; groupId?: string | null };

export interface KitchenRecipeFormSheetProps {
  visible: boolean;
  onClose: () => void;
  target: KitchenRecipeFormTarget;
  onSaved: (id: string) => void;
}

const IMAGE_BUCKET = 'kitchen-recipes';
const STEP_BASICS = 0;
const STEP_DETAILS = 1;
const STEP_INGREDIENTS = 2;
const STEP_STEPS = 3;
const STEP_REVIEW = 4;

type IngredientRow = { key: string; amount: string; ingredient: string; prep: string; ingredientEs: string | null; prepEs: string | null };
type StepRow = { key: string; title: string; titleEs: string; text: string; textEs: string; minutes: string; images: string[] };

interface Draft {
  name: string;
  nameEs: string;
  groupId: string | null;
  description: string;
  descriptionEs: string;
  images: string[];
  /** Menu-fed recipes: the menu item's cover (two-way). Null for section recipes (their cover is images[0]). */
  coverUrl: string | null;
  yieldText: string;
  portionsText: string;
  prepMinutes: string;
  cookMinutes: string;
  /** A station key, free text (when `stationOther`), or ''. */
  station: string;
  stationOther: boolean;
  shelfLife: string;
  allergens: KitchenAllergen[];
  platingNotes: string;
  platingNotesEs: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
}

let keySeq = 0;
const nextKey = () => `k${Date.now().toString(36)}${(keySeq += 1)}`;
const emptyIngredient = (): IngredientRow => ({ key: nextKey(), amount: '', ingredient: '', prep: '', ingredientEs: null, prepEs: null });
const emptyStep = (): StepRow => ({ key: nextKey(), title: '', titleEs: '', text: '', textEs: '', minutes: '', images: [] });

const emptyDraft = (groupId: string | null): Draft => ({
  name: '',
  nameEs: '',
  groupId,
  description: '',
  descriptionEs: '',
  images: [],
  coverUrl: null,
  yieldText: '',
  portionsText: '',
  prepMinutes: '',
  cookMinutes: '',
  station: '',
  stationOther: false,
  shelfLife: '',
  allergens: [],
  platingNotes: '',
  platingNotesEs: '',
  ingredients: [emptyIngredient()],
  steps: [emptyStep()],
});

function draftFromRecipe(r: KitchenRecipeFull): Draft {
  const stationKnown = !!r.station && (KITCHEN_STATIONS as readonly string[]).includes(r.station);
  return {
    name: r.name ?? '',
    nameEs: r.name_es ?? '',
    groupId: r.group_id,
    description: r.description ?? '',
    descriptionEs: r.description_es ?? '',
    images: r.images,
    coverUrl: r.menu_item_id ? r.thumbnail_url ?? null : null,
    yieldText: r.yield_text ?? '',
    portionsText: r.portions_text ?? '',
    prepMinutes: r.prep_minutes != null ? String(r.prep_minutes) : '',
    cookMinutes: r.cook_minutes != null ? String(r.cook_minutes) : '',
    station: r.station ?? '',
    stationOther: !!r.station && !stationKnown,
    shelfLife: r.shelf_life ?? '',
    allergens: r.allergens,
    platingNotes: r.plating_notes ?? '',
    platingNotesEs: r.plating_notes_es ?? '',
    ingredients: r.ingredients.length
      ? r.ingredients.map((i) => ({
          key: nextKey(),
          amount: i.amount ?? '',
          ingredient: i.ingredient,
          prep: i.prep ?? '',
          ingredientEs: i.ingredient_es ?? null,
          prepEs: i.prep_es ?? null,
        }))
      : [emptyIngredient()],
    steps: r.steps.length
      ? r.steps.map((s) => ({
          key: nextKey(),
          title: s.title ?? '',
          titleEs: s.title_es ?? '',
          text: s.text ?? '',
          textEs: s.text_es ?? '',
          minutes: s.minutes != null ? String(s.minutes) : '',
          images: s.images,
        }))
      : [emptyStep()],
  };
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);
const minutesOrNull = (s: string): number | null => {
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');
const stepHasContent = (s: StepRow) => !!(s.title.trim() || s.text.trim());

// Ember is a fixed-dark ink; light themes use the accent (the rulebook's rule).
const emberInk = (isDark: boolean, primary: string) => (isDark ? EMBER : primary);

export default function KitchenRecipeFormSheet({ visible, onClose, target, onSaved }: KitchenRecipeFormSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const f = useFormStyles(colors);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const uid = user?.id;

  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recipe, setRecipe] = useState<KitchenRecipeFull | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));
  const [groups, setGroups] = useState<KitchenGroup[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [stepMenu, setStepMenu] = useState<number | null>(null);
  const [nameError, setNameError] = useState(false);
  const [translateOnSave, setTranslateOnSave] = useState(true);

  const targetRef = useRef(target);
  targetRef.current = target;
  const targetKey = target.kind === 'edit' ? `edit:${target.recipeId}` : `create:${target.section}:${target.groupId ?? ''}`;

  const isMenu = !!recipe?.menu_item_id;
  const section: KitchenSection = recipe ? recipe.section : target.kind === 'create' ? target.section : 'prep';
  const editing = target.kind === 'edit';

  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  // Open: reset for create, fetch for edit. The target key (not the object) is
  // the dependency so a parent re-render never re-fetches mid-edit.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const tg = targetRef.current;
    setNameError(false);
    setStepMenu(null);
    setGroupPickerOpen(false);
    if (tg.kind === 'create') {
      setRecipe(null);
      setDraft(emptyDraft(tg.groupId ?? null));
      setStep(STEP_BASICS);
      setVisited(STEP_BASICS);
      setTranslateOnSave(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setStep(STEP_REVIEW);
    setVisited(STEP_REVIEW);
    setTranslateOnSave(false);
    if (!uid) return;
    fetchKitchenRecipe(uid, tg.recipeId)
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          Alert.alert(t('common.error'), t('kitchen_editor.load_failed'));
          onClose();
          return;
        }
        setRecipe(r);
        setDraft(draftFromRecipe(r));
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('KitchenRecipeFormSheet load error:', e);
        Alert.alert(t('common.error'), translateServerError(e, t('kitchen_editor.load_failed')));
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, targetKey, uid]);

  // The section's groups (section recipes only).
  useEffect(() => {
    if (!visible || !uid || section === 'menu') return;
    let cancelled = false;
    fetchKitchenGroups(uid, section)
      .then((g) => {
        if (!cancelled) setGroups(g);
      })
      .catch((e) => console.error('KitchenRecipeFormSheet groups error:', e));
    return () => {
      cancelled = true;
    };
  }, [visible, uid, section]);

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(STEP_REVIEW, index));
    setStep(next);
    setVisited((v) => Math.max(v, next));
  };

  const steps: StepDef[] = useMemo(
    () => [
      { key: 'basics', label: t('content_editor.step_basics') },
      { key: 'details', label: t('content_editor.step_details') },
      { key: 'ingredients', label: t('kitchen_editor.step_ingredients') },
      { key: 'steps', label: t('kitchen_editor.step_steps') },
      { key: 'review', label: t('content_editor.step_review') },
    ],
    [t],
  );

  const sectionLabel = (s: KitchenSection) =>
    s === 'prep' ? t('kitchen_editor.section_prep') : s === 'desserts' ? t('kitchen_editor.section_desserts') : s === 'banquets' ? t('kitchen_editor.section_banquets') : '';
  const stationLabel = (key: string) => t(`kitchen_recipe.station_${key}`);
  const allergenLabel = (key: string) => t(`kitchen_recipe.allergen_${key}`);
  const groupName = draft.groupId ? groups.find((g) => g.id === draft.groupId)?.name ?? '' : '';

  // ── Payload + save ──────────────────────────────────────────────────────────
  const cleanIngredients = (rows: IngredientRow[]): KitchenIngredient[] =>
    rows
      .filter((r) => r.ingredient.trim())
      .map((r) => ({
        amount: orNull(r.amount),
        ingredient: r.ingredient.trim(),
        ingredient_es: r.ingredientEs,
        prep: orNull(r.prep),
        prep_es: r.prepEs,
      }));

  const handleSave = async () => {
    if (!uid || busy) return;
    if (!isMenu && !draft.name.trim()) {
      setNameError(true);
      goToStep(STEP_BASICS);
      return;
    }
    setBusy(true);
    try {
      let d = draft;
      if (translateOnSave) d = await fillSpanish(d, isMenu);
      const liveSteps = d.steps.filter(stepHasContent);
      const payload: KitchenRecipePayload = {
        images: d.images,
        allergens: d.allergens,
        ingredients: cleanIngredients(d.ingredients),
        steps: liveSteps.map<KitchenStep>((s) => ({
          title: orNull(s.title),
          title_es: orNull(s.titleEs),
          text: orNull(s.text),
          text_es: orNull(s.textEs),
          minutes: minutesOrNull(s.minutes),
          images: s.images,
        })),
        description: orNull(d.description),
        description_es: orNull(d.descriptionEs),
        yield_text: orNull(d.yieldText),
        portions_text: orNull(d.portionsText),
        prep_minutes: minutesOrNull(d.prepMinutes),
        cook_minutes: minutesOrNull(d.cookMinutes),
        station: orNull(d.station),
        shelf_life: orNull(d.shelfLife),
        plating_notes: orNull(d.platingNotes),
        plating_notes_es: orNull(d.platingNotesEs),
        ...(isMenu ? { cover_url: d.coverUrl } : { name: d.name.trim(), name_es: orNull(d.nameEs), group_id: d.groupId }),
      };
      let id: string;
      if (target.kind === 'edit') {
        await updateKitchenRecipe(uid, target.recipeId, payload);
        id = target.recipeId;
      } else {
        id = await createKitchenRecipe(uid, target.section, payload);
      }
      onSaved(id);
      onClose();
    } catch (e: any) {
      console.error('KitchenRecipeFormSheet save error:', e);
      Alert.alert(t('common.error'), translateServerError(e, t('kitchen_editor.save_failed')));
    } finally {
      setBusy(false);
    }
  };

  // ── Steps pane helpers ──────────────────────────────────────────────────────
  const updateStep = (i: number, p: Partial<StepRow>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const moveStep = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return d;
      const next = d.steps.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, steps: next };
    });
  const duplicateStep = (i: number) =>
    setDraft((d) => {
      const next = d.steps.slice();
      next.splice(i + 1, 0, { ...d.steps[i], key: nextKey() });
      return { ...d, steps: next };
    });
  const removeStep = (i: number) =>
    setDraft((d) => {
      const next = d.steps.filter((_, k) => k !== i);
      return { ...d, steps: next.length ? next : [emptyStep()] };
    });

  const stepActions: GlassAction[] =
    stepMenu === null
      ? []
      : [
          { key: 'up', label: t('kitchen_editor.move_up'), iosIcon: 'arrow.up', androidIcon: 'arrow-upward', disabled: stepMenu === 0, onPress: () => moveStep(stepMenu, -1) },
          { key: 'down', label: t('kitchen_editor.move_down'), iosIcon: 'arrow.down', androidIcon: 'arrow-downward', disabled: stepMenu >= draft.steps.length - 1, onPress: () => moveStep(stepMenu, 1) },
          { key: 'dup', label: t('kitchen_editor.duplicate'), iosIcon: 'plus.square.on.square', androidIcon: 'content-copy', onPress: () => duplicateStep(stepMenu) },
          { key: 'rm', label: t('multi_image.remove'), iosIcon: 'trash', androidIcon: 'delete', destructive: true, onPress: () => removeStep(stepMenu) },
        ];

  // ── Ingredients pane helpers ────────────────────────────────────────────────
  const updateIngredient = (i: number, p: Partial<IngredientRow>) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const removeIngredient = (i: number) =>
    setDraft((d) => {
      const next = d.ingredients.filter((_, k) => k !== i);
      return { ...d, ingredients: next.length ? next : [emptyIngredient()] };
    });

  // ── Review data ─────────────────────────────────────────────────────────────
  const ingredientCount = draft.ingredients.filter((r) => r.ingredient.trim()).length;
  const liveSteps = draft.steps.filter(stepHasContent);
  const firstTextless = liveSteps.findIndex((s) => !s.text.trim());
  const ok = doneHue(isDark);
  const ember = emberInk(isDark, colors.primary);

  const placementText = isMenu
    ? [recipe?.category, recipe?.subcategory].filter(Boolean).join(' › ')
    : [sectionLabel(section), groupName].filter(Boolean).join(' · ');

  const reviewLines: { key: string; label: string; summary: string; missing: boolean; step: number }[] = [
    {
      key: 'basics',
      label: t('content_editor.step_basics'),
      summary: [
        draft.images.length ? t('content_editor.photos_count', { count: draft.images.length }) : t('content_editor.no_photo'),
        isMenu ? t('kitchen_editor.review_linked') : placementText,
        !isMenu && !draft.name.trim() ? t('kitchen_editor.review_no_name') : null,
      ]
        .filter(Boolean)
        .join(' · '),
      missing: !isMenu && !draft.name.trim(),
      step: STEP_BASICS,
    },
    {
      key: 'details',
      label: t('content_editor.step_details'),
      summary: [
        draft.station ? (draft.stationOther ? draft.station : stationLabel(draft.station)) : t('kitchen_editor.review_no_station'),
        draft.allergens.length ? draft.allergens.map(allergenLabel).join(', ') : t('kitchen_editor.review_no_allergens'),
        draft.platingNotes.trim() ? t('kitchen_editor.review_plating') : t('kitchen_editor.review_no_plating'),
      ].join(' · '),
      missing: false,
      step: STEP_DETAILS,
    },
    {
      key: 'ingredients',
      label: t('kitchen_editor.step_ingredients'),
      summary: ingredientCount ? t('kitchen_editor.review_lines', { count: ingredientCount }) : t('kitchen_editor.review_no_ingredients'),
      missing: ingredientCount === 0,
      step: STEP_INGREDIENTS,
    },
    {
      key: 'steps',
      label: t('kitchen_editor.step_steps'),
      summary: liveSteps.length
        ? [t('kitchen_editor.review_steps', { count: liveSteps.length }), firstTextless >= 0 ? t('kitchen_editor.review_step_no_text', { n: firstTextless + 1 }) : null]
            .filter(Boolean)
            .join(' · ')
        : t('kitchen_editor.review_no_steps'),
      missing: liveSteps.length === 0 || firstTextless >= 0,
      step: STEP_STEPS,
    },
  ];

  const coverUrl = isMenu ? draft.coverUrl : draft.images[0] ?? null;
  const facts = [
    { k: t('kitchen_editor.fact_yield'), v: draft.yieldText.trim() },
    { k: t('kitchen_editor.fact_portion'), v: draft.portionsText.trim() },
    { k: t('kitchen_editor.fact_prep'), v: draft.prepMinutes ? `${minutesOrNull(draft.prepMinutes) ?? 0}m` : '' },
    { k: t('kitchen_editor.fact_cook'), v: draft.cookMinutes ? `${minutesOrNull(draft.cookMinutes) ?? 0}m` : '' },
    { k: t('kitchen_editor.fact_shelf'), v: draft.shelfLife.trim() },
  ];

  // ── Panes ───────────────────────────────────────────────────────────────────
  const renderBasics = () => (
    <View style={styles.pane}>
      <StepTitle title={t('kitchen_editor.basics_title')} subtitle={isMenu ? t('kitchen_editor.basics_subtitle_menu') : t('kitchen_editor.basics_subtitle_section')} />

      {isMenu && (
        // The cover is the MENU ITEM's cover, two-way (Steve's device round):
        // one slot, uploaded into menu-items through the kitchen cover purpose;
        // update_kitchen_recipe writes it back to the item (the old cover stays
        // among the menu's photos). The recipe's own photos follow below.
        <View>
          <MultiImageField
            images={draft.coverUrl ? [draft.coverUrl] : []}
            onChange={(imgs) => patch({ coverUrl: imgs[0] ?? null })}
            purpose="kitchen_menu_cover_image"
            bucket="menu-items"
            label={`${t('kitchen_editor.cover_label')} · ${t('kitchen_editor.shared_with_menu')}`}
            hint={t('kitchen_editor.cover_shared_hint')}
            max={1}
            disabled={busy}
          />
        </View>
      )}

      <MultiImageField
        images={draft.images}
        onChange={(images) => patch({ images })}
        purpose="kitchen_recipe_image"
        bucket={IMAGE_BUCKET}
        disabled={busy}
      />

      {isMenu ? (
        <>
          <View>
            <FieldLabel label={t('kitchen_editor.field_name')} />
            <View style={[f.selectRow, styles.lockedRow]}>
              <Text style={[f.selectValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {recipe?.name}
              </Text>
              <View style={[styles.miniPill, { backgroundColor: colors.blue + '33' }]}>
                <Text style={[styles.miniPillText, { color: colors.blueText }]}>{t('kitchen_editor.from_the_menu').toUpperCase()}</Text>
              </View>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={14} color={colors.textSecondary} />
            </View>
          </View>
          <View>
            <FieldLabel label={t('kitchen_editor.field_placement')} />
            <View style={f.twoCol}>
              <View style={[f.selectRow, f.twoColItem, styles.lockedRow]}>
                <Text style={[f.selectValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {recipe?.category || t('content_editor.uncategorized')}
                </Text>
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={14} color={colors.textSecondary} />
              </View>
              <View style={[f.selectRow, f.twoColItem, styles.lockedRow]}>
                <Text style={[f.selectValue, { color: colors.textSecondary }]} numberOfLines={1}>
                  {recipe?.subcategory || '–'}
                </Text>
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={14} color={colors.textSecondary} />
              </View>
            </View>
            <Hint>{t('kitchen_editor.menu_locked_hint')}</Hint>
          </View>
        </>
      ) : (
        <>
          <BilingualField
            label={t('kitchen_editor.field_name')}
            en={draft.name}
            es={draft.nameEs}
            onEn={(name) => {
              patch({ name });
              if (name.trim()) setNameError(false);
            }}
            onEs={(nameEs) => patch({ nameEs })}
            placeholder={t('kitchen_editor.name_placeholder')}
            esLabel={t('kitchen_editor.es_field')}
            error={nameError ? t('kitchen_editor.name_required') : null}
            errorColor={ember}
          />
          <View>
            <FieldLabel label={t('kitchen_editor.field_group')} trailing={t('content_editor.optional')} />
            <SelectRow
              iosIcon="book.closed"
              androidIcon="menu-book"
              iconColor={colors.primary}
              value={groupName}
              placeholder={t('kitchen_editor.no_group')}
              onPress={() => setGroupPickerOpen(true)}
            />
          </View>
        </>
      )}

      <BilingualField
        label={t('kitchen_editor.field_description')}
        trailing={t('content_editor.optional')}
        en={draft.description}
        es={draft.descriptionEs}
        onEn={(description) => patch({ description })}
        onEs={(descriptionEs) => patch({ descriptionEs })}
        placeholder={t('kitchen_editor.description_placeholder')}
        esLabel={t('kitchen_editor.es_field')}
        multiline
      />
    </View>
  );

  const renderDetails = () => (
    <View style={styles.pane}>
      <StepTitle title={t('kitchen_editor.details_title')} subtitle={t('kitchen_editor.details_subtitle')} />
      <View style={f.twoCol}>
        <View style={f.twoColItem}>
          <FieldLabel label={t('kitchen_editor.field_yield')} />
          <GlassTextInput value={draft.yieldText} onChangeText={(yieldText) => patch({ yieldText })} placeholder={t('kitchen_editor.yield_placeholder')} />
        </View>
        <View style={f.twoColItem}>
          <FieldLabel label={t('kitchen_editor.field_portions')} />
          <GlassTextInput value={draft.portionsText} onChangeText={(portionsText) => patch({ portionsText })} placeholder={t('kitchen_editor.portions_placeholder')} />
        </View>
      </View>
      <View style={f.twoCol}>
        <View style={f.twoColItem}>
          <FieldLabel label={t('kitchen_editor.field_prep_minutes')} />
          <GlassTextInput value={draft.prepMinutes} onChangeText={(v) => patch({ prepMinutes: digitsOnly(v) })} keyboardType="number-pad" placeholder="15" />
        </View>
        <View style={f.twoColItem}>
          <FieldLabel label={t('kitchen_editor.field_cook_minutes')} />
          <GlassTextInput value={draft.cookMinutes} onChangeText={(v) => patch({ cookMinutes: digitsOnly(v) })} keyboardType="number-pad" placeholder="8" />
        </View>
      </View>

      <View>
        <FieldLabel label={t('kitchen_editor.field_station')} />
        <View style={styles.chips}>
          {KITCHEN_STATIONS.map((key) => {
            const on = !draft.stationOther && draft.station === key;
            return <Chip key={key} label={stationLabel(key)} on={on} onPress={() => patch({ station: on ? '' : key, stationOther: false })} />;
          })}
          <Chip
            label={t('kitchen_editor.station_other')}
            on={draft.stationOther}
            onPress={() => (draft.stationOther ? patch({ station: '', stationOther: false }) : patch({ station: '', stationOther: true }))}
          />
        </View>
        {draft.stationOther && (
          <GlassTextInput
            style={styles.otherInput}
            value={draft.station}
            onChangeText={(station) => patch({ station })}
            placeholder={t('kitchen_editor.station_other_placeholder')}
            autoFocus
          />
        )}
      </View>

      <View>
        <FieldLabel label={t('kitchen_editor.field_shelf_life')} trailing={t('content_editor.optional')} />
        <GlassTextInput value={draft.shelfLife} onChangeText={(shelfLife) => patch({ shelfLife })} placeholder={t('kitchen_editor.shelf_life_placeholder')} />
      </View>

      <View>
        <FieldLabel label={t('kitchen_editor.field_allergens')} />
        <View style={styles.chips}>
          {KITCHEN_ALLERGENS.map((key) => {
            const on = draft.allergens.includes(key);
            return (
              <Chip
                key={key}
                label={allergenLabel(key)}
                on={on}
                onPress={() => patch({ allergens: on ? draft.allergens.filter((a) => a !== key) : [...draft.allergens, key] })}
              />
            );
          })}
        </View>
        {isMenu && <Hint>{t('kitchen_editor.allergens_menu_hint')}</Hint>}
      </View>

      <BilingualField
        label={t('kitchen_editor.field_plating')}
        trailing={t('content_editor.optional')}
        en={draft.platingNotes}
        es={draft.platingNotesEs}
        onEn={(platingNotes) => patch({ platingNotes })}
        onEs={(platingNotesEs) => patch({ platingNotesEs })}
        placeholder={t('kitchen_editor.plating_placeholder')}
        esLabel={t('kitchen_editor.es_field')}
        multiline
      />
    </View>
  );

  const renderIngredients = () => (
    <View style={styles.pane}>
      <StepTitle title={t('kitchen_editor.ingredients_title')} subtitle={t('kitchen_editor.ingredients_subtitle')} />
      {draft.ingredients.map((row, i) => (
        <View key={row.key} style={[styles.ingCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.ingRow}>
            <GlassTextInput
              style={styles.ingAmount}
              value={row.amount}
              onChangeText={(amount) => updateIngredient(i, { amount })}
              placeholder={t('libation_editor.amount_placeholder')}
            />
            <GlassTextInput
              style={styles.ingName}
              value={row.ingredient}
              onChangeText={(ingredient) => updateIngredient(i, { ingredient })}
              placeholder={t('libation_editor.ingredient_placeholder')}
            />
            <Pressable onPress={() => removeIngredient(i)} hitSlop={6} style={styles.ingRemove} disabled={busy}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <GlassTextInput
            style={styles.ingPrep}
            value={row.prep}
            onChangeText={(prep) => updateIngredient(i, { prep })}
            placeholder={t('kitchen_editor.prep_note_placeholder')}
          />
        </View>
      ))}
      <Pressable
        style={[styles.dashedBtn, { borderColor: colors.primary + '6B' }]}
        onPress={() => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }))}
        disabled={busy}
      >
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
        <Text style={[styles.dashedBtnText, { color: colors.primary }]}>{t('kitchen_editor.add_ingredient')}</Text>
      </Pressable>
    </View>
  );

  const renderSteps = () => (
    <View style={styles.pane}>
      <StepTitle title={t('kitchen_editor.steps_title')} subtitle={t('kitchen_editor.steps_subtitle')} />
      {draft.steps.map((s, i) => (
        <View key={s.key} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.stepHead}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-handle" size={16} color={colors.textSecondary} />
            <Text style={[styles.stepNum, { color: colors.primary }]}>{t('kitchen_editor.step_n', { n: i + 1 }).toUpperCase()}</Text>
            <Pressable onPress={() => setStepMenu(i)} hitSlop={8} disabled={busy}>
              <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <GlassTextInput value={s.title} onChangeText={(title) => updateStep(i, { title })} placeholder={t('kitchen_editor.step_title_placeholder')} />
          <GlassTextInput
            value={s.text}
            onChangeText={(text) => updateStep(i, { text })}
            placeholder={t('kitchen_editor.step_text_placeholder')}
            multiline
            style={styles.stepText}
          />
          <View style={styles.stepFoot}>
            <View style={styles.stepPhotos}>
              <StepPhotoStrip
                images={s.images}
                onChange={(images) => updateStep(i, { images })}
                purpose="kitchen_recipe_image"
                bucket={IMAGE_BUCKET}
                addLabel={t('kitchen_editor.photo_label')}
                disabled={busy}
              />
            </View>
            <View style={styles.stepMinutes}>
              <Text style={[f.label, styles.stepMinutesLabel]}>{t('kitchen_editor.step_minutes')}</Text>
              <GlassTextInput
                value={s.minutes}
                onChangeText={(v) => updateStep(i, { minutes: digitsOnly(v) })}
                keyboardType="number-pad"
                placeholder="0"
                style={styles.stepMinutesInput}
              />
            </View>
          </View>
        </View>
      ))}
      <Pressable
        style={[styles.dashedBtn, { borderColor: colors.primary + '6B' }]}
        onPress={() => setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep()] }))}
        disabled={busy}
      >
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
        <Text style={[styles.dashedBtnText, { color: colors.primary }]}>{t('kitchen_editor.step_n', { n: draft.steps.length + 1 })}</Text>
      </Pressable>
    </View>
  );

  const renderReview = () => (
    <View style={styles.pane}>
      <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <View style={[styles.reviewHero, { backgroundColor: colors.thumbPlaceholder }]}>
          {coverUrl ? (
            <StorageImage source={{ uri: toPublicUrl(isMenu ? 'menu-items' : IMAGE_BUCKET, coverUrl) }} style={styles.reviewHeroImage} resizeMode="cover" />
          ) : (
            <View style={styles.reviewSlate}>
              <IconSymbol ios_icon_name="fork.knife" android_material_icon_name="restaurant" size={28} color={colors.textSecondary} />
            </View>
          )}
          <View style={styles.reviewScrim}>
            {!!placementText && (
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{placementText}</Text>
                </View>
              </View>
            )}
            <Text style={styles.reviewTitle} numberOfLines={2}>
              {(isMenu ? recipe?.name : draft.name.trim()) || t('kitchen_editor.untitled')}
            </Text>
          </View>
        </View>
        <View style={styles.facts}>
          {facts.map((fa) => (
            <View key={fa.k} style={[styles.fact, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Text style={[styles.factK, { color: colors.textSecondary }]} numberOfLines={1}>
                {fa.k.toUpperCase()}
              </Text>
              <Text style={[styles.factV, { color: fa.v ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                {fa.v || '–'}
              </Text>
            </View>
          ))}
        </View>
        {reviewLines.map((l, idx) => (
          <Pressable
            key={l.key}
            style={[styles.rline, idx < reviewLines.length - 1 && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}
            onPress={() => goToStep(l.step)}
          >
            <View style={[styles.rstatus, { backgroundColor: (l.missing ? ember : ok) + '2E' }]}>
              <IconSymbol
                ios_icon_name={l.missing ? 'exclamationmark.triangle.fill' : 'checkmark'}
                android_material_icon_name={l.missing ? 'warning' : 'check'}
                size={11}
                color={l.missing ? ember : ok}
              />
            </View>
            <View style={styles.rbody}>
              <Text style={[styles.rlabel, { color: colors.text }]}>{l.label}</Text>
              <Text style={[styles.rsummary, { color: l.missing ? ember : colors.textSecondary }]} numberOfLines={2}>
                {l.summary.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.editChip, { color: colors.primary }]}>{t('common.edit')}</Text>
          </Pressable>
        ))}
      </View>

      <StepTitle
        title={editing ? t('content_editor.review_title_edit') : t('kitchen_editor.review_title')}
        subtitle={editing ? t('content_editor.review_subtitle_edit') : t('content_editor.review_subtitle')}
      />

      <View style={f.featureRow}>
        <IconSymbol ios_icon_name="globe" android_material_icon_name="translate" size={18} color={colors.primary} />
        <View style={f.featureRowBody}>
          <Text style={f.featureRowTitle}>{t('kitchen_editor.spanish_copy')}</Text>
          <Text style={f.featureRowHint}>{t('kitchen_editor.spanish_copy_hint')}</Text>
        </View>
        <GlassToggle value={translateOnSave} onValueChange={setTranslateOnSave} disabled={busy} />
      </View>
    </View>
  );

  const renderPane = () => {
    if (loading) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    switch (step) {
      case STEP_BASICS:
        return renderBasics();
      case STEP_DETAILS:
        return renderDetails();
      case STEP_INGREDIENTS:
        return renderIngredients();
      case STEP_STEPS:
        return renderSteps();
      default:
        return renderReview();
    }
  };

  const title = editing ? recipe?.name || t('kitchen_editor.title_edit') : t('kitchen_editor.title_new');
  const subtitle = isMenu
    ? t('kitchen_editor.subtitle_menu_fed', { path: placementText || recipe?.name || '' })
    : editing
      ? t('kitchen_editor.subtitle_edit')
      : `${sectionLabel(section)} · ${t('kitchen_editor.subtitle_new')}`;

  return (
    <StepSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      steps={steps}
      step={step}
      onStepChange={goToStep}
      visited={visited}
      primaryLabel={t('kitchen_editor.save_recipe')}
      nextLabel={t('content_editor.next')}
      backLabel={t('content_editor.back')}
      cancelLabel={t('common.cancel')}
      onPrimary={handleSave}
      busy={busy}
      primaryDisabled={loading}
    >
      {renderPane()}

      {/* Nested INSIDE the sheet's Modal tree so iOS presents them above it. */}
      <GroupPickerSheet
        visible={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        groups={groups}
        value={draft.groupId}
        onPick={(groupId) => {
          patch({ groupId });
          setGroupPickerOpen(false);
        }}
      />
      <GlassActionSheet
        visible={stepMenu !== null}
        onClose={() => setStepMenu(null)}
        title={t('kitchen_editor.step_n', { n: (stepMenu ?? 0) + 1 })}
        subtitle={stepMenu !== null ? draft.steps[stepMenu]?.title.trim() || undefined : undefined}
        actions={stepActions}
      />
    </StepSheet>
  );
}

/**
 * Fill empty Spanish fields from the English in ONE translate call (the
 * review's "Spanish copy" toggle). Hand-typed Spanish is never overwritten;
 * a failed service call leaves the draft as it was and the save goes on.
 */
async function fillSpanish(d: Draft, isMenu: boolean): Promise<Draft> {
  const texts: string[] = [];
  const apply: ((v: string) => void)[] = [];
  const next: Draft = { ...d, steps: d.steps.map((s) => ({ ...s })) };
  const want = (en: string, es: string, set: (v: string) => void) => {
    if (en.trim() && !es.trim()) {
      texts.push(en.trim());
      apply.push(set);
    }
  };
  if (!isMenu) want(d.name, d.nameEs, (v) => (next.nameEs = v));
  want(d.description, d.descriptionEs, (v) => (next.descriptionEs = v));
  want(d.platingNotes, d.platingNotesEs, (v) => (next.platingNotesEs = v));
  next.steps.forEach((s) => {
    want(s.title, s.titleEs, (v) => (s.titleEs = v));
    want(s.text, s.textEs, (v) => (s.textEs = v));
  });
  if (!texts.length) return d;
  const res = await translateTextsDetailed(texts, 'es', 'en');
  if (!res.ok) return d;
  res.translations.forEach((v, i) => apply[i]?.(v ?? ''));
  return next;
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/** The s86 chip grammar: ring + fixed ○→✓ slot, never a solid fill. */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipStyles.chip,
        { backgroundColor: colors.glass, borderColor: on ? colors.primary : colors.glassBorder, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth + 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <View style={[chipStyles.slot, { borderColor: on ? colors.primary : colors.glassBorder, backgroundColor: on ? colors.primary : 'transparent' }]}>
        {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={colors.fireText} />}
      </View>
      <Text style={[chipStyles.label, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  slot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.display.semibold, fontSize: 12 },
});

/** EN input with an "ES" reveal: the second field opens on tap or when Spanish exists. */
function BilingualField({
  label,
  trailing,
  en,
  es,
  onEn,
  onEs,
  placeholder,
  esLabel,
  multiline,
  error,
  errorColor,
}: {
  label: string;
  trailing?: string;
  en: string;
  es: string;
  onEn: (v: string) => void;
  onEs: (v: string) => void;
  placeholder: string;
  esLabel: string;
  multiline?: boolean;
  error?: string | null;
  errorColor?: string;
}) {
  const colors = useThemeColors();
  const f = useFormStyles(colors);
  const [open, setOpen] = useState(!!es);
  useEffect(() => {
    if (es) setOpen(true);
  }, [es]);
  return (
    <View>
      <View style={f.labelRow}>
        <Text style={f.label}>{label}</Text>
        {!!trailing && <Text style={[f.labelTrailing, { marginLeft: 0 }]}>{trailing}</Text>}
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={bilStyles.esBtn}>
          <Text style={[bilStyles.esText, { color: open ? colors.primary : colors.textSecondary }]}>ES</Text>
        </Pressable>
      </View>
      <GlassTextInput
        value={en}
        onChangeText={onEn}
        placeholder={placeholder}
        multiline={multiline}
        style={error ? { borderColor: errorColor ?? colors.primary } : undefined}
      />
      {!!error && <Text style={[bilStyles.error, { color: errorColor ?? colors.primary }]}>{error}</Text>}
      {open && (
        <GlassTextInput value={es} onChangeText={onEs} placeholder={esLabel} multiline={multiline} style={bilStyles.esInput} />
      )}
    </View>
  );
}

const bilStyles = StyleSheet.create({
  esBtn: { marginLeft: 'auto', paddingHorizontal: 4 },
  esText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1 },
  esInput: { marginTop: 8 },
  error: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 5 },
});

/** The section's groups + "No group" — a nested GlassSheet (module-level, GlassSheet's remount rule). */
function GroupPickerSheet({
  visible,
  onClose,
  groups,
  value,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  groups: KitchenGroup[];
  value: string | null;
  onPick: (groupId: string | null) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const row = (id: string | null, label: string) => {
    const active = id === value;
    return (
      <Pressable
        key={id ?? '__none'}
        onPress={() => onPick(id)}
        style={[
          pickStyles.row,
          { backgroundColor: active ? colors.primary + '24' : colors.surface, borderColor: active ? colors.primary + '6B' : colors.surfaceBorder },
        ]}
      >
        <Text style={[pickStyles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {active && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />}
      </Pressable>
    );
  };
  return (
    <GlassSheet visible={visible} onClose={onClose} title={t('kitchen_editor.pick_group_title')}>
      {row(null, t('kitchen_editor.no_group'))}
      {groups.map((g) => row(g.id, g.name))}
    </GlassSheet>
  );
}

const pickStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  label: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
});

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pane: { gap: 14 },
    loading: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
    lockedTile: {
      width: 96,
      height: 96,
      borderRadius: 13,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    lockedTileImage: { width: '100%', height: '100%' },
    lockBadge: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
    },
    lockBadgeText: { fontFamily: fonts.mono.semibold, fontSize: 7, letterSpacing: 0.7 },
    lockedRow: { opacity: 0.9 },
    miniPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    miniPillText: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.7 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    otherInput: { marginTop: 8 },
    ingCard: {
      borderRadius: 14,
      padding: 8,
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    ingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ingAmount: { flex: 1, minWidth: 0 },
    ingName: { flex: 2, minWidth: 0 },
    ingRemove: { paddingHorizontal: 2 },
    ingPrep: { minHeight: 38, paddingVertical: 9, fontSize: 13 },
    dashedBtn: {
      height: 47,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    dashedBtnText: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
    stepCard: {
      borderRadius: 15,
      padding: 12,
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepNum: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.4 },
    stepText: { minHeight: 74 },
    stepFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    stepPhotos: { flex: 1, minWidth: 0 },
    stepMinutes: { width: 64 },
    stepMinutesLabel: { marginBottom: 4 },
    stepMinutesInput: { textAlign: 'center', paddingHorizontal: 8 },
    reviewCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    reviewHero: { height: 120, position: 'relative' },
    reviewHeroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    reviewSlate: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    reviewScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      paddingTop: 18,
      paddingBottom: 10,
      backgroundColor: 'rgba(8,10,14,0.62)',
    },
    pillRow: { flexDirection: 'row', marginBottom: 5 },
    pill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    pillText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.6, color: '#FFFFFF' },
    reviewTitle: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.3, color: '#FFFFFF' },
    facts: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 },
    fact: {
      flex: 1,
      minWidth: 0,
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 4,
      alignItems: 'center',
      gap: 2,
      borderWidth: StyleSheet.hairlineWidth,
    },
    factK: { fontFamily: fonts.mono.semibold, fontSize: 7.5, letterSpacing: 0.8 },
    factV: { fontFamily: fonts.mono.semibold, fontSize: 12 },
    rline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
    rstatus: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    rbody: { flex: 1, minWidth: 0 },
    rlabel: { fontFamily: fonts.display.semibold, fontSize: 13 },
    rsummary: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.3, marginTop: 2 },
    editChip: { fontFamily: fonts.body.semibold, fontSize: 12 },
  });
