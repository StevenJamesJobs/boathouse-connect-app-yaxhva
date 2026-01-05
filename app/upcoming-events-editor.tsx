
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

interface UpcomingEvent {
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
  eventCard: {
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

export default function UpcomingEventsEditorScreen() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const { user } = useAuth();
  const router = useRouter();

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('upcoming_events')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error loading events:', error);
      Alert.alert('Error', 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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
      const fileName = `event-${Date.now()}.jpg`;

      const { data, error } = await supabase.storage
        .from('event-images')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('event-images')
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

      const eventData = {
        title: title.trim(),
        content: content.trim(),
        message: message.trim() || null,
        thumbnail_url: finalThumbnailUrl,
        thumbnail_shape: 'square',
        start_date_time: startDateTime || null,
        end_date_time: endDateTime || null,
        display_order: parseInt(displayOrder) || 0,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from('upcoming_events')
          .update(eventData)
          .eq('id', editingId);

        if (error) throw error;
        Alert.alert('Success', 'Event updated successfully');
      } else {
        const { error } = await supabase
          .from('upcoming_events')
          .insert([eventData]);

        if (error) throw error;
        Alert.alert('Success', 'Event created successfully');
      }

      closeModal();
      loadEvents();
    } catch (error: any) {
      console.error('Error saving event:', error);
      Alert.alert('Error', error.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (event: UpcomingEvent) => {
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('upcoming_events')
                .delete()
                .eq('id', event.id);

              if (error) throw error;
              Alert.alert('Success', 'Event deleted successfully');
              loadEvents();
            } catch (error: any) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event');
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

  const openEditModal = (event: UpcomingEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setContent(event.content);
    setMessage(event.message || '');
    setStartDateTime(event.start_date_time || '');
    setEndDateTime(event.end_date_time || '');
    setDisplayOrder(event.display_order.toString());
    setIsActive(event.is_active);
    setThumbnailUrl(event.thumbnail_url);
    setThumbnailUri(event.thumbnail_url);
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
    setDisplayOrder('0');
    setIsActive(true);
    setThumbnailUri(null);
    setThumbnailUrl(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return 'Not set';
    try {
      const date = new Date(dateTime);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateTime;
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
        <Text style={styles.headerTitle}>Upcoming Events Editor</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <IconSymbol name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent}>
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="calendar" size={48} color={managerColors.textSecondary} />
            <Text style={styles.emptyText}>No events yet</Text>
          </View>
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{event.title}</Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {event.content}
                </Text>
                <Text style={styles.cardMeta}>Start: {formatDateTime(event.start_date_time)}</Text>
                <Text style={styles.cardMeta}>End: {formatDateTime(event.end_date_time)}</Text>
                <Text style={styles.cardMeta}>Display Order: {event.display_order}</Text>
                
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(event)}
                  >
                    <IconSymbol name="pencil" size={14} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(event)}
                  >
                    <IconSymbol name="trash" size={14} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {event.thumbnail_url && (
                <Image
                  source={{ uri: event.thumbnail_url }}
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
                {editingId ? 'Edit Event' : 'New Event'}
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

              <Text style={styles.label}>Start Date/Time (YYYY-MM-DD HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startDateTime}
                onChangeText={setStartDateTime}
                placeholder="2024-01-01 18:00"
                placeholderTextColor={managerColors.textSecondary}
              />

              <Text style={styles.label}>End Date/Time (YYYY-MM-DD HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={endDateTime}
                onChangeText={setEndDateTime}
                placeholder="2024-01-01 22:00"
                placeholderTextColor={managerColors.textSecondary}
              />

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
