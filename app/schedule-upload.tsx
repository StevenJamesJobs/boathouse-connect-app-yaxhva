import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

interface ScheduleUpload {
  id: string;
  file_name: string;
  file_url: string;
  week_start: string;
  week_end: string;
  status: 'processing' | 'completed' | 'failed' | 'replaced';
  parsed_shifts_count: number;
  unmatched_employees: string[];
  error_message: string | null;
  created_at: string;
}

export default function ScheduleUploadScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [uploads, setUploads] = useState<ScheduleUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadUploads();
    }, [])
  );

  // Poll for processing status
  useEffect(() => {
    if (!processingId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('schedule_uploads')
        .select('*')
        .eq('id', processingId)
        .single();

      if (data && data.status !== 'processing') {
        setProcessingId(null);
        loadUploads();
        if (data.status === 'completed') {
          Alert.alert(
            t('schedule_upload.success_title', 'Schedule Processed!'),
            t('schedule_upload.success_message', {
              defaultValue: `Parsed {{count}} shifts for {{employees}} employees.${data.unmatched_employees?.length > 0 ? ` ${data.unmatched_employees.length} employees could not be matched.` : ''}`,
              count: data.parsed_shifts_count,
              employees: new Set(/* approximate */).size || '~',
            })
          );
        } else if (data.status === 'failed') {
          Alert.alert(
            t('schedule_upload.error_title', 'Processing Failed'),
            data.error_message || t('schedule_upload.error_generic', 'An error occurred while processing the schedule.')
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId]);

  const loadUploads = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('schedule_uploads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setUploads(data || []);
    } catch (error) {
      console.error('Error loading uploads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper: upload a file (base64) to Supabase storage and return the public URL
  const uploadFileToStorage = async (
    base64: string,
    fileName: string,
    contentType: string
  ): Promise<string> => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const storageName = `${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('schedules')
      .upload(storageName, bytes, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('schedules')
      .getPublicUrl(storageName);

    return urlData.publicUrl;
  };

  // Helper: create upload record + invoke edge function
  const processScheduleUpload = async (
    fileUrl: string,
    displayName: string,
    mediaType: string,
    additionalImageUrls: string[] = []
  ) => {
    const { data: uploadRecord, error: insertError } = await supabase
      .from('schedule_uploads')
      .insert({
        uploaded_by: user?.id,
        file_url: fileUrl,
        file_name: displayName,
        week_start: new Date().toISOString().split('T')[0],
        week_end: new Date().toISOString().split('T')[0],
        status: 'processing',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    setProcessingId(uploadRecord.id);

    const { error: fnError } = await supabase.functions.invoke('parse-schedule', {
      body: {
        file_url: fileUrl,
        upload_id: uploadRecord.id,
        media_type: mediaType,
        additional_image_urls: additionalImageUrls,
      },
    });

    if (fnError) {
      console.error('Edge function error:', fnError);
    }

    loadUploads();
  };

  // Determine media type from file name/extension
  const getMediaType = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
      default:
        return 'application/pdf';
    }
  };

  // ─── PDF / Image Upload (via Document Picker → Files app) ─────────────────
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const mediaType = file.mimeType || getMediaType(file.name);
      setUploading(true);

      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileUrl = await uploadFileToStorage(base64, file.name, mediaType);
      await processScheduleUpload(fileUrl, file.name, mediaType);
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert(
        t('schedule_upload.error_title', 'Upload Failed'),
        error.message || t('schedule_upload.error_generic', 'An error occurred.')
      );
    } finally {
      setUploading(false);
    }
  };

  // ─── Image Upload (via Image Picker → Photos library) ─────────────────────
  const handleImageUpload = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload schedule images.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
        orderedSelection: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploading(true);

      const images = result.assets;
      const uploadedUrls: string[] = [];

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const ext = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const imageName = `schedule-page-${i + 1}.${ext}`;

        const base64 = await FileSystem.readAsStringAsync(image.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const url = await uploadFileToStorage(base64, imageName, contentType);
        uploadedUrls.push(url);
      }

      const primaryUrl = uploadedUrls[0];
      const additionalUrls = uploadedUrls.slice(1);
      const displayName = images.length > 1
        ? `Schedule images (${images.length} pages)`
        : 'Schedule image (1 page)';
      const primaryExt = images[0].uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      await processScheduleUpload(primaryUrl, displayName, primaryExt, additionalUrls);
    } catch (error: any) {
      console.error('Image upload error:', error);
      Alert.alert(
        t('schedule_upload.error_title', 'Upload Failed'),
        error.message || t('schedule_upload.error_generic', 'An error occurred.')
      );
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'processing': return '#FF9800';
      case 'failed': return '#F44336';
      case 'replaced': return '#9E9E9E';
      default: return colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return t('schedule_upload.status_completed', 'Completed');
      case 'processing': return t('schedule_upload.status_processing', 'Processing...');
      case 'failed': return t('schedule_upload.status_failed', 'Failed');
      case 'replaced': return t('schedule_upload.status_replaced', 'Replaced');
      default: return status;
    }
  };

  const handleDeleteUpload = (upload: ScheduleUpload) => {
    Alert.alert(
      t('schedule_upload.delete_title', 'Delete Schedule'),
      t('schedule_upload.delete_message', 'This will remove all shifts from this upload. Are you sure?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('schedule_uploads').delete().eq('id', upload.id);
              loadUploads();
            } catch (error) {
              console.error('Delete error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('schedule_upload.title', 'Staff Schedules')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Upload Buttons */}
        <View style={styles.uploadRow}>
          {/* PDF Upload */}
          <TouchableOpacity
            style={[styles.uploadCard, { backgroundColor: colors.primary }]}
            onPress={handleUpload}
            disabled={uploading || processingId !== null}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <IconSymbol
                ios_icon_name="doc.fill"
                android_material_icon_name="description"
                size={26}
                color="#FFFFFF"
              />
            )}
            <View style={styles.uploadTextContainer}>
              <Text style={styles.uploadTitle}>
                {uploading
                  ? t('schedule_upload.uploading', 'Uploading...')
                  : t('schedule_upload.upload_file', 'Upload File')}
              </Text>
              <Text style={styles.uploadSubtitle}>
                {t('schedule_upload.file_desc', 'PDF or Image')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Image Upload */}
          <TouchableOpacity
            style={[styles.uploadCard, { backgroundColor: colors.primary }]}
            onPress={handleImageUpload}
            disabled={uploading || processingId !== null}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <IconSymbol
                ios_icon_name="photo.on.rectangle"
                android_material_icon_name="add-photo-alternate"
                size={26}
                color="#FFFFFF"
              />
            )}
            <View style={styles.uploadTextContainer}>
              <Text style={styles.uploadTitle}>
                {uploading
                  ? t('schedule_upload.uploading', 'Uploading...')
                  : t('schedule_upload.upload_images', 'Upload Images')}
              </Text>
              <Text style={styles.uploadSubtitle}>
                {t('schedule_upload.images_desc', 'From Photos')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Processing indicator */}
        {processingId && (
          <View style={[styles.processingBanner, { backgroundColor: '#FFF3E0' }]}>
            <ActivityIndicator size="small" color="#FF9800" />
            <Text style={styles.processingText}>
              {t('schedule_upload.processing_message', 'AI is reading your schedule PDF... This may take 15-30 seconds.')}
            </Text>
          </View>
        )}

        {/* Upload History */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('schedule_upload.history', 'Upload History')}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
        ) : uploads.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <IconSymbol
              ios_icon_name="calendar.badge.plus"
              android_material_icon_name="event-note"
              size={48}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('schedule_upload.no_uploads', 'No Schedules Yet')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('schedule_upload.no_uploads_desc', 'Upload a Restaurant 365 PDF to get started. Shifts will be automatically parsed and assigned to employees.')}
            </Text>
          </View>
        ) : (
          uploads.map((upload) => (
            <TouchableOpacity
              key={upload.id}
              style={[styles.uploadHistoryCard, { backgroundColor: colors.card }]}
              onPress={() => upload.status === 'completed' ? router.push({ pathname: '/schedule-review', params: { upload_id: upload.id } }) : null}
              onLongPress={() => handleDeleteUpload(upload)}
              activeOpacity={upload.status === 'completed' ? 0.7 : 0.8}
            >
              <View style={styles.uploadHistoryHeader}>
                <View style={styles.weekRange}>
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="event"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.weekRangeText, { color: colors.text }]}>
                    {formatDate(upload.week_start)} – {formatDate(upload.week_end)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(upload.status) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(upload.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(upload.status) }]}>
                    {getStatusLabel(upload.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.uploadHistoryDetails}>
                <Text style={[styles.fileName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {upload.file_name}
                </Text>
                <Text style={[styles.uploadDate, { color: colors.textSecondary }]}>
                  {formatTimestamp(upload.created_at)}
                </Text>
              </View>

              {upload.status === 'completed' && (
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={[styles.statNumber, { color: colors.primary }]}>
                      {upload.parsed_shifts_count}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                      {t('schedule_upload.shifts', 'shifts')}
                    </Text>
                  </View>
                  {upload.unmatched_employees && upload.unmatched_employees.length > 0 && (
                    <View style={styles.stat}>
                      <Text style={[styles.statNumber, { color: '#FF9800' }]}>
                        {upload.unmatched_employees.length}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('schedule_upload.unmatched', 'unmatched')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {upload.status === 'completed' &&
                upload.unmatched_employees &&
                upload.unmatched_employees.length > 0 && (
                  <View style={[styles.unmatchedSection, { borderTopColor: colors.border }]}>
                    <Text style={[styles.unmatchedTitle, { color: '#FF9800' }]}>
                      {t('schedule_upload.unmatched_employees', 'Unmatched Employees:')}
                    </Text>
                    {upload.unmatched_employees.map((name, idx) => (
                      <Text key={idx} style={[styles.unmatchedName, { color: colors.textSecondary }]}>
                        • {name}
                      </Text>
                    ))}
                  </View>
                )}

              {upload.status === 'completed' && (
                <View style={[styles.reviewRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.reviewText, { color: colors.primary }]}>
                    {t('schedule_upload.review_edit', 'Review & Edit Shifts')}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron-right"
                    size={14}
                    color={colors.primary}
                  />
                </View>
              )}

              {upload.status === 'failed' && upload.error_message && (
                <View style={[styles.errorSection, { borderTopColor: colors.border }]}>
                  <Text style={[styles.errorText, { color: '#F44336' }]}>
                    {upload.error_message}
                  </Text>
                </View>
              )}

              {upload.status === 'processing' && (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color="#FF9800" />
                  <Text style={[styles.processingSmallText, { color: '#FF9800' }]}>
                    {t('schedule_upload.processing_short', 'Processing...')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  uploadCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  uploadTextContainer: {
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  uploadSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
    textAlign: 'center',
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  processingText: {
    fontSize: 13,
    color: '#E65100',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  uploadHistoryCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  uploadHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  weekRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekRangeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  uploadHistoryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  uploadDate: {
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  unmatchedSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  unmatchedTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  unmatchedName: {
    fontSize: 12,
    marginLeft: 8,
    marginBottom: 2,
  },
  errorSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  errorText: {
    fontSize: 12,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  processingSmallText: {
    fontSize: 12,
    fontWeight: '500',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
