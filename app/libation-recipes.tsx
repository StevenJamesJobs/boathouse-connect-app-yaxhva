
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import FormattedText from '@/components/FormattedText';
import { StorageImage } from '@/components/StorageImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { cocktailFedSubOptions, resolveRecipeSubId } from '@/utils/menuCategoryLabels';
import { isManagerOrOwner } from '@/utils/roles';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import { fonts } from '@/constants/fonts';

interface LibationRecipe {
  id: string;
  name: string;
  price: string;
  category: string;
  subcategory_id: string | null;
  is_featured: boolean;
  glassware: string | null;
  garnish: string | null;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  procedure_es?: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

type LibationRow = Database['public']['Functions']['get_libation_recipes']['Returns'][number];

// Placeholder image for recipes without thumbnails
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

const HERO_HEIGHT = 172;

export default function LibationRecipesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { user } = useAuth();
  const isManager = isManagerOrOwner(user);
  const { perms } = useManagerPermissions();
  // Menu 1 → slot 1 in per-menu scope (shared scope ignores the slot).
  const { categories: menuCats } = useMenuCategories({ includeHidden: true, menuSlot: 1 });
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<LibationRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  // Featured hero pager: measured width (full-bleed pages) + active dot.
  const [heroW, setHeroW] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_libation_recipes', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading libation recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      setRecipes(sorted as (LibationRow & { ingredients: { amount: string; ingredient: string }[] })[]);
    } catch (error) {
      console.error('Error loading libation recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (recipe: LibationRecipe) => {
    setSelectedRecipe(recipe);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedRecipe(null);
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    return url;
  };

  const getCategoryLabel = (category: string) => {
    const map: Record<string, string> = {
      'Featured': t('libation_recipes.featured'),
      'Signature Cocktails': t('libation_recipes.signature_cocktails'),
      'Martinis': t('libation_recipes.martinis'),
      'Sangrias': t('libation_recipes.sangrias'),
      'Low ABV': t('libation_recipes.low_abv'),
      'No ABV': t('libation_recipes.no_abv'),
    };
    return map[category] ?? category;
  };

  // Search across name, ingredients, glassware and garnish (shelves with no
  // matches disappear; the hero reflects the filter too).
  const query = searchQuery.trim().toLowerCase();
  const visibleRecipes = query
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        (r.glassware || '').toLowerCase().includes(query) ||
        (r.garnish || '').toLowerCase().includes(query) ||
        (r.ingredients || []).some((i) => (i.ingredient || '').toLowerCase().includes(query))
      )
    : recipes;

  // Group recipes under their bound cocktail-fed subcategory (current names, in
  // the menu's subcategory order); featured recipes pin to the top of each group.
  const cocktailSubOptions = cocktailFedSubOptions(menuCats, t);
  const recipesByCategory: Record<string, LibationRecipe[]> = {};
  const groupedIds = new Set<string>();
  for (const opt of cocktailSubOptions) {
    const subRecipes = visibleRecipes
      .filter((r) => resolveRecipeSubId(menuCats, r) === opt.id)
      .sort((a, b) => (Number(b.is_featured) - Number(a.is_featured)) || (a.display_order - b.display_order));
    if (subRecipes.length > 0) {
      recipesByCategory[opt.label] = subRecipes;
      subRecipes.forEach((r) => groupedIds.add(r.id));
    }
  }
  for (const r of visibleRecipes) {
    if (groupedIds.has(r.id)) continue;
    // Featured-only recipes (added straight to Featured in the editor — no
    // subcategory) live in the hero alone; a leftover "Featured" shelf would
    // just duplicate it.
    if (r.category === 'Featured' && r.is_featured) continue;
    const key = getCategoryLabel(r.category || 'Other');
    (recipesByCategory[key] ||= []).push(r);
  }

  // The Featured hero gathers ✦ recipes across every group (s73 Shelf Flow).
  // Zero featured → the hero and its label don't mount and the first shelf
  // starts the page.
  const featuredRecipes = visibleRecipes.filter((r) => r.is_featured);
  const heroPage = Math.min(heroIdx, Math.max(0, featuredRecipes.length - 1));

  const shelfLabel = (label: string, count: number) => (
    <View style={styles.shelfLabelRow}>
      <Text style={[styles.shelfLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.shelfLabelLine, { backgroundColor: colors.border + '55' }]} />
      <Text style={[styles.shelfLabelCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );

  const tileScrim = (
    <LinearGradient
      colors={['transparent', 'rgba(8,10,14,0.30)', 'rgba(8,10,14,0.84)']}
      style={styles.tileScrim}
    />
  );

  const featuredPill = (
    <View style={styles.featuredPill}>
      <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={9} color="#1A1E24" />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('libation_recipes.title')}
        rightWide={isManager}
        right={isManager ? (
          <HeaderNavMenu
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            sheetTitle={t('libation_recipes.title')}
            actions={[
              {
                key: 'switch',
                label: t('common:to_editor'),
                iosIcon: 'pencil',
                androidIcon: 'edit',
                onPress: () => router.replace('/libation-recipes-editor'),
              },
              {
                key: 'cats',
                label: t('menu_sheet.edit_categories'),
                iosIcon: 'square.grid.2x2',
                androidIcon: 'grid-view',
                disabled: !(user?.role === 'owner' || perms.editCategories),
                onPress: () => router.push({ pathname: '/manage-menu-categories', params: { cat: 'cat.libations', slot: '1' } } as any),
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
        ) : undefined}
      />

      {/* Search — same geometry and position as the editor side. */}
      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={colors.textSecondary}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('libation_recipes.search_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {Object.keys(recipesByCategory).length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="wineglass"
                android_material_icon_name="local-bar"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {query ? t('cocktails.no_results') : t('libation_recipes.no_recipes')}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {query ? t('cocktails.no_results_hint') : t('libation_recipes.check_back')}
              </Text>
            </View>
          ) : (
            <>
              {/* ── Featured hero (only when ✦ recipes exist) ── */}
              {featuredRecipes.length > 0 && (
                <>
                  {shelfLabel(t('libation_recipes.featured'), featuredRecipes.length)}
                  <View onLayout={(e) => setHeroW(e.nativeEvent.layout.width)}>
                    {heroW > 0 && (
                      <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) =>
                          setHeroIdx(Math.round(e.nativeEvent.contentOffset.x / heroW))
                        }
                      >
                        {featuredRecipes.map((recipe) => (
                          <TouchableOpacity
                            key={recipe.id}
                            style={[styles.heroCard, { width: heroW, borderColor: colors.glassBorder }]}
                            onPress={() => openDetailModal(recipe)}
                            activeOpacity={0.85}
                          >
                            <StorageImage
                              source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                              style={styles.heroImage}
                              resizeMode="cover"
                            />
                            {tileScrim}
                            {featuredPill}
                            <View style={styles.heroMeta}>
                              <Text style={styles.heroName} numberOfLines={1}>{recipe.name}</Text>
                              <Text style={styles.heroPrice}>{recipe.price}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                  {featuredRecipes.length > 1 && (
                    <View style={styles.heroDots}>
                      {featuredRecipes.map((r, i) => (
                        <View
                          key={r.id}
                          style={[
                            styles.heroDot,
                            { backgroundColor: colors.border + '66' },
                            i === heroPage && [styles.heroDotOn, { backgroundColor: colors.primary }],
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* ── One shelf per subcategory ── */}
              {Object.entries(recipesByCategory).map(([category, categoryRecipes]) => (
                <React.Fragment key={category}>
                  {shelfLabel(category, categoryRecipes.length)}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.shelfContent}
                    style={styles.shelf}
                  >
                    {categoryRecipes.map((recipe) => (
                      <TouchableOpacity
                        key={recipe.id}
                        style={[styles.tile, { borderColor: colors.glassBorder }]}
                        onPress={() => openDetailModal(recipe)}
                        activeOpacity={0.85}
                      >
                        <StorageImage
                          source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                          style={styles.tileImage}
                          resizeMode="cover"
                        />
                        {tileScrim}
                        {recipe.is_featured && featuredPill}
                        <View style={styles.tileMeta}>
                          <Text style={styles.tileName} numberOfLines={2}>{recipe.name}</Text>
                          <Text style={styles.tilePrice}>{recipe.price}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </React.Fragment>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Recipe detail sheet — hero photo flush to the top edge, the
          MenuItemDetailSheet continuity (Steve's smoke call). */}
      <GlassHeroSheet
        visible={showDetailModal}
        onClose={closeDetailModal}
        hero={selectedRecipe?.thumbnail_url ? (
          <>
            <StorageImage
              source={{ uri: getImageUrl(selectedRecipe.thumbnail_url) }}
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
        <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedRecipe?.name}</Text>

        <View style={styles.detailTwoCol}>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.price')}</Text>
            <View style={[styles.pricePill, { backgroundColor: colors.primary }]}>
              <Text style={[styles.pricePillText, { color: colors.fireText }]}>{selectedRecipe?.price}</Text>
            </View>
          </View>
          {!!selectedRecipe?.glassware && (
            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.glassware')}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{selectedRecipe.glassware}</Text>
            </View>
          )}
        </View>

        {!!selectedRecipe?.garnish && (
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.garnish')}</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{selectedRecipe.garnish}</Text>
          </View>
        )}

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.ingredients')}</Text>
          {selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0 ? (
            selectedRecipe.ingredients.map((item, index) => (
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

        {!!selectedRecipe?.procedure && (
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('libation_recipes.procedure')}</Text>
            <View style={[styles.procedureBox, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <FormattedText style={[styles.procedureText, { color: colors.text }]}>
                {getLocalizedField(selectedRecipe, 'procedure', language)}
              </FormattedText>
            </View>
          </View>
        )}
      </GlassHeroSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    marginTop: 14,
  },
  emptySubtext: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  // Shelf label — the mono zlabel rhythm (label · hairline · count).
  shelfLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  shelfLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  shelfLabelLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  shelfLabelCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  // Featured hero pager
  heroCard: {
    height: HERO_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    backgroundColor: '#1C2026',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  heroName: {
    fontFamily: fonts.display.bold,
    fontSize: 19,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  heroPrice: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12.5,
    color: '#FFB07A',
  },
  heroDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroDotOn: {
    width: 16,
  },
  // Shelves
  shelf: {
    marginHorizontal: -2,
  },
  shelfContent: {
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  tile: {
    width: RECIPE_TILE_SIZE,
    aspectRatio: 1,
    borderRadius: 13,
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#1C2026',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  tileMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 9,
    paddingBottom: 8,
  },
  // Scrim text = fixed-dark literals (white + #FFB07A), the rulebook's ember rule.
  tileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tilePrice: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    color: '#FFB07A',
  },
  featuredPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB07A',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    zIndex: 3,
  },
  // Detail sheet — the hero box/radii come from GlassHeroSheet; this just
  // fills it.
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
