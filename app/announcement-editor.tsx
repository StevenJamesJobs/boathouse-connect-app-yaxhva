
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
}

const PRIORITY_LEVELS = ['high', 'medium', 'low'];
const VISIBILITY_OPTIONS = ['everyone', 'employees', 'managers'];

export default function AnnouncementEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'medium',
    visibility: 'everyone',
    thumbnail_shape: 'square',
    display_order: 0,
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      console.log('Loading announcements from database...');
      
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading announcements:', error);
        throw error;
      }
      
      console.log('Announcements loaded successfully:', data?.length || 0, 'items');
      console.log('Announcement data:', JSON.stringify(data, null, 2));
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error loading announcements:', error);
      Alert.alert('Error', 'Failed to load announcements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: formData.thumbnail_shape === 'square' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      console.log('Starting image upload for announcement');

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Get file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('announcements')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading image:', error);
        throw error;
      }

      console.log('Upload successful:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('announcements')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert('Error', 'Please fill in title and message');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Check if we're at the limit of 10 announcements
    if (!editingAnnouncement && announcements.length >= 10) {
      Alert.alert('Limit Reached', 'You can only have up to 10 announcements. Please delete an existing announcement before adding a new one.');
      return;
    }

    try {
      let thumbnailUrl = editingAnnouncement?.thumbnail_url || null;

      // Upload image if selected
      if (selectedImageUri) {
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL:', thumbnailUrl);
        }
      }

      if (editingAnnouncement) {
        // Update existing announcement
        console.log('Updating announcement:', editingAnnouncement.id);
        const { error } = await supabase.rpc('update_announcement', {
          p_user_id: user.id,
          p_announcement_id: editingAnnouncement.id,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_priority: formData.priority,
          p_visibility: formData.visibility,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error updating announcement:', error);
          throw error;
        }
        console.log('Announcement updated successfully');
        Alert.alert('Success', 'Announcement updated successfully');
      } else {
        // Create new announcement
        console.log('Creating new announcement');
        const { error } = await supabase.rpc('create_announcement', {
          p_user_id: user.id,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_priority: formData.priority,
          p_visibility: formData.visibility,
          p_display_order: formData.display_order,
        });

        if (error) {
          console.error('Error creating announcement:', error);
          throw error;
        }
        console.log('Announcement created successfully');
        Alert.alert('Success', 'Announcement created successfully');
      }

      closeModal();
      // Reload announcements after a short delay to ensure database has updated
      setTimeout(() => {
        loadAnnouncements();
      }, 500);
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      Alert.alert('Error', error.message || 'Failed to save announcement');
    }
  };

  const handleDelete = async (announcement: Announcement) => {
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
              if (!user?.id) {
                Alert.alert('Error', 'User not authenticated');
                return;
              }

              console.log('Deleting announcement:', announcement.id);
              
              // Delete using database function
              const { error } = await supabase.rpc('delete_announcement', {
                p_user_id: user.id,
                p_announcement_id: announcement.id,
              });

              if (error) {
                console.error('Error deleting announcement:', error);
                throw error;
              }

              // Delete image if exists
              if (announcement.thumbnail_url) {
                const fileName = announcement.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('announcements')
                    .remove([fileName]);
                }
              }

              console.log('Announcement deleted successfully');
              Alert.alert('Success', 'Announcement deleted successfully');
              
              // Reload announcements after a short delay
              setTimeout(() => {
                loadAnnouncements();
              }, 500);
            } catch (error: any) {
              console.error('Error deleting announcement:', error);
              Alert.alert('Error', error.message || 'Failed to delete announcement');
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingAnnouncement(null);
    setFormData({
      title: '',
      message: '',
      priority: 'medium',
      visibility: 'everyone',
      thumbnail_shape: 'square',
      display_order: announcements.length,
    });
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const openEditModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      message: announcement.content || announcement.message || '',
      priority: announcement.priority,
      visibility: announcement.visibility,
      thumbnail_shape: announcement.thumbnail_shape,
      display_order: announcement.display_order,
    });
    setSelectedImageUri(null);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingAnnouncement(null);
    setSelectedImageUri(null);
  };

  const handleBackPress = () => {
    router.replace('/(portal)/manager/tools');
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#E74C3C';
      case 'medium':
        return '#F39C12';
      case 'low':
        return '#3498DB';
      default:
        return managerColors.textSecondary;
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'employees':
        return 'person';
      case 'managers':
        return 'person.2';
      case 'everyone':
        return 'person.3';
      default:
        return 'person.3';
    }
  };

  return (
    <View style={styles.container}>
      {/* Prominent Back Navigation Tab */}
      <View style={styles.backNavigationTab}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backTabButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.backTabText}>Back to Tools</Text>
        </TouchableOpacity>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Announcements Editor</Text>
        <Text style={styles.headerSubtitle}>
          {announcements.length} / 10 announcements
        </Text>
      </View>

      {/* Add New Announcement Button */}
      <TouchableOpacity 
        style={[styles.addNewItemButton, announcements.length >= 10 && styles.addNewItemButtonDisabled]} 
        onPress={openAddModal}
        disabled={announcements.length >= 10}
      >
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add_circle"
          size={24}
          color={announcements.length >= 10 ? managerColors.textSecondary : managerColors.text}
        />
        <Text style={[styles.addNewItemButtonText, announcements.length >= 10 && styles.addNewItemButtonTextDisabled]}>
          {announcements.length >= 10 ? 'Limit Reached (10/10)' : 'Add New Announcement'}
        </Text>
      </TouchableOpacity>

      {/* Announcements List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
          <Text style={styles.loadingText}>Loading announcements...</Text>
        </View>
      ) : (
        <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
          {announcements.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="megaphone.fill"
                android_material_icon_name="campaign"
                size={64}
                color={managerColors.textSecondary}
              />
              <Text style={styles.emptyText}>No announcements found</Text>
              <Text style={styles.emptySubtext}>
                Tap the &quot;Add New Announcement&quot; button to create one
              </Text>
            </View>
          ) : (
            announcements.map((announcement, index) => (
              <View key={index} style={styles.announcementCard}>
                {/* Display thumbnail based on shape */}
                {announcement.thumbnail_shape === 'square' && announcement.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      key={getImageUrl(announcement.thumbnail_url)}
                      source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                      style={styles.squareImage}
                    />
                    <View style={styles.squareContent}>
                      <View style={styles.announcementHeader}>
                        <Text style={styles.announcementTitle}>{announcement.title}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                          <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                        </View>
                      </View>
                      {(announcement.content || announcement.message) && (
                        <Text style={styles.squareMessage} numberOfLines={2}>
                          {announcement.content || announcement.message}
                        </Text>
                      )}
                      <View style={styles.announcementMeta}>
                        <View style={styles.metaItem}>
                          <IconSymbol
                            ios_icon_name={getVisibilityIcon(announcement.visibility)}
                            android_material_icon_name="visibility"
                            size={16}
                            color={managerColors.textSecondary}
                          />
                          <Text style={styles.metaText}>{announcement.visibility}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Text style={styles.metaText}>Order: {announcement.display_order}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    {announcement.thumbnail_url && (
                      <Image
                        key={getImageUrl(announcement.thumbnail_url)}
                        source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                        style={styles.bannerImage}
                      />
                    )}
                    <View style={styles.announcementContent}>
                      <View style={styles.announcementHeader}>
                        <Text style={styles.announcementTitle}>{announcement.title}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                          <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                        </View>
                      </View>
                      {(announcement.content || announcement.message) && (
                        <Text style={styles.announcementMessage}>
                          {announcement.content || announcement.message}
                        </Text>
                      )}
                      <View style={styles.announcementMeta}>
                        <View style={styles.metaItem}>
                          <IconSymbol
                            ios_icon_name={getVisibilityIcon(announcement.visibility)}
                            android_material_icon_name="visibility"
                            size={16}
                            color={managerColors.textSecondary}
                          />
                          <Text style={styles.metaText}>{announcement.visibility}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Text style={styles.metaText}>Order: {announcement.display_order}</Text>
                        </View>
                      </View>
                    </View>
                  </>
                )}
                <View style={styles.announcementActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(announcement)}
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
                    onPress={() => handleDelete(announcement)}
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
                {editingAnnouncement ? 'Edit Announcement' : 'Add Announcement'}
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
                <Text style={styles.formLabel}>Thumbnail Image (Optional)</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {selectedImageUri || editingAnnouncement?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedImageUri || getImageUrl(editingAnnouncement?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                      key={selectedImageUri || getImageUrl(editingAnnouncement?.thumbnail_url || '')}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add_photo_alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload image</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Thumbnail Shape */}
                <View style={styles.shapeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.shapeOption,
                      formData.thumbnail_shape === 'square' && styles.shapeOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                  >
                    <Text
                      style={[
                        styles.shapeOptionText,
                        formData.thumbnail_shape === 'square' && styles.shapeOptionTextActive,
                      ]}
                    >
                      Square
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.shapeOption,
                      formData.thumbnail_shape === 'banner' && styles.shapeOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                  >
                    <Text
                      style={[
                        styles.shapeOptionText,
                        formData.thumbnail_shape === 'banner' && styles.shapeOptionTextActive,
                      ]}
                    >
                      Banner
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Announcement Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter announcement title"
                  placeholderTextColor="#999999"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              {/* Message */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Message *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter announcement message"
                  placeholderTextColor="#999999"
                  value={formData.message}
                  onChangeText={(text) => setFormData({ ...formData, message: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Priority Level */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Priority Level</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {PRIORITY_LEVELS.map((priority, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.priority === priority && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, priority })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.priority === priority && styles.optionButtonTextActive,
                        ]}
                      >
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Visibility */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visible To</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {VISIBILITY_OPTIONS.map((visibility, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        formData.visibility === visibility && styles.optionButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, visibility })}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          formData.visibility === visibility && styles.optionButtonTextActive,
                        ]}
                      >
                        {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
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
                  Lower numbers appear first. Announcements with the same order are sorted by creation date.
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
                    {editingAnnouncement ? 'Update Announcement' : 'Add Announcement'}
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
  backNavigationTab: {
    backgroundColor: managerColors.primary,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.4)',
    elevation: 8,
  },
  backTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
  },
  backTabText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 4,
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
  addNewItemButtonDisabled: {
    backgroundColor: managerColors.card,
    opacity: 0.6,
  },
  addNewItemButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  addNewItemButtonTextDisabled: {
    color: managerColors.textSecondary,
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
  announcementCard: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  squareLayout: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  squareImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  squareContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  squareMessage: {
    fontSize: 13,
    color: managerColors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  bannerImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  announcementContent: {
    padding: 16,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  announcementTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginRight: 12,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  announcementMessage: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  announcementMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
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
  announcementActions: {
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
  shapeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  shapeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  shapeOptionActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  shapeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  shapeOptionTextActive: {
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
