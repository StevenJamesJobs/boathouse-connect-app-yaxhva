
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

interface Announcement {
  id: string;
  title: string;
  content: string;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  priority: string;
  visibility: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const VISIBILITIES = ['All', 'Employees Only', 'Managers Only'];

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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    backgroundColor: managerColors.primary,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  scrollContent: {
    padding: 20,
  },
  announcementCard: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: managerColors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    color: managerColors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  cardMeta: {
    fontSize: 12,
    color: managerColors.textSecondary,
    marginBottom: 3,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: managerColors.border,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 12,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: managerColors.text,
    marginBottom: 12,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  imagePickerButton: {
    backgroundColor: managerColors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePickerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: managerColors.primary,
  },
  cancelButton: {
    backgroundColor: managerColors.textSecondary,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function AnnouncementEditorScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [visibility, setVisibility] = useState('All');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const { user } = useAuth();
  const router = useRouter();

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error: any) {
      console.error('Error loading announcements:', error);
      Alert.alert('Error', 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64);
      const fileName = `announcement-${Date.now()}.jpg`;

      const { data, error } = await supabase.storage
        .from('announcement-images')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('announcement-images')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error: any) {
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

    try {
      setSaving(true);
      let finalThumbnailUrl = thumbnailUrl;

      if (thumbnailUri && thumbnailUri !== thumbnailUrl) {
        const uploadedUrl = await uploadImage(thumbnailUri);
        if (uploadedUrl) {
          finalThumbnailUrl = uploadedUrl;
        }
      }

      const announcementData = {
        title: title.trim(),
        content: content.trim(),
        message: message.trim() || null,
        thumbnail_url: finalThumbnailUrl,
        thumbnail_shape: 'square',
        priority,
        visibility,
        display_order: parseInt(displayOrder) || 0,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update(announcementData)
          .eq('id', editingId);

        if (error) throw error;
        Alert.alert('Success', 'Announcement updated successfully');
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert([announcementData]);

        if (error) throw error;
        Alert.alert('Success', 'Announcement created successfully');
      }

      closeModal();
      loadAnnouncements();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      Alert.alert('Error', error.message || 'Failed to save announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (announcement: Announcement) => {
    Alert.alert(
      'Delete Announcement',
      `Are you sure you want to delete "${announcement.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('announcements')
                .delete()
                .eq('id', announcement.id);

              if (error) throw error;
              Alert.alert('Success', 'Announcement deleted successfully');
              loadAnnouncements();
            } catch (error: any) {
              console.error('Error deleting announcement:', error);
              Alert.alert('Error', 'Failed to delete announcement');
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

  const openEditModal = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setContent(announcement.content);
    setMessage(announcement.message || '');
    setPriority(announcement.priority);
    setVisibility(announcement.visibility);
    setDisplayOrder(announcement.display_order.toString());
    setIsActive(announcement.is_active);
    setThumbnailUrl(announcement.thumbnail_url);
    setThumbnailUri(announcement.thumbnail_url);
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
    setPriority('Medium');
    setVisibility('All');
    setDisplayOrder('0');
    setIsActive(true);
    setThumbnailUri(null);
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent':
        return '#DC2626';
      case 'High':
        return '#EA580C';
      case 'Medium':
        return '#CA8A04';
      case 'Low':
        return '#16A34A';
      default:
        return managerColors.textSecondary;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Announcements Editor</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent}>
        {announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="megaphone" size={48} color={managerColors.textSecondary} />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        ) : (
          announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcementCard}>
              <View style={styles.cardContent}>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                  <Text style={styles.priorityText}>{announcement.priority}</Text>
                </View>
                <Text style={styles.cardTitle}>{announcement.title}</Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {announcement.content}
                </Text>
                <Text style={styles.cardMeta}>Display Order: {announcement.display_order}</Text>
                <Text style={styles.cardMeta}>Visibility: {announcement.visibility}</Text>
                
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(announcement)}
                  >
                    <IconSymbol name="pencil" size={14} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(announcement)}
                  >
                    <IconSymbol name="trash" size={14} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {announcement.thumbnail_url && (
                <Image
                  source={{ uri: announcement.thumbnail_url }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Announcement' : 'New Announcement'}
              </Text>

              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Enter title"
                placeholderTextColor={managerColors.textSecondary}
              />

              <Text style={styles.label}>Content *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={content}
                onChangeText={setContent}
                placeholder="Enter content"
                placeholderTextColor={managerColors.textSecondary}
                multiline
              />

              <Text style={styles.label}>Short Message (Optional)</Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Enter short message"
                placeholderTextColor={managerColors.textSecondary}
              />

              <Text style={styles.label}>Priority</Text>
              <View style={styles.pickerContainer}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.pickerOption,
                      priority === p && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        priority === p && styles.pickerOptionTextSelected,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Visibility</Text>
              <View style={styles.pickerContainer}>
                {VISIBILITIES.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.pickerOption,
                      visibility === v && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setVisibility(v)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        visibility === v && styles.pickerOptionTextSelected,
                      ]}
                    >
                      {v}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Display Order</Text>
              <TextInput
                style={styles.input}
                value={displayOrder}
                onChangeText={setDisplayOrder}
                placeholder="0"
                placeholderTextColor={managerColors.textSecondary}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Thumbnail Image</Text>
              <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                <Text style={styles.imagePickerText}>
                  {thumbnailUri ? 'Change Image' : 'Select Image'}
                </Text>
              </TouchableOpacity>

              {thumbnailUri && (
                <Image source={{ uri: thumbnailUri }} style={styles.selectedImage} />
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
