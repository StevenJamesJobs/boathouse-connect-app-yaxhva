
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter } from 'expo-router';
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
import * as FileSystem from 'expo-file-system/legacy';
import { managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  ingredients: string;
  procedure: string;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const ALCOHOL_TYPES = [
  'Vodka',
  'Gin',
  'Rum',
  'Tequila',
  'Whiskey',
  'Brandy',
  'Liqueur',
  'Wine',
  'Beer',
  'Non-Alcoholic',
  'Other',
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: managerColors.card,
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
    color: managerColors.text,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  addButton: {
    backgroundColor: managerColors.highlight,
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
    color: managerColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
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
    color: managerColors.text,
    padding: 0,
  },
  alphabetScroll: {
    maxHeight: 40,
    marginBottom: 16,
  },
  alphabetScrollContent: {
    gap: 8,
  },
  alphabetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: managerColors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  alphabetButtonActive: {
    backgroundColor: managerColors.highlight,
  },
  alphabetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  alphabetButtonTextActive: {
    color: managerColors.text,
  },
  cocktailCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  cocktailImage: {
    width: '100%',
    height: 200,
  },
  cocktailContent: {
    padding: 16,
  },
  cocktailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 8,
  },
  cocktailAlcoholType: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 8,
  },
  cocktailIngredients: {
    fontSize: 14,
    color: managerColors.text,
    marginBottom: 8,
  },
  cocktailProcedure: {
    fontSize: 13,
    color: managerColors.textSecondary,
    lineHeight: 18,
  },
  cocktailActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: managerColors.highlight,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 40,
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
    backgroundColor: managerColors.background,
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
    borderBottomColor: managerColors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
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
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: managerColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  imagePickerButton: {
    backgroundColor: managerColors.highlight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
  },
  thumbnailPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});

export default function CocktailsAZEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
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
      const { data, error } = await supabase
        .from('cocktails_az')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setCocktails(data || []);
    } catch (error) {
      console.error('Error loading cocktails:', error);
      Alert.alert('Error', 'Failed to load cocktails');
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
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      const fileName = `cocktail-${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.storage
        .from('cocktails')
        .upload(fileName, decode(base64), {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('cocktails').getPublicUrl(data.path);

      setThumbnailUrl(publicUrl);
      Alert.alert('Success', 'Image uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter a cocktail name');
        return;
      }

      if (!alcoholType) {
        Alert.alert('Error', 'Please select an alcohol type');
        return;
      }

      if (!ingredients.trim()) {
        Alert.alert('Error', 'Please enter ingredients');
        return;
      }

      setLoading(true);

      const cocktailData = {
        name: name.trim(),
        alcohol_type: alcoholType,
        ingredients: ingredients.trim(),
        procedure: procedure.trim(),
        thumbnail_url: thumbnailUrl,
        display_order: editingCocktail ? editingCocktail.display_order : cocktails.length,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (editingCocktail) {
        const { error } = await supabase
          .from('cocktails_az')
          .update(cocktailData)
          .eq('id', editingCocktail.id);

        if (error) throw error;
        Alert.alert('Success', 'Cocktail updated successfully');
      } else {
        const { error } = await supabase.from('cocktails_az').insert({
          ...cocktailData,
          created_by: user?.id,
        });

        if (error) throw error;
        Alert.alert('Success', 'Cocktail added successfully');
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
    Alert.alert('Delete Cocktail', 'Are you sure you want to delete this cocktail?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('cocktails_az')
              .update({ is_active: false })
              .eq('id', cocktail.id);

            if (error) throw error;
            Alert.alert('Success', 'Cocktail deleted successfully');
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
    setProcedure(cocktail.procedure);
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
    const { data } = supabase.storage.from('cocktails').getPublicUrl(url);
    return data.publicUrl;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cocktails A-Z Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Add Button */}
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={managerColors.text}
          />
          <Text style={styles.addButtonText}>Add Cocktail</Text>
        </TouchableOpacity>

        {/* Search Box */}
        <View style={styles.searchContainer}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={managerColors.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search cocktails..."
            placeholderTextColor={managerColors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={managerColors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Alphabet Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.alphabetScroll}
          contentContainerStyle={styles.alphabetScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.alphabetButton,
              selectedLetter === null && styles.alphabetButtonActive,
            ]}
            onPress={() => setSelectedLetter(null)}
          >
            <Text
              style={[
                styles.alphabetButtonText,
                selectedLetter === null && styles.alphabetButtonTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {ALPHABET.map((letter, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.alphabetButton,
                selectedLetter === letter && styles.alphabetButtonActive,
              ]}
              onPress={() => setSelectedLetter(letter)}
            >
              <Text
                style={[
                  styles.alphabetButtonText,
                  selectedLetter === letter && styles.alphabetButtonTextActive,
                ]}
              >
                {letter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Cocktails List */}
        {filteredCocktails.length === 0 ? (
          <Text style={styles.emptyText}>No cocktails found</Text>
        ) : (
          filteredCocktails.map((cocktail, index) => (
            <View key={index} style={styles.cocktailCard}>
              {cocktail.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(cocktail.thumbnail_url) || undefined }}
                  style={styles.cocktailImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.cocktailContent}>
                <Text style={styles.cocktailName}>{cocktail.name}</Text>
                <Text style={styles.cocktailAlcoholType}>{cocktail.alcohol_type}</Text>
                <Text style={styles.cocktailIngredients}>{cocktail.ingredients}</Text>
                {cocktail.procedure && (
                  <Text style={styles.cocktailProcedure}>{cocktail.procedure}</Text>
                )}
                <View style={styles.cocktailActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(cocktail)}
                  >
                    <Text style={styles.buttonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(cocktail)}
                  >
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCocktail ? 'Edit Cocktail' : 'Add Cocktail'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Cocktail Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter cocktail name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              {/* Alcohol Type */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Alcohol Type *</Text>
                <View style={styles.picker}>
                  {ALCOHOL_TYPES.map((type, index) => (
                    <TouchableOpacity
                      key={index}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        backgroundColor:
                          alcoholType === type ? managerColors.highlight : 'transparent',
                      }}
                      onPress={() => setAlcoholType(type)}
                    >
                      <Text
                        style={{
                          color: managerColors.text,
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
                <Text style={styles.formLabel}>Ingredients *</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={ingredients}
                  onChangeText={setIngredients}
                  placeholder="Enter ingredients"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Procedure */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Procedure</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={procedure}
                  onChangeText={setProcedure}
                  placeholder="Enter preparation instructions"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Image Upload */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Cocktail Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  disabled={uploadingImage}
                >
                  <Text style={styles.imagePickerButtonText}>
                    {uploadingImage ? 'Uploading...' : 'Choose Image'}
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
                style={styles.submitButton}
                onPress={handleSave}
                disabled={loading || uploadingImage}
              >
                {loading ? (
                  <ActivityIndicator color={managerColors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingCocktail ? 'Update Cocktail' : 'Add Cocktail'}
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
