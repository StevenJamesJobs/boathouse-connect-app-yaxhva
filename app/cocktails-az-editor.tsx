
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { brokerUploadImage } from '@/utils/storageBroker';
import { toPublicUrl } from '@/utils/storageResolver';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useTranslation } from 'react-i18next';
import RichTextToolbar from '@/components/RichTextToolbar';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import CollapsibleSection from '@/components/CollapsibleSection';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';
import GlasswareIconPicker from '@/components/GlasswareIconPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import GlassSheet from '@/components/GlassSheet';
import MenuSearchRow from '@/components/MenuSearchRow';
import { fonts } from '@/constants/fonts';

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  // Stored as TEXT in the DB. New/edited cocktails store a JSON-stringified
  // array of { amount, ingredient } rows; legacy rows are a single plain string.
  ingredients: string;
  procedure: string | null;
  procedure_es?: string | null;
  glassware?: string | null;
  garnish?: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

type IngredientRow = { amount: string; ingredient: string };

// Parse a stored cocktails.ingredients value into structured rows. A JSON array
// (new format) parses directly; a legacy plain string becomes a single row so it
// still shows (and can be re-entered) in the structured editor.
const parseIngredients = (raw: string | null): IngredientRow[] => {
  const s = (raw || '').trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((r: any) => ({ amount: String(r?.amount ?? ''), ingredient: String(r?.ingredient ?? '') }));
      }
    } catch {
      // fall through to legacy handling
    }
  }
  return [{ amount: '', ingredient: raw || '' }];
};

const ALCOHOL_TYPES = [
  'Bourbon',
  'Brandy',
  'Cognac',
  'Gin',
  'Rum',
  'Tequila',
  'Vodka',
  'Whiskey',
  'Other',
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// The house trash red (manage-menu-categories) — a literal on purpose: it must
// not invert between themes the way an accent token would.
const TRASH_RED = '#E53935';

export default function CocktailsAZEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
  const { perms } = useManagerPermissions();
  const colors = useThemeColors();
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCocktail, setEditingCocktail] = useState<Cocktail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  // Boathouse-only: the source-org owner can push the curated Cocktails A-Z
  // library out to every other organization. Gated again server-side by the RPC.
  const canPushToAllOrgs = IS_MCLOONES && user?.role === 'owner';

  // Form state
  const [name, setName] = useState('');
  const [alcoholType, setAlcoholType] = useState('');
  const [glassware, setGlassware] = useState('');
  const [garnish, setGarnish] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{ amount: '', ingredient: '' }]);
  const [procedure, setProcedure] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [procedureEs, setProcedureEs] = useState('');
  const [alcoholPickerOpen, setAlcoholPickerOpen] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

  // Hybrid bilingual authoring (s61): the primary inputs bind the device
  // language; the shared section shows the other-language preview + translate
  // button + pencil edit. resolveOnSave() runs the staleness rules.
  const isSpanishAuthor = i18n.language === 'es';
  const addSessionRef = useRef(0);
  const translation = useTranslationSection({
    fields: [
      {
        key: 'procedure',
        labelKey: 'translation_section:field_procedure',
        enValue: procedure,
        esValue: procedureEs,
        setEnValue: setProcedure,
        setEsValue: setProcedureEs,
        multiline: true,
      },
    ],
    sessionKey: editingCocktail ? `edit:${editingCocktail.id}` : `new:${addSessionRef.current}`,
    active: showModal,
  });

  const addIngredient = () => setIngredients((prev) => [...prev, { amount: '', ingredient: '' }]);
  const removeIngredient = (index: number) =>
    setIngredients((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ amount: '', ingredient: '' }];
    });
  const updateIngredient = (index: number, field: 'amount' | 'ingredient', value: string) =>
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const filterCocktails = useCallback(() => {
    let filtered = cocktails;

    // Filter by letter
    if (selectedLetter) {
      filtered = filtered.filter((cocktail) =>
        cocktail.name.toUpperCase().startsWith(selectedLetter)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (cocktail) =>
          cocktail.name.toLowerCase().includes(query) ||
          cocktail.alcohol_type.toLowerCase().includes(query) ||
          cocktail.ingredients.toLowerCase().includes(query)
      );
    }

    setFilteredCocktails(filtered);
  }, [cocktails, searchQuery, selectedLetter]);

  useEffect(() => {
    filterCocktails();
  }, [filterCocktails]);

  const loadCocktails = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_cocktails', { p_actor_id: user.id });

      if (error) {
        console.error('Error loading cocktails:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setCocktails(sorted);
    } catch (error) {
      console.error('Error loading cocktails:', error);
      Alert.alert(t('common.error'), t('cocktails_editor.no_cocktails'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCocktails();
  }, [loadCocktails]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), t('cocktails_editor.error_pick_image'));
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) {
      Alert.alert(t('common.error'), t('cocktails_editor.error_not_authenticated_upload'));
      return;
    }

    try {
      setUploadingImage(true);

      const publicUrl = await brokerUploadImage('cocktail_image', uri, user.id);
      if (!publicUrl) {
        throw new Error('Failed to upload image');
      }

      setThumbnailUrl(publicUrl);
      Alert.alert(t('common.success'), t('cocktails_editor.image_uploaded'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', translateServerError(error, 'Failed to upload image'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert(t('common.error'), t('cocktails_editor.error_no_name'));
        return;
      }

      if (!alcoholType) {
        Alert.alert(t('common.error'), t('cocktails_editor.error_no_alcohol_type'));
        return;
      }

      const validIngredients = ingredients.filter((ing) => ing.ingredient.trim());
      if (validIngredients.length === 0) {
        Alert.alert(t('common.error'), t('cocktails_editor.error_no_ingredients'));
        return;
      }
      const ingredientsJson = JSON.stringify(validIngredients);

      if (!user?.id) {
        Alert.alert(t('common.error'), t('cocktails_editor.error_not_authenticated'));
        return;
      }

      setLoading(true);
      // Fill/refresh the other language per the s61 staleness rules (may ask once).
      const resolved = await translation.resolveOnSave();
      if (!resolved) { setLoading(false); return; }

      if (editingCocktail) {
        const { error } = await supabase.rpc('update_cocktail', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_cocktail_id: editingCocktail.id,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredientsJson,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: editingCocktail.display_order,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
        });

        if (error) {
          console.error('Error updating cocktail:', error);
          throw error;
        }
        await saveTranslations('cocktails', editingCocktail.id, { procedure_es: resolved.procedure.es }, user?.id);
        Alert.alert(t('common.success'), t('cocktails_editor.cocktail_updated'));
      } else {
        const { data, error } = await supabase.rpc('insert_cocktail', {
          p_user_id: user.id,
          p_organization_id: organizationId ?? undefined,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredientsJson,
          p_procedure: (resolved.procedure.en.trim() || null) as string,
          p_thumbnail_url: thumbnailUrl as string,
          p_display_order: cocktails.length,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
        });

        if (error) {
          console.error('Error adding cocktail:', error);
          throw error;
        }
        // insert_cocktail returns the new id — use it directly (no follow-up read needed).
        if (data) {
          await saveTranslations('cocktails', data as string, { procedure_es: resolved.procedure.es }, user?.id);
        }
        Alert.alert(t('common.success'), t('cocktails_editor.cocktail_added'));
      }

      setShowModal(false);
      resetForm();
      loadCocktails();
    } catch (error: any) {
      console.error('Error saving cocktail:', error);
      Alert.alert('Error', translateServerError(error, 'Failed to save cocktail'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cocktail: Cocktail) => {
    Alert.alert(t('cocktails_editor.delete_title'), t('cocktails_editor.delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!user?.id) {
              Alert.alert(t('common.error'), t('cocktails_editor.error_not_authenticated_delete'));
              return;
            }

            const { error } = await supabase.rpc('delete_cocktail', {
              p_user_id: user.id,
              p_organization_id: organizationId ?? undefined,
              p_cocktail_id: cocktail.id,
            });

            if (error) {
              console.error('Error deleting cocktail:', error);
              throw error;
            }
            Alert.alert(t('common.success'), t('cocktails_editor.cocktail_deleted'));
            loadCocktails();
          } catch (error: any) {
            console.error('Error deleting cocktail:', error);
            Alert.alert('Error', translateServerError(error, 'Failed to delete cocktail'));
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    resetForm();
    addSessionRef.current += 1;
    setShowModal(true);
  };

  const openEditModal = (cocktail: Cocktail) => {
    setEditingCocktail(cocktail);
    setName(cocktail.name);
    setAlcoholType(cocktail.alcohol_type);
    setGlassware(cocktail.glassware || '');
    setGarnish(cocktail.garnish || '');
    setIngredients(parseIngredients(cocktail.ingredients));
    setProcedure(cocktail.procedure || '');
    setProcedureEs(cocktail.procedure_es || '');
    setThumbnailUrl(cocktail.thumbnail_url);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingCocktail(null);
    setName('');
    setAlcoholType('');
    setGlassware('');
    setGarnish('');
    setIngredients([{ amount: '', ingredient: '' }]);
    setProcedure('');
    setProcedureEs('');
    setProcDragH(0);
    setThumbnailUrl(null);
  };

  // Boathouse-only owner action: push the curated Cocktails A-Z library out to
  // every other organization. Idempotent server-side — adds cocktails an org
  // lacks by name AND fills blank fields on ones it has, never overwriting edits.
  const handlePushToAllOrgs = () => {
    if (!user?.id || isPushing) return;
    Alert.alert(
      t('cocktails_editor.push_confirm_title'),
      t('cocktails_editor.push_confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cocktails_editor.push_confirm_button'),
          onPress: async () => {
            setIsPushing(true);
            try {
              const { data, error } = await supabase.rpc('push_source_cocktails_to_all_orgs', {
                p_user_id: user.id,
              });
              if (error) {
                console.error('[CocktailsEditor] Push to all orgs error:', error);
                Alert.alert(t('common.error'), t('cocktails_editor.push_error'));
                return;
              }
              const seeded = Number((data as { total_seeded?: number; orgs_processed?: number } | null)?.total_seeded ?? 0);
              const orgs = Number((data as { total_seeded?: number; orgs_processed?: number } | null)?.orgs_processed ?? 0);
              Alert.alert(
                t('cocktails_editor.push_success_title'),
                seeded > 0
                  ? t('cocktails_editor.push_success_message', { count: seeded, orgs })
                  : t('cocktails_editor.push_uptodate_message', { orgs }),
              );
            } catch (err) {
              console.error('[CocktailsEditor] Push to all orgs exception:', err);
              Alert.alert(t('common.error'), t('cocktails_editor.push_error'));
            } finally {
              setIsPushing(false);
            }
          },
        },
      ],
    );
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return toPublicUrl('cocktail-images', url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('cocktails_editor.title')}
        rightWide
        right={
          <View style={styles.headerRightRow}>
            {canPushToAllOrgs && (
              <TouchableOpacity
                onPress={handlePushToAllOrgs}
                disabled={isPushing}
                style={[styles.pushChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                accessibilityLabel={t('cocktails_editor.push_to_all')}
              >
                {isPushing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <IconSymbol
                    ios_icon_name="arrow.clockwise"
                    android_material_icon_name="refresh"
                    size={17}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            )}
            <HeaderNavMenu
              label={t('common:to_user')}
              iconIos="person.fill"
              iconAndroid="person"
              sheetTitle={t('cocktails_editor.title')}
              actions={[
                {
                  key: 'switch',
                  label: t('common:to_user'),
                  iosIcon: 'person.fill',
                  androidIcon: 'person',
                  onPress: () => router.replace('/cocktails-az'),
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
          </View>
        }
      />

      {/* Search + compact ＋ — the menu editor's row, verbatim geometry. */}
      <MenuSearchRow
        colors={colors}
        mode="editor"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('cocktails_editor.search_placeholder')}
        onRightPress={openAddModal}
      />

      {/* Content Container with Vertical A-Z Nav */}
      <View style={styles.contentContainer}>
        <ScrollView style={styles.cocktailsList} contentContainerStyle={styles.cocktailsListContent}>
          {filteredCocktails.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('cocktails_editor.no_cocktails')}</Text>
          ) : (
            filteredCocktails.map((cocktail) => (
              <View
                key={cocktail.id}
                style={[styles.cocktailCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              >
                <View style={styles.cocktailInfo}>
                  <Text style={[styles.cocktailName, { color: colors.text }]}>{cocktail.name}</Text>
                  <Text style={[styles.cocktailAlcoholType, { color: colors.textSecondary }]}>{cocktail.alcohol_type}</Text>
                </View>
                <View style={styles.cocktailActions}>
                  <TouchableOpacity
                    style={[styles.actionChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                    onPress={() => openEditModal(cocktail)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={14} color={colors.primary} />
                    <Text style={[styles.actionChipText, { color: colors.text }]}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                    onPress={() => handleDelete(cocktail)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={14} color={TRASH_RED} />
                    <Text style={[styles.actionChipText, { color: TRASH_RED }]}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

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
                {t('cocktails_editor.all_letters')}
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

      {/* Loading Overlay */}
      {loading && !showModal && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Add/Edit Sheet */}
      <GlassSheet
        visible={showModal}
        onClose={closeModal}
        title={editingCocktail ? t('cocktails_editor.modal_edit_title') : t('cocktails_editor.modal_add_title')}
        footer={
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={closeModal}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerBtn,
                { backgroundColor: colors.primary, borderColor: colors.primary },
                (loading || uploadingImage) && styles.footerBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={loading || uploadingImage}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.fireText} />
              ) : (
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
                  {editingCocktail ? t('cocktails_editor.update_button') : t('cocktails_editor.add_button')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {/* ── Section 1: Cocktail Basics (open) ── */}
        <CollapsibleSection
          glass
          title={t('cocktails_editor.section_basics')}
          iconIos="wineglass.fill"
          iconAndroid="local-bar"
          iconColor={colors.primary}
          defaultExpanded
        >
          {/* Thumbnail (tap to attach) + Name */}
          <View style={styles.thumbAndNameRow}>
            <TouchableOpacity
              style={[styles.thumbSquare, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={pickImage}
              disabled={uploadingImage}
            >
              {thumbnailUrl ? (
                <StorageImage source={{ uri: getImageUrl(thumbnailUrl) || undefined }} style={styles.thumbImage} resizeMode="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <IconSymbol ios_icon_name="photo" android_material_icon_name="add-photo-alternate" size={26} color={colors.textSecondary} />
                </View>
              )}
              {uploadingImage && (<View style={styles.thumbUploading}><ActivityIndicator color="#FFFFFF" /></View>)}
            </TouchableOpacity>
            <View style={styles.nameColumn}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.cocktail_name_label')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={name}
                onChangeText={setName}
                placeholder={t('cocktails_editor.cocktail_name_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Alcohol Type (dropdown) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.alcohol_type_label')}</Text>
            <SelectField
              value={alcoholType}
              placeholder={t('cocktails_editor.select_alcohol_type')}
              onPress={() => setAlcoholPickerOpen(true)}
            />
          </View>
        </CollapsibleSection>

        {/* ── Section 2: Ingredients (collapsed) ── */}
        <CollapsibleSection
          glass
          title={t('cocktails_editor.section_ingredients')}
          iconIos="list.bullet"
          iconAndroid="format-list-bulleted"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          {/* Glassware (visual picker) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.glassware_label')}</Text>
            <GlasswareIconPicker
              value={glassware}
              onChange={setGlassware}
              title={t('cocktails_editor.select_glassware')}
              placeholder={t('cocktails_editor.select_glassware')}
              customLabel={t('common.custom_option')}
              customPlaceholder={t('cocktails_editor.custom_glassware_placeholder')}
            />
          </View>
          {/* Garnish (free-text) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.garnish_label')}</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
              value={garnish}
              onChangeText={setGarnish}
              placeholder={t('cocktails_editor.garnish_placeholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.ingredients_label')}</Text>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.formInput, styles.ingredientAmount, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.amount}
                  onChangeText={(value) => updateIngredient(index, 'amount', value)}
                  placeholder="Amount"
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.formInput, styles.ingredientName, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                  value={ingredient.ingredient}
                  onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                  placeholder="Ingredient"
                  placeholderTextColor={colors.textSecondary}
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity style={styles.removeIngredientButton} onPress={() => removeIngredient(index)}>
                    <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color={TRASH_RED} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
              <Text style={[styles.addIngredientText, { color: colors.primary }]}>Add Ingredient</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleSection>

        {/* ── Section 3: Procedure (collapsed) ── */}
        <CollapsibleSection
          glass
          title={t('cocktails_editor.section_procedure')}
          iconIos="list.number"
          iconAndroid="format-list-numbered"
          iconColor={colors.primary}
          defaultExpanded={false}
        >
          {/* Procedure (auto-grow) */}
          <View style={styles.formField}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('cocktails_editor.procedure_label')}</Text>
            <RichTextToolbar
              text={isSpanishAuthor ? procedureEs : procedure}
              onChangeText={isSpanishAuthor ? setProcedureEs : setProcedure}
              selection={procedureSelection}
              onSelectionChange={setProcedureSelection}
              textInputRef={procedureInputRef}
              accentColor={colors.primary}
              backgroundColor={colors.surface}
              textColor={colors.text}
            />
            <View>
              <TextInput
                ref={procedureInputRef}
                style={[styles.formInput, styles.textArea, { minHeight: Math.max(120, procDragH), paddingBottom: 22, backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
                value={isSpanishAuthor ? procedureEs : procedure}
                onChangeText={isSpanishAuthor ? setProcedureEs : setProcedure}
                placeholder={t('cocktails_editor.procedure_placeholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                scrollEnabled={false}
                onContentSizeChange={(e) => setProcH(e.nativeEvent.contentSize.height)}
                onSelectionChange={(e) => setProcedureSelection(e.nativeEvent.selection)}
              />
              <ProcedureResizeHandle height={Math.max(120, procH, procDragH)} onResize={setProcDragH} />
            </View>
          </View>

          {/* Bilingual authoring (s61 hybrid) */}
          <View style={styles.formField}>
            {translation.element}
          </View>
        </CollapsibleSection>

        {/* Nested INSIDE the sheet's Modal tree so iOS can present it above the
            open sheet (a sibling Modal would be silently dropped). */}
        <SimpleSelectPicker
          visible={alcoholPickerOpen}
          title={t('cocktails_editor.select_alcohol_type')}
          options={ALCOHOL_TYPES}
          value={alcoholType}
          onSelect={setAlcoholType}
          onClose={() => setAlcoholPickerOpen(false)}
        />
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pushChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  cocktailsList: {
    flex: 1,
    paddingLeft: 16,
  },
  cocktailsListContent: {
    paddingRight: 8,
    paddingBottom: 100,
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
  cocktailActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  actionChipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 11.5,
  },
  emptyText: {
    fontFamily: fonts.body.regular,
    textAlign: 'center',
    fontSize: 14,
    marginTop: 40,
  },
  // Floating glass index rail — mirrors the user side exactly.
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 11,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnDisabled: {
    opacity: 0.6,
  },
  footerBtnLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
  formField: {
    marginBottom: 14,
  },
  formLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  formInput: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  // Tap-to-attach thumbnail + name row.
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  thumbSquare: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbUploading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  nameColumn: { flex: 1 },
  // Structured ingredient rows (mirrors the libation editor).
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  ingredientAmount: { flex: 1 },
  ingredientName: { flex: 2 },
  removeIngredientButton: { padding: 4 },
  addIngredientButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addIngredientText: { fontFamily: fonts.body.semibold, fontSize: 13 },
});
