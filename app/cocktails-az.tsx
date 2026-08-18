
import React, { useState, useEffect, useCallback } from 'react';
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import FormattedText from '@/components/FormattedText';
import { StorageImage } from '@/components/StorageImage';
import { GlasswareGlyph } from '@/components/GlasswareIconPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import { LinearGradient } from 'expo-linear-gradient';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import GlassHeroSheet from '@/components/GlassHeroSheet';
import { fonts } from '@/constants/fonts';

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  ingredients: string;
  procedure: string;
  procedure_es?: string | null;
  glassware?: string | null;
  garnish?: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

// Cocktails store ingredients as TEXT: new rows are a JSON-stringified array of
// { amount, ingredient }; legacy rows are a single plain string. Parse to rows
// for display, falling back to a single line for legacy values.
const parseCocktailIngredients = (raw: string | null): { amount: string; ingredient: string }[] => {
  const s = (raw || '').trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((r: any) => ({ amount: String(r?.amount ?? ''), ingredient: String(r?.ingredient ?? '') }));
      }
    } catch {
      // fall through
    }
  }
  return [];
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function CocktailsAZScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { user } = useAuth();
  const isManager = isManagerOrOwner(user);
  const { perms } = useManagerPermissions();
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedCocktail, setSelectedCocktail] = useState<Cocktail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadCocktails();
  }, []);

  const filterCocktails = useCallback(() => {
    let filtered = cocktails;

    // Filter by selected letter
    if (selectedLetter) {
      filtered = filtered.filter(cocktail =>
        cocktail.name.toUpperCase().startsWith(selectedLetter)
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        cocktail =>
          cocktail.name.toLowerCase().includes(query) ||
          cocktail.ingredients.toLowerCase().includes(query) ||
          cocktail.alcohol_type.toLowerCase().includes(query)
      );
    }

    setFilteredCocktails(filtered);
  }, [cocktails, searchQuery, selectedLetter]);

  useEffect(() => {
    filterCocktails();
  }, [filterCocktails]);

  const loadCocktails = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      // Member-gated RPC (org derived server-side); re-sort A-Z to preserve this screen's order.
      const { data, error } = await supabase.rpc('get_cocktails', { p_actor_id: user.id });

      if (error) throw error;
      const sorted = (data || []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setCocktails(sorted);
    } catch (error) {
      console.error('Error loading cocktails:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (cocktail: Cocktail) => {
    setSelectedCocktail(cocktail);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCocktail(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('cocktails.title')}
        rightWide={isManager}
        right={isManager ? (
          <HeaderNavMenu
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            sheetTitle={t('cocktails.title')}
            actions={[
              {
                key: 'switch',
                label: t('common:to_editor'),
                iosIcon: 'pencil',
                androidIcon: 'edit',
                onPress: () => router.replace('/cocktails-az-editor'),
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

      {/* Search Bar — MenuSearchRow geometry (46pt glass field) minus the right
          slot; this screen has no filter/add action, the field runs full width. */}
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
            placeholder={t('cocktails.search_placeholder')}
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

      <View style={styles.contentContainer}>
        {/* Cocktails List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView style={styles.cocktailsList} contentContainerStyle={styles.cocktailsListContent}>
            {filteredCocktails.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={64}
                  color={colors.textSecondary}
                />
                <Text style={[styles.emptyText, { color: colors.text }]}>{t('cocktails.no_results')}</Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {t('cocktails.no_results_hint')}
                </Text>
              </View>
            ) : (
              filteredCocktails.map((cocktail) => (
                <TouchableOpacity
                  key={cocktail.id}
                  style={[styles.cocktailCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                  onPress={() => openDetailModal(cocktail)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cocktailInfo}>
                    <Text style={[styles.cocktailName, { color: colors.text }]}>{cocktail.name}</Text>
                    <Text style={[styles.cocktailAlcoholType, { color: colors.textSecondary }]}>{cocktail.alcohol_type}</Text>
                  </View>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron-right"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        {/* Alphabetical Navigation Rail */}
        <View style={[styles.alphabetNav, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.alphabetNavContent}
          >
            <TouchableOpacity
              style={[
                styles.alphabetButton,
                styles.alphabetAllButton,
                selectedLetter === null && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedLetter(null)}
            >
              <Text
                style={[
                  styles.alphabetAllText,
                  { color: colors.textSecondary },
                  selectedLetter === null && { color: colors.fireText },
                ]}
                numberOfLines={1}
              >
                {t('cocktails.all')}
              </Text>
            </TouchableOpacity>
            {ALPHABET.map((letter) => (
              <TouchableOpacity
                key={letter}
                style={[
                  styles.alphabetButton,
                  selectedLetter === letter && { backgroundColor: colors.primary },
                ]}
                onPress={() => setSelectedLetter(letter)}
              >
                <Text
                  style={[
                    styles.alphabetButtonText,
                    { color: colors.textSecondary },
                    selectedLetter === letter && { color: colors.fireText },
                  ]}
                >
                  {letter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Detail Sheet — hero photo flush to the top edge, the
          MenuItemDetailSheet continuity (Steve's smoke call). */}
      <GlassHeroSheet
        visible={showDetailModal}
        onClose={closeDetailModal}
        hero={selectedCocktail?.thumbnail_url ? (
          <>
            <StorageImage
              source={{ uri: selectedCocktail.thumbnail_url }}
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
        <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedCocktail?.name}</Text>

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('cocktails.alcohol_type')}</Text>
          <View style={[styles.alcoholTypeBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.alcoholTypeText, { color: colors.fireText }]}>{selectedCocktail?.alcohol_type}</Text>
          </View>
        </View>

        {(selectedCocktail?.glassware || selectedCocktail?.garnish) && (
          <View style={styles.detailSection}>
            {selectedCocktail?.glassware ? (
              <>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('cocktails.glassware')}</Text>
                <View style={styles.glasswareRow}>
                  <GlasswareGlyph name={selectedCocktail.glassware} size={22} color={colors.primary} />
                  <Text style={[styles.detailText, { color: colors.text, marginLeft: 8 }]}>{selectedCocktail.glassware}</Text>
                </View>
              </>
            ) : null}
            {selectedCocktail?.garnish ? (
              <>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }, selectedCocktail?.glassware ? { marginTop: 12 } : null]}>{t('cocktails.garnish')}</Text>
                <Text style={[styles.detailText, { color: colors.text }]}>{selectedCocktail.garnish}</Text>
              </>
            ) : null}
          </View>
        )}

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('cocktails.ingredients')}</Text>
          {(() => {
            const rows = parseCocktailIngredients(selectedCocktail?.ingredients || null);
            if (rows.length === 0) {
              return <Text style={[styles.detailText, { color: colors.text }]}>{selectedCocktail?.ingredients}</Text>;
            }
            return rows.map((row, i) => (
              <Text key={i} style={[styles.detailText, { color: colors.text }]}>
                {'•'} {row.amount ? `${row.amount} ` : ''}{row.ingredient}
              </Text>
            ));
          })()}
        </View>

        <View style={styles.detailSection}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('cocktails.procedure')}</Text>
          <FormattedText style={[styles.detailText, { color: colors.text }]}>{getLocalizedField(selectedCocktail || {}, 'procedure', language)}</FormattedText>
        </View>
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
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cocktailsList: {
    flex: 1,
    paddingLeft: 16,
  },
  cocktailsListContent: {
    paddingRight: 8,
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
  cocktailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 10,
  },
  cocktailInfo: {
    flex: 1,
    marginRight: 10,
  },
  cocktailName: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    marginBottom: 3,
  },
  cocktailAlcoholType: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
  },
  // Floating glass index rail — full column height beside the list.
  alphabetNav: {
    width: 40,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginRight: 10,
    marginBottom: 12,
  },
  alphabetNavContent: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 15,
  },
  // The All chip is wider than a letter chip: ES "Todos" (uppercased) needs the
  // room even at mono 9pt — a 30pt circle clips it.
  alphabetAllButton: {
    width: 34,
    borderRadius: 12,
  },
  alphabetAllText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  alphabetButtonText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
  },
  // The hero box/radii come from GlassHeroSheet; this just fills it.
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
    marginBottom: 6,
  },
  detailLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  alcoholTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  alcoholTypeText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  glasswareRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 21,
  },
});
