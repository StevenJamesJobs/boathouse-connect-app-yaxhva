
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
  Switch,
  ActionSheetIOS,
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
import { useOrganization } from '@/contexts/OrganizationContext';
import { fetchContentImages, saveContentImages, uploadImageToStorage } from '@/utils/contentImages';
import RichTextToolbar from '@/components/RichTextToolbar';
import FormattedText from '@/components/FormattedText';
import CollapsibleSection from '@/components/CollapsibleSection';
import OrderPositionModal from '@/components/OrderPositionModal';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';

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
  const { organizationId } = useOrganization();
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
    link: '',
    title_es: '',
    message_es: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [shouldSendNotification, setShouldSendNotification] = useState(true);

  // Rich text toolbar state
  const contentInputRef = useRef<TextInput>(null);
  const [contentSelection, setContentSelection] = useState({ start: 0, end: 0 });

  // Position picker state
  const [positionPicker, setPositionPicker] = useState<{ item: Announcement; currentIndex: number } | null>(null);

  // Dropdown picker visibility
  const [showBadgePicker, setShowBadgePicker] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

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

      // get_guides returns the org's active guides (SETOF rows) for the actor.
      // Category narrowing + grouping stays client-side (groupedGuideFiles /
      // GUIDE_CATEGORIES), same as before the RPC swap.
      const { data, error } = await (supabase.rpc as any)('get_guides', {
        p_actor_id: user?.id,
      });

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
    // Logout race: an empty actor would reach the uuid RPC param as '' (22P02).
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      console.log('Loading announcements from database...');

      // Manager editor mode: every row, every visibility, inactive included
      // (the old anon SELECT policy silently hid inactive rows from the editor).
      const { data, error } = await supabase.rpc('get_announcements', {
        p_actor_id: user.id,
        p_include_inactive: true,
      });

      if (error) {
        console.error('Error loading announcements:', error);
        throw error;
      }

      console.log('Announcements loaded successfully:', data?.length || 0, 'items');
      setAnnouncements((data || []) as any);
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
          p_organization_id: organizationId,
          p_announcement_id: editingAnnouncement.id,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_priority: formData.priority,
          p_visibility: formData.visibility,
          p_display_order: editingAnnouncement.display_order,
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
          }, organizationId);
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
          await saveContentImages(user.id, 'announcement', editingAnnouncement.id, allAdditionalUrls);
        }
      } else {
        console.log('Creating new announcement');
        // The hardened RPC returns the new row's uuid — no more racy
        // "select newest row" follow-up read.
        const { data: newAnnouncementId, error } = await supabase.rpc('create_announcement', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_priority: formData.priority,
          p_visibility: formData.visibility,
          p_display_order: announcements.length,
          p_link: linkValue,
          p_guide_file_id: guideFileId,
        });

        if (error) {
          console.error('Error creating announcement:', error);
          throw error;
        }
        console.log('Announcement created successfully');

        // The new announcement shows in the notification shade live (via the
        // announcements table). No separate custom_notifications "log" row — that
        // parallel Sent-History system was retired (it caused shade/history drift).

        // Send the actual push only when toggle is on
        if (shouldSendNotification) {
          try {
            await sendNotification({
              notificationType: 'announcement',
              title: '📢 New Announcement',
              body: formData.title,
              data: {
                announcementId: null,
                priority: formData.priority,
              },
            });
          } catch (notificationError) {
            console.error('Failed to send push notification:', notificationError);
          }
        }
        
        Alert.alert('Success', t('announcement_editor:created_success'));

        // Save Spanish translations for newly created item
        if (newAnnouncementId && (formData.title_es || formData.message_es)) {
          await saveTranslations('announcements', newAnnouncementId, {
            title_es: formData.title_es,
            content_es: formData.message_es,
          }, organizationId);
        }

        // Upload and save additional images for newly created item
        if (newAnnouncementId && newAdditionalImageUris.length > 0) {
          const uploadedNewUrls: string[] = [];
          for (const uri of newAdditionalImageUris) {
            const url = await uploadImageToStorage(uri, 'announcement', (u) =>
              FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 })
            );
            if (url) uploadedNewUrls.push(url);
          }
          if (uploadedNewUrls.length > 0) {
            await saveContentImages(user.id, 'announcement', newAnnouncementId, uploadedNewUrls);
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
                p_organization_id: organizationId,
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

              // content_images rows are cascaded by delete_announcement server-side.

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
    if (index <= 0 || !user?.id) return;
    const newAnnouncements = [...announcements];
    const currentOrder = newAnnouncements[index].display_order;
    const aboveOrder = newAnnouncements[index - 1].display_order;
    [newAnnouncements[index], newAnnouncements[index - 1]] = [newAnnouncements[index - 1], newAnnouncements[index]];
    newAnnouncements[index].display_order = currentOrder;
    newAnnouncements[index - 1].display_order = aboveOrder;
    setAnnouncements(newAnnouncements);
    try {
      // Persist the whole list's new order (reindexed 0..N-1) via the gated RPC.
      const { error } = await supabase.rpc('reorder_announcements', {
        p_actor_id: user.id, p_ordered_ids: newAnnouncements.map((a) => a.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error moving announcement up:', error);
      await loadAnnouncements();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= announcements.length - 1 || !user?.id) return;
    const newAnnouncements = [...announcements];
    const currentOrder = newAnnouncements[index].display_order;
    const belowOrder = newAnnouncements[index + 1].display_order;
    [newAnnouncements[index], newAnnouncements[index + 1]] = [newAnnouncements[index + 1], newAnnouncements[index]];
    newAnnouncements[index].display_order = currentOrder;
    newAnnouncements[index + 1].display_order = belowOrder;
    setAnnouncements(newAnnouncements);
    try {
      const { error } = await supabase.rpc('reorder_announcements', {
        p_actor_id: user.id, p_ordered_ids: newAnnouncements.map((a) => a.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error moving announcement down:', error);
      await loadAnnouncements();
    }
  };

  const handleDragEnd = async ({ data: reorderedData }: { data: Announcement[] }) => {
    if (!user?.id) return;
    const updatedData = reorderedData.map((item, index) => ({
      ...item,
      display_order: index,
    }));
    setAnnouncements(updatedData);
    try {
      const { error } = await supabase.rpc('reorder_announcements', {
        p_actor_id: user.id, p_ordered_ids: reorderedData.map((item) => item.id),
      });
      if (error) throw error;
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
    setShouldSendNotification(true);
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
      link: announcement.link || '',
      title_es: announcement.title_es || '',
      message_es: announcement.content_es || '',
    });
    setShowSpanish(false);
    setSelectedImageUri(null);
    setNewAdditionalImageUris([]);

    // Load existing additional images
    const existingImages = await fetchContentImages(user?.id, 'announcement', announcement.id);
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

  const applyPositionChange = async (newPosition: number) => {
    if (!positionPicker || !user?.id) return;
    const oldIndex = positionPicker.currentIndex;
    const newIndex = newPosition - 1;
    if (newIndex === oldIndex) { setPositionPicker(null); return; }
    const reordered = [...announcements];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    const updated = reordered.map((item, i) => ({ ...item, display_order: i }));
    setAnnouncements(updated);
    setPositionPicker(null);
    try {
      const { error } = await supabase.rpc('reorder_announcements', {
        p_actor_id: user.id, p_ordered_ids: updated.map((item) => item.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error applying position change:', error);
      await loadAnnouncements();
    }
  };

  const openItemActions = (announcement: Announcement, index: number) => {
    const isFirst = index === 0;
    const isLast = index === announcements.length - 1;

    if (Platform.OS === 'ios') {
      const options: string[] = [t('common:edit')];
      if (!isFirst) options.push(t('upcoming_events_editor:move_up'));
      if (!isLast) options.push(t('upcoming_events_editor:move_down'));
      if (announcements.length > 1) options.push(t('menu_editor:order_position'));
      options.push(t('common:delete'));
      options.push(t('common:cancel'));
      const destructiveIndex = options.indexOf(t('common:delete'));
      const cancelIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (buttonIndex) => {
          const label = options[buttonIndex];
          if (label === t('common:edit')) openEditModal(announcement);
          else if (label === t('upcoming_events_editor:move_up')) handleMoveUp(index);
          else if (label === t('upcoming_events_editor:move_down')) handleMoveDown(index);
          else if (label === t('menu_editor:order_position')) setPositionPicker({ item: announcement, currentIndex: index });
          else if (label === t('common:delete')) handleDelete(announcement);
        }
      );
    } else {
      const buttons: any[] = [
        { text: t('common:edit'), onPress: () => openEditModal(announcement) },
      ];
      if (!isFirst) buttons.push({ text: t('upcoming_events_editor:move_up'), onPress: () => handleMoveUp(index) });
      if (!isLast) buttons.push({ text: t('upcoming_events_editor:move_down'), onPress: () => handleMoveDown(index) });
      if (announcements.length > 1) buttons.push({ text: t('menu_editor:order_position'), onPress: () => setPositionPicker({ item: announcement, currentIndex: index }) });
      buttons.push({ text: t('common:delete'), style: 'destructive', onPress: () => handleDelete(announcement) });
      buttons.push({ text: t('common:cancel'), style: 'cancel' });
      Alert.alert(announcement.title, undefined, buttons);
    }
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
                        ios_icon_name="line.3.horizontal"
                        android_material_icon_name="drag-indicator"
                        size={18}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>

                    {/* Meatball Menu */}
                    <TouchableOpacity
                      style={styles.meatballButton}
                      onPress={() => openItemActions(announcement, index)}
                    >
                      <IconSymbol
                        ios_icon_name="ellipsis"
                        android_material_icon_name="more-vert"
                        size={18}
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
                          </View>
                        </View>
                      </>
                    )}
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
              {/* === Section 1: Details === */}
              <CollapsibleSection
                title={t('announcement_editor:section_details')}
                iconIos="info.circle"
                iconAndroid="info"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={true}
              >
                  {/* Thumbnail + Title */}
                  <View style={styles.thumbAndNameRow}>
                    <View style={styles.thumbColumn}>
                      <TouchableOpacity style={styles.thumbSquare} onPress={pickImage}>
                        {selectedImageUri || editingAnnouncement?.thumbnail_url ? (
                          <Image
                            source={{ uri: selectedImageUri || getImageUrl(editingAnnouncement?.thumbnail_url || '') || '' }}
                            style={styles.thumbImage}
                            key={selectedImageUri || getImageUrl(editingAnnouncement?.thumbnail_url || '')}
                          />
                        ) : (
                          <View style={styles.thumbPlaceholder}>
                            <IconSymbol
                              ios_icon_name="photo"
                              android_material_icon_name="add-photo-alternate"
                              size={28}
                              color="#999999"
                            />
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>

                    <View style={styles.nameColumn}>
                      <Text style={styles.formLabel}>{t('announcement_editor:announcement_title_label')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={t('announcement_editor:announcement_title_placeholder')}
                        placeholderTextColor="#999999"
                        value={formData.title}
                        onChangeText={(text) => setFormData({ ...formData, title: text })}
                      />
                    </View>
                  </View>

                  {/* Square / Banner segmented control */}
                  <View style={styles.shapeSegmented}>
                    <TouchableOpacity
                      style={[
                        styles.shapeSegment,
                        formData.thumbnail_shape === 'square' && styles.shapeSegmentActive,
                      ]}
                      onPress={() => setFormData({ ...formData, thumbnail_shape: 'square' })}
                    >
                      <Text
                        style={[
                          styles.shapeSegmentText,
                          formData.thumbnail_shape === 'square' && styles.shapeSegmentTextActive,
                        ]}
                      >
                        {t('announcement_editor:shape_square')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.shapeSegment,
                        formData.thumbnail_shape === 'banner' && styles.shapeSegmentActive,
                      ]}
                      onPress={() => setFormData({ ...formData, thumbnail_shape: 'banner' })}
                    >
                      <Text
                        style={[
                          styles.shapeSegmentText,
                          formData.thumbnail_shape === 'banner' && styles.shapeSegmentTextActive,
                        ]}
                      >
                        {t('announcement_editor:shape_banner')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Additional Images */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Additional Images</Text>
                    <Text style={styles.formHint}>Add more images for a swipeable carousel in the detail view</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.additionalImagesScroll}>
                      {additionalImageUrls.map((url, idx) => (
                        <View key={`existing-${idx}`} style={styles.additionalImageContainer}>
                          <Image source={{ uri: getImageUrl(url) || url }} style={styles.additionalImageThumb} />
                          <TouchableOpacity
                            style={styles.removeImageButton}
                            onPress={() => removeAdditionalImage(idx, false)}
                          >
                            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={22} color="#E74C3C" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {newAdditionalImageUris.map((uri, idx) => (
                        <View key={`new-${idx}`} style={styles.additionalImageContainer}>
                          <Image source={{ uri }} style={styles.additionalImageThumb} />
                          <TouchableOpacity
                            style={styles.removeImageButton}
                            onPress={() => removeAdditionalImage(idx, true)}
                          >
                            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={22} color="#E74C3C" />
                          </TouchableOpacity>
                          <View style={styles.newImageBadge}>
                            <Text style={styles.newImageBadgeText}>NEW</Text>
                          </View>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.addImageButton} onPress={pickAdditionalImage}>
                        <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={32} color="#D4A843" />
                        <Text style={styles.addImageText}>Add</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
              </CollapsibleSection>

              {/* === Section 2: Description === */}
              <CollapsibleSection
                title={t('announcement_editor:section_description')}
                iconIos="doc.text"
                iconAndroid="description"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={false}
              >
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

                  {/* Spanish Translation */}
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
              </CollapsibleSection>

              {/* === Section 3: Additional Info === */}
              <CollapsibleSection
                title={t('announcement_editor:section_additional_info')}
                iconIos="ellipsis.circle"
                iconAndroid="more-horiz"
                iconColor={colors.primary}
                headerBackgroundColor="#FFFFFF"
                headerTextColor="#1A1A1A"
                contentBackgroundColor="#FFFFFF"
                defaultExpanded={false}
                >
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

                  {/* Badge Type + Visible To — side-by-side dropdowns */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Badge Type & Visibility</Text>
                    <View style={styles.dropdownRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formHint}>Badge</Text>
                        <SelectField
                          value={getPriorityLabel(formData.priority)}
                          placeholder="Badge Type"
                          onPress={() => setShowBadgePicker(true)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formHint}>Visible To</Text>
                        <SelectField
                          value={formData.visibility.charAt(0).toUpperCase() + formData.visibility.slice(1)}
                          placeholder="Visibility"
                          onPress={() => setShowVisibilityPicker(true)}
                        />
                      </View>
                    </View>
                  </View>
              </CollapsibleSection>

              {!editingAnnouncement && (
                <View style={styles.notificationToggleContainer}>
                  <View style={styles.notificationToggleTextContainer}>
                    <Text style={styles.notificationToggleLabel}>
                      Send notification to staff?
                    </Text>
                    <Text style={styles.notificationToggleHint}>
                      Select whether to send a push notification when this announcement is published.
                    </Text>
                  </View>
                  <Switch
                    value={shouldSendNotification}
                    onValueChange={setShouldSendNotification}
                    trackColor={{ false: '#767577', true: colors.primary }}
                    thumbColor="#f4f3f4"
                  />
                </View>
              )}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeModal}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color={colors.fireText} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingAnnouncement ? 'Update Announcement' : 'Add Announcement'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            <SimpleSelectPicker
              visible={showBadgePicker}
              title="Badge Type"
              options={PRIORITY_LEVELS.map(p => getPriorityLabel(p))}
              value={getPriorityLabel(formData.priority)}
              onSelect={(label) => {
                const match = PRIORITY_LEVELS.find(p => getPriorityLabel(p) === label);
                if (match) setFormData(prev => ({ ...prev, priority: match }));
              }}
              onClose={() => setShowBadgePicker(false)}
            />

            <SimpleSelectPicker
              visible={showVisibilityPicker}
              title="Visible To"
              options={VISIBILITY_OPTIONS.map(v => v.charAt(0).toUpperCase() + v.slice(1))}
              value={formData.visibility.charAt(0).toUpperCase() + formData.visibility.slice(1)}
              onSelect={(label) => {
                setFormData(prev => ({ ...prev, visibility: label.toLowerCase() }));
              }}
              onClose={() => setShowVisibilityPicker(false)}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OrderPositionModal
        visible={!!positionPicker}
        title={t('menu_editor:order_position')}
        subtitle={positionPicker?.item.title || ''}
        count={announcements.length}
        currentIndex={positionPicker?.currentIndex ?? 0}
        onClose={() => setPositionPicker(null)}
        onApply={applyPositionChange}
      />
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
    marginTop: 28,
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
  meatballButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
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
    backgroundColor: '#EEEFF1',
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  dropdownRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 8,
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
  thumbAndNameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  thumbColumn: {
    width: 80,
    alignItems: 'center',
  },
  nameColumn: {
    flex: 1,
  },
  thumbSquare: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shapeSegmented: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  shapeSegment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shapeSegmentActive: {
    backgroundColor: colors.primary,
  },
  shapeSegmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  shapeSegmentTextActive: {
    color: colors.fireText,
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
  notificationToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationToggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  notificationToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  notificationToggleHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.fireText,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 15,
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
