
import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

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

const ALCOHOL_TYPES = ['Bourbon', 'Brandy', 'Cognac', 'Gin', 'Rum', 'Tequila', 'Vodka', 'Whiskey', 'Other'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function CocktailsAZEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCocktail, setEditingCocktail] = useState<Cocktail | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    alcohol_type: 'Vodka',
    ingredients: '',
    procedure: '',
    display_order: 0,
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  useEffect(() => {
    loadCocktails();
  }, []);

  useEffect(() => {
    filterCocktails();
  }, [cocktails, searchQuery, selectedLetter, filterCocktails]);

  const loadCocktails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cocktails')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      console.log('Loaded cocktails:', data);
      setCocktails(data || []);
    } catch (error) {
      console.error('Error loading cocktails:', error);
      Alert.alert('Error', 'Failed to load cocktails');
    } finally {
      setLoading(false);
    }
  };

  const filterCocktails = () => {
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
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
        console.log('Image selected:', result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      console.log('Starting image upload for cocktail, URI:', uri);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('File read as base64, length:', base64.length);

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      console.log('Converted to byte array, size:', byteArray.length);

      // Get file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image with filename:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      console.log('Content type:', contentType);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('cocktail-images')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading image to storage:', error);
        Alert.alert('Upload Error', `Failed to upload image: ${error.message}`);
        throw error;
      }

      console.log('Upload successful, data:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('cocktail-images')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error in uploadImage function:', error);
      Alert.alert('Error', `Failed to upload image: ${error.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.ingredients || !formData.procedure) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      let thumbnailUrl = editingCocktail?.thumbnail_url || null;

      console.log('Starting save process...');
      console.log('Current thumbnail URL:', thumbnailUrl);
      console.log('Selected image URI:', selectedImageUri);

      // Upload image if selected
      if (selectedImageUri) {
        console.log('Uploading new image...');
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL set:', thumbnailUrl);
        } else {
          console.error('Image upload returned null');
          Alert.alert('Warning', 'Image upload failed. Saving cocktail without image.');
        }
      }

      console.log('Final thumbnail URL to save:', thumbnailUrl);

      if (editingCocktail) {
        // Update existing cocktail
        console.log('Updating cocktail with ID:', editingCocktail.id);
        const { error } = await supabase.rpc('update_cocktail', {
          p_user_id: user.id,
          p_cocktail_id: editingCocktail.id,
          p_name: formData.name,
          p_alcohol_type: formData.alcohol_type,
          p_ingredients: formData.ingredients,
          p_procedure: formData.procedure,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error updating cocktail:', error);
          throw error;
        }
        console.log('Cocktail updated successfully with thumbnail URL:', thumbnailUrl);
        Alert.alert('Success', 'Cocktail updated successfully');
      } else {
        // Create new cocktail
        console.log('Creating new cocktail...');
        const { error } = await supabase.rpc('create_cocktail', {
          p_user_id: user.id,
          p_name: formData.name,
          p_alcohol_type: formData.alcohol_type,
          p_ingredients: formData.ingredients,
          p_procedure: formData.procedure,
          p_thumbnail_url: thumbnailUrl,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error creating cocktail:', error);
          throw error;
        }
        console.log('Cocktail created successfully with thumbnail URL:', thumbnailUrl);
        Alert.alert('Success', 'Cocktail created successfully');
      }

      closeModal();
      loadCocktails();
    } catch (error: any) {
      console.error('Error saving cocktail:', error);
      Alert.alert('Error', error.message || 'Failed to save cocktail');
    }
  };

  const handleDelete = async (cocktail: Cocktail) => {
    Alert.alert(
      'Delete Cocktail',
      `Are you sure you want to delete "${cocktail.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert('Error', 'User not authenticated');
                return;
              }

              // Delete using database function
              const { error } = await supabase.rpc('delete_cocktail', {
                p_user_id: user.id,
                p_cocktail_id: cocktail.id,
              });

              if (error) {
                console.error('Error deleting cocktail:', error);
                throw error;
              }

              // Delete image if exists
              if (cocktail.thumbnail_url) {
                const fileName = cocktail.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('cocktail-images')
                    .remove([fileName]);
                }
              }

              Alert.alert('Success', 'Cocktail deleted successfully');
              loadCocktails();
            } catch (error: any) {
              console.error('Error deleting cocktail:', error);
              Alert.alert('Error', error.message || 'Failed to delete cocktail');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingCocktail(null);
    setFormData({
      name: '',
      alcohol_type: 'Vodka',
      ingredients: '',
      procedure: '',
      display_order: 0,
    });
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const openEditModal = (cocktail: Cocktail) => {
    setEditingCocktail(cocktail);
    setFormData({
      name: cocktail.name,
      alcohol_type: cocktail.alcohol_type,
      ingredients: cocktail.ingredients,
      procedure: cocktail.procedure,
      display_order: cocktail.display_order,
    });
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingCocktail(null);
    setSelectedImageUri(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  return (
    <View style={styles.container}>
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

      {/* Add New Cocktail Button */}
      <TouchableOpacity style={styles.addNewButton} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={managerColors.text}
        />
        <Text style={styles.addNewButtonText}>Add New Cocktail</Text>
      </TouchableOpacity>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={managerColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ingredient, or alcohol type..."
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

      <View style={styles.contentContainer}>
        {/* Cocktails List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={managerColors.highlight} />
          </View>
        ) : (
          <ScrollView style={styles.cocktailsList} contentContainerStyle={styles.cocktailsListContent}>
            {filteredCocktails.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={64}
                  color={managerColors.textSecondary}
                />
                <Text style={styles.emptyText}>No cocktails found</Text>
                <Text style={styles.emptySubtext}>
                  Tap &quot;Add New Cocktail&quot; to create one
                </Text>
              </View>
            ) : (
              filteredCocktails.map((cocktail, index) => (
                <View key={index} style={styles.cocktailCard}>
                  <View style={styles.cocktailInfo}>
                    <Text style={styles.cocktailName}>{cocktail.name}</Text>
                    <Text style={styles.cocktailAlcoholType}>{cocktail.alcohol_type}</Text>
                    {cocktail.thumbnail_url && (
                      <View style={styles.thumbnailIndicator}>
                        <IconSymbol
                          ios_icon_name="photo"
                          android_material_icon_name="image"
                          size={16}
                          color={managerColors.highlight}
                        />
                        <Text style={styles.thumbnailIndicatorText}>Has thumbnail</Text>
                      </View>
                    )}
                    <View style={styles.displayOrderBadge}>
                      <Text style={styles.displayOrderText}>Order: {cocktail.display_order}</Text>
                    </View>
                  </View>
                  <View style={styles.cocktailActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => openEditModal(cocktail)}
                    >
                      <IconSymbol
                        ios_icon_name="pencil"
                        android_material_icon_name="edit"
                        size={20}
                        color={managerColors.highlight}
                      />
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => handleDelete(cocktail)}
                    >
                      <IconSymbol
                        ios_icon_name="trash"
                        android_material_icon_name="delete"
                        size={20}
                        color="#E74C3C"
                      />
                      <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Alphabetical Navigation Bar */}
        <View style={styles.alphabetNav}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.alphabetNavContent}
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
        </View>
      </View>

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
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
                  color="#666666"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Image Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Thumbnail Image</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {selectedImageUri || editingCocktail?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedImageUri || getImageUrl(editingCocktail?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                      key={selectedImageUri || getImageUrl(editingCocktail?.thumbnail_url || '')}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload image</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {selectedImageUri && (
                  <TouchableOpacity 
                    style={styles.removeImageButton}
                    onPress={() => setSelectedImageUri(null)}
                  >
                    <Text style={styles.removeImageButtonText}>Remove Selected Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter cocktail name"
                  placeholderTextColor="#999999"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              {/* Alcohol Type */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Alcohol Type *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {ALCOHOL_TYPES.map((type, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.alcohol_type === type && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, alcohol_type: type })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.alcohol_type === type && styles.optionButtonTextActive,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Ingredients */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ingredients *</Text>
                <Text style={styles.formHint}>
                  Enter each ingredient on a separate line with measurements
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g., 2 oz. vodka&#10;1 oz. sour apple liqueur&#10;0.25 oz. lemon juice"
                  placeholderTextColor="#999999"
                  value={formData.ingredients}
                  onChangeText={(text) => setFormData({ ...formData, ingredients: text })}
                  multiline
                  numberOfLines={6}
                />
              </View>

              {/* Procedure */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Procedure *</Text>
                <Text style={styles.formHint}>
                  Enter the preparation instructions, glass type, and garnish
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g., - shake w/ ice, strain&#10;*Glass: martini&#10;*Garnish: cherry"
                  placeholderTextColor="#999999"
                  value={formData.procedure}
                  onChangeText={(text) => setFormData({ ...formData, procedure: text })}
                  multiline
                  numberOfLines={6}
                />
              </View>

              {/* Display Order */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter display order (e.g., 1, 2, 3...)"
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>
                  Lower numbers appear first. Items with the same order are sorted alphabetically.
                </Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator color="#1A1A1A" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingCocktail ? 'Update Cocktail' : 'Add Cocktail'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

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
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
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
  addNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
    gap: 10,
  },
  addNewButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: managerColors.text,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 16,
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
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  cocktailCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  cocktailInfo: {
    marginBottom: 12,
  },
  cocktailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  cocktailAlcoholType: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 8,
  },
  thumbnailIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  thumbnailIndicatorText: {
    fontSize: 12,
    color: managerColors.highlight,
    fontWeight: '600',
  },
  displayOrderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  displayOrderText: {
    fontSize: 11,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  cocktailActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
    paddingTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.background,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  deleteButton: {
    backgroundColor: '#2C1F1F',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  deleteButtonText: {
    color: '#E74C3C',
  },
  alphabetNav: {
    width: 40,
    backgroundColor: managerColors.card,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    marginRight: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
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
  alphabetButtonActive: {
    backgroundColor: managerColors.highlight,
  },
  alphabetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  alphabetButtonTextActive: {
    color: managerColors.text,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '95%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  formHint: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  imageUploadButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imageUploadPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageUploadText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
  },
  uploadedImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  removeImageButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  removeImageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E74C3C',
  },
  optionsScroll: {
    maxHeight: 50,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionButtonActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  optionButtonTextActive: {
    color: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
});
