
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
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import BottomNavBar from '@/components/BottomNavBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { supabase } from '@/app/integrations/supabase/client';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import ProgressRing from '@/components/ProgressRing';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import FormattedText from '@/components/FormattedText';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';

// The s73 Board Mix hub: Featured shelf (✦ across both libation menus) →
// checklist progress rings → the 2×2 recipe launcher grid with photo peeks.
// Every number comes from RPCs the destination pages already call — one
// Promise.all on focus, nothing new server-side.

// Full recipe payload — a Featured tile opens the detail sheet right here on
// the hub (Steve: one tap to the recipe), so no navigation target is needed.
interface FeaturedSip {
  id: string;
  name: string;
  price: string;
  thumbnail_url: string | null;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  procedure_es?: string | null;
}

interface HubData {
  featured: FeaturedSip[];
  m1: { count: number; feat: number; thumbs: string[] };
  m2: { count: number; feat: number; thumbs: string[] };
  az: { count: number; thumbs: string[] };
  mix: { count: number; thumbs: string[] };
  opening: { done: number; total: number };
  closing: { done: number; total: number };
}

const firstThumbs = (rows: { thumbnail_url?: string | null }[] | null | undefined): string[] =>
  (rows || [])
    .map((r) => r.thumbnail_url)
    .filter((u): u is string => !!u)
    .slice(0, 3);

export default function BartenderAssistantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { perms } = useManagerPermissions();
  const isManager = isManagerOrOwner(user);
  const [hub, setHub] = useState<HubData | null>(null);
  const [featuredDetail, setFeaturedDetail] = useState<FeaturedSip | null>(null);
  const [showFeaturedDetail, setShowFeaturedDetail] = useState(false);

  const loadHub = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const [m1R, m2R, azR, mixR, openItems, closeItems, progress] = await Promise.all([
        supabase.rpc('get_libation_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_summer_libation_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_cocktails', { p_actor_id: user.id }),
        supabase.rpc('get_puree_syrup_recipes', { p_actor_id: user.id }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: true, p_checklist_type: 'closing' }),
        supabase.rpc('get_my_checklist_progress', { p_actor_id: user.id, p_bartender: true, p_date: today }),
      ]);

      const m1 = (m1R.data || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const m2 = (m2R.data || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const m1Feat = m1.filter((r: any) => r.is_featured);
      const m2Feat = m2.filter((r: any) => r.is_featured);

      const doneIds = new Set(
        (progress.data || []).filter((p: any) => p.completed).map((p: any) => p.checklist_item_id)
      );
      const countDone = (items: any[] | null | undefined) =>
        (items || []).filter((i) => doneIds.has(i.id)).length;

      setHub({
        featured: [...m1Feat, ...m2Feat].map((r: any) => ({
          id: r.id, name: r.name, price: r.price, thumbnail_url: r.thumbnail_url,
          glassware: r.glassware ?? null, garnish: r.garnish ?? null,
          ingredients: r.ingredients ?? [], procedure: r.procedure ?? null, procedure_es: r.procedure_es ?? null,
        })),
        m1: { count: m1.length, feat: m1Feat.length, thumbs: firstThumbs(m1) },
        m2: { count: m2.length, feat: m2Feat.length, thumbs: firstThumbs(m2) },
        az: { count: (azR.data || []).length, thumbs: firstThumbs(azR.data) },
        mix: { count: (mixR.data || []).length, thumbs: firstThumbs(mixR.data) },
        opening: { done: countDone(openItems.data), total: (openItems.data || []).length },
        closing: { done: countDone(closeItems.data), total: (closeItems.data || []).length },
      });
    } catch (error) {
      // The hub is a launcher first — a failed stats fetch must never block it.
      console.error('Error loading bartender hub data:', error);
      setHub({
        featured: [],
        m1: { count: 0, feat: 0, thumbs: [] }, m2: { count: 0, feat: 0, thumbs: [] },
        az: { count: 0, thumbs: [] }, mix: { count: 0, thumbs: [] },
        opening: { done: 0, total: 0 }, closing: { done: 0, total: 0 },
      });
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHub();
    }, [loadHub])
  );

  const pct = (x: { done: number; total: number }) =>
    x.total > 0 ? Math.round((x.done / x.total) * 100) : 0;

  // Pure client clock: mornings point at Opening, evenings at Closing.
  const openingIsNow = new Date().getHours() < 16;

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
    iconIos: string; iconAndroid: string; name: string; now: boolean;
    stat: { done: number; total: number }; route: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.ringTile,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        !opts.now && styles.ringTileOff,
      ]}
      onPress={() => router.push(opts.route as any)}
      activeOpacity={0.7}
    >
      <View style={styles.ringTileTop}>
        <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={16} color={colors.primary} />
        <Text style={[styles.ringTileName, { color: colors.text }]} numberOfLines={1}>{opts.name}</Text>
        {opts.now && (
          <View style={[styles.nowPill, { backgroundColor: colors.primary }]}>
            <Text style={[styles.nowPillText, { color: colors.fireText }]}>{t('bartender_assistant.now_pill').toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.ringTileFoot}>
        <ProgressRing
          pct={pct(opts.stat)}
          color={colors.primary}
          trackColor={colors.glassBorder}
        >
          <Text style={[styles.ringLabel, { color: pct(opts.stat) > 0 ? colors.primary : colors.textSecondary }]}>
            {pct(opts.stat)}%
          </Text>
        </ProgressRing>
        <View>
          <Text style={[styles.statBig, { color: colors.text }]}>{opts.stat.done} / {opts.stat.total}</Text>
          <Text style={[styles.statSmall, { color: colors.textSecondary }]}>{t('bartender_assistant.done_today')}</Text>
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
      label={t('common:to_editor')}
      iconIos="pencil"
      iconAndroid="edit"
      sheetTitle={t('bartender_assistant.title')}
      actions={[
        {
          key: 'switch',
          label: t('common:to_editor'),
          iosIcon: 'pencil',
          androidIcon: 'edit',
          onPress: () => router.replace('/bartender-assistant-editor'),
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
        title={t('bartender_assistant.title')}
        rightWide={isManager}
        right={isManager ? navMenu : undefined}
      />

      {!hub ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* ── Featured shelf (hides at zero ✦) ── */}
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
                    onPress={() => { setFeaturedDetail(f); setShowFeaturedDetail(true); }}
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

          {/* ── Checklist rings ── */}
          {zlabel(t('bartender_assistant.checklists'))}
          <View style={styles.tileRow}>
            {ringTile({
              iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
              name: t('bartender_assistant.opening_checklist'),
              now: openingIsNow, stat: hub.opening, route: '/bartender-opening-checklist',
            })}
            {ringTile({
              iconIos: 'moon.fill', iconAndroid: 'nightlight',
              name: t('bartender_assistant.closing_checklist'),
              now: !openingIsNow, stat: hub.closing, route: '/bartender-closing-checklist',
            })}
          </View>

          {/* ── Recipe launcher grid ── */}
          {zlabel(t('bartender_assistant.recipes_label'))}
          <View style={styles.grid}>
            {gridTile({
              iconIos: organization?.menu_1_icon || 'snowflake',
              iconAndroid: menuIconAndroid(organization?.menu_1_icon || 'snowflake'),
              name: `${organization?.menu_1_name || 'Winter'} ${t('bartender_assistant.libation_recipes_suffix')}`,
              count: hub.m1.count, feat: hub.m1.feat, thumbs: hub.m1.thumbs,
              route: '/libation-recipes',
            })}
            {gridTile({
              iconIos: organization?.menu_2_icon || 'sun.max.fill',
              iconAndroid: menuIconAndroid(organization?.menu_2_icon || 'sun.max.fill'),
              name: `${organization?.menu_2_name || 'Summer'} ${t('bartender_assistant.libation_recipes_suffix')}`,
              count: hub.m2.count, feat: hub.m2.feat, thumbs: hub.m2.thumbs,
              route: '/summer-libation-recipes',
            })}
            {gridTile({
              iconIos: 'list.bullet', iconAndroid: 'format-list-bulleted',
              name: t('bartender_assistant.cocktails_az'),
              count: hub.az.count, thumbs: hub.az.thumbs,
              route: '/cocktails-az',
            })}
            {gridTile({
              iconIos: 'drop.fill', iconAndroid: 'opacity',
              name: t('bartender_assistant.purees_syrups'),
              count: hub.mix.count, thumbs: hub.mix.thumbs,
              route: '/puree-syrup-recipes',
            })}
          </View>
        </ScrollView>
      )}
      {/* Featured recipe detail — the libation viewers' sheet, served in place. */}
      <GlassHeroSheet
        visible={showFeaturedDetail}
        onClose={() => { setShowFeaturedDetail(false); setFeaturedDetail(null); }}
        hero={featuredDetail?.thumbnail_url ? (
          <>
            <StorageImage
              source={{ uri: featuredDetail.thumbnail_url }}
              style={styles.heroFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(14,11,9,0)', 'rgba(14,11,9,0.92)']}
              locations={[0.42, 0.94]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : undefined}
      >
        <Text style={[styles.detailTitle, { color: colors.text }]}>{featuredDetail?.name}</Text>

        <View style={styles.detailTwoCol}>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.price')}</Text>
            <View style={[styles.pricePill, { backgroundColor: colors.primary }]}>
              <Text style={[styles.pricePillText, { color: colors.fireText }]}>{featuredDetail?.price}</Text>
            </View>
          </View>
          {!!featuredDetail?.glassware && (
            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.glassware')}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{featuredDetail.glassware}</Text>
            </View>
          )}
        </View>

        {!!featuredDetail?.garnish && (
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.garnish')}</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{featuredDetail.garnish}</Text>
          </View>
        )}

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.ingredients')}</Text>
          {featuredDetail?.ingredients && featuredDetail.ingredients.length > 0 ? (
            featuredDetail.ingredients.map((item, index) => (
              <View
                key={index}
                style={[styles.ingredientRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              >
                <Text style={[styles.ingredientAmount, { color: colors.primary }]}>{item.amount}</Text>
                <Text style={[styles.ingredientName, { color: colors.text }]}>{item.ingredient}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.noDataText, { color: colors.textSecondary }]}>{t('libation_recipes.no_ingredients')}</Text>
          )}
        </View>

        {!!featuredDetail?.procedure && (
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.procedure')}</Text>
            <View style={[styles.procedureBox, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <FormattedText style={[styles.procedureText, { color: colors.text }]}>
                {getLocalizedField(featuredDetail, 'procedure', language)}
              </FormattedText>
            </View>
          </View>
        )}
      </GlassHeroSheet>

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
  // Featured shelf
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
  // Checklist ring tiles
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
  ringTileOff: {
    opacity: 0.78,
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
  nowPill: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  nowPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 0.6,
  },
  ringTileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ringLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
  },
  statBig: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
  },
  statSmall: {
    fontFamily: fonts.body.regular,
    fontSize: 10.5,
    marginTop: 2,
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
  // Featured detail sheet — the libation viewers' vocabulary.
  heroFill: {
    width: '100%',
    height: '100%',
  },
  detailTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    marginTop: 12,
    marginBottom: 10,
  },
  detailTwoCol: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  detailCol: {
    flex: 1,
  },
  detailSection: {
    marginBottom: 8,
  },
  detailLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  detailValue: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  pricePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pricePillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 7,
  },
  ingredientAmount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    minWidth: 64,
  },
  ingredientName: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    flex: 1,
  },
  noDataText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    fontStyle: 'italic',
  },
  procedureBox: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 13,
  },
  procedureText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 22,
  },
});
