import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Animated as RNAnimated,
} from 'react-native';
import Animated, { runOnJS, useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories, MenuCategory, MenuSubcategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import { saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import CategoryColorPicker from '@/components/CategoryColorPicker';
import { translateServerError } from '@/utils/serverErrors';
import { brokerDelete } from '@/utils/storageBroker';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import MenuSheet from '@/components/MenuSheet';
import BottomNavBar from '@/components/BottomNavBar';
import { MenuSeasonTabs } from '@/components/MenuTopArea';
import DeckGrid, { DeckShelf, type DeckTileModel } from '@/components/menuDeck/DeckGrid';
import CategoryDeckSheet, {
  type DeckCounts,
  type MoveResult,
  type MoveCategoryResult,
  type RemoveResult,
} from '@/components/menuDeck/CategoryDeckSheet';
import { fonts } from '@/constants/fonts';

/** The typed name universe for the menu-structure RPC family — a typo here fails the build. */
type ManageMenuRpcName = Extract<
  keyof Database['public']['Functions'],
  `manage_menu_${string}`
>;

type NameMode = 'add-cat' | 'rename-cat' | 'add-sub' | 'rename-sub';

// What an unused built-in is FOR — the one line its "Not in use" tile carries.
const SHELF_LINE_KEY: Record<string, string> = {
  'cat.weekly_specials': 'manage_categories:what_specials',
  'cat.lunch': 'manage_categories:what_meal',
  'cat.dinner': 'manage_categories:what_meal',
  'cat.wine': 'manage_categories:what_wine',
  'cat.libations': 'manage_categories:what_libations',
  'cat.happy_hour': 'manage_categories:what_happy_hour',
};

// Case-insensitive name key — every server path lowercases category matches,
// so the client must too (same helper as MenuDisplay / menu-editor).
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

// The lite slice of get_menu_items each count needs — the s54 live counts.
interface CountItem {
  category: string;
  subcategory: string;
  season: string;
  available_for_lunch: boolean;
  available_for_dinner: boolean;
  is_weekly_special: boolean;
}

const TRASH_RED = '#E53935';
// The floating nav + its breathing room — what the page scrolls under.
const NAV_CLEARANCE = 104;

// ─── The ⓘ legend sheet — the icon guide, out of the page flow (s72 ask). ────
function LegendSheet({
  visible,
  onClose,
  colors,
  menu1,
  menu2,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useThemeColors>;
  menu1: string;
  menu2: string;
}) {
  const { t } = useTranslation();
  const styles = useMemo(() => createSheetStyles(colors), [colors]);

  const row = (
    key: string,
    icon: React.ReactNode,
    title: string,
    sub: string,
    iconBg?: string,
  ) => (
    <View key={key} style={[styles.legendRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={[styles.legendIcon, { backgroundColor: iconBg || colors.glass, borderColor: colors.glassBorder }]}>
        {icon}
      </View>
      <View style={styles.frowBody}>
        <Text style={[styles.frowLabel, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.legendSub, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
    </View>
  );

  return (
    <GlassSheet visible={visible} onClose={onClose} title={t('manage_categories:legend_title')}>
      {row(
        'drag',
        <IconSymbol ios_icon_name="hand.tap.fill" android_material_icon_name="touch-app" size={17} color={colors.textSecondary} />,
        t('manage_categories:reorder'),
        t('manage_categories:legend_reorder'),
      )}
      {row(
        'colour',
        <View style={[styles.swatch, { backgroundColor: '#8E44AD', marginRight: 0 }]} />,
        t('manage_categories:colour'),
        t('manage_categories:legend_colour'),
      )}
      {row(
        'rename',
        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.primary} />,
        t('manage_categories:chip_rename'),
        t('manage_categories:legend_rename'),
      )}
      {row(
        'hide',
        <IconSymbol ios_icon_name="eye" android_material_icon_name="visibility" size={17} color={colors.textSecondary} />,
        t('manage_categories:hide_show'),
        t('manage_categories:legend_hide'),
      )}
      {row(
        'move',
        <IconSymbol ios_icon_name="folder" android_material_icon_name="drive-file-move" size={17} color={colors.primary} />,
        t('manage_categories:move_row'),
        t('manage_categories:legend_move'),
      )}
      {row(
        'delete',
        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={17} color={TRASH_RED} />,
        t('manage_categories:delete'),
        t('manage_categories:hint_delete_custom'),
      )}
      {row(
        'builtin',
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={17} color={colors.textSecondary} />,
        t('manage_categories:built_in'),
        t('manage_categories:hint_builtin_edit'),
      )}
      {row(
        'linked',
        <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={17} color={colors.primary} />,
        t('manage_categories:linked_to_recipes'),
        t('manage_categories:hint_recipe_backed', { menu1, menu2 }),
      )}
      {row(
        'counts',
        <Text style={[styles.legendCountGlyph, { color: colors.primary }]}>57</Text>,
        t('manage_categories:live_counts'),
        t('manage_categories:legend_counts'),
      )}
    </GlassSheet>
  );
}

// ─── The screen — the Deck (s88) ─────────────────────────────────────────────
export default function ManageMenuCategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const { organizationId, organization, isLoading: orgLoading } = useOrganization();
  const perMenu = organization?.menu_category_scope === 'per_menu';
  // Deep-link (s73, the recipe screens' nav menu): ?cat=<system_key> opens that
  // category's sheet; ?slot=2 opens Menu 2's tree in per-menu scope.
  const deepLink = useLocalSearchParams<{ cat?: string; slot?: string }>();
  const deepLinkCatApplied = useRef(false);
  // In per-menu scope the owner edits one menu's tree at a time (slot 1 / 2).
  const [editSlot, setEditSlot] = useState<1 | 2>(deepLink.slot === '2' ? 2 : 1);
  const { categories: hookCats, loading, refresh } = useMenuCategories({ includeHidden: true, menuSlot: editSlot });

  // Local mirror so a reorder is snappy; re-synced whenever the hook reloads.
  const [cats, setCats] = useState<MenuCategory[]>([]);
  useEffect(() => setCats(hookCats), [hookCats]);
  const liveCats = useMemo(() => cats.filter((c) => !c.is_hidden), [cats]);
  const shelfCats = useMemo(() => cats.filter((c) => c.is_hidden), [cats]);

  const [wiggle, setWiggle] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The sheet keeps its category while it slides out — visibility is separate.
  const [sheetCatId, setSheetCatId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [legendVisible, setLegendVisible] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [colorPickerCatId, setColorPickerCatId] = useState<string | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: NameMode; id: string | null; title: string } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameInputEs, setNameInputEs] = useState('');
  const [busy, setBusy] = useState(false);

  const openSheet = useCallback((catId: string) => {
    setSheetCatId(catId);
    setSheetVisible(true);
  }, []);

  // iPhone-style wiggle exit: while the deck wiggles, a tap anywhere on the
  // page — a tile, the shelf, the gaps — ends it (every drop already saved the
  // order, so there is nothing left to write). Done stays for the belt and
  // braces. The tap gesture rides the scroll view; it fails on any movement,
  // so scrolling and the tiles' own long-press pan are untouched.
  const wiggleRef = useRef(false);
  wiggleRef.current = wiggle;
  const exitWiggle = useCallback(() => setWiggle(false), []);
  const pageTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(wiggle)
        .maxDuration(300)
        .onEnd((_e, ok) => {
          if (ok) runOnJS(exitWiggle)();
        }),
    [wiggle, exitWiggle],
  );
  const pressTile = useCallback(
    (id: string) => {
      if (wiggleRef.current) exitWiggle();
      else openSheet(id);
    },
    [exitWiggle, openSheet],
  );

  // A Modal outlives a navigation away (a deep link / push while the sheet is
  // open would leave it floating over the next screen) — close it on blur.
  useFocusEffect(
    useCallback(() => () => {
      setSheetVisible(false);
      setLegendVisible(false);
    }, []),
  );

  useEffect(() => {
    if (!cats.length || deepLinkCatApplied.current || !deepLink.cat) return;
    deepLinkCatApplied.current = true;
    const target = cats.find((c) => c.system_key === deepLink.cat);
    if (target) openSheet(target.id);
  }, [cats, deepLink.cat, openSheet]);

  // ── Scroll plumbing for the Deck's drag (auto-scroll + finger tracking) ─────
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const viewportH = useSharedValue(0);
  const contentH = useSharedValue(0);
  const gridTop = useSharedValue(0);
  const [gridW, setGridW] = useState(0);
  const deckScroll = useMemo(
    () => ({ ref: scrollRef, offset: scrollOffset, viewportH, contentH, gridTop }),
    [scrollRef, scrollOffset, viewportH, contentH, gridTop],
  );

  // ── Toast — the page's quiet confirmation (order saved, hidden, shown) ─────
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      // JS driver on purpose: a tiny native-driven fade on a bare Android view
      // can silently not apply.
      RNAnimated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
      toastTimer.current = setTimeout(() => {
        RNAnimated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => setToast(null));
      }, 2400);
    },
    [toastAnim],
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // ── s54 live counts — mirror MenuDisplay's categoryMatches exactly. ────────
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const loadCounts = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      const { data, error } = await supabase.rpc('get_menu_items', { p_actor_id: user.id });
      if (error) return;
      setCountItems(
        (data || []).map((r) => ({
          category: r.category,
          subcategory: r.subcategory,
          season: r.season,
          available_for_lunch: !!r.available_for_lunch,
          available_for_dinner: !!r.available_for_dinner,
          is_weekly_special: !!r.is_weekly_special,
        })),
      );
    } catch (e) {
      console.error('[manage-menu-categories] count fetch error:', e);
    }
  }, [user?.id, organizationId]);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const countsByCat = useMemo(() => {
    const slotSeason = editSlot === 1 ? 'winter' : 'summer';
    // Per-menu trees count their own menu's items; a shared tree spans both.
    const scoped = perMenu ? countItems.filter((i) => i.season === slotSeason) : countItems;
    const map = new Map<string, DeckCounts>();
    for (const cat of cats) {
      const fb = cat.filter_behavior;
      const nameKey = catKey(cat.display_name);
      const own = scoped.filter((item) => catKey(item.category) === nameKey);
      const matched = scoped.filter((item) => {
        // Per-menu treats Lunch/Dinner as normal categories (placement by
        // assignment); shared mode keeps the meal-availability overlay — and
        // an item filed here with neither meal ticked still shows (s88).
        const ownNoMeal =
          !item.available_for_lunch && !item.available_for_dinner && catKey(item.category) === nameKey;
        if (!perMenu && fb === 'lunch') return item.available_for_lunch || ownNoMeal;
        if (!perMenu && fb === 'dinner') return item.available_for_dinner || ownNoMeal;
        if (fb === 'weekly_specials') return catKey(item.category) === nameKey || item.is_weekly_special;
        return catKey(item.category) === nameKey;
      });
      const tally = (list: CountItem[]) => {
        const out = new Map<string, number>();
        for (const item of list) {
          const sk = catKey(item.subcategory);
          if (!sk) continue;
          out.set(sk, (out.get(sk) || 0) + 1);
        }
        return out;
      };
      map.set(cat.id, {
        total: matched.length,
        bySub: tally(matched),
        ownBySub: tally(own),
        ownTotal: own.length,
      });
    }
    return map;
  }, [cats, countItems, editSlot, perMenu]);

  // ── ⚙ Menu sheet wiring (same pattern as the menu editor). ─────────────────
  const [uploadQuota, setUploadQuota] = useState<{ remaining: number; max: number; freeAvailable: boolean } | null>(null);
  const fetchQuota = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      const { data } = await supabase.rpc('get_menu_upload_quota', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      const result = data as any;
      if (result?.success) {
        setUploadQuota({
          remaining: result.credits_remaining ?? 0,
          max: result.monthly_allowance ?? 0,
          freeAvailable: result.free_available === true,
        });
      }
    } catch (e) {
      console.error('Error loading menu upload quota:', e);
    }
  }, [user?.id, organizationId]);
  useEffect(() => {
    if (menuSheetVisible) fetchQuota();
  }, [menuSheetVisible, fetchQuota]);

  // Hybrid bilingual authoring (s61): the primary name input binds the device
  // language; the shared section shows the other-language preview + translate
  // button + pencil edit. resolveOnSave() runs the staleness rules.
  const isSpanishAuthor = i18n.language === 'es';
  const addSessionRef = useRef(0);
  const translation = useTranslationSection({
    fields: [
      {
        key: 'display_name',
        labelKey: 'translation_section:field_name',
        enValue: nameInput,
        esValue: nameInputEs,
        setEnValue: setNameInput,
        setEsValue: setNameInputEs,
      },
    ],
    sessionKey:
      nameModal && (nameModal.mode === 'rename-cat' || nameModal.mode === 'rename-sub')
        ? `edit:${nameModal.id}`
        : `new:${addSessionRef.current}`,
    active: nameModal !== null,
  });

  const sheetCat = cats.find((c) => c.id === sheetCatId) || null;

  // s68: owner, or a manager the owner granted 'menu.edit_categories' (the whole
  // manage_menu_* server suite enforces the same rule). While a manager's grants
  // are still loading, hold on a spinner rather than flashing the bounce.
  if (user?.role !== 'owner' && !perms.editCategories) {
    if (user?.role === 'manager' && permsLoading) {
      return (
        <View style={[styles.container, styles.center]}>
          <AmbientGlow />
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={[styles.container, styles.center]}>
        <AmbientGlow />
        <Text style={styles.deniedText}>{t('manage_categories:access_denied')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>{t('manage_categories:go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Every RPC below needs a concrete organization id; the context resolves it
  // asynchronously, so hold on a spinner while it loads — and if the fetch
  // settled without an org (permanent failure), show an exit instead of
  // spinning forever (refreshOrganization is id-gated, so Retry can't help).
  if (!organizationId) {
    return (
      <View style={[styles.container, styles.center]}>
        <AmbientGlow />
        {orgLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Text style={styles.deniedText}>{t('manage_categories:load_failed')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>{t('manage_categories:go_back')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // --- RPC helper ----------------------------------------------------------
  // Returns the RPC's JSON payload on success (so callers can read e.g. the new
  // row's `id`), or null on failure. Success with no JSON body resolves to {}.
  const callRpc = async (
    fn: ManageMenuRpcName,
    args: Database['public']['Functions'][ManageMenuRpcName]['Args'],
    doRefresh = true
  ): Promise<any | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        Alert.alert(t('common:error'), translateServerError(error));
        return null;
      }
      // These RPCs return Json — narrow once so the success/error reads typecheck.
      const payload = data as { success?: boolean; error?: string } | null;
      if (payload && payload.success === false) {
        Alert.alert(t('common:error'), translateServerError({ message: payload.error }, 'Action failed'));
        return null;
      }
      if (doRefresh) await refresh();
      return data ?? {};
    } catch (e: any) {
      Alert.alert(t('common:error'), translateServerError(e, 'Action failed'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  // --- Name modal ----------------------------------------------------------
  const openNameModal = (mode: NameMode, id: string | null, initial: string, title: string, initialEs = '') => {
    if (mode === 'add-cat' || mode === 'add-sub') addSessionRef.current += 1;
    setNameModal({ mode, id, title });
    setNameInput(initial);
    setNameInputEs(initialEs);
  };

  const submitName = async () => {
    if (!nameModal) return;
    const authorName = (isSpanishAuthor ? nameInputEs : nameInput).trim();
    if (!authorName) return;

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await translation.resolveOnSave();
    if (!resolved) return;
    const value = resolved.display_name.en.trim();
    const es = resolved.display_name.es;
    const m = nameModal;

    let res: any = null;
    let targetId: string | null = null;
    let table: 'menu_categories' | 'menu_subcategories' = 'menu_categories';

    if (m.mode === 'add-cat') {
      res = await callRpc('manage_menu_category_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_display_name: value,
        p_menu_slot: perMenu ? editSlot : 0,
      }, false);
      table = 'menu_categories';
      targetId = res?.id ?? null;
    } else if (m.mode === 'rename-cat') {
      if (!m.id) return;
      res = await callRpc('manage_menu_category_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_new_name: value,
      }, false);
      table = 'menu_categories';
      targetId = res ? m.id : null;
    } else if (m.mode === 'add-sub') {
      if (!m.id) return;
      res = await callRpc('manage_menu_subcategory_create', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: m.id,
        p_display_name: value,
      }, false);
      table = 'menu_subcategories';
      targetId = res?.id ?? null;
    } else if (m.mode === 'rename-sub') {
      if (!m.id) return;
      res = await callRpc('manage_menu_subcategory_rename', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_subcategory_id: m.id,
        p_new_name: value,
      }, false);
      table = 'menu_subcategories';
      targetId = res ? m.id : null;
    }

    // callRpc alerted on failure (or silently no-ops while another call is
    // busy) — keep the modal open so the typed name isn't lost; the manager
    // can retry or cancel.
    if (!res) return;
    setNameModal(null);

    // Write the Spanish override only when the English create/rename succeeded
    // (empty `es` clears it via saveTranslations → null).
    if (targetId) {
      await saveTranslations(table, targetId, { display_name_es: es }, user?.id);
    }
    await refresh();
    // A rename re-files the items under the new name — the counts follow it.
    if (m.mode === 'rename-cat' || m.mode === 'rename-sub') loadCounts();
  };

  // --- Category actions ----------------------------------------------------
  // Hiding sends a category to "Not in use"; showing one puts it at the END of
  // the deck (its old slot may sit anywhere among the hidden ones).
  const toggleCategoryHidden = async (cat: MenuCategory) => {
    const nowHidden = !cat.is_hidden;
    const name = categoryLabel(cat, t, language);
    const res = await callRpc(
      'manage_menu_category_set_hidden',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: cat.id,
        p_is_hidden: nowHidden,
      },
      nowHidden,
    );
    if (!res) return;
    if (!nowHidden) {
      const ordered = [
        ...liveCats.map((c) => c.id),
        cat.id,
        ...shelfCats.filter((c) => c.id !== cat.id).map((c) => c.id),
      ];
      await callRpc('manage_menu_category_reorder', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_ordered_ids: ordered,
      });
    }
    showToast(
      nowHidden
        ? t('manage_categories:hidden_notice', { name })
        : t('manage_categories:shown_notice', { name }),
    );
  };

  const deleteCategory = async (cat: MenuCategory): Promise<boolean> => {
    const name = categoryLabel(cat, t, language);
    const res = await callRpc('manage_menu_category_delete', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: cat.id,
    });
    if (!res) return false;
    setSheetVisible(false);
    loadCounts();
    showToast(t('manage_categories:removed_notice', { name }));
    return true;
  };

  const setCategoryColor = (catId: string, color: string) => {
    setColorPickerCatId(null);
    callRpc('manage_menu_category_set_color', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: catId,
      p_color: color,
    });
  };

  // The deck hands back the VISIBLE order; the hidden ones keep the tail.
  const persistDeckOrder = (orderedLiveIds: string[], movedId: string) => {
    setDragging(false);
    const before = liveCats.map((c) => c.id);
    if (orderedLiveIds.length === before.length && orderedLiveIds.every((id, i) => id === before[i])) return;
    const byId = new Map(cats.map((c) => [c.id, c]));
    const orderedLive = orderedLiveIds.map((id) => byId.get(id)).filter((c): c is MenuCategory => !!c);
    const next = [...orderedLive, ...shelfCats];
    setCats(next);
    // No refetch on a drag's success — the RPC wrote the order the deck holds.
    callRpc(
      'manage_menu_category_reorder',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_ordered_ids: next.map((c) => c.id),
      },
      false,
    ).then((res) => {
      if (!res) {
        refresh();
        return;
      }
      const moved = byId.get(movedId);
      if (moved) {
        showToast(
          t('manage_categories:order_saved', {
            name: categoryLabel(moved, t, language),
            n: orderedLiveIds.indexOf(movedId) + 1,
          }),
        );
      }
    });
  };

  // --- Subcategory actions -------------------------------------------------
  const toggleSubHidden = (sub: MenuSubcategory) =>
    callRpc('manage_menu_subcategory_set_hidden', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_is_hidden: !sub.is_hidden,
    });

  // Mark/unmark a Libations subcategory as recipe-backed (fed by the cocktail
  // recipe editors). Only valid under the Libations category (enforced by RPC).
  const toggleSubCocktailFed = (sub: MenuSubcategory) =>
    callRpc('manage_menu_subcategory_set_cocktail_fed', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_is_cocktail_fed: !sub.is_cocktail_fed,
    });

  const switchEditSlot = (slot: 1 | 2) => {
    setWiggle(false);
    setEditSlot(slot);
  };

  const persistSubOrder = (catId: string, ordered: MenuSubcategory[]) => {
    setCats((prev) => prev.map((c) => (c.id === catId ? { ...c, subcategories: ordered } : c)));
    callRpc(
      'manage_menu_subcategory_reorder',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_category_id: catId,
        p_ordered_ids: ordered.map((s) => s.id),
      },
      false,
    );
  };

  const moveSub = async (
    sub: MenuSubcategory,
    target: MenuCategory,
    meals: { lunch: boolean; dinner: boolean },
  ): Promise<MoveResult | null> => {
    const res = await callRpc('manage_menu_subcategory_move', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_target_category_id: target.id,
      p_available_for_lunch: meals.lunch,
      p_available_for_dinner: meals.dinner,
    });
    if (!res) return null;
    loadCounts();
    return res as MoveResult;
  };

  // A stand-alone custom category folds into another category — as its own
  // subcategory (merging into a same-named one) or into a chosen existing one.
  // The category row is gone afterwards; the sheet follows the items.
  const moveCategoryInto = async (
    source: MenuCategory,
    target: MenuCategory,
    targetSub: MenuSubcategory | null,
    meals: { lunch: boolean; dinner: boolean },
  ): Promise<MoveCategoryResult | null> => {
    const res = await callRpc('manage_menu_category_move_into', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: source.id,
      p_target_category_id: target.id,
      p_target_subcategory_id: targetSub?.id ?? undefined,
      p_available_for_lunch: meals.lunch,
      p_available_for_dinner: meals.dinner,
    });
    if (!res) return null;
    loadCounts();
    return res as MoveCategoryResult;
  };

  const removeSub = async (
    sub: MenuSubcategory,
    action: 'move' | 'delete' | null,
    targetSubId: string | null,
  ): Promise<RemoveResult | null> => {
    const res = await callRpc('manage_menu_subcategory_remove', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_subcategory_id: sub.id,
      p_items_action: action ?? undefined,
      p_target_subcategory_id: targetSubId ?? undefined,
    });
    if (!res) return null;
    // Deleted items' images: Postgres can't delete objects, so the RPC hands
    // the URLs back. Best-effort, ten per broker call — a storage failure must
    // not report the (already committed) delete as failed.
    const urls: string[] = Array.isArray(res.thumbnail_urls) ? res.thumbnail_urls : [];
    for (let i = 0; i < urls.length; i += 10) {
      brokerDelete('menu-items', urls.slice(i, i + 10), user!.id);
    }
    loadCounts();
    return res as RemoveResult;
  };

  // --- Sheet-routed handlers -------------------------------------------------
  const requestRename = (cat: MenuCategory) =>
    openNameModal('rename-cat', cat.id, cat.display_name, t('manage_categories:rename_category'), cat.display_name_es || '');
  const requestRenameSub = (sub: MenuSubcategory) =>
    openNameModal('rename-sub', sub.id, sub.display_name, t('manage_categories:rename_subcategory'), sub.display_name_es || '');
  const requestAddSub = (cat: MenuCategory) =>
    openNameModal('add-sub', cat.id, '', t('manage_categories:add_subcategory'));
  const requestAddCategory = () =>
    openNameModal('add-cat', null, '', t('manage_categories:add_category'));

  // --- Tiles ---------------------------------------------------------------
  const mealName = (fb: 'lunch' | 'dinner') => {
    const c = cats.find((x) => x.filter_behavior === fb);
    return c ? categoryLabel(c, t, language) : t(fb === 'lunch' ? 'menu_display.lunch' : 'menu_display.dinner');
  };
  const subPreview = (cat: MenuCategory): string => {
    if (cat.filter_behavior === 'weekly_specials') return t('manage_categories:specials_tile_note');
    const names = cat.subcategories.filter((s) => !s.is_hidden).map((s) => subcategoryLabel(s, t, language));
    if (!names.length) return t('manage_categories:items_direct');
    return names.length > 3 ? `${names.slice(0, 3).join(' · ')}  +${names.length - 3}` : names.join(' · ');
  };
  const liveTiles: DeckTileModel[] = liveCats.map((cat) => ({
    id: cat.id,
    name: categoryLabel(cat, t, language),
    color: cat.color,
    builtIn: cat.system_key !== null,
    count: countsByCat.get(cat.id)?.total ?? 0,
    line: subPreview(cat),
  }));
  const shelfTiles: DeckTileModel[] = shelfCats.map((cat) => {
    const total = countsByCat.get(cat.id)?.total ?? 0;
    const isMealCat = cat.filter_behavior === 'lunch' || cat.filter_behavior === 'dinner';
    // Per-menu treats Lunch/Dinner as plain categories — no meal tagging to explain.
    const whatKey = cat.system_key && !(perMenu && isMealCat) ? SHELF_LINE_KEY[cat.system_key] : undefined;
    return {
      id: cat.id,
      name: categoryLabel(cat, t, language),
      color: cat.color,
      builtIn: cat.system_key !== null,
      // A parked category that still holds items says so; an empty one explains itself.
      count: total > 0 ? total : undefined,
      line: total > 0 || !whatKey ? subPreview(cat) : t(whatKey, { lunch: mealName('lunch'), dinner: mealName('dinner') }),
    };
  });

  const pickerCat = cats.find((c) => c.id === colorPickerCatId) || null;

  // The name prompt + colour picker. While the category sheet is up they mount
  // INSIDE it: iOS presents a Modal on the nearest presented view controller,
  // and a root-level one issued over an open sheet is silently dropped.
  const nestedModals = (
    <>
      <CategoryColorPicker
        visible={pickerCat !== null}
        value={pickerCat?.color || '#607D8B'}
        title={pickerCat ? categoryLabel(pickerCat, t, language) : ''}
        onSelect={(color) => colorPickerCatId && setCategoryColor(colorPickerCatId, color)}
        onClose={() => setColorPickerCatId(null)}
      />
      <Modal visible={nameModal !== null} transparent animationType="fade" onRequestClose={() => setNameModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{nameModal?.title}</Text>
            <TextInput
              style={styles.modalInput}
              value={isSpanishAuthor ? nameInputEs : nameInput}
              onChangeText={isSpanishAuthor ? setNameInputEs : setNameInput}
              placeholder={t('manage_categories:name_placeholder')}
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="next"
            />
            {/* Bilingual authoring (s61 hybrid) */}
            {translation.element}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setNameModal(null)}>
                <Text style={styles.modalCancelText}>{t('manage_categories:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, !(isSpanishAuthor ? nameInputEs : nameInput).trim() && { opacity: 0.5 }]} onPress={submitName} disabled={!(isSpanishAuthor ? nameInputEs : nameInput).trim()}>
                <Text style={styles.modalSaveText}>{t('manage_categories:save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );

  // --- Screen --------------------------------------------------------------
  return (
    <GestureHandlerRootView style={styles.container}>
      <AmbientGlow />
      {/* Menu-family rhythm (insets.top + 12), NOT the generic 48 — the
          Menus ↔ Editor ↔ Categories flips must never move the chrome. */}
      <ScreenHeader
        title={t('manage_categories:title')}
        eyebrow={organization?.name}
        topOffset={insets.top + 12}
        rightWide
        right={
          <View style={styles.headerRight}>
            {/* The ⚙ "Menu" chip — same pill as the Menus page / editor. */}
            <TouchableOpacity style={styles.menuChip} onPress={() => setMenuSheetVisible(true)} activeOpacity={0.7}>
              <IconSymbol ios_icon_name="gearshape.fill" android_material_icon_name="settings" size={15} color={colors.text} />
              <Text style={styles.menuChipLabel}>{t('menu_sheet.title')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoChip} onPress={() => setLegendVisible(true)} activeOpacity={0.7}>
              <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info-outline" size={19} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {loading && !cats.length ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <GestureDetector gesture={pageTap}>
          <Animated.ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            // A tile under the finger owns the vertical axis.
            scrollEnabled={!dragging}
            onLayout={(e) => {
              viewportH.value = Math.max(0, e.nativeEvent.layout.height - NAV_CLEARANCE);
            }}
            onContentSizeChange={(_w, h) => {
              contentH.value = h - NAV_CLEARANCE;
            }}
          >
            {perMenu && (
              <MenuSeasonTabs
                colors={colors}
                season={editSlot === 1 ? 'winter' : 'summer'}
                onSeasonChange={(s) => switchEditSlot(s === 'winter' ? 1 : 2)}
                menu1Label={organization?.menu_1_name || 'Menu 1'}
                menu2Label={organization?.menu_2_name || 'Menu 2'}
                menu1Icon={organization?.menu_1_icon || 'fork.knife'}
                menu2Icon={organization?.menu_2_icon || 'sun.max.fill'}
              />
            )}

            {wiggle ? (
              <>
                <View style={styles.acts}>
                  <TouchableOpacity style={[styles.act, styles.actFilled]} onPress={() => setWiggle(false)} disabled={busy}>
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={15} color={colors.primary} />
                    <Text style={styles.actText}>{t('manage_categories:done')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.wiggleHint}>{t('manage_categories:deck_reorder_hint')}</Text>
              </>
            ) : (
              <View style={styles.acts}>
                <TouchableOpacity style={styles.act} onPress={requestAddCategory} disabled={busy}>
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
                  <Text style={styles.actText}>{t('manage_categories:add_category')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.act} onPress={() => setWiggle(true)} disabled={busy || liveCats.length < 2}>
                  <IconSymbol ios_icon_name="arrow.up.arrow.down" android_material_icon_name="swap-vert" size={15} color={colors.primary} />
                  <Text style={styles.actText}>{t('manage_categories:reorder')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* A direct child of the scroll content: its y IS the grid's top. */}
            <View
              onLayout={(e) => {
                gridTop.value = e.nativeEvent.layout.y;
                const w = Math.round(e.nativeEvent.layout.width);
                setGridW((prev) => (prev === w ? prev : w));
              }}
            >
              <DeckGrid
                colors={colors}
                tiles={liveTiles}
                width={gridW}
                wiggle={wiggle}
                itemsLabel={t('manage_categories:items_label')}
                scroll={deckScroll}
                onPressTile={pressTile}
                onGrab={() => {
                  setWiggle(true);
                  setDragging(true);
                }}
                onDrop={persistDeckOrder}
              />
            </View>

            {!wiggle && (
              <TouchableOpacity style={styles.addGhost} onPress={requestAddCategory} disabled={busy}>
                <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
                <Text style={styles.addGhostText}>{t('manage_categories:add_category')}</Text>
              </TouchableOpacity>
            )}

            {shelfTiles.length > 0 && (
              <>
                <View style={styles.zlabelRow}>
                  <Text style={styles.zlabel}>{t('manage_categories:not_in_use').toUpperCase()}</Text>
                  <Text style={styles.zhint}>· {t('manage_categories:not_in_use_hint')}</Text>
                  <View style={styles.zline} />
                </View>
                <DeckShelf
                  colors={colors}
                  tiles={shelfTiles}
                  itemsLabel={t('manage_categories:items_label')}
                  dimmed={wiggle}
                  onPressTile={pressTile}
                />
              </>
            )}
          </Animated.ScrollView>
        </GestureDetector>
      )}

      <CategoryDeckSheet
        visible={sheetVisible && sheetCat !== null}
        onClose={() => setSheetVisible(false)}
        colors={colors}
        cat={sheetCat}
        cats={cats}
        counts={countsByCat}
        busy={busy}
        sharedScope={!perMenu}
        onRename={requestRename}
        onPickColour={(cat) => setColorPickerCatId(cat.id)}
        onToggleHidden={toggleCategoryHidden}
        onDeleteCategory={deleteCategory}
        onAddSub={requestAddSub}
        onRenameSub={requestRenameSub}
        onToggleSubHidden={toggleSubHidden}
        onToggleSubLinked={toggleSubCocktailFed}
        onReorderSubs={persistSubOrder}
        onMoveSub={moveSub}
        onRemoveSub={removeSub}
        onMoveCategoryInto={moveCategoryInto}
        onShowCategory={setSheetCatId}
        onOpenRecipesEditor={() => router.push('/bartender-assistant-editor' as any)}
      >
        {sheetVisible ? nestedModals : null}
      </CategoryDeckSheet>
      {!sheetVisible ? nestedModals : null}

      <LegendSheet
        visible={legendVisible}
        onClose={() => setLegendVisible(false)}
        colors={colors}
        menu1={organization?.menu_1_name || 'Menu 1'}
        menu2={organization?.menu_2_name || 'Menu 2'}
      />

      {/* The ⚙ Menu sheet — same sheet as the Menus page; Edit Categories is a
          no-op here (we are already on it, the row just closes the sheet). */}
      {user && (
        <MenuSheet
          visible={menuSheetVisible}
          onClose={() => setMenuSheetVisible(false)}
          colors={colors}
          role={user.role === 'owner' ? 'owner' : 'manager'}
          mode="user"
          perms={perms}
          onEditMenu={() => router.push('/menu-editor' as any)}
          onEditCategories={() => {}}
          onMenuConfiguration={() => {
            const params: Record<string, string> = { tab: 'menu' };
            if (user.role === 'manager') params.scoped = '1';
            router.push({ pathname: '/organization-settings', params } as any);
          }}
          quota={uploadQuota}
          refreshQuota={fetchQuota}
        />
      )}

      {toast !== null && (
        <RNAnimated.View
          pointerEvents="none"
          style={[styles.toast, { bottom: insets.bottom + NAV_CLEARANCE, opacity: toastAnim }]}
        >
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={colors.primary} />
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </RNAnimated.View>
      )}

      {/* The pushed-editor family chrome: floating nav + Jolt, portal layering. */}
      <BottomNavBar activeTab="menus" />
    </GestureHandlerRootView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { justifyContent: 'center', alignItems: 'center' },
    deniedText: { fontSize: 16, fontFamily: fonts.body.regular, color: colors.text, textAlign: 'center', marginHorizontal: 32 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    menuChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    menuChipLabel: { fontFamily: fonts.body.semibold, fontSize: 13, color: colors.text },
    infoChip: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    content: { paddingHorizontal: 16, paddingBottom: NAV_CLEARANCE + 24 },

    // Add / Reorder row (Done while the deck wiggles)
    acts: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    act: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    actFilled: { borderStyle: 'solid', backgroundColor: colors.primary + '24' },
    actText: { fontFamily: fonts.body.semibold, fontSize: 12.5, color: colors.primary },
    wiggleHint: {
      fontFamily: fonts.mono.medium,
      fontSize: 10,
      letterSpacing: 0.3,
      textAlign: 'center',
      color: colors.textSecondary,
      marginTop: -4,
      marginBottom: 10,
    },
    addGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      marginTop: 9,
      borderRadius: 13,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    addGhostText: { fontSize: 13, fontFamily: fonts.body.semibold, color: colors.primary },

    zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 10 },
    zlabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9.5,
      letterSpacing: 1.4,
      color: colors.textSecondary,
    },
    zhint: { fontFamily: fonts.mono.medium, fontSize: 9.5, color: colors.textSecondary, opacity: 0.8 },
    zline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

    toast: {
      position: 'absolute',
      alignSelf: 'center',
      maxWidth: '88%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      zIndex: 40,
    },
    toastText: { flexShrink: 1, fontFamily: fonts.body.semibold, fontSize: 12, lineHeight: 16, color: colors.text },

    primaryBtn: { marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    primaryBtnText: { color: colors.fireText, fontFamily: fonts.body.semibold, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(6,10,18,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
    modalCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.glassBorder },
    modalTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.text, marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: fonts.body.regular,
      color: colors.text,
      backgroundColor: colors.background,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
    modalCancel: { paddingHorizontal: 18, paddingVertical: 10 },
    modalCancelText: { fontSize: 15, fontFamily: fonts.body.semibold, color: colors.textSecondary },
    modalSave: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
    modalSaveText: { fontSize: 15, fontFamily: fonts.body.semibold, color: colors.fireText },
  });

// Sheet-local styles (LegendSheet).
const createSheetStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    frowBody: { flex: 1, minWidth: 0 },
    frowLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
    swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', marginRight: 2 },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 11,
      paddingVertical: 10,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      marginBottom: 7,
    },
    legendIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    legendSub: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15.5, marginTop: 1.5 },
    legendCountGlyph: { fontFamily: fonts.mono.semibold, fontSize: 12 },
  });
