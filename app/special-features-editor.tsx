
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
import { useNotification } from '@/contexts/NotificationContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

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

interface GuideFile {
  id: string;
  title: string;
  category: string;
  file_name: string;
}

const GUIDE_CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function SpecialFeaturesEditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [guideFiles, setGuideFiles] = useState<GuideFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFeature, setEditingFeature] = useState<SpecialFeature | null>(null);
  const [selectedGuideFile, setSelectedGuideFile] = useState<GuideFile | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [showFileSection, setShowFileSection] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    thumbnail_shape: 'square',
    display_order: 0,
    link: '',
  });
  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [endDateTime, setEndDateTime] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  useEffect(() => {
    loadFeatures();
    loadGuideFiles();
    cleanupExpiredFeatures();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Special features editor screen focused, refreshing data...');
      loadFeatures();
      loadGuideFiles();
      cleanupExpiredFeatures();
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

  const cleanupExpiredFeatures = async () => {
    try {
      const { data, error } = await supabase.rpc('delete_expired_special_features');
      if (error) {
        console.error('Error cleaning up expired features:', error);
      } else {
        console.log('Cleaned up expired features:', data);
      }
    } catch (error) {
      console.error('Error cleaning up expired features:', error);
    }
  };

  const loadFeatures = async () => {
    try {
      setLoading(true);
      console.log('Loading special features from database...');
      
      const { data, error } = await supabase
        .from('special_features')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading special features:', error);
        throw error;
      }
      
      console.log('Special features loaded successfully:', data?.length || 0, 'items');
      setFeatures(data || []);
    } catch (error) {
      console.error('Error loading special features:', error);
      Alert.alert(t('common:error'), t('special_features_editor:load_error'));
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
      Alert.alert(t('common:error'), t('special_features_editor:pick_image_error'));
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      console.log('Starting image upload for special feature');

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
        .from('special-features')
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
        .from('special-features')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common:error'), t('special_features_editor:upload_image_error'));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert(t('common:error'), t('special_features_editor:error_fill_fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('common:error'), t('special_features_editor:error_not_authenticated'));
      return;
    }

    if (!editingFeature && features.length >= 15) {
      Alert.alert(t('special_features_editor:limit_reached_title'), t('special_features_editor:limit_reached_msg'));
      return;
    }

    try {
      let thumbnailUrl = editingFeature?.thumbnail_url || null;

      if (selectedImageUri) {
        const uploadedUrl = await uploadImage(selectedImageUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          console.log('New thumbnail URL:', thumbnailUrl);
        }
      }

      const linkValue = formData.link.trim() || null;
      const guideFileId = selectedGuideFile?.id || null;

      if (editingFeature) {
        console.log('Updating special feature:', editingFeature.id);
        const { error } = await supabase.rpc('update_special_feature', {
          p_user_id: user.id,
          p_feature_id: editingFeature.id,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_start_date_time: startDateTime?.toISOString() || null,
          p_end_date_time: endDateTime?.toISOString() || null,
          p_display_order: formData.display_order,
          p_link: linkValue,
          p_guide_file_id: guideFileId,
        });

        if (error) {
          console.error('Error updating special feature:', error);
          throw error;
        }
        console.log('Special feature updated successfully');
        Alert.alert(t('common:success'), t('special_features_editor:updated_success'));
      } else {
        console.log('Creating new special feature');
        const { error } = await supabase.rpc('create_special_feature', {
          p_user_id: user.id,
          p_title: formData.title,
          p_message: formData.message,
          p_thumbnail_url: thumbnailUrl,
          p_thumbnail_shape: formData.thumbnail_shape,
          p_start_date_time: startDateTime?.toISOString() || null,
          p_end_date_time: endDateTime?.toISOString() || null,
          p_display_order: formData.display_order,
          p_link: linkValue,
          p_guide_file_id: guideFileId,
        });

        if (error) {
          console.error('Error creating special feature:', error);
          throw error;
        }
        console.log('Special feature created successfully');
        
        // Send push notification for new special features only
        try {
          await sendNotification({            notificationType: 'special_feature',
            title: '⭐ New Special Feature',
            body: formData.title,
            data: {
              featureId: null, // Will be set by the database
              startDateTime: startDateTime?.toISOString() || null,
            },
          });
        } catch (notificationError) {
          // Silent fail - don't block feature creation
          console.error('Failed to send push notification:', notificationError);
        }
        
        Alert.alert(t('common:success'), t('special_features_editor:created_success'));
      }

      closeModal();
      await loadFeatures();
    } catch (error: any) {
      console.error('Error saving special feature:', error);
      Alert.alert(t('common:error'), error.message || t('special_features_editor:save_error'));
    }
  };

  const handleDelete = async (feature: SpecialFeature) => {
    Alert.alert(
      t('special_features_editor:delete_title'),
      t('special_features_editor:delete_confirm', { title: feature.title }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert(t('common:error'), t('special_features_editor:error_not_authenticated'));
                return;
              }

              console.log('Deleting special feature:', feature.id);
              
              const { error } = await supabase.rpc('delete_special_feature', {
                p_user_id: user.id,
                p_feature_id: feature.id,
              });

              if (error) {
                console.error('Error deleting special feature:', error);
                throw error;
              }

              if (feature.thumbnail_url) {
                const fileName = feature.thumbnail_url.split('/').pop();
                if (fileName) {
                  await supabase.storage
                    .from('special-features')
                    .remove([fileName]);
                }
              }

              console.log('Special feature deleted successfully');
              Alert.alert(t('common:success'), t('special_features_editor:deleted_success'));
              
              await loadFeatures();
            } catch (error: any) {
              console.error('Error deleting special feature:', error);
              Alert.alert(t('common:error'), error.message || t('special_features_editor:delete_error'));
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingFeature(null);
    setFormData({
      title: '',
      message: '',
      thumbnail_shape: 'square',
      display_order: features.length,
      link: '',
    });
    setStartDateTime(null);
    setEndDateTime(null);
    setSelectedImageUri(null);
    setSelectedGuideFile(null);
    setFileSearchQuery('');
    setShowFileSection(false);
    setShowAddModal(true);
  };

  const openEditModal = async (feature: SpecialFeature) => {
    setEditingFeature(feature);
    setFormData({
      title: feature.title,
      message: feature.content || feature.message || '',
      thumbnail_shape: feature.thumbnail_shape,
      display_order: feature.display_order,
      link: feature.link || '',
    });
    setStartDateTime(feature.start_date_time ? new Date(feature.start_date_time) : null);
    setEndDateTime(feature.end_date_time ? new Date(feature.end_date_time) : null);
    setSelectedImageUri(null);
    
    // Load the attached guide file if exists
    if (feature.guide_file_id) {
      const guideFile = guideFiles.find(g => g.id === feature.guide_file_id);
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
    setEditingFeature(null);
    setSelectedImageUri(null);
    setSelectedGuideFile(null);
    setStartDateTime(null);
    setEndDateTime(null);
    setShowStartDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndDatePicker(false);
    setShowEndTimePicker(false);
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

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return 'Not set';
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
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
        <Text style={styles.headerTitle}>{t('special_features_editor:title')}</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.headerSubtitle}>
          {t('special_features_editor:count', { count: features.length })}
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.addNewItemButton, features.length >= 15 && styles.addNewItemButtonDisabled]} 
        onPress={openAddModal}
        disabled={features.length >= 15}
      >
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={features.length >= 15 ? managerColors.textSecondary : managerColors.text}
        />
        <Text style={[styles.addNewItemButtonText, features.length >= 15 && styles.addNewItemButtonTextDisabled]}>
          {features.length >= 15 ? t('special_features_editor:limit_reached') : t('special_features_editor:add_button')}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={managerColors.highlight} />
          <Text style={styles.loadingText}>{t('special_features_editor:loading')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
          {features.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
                size={64}
                color={managerColors.textSecondary}
              />
              <Text style={styles.emptyText}>{t('special_features_editor:empty_title')}</Text>
              <Text style={styles.emptySubtext}>
                {t('special_features_editor:empty_subtitle')}
              </Text>
            </View>
          ) : (
            features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                {feature.thumbnail_shape === 'square' && feature.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      key={getImageUrl(feature.thumbnail_url)}
                      source={{ uri: getImageUrl(feature.thumbnail_url) }}
                      style={styles.squareImage}
                    />
                    <View style={styles.squareContent}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      {(feature.content || feature.message) && (
                        <Text style={styles.squareMessage} numberOfLines={2}>
                          {feature.content || feature.message}
                        </Text>
                      )}
                      <View style={styles.featureMeta}>
                        {feature.start_date_time && (
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={managerColors.textSecondary}
                            />
                            <Text style={styles.metaText}>
                              {formatDateTime(feature.start_date_time)}
                            </Text>
                          </View>
                        )}
                        {feature.end_date_time && (
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="clock"
                              android_material_icon_name="schedule"
                              size={14}
                              color={managerColors.textSecondary}
                            />
                            <Text style={styles.metaText}>
                              {t('special_features_editor:ends_label', { datetime: formatDateTime(feature.end_date_time) })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    {feature.thumbnail_url && (
                      <Image
                        key={getImageUrl(feature.thumbnail_url)}
                        source={{ uri: getImageUrl(feature.thumbnail_url) }}
                        style={styles.bannerImage}
                      />
                    )}
                    <View style={styles.featureContent}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      {(feature.content || feature.message) && (
                        <Text style={styles.featureMessage}>
                          {feature.content || feature.message}
                        </Text>
                      )}
                      <View style={styles.featureMeta}>
                        {feature.start_date_time && (
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={managerColors.textSecondary}
                            />
                            <Text style={styles.metaText}>
                              {formatDateTime(feature.start_date_time)}
                            </Text>
                          </View>
                        )}
                        {feature.end_date_time && (
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="clock"
                              android_material_icon_name="schedule"
                              size={14}
                              color={managerColors.textSecondary}
                            />
                            <Text style={styles.metaText}>
                              {t('special_features_editor:ends_label', { datetime: formatDateTime(feature.end_date_time) })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </>
                )}
                <View style={styles.featureActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(feature)}
                  >
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={managerColors.highlight}
                    />
                    <Text style={styles.actionButtonText}>{t('common:edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(feature)}
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
                {editingFeature ? t('special_features_editor:modal_edit') : t('special_features_editor:modal_add')}
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
                <Text style={styles.formLabel}>{t('special_features_editor:thumbnail_label')}</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {selectedImageUri || editingFeature?.thumbnail_url ? (
                    <Image
                      source={{ uri: selectedImageUri || getImageUrl(editingFeature?.thumbnail_url || '') || '' }}
                      style={styles.uploadedImage}
                      key={selectedImageUri || getImageUrl(editingFeature?.thumbnail_url || '')}
                    />
                  ) : (
                    <View style={styles.imageUploadPlaceholder}>
                      <IconSymbol
                        ios_icon_name="photo"
                        android_material_icon_name="add-photo-alternate"
                        size={48}
                        color="#666666"
                      />
                      <Text style={styles.imageUploadText}>{t('special_features_editor:tap_upload')}</Text>
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
                      {t('special_features_editor:shape_square')}
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
                      {t('special_features_editor:shape_banner')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:feature_title_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('special_features_editor:feature_title_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:description_label')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('special_features_editor:description_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.message}
                  onChangeText={(text) => setFormData({ ...formData, message: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:link_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('special_features_editor:link_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.link}
                  onChangeText={(text) => setFormData({ ...formData, link: text })}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.formHint}>
                  {t('special_features_editor:link_hint')}
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:attach_file_label')}</Text>
                
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
                      android_material_icon_name={showFileSection ? "expand-less" : "expand-more"}
                      size={24}
                      color={managerColors.highlight}
                    />
                    <Text style={styles.filePickerButtonText}>
                      {showFileSection ? t('special_features_editor:hide_file_selection') : t('special_features_editor:show_file_selection')}
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
                        placeholder={t('special_features_editor:search_files_placeholder')}
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
                          <Text style={styles.emptyFileListText}>{t('special_features_editor:no_files_found')}</Text>
                          <Text style={styles.emptyFileListSubtext}>
                            {t('special_features_editor:no_files_subtext')}
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.formHint}>
                  {t('special_features_editor:attach_file_hint')}
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:start_datetime_label')}</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="event"
                    size={20}
                    color="#666666"
                  />
                  <Text style={styles.dateTimeButtonText}>
                    {startDateTime ? startDateTime.toLocaleDateString() : t('special_features_editor:select_date')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => setShowStartTimePicker(true)}
                >
                  <IconSymbol
                    ios_icon_name="clock"
                    android_material_icon_name="schedule"
                    size={20}
                    color="#666666"
                  />
                  <Text style={styles.dateTimeButtonText}>
                    {startDateTime ? startDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('special_features_editor:select_time')}
                  </Text>
                </TouchableOpacity>
                {startDateTime && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setStartDateTime(null)}
                  >
                    <Text style={styles.clearButtonText}>{t('special_features_editor:clear_start_datetime')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:end_datetime_label')}</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="event"
                    size={20}
                    color="#666666"
                  />
                  <Text style={styles.dateTimeButtonText}>
                    {endDateTime ? endDateTime.toLocaleDateString() : t('special_features_editor:select_date')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <IconSymbol
                    ios_icon_name="clock"
                    android_material_icon_name="schedule"
                    size={20}
                    color="#666666"
                  />
                  <Text style={styles.dateTimeButtonText}>
                    {endDateTime ? endDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('special_features_editor:select_time')}
                  </Text>
                </TouchableOpacity>
                {endDateTime && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setEndDateTime(null)}
                  >
                    <Text style={styles.clearButtonText}>{t('special_features_editor:clear_end_datetime')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('special_features_editor:display_order_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('special_features_editor:display_order_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>
                  {t('special_features_editor:display_order_hint')}
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
                    {editingFeature ? t('special_features_editor:save_button') : t('special_features_editor:add_save_button')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>{t('special_features_editor:cancel_button')}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* iOS Date/Time Pickers - Rendered inside modal */}
            {Platform.OS === 'ios' && showStartDatePicker && (
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={() => setShowStartDatePicker(false)}>
                      <Text style={styles.datePickerDone}>{t('special_features_editor:done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={startDateTime || new Date()}
                    mode="date"
                    display="spinner"
                    textColor="#000000"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        const newDate = startDateTime ? new Date(startDateTime) : new Date();
                        newDate.setFullYear(selectedDate.getFullYear());
                        newDate.setMonth(selectedDate.getMonth());
                        newDate.setDate(selectedDate.getDate());
                        setStartDateTime(newDate);
                      }
                    }}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            )}

            {Platform.OS === 'ios' && showStartTimePicker && (
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                      <Text style={styles.datePickerDone}>{t('special_features_editor:done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={startDateTime || new Date()}
                    mode="time"
                    display="spinner"
                    textColor="#000000"
                    onChange={(event, selectedTime) => {
                      if (selectedTime) {
                        const newDate = startDateTime ? new Date(startDateTime) : new Date();
                        newDate.setHours(selectedTime.getHours());
                        newDate.setMinutes(selectedTime.getMinutes());
                        setStartDateTime(newDate);
                      }
                    }}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            )}

            {Platform.OS === 'ios' && showEndDatePicker && (
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                      <Text style={styles.datePickerDone}>{t('special_features_editor:done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={endDateTime || new Date()}
                    mode="date"
                    display="spinner"
                    textColor="#000000"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        const newDate = endDateTime ? new Date(endDateTime) : new Date();
                        newDate.setFullYear(selectedDate.getFullYear());
                        newDate.setMonth(selectedDate.getMonth());
                        newDate.setDate(selectedDate.getDate());
                        setEndDateTime(newDate);
                      }
                    }}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            )}

            {Platform.OS === 'ios' && showEndTimePicker && (
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                      <Text style={styles.datePickerDone}>{t('special_features_editor:done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={endDateTime || new Date()}
                    mode="time"
                    display="spinner"
                    textColor="#000000"
                    onChange={(event, selectedTime) => {
                      if (selectedTime) {
                        const newDate = endDateTime ? new Date(endDateTime) : new Date();
                        newDate.setHours(selectedTime.getHours());
                        newDate.setMinutes(selectedTime.getMinutes());
                        setEndDateTime(newDate);
                      }
                    }}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android Date/Time Pickers - Rendered as native dialogs */}
      {Platform.OS === 'android' && showStartDatePicker && (
        <DateTimePicker
          value={startDateTime || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartDatePicker(false);
            if (selectedDate) {
              const newDate = startDateTime ? new Date(startDateTime) : new Date();
              newDate.setFullYear(selectedDate.getFullYear());
              newDate.setMonth(selectedDate.getMonth());
              newDate.setDate(selectedDate.getDate());
              setStartDateTime(newDate);
            }
          }}
        />
      )}

      {Platform.OS === 'android' && showStartTimePicker && (
        <DateTimePicker
          value={startDateTime || new Date()}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowStartTimePicker(false);
            if (selectedTime) {
              const newDate = startDateTime ? new Date(startDateTime) : new Date();
              newDate.setHours(selectedTime.getHours());
              newDate.setMinutes(selectedTime.getMinutes());
              setStartDateTime(newDate);
            }
          }}
        />
      )}

      {Platform.OS === 'android' && showEndDatePicker && (
        <DateTimePicker
          value={endDateTime || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(false);
            if (selectedDate) {
              const newDate = endDateTime ? new Date(endDateTime) : new Date();
              newDate.setFullYear(selectedDate.getFullYear());
              newDate.setMonth(selectedDate.getMonth());
              newDate.setDate(selectedDate.getDate());
              setEndDateTime(newDate);
            }
          }}
        />
      )}

      {Platform.OS === 'android' && showEndTimePicker && (
        <DateTimePicker
          value={endDateTime || new Date()}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowEndTimePicker(false);
            if (selectedTime) {
              const newDate = endDateTime ? new Date(endDateTime) : new Date();
              newDate.setHours(selectedTime.getHours());
              newDate.setMinutes(selectedTime.getMinutes());
              setEndDateTime(newDate);
            }
          }}
        />
      )}
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
  featureCard: {
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
  featureContent: {
    padding: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 8,
  },
  featureMessage: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  featureMeta: {
    gap: 8,
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
  featureActions: {
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
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  dateTimeButtonText: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  clearButton: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E74C3C',
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
  datePickerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.primary,
  },
  datePicker: {
    height: 200,
  },
});
