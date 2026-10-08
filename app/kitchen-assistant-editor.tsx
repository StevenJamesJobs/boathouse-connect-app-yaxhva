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
import { useRequireEditorRoute } from '@/hooks/useRequireEditorRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import ProgressRing from '@/components/ProgressRing';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';
import {
  fetchKitchenHub,
  kitchenBookTitle,
  type KitchenBook,
  type KitchenHubBook,
} from '@/hooks/useKitchenRecipes';

// s91 — the Kitchen Assistant hub, editor face. Same rings / grid geometry as
// the user side so the To User flip never moves anything; the rings carry
// CONTENT stats (items + categories) instead of personal progress, every tile
// lands on the editor surface, and the gold "need recipes" tail always shows.
// No Saved tiles: saves are personal, the editor is the kitchen's.

// The "needs a recipe" gold — the Menu kit's SPECIAL_GOLD (components/MenuItemCards).
const NEEDS_GOLD = { dark: '#F5B942', light: '#B7791F' } as const;

interface ContentStat {
  items: number;
  cats: number;
}

interface HubData {
  books: Partial<Record<KitchenBook, KitchenHubBook>>;
  opening: ContentStat;
  running: ContentStat;
  closing: ContentStat;
}

const EMPTY_STAT: ContentStat = { items: 0, cats: 0 };
const EMPTY_BOOK = (book: KitchenBook): KitchenHubBook => ({ book, total: 0, needs: 0, thumbs: [] });

export default function KitchenAssistantEditorScreen() {
  useRequireEditorRoute('kitchen');
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const gold = mode === 'dark' ? NEEDS_GOLD.dark : NEEDS_GOLD.light;
  const [hub, setHub] = useState<HubData | null>(null);

  const twoMenus = organization?.menu_count === 2;

  const loadHub = useCallback(async () => {
    if (!user?.id) return;
    try {
      const kitchen = { p_actor_id: user.id, p_bartender: false, p_kind: 'kitchen' };
      const [books, openItems, runItems, closeItems, openCats, runCats, closeCats] = await Promise.all([
        fetchKitchenHub(user.id),
        supabase.rpc('get_checklist_items', { ...kitchen, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { ...kitchen, p_checklist_type: 'running_side_work' }),
        supabase.rpc('get_checklist_items', { ...kitchen, p_checklist_type: 'closing' }),
        supabase.rpc('get_checklist_categories', { ...kitchen, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_categories', { ...kitchen, p_checklist_type: 'running_side_work' }),
        supabase.rpc('get_checklist_categories', { ...kitchen, p_checklist_type: 'closing' }),
      ]);

      const byBook: Partial<Record<KitchenBook, KitchenHubBook>> = {};
      for (const b of books) byBook[b.book] = b;

      setHub({
        books: byBook,
        opening: { items: (openItems.data || []).length, cats: (openCats.data || []).length },
        running: { items: (runItems.data || []).length, cats: (runCats.data || []).length },
        closing: { items: (closeItems.data || []).length, cats: (closeCats.data || []).length },
      });
    } catch (error) {
      // The hub is a launcher first — a failed stats fetch must never block it.
      console.error('Error loading kitchen editor hub data:', error);
      setHub({ books: {}, opening: EMPTY_STAT, running: EMPTY_STAT, closing: EMPTY_STAT });
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHub();
    }, [loadHub])
  );

  const openBook = (book: KitchenBook) =>
    router.push({ pathname: '/kitchen-recipes', params: { book, editor: '1' } } as any);

  const zlabel = (label: string) => (
    <View style={styles.zlabelRow}>
      <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
    </View>
  );

  const ringTile = (opts: {
    iconIos: string; iconAndroid: string; name: string; a11y: string;
    stat: ContentStat; route: string;
  }) => (
    <TouchableOpacity
      style={[styles.ringTile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => router.push(opts.route as any)}
      activeOpacity={0.7}
      accessibilityLabel={opts.a11y}
    >
      <View style={styles.ringTileTop}>
        <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={15} color={colors.primary} />
        <Text style={[styles.ringTileName, { color: colors.text }]} numberOfLines={1}>{opts.name}</Text>
      </View>
      <View style={styles.ringTileFoot}>
        <ProgressRing
          pct={100}
          size={40}
          stroke={4}
          color={colors.primary}
          trackColor={colors.glassBorder}
        >
          <Text style={[styles.ringLabel, { color: colors.primary }]}>{opts.stat.items}</Text>
        </ProgressRing>
        <View style={styles.ringStat}>
          <Text style={[styles.statBig, { color: colors.text }]} numberOfLines={1}>
            {t('checklist_editor:items_count', { count: opts.stat.items })}
          </Text>
          <Text style={[styles.statSmall, { color: colors.textSecondary }]} numberOfLines={2}>
            {t('bartender_assistant.categories_count', { count: opts.stat.cats })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={[styles.gridTileCount, { color: colors.textSecondary }]} numberOfLines={2}>
          {t('kitchen_assistant.recipes_count', { count: opts.data.total })}
          {opts.data.needs > 0 && (
            <Text style={{ color: gold }}>{'  ·  '}{t('kitchen_assistant.needs_count', { count: opts.data.needs })}</Text>
          )}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const book = (b: KitchenBook) => hub?.books[b] ?? EMPTY_BOOK(b);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('kitchen_assistant_editor.title')}
        rightWide
        right={
          <HeaderNavButton
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            onPress={() => router.replace('/kitchen-assistant')}
          />
        }
      />

      {!hub ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* ── Checklist editors ── */}
          {zlabel(t('kitchen_assistant.checklists'))}
          <View style={styles.tileRow}>
            {ringTile({
              iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
              name: t('kitchen_assistant.opening_short'),
              a11y: t('kitchen_assistant.opening_checklist'),
              stat: hub.opening, route: '/kitchen-opening-checklist-editor',
            })}
            {ringTile({
              iconIos: 'clock.fill', iconAndroid: 'schedule',
              name: t('kitchen_assistant.running_short'),
              a11y: t('kitchen_assistant.running_checklist'),
              stat: hub.running, route: '/kitchen-running-side-work-checklist-editor',
            })}
            {ringTile({
              iconIos: 'moon.fill', iconAndroid: 'nightlight',
              name: t('kitchen_assistant.closing_short'),
              a11y: t('kitchen_assistant.closing_checklist'),
              stat: hub.closing, route: '/kitchen-closing-checklist-editor',
            })}
          </View>

          {/* ── Recipe books (editor) ── */}
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
          </View>
        </ScrollView>
      )}
      <BottomNavBar activeTab="manage" />
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
    fontSize: 11,
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
