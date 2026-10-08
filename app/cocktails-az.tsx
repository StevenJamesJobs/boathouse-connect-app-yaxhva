
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
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import HeaderNavButton from '@/components/HeaderNavButton';
import { useAssistantEditor } from '@/hooks/useAssistantEditor';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import RecipeDetailSheet from '@/components/RecipeDetailSheet';
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
  // s90 multi-images: every stored photo URL, cover first (mirrors thumbnail_url).
  images?: string[] | null;
  display_order: number;
  is_active: boolean;
}

// The RPC's `images` Json → the stored-URL list, cover first. Rows from before
// s90 carry no list (or an empty one), so the lone thumbnail stands in for it.
const parseImageList = (raw: unknown, thumbnail?: string | null): string[] => {
  let value = raw;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const list = Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string' && !!u) : [];
  if (list.length > 0) return list;
  return thumbnail ? [thumbnail] : [];
};

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

// The Poster's ingredient rows: the parsed { amount, ingredient } rows, or a
// legacy plain string as one amount-less row (nothing when empty).
const cocktailIngredientRows = (raw: string | null): { amount?: string; ingredient: string }[] => {
  const rows = parseCocktailIngredients(raw);
  if (rows.length > 0) return rows;
  const s = (raw || '').trim();
  return s ? [{ ingredient: s }] : [];
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function CocktailsAZScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const isManager = isManagerOrOwner(user);
  // s91: a granted recipe editor (not a manager) gets a plain To Editor pill
  // and the Edit chip; the manager sheet rows stay manager-only.
  const { canEdit } = useAssistantEditor();
  const canEditBar = canEdit('bartender');
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
      const sorted = (data || [])
        .slice()
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
        // The Json photo list → string[] once, here (the Poster pages it).
        .map((row) => ({ ...row, images: parseImageList(row.images, row.thumbnail_url) }));
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
        rightWide={isManager || canEditBar}
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
        ) : canEditBar ? (
          <HeaderNavButton
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            onPress={() => router.replace('/cocktails-az-editor')}
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

      {/* Detail — the shared recipe Poster: no price, the alcohol type rides
          the slate pill. Managers get the Edit chip, which deep-links into the
          editor's edit modal by name (?edit=). */}
      <RecipeDetailSheet
        visible={showDetailModal}
        onClose={closeDetailModal}
        recipe={selectedCocktail ? {
          name: selectedCocktail.name,
          glassware: selectedCocktail.glassware,
          garnish: selectedCocktail.garnish,
          ingredients: cocktailIngredientRows(selectedCocktail.ingredients),
          procedure: selectedCocktail.procedure,
          procedure_es: selectedCocktail.procedure_es,
          thumbnail_url: selectedCocktail.thumbnail_url,
          images: parseImageList(selectedCocktail.images, selectedCocktail.thumbnail_url),
          subcategoryLabel: selectedCocktail.alcohol_type,
        } : null}
        editAction={canEditBar && selectedCocktail ? {
          label: t('common.edit'),
          onPress: () => router.push({ pathname: '/cocktails-az-editor', params: { edit: selectedCocktail.name } } as any),
        } : null}
      />
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
});
