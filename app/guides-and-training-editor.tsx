
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';

interface GuideItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  file_url: string;
  file_type: string;
  file_name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function GuidesAndTrainingEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [guides, setGuides] = useState<GuideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGuide, setEditingGuide] = useState<GuideItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Employee HandBooks');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Employee HandBooks',
    display_order: 0,
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    loadGuides();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Guides and training editor screen focused, refreshing data...');
      loadGuides();
    }, [])
  );

  const loadGuides = async () => {
    try {
      setLoading(true);
      console.log('Loading guides and training items from database...');
      
      const { data, error } = await supabase
        .from('guides_and_training')
        .select('*')
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading guides:', error);
        throw error;
      }
      
      console.log('Guides loaded successfully:', data?.length || 0, 'items');
      setGuides(data || []);
    } catch (error) {
      console.error('Error loading guides:', error);
      Alert.alert('Error', 'Failed to load guides. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pickThumbnail = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedThumbnailUri(result.assets[0].uri);
        console.log('Thumbnail selected:', result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking thumbnail:', error);
      Alert.alert('Error', 'Failed to pick thumbnail');
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        });
        console.log('File selected:', file.name);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const uploadThumbnail = async (uri: string): Promise<string | null> => {
    try {
      setUploadingThumbnail(true);
      console.log('Starting thumbnail upload from URI:', uri);

      // Read file as base64
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

      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `thumbnail_${Date.now()}.${ext}`;

      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      console.log('Uploading to storage:', fileName, 'Type:', contentType);

      const { data, error } = await supabase.storage
        .from('guides-and-training')
        .upload(`thumbnails/${fileName}`, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw error;
      }

      console.log('Upload successful, getting public URL...');

      const { data: urlData } = supabase.storage
        .from('guides-and-training')
        .getPublicUrl(`thumbnails/${fileName}`);

      console.log('Public URL obtained:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error uploading thumbnail:', error);
      Alert.alert('Error', `Failed to upload thumbnail: ${error.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const uploadFile = async (file: { uri: string; name: string; type: string }): Promise<{ url: string; type: string } | null> => {
    try {
      setUploadingFile(true);
      console.log('Starting file upload:', file.name, 'from URI:', file.uri);

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
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

      const fileName = `${Date.now()}_${file.name}`;

      console.log('Uploading to storage:', fileName, 'Type:', file.type);

      const { data, error } = await supabase.storage
        .from('guides-and-training')
        .upload(`files/${fileName}`, byteArray, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw error;
      }

      console.log('Upload successful, getting public URL...');

      const { data: urlData } = supabase.storage
        .from('guides-and-training')
        .getPublicUrl(`files/${fileName}`);

      console.log('Public URL obtained:', urlData.publicUrl);
      return { url: urlData.publicUrl, type: file.type };
    } catch (error: any) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', `Failed to upload file: ${error.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (!editingGuide && !selectedFile) {
      Alert.alert('Error', 'Please select a file to upload');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      let thumbnailUrl = editingGuide?.thumbnail_url || null;
      let fileUrl = editingGuide?.file_url || '';
      let fileType = editingGuide?.file_type || '';
      let fileName = editingGuide?.file_name || '';

      // Upload thumbnail if selected
      if (selectedThumbnailUri) {
        console.log('Uploading new thumbnail...');
        const uploadedUrl = await uploadThumbnail(selectedThumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('Thumbnail uploaded successfully');
        } else {
          console.log('Thumbnail upload failed, continuing without thumbnail');
        }
      }

      // Upload file if selected
      if (selectedFile) {
        console.log('Uploading new file...');
        const uploadedFile = await uploadFile(selectedFile);
        if (uploadedFile) {
          fileUrl = uploadedFile.url;
          fileType = uploadedFile.type;
          fileName = selectedFile.name;
          console.log('File uploaded successfully');
        } else {
          Alert.alert('Error', 'Failed to upload file');
          return;
        }
      }

      if (editingGuide) {
        console.log('Updating guide:', editingGuide.id);
        const { error } = await supabase
          .from('guides_and_training')
          .update({
            title: formData.title,
            description: formData.description || null,
            category: formData.category,
            thumbnail_url: thumbnailUrl,
            file_url: fileUrl,
            file_type: fileType,
            file_name: fileName,
            display_order: formData.display_order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGuide.id);

        if (error) {
          console.error('Error updating guide:', error);
          throw error;
        }
        Alert.alert('Success', 'Guide updated successfully');
      } else {
        console.log('Creating new guide');
        const { error } = await supabase
          .from('guides_and_training')
          .insert({
            title: formData.title,
            description: formData.description || null,
            category: formData.category,
            thumbnail_url: thumbnailUrl,
            file_url: fileUrl,
            file_type: fileType,
            file_name: fileName,
            display_order: formData.display_order,
            created_by: user.id,
          });

        if (error) {
          console.error('Error creating guide:', error);
          throw error;
        }
        Alert.alert('Success', 'Guide created successfully');
      }

      closeModal();
      await loadGuides();
    } catch (error: any) {
      console.error('Error saving guide:', error);
      Alert.alert('Error', error.message || 'Failed to save guide');
    }
  };

  const handleDelete = async (guide: GuideItem) => {
    Alert.alert(
      'Delete Guide',
      `Are you sure you want to delete "${guide.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Deleting guide:', guide.id);
              
              const { error } = await supabase
                .from('guides_and_training')
                .delete()
                .eq('id', guide.id);

              if (error) {
                console.error('Error deleting guide:', error);
                throw error;
              }

              // Delete files from storage
              if (guide.thumbnail_url) {
                const thumbnailPath = guide.thumbnail_url.split('/').slice(-2).join('/');
                await supabase.storage.from('guides-and-training').remove([thumbnailPath]);
              }
              if (guide.file_url) {
                const filePath = guide.file_url.split('/').slice(-2).join('/');
                await supabase.storage.from('guides-and-training').remove([filePath]);
              }

              Alert.alert('Success', 'Guide deleted successfully');
              await loadGuides();
            } catch (error: any) {
              console.error('Error deleting guide:', error);
              Alert.alert('Error', error.message || 'Failed to delete guide');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingGuide(null);
    setFormData({
      title: '',
      description: '',
      category: selectedCategory,
      display_order: guides.filter(g => g.category === selectedCategory).length,
    });
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    setShowAddModal(true);
  };

  const openEditModal = (guide: GuideItem) => {
    setEditingGuide(guide);
    setFormData({
      title: guide.title,
      description: guide.description || '',
      category: guide.category,
      display_order: guide.display_order,
    });
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingGuide(null);
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
  };

  const handleBackPress = () => {
    router.replace('/(portal)/manager/manage');
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredGuides = guides.filter(g => g.category === selectedCategory);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guides and Training Editor</Text>
        <View style={styles.backButton} />
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        {CATEGORIES.map((category, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.categoryTab,
              selectedCategory === category && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryTabText,
                selectedCategory === category && styles.categoryTabTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.addNewItemButton} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={managerColors.text}
        />
        <Text style={styles.addNewItemButtonText}>Add New Guide</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
          <Text style={styles.loadingText}>Loading guides...</Text>
        </View>
      ) : (
        <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
          {filteredGuides.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="book.fill"
                android_material_icon_name="restaurant"
                size={64}
                color={managerColors.textSecondary}
              />
              <Text style={styles.emptyText}>No guides in this category</Text>
              <Text style={styles.emptySubtext}>
                Tap &quot;Add New Guide&quot; to create one
              </Text>
            </View>
          ) : (
            filteredGuides.map((guide, index) => (
              <View key={index} style={styles.guideCard}>
                <View style={styles.guideLayout}>
                  {guide.thumbnail_url && (
                    <Image
                      source={{ uri: getImageUrl(guide.thumbnail_url) }}
                      style={styles.guideThumbnail}
                    />
                  )}
                  <View style={styles.guideContent}>
                    <Text style={styles.guideTitle}>{guide.title}</Text>
                    {guide.description && (
                      <Text style={styles.guideDescription} numberOfLines={2}>
                        {guide.description}
                      </Text>
                    )}
                    <View style={styles.guideMeta}>
                      <View style={styles.metaItem}>
                        <IconSymbol
                          ios_icon_name="doc.fill"
                          android_material_icon_name="description"
                          size={14}
                          color={managerColors.textSecondary}
                        />
                        <Text style={styles.metaText}>{guide.file_name}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <IconSymbol
                          ios_icon_name="clock"
                          android_material_icon_name="schedule"
                          size={14}
                          color={managerColors.textSecondary}
                        />
                        <Text style={styles.metaText}>
                          Updated: {formatDate(guide.updated_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.guideActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(guide)}
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
                    onPress={() => handleDelete(guide)}
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
                {editingGuide ? 'Edit Guide' : 'Add Guide'}
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
              {/* Thumbnail Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Thumbnail (Optional)</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickThumbnail}>
                  {selectedThumbnailUri || editingGuide?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedThumbnailUri || getImageUrl(editingGuide?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload thumbnail</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* File Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>File *</Text>
                <TouchableOpacity style={styles.fileUploadButton} onPress={pickFile}>
                  <IconSymbol
                    ios_icon_name="doc.fill"
                    android_material_icon_name="description"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.fileUploadText}>
                    {selectedFile ? selectedFile.name : editingGuide ? editingGuide.file_name : 'Select File'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter title"
                  placeholderTextColor="#999999"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter description"
                  placeholderTextColor="#999999"
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {CATEGORIES.map((category, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.category === category && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, category })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.category === category && styles.optionButtonTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
                  Lower numbers appear first
                </Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={uploadingFile || uploadingThumbnail}
              >
                {uploadingFile || uploadingThumbnail ? (
                  <ActivityIndicator color="#1A1A1A" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingGuide ? 'Update Guide' : 'Add Guide'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
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
  categoryScroll: {
    marginTop: 16,
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: managerColors.highlight,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  categoryTabTextActive: {
    color: managerColors.text,
  },
  addNewItemButton: {
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
  addNewItemButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 12,
  },
  itemsList: {
    flex: 1,
    marginTop: 16,
  },
  itemsListContent: {
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
    color: managerColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  guideCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  guideLayout: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  guideThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  guideContent: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 6,
  },
  guideDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  guideMeta: {
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  guideActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: managerColors.border,
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
    marginTop: 6,
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
    height: 100,
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
    height: 150,
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
    height: 150,
    resizeMode: 'cover',
  },
  fileUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  fileUploadText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
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
