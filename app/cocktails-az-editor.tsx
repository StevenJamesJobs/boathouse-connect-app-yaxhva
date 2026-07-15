
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import RichTextToolbar from '@/components/RichTextToolbar';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import CollapsibleSection from '@/components/CollapsibleSection';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';
import GlasswareIconPicker, { GlasswareGlyph } from '@/components/GlasswareIconPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { translateTexts, saveTranslations } from '@/utils/translateContent';
import { IS_MCLOONES } from '@/constants/buildVariant';

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

export default function CocktailsAZEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
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
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [alcoholPickerOpen, setAlcoholPickerOpen] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

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
    try {
      setLoading(true);
      console.log('Loading cocktails from table: cocktails');
      const { data, error } = await supabase.rpc('get_cocktails', { p_actor_id: user?.id ?? '' });

      if (error) {
        console.error('Error loading cocktails:', error);
        throw error;
      }
      const sorted = (data || []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      console.log('Loaded cocktails:', sorted);
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
      console.log('Starting image upload for user:', user.id);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array (same as profile image upload)
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Create file name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      console.log('Uploading file to cocktail-images bucket:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage (same pattern as profile picture upload)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cocktail-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('cocktail-images')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);
      setThumbnailUrl(urlData.publicUrl);
      Alert.alert(t('common.success'), t('cocktails_editor.image_uploaded'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!procedure.trim()) {
      Alert.alert(t('common.error'), 'No procedure text to translate');
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([procedure]);
      setProcedureEs(results[0] || '');
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common.error'), 'Translation failed');
    } finally {
      setTranslating(false);
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

      if (editingCocktail) {
        // Update existing cocktail using RPC function (same pattern as profile update)
        console.log('Updating cocktail:', editingCocktail.id);
        const { data, error } = await supabase.rpc('update_cocktail', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_cocktail_id: editingCocktail.id,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredientsJson,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: editingCocktail.display_order,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
        });

        if (error) {
          console.error('Error updating cocktail:', error);
          throw error;
        }
        console.log('Cocktail updated successfully');
        if (procedureEs.trim()) {
          await saveTranslations('cocktails', editingCocktail.id, { procedure_es: procedureEs }, organizationId);
        }
        Alert.alert(t('common.success'), t('cocktails_editor.cocktail_updated'));
      } else {
        // Insert new cocktail using RPC function (same pattern as profile update)
        console.log('Adding new cocktail');
        const { data, error } = await supabase.rpc('insert_cocktail', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredientsJson,
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: cocktails.length,
          p_glassware: glassware.trim() || null,
          p_garnish: garnish.trim() || null,
        });

        if (error) {
          console.error('Error adding cocktail:', error);
          throw error;
        }
        console.log('Cocktail added successfully');
        // insert_cocktail returns the new id — use it directly (no follow-up read needed).
        if (data && procedureEs.trim()) {
          await saveTranslations('cocktails', data as string, { procedure_es: procedureEs }, organizationId);
        }
        Alert.alert(t('common.success'), t('cocktails_editor.cocktail_added'));
      }

      setShowModal(false);
      resetForm();
      loadCocktails();
    } catch (error: any) {
      console.error('Error saving cocktail:', error);
      Alert.alert('Error', error.message || 'Failed to save cocktail');
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

            console.log('Deleting cocktail:', cocktail.id);
            // Use RPC function to delete (same pattern as profile update)
            const { error } = await supabase.rpc('delete_cocktail', {
              p_user_id: user.id,
              p_organization_id: organizationId,
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
            Alert.alert('Error', error.message || 'Failed to delete cocktail');
          }
        },
      },
    ]);
  };

  const openAddModal = () => {
    resetForm();
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
    setShowSpanish(false);
    setProcDragH(0);
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
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
              const seeded = Number((data as any)?.total_seeded ?? 0);
              const orgs = Number((data as any)?.orgs_processed ?? 0);
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
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('cocktail-images').getPublicUrl(url);
    return data.publicUrl;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('cocktails_editor.title')}</Text>
        {canPushToAllOrgs ? (
          <TouchableOpacity
            onPress={handlePushToAllOrgs}
            disabled={isPushing}
            style={styles.pushButton}
            accessibilityLabel={t('cocktails_editor.push_to_all')}
          >
            {isPushing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol
                ios_icon_name="arrow.clockwise.circle.fill"
                android_material_icon_name="refresh"
                size={26}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* Content Container with Vertical A-Z Nav */}
      <View style={styles.contentContainer}>
        {/* Main Content */}
        <View style={styles.mainContent}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
            {/* Add Button */}
            <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.highlight }]} onPress={openAddModal}>
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add-circle"
                size={24}
                color={colors.text}
              />
              <Text style={[styles.addButtonText, { color: colors.text }]}>{t('cocktails_editor.add_cocktail')}</Text>
            </TouchableOpacity>

            {/* Search Box */}
            <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('cocktails_editor.search_placeholder')}
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <IconSymbol
                    ios_icon_name="xmark.circle.fill"
                    android_material_icon_name="cancel"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Cocktails List - Compact Cards */}
            {filteredCocktails.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('cocktails_editor.no_cocktails')}</Text>
            ) : (
              filteredCocktails.map((cocktail, index) => (
                <View key={index} style={[styles.cocktailCard, { backgroundColor: colors.card }]}>
                  <View style={styles.cocktailInfo}>
                    <Text style={[styles.cocktailName, { color: colors.text }]}>{cocktail.name}</Text>
                    <Text style={[styles.cocktailAlcoholType, { color: colors.textSecondary }]}>{cocktail.alcohol_type}</Text>
                  </View>
                  <View style={styles.cocktailActions}>
                    <TouchableOpacity
                      style={[styles.editButton, { backgroundColor: colors.highlight }]}
                      onPress={() => openEditModal(cocktail)}
                    >
                      <Text style={[styles.buttonText, { color: colors.text }]}>{t('common.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(cocktail)}
                    >
                      <Text style={[styles.buttonText, { color: colors.text }]}>{t('common.delete')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {/* Vertical Alphabetical Navigation Bar */}
        <View style={[styles.alphabetNav, { backgroundColor: colors.card }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.alphabetNavContent}
          >
            <TouchableOpacity
              style={[
                styles.alphabetButton,
                selectedLetter === null && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedLetter(null)}
            >
              <Text
                style={[
                  styles.alphabetButtonText,
                  { color: colors.textSecondary },
                  selectedLetter === null && { color: colors.fireText },
                ]}
              >
                {t('cocktails_editor.all_letters')}
              </Text>
            </TouchableOpacity>
            {ALPHABET.map((letter, index) => (
              <TouchableOpacity
                key={index}
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
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.highlight }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingCocktail ? t('cocktails_editor.modal_edit_title') : t('cocktails_editor.modal_add_title')}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              contentContainerStyle={{ paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Section 1: Cocktail Basics (open) ── */}
              <CollapsibleSection
                title={t('cocktails_editor.section_basics')}
                iconIos="wineglass.fill"
                iconAndroid="local-bar"
                iconColor={colors.primary}
                headerBackgroundColor={colors.card}
                headerTextColor={colors.text}
                contentBackgroundColor={colors.card}
                defaultExpanded
              >
                {/* Thumbnail (tap to attach) + Name */}
                <View style={styles.thumbAndNameRow}>
                  <TouchableOpacity
                    style={[styles.thumbSquare, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={pickImage}
                    disabled={uploadingImage}
                  >
                    {thumbnailUrl ? (
                      <Image source={{ uri: getImageUrl(thumbnailUrl) || undefined }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <IconSymbol ios_icon_name="photo" android_material_icon_name="add-photo-alternate" size={26} color={colors.textSecondary} />
                      </View>
                    )}
                    {uploadingImage && (<View style={styles.thumbUploading}><ActivityIndicator color="#FFFFFF" /></View>)}
                  </TouchableOpacity>
                  <View style={styles.nameColumn}>
                    <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.cocktail_name_label')}</Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                      value={name}
                      onChangeText={setName}
                      placeholder={t('cocktails_editor.cocktail_name_placeholder')}
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </View>

                {/* Alcohol Type (dropdown) */}
                <View style={styles.formField}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.alcohol_type_label')}</Text>
                  <SelectField
                    value={alcoholType}
                    placeholder={t('cocktails_editor.select_alcohol_type')}
                    onPress={() => setAlcoholPickerOpen(true)}
                  />
                </View>
              </CollapsibleSection>

              {/* ── Section 2: Ingredients (collapsed) ── */}
              <CollapsibleSection
                title={t('cocktails_editor.section_ingredients')}
                iconIos="list.bullet"
                iconAndroid="format-list-bulleted"
                iconColor={colors.primary}
                headerBackgroundColor={colors.card}
                headerTextColor={colors.text}
                contentBackgroundColor={colors.card}
                defaultExpanded={false}
              >
                {/* Glassware (visual picker) */}
                <View style={styles.formField}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.glassware_label')}</Text>
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
                  <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.garnish_label')}</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    value={garnish}
                    onChangeText={setGarnish}
                    placeholder={t('cocktails_editor.garnish_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.ingredients_label')}</Text>
                  {ingredients.map((ingredient, index) => (
                    <View key={index} style={styles.ingredientRow}>
                      <TextInput
                        style={[styles.formInput, styles.ingredientAmount, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={ingredient.amount}
                        onChangeText={(value) => updateIngredient(index, 'amount', value)}
                        placeholder="Amount"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <TextInput
                        style={[styles.formInput, styles.ingredientName, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={ingredient.ingredient}
                        onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                        placeholder="Ingredient"
                        placeholderTextColor={colors.textSecondary}
                      />
                      {ingredients.length > 1 && (
                        <TouchableOpacity style={styles.removeIngredientButton} onPress={() => removeIngredient(index)}>
                          <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color="#F44336" />
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
                title={t('cocktails_editor.section_procedure')}
                iconIos="list.number"
                iconAndroid="format-list-numbered"
                iconColor={colors.primary}
                headerBackgroundColor={colors.card}
                headerTextColor={colors.text}
                contentBackgroundColor={colors.card}
                defaultExpanded={false}
              >
                {/* Procedure (auto-grow) */}
                <View style={styles.formField}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.procedure_label')}</Text>
                  <RichTextToolbar
                    text={procedure}
                    onChangeText={setProcedure}
                    selection={procedureSelection}
                    onSelectionChange={setProcedureSelection}
                    textInputRef={procedureInputRef}
                    accentColor={colors.highlight}
                  />
                  <View>
                    <TextInput
                      ref={procedureInputRef}
                      style={[styles.formInput, styles.textArea, { minHeight: Math.max(120, procDragH), paddingBottom: 22, backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                      value={procedure}
                      onChangeText={setProcedure}
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

                {/* Spanish Procedure Translation (menu-editor blue style) */}
                <View style={styles.formField}>
                  <TouchableOpacity style={styles.spanishSectionHeader} onPress={() => setShowSpanish(!showSpanish)}>
                    <Text style={[styles.formLabel, { color: colors.text }]}>{t('translation_section:spanish_section_title')}</Text>
                    <IconSymbol
                      ios_icon_name={showSpanish ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={showSpanish ? 'expand-less' : 'expand-more'}
                      size={20}
                      color="#666666"
                    />
                  </TouchableOpacity>
                  {showSpanish && (
                    <View style={styles.spanishFields}>
                      <TouchableOpacity style={styles.autoTranslateButton} onPress={handleAutoTranslate} disabled={translating}>
                        {translating ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.autoTranslateButtonText}>{t('translation_section:auto_translate')}</Text>
                        )}
                      </TouchableOpacity>
                      <Text style={styles.spanishFieldLabel}>{t('cocktails_editor.procedure_es_label')}</Text>
                      <TextInput
                        style={[styles.formInput, styles.textArea, { backgroundColor: '#FFFFFF', color: '#1A1A1A', borderColor: '#D0E8FF' }]}
                        value={procedureEs}
                        onChangeText={setProcedureEs}
                        placeholder="Procedimiento en español"
                        placeholderTextColor="#999999"
                        multiline
                        numberOfLines={4}
                      />
                    </View>
                  )}
                </View>
              </CollapsibleSection>

              {/* ── Actions ── */}
              <View style={[styles.formSectionActions, { backgroundColor: colors.card }]}>
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: colors.highlight }]}
                  onPress={handleSave}
                  disabled={loading || uploadingImage}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: colors.text }]}>
                      {editingCocktail ? t('cocktails_editor.update_button') : t('cocktails_editor.add_button')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          <SimpleSelectPicker
            visible={alcoholPickerOpen}
            title={t('cocktails_editor.select_alcohol_type')}
            options={ALCOHOL_TYPES}
            value={alcoholType}
            onSelect={setAlcoholType}
            onClose={() => setAlcoholPickerOpen(false)}
          />
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
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
    paddingTop: 48,
    paddingBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  pushButton: {
    padding: 8,
    width: 40,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  mainContent: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 100,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 10,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  cocktailCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  cocktailInfo: {
    flex: 1,
    marginRight: 12,
  },
  cocktailName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cocktailAlcoholType: {
    fontSize: 14,
  },
  cocktailActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 40,
  },
  alphabetNav: {
    width: 40,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    marginRight: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  alphabetNavContent: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 16,
  },
  alphabetButtonText: {
    fontSize: 12,
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalForm: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  // White cards grouping the form into scannable sections on the scroll (D5).
  // Theme-aware (this editor adapts to dark mode): backgroundColor: colors.card
  // is applied inline at each usage; inputs use colors.background for contrast.
  formSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)',
  },
  formSectionActions: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)',
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  formInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    borderRadius: 8,
    borderWidth: 1,
  },
  imagePickerButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  thumbnailPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Spanish block — menu-editor blue style (replaces the old orange).
  spanishSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  spanishFields: {
    marginTop: 8,
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  autoTranslateButton: {
    backgroundColor: '#3498DB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  autoTranslateButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  spanishFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 4,
  },
  // Tap-to-attach thumbnail + name row (theme-aware bg applied inline).
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
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
  // Structured ingredient rows (new for cocktails; mirrors the libation editor).
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  ingredientAmount: { flex: 1 },
  ingredientName: { flex: 2 },
  removeIngredientButton: { padding: 4 },
  addIngredientButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addIngredientText: { fontSize: 14, fontWeight: '600' },
});
