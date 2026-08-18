
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
import { isManagerOrOwner } from '@/utils/roles';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import { RECIPE_TILE_SIZE } from '@/components/RecipeGridCard';
import { fonts } from '@/constants/fonts';

interface PureeSyrupRecipe {
  id: string;
  name: string;
  category: string;
  ingredients: { amount: string; ingredient: string }[];
  procedure: string | null;
  procedure_es?: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

type PureeSyrupRow = Database['public']['Functions']['get_puree_syrup_recipes']['Returns'][number];

// The built-in categories keep their canonical EN values in the DB; owners can
// also mint custom category strings from the editor's picker (s73), so the
// grouping below appends any non-built-in categories after these.
const CATEGORIES = ['Purees', 'Simple Syrups'];

// Placeholder image for recipes without thumbnails
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1587049352846-4a222e784acc?w=400&h=400&fit=crop';

export default function PureeSyrupRecipesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { user } = useAuth();
  const isManager = isManagerOrOwner(user);
  const { perms } = useManagerPermissions();
  const [recipes, setRecipes] = useState<PureeSyrupRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<PureeSyrupRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_puree_syrup_recipes', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading puree syrup recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      setRecipes(sorted as (PureeSyrupRow & { ingredients: { amount: string; ingredient: string }[] })[]);
    } catch (error) {
      console.error('Error loading puree syrup recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (recipe: PureeSyrupRecipe) => {
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
      'Purees': t('purees_syrups.purees'),
      'Simple Syrups': t('purees_syrups.simple_syrups'),
    };
    return map[category] ?? category;
  };

  // Search across name and ingredients (shelves with no matches disappear).
  const query = searchQuery.trim().toLowerCase();
  const visibleRecipes = query
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        (r.ingredients || []).some((i) => (i.ingredient || '').toLowerCase().includes(query))
      )
    : recipes;

  // Group into shelves: built-in categories first (canonical order), then any
  // custom categories in the order they appear.
  const shelfOrder: string[] = [...CATEGORIES];
  for (const r of visibleRecipes) {
    const cat = r.category || 'Other';
    if (!shelfOrder.includes(cat)) shelfOrder.push(cat);
  }
  const recipesByCategory: Record<string, PureeSyrupRecipe[]> = {};
  for (const cat of shelfOrder) {
    const catRecipes = visibleRecipes.filter((r) => (r.category || 'Other') === cat);
    if (catRecipes.length > 0) recipesByCategory[cat] = catRecipes;
  }

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('purees_syrups.title')}
        rightWide={isManager}
        right={isManager ? (
          <HeaderNavMenu
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            sheetTitle={t('purees_syrups.title')}
            actions={[
              {
                key: 'switch',
                label: t('common:to_editor'),
                iosIcon: 'pencil',
                androidIcon: 'edit',
                onPress: () => router.replace('/puree-syrup-recipes-editor'),
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
            placeholder={t('purees_syrups.search_placeholder')}
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
                ios_icon_name="drop.fill"
                android_material_icon_name="opacity"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {query ? t('cocktails.no_results') : t('purees_syrups.no_recipes')}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {query ? t('cocktails.no_results_hint') : t('purees_syrups.check_back')}
              </Text>
            </View>
          ) : (
            Object.entries(recipesByCategory).map(([category, categoryRecipes]) => (
              <React.Fragment key={category}>
                {shelfLabel(getCategoryLabel(category), categoryRecipes.length)}
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
                      <View style={styles.tileMeta}>
                        <Text style={styles.tileName} numberOfLines={2}>{recipe.name}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      {/* Recipe detail sheet — hero photo flush to the top edge (the
          MenuItemDetailSheet continuity). */}
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

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('purees_syrups.ingredients')}</Text>
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
            <Text style={[styles.noDataText, { color: colors.textSecondary }]}>{t('purees_syrups.no_ingredients')}</Text>
          )}
        </View>

        {!!selectedRecipe?.procedure && (
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('purees_syrups.procedure')}</Text>
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
  // Scrim text = fixed-dark literal (white), the rulebook's ember rule.
  tileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 13.5,
    lineHeight: 16.5,
    color: '#FFFFFF',
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
