import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { cocktailFedSubOptions, recipeCategoryValueForSub, type CocktailSubOption } from '@/utils/menuCategoryLabels';
import { translateServerError } from '@/utils/serverErrors';
import { brokerDelete } from '@/utils/storageBroker';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import LibationRecipeForm, {
  FEATURED_SENTINEL,
  cleanIngredients,
  type IngredientRow,
  type LibationRecipeDraft,
} from '@/components/LibationRecipeForm';
import { fonts } from '@/constants/fonts';

/**
 * Review Libations (s90, Steve's frame 3 + 4) — the menu review's grammar, per
 * recipe. Sections from the scan become cards with a "Goes to" row (an
 * existing recipe-fed Libations subcategory, or a NEW one); every recipe is a
 * row with its price and a chip: Needs info (the scan had the name + the
 * ingredients but not the glassware / garnish / amounts / procedure), Reviewed
 * (opened + saved here) or Already saved (a same-name recipe exists in this
 * book — the server skips it, Steve s89). Tap a row → the editors' own form
 * (LibationRecipeForm) in a sheet; Save to review flips the chip.
 *
 * Nothing is written until Publish (apply_parsed_libations — all-or-nothing).
 * Save & Review Later persists the whole review state into the upload row
 * (save_menu_upload_draft) so photos, edits and destinations survive a round
 * trip through the Recent Uploads tab.
 */
type Dest = { kind: 'existing'; subId: string } | { kind: 'new'; name: string } | { kind: 'featured' };

interface RRecipe {
  key: string;
  name: string;
  price: string;
  glassware: string;
  garnish: string;
  ingredients: IngredientRow[];
  procedure: string;
  procedureEs: string;
  images: string[];
  isFeatured: boolean;
  include: boolean;
  reviewed: boolean;
  /** A per-recipe destination; null = follow the section. */
  dest: Dest | null;
}

interface RSection {
  name: string;
  dest: Dest;
  /** The destination was guessed from the section name (vs chosen by hand). */
  matched: boolean;
  recipes: RRecipe[];
}

interface ReviewState {
  targetSlot: 1 | 2;
  sections: RSection[];
}

const NEW_GREY = '#607D8B';
const NEED_GOLD = '#F5B942';
const NEED_INK = '#2A1F05';
const OK_GREEN = '#10A56F';
const OK_INK = '#06281C';

const catKey = (s: string | null | undefined) => (s || '').trim().toLowerCase();

function normalizeScan(parsed: any): { name: string; recipes: Omit<RRecipe, 'key' | 'include' | 'reviewed' | 'dest'>[] }[] {
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  return sections.map((s: any) => ({
    name: String(s?.name || '').trim(),
    recipes: (Array.isArray(s?.recipes) ? s.recipes : [])
      .map((r: any) => ({
        name: String(r?.name || '').trim(),
        price: String(r?.price || '').trim(),
        glassware: String(r?.glassware || '').trim(),
        garnish: String(r?.garnish || '').trim(),
        ingredients: (Array.isArray(r?.ingredients) ? r.ingredients : [])
          .map((i: any) => ({ amount: String(i?.amount || '').trim(), ingredient: String(i?.ingredient || '').trim() }))
          .filter((i: IngredientRow) => i.ingredient),
        procedure: String(r?.procedure || '').trim(),
        procedureEs: '',
        images: [] as string[],
        isFeatured: false,
      }))
      .filter((r: { name: string }) => r.name),
  }));
}

/** The first guess for a section: a recipe-fed sub with the same name, else a new one. */
function suggestDest(sectionName: string, subs: CocktailSubOption[]): { dest: Dest; matched: boolean } {
  const key = catKey(sectionName);
  if (key) {
    const hit = subs.find((s) => catKey(s.label) === key);
    if (hit) return { dest: { kind: 'existing', subId: hit.id }, matched: true };
    return { dest: { kind: 'new', name: sectionName.trim() }, matched: false };
  }
  // A headless sheet: the first recipe-fed sub, else a new "Cocktails" sub.
  if (subs.length > 0) return { dest: { kind: 'existing', subId: subs[0].id }, matched: false };
  return { dest: { kind: 'new', name: 'Cocktails' }, matched: false };
}

const needsInfo = (r: RRecipe) =>
  !r.glassware || !r.garnish || !r.procedure || r.ingredients.length === 0 || r.ingredients.some((i) => !i.amount);

// ─── The destination sheet — top-level on purpose (GlassSheet's remount rule) ─
function DestinationSheet({
  visible,
  onClose,
  section,
  subs,
  counts,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  section: RSection | null;
  subs: CocktailSubOption[];
  counts: Map<string, number>;
  onApply: (dest: Dest) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pick, setPick] = useState<Dest>({ kind: 'new', name: '' });
  useEffect(() => {
    if (visible && section) setPick(section.dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!section) return null;
  const newName = section.name.trim();
  const picked = (d: Dest) => JSON.stringify(d) === JSON.stringify(pick);
  const radio = (on: boolean) => (
    <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textSecondary }]}>
      {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
    </View>
  );
  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('libation_upload.dest_title', { name: newName || t('libation_upload.section_untitled') })}
      subtitle={t('libation_upload.dest_sub', { count: section.recipes.filter((r) => r.include).length })}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => onApply(pick)}>
            <Text style={[styles.ctaText, { color: colors.fireText }]}>{t('menu_upload.dest_use')}</Text>
          </Pressable>
        </View>
      }
    >
      {!!newName && !subs.some((s) => catKey(s.label) === catKey(newName)) && (
        <Pressable style={[styles.frow, picked({ kind: 'new', name: newName }) && styles.frowPicked]} onPress={() => setPick({ kind: 'new', name: newName })}>
          {radio(picked({ kind: 'new', name: newName }))}
          <View style={styles.frowBody}>
            <View style={styles.destNameRow}>
              <Text style={styles.frowLabel}>{t('libation_upload.dest_new_row')}</Text>
              <View style={styles.pill}><Text style={styles.pillText}>{t('libation_upload.pill_new')}</Text></View>
            </View>
            <Text style={styles.frowSub}>{t('libation_upload.dest_new_row_sub', { name: newName })}</Text>
          </View>
        </Pressable>
      )}
      {subs.length > 0 && (
        <View style={styles.zlabelRow}>
          <Text style={styles.zlabel}>{t('libation_upload.dest_existing_label').toUpperCase()}</Text>
          <View style={styles.zline} />
        </View>
      )}
      {subs.map((s) => {
        const on = picked({ kind: 'existing', subId: s.id });
        const n = counts.get(s.id) ?? 0;
        return (
          <Pressable key={s.id} style={[styles.frow, on && styles.frowPicked]} onPress={() => setPick({ kind: 'existing', subId: s.id })}>
            {radio(on)}
            <View style={styles.frowBody}>
              <Text style={[styles.frowLabel, styles.shrink]} numberOfLines={1}>{s.label}</Text>
              <Text style={styles.frowSub}>{n > 0 ? t('libation_upload.recipes_today', { count: n }) : t('libation_upload.no_recipes_yet')}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.footNote}>{t('libation_upload.dest_note')}</Text>
    </GlassSheet>
  );
}

export default function LibationUploadReviewScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ upload_id?: string; view?: string }>();
  const uploadId = params.upload_id;
  const isViewer = params.view === '1';
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawParsed, setRawParsed] = useState<any>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [applied, setApplied] = useState<any[]>([]);
  const [uploadMeta, setUploadMeta] = useState<{ items_inserted: number | null; target_menu_slot: number | null; created_at: string | null }>({ items_inserted: null, target_menu_slot: null, created_at: null });
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [subCounts, setSubCounts] = useState<Map<string, number>>(new Map());
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [destIdx, setDestIdx] = useState<number | null>(null);
  const [destVisible, setDestVisible] = useState(false);
  const [editing, setEditing] = useState<{ si: number; ri: number } | null>(null);
  const [draft, setDraft] = useState<LibationRecipeDraft | null>(null);
  const removedImages = useRef<string[]>([]);

  const targetSlot: 1 | 2 = review?.targetSlot ?? 1;
  const twoMenus = organization?.menu_count === 2 || organization?.menu2_recipes_visible === true;
  const bookName = (s: 1 | 2) =>
    s === 2
      ? `${organization?.menu_2_name || 'Menu 2'} ${t('bartender_assistant.libation_recipes_suffix')}`
      : `${organization?.menu_1_name || 'Menu 1'} ${t('bartender_assistant.libation_recipes_suffix')}`;
  const imagePurpose = targetSlot === 2 ? 'summer_libation_image' : 'libation_image';
  const imageBucket = targetSlot === 2 ? 'summer-libation-recipe-images' : 'libation-recipe-images';

  // The book's recipe-fed Libations subcategories (per-menu scope: that slot's tree).
  const { categories: cats, loading: catsLoading } = useMenuCategories({ includeHidden: true, menuSlot: targetSlot });
  const subOptions = useMemo(() => cocktailFedSubOptions(cats, t), [cats, t]);
  const libCat = cats.find((c) => c.system_key === 'cat.libations');
  const subById = useMemo(() => new Map((libCat?.subcategories || []).map((s) => [s.id, s])), [libCat]);

  // Load the upload + the book's saved recipe names (duplicates + counts).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !uploadId) return;
      try {
        setLoading(true);
        const { data: rows, error } = await supabase.rpc('get_menu_uploads', { p_actor_id: user.id, p_upload_id: uploadId });
        if (error) throw error;
        if (cancelled) return;
        const data: any = Array.isArray(rows) ? rows[0] : null;
        if (!data) throw new Error('Upload not found');
        const parsed = data.parsed_result || {};
        setRawParsed(parsed);
        setUploadMeta({ items_inserted: data.items_inserted ?? null, target_menu_slot: data.target_menu_slot ?? null, created_at: data.created_at ?? null });
        setApplied(Array.isArray(parsed.applied) ? parsed.applied : []);
        const slot: 1 | 2 = data.target_menu_slot === 2 ? 2 : 1;
        if (parsed.review && Array.isArray(parsed.review.sections)) {
          // A saved draft — restore every edit, photo, status and destination.
          setReview({ targetSlot: parsed.review.targetSlot === 2 ? 2 : slot, sections: parsed.review.sections });
        } else {
          const scanned = normalizeScan(parsed);
          setReview({
            targetSlot: slot,
            sections: scanned.map((s, si) => ({
              name: s.name,
              dest: { kind: 'new', name: s.name },
              matched: false,
              recipes: s.recipes.map((r, ri) => ({ ...r, key: `${si}-${ri}`, include: true, reviewed: false, dest: null })),
            })),
          });
        }
      } catch (e) {
        console.error('load libations review error', e);
        Alert.alert(t('menu_upload.failed_title'), t('libation_upload.load_failed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId, user?.id]);

  const loadExisting = useCallback(async (slot: 1 | 2) => {
    if (!user?.id) return;
    const fn = slot === 2 ? 'get_summer_libation_recipes' : 'get_libation_recipes';
    const { data } = await supabase.rpc(fn, { p_actor_id: user.id });
    const names = new Set<string>();
    const counts = new Map<string, number>();
    (data || []).forEach((r: any) => {
      names.add(catKey(r.name));
      if (r.subcategory_id) counts.set(r.subcategory_id, (counts.get(r.subcategory_id) ?? 0) + 1);
    });
    setExistingNames(names);
    setSubCounts(counts);
  }, [user?.id]);
  useEffect(() => {
    if (!isViewer && review) loadExisting(review.targetSlot);
  }, [isViewer, review?.targetSlot, loadExisting]); // eslint-disable-line react-hooks/exhaustive-deps

  // First guesses — once per (review, sub tree); a draft's hand-picked
  // destinations are never overwritten (matched stays false on them).
  const guessedFor = useRef<string | null>(null);
  useEffect(() => {
    if (isViewer || loading || catsLoading || !review) return;
    const sig = `${review.targetSlot}#${subOptions.map((s) => s.id).join(',')}`;
    if (guessedFor.current === sig) return;
    guessedFor.current = sig;
    setReview((prev) => prev ? ({
      ...prev,
      sections: prev.sections.map((s) => {
        // Only re-guess sections that still carry the scan's raw "new <own name>" default.
        const untouched = s.dest.kind === 'new' && s.dest.name === s.name && !s.matched;
        if (!untouched && rawParsed?.review) return s;
        const g = suggestDest(s.name, subOptions);
        return { ...s, dest: g.dest, matched: g.matched };
      }),
    }) : prev);
  }, [isViewer, loading, catsLoading, review, subOptions, rawParsed]);

  const isDup = (r: RRecipe) => existingNames.has(catKey(r.name));

  const sections = review?.sections ?? [];
  const allRecipes = sections.flatMap((s) => s.recipes);
  const found = allRecipes.length;
  const dupCount = allRecipes.filter(isDup).length;
  const publishable = allRecipes.filter((r) => r.include && !isDup(r));
  const needCount = publishable.filter((r) => !r.reviewed && needsInfo(r)).length;
  const reviewedCount = publishable.filter((r) => r.reviewed).length;
  const uncheckedCount = allRecipes.filter((r) => !r.include && !isDup(r)).length;

  const patchRecipe = (si: number, ri: number, patch: Partial<RRecipe>) =>
    setReview((prev) => prev ? ({
      ...prev,
      sections: prev.sections.map((s, i) => i !== si ? s : { ...s, recipes: s.recipes.map((r, j) => (j === ri ? { ...r, ...patch } : r)) }),
    }) : prev);
  const toggleSection = (si: number, include: boolean) =>
    setReview((prev) => prev ? ({
      ...prev,
      sections: prev.sections.map((s, i) => i !== si ? s : { ...s, recipes: s.recipes.map((r) => ({ ...r, include })) }),
    }) : prev);

  // ── the edit sheet ──
  const destToSubId = (d: Dest | null): string => {
    if (!d) return '';
    if (d.kind === 'featured') return FEATURED_SENTINEL;
    if (d.kind === 'existing') return d.subId;
    return `new:${d.name}`;
  };
  const subIdToDest = (id: string): Dest | null => {
    if (!id) return null;
    if (id === FEATURED_SENTINEL) return { kind: 'featured' };
    if (id.startsWith('new:')) return { kind: 'new', name: id.slice(4) };
    return { kind: 'existing', subId: id };
  };
  const newSectionOptions = useMemo(() => {
    const names = new Set<string>();
    sections.forEach((s) => { if (s.dest.kind === 'new' && s.dest.name.trim()) names.add(s.dest.name.trim()); });
    return Array.from(names).map((name) => ({ id: `new:${name}`, label: `${name} · ${t('libation_upload.pill_new')}` }));
  }, [sections, t]);

  const openEdit = (si: number, ri: number) => {
    const s = sections[si];
    const r = s.recipes[ri];
    setDraft({
      name: r.name,
      price: r.price,
      subcategoryId: destToSubId(r.dest ?? s.dest),
      isFeatured: r.isFeatured,
      glassware: r.glassware,
      garnish: r.garnish,
      ingredients: r.ingredients.length > 0 ? r.ingredients : [{ amount: '', ingredient: '' }],
      procedure: r.procedure,
      procedureEs: r.procedureEs,
      images: r.images,
    });
    setEditing({ si, ri });
  };
  const saveEdit = () => {
    if (!editing || !draft) return;
    if (!draft.name.trim()) {
      Alert.alert(t('common.error'), t('libation_editor.error_no_name'));
      return;
    }
    const s = sections[editing.si];
    const dest = subIdToDest(draft.subcategoryId);
    const followsSection = dest && JSON.stringify(dest) === JSON.stringify(s.dest);
    patchRecipe(editing.si, editing.ri, {
      name: draft.name.trim(),
      price: draft.price.trim(),
      glassware: draft.glassware.trim(),
      garnish: draft.garnish.trim(),
      ingredients: cleanIngredients(draft.ingredients),
      procedure: draft.procedure.trim(),
      procedureEs: draft.procedureEs.trim(),
      images: draft.images,
      isFeatured: draft.subcategoryId === FEATURED_SENTINEL ? true : draft.isFeatured,
      reviewed: true,
      dest: followsSection ? null : dest,
    });
    setEditing(null);
    setDraft(null);
  };

  // ── persistence ──
  const draftPayload = () => ({ ...(rawParsed || {}), review });

  const saveForLater = async () => {
    if (!user?.id || !uploadId || !review) return;
    try {
      setSaving(true);
      const { error } = await supabase.rpc('save_menu_upload_draft', { p_actor_id: user.id, p_upload_id: uploadId, p_parsed_result: draftPayload() });
      if (error) throw error;
      router.navigate({ pathname: '/menu-upload', params: { tab: 'history' } } as any);
    } catch (e: any) {
      console.error('save draft error', e);
      Alert.alert(t('common.error'), translateServerError(e, t('libation_upload.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const resolveDest = (s: RSection, r: RRecipe): Dest => r.dest ?? s.dest;

  const buildPayload = () => ({
    recipes: sections.flatMap((s) =>
      s.recipes
        .filter((r) => r.include && !isDup(r) && r.name.trim())
        .map((r) => {
          const d = resolveDest(s, r);
          const sub = d.kind === 'existing' ? subById.get(d.subId) : undefined;
          return {
            name: r.name.trim(),
            price: r.price,
            glassware: r.glassware || null,
            garnish: r.garnish || null,
            ingredients: r.ingredients,
            procedure: r.procedure || null,
            images: r.images,
            thumbnail_url: r.images[0] ?? null,
            is_featured: d.kind === 'featured' ? true : r.isFeatured,
            subcategory_id: d.kind === 'existing' ? d.subId : null,
            new_subcategory_name: d.kind === 'new' ? d.name : null,
            category: d.kind === 'existing' && sub ? recipeCategoryValueForSub(sub) : d.kind === 'new' ? d.name : 'Featured',
          };
        }),
    ),
  });

  const doPublish = async () => {
    if (!user?.id || !uploadId || !review) return;
    const payload = buildPayload();
    if (payload.recipes.length === 0) {
      Alert.alert(t('libation_upload.nothing_title'), t('libation_upload.nothing_msg'));
      return;
    }
    try {
      setApplying(true);
      const { data, error } = await supabase.rpc('apply_parsed_libations', {
        p_actor_id: user.id,
        p_upload_id: uploadId,
        p_target_slot: review.targetSlot,
        p_payload: payload,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; items_inserted?: number; items_skipped?: number } | null;
      if (!result?.success) throw new Error(result?.error || 'Publish failed');
      // Photos picked for recipes that were then unchecked would be orphans —
      // best-effort cleanup, never a failure the user sees.
      const orphaned = [
        ...removedImages.current,
        ...allRecipes.filter((r) => !(r.include && !isDup(r))).flatMap((r) => r.images),
      ];
      for (let i = 0; i < orphaned.length; i += 10) {
        brokerDelete(imageBucket, orphaned.slice(i, i + 10), user.id).catch(() => {});
      }
      const dest = review.targetSlot === 2 ? '/summer-libation-recipes-editor' : '/libation-recipes-editor';
      Alert.alert(
        t('libation_upload.published_title'),
        t('libation_upload.published_msg', {
          ins: result.items_inserted ?? 0,
          skip: result.items_skipped ? ' ' + t('libation_upload.published_skipped', { count: result.items_skipped }) : '',
        }),
        [{ text: t('common.ok'), onPress: () => router.navigate(dest as any) }],
      );
    } catch (e: any) {
      console.error('publish error', e);
      Alert.alert(t('libation_upload.publish_failed'), translateServerError(e, t('common.error')));
    } finally {
      setApplying(false);
    }
  };

  if (loading || !review) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <AmbientGlow />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── the "Goes to" line ──
  const destLine = (s: RSection) => {
    if (s.dest.kind === 'existing') {
      // Hoisted: a discriminant narrowing does not survive into the callback.
      const subId = s.dest.subId;
      const sub = subById.get(subId);
      const label = subOptions.find((o) => o.id === subId)?.label || sub?.display_name || '';
      return { color: libCat?.color || NEW_GREY, text: t('libation_upload.goes_to_sub', { name: label }), pill: s.matched ? t('menu_upload.pill_matched') : null };
    }
    if (s.dest.kind === 'featured') return { color: NEED_GOLD, text: t('libation_upload.featured_only'), pill: null };
    return { color: NEW_GREY, text: t('libation_upload.goes_to_sub', { name: s.dest.name }), pill: t('menu_upload.pill_new_sub') };
  };

  // A recipe's own destination (when it departs from its section's).
  const destLabel = (d: Dest): string => {
    if (d.kind === 'featured') return t('libation_upload.featured_only');
    if (d.kind === 'existing') return t('libation_upload.goes_to_sub', { name: subOptions.find((o) => o.id === d.subId)?.label || '' });
    return t('libation_upload.goes_to_sub', { name: d.name });
  };

  const chip = (r: RRecipe) => {
    if (isDup(r)) return <View style={[styles.chip, { backgroundColor: colors.textSecondary + '29' }]}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{t('libation_upload.chip_dup').toUpperCase()}</Text></View>;
    if (r.reviewed) return <View style={[styles.chip, { backgroundColor: OK_GREEN }]}><Text style={[styles.chipText, { color: OK_INK }]}>✓ {t('libation_upload.chip_ok').toUpperCase()}</Text></View>;
    if (needsInfo(r)) return <View style={[styles.chip, { backgroundColor: NEED_GOLD }]}><Text style={[styles.chipText, { color: NEED_INK }]}>{t('libation_upload.chip_need').toUpperCase()}</Text></View>;
    return null;
  };

  const ingredientsLine = (r: RRecipe) => r.ingredients.map((i) => i.ingredient).filter(Boolean).join(' · ');

  const destSection = destIdx !== null ? sections[destIdx] || null : null;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AmbientGlow />
      {/* Menu-family rhythm — the same chrome height as the upload page. */}
      <ScreenHeader
        title={isViewer ? t('libation_upload.view_title') : t('libation_upload.review_title')}
        eyebrow={organization?.name}
        topOffset={insets.top + 12}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {isViewer ? (
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              {t('libation_upload.view_added', {
                n: uploadMeta.items_inserted ?? applied.length,
                book: bookName(uploadMeta.target_menu_slot === 2 ? 2 : 1),
                date: uploadMeta.created_at ? new Date(uploadMeta.created_at).toLocaleDateString(i18n.language === 'es' ? 'es' : 'en', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
              })}
            </Text>
            <View style={styles.secCard}>
              {applied.map((r: any, i: number) => (
                <View key={i} style={styles.rrow}>
                  <View style={styles.rbody}>
                    <View style={styles.rl1}>
                      <Text style={[styles.rname, { color: colors.text }]} numberOfLines={2}>{r.name}</Text>
                      {!!r.price && <Text style={[styles.rprice, { color: colors.text }]}>{r.price}</Text>}
                    </View>
                    <Text style={[styles.ring, { color: colors.textSecondary }]} numberOfLines={1}>
                      {(Array.isArray(r.ingredients) ? r.ingredients : []).map((x: any) => x.ingredient).filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>{t('libation_upload.review_intro', { count: found })}</Text>

            {/* The book (chosen before the scan; changeable here — a two-menu restaurant only) */}
            {twoMenus && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('libation_upload.adding_to')}</Text>
                <View style={styles.segmentRow}>
                  {([1, 2] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.segment, review.targetSlot === s && { backgroundColor: colors.primary }]}
                      onPress={() => setReview((prev) => prev ? { ...prev, targetSlot: s } : prev)}
                    >
                      <Text style={[styles.segmentText, { color: review.targetSlot === s ? colors.fireText : colors.text }]} numberOfLines={1}>{bookName(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.statLine}>
              <Text style={styles.statNum}>{t('libation_upload.stat_recipes', { count: found })}</Text>
              {'  ·  '}
              {t('libation_upload.stat_sections', { count: sections.length })}
              {dupCount > 0 ? `  ·  ${t('libation_upload.stat_saved', { count: dupCount })}` : ''}
            </Text>

            {sections.map((s, si) => {
              if (s.recipes.length === 0) return null;
              const line = destLine(s);
              const open = openSection === si;
              const included = s.recipes.filter((r) => r.include && !isDup(r)).length;
              return (
                <View key={`s-${si}`} style={styles.secCard}>
                  <LinearGradient
                    colors={[line.color, line.color + '4D', line.color + '00']}
                    locations={[0, 0.34, 0.68]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.secFade}
                    pointerEvents="none"
                  />
                  <Text style={styles.secEyebrow}>{t('libation_upload.found_eyebrow').toUpperCase()}</Text>
                  <View style={styles.secHead}>
                    <Text style={styles.secName} numberOfLines={1}>{s.name || t('libation_upload.section_untitled')}</Text>
                    <Text style={styles.secCount}>{t('libation_upload.stat_recipes', { count: s.recipes.length })}</Text>
                  </View>

                  <Pressable style={styles.destRow} onPress={() => { setDestIdx(si); setDestVisible(true); }} accessibilityRole="button">
                    <View style={styles.frowBody}>
                      <Text style={styles.destLabel}>{t('menu_upload.goes_to').toUpperCase()}</Text>
                      <View style={styles.destNameRow}>
                        <View style={[styles.dot, { backgroundColor: line.color }]} />
                        <Text style={[styles.destText, styles.shrink]} numberOfLines={2}>{line.text}</Text>
                      </View>
                      {!!line.pill && (
                        <View style={styles.pillRow}>
                          <View style={styles.pill}><Text style={styles.pillText}>{line.pill}</Text></View>
                        </View>
                      )}
                    </View>
                    <Text style={styles.destChange}>{t('menu_upload.change')}</Text>
                  </Pressable>

                  <Pressable style={styles.showItems} onPress={() => setOpenSection(open ? null : si)} hitSlop={6}>
                    <IconSymbol ios_icon_name={open ? 'chevron.up' : 'chevron.down'} android_material_icon_name={open ? 'expand-less' : 'expand-more'} size={14} color={colors.textSecondary} />
                    <Text style={styles.showItemsText}>
                      {open ? t('menu_upload.hide_items') : t('libation_upload.check_recipes', { count: s.recipes.length })}
                    </Text>
                  </Pressable>

                  {open && (
                    <View style={styles.rows}>
                      <View style={styles.catActions}>
                        <TouchableOpacity onPress={() => toggleSection(si, true)}><Text style={[styles.catAction, { color: colors.primary }]}>{t('menu_upload.all')}</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleSection(si, false)}><Text style={[styles.catAction, { color: colors.textSecondary }]}>{t('menu_upload.none')}</Text></TouchableOpacity>
                      </View>
                      {s.recipes.map((r, ri) => {
                        const dup = isDup(r);
                        return (
                          <View key={r.key} style={[styles.rrow, (dup || !r.include) && { opacity: 0.5 }]}>
                            {dup ? (
                              <View style={styles.checkbox} />
                            ) : (
                              <TouchableOpacity onPress={() => patchRecipe(si, ri, { include: !r.include })} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol
                                  ios_icon_name={r.include ? 'checkmark.square.fill' : 'square'}
                                  android_material_icon_name={r.include ? 'check-box' : 'check-box-outline-blank'}
                                  size={22}
                                  color={r.include ? colors.primary : colors.textSecondary}
                                />
                              </TouchableOpacity>
                            )}
                            <Pressable style={styles.rbody} onPress={dup ? undefined : () => openEdit(si, ri)}>
                              <View style={styles.rl1}>
                                <Text style={[styles.rname, { color: colors.text }]} numberOfLines={2}>{r.name}</Text>
                                {!!r.price && <Text style={[styles.rprice, { color: colors.text }]}>{r.price}</Text>}
                              </View>
                              <View style={styles.rl2}>
                                {chip(r)}
                                <Text style={[styles.ring, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {dup ? t('libation_upload.dup_hint', { book: bookName(review.targetSlot) }) : ingredientsLine(r)}
                                </Text>
                              </View>
                              {!!r.dest && !dup && (
                                <Text style={[styles.rdest, { color: colors.primary }]} numberOfLines={1}>
                                  {destLabel(r.dest)}
                                </Text>
                              )}
                            </Pressable>
                            {!dup && <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />}
                          </View>
                        );
                      })}
                      {included === 0 && <Text style={styles.footNote}>{t('libation_upload.section_none')}</Text>}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                <Text style={styles.noteBold}>{t('libation_upload.chip_need')}</Text> {t('libation_upload.note_need')}
              </Text>
            </View>
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {!isViewer && (
        <View style={[styles.applyBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Text style={[styles.applyCount, { color: colors.textSecondary }]}>
            {[
              needCount > 0 ? t('libation_upload.dock_need', { count: needCount }) : '',
              reviewedCount > 0 ? t('libation_upload.dock_reviewed', { count: reviewedCount }) : '',
              uncheckedCount > 0 ? t('libation_upload.dock_unchecked', { count: uncheckedCount }) : '',
              dupCount > 0 ? t('libation_upload.dock_saved', { count: dupCount }) : '',
            ].filter(Boolean).join('  ·  ')}
          </Text>
          <View style={styles.applyRow}>
            <TouchableOpacity
              style={[styles.saveLaterButton, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: applying || saving ? 0.6 : 1 }]}
              onPress={saveForLater}
              disabled={applying || saving}
            >
              {saving
                ? <ActivityIndicator color={colors.text} size="small" />
                : <Text style={[styles.saveLaterText, { color: colors.text }]}>{t('menu_upload.save_later')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: colors.primary, opacity: applying || publishable.length === 0 ? 0.6 : 1 }]}
              onPress={doPublish}
              disabled={applying || publishable.length === 0}
            >
              {applying
                ? <ActivityIndicator color={colors.fireText} size="small" />
                : <Text style={[styles.applyButtonText, { color: colors.fireText }]} numberOfLines={1}>{t('libation_upload.publish_n', { count: publishable.length })}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <DestinationSheet
        visible={destVisible && destSection !== null}
        onClose={() => setDestVisible(false)}
        section={destSection}
        subs={subOptions}
        counts={subCounts}
        onApply={(dest) => {
          if (destIdx !== null) {
            setReview((prev) => prev ? ({ ...prev, sections: prev.sections.map((s, i) => (i === destIdx ? { ...s, dest, matched: false } : s)) }) : prev);
          }
          setDestVisible(false);
        }}
      />

      {/* The Review Recipe sheet — the editors' own form; Save flips the chip. */}
      <GlassSheet
        visible={editing !== null && draft !== null}
        onClose={() => { setEditing(null); setDraft(null); }}
        title={t('libation_upload.edit_title')}
        subtitle={editing ? `${sections[editing.si]?.recipes[editing.ri]?.name ?? ''}` : undefined}
        footer={
          <View style={styles.sheetFooterRow}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={() => { setEditing(null); setDraft(null); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={saveEdit}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('libation_upload.save_to_review')}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {!!draft && (
          <LibationRecipeForm
            draft={draft}
            onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
            subOptions={subOptions}
            extraSubOptions={newSectionOptions}
            imagePurpose={imagePurpose}
            imageBucket={imageBucket}
            onImageRemoved={(url) => { removedImages.current.push(url); }}
            isSpanishAuthor={i18n.language === 'es'}
          />
        )}
      </GlassSheet>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 4, paddingBottom: 20 },
  intro: { fontSize: 13, fontFamily: fonts.body.regular, lineHeight: 18, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontFamily: fonts.display.semibold, marginBottom: 8, marginTop: 6 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)', paddingHorizontal: 8 },
  segmentText: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  statLine: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.4, textAlign: 'center', color: colors.textSecondary, marginBottom: 12 },
  statNum: { color: colors.primary, fontFamily: fonts.mono.semibold },

  secCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.glassBorder,
  },
  secFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5 },
  secEyebrow: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 1.2, color: colors.textSecondary, marginBottom: 3 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secName: { flex: 1, fontFamily: fonts.display.bold, fontSize: 15.5, letterSpacing: -0.2, color: colors.text },
  secCount: { fontFamily: fonts.mono.medium, fontSize: 10, color: colors.textSecondary },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  destLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2, color: colors.textSecondary },
  destNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  destText: { fontFamily: fonts.body.semibold, fontSize: 13, lineHeight: 17, color: colors.text },
  destChange: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  shrink: { flexShrink: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  pill: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6, backgroundColor: colors.primary + '26' },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  showItems: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  showItemsText: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.textSecondary },
  rows: { marginTop: 9, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  catActions: { flexDirection: 'row', gap: 14, justifyContent: 'flex-end' },
  catAction: { fontSize: 12.5, fontFamily: fonts.body.semibold },

  rrow: { flexDirection: 'row', gap: 10, paddingVertical: 9, alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkbox: { paddingTop: 2, width: 26 },
  rbody: { flex: 1, minWidth: 0 },
  rl1: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rname: { flex: 1, fontSize: 14, fontFamily: fonts.body.semibold, minWidth: 0 },
  rprice: { fontFamily: fonts.mono.medium, fontSize: 12.5 },
  rl2: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' },
  ring: { fontSize: 11.5, fontFamily: fonts.body.regular, flex: 1, minWidth: 0 },
  rdest: { fontFamily: fonts.mono.medium, fontSize: 10, marginTop: 4 },
  chip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.5 },

  noteCard: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: colors.primary + '12',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.primary + '38',
  },
  noteText: { fontSize: 12, fontFamily: fonts.body.regular, lineHeight: 17, color: colors.textSecondary },
  noteBold: { fontFamily: fonts.body.semibold, color: colors.text },

  applyBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 14, borderTopWidth: StyleSheet.hairlineWidth },
  applyCount: { fontSize: 10.5, fontFamily: fonts.mono.medium, textAlign: 'center', marginBottom: 8 },
  applyRow: { flexDirection: 'row', gap: 8 },
  saveLaterButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  saveLaterText: { fontSize: 13, fontFamily: fonts.body.semibold },
  applyButton: { flex: 1.2, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { fontSize: 14, fontFamily: fonts.body.semibold },

  // destination sheet
  frow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 52,
    borderRadius: 13,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  frowPicked: { borderColor: colors.primary, backgroundColor: colors.primary + '1A' },
  frowBody: { flex: 1, minWidth: 0 },
  frowLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5, color: colors.text },
  frowSub: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, marginTop: 1.5, color: colors.textSecondary },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8 },
  zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4, color: colors.textSecondary },
  zline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footNote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15.5, textAlign: 'center', color: colors.textSecondary, paddingTop: 6, paddingHorizontal: 6 },
  sheetFooter: { paddingTop: 10 },
  cta: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 15.5 },
  sheetFooterRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  footerBtn: { flex: 1, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
