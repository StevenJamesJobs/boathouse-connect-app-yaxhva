
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as FileSystem from 'expo-file-system';
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
import { managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';

interface SpecialFeature {
  id: string;
  title: string;
  content: string;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  start_date_time: string | null;
  end_date_time: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 5,
  },
  addButton: {
    padding: 5,
  },
  listContainer: {
    padding: 15,
  },
  itemCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    padding: 5,
  },
  itemContent: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 8,
  },
  itemDateTime: {
    fontSize: 13,
    color: managerColors.primary,
    marginBottom: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  metaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 5,
  },
  input: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: managerColors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pickerOption: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: managerColors.border,
    backgroundColor: managerColors.background,
  },
  pickerOptionSelected: {
    backgroundColor: managerColors.primary,
    borderColor: managerColors.primary,
  },
  pickerOptionText: {
    fontSize: 14,
    color: managerColors.text,
  },
  pickerOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  imagePickerButton: {
    backgroundColor: managerColors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  imagePickerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: managerColors.primary,
  },
  cancelButton: {
    backgroundColor: managerColors.textSecondary,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function SpecialFeaturesEditorScreen() {
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [link, setLink] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailShape, setThumbnailShape] = useState('square');
  const [isActive, setIsActive] = useState(true);

  const { user } = useAuth();
  const router = useRouter();

  const loadFeatures = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('special_features')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setFeatures(data || []);
    } catch (error) {
      console.error('Error loading features:', error);
      Alert.alert('Error', 'Failed to load special features');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: thumbnailShape === 'square' ? [1, 1] : [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileName = `feature-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('feature-images')
        .upload(fileName, decode(base64), {
          contentType: 'image/jpeg',
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('feature-images')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
      return null;
    }
  };

  const decode = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      let thumbnailUrl = null;
      if (thumbnailUri && !thumbnailUri.startsWith('http')) {
        thumbnailUrl = await uploadImage(thumbnailUri);
      } else {
        thumbnailUrl = thumbnailUri;
      }

      const featureData = {
        title: title.trim(),
        content: content.trim(),
        message: message.trim() || null,
        thumbnail_url: thumbnailUrl,
        thumbnail_shape: thumbnailShape,
        start_date_time: startDateTime || null,
        end_date_time: endDateTime || null,
        link: link.trim() || null,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from('special_features')
          .update(featureData)
          .eq('id', editingId);

        if (error) throw error;
        Alert.alert('Success', 'Special feature updated successfully');
      } else {
        const { error } = await supabase
          .from('special_features')
          .insert([featureData]);

        if (error) throw error;
        Alert.alert('Success', 'Special feature created successfully');
      }

      closeModal();
      loadFeatures();
    } catch (error) {
      console.error('Error saving feature:', error);
      Alert.alert('Error', 'Failed to save special feature');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (feature: SpecialFeature) => {
    Alert.alert(
      'Delete Special Feature',
      `Are you sure you want to delete "${feature.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('special_features')
                .delete()
                .eq('id', feature.id);

              if (error) throw error;
              Alert.alert('Success', 'Special feature deleted successfully');
              loadFeatures();
            } catch (error) {
              console.error('Error deleting feature:', error);
              Alert.alert('Error', 'Failed to delete special feature');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (feature: SpecialFeature) => {
    setEditingId(feature.id);
    setTitle(feature.title);
    setContent(feature.content);
    setMessage(feature.message || '');
    setStartDateTime(feature.start_date_time || '');
    setEndDateTime(feature.end_date_time || '');
    setLink(feature.link || '');
    setThumbnailUri(feature.thumbnail_url);
    setThumbnailShape(feature.thumbnail_shape);
    setIsActive(feature.is_active);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setMessage('');
    setStartDateTime('');
    setEndDateTime('');
    setLink('');
    setThumbnailUri(null);
    setThumbnailShape('square');
    setIsActive(true);
  };

  const handleBackPress = () => {
    router.back();
  };

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return 'Not set';
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Special Features Editor</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listContainer}>
        {features.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="star" size={48} color={managerColors.textSecondary} />
            <Text style={styles.emptyText}>No special features yet</Text>
          </View>
        ) : (
          features.map((feature) => (
            <View key={feature.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{feature.title}</Text>
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    onPress={() => openEditModal(feature)}
                    style={styles.actionButton}
                  >
                    <IconSymbol name="pencil" size={20} color={managerColors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(feature)}
                    style={styles.actionButton}
                  >
                    <IconSymbol name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.itemContent} numberOfLines={2}>
                {feature.content}
              </Text>
              {feature.start_date_time && (
                <Text style={styles.itemDateTime}>
                  ⭐ {formatDateTime(feature.start_date_time)}
                </Text>
              )}
              {feature.thumbnail_url && (
                <Image
                  source={{ uri: feature.thumbnail_url }}
                  style={styles.thumbnail}
                />
              )}
              <View style={styles.itemMeta}>
                <View
                  style={[
                    styles.metaBadge,
                    {
                      backgroundColor: feature.is_active
                        ? '#34C759'
                        : '#8E8E93',
                    },
                  ]}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>
                    {feature.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContent}
          >
            <ScrollView>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Special Feature' : 'New Special Feature'}
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Enter title"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Content *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={content}
                  onChangeText={setContent}
                  placeholder="Enter content"
                  placeholderTextColor={managerColors.textSecondary}
                  multiline
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Message (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Enter message"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Start Date/Time (YYYY-MM-DD HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={startDateTime}
                  onChangeText={setStartDateTime}
                  placeholder="2024-12-31 18:00"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>End Date/Time (YYYY-MM-DD HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={endDateTime}
                  onChangeText={setEndDateTime}
                  placeholder="2024-12-31 23:00"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail Shape</Text>
                <View style={styles.pickerContainer}>
                  {['square', 'wide'].map((shape) => (
                    <TouchableOpacity
                      key={shape}
                      onPress={() => setThumbnailShape(shape)}
                      style={[
                        styles.pickerOption,
                        thumbnailShape === shape && styles.pickerOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          thumbnailShape === shape && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {shape.charAt(0).toUpperCase() + shape.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Thumbnail</Text>
                <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
                  <Text style={styles.imagePickerText}>
                    {thumbnailUri ? 'Change Image' : 'Pick Image'}
                  </Text>
                </TouchableOpacity>
                {thumbnailUri && (
                  <Image source={{ uri: thumbnailUri }} style={styles.previewImage} />
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Link (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={link}
                  onChangeText={setLink}
                  placeholder="Enter link URL"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.pickerContainer}>
                  <TouchableOpacity
                    onPress={() => setIsActive(true)}
                    style={[
                      styles.pickerOption,
                      isActive && styles.pickerOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        isActive && styles.pickerOptionTextSelected,
                      ]}
                    >
                      Active
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIsActive(false)}
                    style={[
                      styles.pickerOption,
                      !isActive && styles.pickerOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        !isActive && styles.pickerOptionTextSelected,
                      ]}
                    >
                      Inactive
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={closeModal}
                  style={[styles.modalButton, styles.cancelButton]}
                  disabled={saving}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.modalButton, styles.saveButton]}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
