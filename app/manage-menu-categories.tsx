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
  ScrollView,
  Switch,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useMenuCategories, MenuCategory, MenuSubcategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import { saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import CategoryColorPicker from '@/components/CategoryColorPicker';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import MenuSheet from '@/components/MenuSheet';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import { MenuSeasonTabs } from '@/components/MenuTopArea';
import { fonts } from '@/constants/fonts';

/** The typed name universe for the menu-structure RPC family — a typo here fails the build. */
type ManageMenuRpcName = Extract<
  keyof Database['public']['Functions'],
  `manage_menu_${string}`
>;

type NameMode = 'add-cat' | 'rename-cat' | 'add-sub' | 'rename-sub';

// One-line behavior captions for the built-ins so owners understand where each
// special category surfaces / how its items get tagged. Keyed by system_key;
// plain built-ins (Happy Hour) get none.
const BEHAVIOR_CAPTION_KEY: Record<string, string> = {
  'cat.weekly_specials': 'manage_categories:behavior_weekly_specials',
  'cat.lunch': 'manage_categories:behavior_lunch_dinner',
  'cat.dinner': 'manage_categories:behavior_lunch_dinner',
  'cat.wine': 'manage_categories:behavior_wine',
  'cat.libations': 'manage_categories:behavior_libations',
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

interface CatCounts {
  total: number;
  bySub: Map<string, number>;
}

const TRASH_RED = '#E53935';

// ─── The category editor sheet — the "belt and suspenders" surface. ─────────
// Top-level on purpose (a sheet redefined inside a screen's render remounts per
// keystroke); it holds no TextInput — name edits hand off to the name modal.
function CategoryEditorSheet({
  visible,
  onClose,
  colors,
  cat,
  counts,
  busy,
  perMenu,
  onRename,
  onPickColour,
  onToggleHidden,
  onDeleteCategory,
  onAddSub,
  onRenameSub,
  onToggleSubHidden,
  onToggleSubCocktailFed,
  onDeleteSub,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useThemeColors>;
  cat: MenuCategory | null;
  counts: CatCounts | undefined;
  busy: boolean;
  perMenu: boolean;
  /** Deferred (fire after this sheet has fully dismissed) — they open modals. */
  onRename: (cat: MenuCategory) => void;
  onPickColour: (cat: MenuCategory) => void;
  onAddSub: (cat: MenuCategory) => void;
  onRenameSub: (sub: MenuSubcategory) => void;
  onDeleteCategory: (cat: MenuCategory) => void;
  onDeleteSub: (sub: MenuSubcategory) => void;
  /** Direct RPC toggles — the sheet stays open and re-renders from the hook. */
  onToggleHidden: (cat: MenuCategory) => void;
  onToggleSubHidden: (sub: MenuSubcategory) => void;
  onToggleSubCocktailFed: (sub: MenuSubcategory) => void;
}) {
  const { t } = useTranslation();
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const styles = useMemo(() => createSheetStyles(colors), [colors]);
  if (!cat) return null;

  const isLibations = cat.system_key === 'cat.libations';
  const isWeeklySpecials = cat.filter_behavior === 'weekly_specials';
  const builtIn = cat.system_key !== null;
  const linkedCount = cat.subcategories.filter((s) => s.is_cocktail_fed).length;
  const captionKey =
    cat.system_key && BEHAVIOR_CAPTION_KEY[cat.system_key] &&
    !(perMenu && (cat.system_key === 'cat.lunch' || cat.system_key === 'cat.dinner'))
      ? BEHAVIOR_CAPTION_KEY[cat.system_key]
      : null;

  const statBits = [
    t('manage_categories:items_count', { count: counts?.total ?? 0 }),
    t('manage_categories:subcats_count', { count: cat.subcategories.length }),
  ];
  if (linkedCount > 0) statBits.push(t('manage_categories:recipe_fed_count', { count: linkedCount }));

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={categoryLabel(cat, t)}
      subtitle={statBits.join(' · ')}
    >
      {/* Name row → the bilingual name modal, after this sheet is gone. */}
      <TouchableOpacity
        style={[styles.frow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={() => defer(() => onRename(cat))}
        disabled={busy}
        activeOpacity={0.7}
      >
        <View style={styles.frowBody}>
          <Text style={[styles.frowLabel, { color: colors.text }]}>{t('manage_categories:name_label')}</Text>
          <Text style={[styles.frowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {cat.display_name_es
              ? t('manage_categories:es_caption', { name: cat.display_name_es })
              : t('manage_categories:es_autofill')}
          </Text>
        </View>
        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.primary} />
      </TouchableOpacity>

      {/* Colour row → CategoryColorPicker, after dismissal. */}
      <TouchableOpacity
        style={[styles.frow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={() => defer(() => onPickColour(cat))}
        disabled={busy}
        activeOpacity={0.7}
      >
        <View style={styles.frowBody}>
          <Text style={[styles.frowLabel, { color: colors.text }]}>{t('manage_categories:colour')}</Text>
        </View>
        <View style={[styles.swatch, { backgroundColor: cat.color }]} />
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Visibility — a direct toggle; the sheet stays open. */}
      <View style={[styles.frow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <View style={styles.frowBody}>
          <Text style={[styles.frowLabel, { color: colors.text }]}>{t('manage_categories:visible_label')}</Text>
          <Text style={[styles.frowSub, { color: colors.textSecondary }]}>{t('manage_categories:visible_sub')}</Text>
        </View>
        <Switch
          value={!cat.is_hidden}
          onValueChange={() => onToggleHidden(cat)}
          disabled={busy}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {captionKey && (
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{t(captionKey)}</Text>
      )}

      {/* Subcategories — same actions as the panel; drag lives on the panel.
          Weekly Specials never holds subs: the explainer replaces the block
          (legacy rows would still list so they can be removed). */}
      {isWeeklySpecials ? (
        <Text style={[styles.wsNote, { color: colors.textSecondary }]}>
          {t('manage_categories:ws_no_subcategories', { name: categoryLabel(cat, t) })}
        </Text>
      ) : (
        <View style={styles.zlabelRow}>
          <Text style={[styles.zlabel, { color: colors.textSecondary }]}>
            {t('manage_categories:subcategories').toUpperCase()}
          </Text>
          <View style={[styles.zline, { backgroundColor: colors.border }]} />
        </View>
      )}

      {cat.subcategories.length === 0 ? (
        !isWeeklySpecials && (
          <Text style={[styles.emptyLine, { color: colors.textSecondary }]}>
            {t('manage_categories:no_subcategories')}
          </Text>
        )
      ) : (
        cat.subcategories.map((sub) => {
          const canDelete = sub.system_key === null && !sub.is_cocktail_fed;
          return (
            <View
              key={sub.id}
              style={[
                styles.subRow,
                { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                sub.is_hidden && { opacity: 0.5 },
              ]}
            >
              <View style={styles.subBody}>
                <Text style={[styles.subName, { color: colors.text }]} numberOfLines={1}>
                  {subcategoryLabel(sub, t)}
                </Text>
                {sub.is_cocktail_fed && (
                  <Text style={[styles.linkedCaption, { color: colors.primary }]} numberOfLines={1}>
                    {t('manage_categories:linked_to_recipes')}
                  </Text>
                )}
              </View>
              <Text style={[styles.subCount, { color: colors.textSecondary }]}>
                {counts?.bySub.get(catKey(sub.display_name)) ?? 0}
              </Text>
              <TouchableOpacity
                onPress={() => defer(() => onRenameSub(sub))}
                style={styles.subBtn}
                disabled={busy}
              >
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.primary} />
              </TouchableOpacity>
              {isLibations && (
                <TouchableOpacity
                  onPress={() => onToggleSubCocktailFed(sub)}
                  style={[styles.subBtn, sub.is_cocktail_fed && { backgroundColor: colors.primary + '1F', borderRadius: 8 }]}
                  disabled={busy || sub.system_key !== null}
                  accessibilityLabel={t('manage_categories:recipe_backed_toggle')}
                >
                  <IconSymbol
                    ios_icon_name={sub.is_cocktail_fed ? 'link.circle.fill' : 'link.circle'}
                    android_material_icon_name={sub.is_cocktail_fed ? 'link' : 'link-off'}
                    size={19}
                    color={sub.is_cocktail_fed ? colors.primary : colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => onToggleSubHidden(sub)} style={styles.subBtn} disabled={busy}>
                <IconSymbol
                  ios_icon_name={sub.is_hidden ? 'eye.slash' : 'eye'}
                  android_material_icon_name={sub.is_hidden ? 'visibility-off' : 'visibility'}
                  size={17}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {canDelete ? (
                <TouchableOpacity onPress={() => defer(() => onDeleteSub(sub))} style={styles.subBtn} disabled={busy}>
                  <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={17} color={TRASH_RED} />
                </TouchableOpacity>
              ) : (
                <View style={styles.subBtn}>
                  <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={15} color={colors.textSecondary} />
                </View>
              )}
            </View>
          );
        })
      )}

      {!isWeeklySpecials && (
        <TouchableOpacity
          style={[styles.addGhost, { borderColor: colors.primary }]}
          onPress={() => defer(() => onAddSub(cat))}
          disabled={busy}
        >
          <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={17} color={colors.primary} />
          <Text style={[styles.addGhostText, { color: colors.primary }]}>{t('manage_categories:add_subcategory')}</Text>
        </TouchableOpacity>
      )}

      {/* Destructive foot: customs get the red Delete row; built-ins get the note. */}
      {!builtIn ? (
        <TouchableOpacity
          style={[styles.frow, styles.deleteRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
          onPress={() => defer(() => onDeleteCategory(cat))}
          disabled={busy}
          activeOpacity={0.7}
        >
          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={TRASH_RED} />
          <View style={styles.frowBody}>
            <Text style={[styles.frowLabel, { color: TRASH_RED }]}>{t('manage_categories:delete_category_title')}</Text>
            <Text style={[styles.frowSub, { color: colors.textSecondary }]}>{t('manage_categories:sheet_delete_sub')}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.footNote, { color: colors.textSecondary }]}>
          {t('manage_categories:hint_builtin_edit')}
        </Text>
      )}
      {isLibations && (
        <Text style={[styles.footNote, { color: colors.textSecondary }]}>
          {t('manage_categories:hint_recipe_locked')}
        </Text>
      )}
    </GlassSheet>
  );
}

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
        <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={17} color={colors.textSecondary} />,
        t('manage_categories:reorder'),
        t('manage_categories:hint_drag'),
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
        <IconSymbol ios_icon_name="link.circle.fill" android_material_icon_name="link" size={18} color={colors.primary} />,
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

// ─── The screen ──────────────────────────────────────────────────────────────
export default function ManageMenuCategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const { organizationId, organization, isLoading: orgLoading } = useOrganization();
  const perMenu = organization?.menu_category_scope === 'per_menu';
  // In per-menu scope the owner edits one menu's tree at a time (slot 1 / 2).
  const [editSlot, setEditSlot] = useState<1 | 2>(1);
  const { categories: hookCats, loading, refresh } = useMenuCategories({ includeHidden: true, menuSlot: editSlot });

  // Local mirror so drag-reorder is snappy; re-synced whenever the hook reloads.
  const [cats, setCats] = useState<MenuCategory[]>([]);
  useEffect(() => setCats(hookCats), [hookCats]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [editorSheetCatId, setEditorSheetCatId] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [colorPickerCatId, setColorPickerCatId] = useState<string | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: NameMode; id: string | null; title: string } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameInputEs, setNameInputEs] = useState('');
  const [busy, setBusy] = useState(false);

  // The expanded panel always shows one category — default to the first, and
  // re-point when the tree changes under us (slot switch, delete).
  useEffect(() => {
    if (!cats.length) return;
    if (!selectedCategoryId || !cats.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(cats[0].id);
    }
  }, [cats, selectedCategoryId]);

  // ── Pager ↔ rail sync (s72 round 4) ─────────────────────────────────────────
  // The content below the rail is a REAL pager (horizontal FlatList,
  // pagingEnabled — the menu surfaces' mechanism), one page per category:
  // swiping navigates categories, and the rail auto-centres the active tile.
  // The rail itself is a PLAIN ScrollView in the FIXED chrome stack — inside
  // the old DraggableFlatList header, RNGH swallowed its horizontal pans on
  // Android (the MenuCategoryTabs precedent: chrome scrollers live outside
  // any gesture-handled list).
  const { width: winW } = useWindowDimensions();
  const pagerRef = useRef<FlatList<MenuCategory>>(null);
  const railRef = useRef<ScrollView>(null);
  const lastPagerIndex = useRef(0);
  const selectedIndex = cats.findIndex((c) => c.id === selectedCategoryId);

  // Centre the active tile under the selection (tap OR swipe).
  useEffect(() => {
    if (selectedIndex < 0) return;
    const STEP = 150 + 9; // tile width + rail gap
    const x = Math.max(0, 16 + selectedIndex * STEP + 75 - winW / 2);
    railRef.current?.scrollTo({ x, animated: true });
  }, [selectedIndex, winW]);

  // External selection changes (slot switch, delete → first cat) snap the pager.
  useEffect(() => {
    if (selectedIndex < 0 || reorderMode) return;
    if (lastPagerIndex.current !== selectedIndex) {
      lastPagerIndex.current = selectedIndex;
      pagerRef.current?.scrollToIndex({ index: selectedIndex, animated: false });
    }
  }, [selectedIndex, reorderMode]);

  const onPagerMomentumEnd = (x: number) => {
    const idx = Math.max(0, Math.min(cats.length - 1, Math.round(x / winW)));
    lastPagerIndex.current = idx;
    const cat = cats[idx];
    if (cat && cat.id !== selectedCategoryId) setSelectedCategoryId(cat.id);
  };

  const selectTile = (catId: string) => {
    const idx = cats.findIndex((c) => c.id === catId);
    if (idx < 0) return;
    lastPagerIndex.current = idx;
    setSelectedCategoryId(catId);
    pagerRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  // ── s54 live counts — mirror MenuDisplay's categoryMatches exactly. ────────
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  useEffect(() => {
    if (!user?.id || !organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_menu_items', { p_actor_id: user.id });
        if (error || cancelled) return;
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
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, organizationId]);

  const countsByCat = useMemo(() => {
    const slotSeason = editSlot === 1 ? 'winter' : 'summer';
    // Per-menu trees count their own menu's items; a shared tree spans both.
    const scoped = perMenu ? countItems.filter((i) => i.season === slotSeason) : countItems;
    const map = new Map<string, CatCounts>();
    for (const cat of cats) {
      const fb = cat.filter_behavior;
      const nameKey = catKey(cat.display_name);
      const matched = scoped.filter((item) => {
        // Per-menu treats Lunch/Dinner as normal categories (placement by
        // assignment); shared mode keeps the meal-availability overlay.
        if (!perMenu && fb === 'lunch') return item.available_for_lunch;
        if (!perMenu && fb === 'dinner') return item.available_for_dinner;
        if (fb === 'weekly_specials') return catKey(item.category) === nameKey || item.is_weekly_special;
        return catKey(item.category) === nameKey;
      });
      const bySub = new Map<string, number>();
      for (const item of matched) {
        const sk = catKey(item.subcategory);
        if (!sk) continue;
        bySub.set(sk, (bySub.get(sk) || 0) + 1);
      }
      map.set(cat.id, { total: matched.length, bySub });
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

  const selectedCategory = cats.find((c) => c.id === selectedCategoryId) || null;
  const editorSheetCat = cats.find((c) => c.id === editorSheetCatId) || null;

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
  };

  // --- Category actions ----------------------------------------------------
  const toggleCategoryHidden = (cat: MenuCategory) =>
    callRpc('manage_menu_category_set_hidden', {
      p_organization_id: organizationId,
      p_user_id: user!.id,
      p_category_id: cat.id,
      p_is_hidden: !cat.is_hidden,
    });

  const deleteCategory = (cat: MenuCategory) => {
    Alert.alert(
      t('manage_categories:delete_category_title'),
      t('manage_categories:delete_category_confirm', { name: cat.display_name }),
      [
        { text: t('manage_categories:cancel'), style: 'cancel' },
        {
          text: t('manage_categories:delete'),
          style: 'destructive',
          onPress: () =>
            callRpc('manage_menu_category_delete', {
              p_organization_id: organizationId,
              p_user_id: user!.id,
              p_category_id: cat.id,
            }),
        },
      ],
    );
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

  const persistCategoryOrder = (ordered: MenuCategory[]) => {
    setCats(ordered);
    callRpc(
      'manage_menu_category_reorder',
      {
        p_organization_id: organizationId,
        p_user_id: user!.id,
        p_ordered_ids: ordered.map((c) => c.id),
      },
      false,
    );
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
    setSelectedCategoryId(null);
    setEditSlot(slot);
  };

  const deleteSub = (sub: MenuSubcategory) => {
    Alert.alert(
      t('manage_categories:delete_subcategory_title'),
      t('manage_categories:delete_subcategory_confirm', { name: sub.display_name }),
      [
        { text: t('manage_categories:cancel'), style: 'cancel' },
        {
          text: t('manage_categories:delete'),
          style: 'destructive',
          onPress: () =>
            callRpc('manage_menu_subcategory_delete', {
              p_organization_id: organizationId,
              p_user_id: user!.id,
              p_subcategory_id: sub.id,
            }),
        },
      ],
    );
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

  // --- Sheet-routed handlers (fired AFTER the editor sheet dismisses) --------
  const requestRename = (cat: MenuCategory) =>
    openNameModal('rename-cat', cat.id, cat.display_name, t('manage_categories:rename_category'), cat.display_name_es || '');
  const requestRenameSub = (sub: MenuSubcategory) =>
    openNameModal('rename-sub', sub.id, sub.display_name, t('manage_categories:rename_subcategory'), sub.display_name_es || '');
  const requestAddSub = (cat: MenuCategory) =>
    openNameModal('add-sub', cat.id, '', t('manage_categories:add_subcategory'));

  // --- Renderers -----------------------------------------------------------
  const renderTile = (cat: MenuCategory, index: number) => {
    const selected = cat.id === selectedCategoryId;
    const total = countsByCat.get(cat.id)?.total ?? 0;
    return (
      <TouchableOpacity
        key={cat.id}
        style={[
          styles.tile,
          cat.is_hidden && { opacity: 0.5 },
          selected && { borderColor: cat.color, borderWidth: 1.5 },
        ]}
        onPress={() => selectTile(cat.id)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[cat.color, cat.color + '4D', 'transparent']}
          locations={[0, 0.34, 0.68]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tileFade}
          pointerEvents="none"
        />
        <View style={styles.tileOrderPill}>
          <Text style={styles.tileOrderText}>{index + 1}</Text>
        </View>
        <View style={styles.tileNameRow}>
          <Text style={styles.tileName} numberOfLines={1}>
            {categoryLabel(cat, t)}
          </Text>
          {cat.system_key !== null && (
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.textSecondary} />
          )}
          {cat.is_hidden && (
            <IconSymbol ios_icon_name="eye.slash" android_material_icon_name="visibility-off" size={11} color={colors.textSecondary} />
          )}
        </View>
        <View style={styles.tileCountRow}>
          <Text style={styles.tileCount}>{total}</Text>
          <Text style={styles.tileCountLabel}>{t('manage_categories:items_label')}</Text>
        </View>
        <Text style={styles.tileSec} numberOfLines={1}>
          {t('manage_categories:subcats_count', { count: cat.subcategories.length })}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSubRow = ({ item, drag, isActive }: RenderItemParams<MenuSubcategory>, pageCat: MenuCategory) => {
    const isLibations = pageCat.system_key === 'cat.libations';
    const canDelete = item.system_key === null && !item.is_cocktail_fed;
    const subCount = countsByCat.get(pageCat.id)?.bySub.get(catKey(item.display_name)) ?? 0;
    return (
      <ScaleDecorator>
        <View style={[styles.row, { opacity: item.is_hidden ? 0.5 : 1 }, isActive && styles.rowActive]}>
          <TouchableOpacity onLongPress={drag} disabled={busy} style={styles.dragHandle}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.rowLabelArea}>
            <Text style={styles.rowLabel} numberOfLines={1}>{subcategoryLabel(item, t)}</Text>
            {item.display_name_es ? (
              <Text style={styles.esCaption} numberOfLines={1}>{t('manage_categories:es_caption', { name: item.display_name_es })}</Text>
            ) : null}
            {item.is_cocktail_fed && (
              <View style={styles.badge}>
                <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={11} color={colors.textSecondary} />
                <Text style={styles.badgeText}>{t('manage_categories:linked_to_recipes')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowCount}>{subCount}</Text>
          <TouchableOpacity onPress={() => requestRenameSub(item)} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={19} color={colors.primary} />
          </TouchableOpacity>
          {isLibations && (
            <TouchableOpacity
              onPress={() => toggleSubCocktailFed(item)}
              style={[styles.iconBtn, item.is_cocktail_fed && styles.iconBtnLinked]}
              disabled={busy || item.system_key !== null}
              accessibilityLabel={t('manage_categories:recipe_backed_toggle')}
            >
              {/* Filled link-circle = recipe-linked (on); hollow link-circle =
                  not linked (off). Distinct glyph per state (iOS has no broken-
                  chain symbol; filled-vs-hollow reads clearly + always renders).
                  Android uses link / link-off (chain / broken chain). */}
              <IconSymbol
                ios_icon_name={item.is_cocktail_fed ? 'link.circle.fill' : 'link.circle'}
                android_material_icon_name={item.is_cocktail_fed ? 'link' : 'link-off'}
                size={21}
                color={item.is_cocktail_fed ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => toggleSubHidden(item)} style={styles.iconBtn} disabled={busy}>
            <IconSymbol ios_icon_name={item.is_hidden ? 'eye.slash' : 'eye'} android_material_icon_name={item.is_hidden ? 'visibility-off' : 'visibility'} size={19} color={colors.textSecondary} />
          </TouchableOpacity>
          {canDelete ? (
            <TouchableOpacity onPress={() => deleteSub(item)} style={styles.iconBtn} disabled={busy}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={19} color={TRASH_RED} />
            </TouchableOpacity>
          ) : item.system_key !== null || item.is_cocktail_fed ? (
            // Locked (built-in or recipe-linked) sub — undeletable, marked with a lock.
            <View style={styles.iconBtn}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={17} color={colors.textSecondary} />
            </View>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
      </ScaleDecorator>
    );
  };

  const renderReorderRow = ({ item, drag, isActive }: RenderItemParams<MenuCategory>) => {
    const total = countsByCat.get(item.id)?.total ?? 0;
    return (
      <ScaleDecorator>
        <View style={[styles.row, { opacity: item.is_hidden ? 0.5 : 1 }, isActive && styles.rowActive]}>
          <TouchableOpacity onLongPress={drag} disabled={busy} style={styles.dragHandle}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.swatchDot, { backgroundColor: item.color }]} />
          <View style={styles.rowLabelArea}>
            <Text style={styles.rowLabel} numberOfLines={1}>{categoryLabel(item, t)}</Text>
          </View>
          <Text style={styles.rowCount}>{total}</Text>
        </View>
      </ScaleDecorator>
    );
  };

  // --- Fixed chrome + the category pager ------------------------------------
  const actionChip = (
    key: string,
    label: string,
    icon: { ios: string; android: string },
    opts: { tint?: string; dim?: boolean; onPress?: () => void } = {},
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.mChip, opts.dim && { opacity: 0.55 }]}
      onPress={opts.onPress}
      disabled={busy || opts.dim || !opts.onPress}
      activeOpacity={0.7}
    >
      <IconSymbol
        ios_icon_name={icon.ios}
        android_material_icon_name={icon.android}
        size={14}
        color={opts.tint || colors.primary}
      />
      <Text style={[styles.mChipText, opts.tint ? { color: opts.tint } : null]}>{label}</Text>
    </TouchableOpacity>
  );

  // The FIXED chrome stack — seg, Add/Reorder, and the tile rail live OUTSIDE
  // every gesture-handled list (the MenuCategoryTabs rule: that's what keeps
  // the rail's horizontal pans alive on Android).
  const chromeBlock = (
    <View style={styles.chrome}>
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

      {/* Add / Reorder — their own row ABOVE the rail (Steve's round-3 call). */}
      {!reorderMode ? (
        <View style={styles.railActs}>
          <TouchableOpacity
            style={styles.rAct}
            onPress={() => openNameModal('add-cat', null, '', t('manage_categories:add_category'))}
            disabled={busy}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
            <Text style={styles.rActText}>{t('manage_categories:add_category')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rAct} onPress={() => setReorderMode(true)} disabled={busy}>
            <IconSymbol ios_icon_name="arrow.up.arrow.down" android_material_icon_name="swap-vert" size={15} color={colors.primary} />
            <Text style={styles.rActText}>{t('manage_categories:reorder')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.railActs}>
          <TouchableOpacity style={[styles.rAct, styles.rActFilled]} onPress={() => setReorderMode(false)} disabled={busy}>
            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={15} color={colors.primary} />
            <Text style={styles.rActText}>{t('manage_categories:done')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!reorderMode && (
        <ScrollView
          ref={railRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.trail}
          contentContainerStyle={styles.trailContent}
        >
          {cats.map(renderTile)}
          <TouchableOpacity
            style={styles.tileAdd}
            onPress={() => openNameModal('add-cat', null, '', t('manage_categories:add_category'))}
            disabled={busy}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );

  // Per-page pieces — each pager page owns its category's caption, chips,
  // subcategory drag list, and footer (they swipe WITH the content).
  const pageHead = (cat: MenuCategory) => {
    const captionKey =
      cat.system_key && BEHAVIOR_CAPTION_KEY[cat.system_key] &&
      !(perMenu && (cat.system_key === 'cat.lunch' || cat.system_key === 'cat.dinner'))
        ? BEHAVIOR_CAPTION_KEY[cat.system_key]
        : null;
    const isWS = cat.filter_behavior === 'weekly_specials';
    return (
      <View style={styles.panelHead}>
        {captionKey && <Text style={styles.caption}>{t(captionKey)}</Text>}
        <View style={styles.mStrip}>
          {actionChip('rename', t('manage_categories:chip_rename'), { ios: 'pencil', android: 'edit' }, {
            onPress: () => setEditorSheetCatId(cat.id),
          })}
          {/* Colour and Hide act DIRECTLY (Steve's s72 smoke call) — the
              editor sheet keeps both as belt-and-suspenders. */}
          {actionChip('colour', t('manage_categories:colour'), { ios: 'paintpalette', android: 'palette' }, {
            onPress: () => setColorPickerCatId(cat.id),
          })}
          {actionChip(
            'hide',
            cat.is_hidden ? t('manage_categories:chip_show') : t('manage_categories:chip_hide'),
            cat.is_hidden
              ? { ios: 'eye.slash', android: 'visibility-off' }
              : { ios: 'eye', android: 'visibility' },
            { onPress: () => toggleCategoryHidden(cat) },
          )}
          {cat.system_key !== null
            ? actionChip('builtin', t('manage_categories:built_in'), { ios: 'lock.fill', android: 'lock' }, { dim: true })
            : actionChip('delete', t('manage_categories:delete'), { ios: 'trash', android: 'delete' }, {
                tint: TRASH_RED,
                onPress: () => setEditorSheetCatId(cat.id),
              })}
        </View>
        {isWS ? (
          <Text style={styles.wsNote}>
            {t('manage_categories:ws_no_subcategories', { name: categoryLabel(cat, t) })}
          </Text>
        ) : (
          <View style={styles.zlabelRow}>
            <Text style={styles.zlabel}>{t('manage_categories:subcategories').toUpperCase()}</Text>
            <View style={styles.zline} />
          </View>
        )}
      </View>
    );
  };

  const pageFooter = (cat: MenuCategory) =>
    cat.filter_behavior === 'weekly_specials' ? (
      <View style={{ height: 8 }} />
    ) : (
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => requestAddSub(cat)}
        disabled={busy}
      >
        <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
        <Text style={styles.addBtnText}>{t('manage_categories:add_subcategory')}</Text>
      </TouchableOpacity>
    );

  // One pager page = one category's panel (drag list of its subcategories).
  const renderPage = ({ item: cat }: { item: MenuCategory }) => (
    <View style={{ width: winW, flex: 1 }}>
      <DraggableFlatList
        data={cat.subcategories}
        keyExtractor={(s) => s.id}
        renderItem={(p) => renderSubRow(p, cat)}
        onDragEnd={({ data }) => persistSubOrder(cat.id, data)}
        // Constrains the drag pan to the vertical axis so horizontal swipes
        // fall through to the pager — the menu editor's exact prop for its
        // drag-lists-inside-the-pager (without it the pan claims every touch).
        activationDistance={10}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={pageHead(cat)}
        ListFooterComponent={pageFooter(cat)}
        ListEmptyComponent={
          cat.filter_behavior !== 'weekly_specials' ? (
            <Text style={styles.emptyLine}>{t('manage_categories:no_subcategories')}</Text>
          ) : null
        }
      />
    </View>
  );

  const pickerCat = cats.find((c) => c.id === colorPickerCatId) || null;

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
        <View style={{ flex: 1 }}>
          {chromeBlock}
          {reorderMode ? (
            <DraggableFlatList
              data={cats}
              keyExtractor={(c) => c.id}
              renderItem={renderReorderRow}
              onDragEnd={({ data }) => persistCategoryOrder(data)}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <FlatList
              ref={pagerRef}
              data={cats}
              keyExtractor={(c) => c.id}
              renderItem={renderPage}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.max(0, selectedIndex)}
              getItemLayout={(_, index) => ({ length: winW, offset: winW * index, index })}
              onMomentumScrollEnd={(e) => onPagerMomentumEnd(e.nativeEvent.contentOffset.x)}
              onScrollToIndexFailed={(info) =>
                pagerRef.current?.scrollToOffset({ offset: info.index * winW, animated: false })
              }
            />
          )}
        </View>
      )}

      <CategoryColorPicker
        visible={pickerCat !== null}
        value={pickerCat?.color || '#607D8B'}
        title={pickerCat ? categoryLabel(pickerCat, t) : ''}
        onSelect={(color) => colorPickerCatId && setCategoryColor(colorPickerCatId, color)}
        onClose={() => setColorPickerCatId(null)}
      />

      {/* The category editor sheet — belt and suspenders. */}
      <CategoryEditorSheet
        visible={editorSheetCat !== null}
        onClose={() => setEditorSheetCatId(null)}
        colors={colors}
        cat={editorSheetCat}
        counts={editorSheetCat ? countsByCat.get(editorSheetCat.id) : undefined}
        busy={busy}
        perMenu={perMenu}
        onRename={requestRename}
        onPickColour={(cat) => setColorPickerCatId(cat.id)}
        onToggleHidden={toggleCategoryHidden}
        onDeleteCategory={deleteCategory}
        onAddSub={requestAddSub}
        onRenameSub={requestRenameSub}
        onToggleSubHidden={toggleSubHidden}
        onToggleSubCocktailFed={toggleSubCocktailFed}
        onDeleteSub={deleteSub}
      />

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

      {/* Name input modal (add / rename) */}
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

      {/* The pushed-editor family chrome: floating nav + Jolt, portal layering. */}
      <BottomNavBar activeTab="menus" />
      <View style={styles.joltLayer} pointerEvents="box-none">
        <JoltOverlay role="manager" />
      </View>
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
    listContent: { paddingHorizontal: 16, paddingBottom: 120 },
    // The fixed chrome stack above the pager (seg + Add/Reorder + tile rail).
    chrome: { paddingHorizontal: 16 },

    // Add / Reorder row
    railActs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    rAct: {
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
    rActFilled: { borderStyle: 'solid', backgroundColor: colors.primary + '24' },
    rActText: { fontFamily: fonts.body.semibold, fontSize: 12.5, color: colors.primary },

    // Tile rail
    trail: { marginHorizontal: -16, marginBottom: 2 },
    trailContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 9, alignItems: 'stretch' },
    tile: {
      width: 150,
      borderRadius: 15,
      padding: 11,
      paddingBottom: 10,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    tileFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5 },
    tileOrderPill: {
      position: 'absolute',
      top: 7,
      right: 7,
      minWidth: 17,
      height: 17,
      borderRadius: 6,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder,
    },
    tileOrderText: { fontFamily: fonts.mono.semibold, fontSize: 9, color: colors.textSecondary },
    tileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 18 },
    tileName: { fontFamily: fonts.display.bold, fontSize: 13, letterSpacing: -0.15, color: colors.text, flexShrink: 1 },
    tileCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 7 },
    tileCount: { fontFamily: fonts.mono.semibold, fontSize: 18, color: colors.primary, lineHeight: 20 },
    tileCountLabel: {
      fontFamily: fonts.mono.medium,
      fontSize: 8,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    tileSec: { fontFamily: fonts.mono.medium, fontSize: 8.5, color: colors.textSecondary, marginTop: 4 },
    wsNote: {
      fontSize: 12,
      fontFamily: fonts.body.regular,
      color: colors.textSecondary,
      lineHeight: 17,
      marginTop: 12,
      paddingHorizontal: 2,
    },
    tileAdd: {
      width: 44,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },

    // Panel head
    panelHead: { marginTop: 2 },
    caption: { fontSize: 11.5, fontFamily: fonts.body.regular, fontStyle: 'italic', color: colors.textSecondary, lineHeight: 16, marginBottom: 8 },
    mStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    mChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 9,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    mChipText: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.text },
    zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 10 },
    zlabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9.5,
      letterSpacing: 1.4,
      color: colors.textSecondary,
    },
    zline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

    // Rows (subcategories + reorder mode)
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    rowActive: { borderColor: colors.primary, boxShadow: '0px 2px 8px rgba(0,0,0,0.25)', elevation: 4 },
    dragHandle: { paddingHorizontal: 4, paddingVertical: 6 },
    swatchDot: { width: 16, height: 16, borderRadius: 8, marginHorizontal: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
    rowLabelArea: { flex: 1, paddingRight: 8, paddingLeft: 4 },
    rowLabel: { fontSize: 14.5, fontFamily: fonts.body.semibold, color: colors.text },
    rowCount: { fontFamily: fonts.mono.medium, fontSize: 11, color: colors.textSecondary, marginRight: 2 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
    badgeText: { fontSize: 11, fontFamily: fonts.body.regular, color: colors.textSecondary },
    esCaption: { fontSize: 11, fontFamily: fonts.body.regular, color: colors.primary, marginTop: 2 },
    iconBtn: { padding: 6, width: 31, alignItems: 'center' },
    iconBtnLinked: { backgroundColor: colors.primary + '1F', borderRadius: 8 },
    emptyLine: { fontSize: 12.5, fontFamily: fonts.body.regular, color: colors.textSecondary, textAlign: 'center', paddingVertical: 14 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    addBtnText: { fontSize: 14, fontFamily: fonts.body.semibold, color: colors.primary },
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
    joltLayer: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  });

// Sheet-local styles (CategoryEditorSheet + LegendSheet).
const createSheetStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    frow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      marginBottom: 8,
    },
    frowBody: { flex: 1, minWidth: 0 },
    frowLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
    frowSub: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1.5 },
    swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', marginRight: 2 },
    caption: { fontSize: 11.5, fontFamily: fonts.body.regular, fontStyle: 'italic', lineHeight: 16, marginTop: 2, marginBottom: 4, paddingHorizontal: 2 },
    zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 9 },
    zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4 },
    zline: { flex: 1, height: StyleSheet.hairlineWidth },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      marginBottom: 6,
    },
    subBody: { flex: 1, minWidth: 0 },
    subName: { fontFamily: fonts.body.semibold, fontSize: 13 },
    linkedCaption: { fontFamily: fonts.body.regular, fontSize: 10.5, marginTop: 1 },
    subCount: { fontFamily: fonts.mono.medium, fontSize: 10.5, marginRight: 2 },
    subBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    addGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      borderRadius: 11,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      marginTop: 2,
    },
    addGhostText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
    emptyLine: { fontSize: 12.5, fontFamily: fonts.body.regular, textAlign: 'center', paddingVertical: 12 },
    wsNote: { fontSize: 12, fontFamily: fonts.body.regular, lineHeight: 17, marginTop: 12, paddingHorizontal: 2 },
    deleteRow: { marginTop: 12 },
    footNote: { fontSize: 11, fontFamily: fonts.body.regular, lineHeight: 15.5, textAlign: 'center', paddingTop: 10, paddingHorizontal: 6 },
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
