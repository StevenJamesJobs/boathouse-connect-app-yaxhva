import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useMenuCategories, type MenuCategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import { fonts } from '@/constants/fonts';

interface EItem {
  name: string;
  description: string;
  price: string;
  is_gluten_free: boolean;
  is_vegetarian: boolean;
  glass_price: string;
  bottle_price: string;
  include: boolean;
}
interface ESub { name: string; items: EItem[] }
interface ECat { name: string; subcategories: ESub[] }

/**
 * Where a scanned section lands (s88). 'new' keeps it as its own category;
 * 'existing' files it inside a category the restaurant already has — a
 * built-in included. `subName` places the section's UNNAMED group (a scan
 * section with no subcategories of its own); named scan subcategories always
 * travel under their own names.
 */
type Dest =
  | { kind: 'new' }
  | { kind: 'existing'; categoryId: string; subName: string | null; matched: boolean };

interface Placement {
  dest: Dest;
  /** Shared-scope meal homes: also serve at the OTHER meal (its own is always on). */
  alsoOtherMeal: boolean;
}

const NEW_GREY = '#607D8B';
const catKey = (name: string | null | undefined) => (name || '').trim().toLowerCase();

function targetMenuOptions(menuCount: number, scope: string, m1: string, m2: string) {
  if (menuCount === 1) return [{ slot: 0, label: m1 }];
  if (scope === 'per_menu') return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }];
  return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }, { slot: 0, label: 'Both menus' }];
}

function normalizeTree(parsed: any): ECat[] {
  const cats = Array.isArray(parsed?.categories) ? parsed.categories : [];
  return cats.map((c: any) => ({
    name: String(c?.name || '').trim(),
    subcategories: (Array.isArray(c?.subcategories) ? c.subcategories : []).map((s: any) => ({
      name: String(s?.name || '').trim(),
      items: (Array.isArray(s?.items) ? s.items : []).map((it: any) => ({
        name: String(it?.name || '').trim(),
        description: String(it?.description || ''),
        price: String(it?.price || ''),
        is_gluten_free: !!it?.is_gluten_free,
        is_vegetarian: !!it?.is_vegetarian,
        glass_price: String(it?.glass_price || ''),
        bottle_price: String(it?.bottle_price || ''),
        include: true,
      })),
    })),
  }));
}

const isMealHome = (cat: MenuCategory | undefined, shared: boolean) =>
  !!cat && shared && (cat.filter_behavior === 'lunch' || cat.filter_behavior === 'dinner');
/** Subcategories a scan may file into — the recipe-fed ones belong to the recipe editors. */
const filableSubs = (cat: MenuCategory) => cat.subcategories.filter((s) => !s.is_cocktail_fed);
const hasUnnamedGroup = (sec: ECat) => sec.subcategories.some((s) => !s.name && s.items.length > 0);

/**
 * The first guess for a section: a category with the same name, else a
 * category that already holds a subcategory with that name (Starters →
 * Lunch › Starters), else its own new category. Always a guess — the owner
 * can change every one of them.
 */
function suggestPlacement(sec: ECat, tree: MenuCategory[], shared: boolean): Placement {
  const key = catKey(sec.name);
  const homes = tree.filter((c) => c.filter_behavior !== 'weekly_specials');
  if (!key) return { dest: { kind: 'new' }, alsoOtherMeal: false };

  const sameCat = homes.find((c) => catKey(c.display_name) === key);
  if (sameCat) {
    const subs = filableSubs(sameCat);
    const subName = hasUnnamedGroup(sec) && subs.length > 0 ? sec.name : null;
    return { dest: { kind: 'existing', categoryId: sameCat.id, subName, matched: true }, alsoOtherMeal: false };
  }

  const withSub = homes.filter(
    (c) => c.system_key !== 'cat.libations' && filableSubs(c).some((s) => catKey(s.display_name) === key),
  );
  if (withSub.length > 0) {
    const home = withSub[0];
    const sub = filableSubs(home).find((s) => catKey(s.display_name) === key)!;
    // Lunch AND Dinner both carry it → serve at both by default.
    const alsoOtherMeal =
      isMealHome(home, shared) && withSub.some((c) => c.id !== home.id && isMealHome(c, shared));
    return {
      dest: { kind: 'existing', categoryId: home.id, subName: sub.display_name, matched: true },
      alsoOtherMeal,
    };
  }
  return { dest: { kind: 'new' }, alsoOtherMeal: false };
}

// ─── The destination sheet — top-level on purpose (GlassSheet's remount rule) ─
function DestinationSheet({
  visible,
  onClose,
  colors,
  section,
  itemCount,
  tree,
  shared,
  current,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useThemeColors>;
  section: ECat | null;
  itemCount: number;
  tree: MenuCategory[];
  shared: boolean;
  current: Placement | null;
  onApply: (p: Placement) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pick, setPick] = useState<Placement>({ dest: { kind: 'new' }, alsoOtherMeal: false });

  // Seed from the card's current placement on OPEN (never on close).
  useEffect(() => {
    if (visible && current) setPick(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!section) return null;
  const unnamed = hasUnnamedGroup(section);
  const namedSubs = section.subcategories.filter((s) => s.name && s.items.length > 0).map((s) => s.name);
  const homes = tree.filter((c) => c.filter_behavior !== 'weekly_specials' && c.system_key !== 'cat.libations');
  const lunchCat = tree.find((c) => c.filter_behavior === 'lunch');
  const dinnerCat = tree.find((c) => c.filter_behavior === 'dinner');

  const pickCategory = (cat: MenuCategory) => {
    const subs = filableSubs(cat);
    const hit = subs.find((s) => catKey(s.display_name) === catKey(section.name));
    setPick({
      dest: {
        kind: 'existing',
        categoryId: cat.id,
        subName: unnamed && subs.length > 0 ? (hit ? hit.display_name : section.name) : null,
        matched: false,
      },
      alsoOtherMeal: false,
    });
  };

  const tog = (key: string, label: string, on: boolean, locked: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      style={[styles.tog, on && { borderColor: colors.primary + '99' }]}
      onPress={locked ? undefined : onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: locked }}
    >
      <View
        style={[
          styles.togBox,
          { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' },
        ]}
      >
        {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={colors.fireText} />}
      </View>
      <Text style={[styles.togText, { color: on ? colors.text : colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  const radio = (picked: boolean) => (
    <View style={[styles.radio, { borderColor: picked ? colors.primary : colors.textSecondary }]}>
      {picked && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
    </View>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('menu_upload.dest_title', { name: section.name })}
      subtitle={t('menu_upload.dest_sub', { count: itemCount })}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => onApply(pick)}>
            <Text style={[styles.ctaText, { color: colors.fireText }]}>{t('menu_upload.dest_use')}</Text>
          </Pressable>
        </View>
      }
    >
      <Pressable
        style={[styles.frow, pick.dest.kind === 'new' && styles.frowPicked]}
        onPress={() => setPick({ dest: { kind: 'new' }, alsoOtherMeal: false })}
        accessibilityRole="radio"
        accessibilityState={{ checked: pick.dest.kind === 'new' }}
      >
        {radio(pick.dest.kind === 'new')}
        <View style={styles.frowBody}>
          <Text style={styles.frowLabel}>{t('menu_upload.dest_own')}</Text>
          <Text style={styles.frowSub}>{t('menu_upload.dest_own_sub', { name: section.name })}</Text>
        </View>
      </Pressable>

      {homes.length > 0 && (
        <View style={styles.zlabelRow}>
          <Text style={styles.zlabel}>{t('menu_upload.dest_existing_label').toUpperCase()}</Text>
          <View style={styles.zline} />
        </View>
      )}

      {homes.map((cat) => {
        const picked = pick.dest.kind === 'existing' && pick.dest.categoryId === cat.id;
        const subs = filableSubs(cat);
        const ownListed = subs.some((s) => catKey(s.display_name) === catKey(section.name));
        const meal = isMealHome(cat, shared);
        return (
          <React.Fragment key={cat.id}>
            <Pressable
              style={[styles.frow, picked && styles.frowPicked]}
              onPress={() => pickCategory(cat)}
              accessibilityRole="radio"
              accessibilityState={{ checked: picked }}
            >
              {radio(picked)}
              <View style={styles.frowBody}>
                <View style={styles.destNameRow}>
                  <View style={[styles.dot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.frowLabel, styles.shrink]} numberOfLines={1}>{categoryLabel(cat, t, language)}</Text>
                  {cat.is_hidden && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{t('menu_upload.pill_switches_on')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.frowSub}>
                  {subs.length > 0
                    ? t('manage_categories:subcats_count', { count: subs.length })
                    : t('manage_categories:items_direct')}
                </Text>
              </View>
            </Pressable>
            {picked && unnamed && subs.length > 0 && pick.dest.kind === 'existing' && (
              <View style={styles.chipWrap}>
                {subs.map((s) =>
                  tog(s.id, subcategoryLabel(s, t, language), catKey(pick.dest.kind === 'existing' ? pick.dest.subName : '') === catKey(s.display_name), false, () =>
                    setPick((p) => (p.dest.kind === 'existing' ? { ...p, dest: { ...p.dest, subName: s.display_name } } : p)),
                  ),
                )}
                {!ownListed &&
                  tog('new', t('menu_upload.dest_new_sub_chip', { name: section.name }), catKey(pick.dest.subName) === catKey(section.name), false, () =>
                    setPick((p) => (p.dest.kind === 'existing' ? { ...p, dest: { ...p.dest, subName: section.name } } : p)),
                  )}
              </View>
            )}
            {picked && namedSubs.length > 0 && (
              <Text style={styles.followNote}>
                {t('menu_upload.dest_subs_follow', { count: namedSubs.length, names: namedSubs.join(' · ') })}
              </Text>
            )}
            {picked && meal && (
              <View style={styles.chipWrap}>
                <Text style={styles.mealLabel}>{t('manage_categories:serve_at').toUpperCase()}</Text>
                {tog(
                  'l',
                  lunchCat ? categoryLabel(lunchCat, t, language) : t('menu_display.lunch'),
                  cat.filter_behavior === 'lunch' || pick.alsoOtherMeal,
                  cat.filter_behavior === 'lunch',
                  () => setPick((p) => ({ ...p, alsoOtherMeal: !p.alsoOtherMeal })),
                )}
                {tog(
                  'd',
                  dinnerCat ? categoryLabel(dinnerCat, t, language) : t('menu_display.dinner'),
                  cat.filter_behavior === 'dinner' || pick.alsoOtherMeal,
                  cat.filter_behavior === 'dinner',
                  () => setPick((p) => ({ ...p, alsoOtherMeal: !p.alsoOtherMeal })),
                )}
              </View>
            )}
          </React.Fragment>
        );
      })}
      <Text style={styles.footNote}>{t('menu_upload.dest_lib_note')}</Text>
    </GlassSheet>
  );
}

export default function MenuUploadReviewScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { organizationId, organization } = useOrganization();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ upload_id?: string; onboarding?: string; view?: string }>();
  const uploadId = params.upload_id;
  // Onboarding = the owner's very first menu, so there's nothing to replace —
  // hide the Add/Replace choice and just add it (mode stays 'add').
  const isOnboarding = params.onboarding === '1';
  // s72: read-only viewer for an APPLIED upload — the parsed_result snapshot
  // outlives the apply (and any later replace), so old scans stay browsable.
  const isViewer = params.view === '1';

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [tree, setTree] = useState<ECat[]>([]);
  const [cocktails, setCocktails] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [uploadMeta, setUploadMeta] = useState<{
    items_inserted: number | null;
    target_menu_slot: number | null;
    created_at: string | null;
  }>({ items_inserted: null, target_menu_slot: null, created_at: null });

  const menuOptions = useMemo(
    () => targetMenuOptions(organization.menu_count, organization.menu_category_scope, organization.menu_1_name, organization.menu_2_name),
    [organization]
  );
  const [targetSlot, setTargetSlot] = useState<number>(menuOptions[0].slot);

  // The category tree the scan lands in — the TARGET menu's in per-menu scope,
  // the one shared tree otherwise. Hidden rows included: an unused built-in is
  // a perfectly good destination (it switches on when it receives items).
  const shared = organization.menu_category_scope !== 'per_menu';
  const { categories: cats, loading: catsLoading } = useMenuCategories({
    includeHidden: true,
    menuSlot: targetSlot === 2 ? 2 : 1,
  });
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [destIdx, setDestIdx] = useState<number | null>(null);
  const [destVisible, setDestVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      if (!uploadId || !organizationId) return;
      try {
        setLoading(true);
        const { data: uplRows, error } = await supabase.rpc('get_menu_uploads', {
          p_actor_id: user.id, p_upload_id: uploadId,
        });
        if (error) throw error;
        if (cancelled) return;
        const data: any = Array.isArray(uplRows) ? uplRows[0] : null;
        setTree(normalizeTree(data?.parsed_result));
        setCocktails(Array.isArray(data?.parsed_result?.flagged_cocktails) ? data.parsed_result.flagged_cocktails : []);
        setUploadMeta({
          items_inserted: data?.items_inserted ?? null,
          target_menu_slot: data?.target_menu_slot ?? null,
          created_at: data?.created_at ?? null,
        });
        if (!isViewer) {
          // existing item names for a duplicate hint (meaningless in the viewer)
          const { data: items } = await supabase.rpc('get_menu_items', { p_actor_id: user.id });
          if (!cancelled && items) setExistingNames(new Set(items.map((i: any) => String(i.name || '').toLowerCase())));
        }
      } catch (e) {
        console.error('load review error', e);
        Alert.alert(t('menu_upload.failed_title', 'Could Not Load'), t('menu_upload.review_load_failed', 'Could not load the parsed menu.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uploadId, organizationId]);

  // First guesses — once per (scan, tree). A different target menu in per-menu
  // scope is a different tree, so its guesses start over; a plain refetch of
  // the same tree never overwrites what the owner already changed.
  const treeSig = useMemo(
    () => cats.map((c) => `${c.id}:${c.subcategories.map((s) => s.id).join(',')}`).join('|'),
    [cats],
  );
  const guessedFor = useRef<string | null>(null);
  useEffect(() => {
    if (isViewer || loading || catsLoading || tree.length === 0) return;
    const sig = `${tree.length}#${treeSig}`;
    if (guessedFor.current === sig) return;
    guessedFor.current = sig;
    setPlacements(tree.map((sec) => suggestPlacement(sec, cats, shared)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewer, loading, catsLoading, tree.length, treeSig, shared]);

  const sectionCount = (sec: ECat) =>
    sec.subcategories.reduce((m, s) => m + s.items.filter((i) => i.include && i.name.trim()).length, 0);
  const includedCount = useMemo(() => tree.reduce((n, c) => n + sectionCount(c), 0), [tree]);
  const foundCount = useMemo(
    () => tree.reduce((n, c) => n + c.subcategories.reduce((m, s) => m + s.items.length, 0), 0),
    [tree],
  );
  const liveSections = tree.filter((c) => c.subcategories.some((s) => s.items.length > 0));

  const setItem = (ci: number, si: number, ii: number, patch: Partial<EItem>) => {
    setTree((prev) => {
      const next = prev.map((c) => ({ ...c, subcategories: c.subcategories.map((s) => ({ ...s, items: s.items.slice() })) }));
      next[ci].subcategories[si].items[ii] = { ...next[ci].subcategories[si].items[ii], ...patch };
      return next;
    });
  };

  const toggleCategory = (ci: number, include: boolean) => {
    setTree((prev) => {
      const next = prev.map((c) => ({ ...c, subcategories: c.subcategories.map((s) => ({ ...s, items: s.items.slice() })) }));
      next[ci].subcategories.forEach((s) => s.items.forEach((it, idx) => (s.items[idx] = { ...it, include })));
      return next;
    });
  };

  const placementOf = (ci: number): Placement => placements[ci] || { dest: { kind: 'new' }, alsoOtherMeal: false };

  const buildPayload = () => ({
    sections: tree
      .map((c, ci) => {
        const p = placementOf(ci);
        const home = p.dest.kind === 'existing' ? catById.get(p.dest.categoryId) : undefined;
        // A destination that vanished under us (tree changed) falls back to its own category.
        const existing = p.dest.kind === 'existing' && home ? p.dest : null;
        const meal = isMealHome(home, shared);
        return {
          name: c.name,
          category_id: existing ? existing.categoryId : null,
          category_name: existing ? null : c.name,
          available_for_lunch: !!home && (home.filter_behavior === 'lunch' || (meal && p.alsoOtherMeal)),
          available_for_dinner: !!home && (home.filter_behavior === 'dinner' || (meal && p.alsoOtherMeal)),
          groups: c.subcategories
            .map((s) => ({
              subcategory_name: s.name || (existing ? existing.subName || '' : ''),
              items: s.items
                .filter((it) => it.include && it.name.trim())
                .map((it) => ({
                  name: it.name.trim(),
                  description: it.description,
                  price: it.price,
                  is_gluten_free: it.is_gluten_free,
                  is_vegetarian: it.is_vegetarian,
                  glass_price: it.glass_price,
                  bottle_price: it.bottle_price,
                })),
            }))
            .filter((g) => g.items.length > 0),
        };
      })
      .filter((s) => s.name && s.groups.length > 0),
  });

  const doApply = async () => {
    if (!user?.id || !organizationId || !uploadId) return;
    if (includedCount === 0) {
      Alert.alert(t('menu_upload.nothing_title', 'Nothing Selected'), t('menu_upload.nothing_msg', 'Select at least one item to add.'));
      return;
    }
    const targetLabel = menuOptions.find((o) => o.slot === targetSlot)?.label || '';
    const proceed = async () => {
      try {
        setApplying(true);
        const { data, error } = await supabase.rpc('apply_parsed_menu_v2', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_upload_id: uploadId,
          p_payload: buildPayload(),
          p_target_slot: targetSlot,
          p_mode: mode,
        });
        if (error) throw error;
        const result = data as { success?: boolean; error?: string; items_inserted?: number; items_deleted?: number; items_skipped?: number } | null;
        if (!result?.success) throw new Error(result?.error || 'Apply failed');
        Alert.alert(
          t('menu_upload.applied_title', 'Menu Updated!'),
          t('menu_upload.applied_msg', {
            defaultValue: 'Added {{ins}} items.{{del}} You can fine-tune anything in the Menu Editor.',
            ins: result.items_inserted,
            del: result.items_deleted ? ` Replaced ${result.items_deleted}.` : (result.items_skipped ? ` Skipped ${result.items_skipped} duplicates.` : ''),
          }),
          [{ text: t('common.ok', 'OK'), onPress: () => router.back() }]
        );
      } catch (e: any) {
        console.error('apply error', e);
        Alert.alert(t('menu_upload.apply_failed', 'Could Not Add Menu'), translateServerError(e, 'Error'));
      } finally {
        setApplying(false);
      }
    };

    if (mode === 'replace') {
      Alert.alert(
        t('menu_upload.replace_confirm_title', 'Replace Menu?'),
        t('menu_upload.replace_confirm_msg', { defaultValue: 'This deletes {{menu}}’s current items first, then adds these. Items shared with the other menu are kept.', menu: targetLabel }),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('menu_upload.replace_confirm_ok', 'Replace'), style: 'destructive', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <AmbientGlow />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── one section's "Goes to" line ───────────────────────────────────────────
  const destLine = (sec: ECat, ci: number) => {
    const p = placementOf(ci);
    const home = p.dest.kind === 'existing' ? catById.get(p.dest.categoryId) : undefined;
    if (p.dest.kind === 'new' || !home) {
      return {
        color: NEW_GREY,
        home: undefined as MenuCategory | undefined,
        node: <Text style={styles.destText} numberOfLines={2}>{t('menu_upload.dest_new', { name: sec.name })}</Text>,
        pills: [] as string[],
      };
    }
    const named = sec.subcategories.filter((s) => s.name && s.items.length > 0).length;
    const subName = p.dest.subName;
    const subRow = subName ? home.subcategories.find((s) => catKey(s.display_name) === catKey(subName)) : undefined;
    const tail = subName
      ? ` › ${subRow ? subcategoryLabel(subRow, t, language) : subName}`
      : named > 0
        ? ` · ${t('manage_categories:subcats_count', { count: named })}`
        : '';
    const pills: string[] = [];
    if (p.dest.matched) pills.push(t('menu_upload.pill_matched'));
    if (subName && !subRow) pills.push(t('menu_upload.pill_new_sub'));
    if (home.is_hidden) pills.push(t('menu_upload.pill_switches_on'));
    return {
      color: home.color,
      home,
      node: <Text style={styles.destText} numberOfLines={2}>{categoryLabel(home, t, language)}{tail}</Text>,
      pills,
    };
  };

  const intoExisting = liveSections.filter((sec) => {
    const p = placementOf(tree.indexOf(sec));
    return p.dest.kind === 'existing' && catById.has(p.dest.categoryId);
  }).length;
  const asNew = liveSections.length - intoExisting;
  const destSection = destIdx !== null ? tree[destIdx] || null : null;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AmbientGlow />
      {/* Menu-family rhythm — same chrome height as the upload page behind it. */}
      <ScreenHeader
        title={isViewer ? t('menu_upload.view_title', 'Uploaded Scan') : t('menu_upload.review_title', 'Review Menu')}
        eyebrow={organization?.name}
        topOffset={insets.top + 12}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {isViewer ? (
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {(() => {
              const date = uploadMeta.created_at
                ? new Date(uploadMeta.created_at).toLocaleDateString(i18n.language === 'es' ? 'es' : 'en', { year: 'numeric', month: 'short', day: 'numeric' })
                : '';
              const menuLabel = menuOptions.find((o) => o.slot === uploadMeta.target_menu_slot)?.label;
              return menuLabel
                ? t('menu_upload.view_added_to', { defaultValue: 'Added {{n}} items to {{menu}} · {{date}}', n: uploadMeta.items_inserted ?? 0, menu: menuLabel, date })
                : t('menu_upload.view_added_plain', { defaultValue: 'Added {{n}} items · {{date}}', n: uploadMeta.items_inserted ?? 0, date });
            })()}
          </Text>
        ) : (
          <Text style={[styles.intro, { color: colors.textSecondary }]}>{t('menu_upload.review_intro')}</Text>
        )}

        {/* Target menu + mode */}
        {!isViewer && menuOptions.length > 1 && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('menu_upload.target_menu', 'Add to which menu?')}</Text>
            <View style={styles.segmentRow}>
              {menuOptions.map((o) => (
                <TouchableOpacity key={o.slot} style={[styles.segment, targetSlot === o.slot && { backgroundColor: colors.primary }]} onPress={() => setTargetSlot(o.slot)}>
                  <Text style={[styles.segmentText, { color: targetSlot === o.slot ? colors.fireText : colors.text }]} numberOfLines={1}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {!isViewer && !isOnboarding && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('menu_upload.mode', 'How should this be added?')}</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segment, mode === 'add' && { backgroundColor: colors.primary }]} onPress={() => setMode('add')}>
                <Text style={[styles.segmentText, { color: mode === 'add' ? colors.fireText : colors.text }]}>{t('menu_upload.mode_add', 'Add to menu')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segment, mode === 'replace' && { backgroundColor: colors.primary }]} onPress={() => setMode('replace')}>
                <Text style={[styles.segmentText, { color: mode === 'replace' ? colors.fireText : colors.text }]}>{t('menu_upload.mode_replace', 'Replace menu')}</Text>
              </TouchableOpacity>
            </View>
            {mode === 'replace' && (
              <View style={[styles.warnBanner, { backgroundColor: '#FF980018', borderColor: '#FF98004D' }]}>
                <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={15} color="#FF9800" />
                <Text style={[styles.warnText, { color: colors.text }]}>{t('menu_upload.replace_warn', 'Replace deletes this menu’s current items first. Items shared with the other menu are kept.')}</Text>
              </View>
            )}
          </>
        )}

        {!isViewer && (
          <Text style={styles.statLine}>
            <Text style={styles.statNum}>{t('menu_upload.stat_items', { count: foundCount })}</Text>
            {'  ·  '}
            {t('menu_upload.stat_sections', { count: liveSections.length })}
            {cocktails.length > 0 ? `  ·  ${t('menu_upload.stat_cocktails', { count: cocktails.length })}` : ''}
          </Text>
        )}

        {/* The scanned sections */}
        {tree.map((cat, ci) => {
          const catItemCount = cat.subcategories.reduce((m, s) => m + s.items.length, 0);
          if (catItemCount === 0) return null;
          const open = isViewer || openIdx === ci;
          const line = isViewer ? null : destLine(cat, ci);
          const p = placementOf(ci);
          const meal = !isViewer && isMealHome(line?.home, shared);
          const lunchCat = cats.find((c) => c.filter_behavior === 'lunch');
          const dinnerCat = cats.find((c) => c.filter_behavior === 'dinner');
          return (
            <View key={`c-${ci}`} style={styles.secCard}>
              <LinearGradient
                colors={[line?.color || NEW_GREY, (line?.color || NEW_GREY) + '4D', (line?.color || NEW_GREY) + '00']}
                locations={[0, 0.34, 0.68]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.secFade}
                pointerEvents="none"
              />
              {!isViewer && <Text style={styles.secEyebrow}>{t('menu_upload.found_eyebrow').toUpperCase()}</Text>}
              <View style={styles.secHead}>
                <Text style={styles.secName} numberOfLines={1}>{cat.name || t('menu_upload.untitled_cat', 'Uncategorized')}</Text>
                <Text style={styles.secCount}>{t('menu_upload.items_n', { count: isViewer ? catItemCount : sectionCount(cat) })}</Text>
              </View>

              {line && (
                <Pressable
                  style={styles.destRow}
                  onPress={() => {
                    setDestIdx(ci);
                    setDestVisible(true);
                  }}
                  accessibilityRole="button"
                >
                  <View style={styles.frowBody}>
                    <Text style={styles.destLabel}>{t('menu_upload.goes_to').toUpperCase()}</Text>
                    <View style={styles.destNameRow}>
                      <View style={[styles.dot, { backgroundColor: line.color }]} />
                      <View style={styles.shrink}>{line.node}</View>
                    </View>
                    {line.pills.length > 0 && (
                      <View style={styles.pillRow}>
                        {line.pills.map((label) => (
                          <View key={label} style={styles.pill}>
                            <Text style={styles.pillText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.destChange}>{t('menu_upload.change')}</Text>
                </Pressable>
              )}

              {meal && line?.home && (
                <View style={styles.chipWrap}>
                  <Text style={styles.mealLabel}>{t('manage_categories:serve_at').toUpperCase()}</Text>
                  {(['lunch', 'dinner'] as const).map((m) => {
                    const own = line.home!.filter_behavior === m;
                    const on = own || p.alsoOtherMeal;
                    const label = m === 'lunch'
                      ? (lunchCat ? categoryLabel(lunchCat, t, language) : t('menu_display.lunch'))
                      : (dinnerCat ? categoryLabel(dinnerCat, t, language) : t('menu_display.dinner'));
                    return (
                      <Pressable
                        key={m}
                        style={[styles.tog, on && { borderColor: colors.primary + '99' }]}
                        onPress={own ? undefined : () =>
                          setPlacements((prev) => prev.map((x, i) => (i === ci ? { ...x, alsoOtherMeal: !x.alsoOtherMeal } : x)))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: own }}
                      >
                        <View style={[styles.togBox, { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' }]}>
                          {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={colors.fireText} />}
                        </View>
                        <Text style={[styles.togText, { color: on ? colors.text : colors.textSecondary }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {!isViewer && (
                <Pressable style={styles.showItems} onPress={() => setOpenIdx(open ? null : ci)} hitSlop={6}>
                  <IconSymbol
                    ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
                    android_material_icon_name={open ? 'expand-less' : 'expand-more'}
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.showItemsText}>
                    {open ? t('menu_upload.hide_items') : t('menu_upload.check_items', { count: catItemCount })}
                  </Text>
                </Pressable>
              )}

              {open && (
                <View style={styles.itemsBlock}>
                  {!isViewer && (
                    <View style={styles.catActions}>
                      <TouchableOpacity onPress={() => toggleCategory(ci, true)}><Text style={[styles.catAction, { color: colors.primary }]}>{t('menu_upload.all', 'All')}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleCategory(ci, false)}><Text style={[styles.catAction, { color: colors.textSecondary }]}>{t('menu_upload.none', 'None')}</Text></TouchableOpacity>
                    </View>
                  )}
                  {cat.subcategories.map((sub, si) => (
                    <View key={`s-${ci}-${si}`}>
                      {!!sub.name && <Text style={[styles.subName, { color: colors.textSecondary }]}>{sub.name}</Text>}
                      {sub.items.map((it, ii) => {
                        const dup = existingNames.has(it.name.trim().toLowerCase());
                        const winePrices = [
                          it.glass_price ? `${t('menu_display.gl')} ${it.glass_price}` : '',
                          it.bottle_price ? `${t('menu_display.btl')} ${it.bottle_price}` : '',
                        ].filter(Boolean).join(' · ');
                        return (
                          <View key={`i-${ci}-${si}-${ii}`} style={[styles.itemRow, !it.include && { opacity: 0.45 }]}>
                            {!isViewer && (
                              <TouchableOpacity onPress={() => setItem(ci, si, ii, { include: !it.include })} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol
                                  ios_icon_name={it.include ? 'checkmark.square.fill' : 'square'}
                                  android_material_icon_name={it.include ? 'check-box' : 'check-box-outline-blank'}
                                  size={22}
                                  color={it.include ? colors.primary : colors.textSecondary}
                                />
                              </TouchableOpacity>
                            )}
                            <View style={{ flex: 1 }}>
                              <View style={styles.itemTopRow}>
                                <TextInput
                                  style={[styles.itemName, { color: colors.text, borderBottomColor: isViewer ? 'transparent' : colors.border }]}
                                  value={it.name}
                                  onChangeText={(v) => setItem(ci, si, ii, { name: v })}
                                  placeholder={isViewer ? undefined : t('menu_upload.item_name', 'Item name')}
                                  placeholderTextColor={colors.textSecondary}
                                  editable={!isViewer}
                                />
                                <TextInput
                                  style={[styles.itemPrice, { color: colors.text, borderBottomColor: isViewer ? 'transparent' : colors.border }]}
                                  value={it.price}
                                  onChangeText={(v) => setItem(ci, si, ii, { price: v })}
                                  placeholder={isViewer ? undefined : "$"}
                                  placeholderTextColor={colors.textSecondary}
                                  editable={!isViewer}
                                />
                              </View>
                              {!!winePrices && <Text style={[styles.winePrices, { color: colors.primary }]}>{winePrices}</Text>}
                              {(!isViewer || !!it.description) && (
                                <TextInput
                                  style={[styles.itemDesc, { color: colors.textSecondary }]}
                                  value={it.description}
                                  onChangeText={(v) => setItem(ci, si, ii, { description: v })}
                                  placeholder={isViewer ? undefined : t('menu_upload.item_desc', 'Description (optional)')}
                                  placeholderTextColor={colors.textSecondary}
                                  multiline
                                  editable={!isViewer}
                                />
                              )}
                              <View style={styles.badgeRow}>
                                {!isViewer && dup && (
                                  <View style={[styles.badge, { backgroundColor: '#FF980020' }]}>
                                    <Text style={[styles.badgeText, { color: '#E65100' }]}>{t('menu_upload.dup', 'Possible duplicate')}</Text>
                                  </View>
                                )}
                                {(!isViewer || it.is_gluten_free) && (
                                  <TouchableOpacity disabled={isViewer} onPress={() => setItem(ci, si, ii, { is_gluten_free: !it.is_gluten_free })} style={[styles.badge, { backgroundColor: it.is_gluten_free ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                                    <Text style={[styles.badgeText, { color: it.is_gluten_free ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.gf', 'GF')}</Text>
                                  </TouchableOpacity>
                                )}
                                {(!isViewer || it.is_vegetarian) && (
                                  <TouchableOpacity disabled={isViewer} onPress={() => setItem(ci, si, ii, { is_vegetarian: !it.is_vegetarian })} style={[styles.badge, { backgroundColor: it.is_vegetarian ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                                    <Text style={[styles.badgeText, { color: it.is_vegetarian ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.veg', 'Veg')}</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Cocktails the scan spotted — listed, never added. */}
        {cocktails.length > 0 && (
          <View style={styles.cocktailCard}>
            <Text style={styles.cocktailTitle}>{t('menu_upload.cocktails_spotted', { count: cocktails.length })}</Text>
            <Text style={styles.cocktailSub}>{t('menu_upload.cocktails_why')}</Text>
            <Text style={styles.cocktailList}>{cocktails.join(' · ')}</Text>
            {!isViewer && (
              <Pressable onPress={() => router.push('/bartender-assistant-editor' as any)} hitSlop={8} style={styles.cocktailLink}>
                <Text style={styles.cocktailLinkText}>{t('manage_categories:caption_lib_link')} ›</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Sticky apply bar — Save & Review Later is a deliberate back-out: the
          upload stays ready_for_review either way (s72, Steve's hand-off ask).
          The read-only viewer has no bar at all — the back chip is the exit. */}
      {!isViewer && (
      <View style={[styles.applyBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Text style={[styles.applyCount, { color: colors.textSecondary }]}>
          {[
            intoExisting > 0 ? t('menu_upload.dock_into', { count: intoExisting }) : '',
            asNew > 0 ? t('menu_upload.dock_new', { count: asNew }) : '',
          ].filter(Boolean).join('  ·  ')}
        </Text>
        <View style={styles.applyRow}>
          <TouchableOpacity
            style={[styles.saveLaterButton, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: applying ? 0.6 : 1 }]}
            // ALWAYS lands on the AI Menu Upload page (navigate pops back to it
            // when it's in the stack, pushes it when the review was reached from
            // the ⚙ sheet) — so the "Ready to review" row is right there and the
            // page's location sticks, especially on first use (Steve's s72 call).
            onPress={() => router.navigate({ pathname: '/menu-upload', params: isOnboarding ? { onboarding: '1' } : {} } as any)}
            disabled={applying}
          >
            <Text style={[styles.saveLaterText, { color: colors.text }]}>{t('menu_upload.save_later', 'Save & Review Later')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.applyButton, { backgroundColor: colors.primary, opacity: applying || includedCount === 0 ? 0.6 : 1 }]} onPress={doApply} disabled={applying || includedCount === 0}>
            {applying
              ? <ActivityIndicator color={colors.fireText} size="small" />
              : <Text style={[styles.applyButtonText, { color: colors.fireText }]} numberOfLines={1}>{t('menu_upload.add_n_items', { count: includedCount })}</Text>}
          </TouchableOpacity>
        </View>
      </View>
      )}

      <DestinationSheet
        visible={destVisible && destSection !== null}
        onClose={() => setDestVisible(false)}
        colors={colors}
        section={destSection}
        itemCount={destSection ? sectionCount(destSection) : 0}
        tree={cats}
        shared={shared}
        current={destIdx !== null ? placementOf(destIdx) : null}
        onApply={(p) => {
          if (destIdx !== null) setPlacements((prev) => tree.map((_s, i) => (i === destIdx ? p : prev[i] || { dest: { kind: 'new' }, alsoOtherMeal: false })));
          setDestVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 4, paddingBottom: 20 },
  intro: { fontSize: 13, fontFamily: fonts.body.regular, lineHeight: 18, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: fonts.display.semibold, marginBottom: 8, marginTop: 6 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  segmentText: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  warnBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 14 },
  warnText: { flex: 1, fontSize: 12, fontFamily: fonts.body.regular, lineHeight: 16 },
  statLine: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.4, textAlign: 'center', color: colors.textSecondary, marginBottom: 12 },
  statNum: { color: colors.primary, fontFamily: fonts.mono.semibold },

  // section card
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 2 },
  mealLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2, color: colors.textSecondary, marginRight: 2 },
  tog: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 34,
    maxWidth: '100%',
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  togBox: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  togText: { fontFamily: fonts.body.semibold, fontSize: 11.5, flexShrink: 1 },
  showItems: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  showItemsText: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.textSecondary },
  itemsBlock: { marginTop: 9, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  cocktailCard: {
    padding: 13,
    borderRadius: 15,
    marginBottom: 10,
    backgroundColor: colors.primary + '12',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.primary + '38',
  },
  cocktailTitle: { fontSize: 13.5, fontFamily: fonts.display.semibold, color: colors.text },
  cocktailSub: { fontSize: 12, fontFamily: fonts.body.regular, marginTop: 4, lineHeight: 16.5, color: colors.textSecondary },
  cocktailList: { fontSize: 12.5, fontFamily: fonts.body.semibold, marginTop: 8, lineHeight: 18, color: colors.text },
  cocktailLink: { marginTop: 8, alignSelf: 'flex-start' },
  cocktailLinkText: { fontFamily: fonts.body.semibold, fontSize: 12, color: colors.primary },

  catActions: { flexDirection: 'row', gap: 14, justifyContent: 'flex-end' },
  catAction: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  subName: { fontSize: 10.5, fontFamily: fonts.mono.semibold, marginTop: 8, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  itemRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, alignItems: 'flex-start' },
  checkbox: { paddingTop: 2 },
  itemTopRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  itemName: { flex: 1, fontSize: 14, fontFamily: fonts.body.semibold, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  itemPrice: { width: 64, fontSize: 13, fontFamily: fonts.mono.medium, textAlign: 'right', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  winePrices: { fontFamily: fonts.mono.medium, fontSize: 11.5, marginTop: 4 },
  itemDesc: { fontSize: 12.5, fontFamily: fonts.body.regular, marginTop: 4, paddingVertical: 0 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: fonts.mono.semibold },
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
  zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 1 },
  zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4, color: colors.textSecondary },
  zline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  followNote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15.5, color: colors.textSecondary, paddingHorizontal: 6 },
  footNote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15.5, textAlign: 'center', color: colors.textSecondary, paddingTop: 4, paddingHorizontal: 6 },
  sheetFooter: { paddingTop: 10 },
  cta: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 15.5 },
});
