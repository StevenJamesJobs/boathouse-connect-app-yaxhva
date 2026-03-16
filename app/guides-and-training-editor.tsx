
import React, { useState, useEffect, useMemo } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateTexts, saveTranslations, getLocalizedField } from '@/utils/translateContent';

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
  title_es?: string | null;
  description_es?: string | null;
}

const CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function GuidesAndTrainingEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { language } = useLanguage();
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
    title_es: '',
    description_es: '',
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showSpanish, setShowSpanish] = useState(false);
  const [translating, setTranslating] = useState(false);
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
      Alert.alert(t('common.error'), t('guides_training_editor.loading_guides'));
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
      Alert.alert(t('common.error'), t('guides_training_editor.error_failed_thumbnail'));
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
      Alert.alert(t('common.error'), t('guides_training_editor.error_failed_file'));
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

  const handleAutoTranslate = async () => {
    if (!formData.title && !formData.description) {
      Alert.alert(t('common.error'), t('translation_section.no_content_to_translate'));
      return;
    }
    setTranslating(true);
    try {
      const results = await translateTexts([formData.title, formData.description]);
      setFormData(prev => ({
        ...prev,
        title_es: results[0] || '',
        description_es: results[1] || '',
      }));
      setShowSpanish(true);
    } catch (err) {
      console.error('Auto-translate error:', err);
      Alert.alert(t('common.error'), t('translation_section.translate_failed'));
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_no_title'));
      return;
    }

    if (!editingGuide && !selectedFile) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_no_file'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_not_authenticated'));
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
          Alert.alert(t('common.error'), t('guides_training_editor.error_upload_file'));
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
        Alert.alert(t('common.success'), t('guides_training_editor.guide_updated'));

        // Save Spanish translations
        if (formData.title_es || formData.description_es) {
          await saveTranslations('guides_and_training', editingGuide.id, {
            title_es: formData.title_es,
            description_es: formData.description_es,
          });
        }
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
        Alert.alert(t('common.success'), t('guides_training_editor.guide_created'));

        // Save Spanish translations for newly created item
        if (formData.title_es || formData.description_es) {
          const { data: newItem } = await supabase
            .from('guides_and_training')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (newItem) {
            await saveTranslations('guides_and_training', newItem.id, {
              title_es: formData.title_es,
              description_es: formData.description_es,
            });
          }
        }
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
      t('guides_training_editor.delete_title'),
      t('guides_training_editor.delete_confirm', { title: guide.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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

              Alert.alert(t('common.success'), t('guides_training_editor.guide_deleted'));
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

  const handleMoveUp = async (index: number) => {
    const categoryGuides = filteredGuides;
    if (index <= 0) return;
    const newGuides = [...guides];
    const currentItem = categoryGuides[index];
    const aboveItem = categoryGuides[index - 1];
    const currentOrder = currentItem.display_order;
    const aboveOrder = aboveItem.display_order;
    // Update in the full guides array
    const currentIdx = newGuides.findIndex(g => g.id === currentItem.id);
    const aboveIdx = newGuides.findIndex(g => g.id === aboveItem.id);
    if (currentIdx >= 0) newGuides[currentIdx] = { ...newGuides[currentIdx], display_order: aboveOrder };
    if (aboveIdx >= 0) newGuides[aboveIdx] = { ...newGuides[aboveIdx], display_order: currentOrder };
    setGuides(newGuides);
    try {
      await Promise.all([
        supabase.from('guides_and_training').update({ display_order: aboveOrder }).eq('id', currentItem.id),
        supabase.from('guides_and_training').update({ display_order: currentOrder }).eq('id', aboveItem.id),
      ]);
    } catch (error) {
      console.error('Error moving guide up:', error);
      await loadGuides();
    }
  };

  const handleMoveDown = async (index: number) => {
    const categoryGuides = filteredGuides;
    if (index >= categoryGuides.length - 1) return;
    const newGuides = [...guides];
    const currentItem = categoryGuides[index];
    const belowItem = categoryGuides[index + 1];
    const currentOrder = currentItem.display_order;
    const belowOrder = belowItem.display_order;
    const currentIdx = newGuides.findIndex(g => g.id === currentItem.id);
    const belowIdx = newGuides.findIndex(g => g.id === belowItem.id);
    if (currentIdx >= 0) newGuides[currentIdx] = { ...newGuides[currentIdx], display_order: belowOrder };
    if (belowIdx >= 0) newGuides[belowIdx] = { ...newGuides[belowIdx], display_order: currentOrder };
    setGuides(newGuides);
    try {
      await Promise.all([
        supabase.from('guides_and_training').update({ display_order: belowOrder }).eq('id', currentItem.id),
        supabase.from('guides_and_training').update({ display_order: currentOrder }).eq('id', belowItem.id),
      ]);
    } catch (error) {
      console.error('Error moving guide down:', error);
      await loadGuides();
    }
  };

  const handleDragEnd = async ({ data: reorderedData }: { data: GuideItem[] }) => {
    // Update the full guides array with new display_orders for this category
    const newGuides = [...guides];
    reorderedData.forEach((item, newIndex) => {
      const idx = newGuides.findIndex(g => g.id === item.id);
      if (idx >= 0) {
        newGuides[idx] = { ...newGuides[idx], display_order: newIndex };
      }
    });
    setGuides(newGuides);
    try {
      const updates = reorderedData.map((item, index) =>
        supabase.from('guides_and_training').update({ display_order: index }).eq('id', item.id)
      );
      await Promise.all(updates);
      console.log('Drag reorder persisted successfully');
    } catch (error) {
      console.error('Error persisting drag reorder:', error);
      await loadGuides();
    }
  };

  const openAddModal = () => {
    setEditingGuide(null);
    setFormData({
      title: '',
      description: '',
      category: selectedCategory,
      display_order: guides.filter(g => g.category === selectedCategory).length,
      title_es: '',
      description_es: '',
    });
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    setShowSpanish(false);
    setShowAddModal(true);
  };

  const openEditModal = (guide: GuideItem) => {
    setEditingGuide(guide);
    setFormData({
      title: guide.title,
      description: guide.description || '',
      category: guide.category,
      display_order: guide.display_order,
      title_es: guide.title_es || '',
      description_es: guide.description_es || '',
    });
    setShowSpanish(!!(guide.title_es || guide.description_es));
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('guides_training_editor.title')}</Text>
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
              { backgroundColor: colors.card },
              selectedCategory === category && { backgroundColor: colors.highlight },
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryTabText,
                { color: colors.textSecondary },
                selectedCategory === category && { color: colors.text },
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={[styles.addNewItemButton, { backgroundColor: colors.highlight }]} onPress={openAddModal}>
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add-circle"
          size={24}
          color={colors.text}
        />
        <Text style={[styles.addNewItemButtonText, { color: colors.text }]}>{t('guides_training_editor.add_new_guide')}</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.highlight} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('guides_training_editor.loading_guides')}</Text>
        </View>
      ) : filteredGuides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="book.fill"
            android_material_icon_name="menu-book"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>{t('guides_training_editor.no_guides_in_category')}</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {t('guides_training_editor.tap_to_create')}
          </Text>
        </View>
      ) : (
        <View style={styles.itemsList}>
          {filteredGuides.length > 1 && (
            <Text style={[styles.reorderHint, { color: colors.textSecondary }]}>{t('upcoming_events_editor.reorder_hint')}</Text>
          )}
          <DraggableFlatList
            data={filteredGuides}
            keyExtractor={(item) => item.id}
            onDragEnd={handleDragEnd}
            activationDistance={10}
            contentContainerStyle={styles.itemsListContent}
            renderItem={({ item: guide, getIndex, drag, isActive }: RenderItemParams<GuideItem>) => {
              const index = getIndex() ?? 0;

              return (
                <ScaleDecorator>
                  <View style={[styles.guideCard, { backgroundColor: colors.card }, isActive && styles.guideCardDragging]}>
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

                    <View style={styles.guideLayout}>
                      {guide.thumbnail_url && (
                        <Image
                          source={{ uri: getImageUrl(guide.thumbnail_url) }}
                          style={styles.guideThumbnail}
                        />
                      )}
                      <View style={styles.guideContent}>
                        <Text style={[styles.guideTitle, { color: colors.text }]}>{getLocalizedField(guide, 'title', language)}</Text>
                        {guide.description && (
                          <Text style={[styles.guideDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                            {getLocalizedField(guide, 'description', language)}
                          </Text>
                        )}
                        <View style={styles.guideMeta}>
                          <View style={styles.metaItem}>
                            <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={14} color={colors.textSecondary} />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{guide.file_name}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={14} color={colors.textSecondary} />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                              {t('guides_training_editor.updated_label', { date: formatDate(guide.updated_at) })}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.guideActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity
                        style={[styles.arrowButton, { backgroundColor: colors.background }, index === 0 && styles.arrowButtonDisabled]}
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <IconSymbol ios_icon_name="arrow.up" android_material_icon_name="arrow-upward" size={18} color={index === 0 ? colors.textSecondary : colors.highlight} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.arrowButton, { backgroundColor: colors.background }, index === filteredGuides.length - 1 && styles.arrowButtonDisabled]}
                        onPress={() => handleMoveDown(index)}
                        disabled={index === filteredGuides.length - 1}
                      >
                        <IconSymbol ios_icon_name="arrow.down" android_material_icon_name="arrow-downward" size={18} color={index === filteredGuides.length - 1 ? colors.textSecondary : colors.highlight} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.background }]}
                        onPress={() => openEditModal(guide)}
                      >
                        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.highlight} />
                        <Text style={[styles.actionButtonText, { color: colors.highlight }]}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDelete(guide)}
                      >
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#E74C3C" />
                        <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                          {t('common.delete')}
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
                {editingGuide ? t('guides_training_editor.modal_edit_title') : t('guides_training_editor.modal_add_title')}
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
                <Text style={styles.formLabel}>{t('guides_training_editor.thumbnail_label')}</Text>
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
                      <Text style={styles.imageUploadText}>{t('guides_training_editor.tap_to_upload_thumbnail')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* File Upload */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('guides_training_editor.file_label')}</Text>
                <TouchableOpacity style={styles.fileUploadButton} onPress={pickFile}>
                  <IconSymbol
                    ios_icon_name="doc.fill"
                    android_material_icon_name="description"
                    size={24}
                    color={colors.highlight}
                  />
                  <Text style={styles.fileUploadText}>
                    {selectedFile ? selectedFile.name : editingGuide ? editingGuide.file_name : t('guides_training_editor.select_file')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('guides_training_editor.title_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('guides_training_editor.title_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('guides_training_editor.description_label')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('guides_training_editor.description_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Spanish Translation Section */}
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.spanishSectionHeader}
                  onPress={() => setShowSpanish(!showSpanish)}
                >
                  <Text style={styles.formLabel}>{t('translation_section.spanish_section_title')}</Text>
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
                          {t('translation_section.auto_translate')}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.spanishFieldLabel}>{t('translation_section.title_es_label')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('translation_section.title_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.title_es}
                      onChangeText={(text) => setFormData({ ...formData, title_es: text })}
                    />

                    <Text style={[styles.spanishFieldLabel, { marginTop: 12 }]}>{t('translation_section.description_es_label')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder={t('translation_section.description_es_placeholder')}
                      placeholderTextColor="#999999"
                      value={formData.description_es}
                      onChangeText={(text) => setFormData({ ...formData, description_es: text })}
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                )}
              </View>

              {/* Category */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('guides_training_editor.category_label')}</Text>
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
                        formData.category === category && { backgroundColor: colors.highlight, borderColor: colors.highlight },
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
                <Text style={styles.formLabel}>{t('guides_training_editor.display_order_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('guides_training_editor.display_order_placeholder')}
                  placeholderTextColor="#999999"
                  value={formData.display_order.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 0;
                    setFormData({ ...formData, display_order: num });
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>
                  {t('guides_training_editor.display_order_hint')}
                </Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.highlight }]}
                onPress={handleSave}
                disabled={uploadingFile || uploadingThumbnail}
              >
                {uploadingFile || uploadingThumbnail ? (
                  <ActivityIndicator color="#1A1A1A" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingGuide ? t('guides_training_editor.save_button_update') : t('guides_training_editor.save_button_add')}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
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
    marginRight: 8,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addNewItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
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
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  guideCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  guideCardDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
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
    marginBottom: 6,
  },
  guideDescription: {
    fontSize: 14,
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
  },
  guideActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.3,
  },
  deleteButton: {
    backgroundColor: '#2C1F1F',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  optionButtonTextActive: {
    color: '#1A1A1A',
  },
  saveButton: {
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
  spanishSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  spanishFields: {
    backgroundColor: '#FFFDE7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFF59D',
  },
  autoTranslateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  autoTranslateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  spanishFieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5D4037',
    marginBottom: 6,
  },
});
