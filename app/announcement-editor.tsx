
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { translateTexts, saveTranslations, getLocalizedField } from '@/utils/translateContent';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchContentImages, saveContentImages, uploadImageToStorage, deleteContentImages } from '@/utils/contentImages';
import RichTextToolbar from '@/components/RichTextToolbar';
import FormattedText from '@/components/FormattedText';

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
  title_es?: string | null;
  content_es?: string | null;
}

interface GuideFile {
  id: string;
  title: string;
  category: string;
  file_name: string;
}

const PRIORITY_LEVELS = ['none', 'new', 'important', 'update'];
const VISIBILITY_OPTIONS = ['everyone', 'employees', 'managers', 'none'];
const GUIDE_CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function AnnouncementEditorScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { language } = useLanguage();
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
    priority: 'none',
    visibility: 'everyone',
    thumbnail_shape: 'square',
    display_order: 0,
    link: '',
    title_es: '',
    message_es: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Rich text toolbar state
  const contentInputRef = useRef<TextInput>(null);
  const [contentSelection, setContentSelection] = useState({ start: 0, end: 0 });

  // Additional images state
  const [additionalImageUrls, setAdditionalImageUrls] = useState<string[]>([]);
  const [newAdditionalImageUris, setNewAdditionalImageUris] = useState<string[]>([]);

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
      Alert.alert('Error', t('announcement_editor:load_error'));
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
      Alert.alert('Error', t('announcement_editor:pick_image_error'));
    }
  };

  const pickAdditionalImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: formData.thumbnail_shape === 'square' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setNewAdditionalImageUris(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error picking additional image:', error);
      Alert.alert('Error', t('announcement_editor:pick_image_error'));
    }
  };

  const removeAdditionalImage = (index: number, isNew: boolean) => {
    if (isNew) {
      setNewAdditionalImageUris(prev => prev.filter((_, i) => i !== index));
    } else {
      setAdditionalImageUrls(prev => prev.filter((_, i) => i !== index));
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
      Alert.alert('Error', t('announcement_editor:upload_image_error'));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!formData.title && !formData.message) {
      Alert.alert(t('common:error'), t('translation_section:no_content_to_translate'));
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([formData.title, formData.message]);
      setFormData(prev => ({
        ...prev,
        title_es: results[0] || '',
        message_es: results[1] || '',
      }));
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common:error'), t('translation_section:translate_failed'));
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert('Error', t('announcement_editor:error_fill_fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', t('announcement_editor:error_not_authenticated'));
      return;
    }

    if (!editingAnnouncement && announcements.length >= 10) {
      Alert.alert(t('announcement_editor:limit_reached_title'), t('announcement_editor:limit_reached_msg'));
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
        Alert.alert('Success', t('announcement_editor:updated_success'));

        // Save Spanish translations
        if (formData.title_es || formData.message_es) {
          await saveTranslations('announcements', editingAnnouncement.id, {
            title_es: formData.title_es,
            content_es: formData.message_es,
          });
        }

        // Upload new additional images and save all to content_images
        const uploadedNewUrls: string[] = [];
        for (const uri of newAdditionalImageUris) {
          const url = await uploadImageToStorage(uri, 'announcement', (u) =>
            FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 })
          );
          if (url) uploadedNewUrls.push(url);
        }
        const allAdditionalUrls = [...additionalImageUrls, ...uploadedNewUrls];
        if (allAdditionalUrls.length > 0 || additionalImageUrls.length > 0) {
          await saveContentImages('announcement', editingAnnouncement.id, allAdditionalUrls);
        }
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
        
        // Send push notification for new announcements only
        try {
          await sendNotification({
            notificationType: 'announcement',
            title: '📢 New Announcement',
            body: formData.title,
            data: {
              announcementId: null, // Will be set by the database
              priority: formData.priority,
            },
          });
        } catch (notificationError) {
          // Silent fail - don't block announcement creation
          console.error('Failed to send push notification:', notificationError);
        }
        
        Alert.alert('Success', t('announcement_editor:created_success'));

        // Get the newly created item's ID for translations and additional images
        const { data: newItem } = await supabase
          .from('announcements')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Save Spanish translations for newly created item
        if (newItem && (formData.title_es || formData.message_es)) {
          await saveTranslations('announcements', newItem.id, {
            title_es: formData.title_es,
            content_es: formData.message_es,
          });
        }

        // Upload and save additional images for newly created item
        if (newItem && newAdditionalImageUris.length > 0) {
          const uploadedNewUrls: string[] = [];
          for (const uri of newAdditionalImageUris) {
            const url = await uploadImageToStorage(uri, 'announcement', (u) =>
              FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 })
            );
            if (url) uploadedNewUrls.push(url);
          }
          if (uploadedNewUrls.length > 0) {
            await saveContentImages('announcement', newItem.id, uploadedNewUrls);
          }
        }
      }

      closeModal();
      await loadAnnouncements();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      Alert.alert('Error', error.message || t('announcement_editor:save_error'));
    }
  };

  const handleDelete = async (announcement: Announcement) => {
    Alert.alert(
      t('announcement_editor:delete_title'),
      t('announcement_editor:delete_confirm', { title: announcement.title }),
      [
        { text: t('announcement_editor:cancel_button'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert('Error', t('announcement_editor:error_not_authenticated'));
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

              // Clean up additional images
              await deleteContentImages('announcement', announcement.id);

              console.log('Announcement deleted successfully');
              Alert.alert('Success', t('announcement_editor:deleted_success'));
              
              await loadAnnouncements();
            } catch (error: any) {
              console.error('Error deleting announcement:', error);
              Alert.alert('Error', error.message || t('announcement_editor:delete_error'));
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newAnnouncements = [...announcements];
    const currentOrder = newAnnouncements[index].display_order;
    const aboveOrder = newAnnouncements[index - 1].display_order;
    [newAnnouncements[index], newAnnouncements[index - 1]] = [newAnnouncements[index - 1], newAnnouncements[index]];
    newAnnouncements[index].display_order = currentOrder;
    newAnnouncements[index - 1].display_order = aboveOrder;
    setAnnouncements(newAnnouncements);
    try {
      await Promise.all([
        supabase.from('announcements').update({ display_order: aboveOrder }).eq('id', announcements[index].id),
        supabase.from('announcements').update({ display_order: currentOrder }).eq('id', announcements[index - 1].id),
      ]);
    } catch (error) {
      console.error('Error moving announcement up:', error);
      await loadAnnouncements();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= announcements.length - 1) return;
    const newAnnouncements = [...announcements];
    const currentOrder = newAnnouncements[index].display_order;
    const belowOrder = newAnnouncements[index + 1].display_order;
    [newAnnouncements[index], newAnnouncements[index + 1]] = [newAnnouncements[index + 1], newAnnouncements[index]];
    newAnnouncements[index].display_order = currentOrder;
    newAnnouncements[index + 1].display_order = belowOrder;
    setAnnouncements(newAnnouncements);
    try {
      await Promise.all([
        supabase.from('announcements').update({ display_order: belowOrder }).eq('id', announcements[index].id),
        supabase.from('announcements').update({ display_order: currentOrder }).eq('id', announcements[index + 1].id),
      ]);
    } catch (error) {
      console.error('Error moving announcement down:', error);
      await loadAnnouncements();
    }
  };

  const handleDragEnd = async ({ data: reorderedData }: { data: Announcement[] }) => {
    const updatedData = reorderedData.map((item, index) => ({
      ...item,
      display_order: index,
    }));
    setAnnouncements(updatedData);
    try {
      const updates = reorderedData.map((item, index) =>
        supabase
          .from('announcements')
          .update({ display_order: index })
          .eq('id', item.id)
      );
      await Promise.all(updates);
      console.log('Drag reorder persisted successfully');
    } catch (error) {
      console.error('Error persisting drag reorder:', error);
      await loadAnnouncements();
    }
  };

  const openAddModal = () => {
    setEditingAnnouncement(null);
    setFormData({
      title: '',
      message: '',
      priority: 'none',
      visibility: 'everyone',
      thumbnail_shape: 'square',
      display_order: announcements.length,
      link: '',
      title_es: '',
      message_es: '',
    });
    setSelectedImageUri(null);
    setAdditionalImageUrls([]);
    setNewAdditionalImageUris([]);
    setSelectedGuideFile(null);
    setFileSearchQuery('');
    setShowFileSection(false);
    setShowSpanish(false);
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
      title_es: announcement.title_es || '',
      message_es: announcement.content_es || '',
    });
    setShowSpanish(!!(announcement.title_es || announcement.content_es));
    setSelectedImageUri(null);
    setNewAdditionalImageUris([]);

    // Load existing additional images
    const existingImages = await fetchContentImages('announcement', announcement.id);
    setAdditionalImageUrls(existingImages);

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
    setAdditionalImageUrls([]);
    setNewAdditionalImageUris([]);
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
      case 'new':
        return '#3498DB';
      case 'important':
        return '#E74C3C';
      case 'update':
        return '#F39C12';
      default:
        return colors.textSecondary;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'new':
        return 'New';
      case 'important':
        return 'Important';
      case 'update':
        return 'Update';
      case 'none':
        return 'None';
      default:
        return priority.charAt(0).toUpperCase() + priority.slice(1);
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
      case 'none':
        return 'eye.slash';
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
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('announcement_editor:title')}</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.headerSubtitle}>
          {t('announcement_editor:count', { count: announcements.length })}
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
          color={announcements.length >= 10 ? colors.textSecondary : colors.text}
        />
        <Text style={[styles.addNewItemButtonText, announcements.length >= 10 && styles.addNewItemButtonTextDisabled]}>
          {announcements.length >= 10 ? t('announcement_editor:limit_reached') : t('announcement_editor:add_button')}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('announcement_editor:loading')}</Text>
        </View>
      ) : announcements.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="plus.cirlce"
            android_material_icon_name="campaign"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyText}>{t('announcement_editor:empty_title')}</Text>
          <Text style={styles.emptySubtext}>
            {t('announcement_editor:empty_subtitle')}
          </Text>
        </View>
      ) : (
        <View style={styles.itemsList}>
          {announcements.length > 1 && (
            <Text style={styles.reorderHint}>{t('upcoming_events_editor:reorder_hint')}</Text>
          )}
          <DraggableFlatList
            data={announcements}
            keyExtractor={(item) => item.id}
            onDragEnd={handleDragEnd}
            activationDistance={10}
            contentContainerStyle={styles.itemsListContent}
            renderItem={({ item: announcement, getIndex, drag, isActive }: RenderItemParams<Announcement>) => {
              const index = getIndex() ?? 0;

              return (
                <ScaleDecorator>
                  <View style={[styles.announcementCard, isActive && styles.announcementCardDragging]}>
                    {/* Drag Handle */}
                    <TouchableOpacity
                      onLongPress={drag}
                      disabled={isActive}
                      style={styles.dragHandle}
                    >
                      <IconSymbol
                        ios_icon_name="line.3.horizontal.decrease"
                        android_material_icon_name="drag-indicator"
                        size={20}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>

                    {announcement.thumbnail_shape === 'square' && announcement.thumbnail_url ? (
                      <View style={styles.squareLayout}>
                        <Image
                          key={getImageUrl(announcement.thumbnail_url)}
                          source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                          style={styles.squareImage}
                        />
                        <View style={styles.squareContent}>
                          <View style={styles.announcementHeader}>
                            <Text style={styles.announcementTitle}>{getLocalizedField(announcement, 'title', language)}</Text>
                            {announcement.priority && announcement.priority !== 'none' && (
                              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                                {announcement.priority === 'new' && (
                                  <IconSymbol
                                    ios_icon_name="star.fill"
                                    android_material_icon_name="star"
                                    size={10}
                                    color="#FFFFFF"
                                  />
                                )}
                                <Text style={styles.priorityText}>{getPriorityLabel(announcement.priority).toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          {(announcement.content || announcement.message) && (
                            <FormattedText style={styles.squareMessage} numberOfLines={2}>
                              {getLocalizedField(announcement, 'content', language) || announcement.message}
                            </FormattedText>
                          )}
                          <View style={styles.announcementMeta}>
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name={getVisibilityIcon(announcement.visibility)}
                                android_material_icon_name="visibility"
                                size={16}
                                color={colors.textSecondary}
                              />
                              <Text style={styles.metaText}>{announcement.visibility}</Text>
                            </View>
                            <View style={styles.metaItem}>
                              <Text style={styles.metaText}>{t('announcement_editor:order_label', { order: announcement.display_order })}</Text>
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
                            <Text style={styles.announcementTitle}>{getLocalizedField(announcement, 'title', language)}</Text>
                            {announcement.priority && announcement.priority !== 'none' && (
                              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                                {announcement.priority === 'new' && (
                                  <IconSymbol
                                    ios_icon_name="star.fill"
                                    android_material_icon_name="star"
                                    size={10}
                                    color="#FFFFFF"
                                  />
                                )}
                                <Text style={styles.priorityText}>{getPriorityLabel(announcement.priority).toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          {(announcement.content || announcement.message) && (
                            <FormattedText style={styles.announcementMessage}>
                              {getLocalizedField(announcement, 'content', language) || announcement.message}
                            </FormattedText>
                          )}
                          <View style={styles.announcementMeta}>
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name={getVisibilityIcon(announcement.visibility)}
                                android_material_icon_name="visibility"
                                size={16}
                                color={colors.textSecondary}
                              />
                              <Text style={styles.metaText}>{announcement.visibility}</Text>
                            </View>
                            <View style={styles.metaItem}>
                              <Text style={styles.metaText}>{t('announcement_editor:order_label', { order: announcement.display_order })}</Text>
                            </View>
                          </View>
                        </View>
                      </>
                    )}
                    <View style={styles.announcementActions}>
                      <TouchableOpacity
                        style={[styles.arrowButton, index === 0 && styles.arrowButtonDisabled]}
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <IconSymbol
                          ios_icon_name="arrow.up"
                          android_material_icon_name="arrow-upward"
                          size={18}
                          color={index === 0 ? colors.textSecondary : colors.highlight}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.arrowButton, index === announcements.length - 1 && styles.arrowButtonDisabled]}
                        onPress={() => handleMoveDown(index)}
                        disabled={index === announcements.length - 1}
                      >
                        <IconSymbol
                          ios_icon_name="arrow.down"
                          android_material_icon_name="arrow-downward"
                          size={18}
                          color={index === announcements.length - 1 ? colors.textSecondary : colors.highlight}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => openEditModal(announcement)}
                      >
                        <IconSymbol
                          ios_icon_name="pencil"
                          android_material_icon_name="edit"
                          size={20}
                          color={colors.primary}
                        />
                        <Text style={styles.actionButtonText}>{t('common:edit')}</Text>
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
                          {t('common:delete')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScaleDecorator>
              );
            }}
          />
        </View>
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
                {editingAnnouncement ? t('announcement_editor:modal_edit') : t('announcement_editor:modal_add')}
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
                <Text style={styles.formLabel}>{t('announcement_editor:thumbnail_label')}</Text>
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
                      <Text style={styles.imageUploadText}>{t('announcement_editor:tap_upload')}</Text>
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
                      {t('announcement_editor:shape_square')}
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
                      {t('announcement_editor:shape_banner')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Additional Images Section */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Additional Images</Text>
                <Text style={styles.formHint}>Add more images for a swipeable carousel in the detail view</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.additionalImagesScroll}>
                  {/* Existing additional images */}
                  {additionalImageUrls.map((url, index) => (
                    <View key={`existing-${index}`} style={styles.additionalImageContainer}>
                      <Image source={{ uri: getImageUrl(url) || url }} style={styles.additionalImageThumb} />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeAdditionalImage(index, false)}
                      >
                        <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={22} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {/* Newly selected images (pending upload) */}
                  {newAdditionalImageUris.map((uri, index) => (
                    <View key={`new-${index}`} style={styles.additionalImageContainer}>
                      <Image source={{ uri }} style={styles.additionalImageThumb} />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeAdditionalImage(index, true)}
                      >
                        <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={22} color="#E74C3C" />
                      </TouchableOpacity>
                      <View style={styles.newImageBadge}>
                        <Text style={styles.newImageBadgeText}>NEW</Text>
                      </View>
                    </View>
                  ))}
                  {/* Add image button */}
                  <TouchableOpacity style={styles.addImageButton} onPress={pickAdditionalImage}>
                    <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={32} color="#D4A843" />
                    <Text style={styles.addImageText}>Add</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('announcement_editor:announcement_title_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('announcement_editor:announcement_title_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('announcement_editor:message_label')}</Text>
                <RichTextToolbar
                  text={formData.message}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, message: text }))}
                  selection={contentSelection}
                  onSelectionChange={setContentSelection}
                  textInputRef={contentInputRef}
                  accentColor={colors.highlight}
                />
                <TextInput
                  ref={contentInputRef}
                  style={[styles.input, styles.textArea]}
                  placeholder={t('announcement_editor:message_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.message}
                  onChangeText={(text) => setFormData({ ...formData, message: text })}
                  multiline
                  numberOfLines={4}
                  onSelectionChange={(e) => setContentSelection(e.nativeEvent.selection)}
                />
              </View>

              {/* Spanish Translation Section */}
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.spanishSectionHeader}
                  onPress={() => setShowSpanish(!showSpanish)}
                >
                  <Text style={styles.formLabel}>{t('translation_section:spanish_section_title')}</Text>
                  <IconSymbol
                    ios_icon_name={showSpanish ? 'chevron.up' : 'chevron.down'}
                    android_material_icon_name={showSpanish ? 'expand-less' : 'expand-more'}
                    size={20}
                    color="#666666"
                  />
                </TouchableOpacity>

                {showSpanish && (
                  <View style={styles.spanishFields}>
                    <TouchableOpacity
                      style={styles.autoTranslateButton}
                      onPress={handleAutoTranslate}
                      disabled={translating}
                    >
                      {translating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.autoTranslateButtonText}>
                          {t('translation_section:auto_translate')}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.spanishFieldLabel}>{t('translation_section:title_es_label')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('translation_section:title_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.title_es}
                      onChangeText={(text) => setFormData({ ...formData, title_es: text })}
                    />

                    <Text style={[styles.spanishFieldLabel, { marginTop: 12 }]}>{t('translation_section:message_es_label')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder={t('translation_section:message_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.message_es}
                      onChangeText={(text) => setFormData({ ...formData, message_es: text })}
                      multiline
                      numberOfLines={4}
                    />

                    <Text style={styles.formHint}>{t('translation_section:hint')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('announcement_editor:link_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('announcement_editor:link_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.link}
                  onChangeText={(text) => setFormData({ ...formData, link: text })}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.formHint}>
                  {t('announcement_editor:link_hint')}
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
                        color={colors.primary}
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
                      android_material_icon_name={showFileSection ? "expand-less" : "expand-more"}
                      size={24}
                      color={colors.primary}
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
                                  color={colors.primary}
                                />
                                <View style={styles.fileItemText}>
                                  <Text style={styles.fileItemTitle}>{file.title}</Text>
                                  <Text style={styles.fileItemName}>{file.file_name}</Text>
                                </View>
                                <IconSymbol
                                  ios_icon_name="chevron.right"
                                  android_material_icon_name="chevron-right"
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
                <Text style={styles.formLabel}>Badge Type</Text>
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
                        {getPriorityLabel(priority)}
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

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    backgroundColor: colors.card,
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
    color: colors.text,
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  addNewItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.highlight,
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
    backgroundColor: colors.card,
    opacity: 0.6,
  },
  addNewItemButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  addNewItemButtonTextDisabled: {
    color: colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
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
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  announcementCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  announcementCardDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
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
    color: colors.textSecondary,
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
    color: colors.text,
    marginRight: 12,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    color: colors.textSecondary,
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
    color: colors.textSecondary,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
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
    color: colors.highlight,
  },
  deleteButtonText: {
    color: '#E74C3C',
  },
  dragHandle: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
  },
  reorderHint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 12,
  },
  arrowButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.3,
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
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
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
    borderColor: colors.highlight,
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
    color: colors.highlight,
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
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
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
    backgroundColor: colors.highlight,
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
  additionalImagesScroll: {
    marginTop: 10,
  },
  additionalImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  additionalImageThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    zIndex: 10,
  },
  newImageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  newImageBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  addImageText: {
    fontSize: 11,
    color: '#999999',
    marginTop: 2,
  },
});
