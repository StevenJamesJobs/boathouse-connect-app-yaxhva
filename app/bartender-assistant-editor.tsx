
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
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import BottomNavBar from '@/components/BottomNavBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { supabase } from '@/app/integrations/supabase/client';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import ProgressRing from '@/components/ProgressRing';
import { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';

// The s73 Board Mix hub, editor face: same shelf/tiles/grid geometry as the
// user side so the To User flip never moves anything — the rings carry CONTENT
// stats here (items + categories) instead of personal progress, and every tap
// lands on the editor surfaces.

interface FeaturedSip {
  id: string;
  name: string;
  price: string;
  thumbnail_url: string | null;
  route: '/libation-recipes-editor' | '/summer-libation-recipes-editor';
}

interface HubData {
  featured: FeaturedSip[];
  m1: { count: number; feat: number; thumbs: string[] };
  m2: { count: number; feat: number; thumbs: string[] };
  az: { count: number; thumbs: string[] };
  mix: { count: number; thumbs: string[] };
  opening: { items: number; cats: number };
  closing: { items: number; cats: number };
}

const firstThumbs = (rows: { thumbnail_url?: string | null }[] | null | undefined): string[] =>
  (rows || [])
    .map((r) => r.thumbnail_url)
    .filter((u): u is string => !!u)
    .slice(0, 3);

export default function BartenderAssistantEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { perms } = useManagerPermissions();
  const [hub, setHub] = useState<HubData | null>(null);

  const loadHub = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [m1R, m2R, azR, mixR, openItems, closeItems, openCats, closeCats] = await Promise.all([
        supabase.rpc('get_libation_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_summer_libation_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_cocktails', { p_actor_id: user.id }),
        supabase.rpc('get_puree_syrup_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'closing' }),
        supabase.rpc('get_checklist_categories', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_categories', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'closing' }),
      ]);

      const m1 = (m1R.data || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const m2 = (m2R.data || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const m1Feat = m1.filter((r: any) => r.is_featured);
      const m2Feat = m2.filter((r: any) => r.is_featured);

      setHub({
        featured: [
          ...m1Feat.map((r: any) => ({ id: r.id, name: r.name, price: r.price, thumbnail_url: r.thumbnail_url, route: '/libation-recipes-editor' as const })),
          ...m2Feat.map((r: any) => ({ id: r.id, name: r.name, price: r.price, thumbnail_url: r.thumbnail_url, route: '/summer-libation-recipes-editor' as const })),
        ],
        m1: { count: m1.length, feat: m1Feat.length, thumbs: firstThumbs(m1) },
        m2: { count: m2.length, feat: m2Feat.length, thumbs: firstThumbs(m2) },
        az: { count: (azR.data || []).length, thumbs: firstThumbs(azR.data) },
        mix: { count: (mixR.data || []).length, thumbs: firstThumbs(mixR.data) },
        opening: { items: (openItems.data || []).length, cats: (openCats.data || []).length },
        closing: { items: (closeItems.data || []).length, cats: (closeCats.data || []).length },
      });
    } catch (error) {
      // The hub is a launcher first — a failed stats fetch must never block it.
      console.error('Error loading bartender editor hub data:', error);
      setHub({
        featured: [],
        m1: { count: 0, feat: 0, thumbs: [] }, m2: { count: 0, feat: 0, thumbs: [] },
        az: { count: 0, thumbs: [] }, mix: { count: 0, thumbs: [] },
        opening: { items: 0, cats: 0 }, closing: { items: 0, cats: 0 },
      });
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHub();
    }, [loadHub])
  );

  const zlabel = (label: string, count?: number) => (
    <View style={styles.zlabelRow}>
      <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
      {count !== undefined && (
        <Text style={[styles.zlabel, { color: colors.textSecondary }]}>{count}</Text>
      )}
    </View>
  );

  const ringTile = (opts: {
    iconIos: string; iconAndroid: string; name: string;
    stat: { items: number; cats: number }; route: string;
  }) => (
    <TouchableOpacity
      style={[styles.ringTile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => router.push(opts.route as any)}
      activeOpacity={0.7}
    >
      <View style={styles.ringTileTop}>
        <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={16} color={colors.primary} />
        <Text style={[styles.ringTileName, { color: colors.text }]} numberOfLines={1}>{opts.name}</Text>
      </View>
      <View style={styles.ringTileFoot}>
        <ProgressRing
          pct={100}
          color={colors.primary}
          trackColor={colors.glassBorder}
        >
          <Text style={[styles.ringLabel, { color: colors.primary }]}>{opts.stat.items}</Text>
        </ProgressRing>
        <View>
          <Text style={[styles.statBig, { color: colors.text }]}>{t('checklist_editor:items_count', { count: opts.stat.items })}</Text>
          <Text style={[styles.statSmall, { color: colors.textSecondary }]}>{t('bartender_assistant.categories_count', { count: opts.stat.cats })}</Text>
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

  const gridTile = (opts: {
    iconIos: string; iconAndroid: string; name: string;
    count: number; feat?: number; thumbs: string[]; route: string;
  }) => (
    <TouchableOpacity
      style={[styles.gridTile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={() => router.push(opts.route as any)}
      activeOpacity={0.7}
    >
      <View style={styles.gridTileTop}>
        <View style={[styles.iconChip, { backgroundColor: colors.primary + '21' }]}>
          <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={18} color={colors.primary} />
        </View>
        {peekRow(opts.thumbs)}
      </View>
      <View>
        <Text style={[styles.gridTileName, { color: colors.text }]} numberOfLines={2}>{opts.name}</Text>
        <Text style={[styles.gridTileCount, { color: colors.textSecondary }]} numberOfLines={1}>
          {t('bartender_assistant.recipes_count', { count: opts.count })}
          {!!opts.feat && <Text style={{ color: colors.primary }}>{'  ·  '}{opts.feat} ✦</Text>}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const navMenu = (
    <HeaderNavMenu
      label={t('common:to_user')}
      iconIos="person.fill"
      iconAndroid="person"
      sheetTitle={t('bartender_assistant_editor.title')}
      actions={[
        {
          key: 'switch',
          label: t('common:to_user'),
          iosIcon: 'person.fill',
          androidIcon: 'person',
          onPress: () => router.replace('/bartender-assistant'),
        },
        {
          key: 'cats',
          label: t('menu_sheet.edit_categories'),
          iosIcon: 'square.grid.2x2',
          androidIcon: 'grid-view',
          disabled: !(user?.role === 'owner' || perms.editCategories),
          onPress: () => router.push({ pathname: '/manage-menu-categories', params: { cat: 'cat.libations' } } as any),
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
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('bartender_assistant_editor.title')}
        rightWide
        right={navMenu}
      />

      {!hub ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* ── Featured shelf (hides at zero ✦; taps land in the editors) ── */}
          {hub.featured.length > 0 && (
            <>
              {zlabel(t('bartender_assistant.featured_tonight'), hub.featured.length)}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.shelf}
                contentContainerStyle={styles.shelfContent}
              >
                {hub.featured.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.featTile, { borderColor: colors.glassBorder, backgroundColor: colors.thumbPlaceholder }]}
                    onPress={() => router.push(f.route as any)}
                    activeOpacity={0.85}
                  >
                    {!!f.thumbnail_url && (
                      <StorageImage source={{ uri: f.thumbnail_url }} style={styles.featImage} resizeMode="cover" />
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(8,10,14,0.32)', 'rgba(8,10,14,0.86)']}
                      style={styles.featScrim}
                    />
                    <View style={styles.featStar}>
                      <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color="#1A1E24" />
                    </View>
                    <View style={styles.featMeta}>
                      <Text style={styles.featName} numberOfLines={2}>{f.name}</Text>
                      <Text style={styles.featPrice}>{f.price}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Checklist editors ── */}
          {zlabel(t('bartender_assistant.checklists'))}
          <View style={styles.tileRow}>
            {ringTile({
              iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
              name: t('bartender_assistant_editor.opening_checklist_editor'),
              stat: hub.opening, route: '/bartender-opening-checklist-editor',
            })}
            {ringTile({
              iconIos: 'moon.fill', iconAndroid: 'nightlight',
              name: t('bartender_assistant_editor.closing_checklist_editor'),
              stat: hub.closing, route: '/bartender-closing-checklist-editor',
            })}
          </View>

          {/* ── Recipe editor grid ── */}
          {zlabel(t('bartender_assistant.recipes_label'))}
          <View style={styles.grid}>
            {gridTile({
              iconIos: organization?.menu_1_icon || 'snowflake',
              iconAndroid: menuIconAndroid(organization?.menu_1_icon || 'snowflake'),
              name: `${organization?.menu_1_name || 'Winter'} ${t('bartender_assistant_editor.libation_recipes_editor_suffix')}`,
              count: hub.m1.count, feat: hub.m1.feat, thumbs: hub.m1.thumbs,
              route: '/libation-recipes-editor',
            })}
            {gridTile({
              iconIos: organization?.menu_2_icon || 'sun.max.fill',
              iconAndroid: menuIconAndroid(organization?.menu_2_icon || 'sun.max.fill'),
              name: `${organization?.menu_2_name || 'Summer'} ${t('bartender_assistant_editor.libation_recipes_editor_suffix')}`,
              count: hub.m2.count, feat: hub.m2.feat, thumbs: hub.m2.thumbs,
              route: '/summer-libation-recipes-editor',
            })}
            {gridTile({
              iconIos: 'list.bullet', iconAndroid: 'format-list-bulleted',
              name: t('bartender_assistant_editor.cocktails_az_editor'),
              count: hub.az.count, thumbs: hub.az.thumbs,
              route: '/cocktails-az-editor',
            })}
            {gridTile({
              iconIos: 'drop.fill', iconAndroid: 'opacity',
              name: t('bartender_assistant_editor.purees_syrups_editor'),
              count: hub.mix.count, thumbs: hub.mix.thumbs,
              route: '/puree-syrup-recipes-editor',
            })}
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
  shelf: {
    marginHorizontal: -2,
  },
  shelfContent: {
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  // Same footprint as the recipe-shelf tiles (Steve: the shelf should read as
  // the same cards, promoted).
  featTile: {
    width: RECIPE_TILE_SIZE,
    height: RECIPE_TILE_SIZE,
    borderRadius: 13,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  featImage: {
    width: '100%',
    height: '100%',
  },
  featScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  // Scrim/pill text = fixed-dark literals (the rulebook's ember rule).
  featStar: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFB07A',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2.5,
  },
  featMeta: {
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 8,
  },
  featName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
  },
  featPrice: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    color: '#FFB07A',
    marginTop: 1,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ringTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 13,
  },
  ringTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  ringTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13,
    flexShrink: 1,
  },
  ringTileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ringLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
  },
  statBig: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12.5,
  },
  statSmall: {
    fontFamily: fonts.body.regular,
    fontSize: 10.5,
    marginTop: 2,
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
