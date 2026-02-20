
import React, { useState, useEffect, useCallback } from 'react';
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
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  ingredients: string;
  procedure: string | null;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

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
  const colors = useThemeColors();
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCocktail, setEditingCocktail] = useState<Cocktail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [alcoholType, setAlcoholType] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [procedure, setProcedure] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
      const { data, error } = await supabase
        .from('cocktails')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading cocktails:', error);
        throw error;
      }
      console.log('Loaded cocktails:', data);
      setCocktails(data || []);
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

      if (!ingredients.trim()) {
        Alert.alert(t('common.error'), t('cocktails_editor.error_no_ingredients'));
        return;
      }

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
          p_cocktail_id: editingCocktail.id,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredients.trim(),
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: editingCocktail.display_order,
        });

        if (error) {
          console.error('Error updating cocktail:', error);
          throw error;
        }
        console.log('Cocktail updated successfully');
        Alert.alert(t('common.success'), t('cocktails_editor.cocktail_updated'));
      } else {
        // Insert new cocktail using RPC function (same pattern as profile update)
        console.log('Adding new cocktail');
        const { data, error } = await supabase.rpc('insert_cocktail', {
          p_user_id: user.id,
          p_name: name.trim(),
          p_alcohol_type: alcoholType,
          p_ingredients: ingredients.trim(),
          p_procedure: procedure.trim() || null,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: cocktails.length,
        });

        if (error) {
          console.error('Error adding cocktail:', error);
          throw error;
        }
        console.log('Cocktail added successfully');
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
    setIngredients(cocktail.ingredients);
    setProcedure(cocktail.procedure || '');
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
    setIngredients('');
    setProcedure('');
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
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
        <View style={styles.backButton} />
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
                android_material_icon_name="add_circle"
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
                  selectedLetter === null && { color: colors.text },
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
                    selectedLetter === letter && { color: colors.text },
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
          <ActivityIndicator size="large" color={colors.highlight} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
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

            <ScrollView style={styles.modalForm}>
              {/* Name */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.cocktail_name_label')}</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('cocktails_editor.cocktail_name_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Alcohol Type */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.alcohol_type_label')}</Text>
                <View style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {ALCOHOL_TYPES.map((type, index) => (
                    <TouchableOpacity
                      key={index}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        backgroundColor:
                          alcoholType === type ? colors.highlight : 'transparent',
                      }}
                      onPress={() => setAlcoholType(type)}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: alcoholType === type ? '600' : '400',
                        }}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Ingredients */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.ingredients_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                  value={ingredients}
                  onChangeText={setIngredients}
                  placeholder={t('cocktails_editor.ingredients_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Procedure */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.procedure_label')}</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder={t('cocktails_editor.procedure_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Image Upload */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('cocktails_editor.image_label')}</Text>
                <TouchableOpacity
                  style={[styles.imagePickerButton, { backgroundColor: colors.highlight }]}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={[styles.imagePickerButtonText, { color: colors.text }]}>
                    {uploadingImage ? t('cocktails_editor.uploading') : t('cocktails_editor.choose_image')}
                  </Text>
                </TouchableOpacity>
                {thumbnailUrl && (
                  <Image
                    source={{ uri: getImageUrl(thumbnailUrl) || undefined }}
                    style={styles.thumbnailPreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Submit Button */}
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
            </ScrollView>
          </View>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  formInput: {
    borderRadius: 8,
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
});
