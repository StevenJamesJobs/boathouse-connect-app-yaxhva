import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useAssistantEditor } from '@/hooks/useAssistantEditor';
import { supabase } from '@/app/integrations/supabase/client';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import HeaderNavButton from '@/components/HeaderNavButton';
import ProgressRing from '@/components/ProgressRing';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';
import { appleGreen } from '@/constants/Colors';
import {
  fetchKitchenHub,
  fetchKitchenRecipes,
  kitchenBookTitle,
  type KitchenBook,
  type KitchenHubBook,
} from '@/hooks/useKitchenRecipes';

// s91 — the Kitchen Assistant hub, on the Bar hub's grammar: three checklist
// rings (the kitchen runs opening / running / closing like the host stand), a
// wide tinted Saved tile when the viewer has saved anything, then the 2×2 book
// grid with photo peeks. Every number comes from get_kitchen_hub + the
// checklist RPCs in one Promise.all on focus.

// The "needs a recipe" gold — the Menu kit's SPECIAL_GOLD (components/MenuItemCards).
const NEEDS_GOLD = { dark: '#F5B942', light: '#B7791F' } as const;

interface ChecklistStat {
  done: number;
  total: number;
}

interface HubData {
  books: Partial<Record<KitchenBook, KitchenHubBook>>;
  saved: { count: number; offMenu: number; thumbs: string[] };
  opening: ChecklistStat;
  running: ChecklistStat;
  closing: ChecklistStat;
}

const EMPTY_STAT: ChecklistStat = { done: 0, total: 0 };
const EMPTY_BOOK = (book: KitchenBook): KitchenHubBook => ({ book, total: 0, needs: 0, thumbs: [] });

export default function KitchenAssistantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { perms } = useManagerPermissions();
  const { canEdit } = useAssistantEditor();
  const isManager = isManagerOrOwner(user);
  const canEditKitchen = canEdit('kitchen');
  const gold = mode === 'dark' ? NEEDS_GOLD.dark : NEEDS_GOLD.light;
  const [hub, setHub] = useState<HubData | null>(null);

  // Menu 2's book only exists while the org runs two menus (the bar hub's rule,
  // without its "keep Menu 2 recipes visible" override — the kitchen's menu
  // books are fed by the live menu, so a hidden menu has nothing to show).
  const twoMenus = organization?.menu_count === 2;

  const loadHub = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const [books, savedRows, openItems, runItems, closeItems, progress] = await Promise.all([
        fetchKitchenHub(user.id),
        fetchKitchenRecipes(user.id, 'saved'),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_kind: 'kitchen', p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_kind: 'kitchen', p_checklist_type: 'running_side_work' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_kind: 'kitchen', p_checklist_type: 'closing' }),
        supabase.rpc('get_my_checklist_progress', { p_actor_id: user.id, p_bartender: false, p_kind: 'kitchen', p_date: today }),
      ]);

      const byBook: Partial<Record<KitchenBook, KitchenHubBook>> = {};
      for (const b of books) byBook[b.book] = b;

      const doneIds = new Set(
        (progress.data || []).filter((p: any) => p.completed).map((p: any) => p.checklist_item_id)
      );
      const stat = (items: any[] | null | undefined): ChecklistStat => ({
        done: (items || []).filter((i) => doneIds.has(i.id)).length,
        total: (items || []).length,
      });

      setHub({
        books: byBook,
        saved: {
          count: savedRows.length,
          offMenu: savedRows.filter((r) => r.off_menu).length,
          thumbs: savedRows.map((r) => r.thumbnail_url).filter((u): u is string => !!u).slice(0, 3),
        },
        opening: stat(openItems.data),
        running: stat(runItems.data),
        closing: stat(closeItems.data),
      });
    } catch (error) {
      // The hub is a launcher first — a failed stats fetch must never block it.
      console.error('Error loading kitchen hub data:', error);
      setHub({
        books: {},
        saved: { count: 0, offMenu: 0, thumbs: [] },
        opening: EMPTY_STAT, running: EMPTY_STAT, closing: EMPTY_STAT,
      });
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHub();
    }, [loadHub])
  );

  const pct = (x: ChecklistStat) => (x.total > 0 ? Math.round((x.done / x.total) * 100) : 0);

  // Pure client clock: mornings point at Opening, evenings at Closing.
  const openingIsNow = new Date().getHours() < 16;

  const openBook = (book: KitchenBook) =>
    router.push({ pathname: '/kitchen-recipes', params: { book } } as any);

  const zlabel = (label: string) => (
    <View style={styles.zlabelRow}>
      <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
    </View>
  );

  const ringTile = (opts: {
    iconIos: string; iconAndroid: string; name: string; a11y: string; now: boolean;
    stat: ChecklistStat; route: string;
  }) => {
    const p = pct(opts.stat);
    // All done = the rewarding green (the s74 smoke call).
    const ringColor = p >= 100 ? appleGreen : colors.primary;
    return (
      <TouchableOpacity
        style={[
          styles.ringTile,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          !opts.now && styles.ringTileOff,
        ]}
        onPress={() => router.push(opts.route as any)}
        activeOpacity={0.7}
        accessibilityLabel={opts.a11y}
      >
        <View style={styles.ringTileTop}>
          <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={15} color={colors.primary} />
          <Text style={[styles.ringTileName, { color: colors.text }]} numberOfLines={1}>{opts.name}</Text>
          {opts.now && (
            <View style={[styles.nowPill, { backgroundColor: colors.primary }]}>
              <Text style={[styles.nowPillText, { color: colors.fireText }]}>{t('bartender_assistant.now_pill').toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.ringTileFoot}>
          <ProgressRing
            pct={p}
            size={40}
            stroke={4}
            color={ringColor}
            trackColor={colors.glassBorder}
          >
            <Text style={[styles.ringLabel, { color: p >= 100 ? appleGreen : p > 0 ? colors.primary : colors.textSecondary }]}>
              {p}%
            </Text>
          </ProgressRing>
          <View style={styles.ringStat}>
            <Text style={[styles.statBig, { color: colors.text }]} numberOfLines={1}>{opts.stat.done} / {opts.stat.total}</Text>
            <Text style={[styles.statSmall, { color: colors.textSecondary }]} numberOfLines={1}>{t('kitchen_assistant.today')}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const peekRow = (thumbs: string[]) =>
    thumbs.length > 0 ? (
      <View style={styles.peekRow}>
        {thumbs.map((u, i) => (
          <View
            key={i}
            style={[
              styles.peekThumb,
              { borderColor: colors.background, backgroundColor: colors.thumbPlaceholder },
              i > 0 && styles.peekThumbOverlap,
            ]}
          >
            <StorageImage source={{ uri: u }} style={styles.peekImage} resizeMode="cover" />
          </View>
        ))}
      </View>
    ) : null;

  // "{{n}} recipes · {{needs}} need recipes" — the gold tail only for people who
  // can do something about it (recipe editors), never for the line cook.
  const countLine = (b: KitchenHubBook) => (
    <Text style={[styles.gridTileCount, { color: colors.textSecondary }]} numberOfLines={2}>
      {t('kitchen_assistant.recipes_count', { count: b.total })}
      {canEditKitchen && b.needs > 0 && (
        <Text style={{ color: gold }}>{'  ·  '}{t('kitchen_assistant.needs_count', { count: b.needs })}</Text>
      )}
    </Text>
  );

  const gridTile = (opts: { iconIos: string; iconAndroid: string; book: KitchenBook; data: KitchenHubBook }) => (
    <TouchableOpacity
      key={opts.book}
      style={[styles.gridTile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => openBook(opts.book)}
      activeOpacity={0.7}
    >
      <View style={styles.gridTileTop}>
        <View style={[styles.iconChip, { backgroundColor: colors.primary + '21' }]}>
          <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={18} color={colors.primary} />
        </View>
        {peekRow(opts.data.thumbs)}
      </View>
      <View>
        <Text style={[styles.gridTileName, { color: colors.text }]} numberOfLines={2}>
          {kitchenBookTitle(opts.book, organization, t)}
        </Text>
        {countLine(opts.data)}
      </View>
    </TouchableOpacity>
  );

  // The Saved tile — WIDE and tinted (the premium Tools-tile finish) so it reads
  // as the viewer's own folder, not a seventh book; sits above the Recipes
  // label (the mockup's frame 1).
  const savedTile = (saved: HubData['saved']) => (
    <TouchableOpacity
      style={[styles.wideTile, { backgroundColor: colors.primary + '1C', borderColor: colors.primary + '47' }]}
      onPress={() => openBook('saved')}
      activeOpacity={0.7}
    >
      <View style={[styles.iconChip, { backgroundColor: colors.primary + '21' }]}>
        <IconSymbol ios_icon_name="bookmark.fill" android_material_icon_name="bookmark" size={18} color={colors.primary} />
      </View>
      <View style={styles.wideTileBody}>
        <Text style={[styles.gridTileName, { color: colors.text }]} numberOfLines={1}>{t('kitchen_assistant.book_saved')}</Text>
        <Text style={[styles.gridTileCount, { color: colors.textSecondary }]} numberOfLines={2}>
          {t('kitchen_assistant.saved_count', { count: saved.count })}
          {saved.offMenu > 0 && ` · ${t('kitchen_assistant.off_menu_count', { count: saved.offMenu })}`}
        </Text>
      </View>
      {peekRow(saved.thumbs)}
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  // Nothing saved yet — a dashed, muted invitation that closes the grid. Not
  // tappable: the bookmark lives inside the recipes, not here.
  const saveFirstTile = (
    <View style={[styles.wideTile, styles.wideTileDashed, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={[styles.iconChip, { backgroundColor: colors.glass }]}>
        <IconSymbol ios_icon_name="bookmark" android_material_icon_name="bookmark-border" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.wideTileBody}>
        <Text style={[styles.gridTileName, { color: colors.textSecondary }]} numberOfLines={1}>{t('kitchen_assistant.save_first_title')}</Text>
        <Text style={[styles.gridTileCount, { color: colors.textSecondary }]} numberOfLines={2}>{t('kitchen_assistant.save_first_sub')}</Text>
      </View>
    </View>
  );

  // Header chip: owners / managers get the Bar hub's nav sheet (no upload row —
  // recipe scanning is a 1.1 feature); a granted title gets the plain To Editor
  // pill; everyone else gets nothing.
  const navRight = isManager ? (
    <HeaderNavMenu
      label={t('common:to_editor')}
      iconIos="pencil"
      iconAndroid="edit"
      sheetTitle={t('kitchen_assistant.title')}
      actions={[
        {
          key: 'switch',
          label: t('common:to_editor'),
          iosIcon: 'pencil',
          androidIcon: 'edit',
          onPress: () => router.replace('/kitchen-assistant-editor'),
        },
        {
          key: 'cats',
          label: t('menu_sheet.edit_categories'),
          iosIcon: 'square.grid.2x2',
          androidIcon: 'grid-view',
          disabled: !(user?.role === 'owner' || perms.editCategories),
          onPress: () => router.push('/manage-menu-categories' as any),
        },
        {
          key: 'menu',
          label: t('menu_sheet.edit_menu'),
          iosIcon: 'fork.knife',
          androidIcon: 'restaurant-menu',
          onPress: () => router.push('/menu-editor' as any),
        },
      ]}
    />
  ) : canEditKitchen ? (
    <HeaderNavButton
      label={t('common:to_editor')}
      iconIos="pencil"
      iconAndroid="edit"
      onPress={() => router.replace('/kitchen-assistant-editor')}
    />
  ) : undefined;

  const book = (b: KitchenBook) => hub?.books[b] ?? EMPTY_BOOK(b);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('kitchen_assistant.title')}
        rightWide={!!navRight}
        right={navRight}
      />

      {!hub ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* ── Checklist rings ── */}
          {zlabel(t('kitchen_assistant.checklists'))}
          <View style={styles.tileRow}>
            {ringTile({
              iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
              name: t('kitchen_assistant.opening_short'),
              a11y: t('kitchen_assistant.opening_checklist'),
              now: openingIsNow, stat: hub.opening, route: '/kitchen-opening-checklist',
            })}
            {ringTile({
              iconIos: 'clock.fill', iconAndroid: 'schedule',
              name: t('kitchen_assistant.running_short'),
              a11y: t('kitchen_assistant.running_checklist'),
              now: false, stat: hub.running, route: '/kitchen-running-side-work-checklist',
            })}
            {ringTile({
              iconIos: 'moon.fill', iconAndroid: 'nightlight',
              name: t('kitchen_assistant.closing_short'),
              a11y: t('kitchen_assistant.closing_checklist'),
              now: !openingIsNow, stat: hub.closing, route: '/kitchen-closing-checklist',
            })}
          </View>

          {/* ── Saved (the viewer's own folder) — above the books ── */}
          {hub.saved.count > 0 && <View style={styles.savedSpacer}>{savedTile(hub.saved)}</View>}

          {/* ── Recipe books ── */}
          {zlabel(t('kitchen_assistant.recipes_label'))}
          <View style={styles.grid}>
            {gridTile({
              iconIos: organization?.menu_1_icon || 'snowflake',
              iconAndroid: menuIconAndroid(organization?.menu_1_icon || 'snowflake'),
              book: 'menu1', data: book('menu1'),
            })}
            {twoMenus && gridTile({
              iconIos: organization?.menu_2_icon || 'sun.max.fill',
              iconAndroid: menuIconAndroid(organization?.menu_2_icon || 'sun.max.fill'),
              book: 'menu2', data: book('menu2'),
            })}
            {gridTile({ iconIos: 'star.fill', iconAndroid: 'star', book: 'specials', data: book('specials') })}
            {gridTile({ iconIos: 'frying.pan.fill', iconAndroid: 'soup-kitchen', book: 'prep', data: book('prep') })}
            {gridTile({ iconIos: 'birthday.cake.fill', iconAndroid: 'cake', book: 'desserts', data: book('desserts') })}
            {gridTile({ iconIos: 'person.3.fill', iconAndroid: 'groups', book: 'banquets', data: book('banquets') })}
            {hub.saved.count === 0 && saveFirstTile}
          </View>
        </ScrollView>
      )}
      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingBottom: 110,
  },
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
  // Checklist ring tiles — three across (the host hub's tighter geometry).
  tileRow: {
    flexDirection: 'row',
    gap: 9,
  },
  ringTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  ringTileOff: {
    opacity: 0.78,
  },
  ringTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 9,
    minHeight: 16,
  },
  ringTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 12.5,
    flexShrink: 1,
  },
  nowPill: {
    marginLeft: 'auto',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  nowPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7,
    letterSpacing: 0.5,
  },
  ringTileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ringStat: {
    flex: 1,
    minWidth: 0,
  },
  ringLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
  },
  statBig: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
  },
  statSmall: {
    fontFamily: fonts.body.regular,
    fontSize: 9.5,
    marginTop: 1,
  },
  // Saved tile sits 2pt under the rings, above the Recipes label.
  savedSpacer: {
    marginTop: 12,
  },
  // Recipe grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridTile: {
    width: '48.5%',
    minHeight: 104,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 12,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  gridTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  wideTile: {
    width: '100%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wideTileDashed: {
    borderStyle: 'dashed',
    marginBottom: 0,
  },
  wideTileBody: {
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
  },
  gridTileCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    marginTop: 3,
  },
  peekRow: {
    flexDirection: 'row',
  },
  peekThumb: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  peekThumbOverlap: {
    marginLeft: -9,
  },
  peekImage: {
    width: '100%',
    height: '100%',
  },
});
