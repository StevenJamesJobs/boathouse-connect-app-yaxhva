import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { useAssistantEditor } from '@/hooks/useAssistantEditor';
import { labelForCategoryName, labelForSubcategoryName } from '@/utils/menuCategoryLabels';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import MenuSearchRow from '@/components/MenuSearchRow';
import MenuCategoryTabs from '@/components/MenuCategoryTabs';
import GlassActionSheet from '@/components/GlassActionSheet';
import { useKitchenRecipeOpener } from '@/components/kitchen/KitchenRecipeOpener';
import { stationLabel } from '@/components/kitchen/kitchenReaderKit';
import KitchenRecipeFormSheet from '@/components/kitchen/KitchenRecipeFormSheet';
import KitchenGroupsSheet from '@/components/kitchen/KitchenGroupsSheet';
import { fonts } from '@/constants/fonts';
import {
  KITCHEN_BOOKS,
  bookIsEditableSection,
  deleteKitchenRecipe,
  fetchKitchenGroups,
  fetchKitchenRecipes,
  kitchenBookTitle,
  kitchenTimeSummary,
  pickLang,
  reorderKitchenRecipes,
  sectionForBook,
  type KitchenBook,
  type KitchenGroup,
  type KitchenRecipeRow,
} from '@/hooks/useKitchenRecipes';

/**
 * s91 — ONE book screen for every kitchen book (`?book=` + `&editor=1`).
 *
 *  - Menu books (menu1 / menu2 / specials) wear the Menu tab's own chrome: the
 *    search field, the category chips in their menu colours and the
 *    subcategory pills (the slot's tree via useMenuCategories, shared-scope
 *    rule included), and group the rows by category / subcategory text the way
 *    the Menu tab pages its items (strays land in a trailing "Other"). No ＋ —
 *    menu items come from the Menu Editor only.
 *  - Section books (prep / desserts / banquets) group by the org's GROUPS; the
 *    editor gets the ＋ (pick a group, then the form), a Groups chip, and the
 *    ⋯ / long-press sheet (Edit · Move · Delete).
 *  - Saved is the viewer's own folder, grouped by the book each recipe lives
 *    in; recipes whose item left the menu gather under "No longer on the menu".
 *
 * Cards are the bar family's photo tiles (RecipeGridCard geometry, two across):
 * name in the scrim, a mono meta line (station · time), a gold "Needs recipe"
 * pill while the recipe is only the menu's facts, a gold ★ for specials.
 */

type EditableSection = 'prep' | 'desserts' | 'banquets';
type FormTarget =
  | { kind: 'edit'; recipeId: string }
  | { kind: 'create'; section: EditableSection; groupId?: string | null };

// The "needs a recipe" gold — the Menu kit's SPECIAL_GOLD (components/MenuItemCards).
const NEEDS_GOLD = { dark: '#F5B942', light: '#B7791F' } as const;
const NEEDS_INK = { dark: '#2A1F05', light: '#FFFFFF' } as const;
// The Poster's slate pill (RecipeDetailSheet) — "Off the menu".
const SLATE = '#4A5568';

// Virtual pill keys — never collide with a real category name (lower-cased).
const ALL_KEY = '__all__';
const OTHER_KEY = '__other__';

// Case-insensitive name key — the DB unique indexes are lower()-based.
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

const isBook = (b: unknown): b is KitchenBook => typeof b === 'string' && (KITCHEN_BOOKS as string[]).includes(b);

interface Shelf {
  key: string;
  /** null = a single, unlabelled grid. */
  label: string | null;
  rows: KitchenRecipeRow[];
  /** The ⋯ sheet's Move up / Move down work within this list (section books). */
  reorderable?: boolean;
  /** Saved: the "No longer on the menu" shelf — slate pill, dimmed photos. */
  offMenu?: boolean;
}

export default function KitchenRecipesScreen() {
  const params = useLocalSearchParams<{ book?: string; editor?: string }>();
  const book: KitchenBook = isBook(params.book) ? params.book : 'menu1';
  const editor = params.editor === '1';
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { language } = useLanguage();
  const { canEdit, isLoading: grantLoading } = useAssistantEditor();
  const gold = mode === 'dark' ? NEEDS_GOLD.dark : NEEDS_GOLD.light;
  const goldInk = mode === 'dark' ? NEEDS_INK.dark : NEEDS_INK.light;

  // Editor mode is a route param, so the guard is computed, not a conditional
  // hook: no-op while the grant loads, bounce to the user face when refused.
  const canEditKitchen = canEdit('kitchen');
  const allowed = !editor || grantLoading || canEditKitchen;
  useEffect(() => {
    if (!allowed) router.replace({ pathname: '/kitchen-recipes', params: { book } } as any);
  }, [allowed, book, router]);

  const section = sectionForBook(book);
  const isMenuBook = book === 'menu1' || book === 'menu2';
  const isSaved = book === 'saved';
  const editableSection: EditableSection | null = bookIsEditableSection(book) ? (book as EditableSection) : null;
  const sectionEditor = editor && !!editableSection;

  // Menu 1 → slot 1, Menu 2 → slot 2; shared scope ignores the slot (the hook's
  // rule, the same call the Menu tab makes). Hidden categories stay out.
  const { categories: menuCats } = useMenuCategories({ menuSlot: book === 'menu2' ? 2 : 1 });

  const [rows, setRows] = useState<KitchenRecipeRow[]>([]);
  const [groups, setGroups] = useState<KitchenGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('');
  const [activeSub, setActiveSub] = useState(ALL_KEY);
  const [savedSort, setSavedSort] = useState<'book' | 'az'>('book');
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [pickGroupOpen, setPickGroupOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<{ row: KitchenRecipeRow; siblings: KitchenRecipeRow[]; index: number } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [list, gs] = await Promise.all([
        fetchKitchenRecipes(user.id, book),
        editableSection ? fetchKitchenGroups(user.id, editableSection) : Promise.resolve([] as KitchenGroup[]),
      ]);
      setRows(list);
      setGroups(gs);
    } catch (e) {
      console.error('[kitchen-recipes] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, book, editableSection]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // The reader (Scroll / Steps / Book picker + the Poster): one node in the
  // tree, `openRecipe(id)` on a tap. In editor mode its Edit lands in our form.
  const opener = useKitchenRecipeOpener({
    onEdit: editor ? (id: string) => setFormTarget({ kind: 'edit', recipeId: id }) : undefined,
  });

  // ── labels ──────────────────────────────────────────────────────────────────

  const name = (r: KitchenRecipeRow) => pickLang(r.name, r.name_es, language);
  const menuName = (r: KitchenRecipeRow) =>
    r.season === 'summer' ? (organization?.menu_2_name || 'Menu 2') : (organization?.menu_1_name || 'Menu 1');

  // The card's mono line: station · time when the recipe is written; else the
  // menu placement (DINNER › ENTREES) for a menu row, the group for the rest.
  const metaFor = (r: KitchenRecipeRow): string | null => {
    const parts = [stationLabel(r.station, t), kitchenTimeSummary(r.prep_minutes, r.cook_minutes)].filter((x) => !!x);
    if (parts.length > 0) return parts.join(' · ').toUpperCase();
    if (r.section === 'menu') {
      const c = r.category ? labelForCategoryName(r.category, t, menuCats, language) : null;
      const s = r.subcategory ? labelForSubcategoryName(r.subcategory, t, menuCats, language) : null;
      const placed = [c, s].filter(Boolean).join(' › ');
      return (placed || t('kitchen_assistant.from_menu', { menu: menuName(r) })).toUpperCase();
    }
    const g = pickLang(r.group_name, r.group_name_es, language);
    return g ? g.toUpperCase() : null;
  };

  // ── search ──────────────────────────────────────────────────────────────────

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = useMemo(
    () => (searching
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.name_es || '').toLowerCase().includes(q))
      : rows),
    [rows, q, searching],
  );

  // ── menu books: the Menu tab's chips + pills over the recipe rows ──────────

  const treeCatKeys = useMemo(() => new Set(menuCats.map((c) => catKey(c.display_name))), [menuCats]);
  const strays = useMemo(() => rows.filter((r) => !treeCatKeys.has(catKey(r.category))), [rows, treeCatKeys]);
  // Chips = tree order, only categories that have rows; a trailing "Other" while
  // rows sit in a category the tree does not know (hidden or renamed away).
  const chips = useMemo(() => {
    if (!isMenuBook) return [];
    const out = menuCats
      .filter((c) => rows.some((r) => catKey(r.category) === catKey(c.display_name)))
      .map((c) => ({ name: c.display_name, label: labelForCategoryName(c.display_name, t, menuCats, language), color: c.color }));
    if (strays.length > 0) out.push({ name: OTHER_KEY, label: t('menu_display.other'), color: colors.textSecondary });
    return out;
  }, [isMenuBook, menuCats, rows, strays, t, language, colors.textSecondary]);
  const effectiveCat = chips.some((c) => c.name === activeCat) ? activeCat : (chips[0]?.name ?? '');
  const activeCatObj = menuCats.find((c) => catKey(c.display_name) === catKey(effectiveCat));
  const catRows = useMemo(
    () => (effectiveCat === OTHER_KEY ? strays : rows.filter((r) => catKey(r.category) === catKey(effectiveCat))),
    [effectiveCat, strays, rows],
  );
  // Sub pills = the category's subcategories that have rows (tree order), an
  // "All" first, and "Other" last while the category has strays. A category
  // with no subcategories gets no pill row — one grid.
  const subNames = useMemo(
    () => (activeCatObj?.subcategories ?? [])
      .map((s) => s.display_name)
      .filter((sn) => catRows.some((r) => catKey(r.subcategory) === catKey(sn))),
    [activeCatObj, catRows],
  );
  const subStrays = useMemo(() => {
    const known = new Set(subNames.map(catKey));
    return catRows.filter((r) => !known.has(catKey(r.subcategory)));
  }, [catRows, subNames]);
  const subTabs = useMemo(() => {
    if (subNames.length === 0) return [];
    const out = [{ name: ALL_KEY, label: t('kitchen_assistant.all_pill') }];
    for (const sn of subNames) out.push({ name: sn, label: labelForSubcategoryName(sn, t, menuCats, language) });
    if (subStrays.length > 0) out.push({ name: OTHER_KEY, label: t('menu_display.other') });
    return out;
  }, [subNames, subStrays, menuCats, t, language]);
  const effectiveSub = subTabs.some((s) => s.name === activeSub) ? activeSub : ALL_KEY;
  const activeColor = activeCatObj?.color || colors.primary;

  // ── shelves ─────────────────────────────────────────────────────────────────

  const shelves = useMemo<Shelf[]>(() => {
    if (searching) return [{ key: 'search', label: null, rows: matches }];

    if (isMenuBook) {
      if (chips.length === 0) return [];
      if (subTabs.length === 0) return [{ key: 'cat', label: null, rows: catRows }];
      if (effectiveSub === OTHER_KEY) return [{ key: 'other', label: null, rows: subStrays }];
      if (effectiveSub !== ALL_KEY) {
        return [{ key: effectiveSub, label: null, rows: catRows.filter((r) => catKey(r.subcategory) === catKey(effectiveSub)) }];
      }
      const out: Shelf[] = subNames.map((sn) => ({
        key: sn,
        label: labelForSubcategoryName(sn, t, menuCats, language),
        rows: catRows.filter((r) => catKey(r.subcategory) === catKey(sn)),
      }));
      if (subStrays.length > 0) out.push({ key: OTHER_KEY, label: t('menu_display.other'), rows: subStrays });
      return out;
    }

    if (book === 'specials') return rows.length > 0 ? [{ key: 'specials', label: null, rows }] : [];

    if (isSaved) {
      if (savedSort === 'az') {
        const sorted = [...rows].sort((a, b) => name(a).localeCompare(name(b)));
        return sorted.length > 0 ? [{ key: 'az', label: null, rows: sorted }] : [];
      }
      // By book: menu rows by season (winter → Menu 1, summer → Menu 2, both →
      // Menu 1), sections by their own book, off-menu rows last.
      const bookOf = (r: KitchenRecipeRow): KitchenBook | 'off' => {
        if (r.off_menu) return 'off';
        if (r.section === 'menu') return r.season === 'summer' ? 'menu2' : 'menu1';
        return r.section;
      };
      const order: (KitchenBook | 'off')[] = ['menu1', 'menu2', 'prep', 'desserts', 'banquets', 'off'];
      return order
        .map((b) => ({
          key: b,
          label: b === 'off' ? t('kitchen_assistant.no_longer_on_menu') : kitchenBookTitle(b, organization, t),
          rows: rows.filter((r) => bookOf(r) === b),
          offMenu: b === 'off',
        }))
        .filter((s) => s.rows.length > 0);
    }

    // Section books: the RPC already orders by group, then recipe. Keep that
    // order, ungrouped rows last as "Ungrouped".
    const byGroup = new Map<string, Shelf>();
    const ungrouped: KitchenRecipeRow[] = [];
    for (const r of rows) {
      if (!r.group_id) { ungrouped.push(r); continue; }
      const s = byGroup.get(r.group_id);
      if (s) s.rows.push(r);
      else byGroup.set(r.group_id, { key: r.group_id, label: pickLang(r.group_name, r.group_name_es, language) || '', rows: [r], reorderable: true });
    }
    const out = Array.from(byGroup.values());
    if (ungrouped.length > 0) out.push({ key: 'ungrouped', label: t('kitchen_assistant.ungrouped'), rows: ungrouped, reorderable: true });
    return out;
  }, [searching, matches, isMenuBook, chips, subTabs, effectiveSub, catRows, subStrays, subNames, menuCats, t, language, book, rows, isSaved, savedSort, organization]);

  const shownCount = shelves.reduce((n, s) => n + s.rows.length, 0);
  const shownNeeds = shelves.reduce((n, s) => n + s.rows.filter((r) => !r.is_written).length, 0);

  // ── editor actions ──────────────────────────────────────────────────────────

  const onAdd = () => {
    if (!editableSection) return;
    if (groups.length === 0) setFormTarget({ kind: 'create', section: editableSection, groupId: null });
    else setPickGroupOpen(true);
  };

  const moveRow = async (siblings: KitchenRecipeRow[], index: number, dir: -1 | 1) => {
    if (!user?.id) return;
    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved);
    try {
      await reorderKitchenRecipes(user.id, next.map((r) => r.id));
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), translateServerError(e as any, t('kitchen_assistant_editor.reorder_failed')));
    }
  };

  const confirmDelete = (row: KitchenRecipeRow) => {
    Alert.alert(t('kitchen_assistant_editor.delete_title'), t('kitchen_assistant_editor.delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;
          try {
            await deleteKitchenRecipe(user.id, row.id);
            await load();
          } catch (e) {
            Alert.alert(t('common.error'), translateServerError(e as any, t('kitchen_assistant_editor.delete_failed')));
          }
        },
      },
    ]);
  };

  // ── header ──────────────────────────────────────────────────────────────────

  const title = kitchenBookTitle(book, organization, t);
  const headerRight = editor ? (
    <View style={styles.headerRight}>
      {/* Groups moved into the ＋ sheet (s91 smoke: two chips crowded the title). */}
      <HeaderNavButton
        label={t('common:to_user')}
        iconIos="person.fill"
        iconAndroid="person"
        onPress={() => router.replace({ pathname: '/kitchen-recipes', params: { book } } as any)}
      />
    </View>
  ) : canEditKitchen && !isSaved ? (
    <HeaderNavButton
      label={t('common:to_editor')}
      iconIos="pencil"
      iconAndroid="edit"
      onPress={() => router.replace({ pathname: '/kitchen-recipes', params: { book, editor: '1' } } as any)}
    />
  ) : undefined;

  // ── pieces ──────────────────────────────────────────────────────────────────

  const zlabel = (label: string, count: number, muted?: boolean) => (
    <View style={styles.zlabelRow}>
      <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
      <Text style={[styles.zlabel, { color: colors.textSecondary }, muted && { opacity: 0.7 }]}>{count}</Text>
    </View>
  );

  const card = (r: KitchenRecipeRow, shelf: Shelf, index: number) => {
    const hasPhoto = !!r.thumbnail_url;
    const needs = !r.is_written;
    const meta = metaFor(r);
    const meatball = sectionEditor && !searching && !!shelf.reorderable;
    const onLong = meatball ? () => setActionsFor({ row: r, siblings: shelf.rows, index }) : undefined;
    return (
      <TouchableOpacity
        key={r.id}
        style={[
          styles.card,
          { borderColor: colors.glassBorder, backgroundColor: hasPhoto ? colors.thumbPlaceholder : colors.surface },
        ]}
        // Editor mode: the card IS the edit affordance (Steve's device round);
        // user mode: the reader (picker / Poster / Steps / Book).
        onPress={() => (editor ? setFormTarget({ kind: 'edit', recipeId: r.id }) : opener.openRecipe(r.id))}
        onLongPress={onLong}
        delayLongPress={320}
        activeOpacity={0.85}
      >
        {hasPhoto && (
          <>
            <StorageImage
              source={{ uri: r.thumbnail_url }}
              style={[styles.cardImage, (needs || shelf.offMenu) && styles.cardImageDim]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(8,10,14,0.32)', 'rgba(8,10,14,0.86)']}
              style={styles.cardScrim}
            />
          </>
        )}

        {/* Top-left: the ★ for specials, the pencil in editor mode. */}
        <View style={styles.cardTopLeft}>
          {r.is_special && (
            <View style={[styles.starChip, { backgroundColor: gold }]}>
              <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color={goldInk} />
            </View>
          )}
          {editor && (
            // The pencil (32 pt — it was invisible at 22) also goes STRAIGHT to the form.
            <TouchableOpacity
              style={[styles.pencilChip, hasPhoto ? styles.pencilChipOnPhoto : { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={() => setFormTarget({ kind: 'edit', recipeId: r.id })}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={15} color={hasPhoto ? '#FFFFFF' : colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* Top-right: the status pill, then the ⋯ for section editors. */}
        <View style={styles.cardTopRight}>
          {shelf.offMenu ? (
            <View style={[styles.statusPill, { backgroundColor: SLATE }]}>
              <Text style={[styles.statusPillText, { color: '#FFFFFF' }]}>{t('kitchen_assistant.off_the_menu').toUpperCase()}</Text>
            </View>
          ) : needs ? (
            <View style={[styles.statusPill, { backgroundColor: gold }]}>
              <Text style={[styles.statusPillText, { color: goldInk }]}>{t('kitchen_assistant.needs_recipe').toUpperCase()}</Text>
            </View>
          ) : null}
          {meatball && (
            <TouchableOpacity
              onPress={() => setActionsFor({ row: r, siblings: shelf.rows, index })}
              style={[styles.cornerButton, !hasPhoto && { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-vert" size={15} color={hasPhoto ? '#FFFFFF' : colors.text} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cardMeta}>
          <Text style={[styles.cardName, { color: hasPhoto ? '#FFFFFF' : colors.text }]} numberOfLines={2}>{name(r)}</Text>
          {!!meta && (
            <Text style={[styles.cardMetaText, { color: hasPhoto ? '#FFB07A' : colors.textSecondary }]} numberOfLines={1}>{meta}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const grid = (shelf: Shelf) => (
    <View style={styles.grid}>
      {shelf.rows.map((r, i) => card(r, shelf, i))}
    </View>
  );

  // Under the chips: "ENTREES · 9 RECIPES · 3 NEED RECIPES" (gold tail for editors).
  const statLine = (label: string | null) => (
    <Text style={[styles.statLine, { color: colors.textSecondary }]} numberOfLines={1}>
      {[label, t('kitchen_assistant.recipes_count', { count: shownCount })].filter(Boolean).join(' · ').toUpperCase()}
      {canEditKitchen && shownNeeds > 0 && (
        <Text style={{ color: gold }}>{' · '}{t('kitchen_assistant.needs_count', { count: shownNeeds }).toUpperCase()}</Text>
      )}
    </Text>
  );

  const emptyState = () => {
    const icon = isSaved ? 'bookmark' : 'fork.knife';
    const iconA = isSaved ? 'bookmark-border' : 'restaurant';
    const headline = searching ? t('common.no_results') : isSaved ? t('kitchen_assistant.save_first_title') : t('kitchen_assistant.no_recipes');
    const sub = searching ? null : isSaved ? t('kitchen_assistant.save_first_sub') : isMenuBook || book === 'specials' ? t('kitchen_assistant.menu_book_empty') : null;
    return (
      <View style={styles.emptyContainer}>
        <IconSymbol ios_icon_name={icon} android_material_icon_name={iconA} size={56} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.text }]}>{headline}</Text>
        {!!sub && <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>{sub}</Text>}
      </View>
    );
  };

  const activeLabel = isMenuBook && !searching
    ? (effectiveSub !== ALL_KEY
        ? (subTabs.find((s) => s.name === effectiveSub)?.label ?? null)
        : (chips.find((c) => c.name === effectiveCat)?.label ?? null))
    : null;

  const searchPlaceholder = isSaved ? t('kitchen_assistant.search_saved_placeholder') : t('kitchen_assistant.search_placeholder');

  if (!allowed) {
    return <View style={[styles.container, { backgroundColor: colors.background }]}><AmbientGlow /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={title}
        eyebrow={editor ? t('kitchen_assistant_editor.title') : t('kitchen_assistant.title')}
        rightWide={!!headerRight}
        right={headerRight}
      />

      {/* Editor, menu book: say where items come from — there is no ＋ here. */}
      {editor && !editableSection && !isSaved && (
        <Text style={[styles.hintLine, { color: colors.textSecondary }]} numberOfLines={2}>
          {t('kitchen_assistant_editor.menu_book_hint')}
        </Text>
      )}

      {/* Search — the Menu kit's row; section editors get the ＋ in its right slot. */}
      {sectionEditor ? (
        <MenuSearchRow
          colors={colors}
          mode="editor"
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          onRightPress={onAdd}
        />
      ) : (
        <View style={styles.searchRow}>
          <View style={[styles.searchField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Menu books: the Menu tab's chips + pills (hidden while searching). */}
      {isMenuBook && !searching && chips.length > 0 && (
        <MenuCategoryTabs
          colors={colors}
          categories={chips}
          activeCategory={effectiveCat}
          onSelectCategory={(n) => { setActiveCat(n); setActiveSub(ALL_KEY); }}
          subcategories={subTabs}
          activeSubcategory={effectiveSub}
          onSelectSubcategory={setActiveSub}
          activeColor={activeColor}
        />
      )}

      {/* Saved: the sort capsule. */}
      {isSaved && !searching && rows.length > 0 && (
        <View style={styles.capsuleRow}>
          <View style={[styles.capsule, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            {(['book', 'az'] as const).map((k) => {
              const on = savedSort === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.capsuleSeg, on && { backgroundColor: colors.primary }]}
                  onPress={() => setSavedSort(k)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.capsuleText, { color: on ? colors.fireText : colors.textSecondary }]}>
                    {k === 'book' ? t('kitchen_assistant.sort_by_book') : t('kitchen_assistant.sort_az')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          {shownCount === 0 ? (
            emptyState()
          ) : (
            <>
              {(isMenuBook || searching) && statLine(activeLabel)}
              {shelves.map((shelf) => (
                <React.Fragment key={shelf.key}>
                  {shelf.label !== null && zlabel(shelf.label, shelf.rows.length, shelf.offMenu)}
                  {grid(shelf)}
                </React.Fragment>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* The reader (view picker + Poster + routes). */}
      {opener.node}

      {/* ＋ → which group? (deferred: the form opens once this sheet is gone) */}
      {sectionEditor && !!editableSection && (
        <GlassActionSheet
          visible={pickGroupOpen}
          onClose={() => setPickGroupOpen(false)}
          title={t('kitchen_assistant_editor.add_recipe_title')}
          subtitle={t('kitchen_assistant_editor.add_recipe_sub')}
          actions={[
            ...groups.map((g) => ({
              key: g.id,
              label: pickLang(g.name, g.name_es, language),
              iosIcon: 'folder',
              androidIcon: 'folder',
              onPress: () => setFormTarget({ kind: 'create', section: editableSection, groupId: g.id }),
            })),
            {
              key: 'none',
              label: t('kitchen_assistant_editor.no_group'),
              iosIcon: 'tray',
              androidIcon: 'inbox',
              onPress: () => setFormTarget({ kind: 'create', section: editableSection, groupId: null }),
            },
            {
              key: 'groups',
              label: t('kitchen_assistant_editor.groups'),
              iosIcon: 'folder.badge.gearshape',
              androidIcon: 'create-new-folder',
              onPress: () => setGroupsOpen(true),
            },
          ]}
        />
      )}

      {/* ⋯ / long-press: View · Edit · Move up · Move down · Delete */}
      {sectionEditor && (
        <GlassActionSheet
          visible={!!actionsFor}
          onClose={() => setActionsFor(null)}
          title={actionsFor ? name(actionsFor.row) : ''}
          actions={actionsFor ? [
            {
              // The card itself edits in editor mode, so the reader lives here.
              key: 'view',
              label: t('menu_detail.view_recipe'),
              iosIcon: 'eye',
              androidIcon: 'visibility',
              onPress: () => opener.openRecipe(actionsFor.row.id),
            },
            {
              key: 'edit',
              label: t('common.edit'),
              iosIcon: 'pencil',
              androidIcon: 'edit',
              onPress: () => setFormTarget({ kind: 'edit', recipeId: actionsFor.row.id }),
            },
            {
              key: 'up',
              label: t('libation_editor.move_up'),
              iosIcon: 'arrow.up',
              androidIcon: 'arrow-upward',
              disabled: actionsFor.index === 0,
              onPress: () => moveRow(actionsFor.siblings, actionsFor.index, -1),
            },
            {
              key: 'down',
              label: t('libation_editor.move_down'),
              iosIcon: 'arrow.down',
              androidIcon: 'arrow-downward',
              disabled: actionsFor.index >= actionsFor.siblings.length - 1,
              onPress: () => moveRow(actionsFor.siblings, actionsFor.index, 1),
            },
            {
              key: 'delete',
              label: t('common.delete'),
              iosIcon: 'trash',
              androidIcon: 'delete',
              destructive: true,
              onPress: () => confirmDelete(actionsFor.row),
            },
          ] : []}
        />
      )}

      {editor && (
        <KitchenRecipeFormSheet
          visible={!!formTarget}
          onClose={() => setFormTarget(null)}
          target={formTarget ?? { kind: 'create', section: editableSection ?? 'prep', groupId: null }}
          onSaved={() => { setFormTarget(null); load(); }}
        />
      )}

      {sectionEditor && !!editableSection && (
        <KitchenGroupsSheet
          visible={groupsOpen}
          onClose={() => setGroupsOpen(false)}
          section={editableSection}
          onChanged={load}
        />
      )}
    </View>
  );
}

const CARD_SIZE = Math.floor((Dimensions.get('window').width - 32) * 0.485);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintLine: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 0.4,
    paddingHorizontal: 18,
    marginTop: -4,
    marginBottom: 9,
  },
  // Search — the MenuSearchRow geometry (46pt field, 11pt bottom margin).
  searchRow: {
    paddingHorizontal: 16,
    marginBottom: 11,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 13,
    paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 15,
    padding: 0,
  },
  // Saved: sort capsule
  capsuleRow: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  capsule: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 3,
    gap: 3,
  },
  capsuleSeg: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  statLine: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  // zlabel — the mono rhythm (label · hairline · count).
  zlabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  zlabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  zlabelLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  // Cards — two across, square, the bar family's photo tile.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  card: {
    // Explicit square (the RecipeGridCard pattern): every child is absolutely
    // positioned, and Yoga collapsed a percentage-width + aspectRatio card to
    // zero height when it had no photo child (s91 sim smoke).
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageDim: {
    opacity: 0.55,
  },
  cardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  cardTopLeft: {
    position: 'absolute',
    top: 7,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 3,
  },
  cardTopRight: {
    position: 'absolute',
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 3,
  },
  starChip: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // On a photo the chips are the fixed-dark glass of the scrim family.
  pencilChipOnPhoto: {
    backgroundColor: 'rgba(8,10,14,0.5)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 0.7,
  },
  cornerButton: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,14,0.5)',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  cardMeta: {
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 8,
  },
  cardName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
  },
  cardMetaText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
    marginTop: 2,
  },
});
