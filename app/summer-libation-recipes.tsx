
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import FormattedText from '@/components/FormattedText';
import { StorageImage } from '@/components/StorageImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { cocktailFedSubOptions, resolveRecipeSubId } from '@/utils/menuCategoryLabels';

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

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop';

export default function SummerLibationRecipesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  // Menu 2 → slot 2 in per-menu scope (shared scope ignores the slot).
  const { categories: menuCats } = useMenuCategories({ includeHidden: true, menuSlot: 2 });
  const [recipes, setRecipes] = useState<LibationRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<LibationRecipe | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [scrollY] = useState(new Animated.Value(0));

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_summer_libation_recipes', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading summer libation recipes:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      setRecipes(sorted as any);
    } catch (error) {
      console.error('Error loading summer libation recipes:', error);
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
    setTimeout(() => {
      setSelectedRecipe(null);
      scrollY.setValue(0);
    }, 300);
  };

  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const dragDismissing = useRef(false);
  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) modalTranslateY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD) {
          dragDismissing.current = true;
          Animated.timing(modalTranslateY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(() => {
            closeDetailModal();
          });
        } else {
          Animated.spring(modalTranslateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        }
      },
    })
  ).current;

  const handleBackPress = () => {
    router.back();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return PLACEHOLDER_IMAGE;
    return url;
  };

  const getCategoryLabel = (category: string) => {
    const map: Record<string, string> = {
      'Featured': t('summer_libation_recipes.featured'),
      'Signature Cocktails': t('summer_libation_recipes.signature_cocktails'),
      'Martinis': t('summer_libation_recipes.martinis'),
      'Sangrias': t('summer_libation_recipes.sangrias'),
      'Low ABV': t('summer_libation_recipes.low_abv'),
      'No ABV': t('summer_libation_recipes.no_abv'),
    };
    return map[category] ?? category;
  };

  // Group recipes under their bound cocktail-fed subcategory (current names, in
  // the menu's subcategory order); featured recipes pin to the top of each group.
  const cocktailSubOptions = cocktailFedSubOptions(menuCats, t);
  const recipesByCategory: Record<string, LibationRecipe[]> = {};
  const groupedIds = new Set<string>();
  for (const opt of cocktailSubOptions) {
    const subRecipes = recipes
      .filter((r) => resolveRecipeSubId(menuCats, r) === opt.id)
      .sort((a, b) => (Number(b.is_featured) - Number(a.is_featured)) || (a.display_order - b.display_order));
    if (subRecipes.length > 0) {
      recipesByCategory[opt.label] = subRecipes;
      subRecipes.forEach((r) => groupedIds.add(r.id));
    }
  }
  for (const r of recipes) {
    if (groupedIds.has(r.id)) continue;
    const key = r.category || 'Other';
    (recipesByCategory[key] ||= []).push(r);
  }

  const imageOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0.3],
    extrapolate: 'clamp',
  });

  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('summer_libation_recipes.title')}</Text>
        <View style={styles.backButton} />
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
                ios_icon_name="sun.max.fill"
                android_material_icon_name="wb-sunny"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>{t('summer_libation_recipes.no_recipes')}</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {t('summer_libation_recipes.check_back')}
              </Text>
            </View>
          ) : (
            Object.entries(recipesByCategory).map(([category, categoryRecipes], categoryIndex) => (
              <React.Fragment key={categoryIndex}>
                <Text style={[styles.categoryTitle, { color: colors.text }]}>{category}</Text>

                <View style={styles.tilesContainer}>
                  {categoryRecipes.map((recipe, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.recipeTile}
                      onPress={() => openDetailModal(recipe)}
                      activeOpacity={0.8}
                    >
                      <StorageImage
                        source={{ uri: getImageUrl(recipe.thumbnail_url) }}
                        style={styles.tileImage}
                        resizeMode="cover"
                      />
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileName} numberOfLines={2}>
                          {recipe.name}
                        </Text>
                        <Text style={styles.tilePrice}>{recipe.price}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={showDetailModal}
        animationType={dragDismissing.current ? 'none' : 'slide'}
        transparent={true}
        onRequestClose={closeDetailModal}
        onShow={() => {
          modalTranslateY.setValue(0);
          dragDismissing.current = false;
        }}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeDetailModal}
          />
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: modalTranslateY }] }]}>
            <View {...modalPanResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeDetailModal}
              activeOpacity={0.7}
            >
              <View style={styles.closeButtonCircle}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={20}
                  color="#FFFFFF"
                />
              </View>
            </TouchableOpacity>

            <Animated.ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )}
            >
              {selectedRecipe?.thumbnail_url && (
                <Animated.View
                  style={[
                    styles.imageContainer,
                    {
                      opacity: imageOpacity,
                      transform: [{ translateY: imageTranslateY }],
                    }
                  ]}
                >
                  <StorageImage
                    source={{ uri: getImageUrl(selectedRecipe.thumbnail_url) }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                  <View style={styles.imageGradient} />
                </Animated.View>
              )}

              <View style={styles.contentCard}>
                <Text style={styles.recipeTitleLarge}>{selectedRecipe?.name}</Text>

                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>{t('summer_libation_recipes.price')}</Text>
                      <View style={styles.priceBadge}>
                        <Text style={styles.priceValue}>{selectedRecipe?.price}</Text>
                      </View>
                    </View>

                    {selectedRecipe?.category && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('summer_libation_recipes.category')}</Text>
                        <Text style={styles.infoValue}>{selectedRecipe.category}</Text>
                      </View>
                    )}
                  </View>

                  {(selectedRecipe?.glassware || selectedRecipe?.garnish) && (
                    <View style={styles.infoRow}>
                      {selectedRecipe?.glassware && (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>{t('summer_libation_recipes.glassware')}</Text>
                          <Text style={styles.infoValue}>{selectedRecipe.glassware}</Text>
                        </View>
                      )}
                      {selectedRecipe?.garnish && (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>{t('summer_libation_recipes.garnish')}</Text>
                          <Text style={styles.infoValue}>{selectedRecipe.garnish}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.separator} />

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <IconSymbol
                      ios_icon_name="list.bullet"
                      android_material_icon_name="format-list-bulleted"
                      size={24}
                      color="#3498DB"
                    />
                    <Text style={styles.sectionTitleBlue}>{t('summer_libation_recipes.ingredients')}</Text>
                  </View>
                  {selectedRecipe?.ingredients && selectedRecipe.ingredients.length > 0 ? (
                    <View style={styles.ingredientsList}>
                      {selectedRecipe.ingredients.map((item, index) => (
                        <View key={index} style={styles.ingredientRow}>
                          <View style={styles.ingredientBullet} />
                          <Text style={styles.ingredientAmount}>{item.amount}</Text>
                          <Text style={styles.ingredientName}>{item.ingredient}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noDataText}>{t('summer_libation_recipes.no_ingredients')}</Text>
                  )}
                </View>

                <View style={styles.separator} />

                {selectedRecipe?.procedure && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <IconSymbol
                        ios_icon_name="doc.text"
                        android_material_icon_name="description"
                        size={30}
                        color="#E74C3C"
                      />
                      <Text style={styles.sectionTitleRed}>{t('summer_libation_recipes.procedure')}</Text>
                    </View>
                    <FormattedText style={styles.procedureText}>{getLocalizedField(selectedRecipe, 'procedure', language)}</FormattedText>
                  </View>
                )}

                <View style={styles.bottomPadding} />
              </View>
            </Animated.ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
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
    paddingTop: 20,
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
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  categoryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  tilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  recipeTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  tileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tilePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalCard: {
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
    overflow: 'hidden',
    boxShadow: '0px -4px 24px rgba(0, 0, 0, 0.5)',
    elevation: 12,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    zIndex: 20,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  closeButton: {
    position: 'absolute',
    top: 30,
    right: 20,
    zIndex: 100,
  },
  closeButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 5,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 60,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    background: 'linear-gradient(to bottom, transparent, rgba(248, 249, 250, 0.9))',
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: 28,
    paddingHorizontal: 24,
    boxShadow: '0px -2px 16px rgba(0, 0, 0, 0.1)',
    elevation: 8,
  },
  recipeTitleLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3498DB',
    marginBottom: 24,
    lineHeight: 38,
  },
  infoSection: {
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 16,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F8C8D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2C3E50',
  },
  priceBadge: {
    backgroundColor: '#27AE60',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#E8EAED',
    marginVertical: 24,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionTitleBlue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#3498DB',
  },
  sectionTitleRed: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E74C3C',
  },
  ingredientsList: {
    gap: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    gap: 12,
  },
  ingredientBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3498DB',
  },
  ingredientAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
    minWidth: 80,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#34495E',
    flex: 1,
  },
  noDataText: {
    fontSize: 15,
    color: '#95A5A6',
    fontStyle: 'italic',
  },
  procedureText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#34495E',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
  },
  bottomPadding: {
    height: 40,
  },
});
