
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
import { useFocusEffect } from '@react-navigation/native';

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

interface GuideFile {
  id: string;
  title: string;
  category: string;
  file_name: string;
}

const PRIORITY_LEVELS = ['high', 'medium', 'low'];
const VISIBILITY_OPTIONS = ['everyone', 'employees', 'managers'];
const GUIDE_CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function AnnouncementEditorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guideFiles, setGuideFiles] = useState<GuideFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [selectedGuideFile, setSelectedGuideFile] = useState<GuideFile | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [showFileSection, setShowFileSection] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'medium',
    visibility: 'everyone',
    thumbnail_shape: 'square',
    display_order: 0,
    link: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  useEffect(() => {
    loadAnnouncements();
    loadGuideFiles();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Announcement editor screen focused, refreshing data...');
      loadAnnouncements();
      loadGuideFiles();
    }, [])
  );

  const loadGuideFiles = async () => {
    try {
      console.log('Loading guide files from database...');
      
      const { data, error } = await supabase
        .from('guides_and_training')
        .select('id, title, category, file_name')
        .in('category', GUIDE_CATEGORIES)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('title', { ascending: true });

      if (error) {
        console.error('Error loading guide files:', error);
        throw error;
      }
      
      console.log('Guide files loaded successfully:', data?.length || 0, 'items');
      setGuideFiles(data || []);
    } catch (error) {
      console.error('Error loading guide files:', error);
    }
  };

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

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}.${ext}`;

      console.log('Uploading image:', fileName);

      let contentType = 'image/jpeg';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';

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

    if (!editingAnnouncement && announcements.length >= 10) {
      Alert.alert('Limit Reached', 'You can only have up to 10 announcements. Please delete an existing announcement before adding a new one.');
      return;
    }

    try {
      let thumbnailUrl = editingAnnouncement?.thumbnail_url || null;

      if (selectedImageUri) {
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL:', thumbnailUrl);
        }
      }

      const linkValue = formData.link.trim() || null;
      const guideFileId = selectedGuideFile?.id || null;

      if (editingAnnouncement) {
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
          p_link: linkValue,
          p_guide_file_id: guideFileId,
        });

        if (error) {
          console.error('Error updating announcement:', error);
          throw error;
        }
        console.log('Announcement updated successfully');
        Alert.alert('Success', 'Announcement updated successfully');
      } else {
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
          p_link: linkValue,
          p_guide_file_id: guideFileId,
        });

        if (error) {
          console.error('Error creating announcement:', error);
          throw error;
        }
        console.log('Announcement created successfully');
        Alert.alert('Success', 'Announcement created successfully');
      }

      closeModal();
      await loadAnnouncements();
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
              
              const { error } = await supabase.rpc('delete_announcement', {
                p_user_id: user.id,
                p_announcement_id: announcement.id,
              });

              if (error) {
                console.error('Error deleting announcement:', error);
                throw error;
              }

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
              
              await loadAnnouncements();
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
      link: '',
    });
    setSelectedImageUri(null);
    setSelectedGuideFile(null);
    setFileSearchQuery('');
    setShowFileSection(false);
    setShowAddModal(true);
  };

  const openEditModal = async (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      message: announcement.content || announcement.message || '',
      priority: announcement.priority,
      visibility: announcement.visibility,
      thumbnail_shape: announcement.thumbnail_shape,
      display_order: announcement.display_order,
      link: announcement.link || '',
    });
    setSelectedImageUri(null);
    
    // Load the attached guide file if exists
    if (announcement.guide_file_id) {
      const guideFile = guideFiles.find(g => g.id === announcement.guide_file_id);
      setSelectedGuideFile(guideFile || null);
    } else {
      setSelectedGuideFile(null);
    }
    
    setFileSearchQuery('');
    setShowFileSection(false);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingAnnouncement(null);
    setSelectedImageUri(null);
    setSelectedGuideFile(null);
    setFileSearchQuery('');
    setShowFileSection(false);
  };

  const selectGuideFile = (file: GuideFile) => {
    setSelectedGuideFile(file);
    setShowFileSection(false);
  };

  const clearGuideFile = () => {
    setSelectedGuideFile(null);
  };

  const handleBackPress = () => {
    router.replace('/(portal)/manager/manage');
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

  const filteredGuideFiles = guideFiles.filter(file =>
    file.title.toLowerCase().includes(fileSearchQuery.toLowerCase()) ||
    file.category.toLowerCase().includes(fileSearchQuery.toLowerCase()) ||
    file.file_name.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  const groupedGuideFiles = GUIDE_CATEGORIES.reduce((acc, category) => {
    acc[category] = filteredGuideFiles.filter(f => f.category === category);
    return acc;
  }, {} as Record<string, GuideFile[]>);

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
        <Text style={styles.headerTitle}>Announcements Editor</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.headerSubtitle}>
          {announcements.length} / 10 announcements
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.addNewItemButton, announcements.length >= 10 && styles.addNewItemButtonDisabled]} 
        onPress={openAddModal}
        disabled={announcements.length >= 10}
      >
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={announcements.length >= 10 ? managerColors.textSecondary : managerColors.text}
        />
        <Text style={[styles.addNewItemButtonText, announcements.length >= 10 && styles.addNewItemButtonTextDisabled]}>
          {announcements.length >= 10 ? 'Limit Reached (10/10)' : 'Add New Announcement'}
        </Text>
      </TouchableOpacity>

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
                ios_icon_name="plus.cirlce"
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
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>Tap to upload image</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
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

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Link (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter link URL (e.g., https://example.com)"
                  placeholderTextColor="#999999"
                  value={formData.link}
                  onChangeText={(text) => setFormData({ ...formData, link: text })}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.formHint}>
                  This link will be displayed in the full announcement view and &quot;View All&quot; page
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Attach File from Guides & Training (Optional)</Text>
                
                {selectedGuideFile ? (
                  <View style={styles.selectedFileContainer}>
                    <View style={styles.selectedFileInfo}>
                      <IconSymbol
                        ios_icon_name="doc.fill"
                        android_material_icon_name="description"
                        size={24}
                        color={managerColors.highlight}
                      />
                      <View style={styles.selectedFileText}>
                        <Text style={styles.selectedFileTitle}>{selectedGuideFile.title}</Text>
                        <Text style={styles.selectedFileCategory}>{selectedGuideFile.category}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={clearGuideFile} style={styles.clearFileButton}>
                      <IconSymbol
                        ios_icon_name="xmark.circle.fill"
                        android_material_icon_name="cancel"
                        size={24}
                        color="#E74C3C"
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.filePickerButton} 
                    onPress={() => setShowFileSection(!showFileSection)}
                  >
                    <IconSymbol
                      ios_icon_name={showFileSection ? "chevron.up" : "chevron.down"}
                      android_material_icon_name={showFileSection ? "expand-less" : "expand_more"}
                      size={24}
                      color={managerColors.highlight}
                    />
                    <Text style={styles.filePickerButtonText}>
                      {showFileSection ? 'Hide File Selection' : 'Show File Selection'}
                    </Text>
                  </TouchableOpacity>
                )}

                {showFileSection && !selectedGuideFile && (
                  <View style={styles.fileSelectionSection}>
                    <View style={styles.searchContainer}>
                      <IconSymbol
                        ios_icon_name="magnifyingglass"
                        android_material_icon_name="search"
                        size={20}
                        color="#666666"
                      />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search files by name, category..."
                        placeholderTextColor="#999999"
                        value={fileSearchQuery}
                        onChangeText={setFileSearchQuery}
                      />
                      {fileSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setFileSearchQuery('')}>
                          <IconSymbol
                            ios_icon_name="xmark.circle.fill"
                            android_material_icon_name="cancel"
                            size={20}
                            color="#999999"
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    <ScrollView style={styles.fileList} nestedScrollEnabled={true}>
                      {GUIDE_CATEGORIES.map((category, catIndex) => {
                        const categoryFiles = groupedGuideFiles[category];
                        if (categoryFiles.length === 0) return null;

                        return (
                          <View key={catIndex} style={styles.fileCategorySection}>
                            <Text style={styles.fileCategoryTitle}>{category}</Text>
                            {categoryFiles.map((file, fileIndex) => (
                              <TouchableOpacity
                                key={fileIndex}
                                style={styles.fileItem}
                                onPress={() => selectGuideFile(file)}
                              >
                                <IconSymbol
                                  ios_icon_name="doc.fill"
                                  android_material_icon_name="description"
                                  size={24}
                                  color={managerColors.highlight}
                                />
                                <View style={styles.fileItemText}>
                                  <Text style={styles.fileItemTitle}>{file.title}</Text>
                                  <Text style={styles.fileItemName}>{file.file_name}</Text>
                                </View>
                                <IconSymbol
                                  ios_icon_name="chevron.right"
                                  android_material_icon_name="chevron_right"
                                  size={20}
                                  color="#666666"
                                />
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}

                      {filteredGuideFiles.length === 0 && (
                        <View style={styles.emptyFileList}>
                          <IconSymbol
                            ios_icon_name="doc"
                            android_material_icon_name="description"
                            size={48}
                            color="#999999"
                          />
                          <Text style={styles.emptyFileListText}>No files found</Text>
                          <Text style={styles.emptyFileListSubtext}>
                            Try adjusting your search or check if files are uploaded in Guides & Training
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.formHint}>
                  Attach a file from Guides & Training to display View and Download buttons
                </Text>
              </View>

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
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: managerColors.card,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  headerSubtitle: {
    fontSize: 14,
    color: managerColors.textSecondary,
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
  selectedFileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: managerColors.highlight,
  },
  selectedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedFileText: {
    flex: 1,
  },
  selectedFileTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  selectedFileCategory: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  clearFileButton: {
    padding: 4,
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    gap: 8,
  },
  filePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  fileSelectionSection: {
    marginTop: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },
  fileList: {
    maxHeight: 300,
  },
  fileCategorySection: {
    marginBottom: 16,
  },
  fileCategoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  fileItemText: {
    flex: 1,
  },
  fileItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  fileItemName: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  emptyFileList: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyFileListText: {
    fontSize: 14,
    color: '#999999',
    marginTop: 12,
    fontWeight: '600',
  },
  emptyFileListSubtext: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
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
