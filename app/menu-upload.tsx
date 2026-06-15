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
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

interface MenuUpload {
  id: string;
  file_name: string;
  source_type: string;
  status: 'processing' | 'ready_for_review' | 'applied' | 'failed';
  items_inserted: number | null;
  credits_charged: number | null;
  was_free: boolean | null;
  error_message: string | null;
  created_at: string;
}

interface Quota {
  free_available: boolean;
  credits_remaining: number;
  monthly_allowance: number;
  costs: { pdf: number; image_per_page: number; website: number };
}

// Menu-target options the owner can populate (resolved from org scope + count).
function targetMenuOptions(menuCount: number, scope: string, m1: string, m2: string) {
  if (menuCount === 1) return [{ slot: 0, label: m1 }];
  if (scope === 'per_menu') return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }];
  return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }, { slot: 0, label: 'Both menus' }];
}

export default function MenuUploadScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const { t } = useTranslation();

  const [uploads, setUploads] = useState<MenuUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  // Delete-a-menu modal state
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteSlot, setDeleteSlot] = useState<number>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteAlsoCats, setDeleteAlsoCats] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = user?.role === 'owner';
  const menuOptions = targetMenuOptions(
    organization.menu_count,
    organization.menu_category_scope,
    organization.menu_1_name,
    organization.menu_2_name
  );
  // First menu is always free; afterwards premium-only.
  const canUpload = (quota?.free_available ?? false) || hasPremium;

  const loadQuota = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      const { data } = await (supabase.rpc as any)('get_menu_upload_quota', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      if (data?.success) setQuota(data);
    } catch (e) {
      console.error('quota error', e);
    }
  }, [user?.id, organizationId]);

  const loadUploads = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const { data, error } = await (supabase.from('menu_uploads' as any) as any)
        .select('id, file_name, source_type, status, items_inserted, credits_charged, was_free, error_message, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      setUploads(data || []);
    } catch (e) {
      console.error('Error loading menu uploads:', e);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useFocusEffect(
    useCallback(() => {
      loadUploads();
      loadQuota();
    }, [loadUploads, loadQuota])
  );

  // Poll for parse completion, then route to the review screen.
  useEffect(() => {
    if (!processingId) return;
    const interval = setInterval(async () => {
      const { data } = await (supabase.from('menu_uploads' as any) as any)
        .select('id, status, error_message')
        .eq('id', processingId)
        .single();
      if (data && data.status !== 'processing') {
        const id = processingId;
        setProcessingId(null);
        loadUploads();
        loadQuota();
        if (data.status === 'ready_for_review') {
          router.push({ pathname: '/menu-upload-review', params: { upload_id: id } });
        } else if (data.status === 'failed') {
          Alert.alert(
            t('menu_upload.failed_title', 'Could Not Read Menu'),
            data.error_message || t('menu_upload.failed_generic', 'Something went wrong reading that menu. Please try again.')
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId, router, t, loadUploads, loadQuota]);

  const uploadFileToStorage = async (base64: string, fileName: string, contentType: string): Promise<string> => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const storageName = `${organizationId}/${Date.now()}-${fileName}`;
    const { error } = await supabase.storage.from('menu-uploads').upload(storageName, bytes, { contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('menu-uploads').getPublicUrl(storageName);
    return data.publicUrl;
  };

  const startParse = async (
    fileUrl: string,
    displayName: string,
    mediaType: string,
    sourceType: 'pdf' | 'image',
    pageCount: number,
    additionalImageUrls: string[] = []
  ) => {
    const { data: record, error: insertError } = await (supabase.from('menu_uploads' as any) as any)
      .insert({
        organization_id: organizationId,
        uploaded_by: user?.id,
        file_url: fileUrl,
        file_name: displayName,
        source_type: sourceType,
        page_count: pageCount,
        status: 'processing',
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    setProcessingId(record.id);

    const { error: fnError } = await supabase.functions.invoke('parse-menu', {
      body: {
        file_url: fileUrl,
        upload_id: record.id,
        user_id: user?.id,
        organization_id: organizationId,
        media_type: mediaType,
        source_type: sourceType,
        page_count: pageCount,
        additional_image_urls: additionalImageUrls,
      },
    });
    if (fnError) console.error('parse-menu invoke error:', fnError);
    loadUploads();
  };

  // Returns true if the owner may start an upload costing `minCost` credits.
  // First upload is always free; afterwards premium + enough credits.
  const guardUpload = (minCost: number): boolean => {
    if (!isOwner) {
      Alert.alert(t('menu_upload.owner_only_title', 'Owner Only'), t('menu_upload.owner_only_msg', 'Only the restaurant owner can upload a menu.'));
      return false;
    }
    if (quota?.free_available) return true;
    if (!hasPremium) {
      Alert.alert(
        t('menu_upload.premium_title', 'Premium Feature'),
        t('menu_upload.premium_msg', 'AI Menu Upload requires the Premium plan ($15/mo). Upgrade to unlock this and other premium features.'),
        [
          { text: t('common.not_now', 'Not Now'), style: 'cancel' },
          { text: t('common.upgrade', 'Upgrade'), onPress: () => router.push('/subscription-management' as any) },
        ]
      );
      return false;
    }
    if ((quota?.credits_remaining ?? 0) < minCost) {
      Alert.alert(
        t('menu_upload.insufficient_title', 'Not Enough Credits'),
        t('menu_upload.insufficient_msg', { defaultValue: 'This needs {{cost}} credits but you have {{have}} left this month. Credits reset next month.', cost: minCost, have: quota?.credits_remaining ?? 0 })
      );
      return false;
    }
    return true;
  };

  const handlePdfUpload = async () => {
    if (!guardUpload(quota?.costs.pdf ?? 3)) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const ext = (file.name || '').toLowerCase().split('.').pop();
      const isImg = ext === 'jpg' || ext === 'jpeg' || ext === 'png';
      const mediaType = file.mimeType || (ext === 'png' ? 'image/png' : isImg ? 'image/jpeg' : 'application/pdf');
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileUrl = await uploadFileToStorage(base64, file.name || 'menu', mediaType);
      await startParse(fileUrl, file.name || 'Menu', mediaType, isImg ? 'image' : 'pdf', 1);
    } catch (e: any) {
      console.error('PDF upload error:', e);
      Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), e.message || t('menu_upload.failed_generic', 'An error occurred.'));
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoUpload = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('menu_upload.permission_title', 'Permission Required'), t('menu_upload.permission_msg', 'Please allow photo access to upload menu photos.'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9, orderedSelection: true });
      if (result.canceled || !result.assets?.length) return;
      const images = result.assets;
      // Photos cost 1 credit each; enforce the precise count now (unless this is the free first upload).
      if (!quota?.free_available && hasPremium && (quota?.credits_remaining ?? 0) < images.length) {
        Alert.alert(
          t('menu_upload.insufficient_title', 'Not Enough Credits'),
          t('menu_upload.insufficient_msg', { defaultValue: 'This needs {{cost}} credits but you have {{have}} left this month. Credits reset next month.', cost: images.length, have: quota?.credits_remaining ?? 0 })
        );
        return;
      }
      setUploading(true);
      const urls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const ext = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: FileSystem.EncodingType.Base64 });
        urls.push(await uploadFileToStorage(base64, `menu-page-${i + 1}.${ext}`, contentType));
      }
      const displayName = images.length > 1 ? `Menu photos (${images.length})` : 'Menu photo';
      const primaryType = images[0].uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      await startParse(urls[0], displayName, primaryType, 'image', images.length, urls.slice(1));
    } catch (e: any) {
      console.error('Photo upload error:', e);
      Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), e.message || t('menu_upload.failed_generic', 'An error occurred.'));
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteMenu = async () => {
    const expected = (menuOptions.find((o) => o.slot === deleteSlot)?.label || '').trim();
    if (deleteConfirmText.trim().toLowerCase() !== expected.toLowerCase()) {
      Alert.alert(t('menu_upload.delete_mismatch_title', 'Name Did Not Match'), t('menu_upload.delete_mismatch_msg', 'Type the menu name exactly to confirm.'));
      return;
    }
    try {
      setDeleting(true);
      const { data, error } = await (supabase.rpc as any)('delete_menu', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
        p_target_slot: deleteSlot,
        p_delete_custom_categories: deleteAlsoCats,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Delete failed');
      setDeleteVisible(false);
      setDeleteConfirmText('');
      setDeleteAlsoCats(false);
      Alert.alert(
        t('menu_upload.delete_done_title', 'Menu Cleared'),
        t('menu_upload.delete_done_msg', { defaultValue: 'Removed {{items}} items.', items: data.items_deleted })
      );
    } catch (e: any) {
      console.error('delete_menu error:', e);
      Alert.alert(t('menu_upload.delete_failed', 'Could Not Delete'), e.message || 'Error');
    } finally {
      setDeleting(false);
    }
  };

  const creditsWord = t('menu_upload.credits', 'credits');
  const costPdf = quota?.free_available ? t('menu_upload.free', 'FREE') : `${quota?.costs.pdf ?? 3} ${creditsWord}`;
  const costPhoto = quota?.free_available ? t('menu_upload.free', 'FREE') : `1 ${t('menu_upload.credit', 'credit')}/photo`;

  const statusColor = (s: string) =>
    s === 'applied' ? '#4CAF50' : s === 'ready_for_review' ? colors.primary : s === 'processing' ? '#FF9800' : '#F44336';
  const statusLabel = (s: string) =>
    s === 'applied' ? t('menu_upload.status_applied', 'Added')
      : s === 'ready_for_review' ? t('menu_upload.status_review', 'Ready to review')
      : s === 'processing' ? t('menu_upload.status_processing', 'Reading...')
      : t('menu_upload.status_failed', 'Failed');

  // Once an upload has been parsed, show what it cost (free first upload vs N credits).
  const creditLabel = (u: MenuUpload): string => {
    if (u.status !== 'applied' && u.status !== 'ready_for_review') return '';
    if (u.was_free) return t('menu_upload.free', 'FREE');
    if (u.credits_charged && u.credits_charged > 0) {
      const word = u.credits_charged === 1 ? t('menu_upload.credit', 'credit') : t('menu_upload.credits', 'credits');
      return `${u.credits_charged} ${word}`;
    }
    return '';
  };

  const styles = createStyles(colors);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('menu_upload.title', 'AI Menu Upload')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Credits / gating banner */}
        <View style={[styles.creditsCard, { backgroundColor: colors.primary + '12' }]}>
          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            {quota?.free_available ? (
              <>
                <Text style={[styles.creditsTitle, { color: colors.primary }]}>{t('menu_upload.first_free_title', 'Your first menu is FREE')}</Text>
                <Text style={[styles.creditsSub, { color: colors.textSecondary }]}>{t('menu_upload.first_free_sub', 'Upload a PDF or photos and we’ll build your menu. You review everything before it goes live.')}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.creditsTitle, { color: colors.primary }]}>
                  {t('menu_upload.credits_left', { defaultValue: '{{n}} of {{max}} credits left this month', n: quota?.credits_remaining ?? 0, max: quota?.monthly_allowance ?? 10 })}
                </Text>
                <Text style={[styles.creditsSub, { color: colors.textSecondary }]}>{t('menu_upload.credits_costs', { defaultValue: 'PDF = {{pdf}} credits · Each photo = 1 credit', pdf: quota?.costs.pdf ?? 3 })}</Text>
              </>
            )}
          </View>
        </View>

        {!canUpload && (
          <TouchableOpacity style={[styles.lockCard, { backgroundColor: colors.card }]} onPress={() => router.push('/subscription-management' as any)} activeOpacity={0.8}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={colors.primary} />
            <Text style={[styles.lockText, { color: colors.text }]}>{t('menu_upload.upgrade_cta', 'Upgrade to Premium to upload more menus')}</Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Upload buttons */}
        <View style={styles.uploadRow}>
          <TouchableOpacity
            style={[styles.uploadCard, { backgroundColor: colors.primary, opacity: canUpload ? 1 : 0.5 }]}
            onPress={handlePdfUpload}
            disabled={uploading || processingId !== null}
            activeOpacity={0.85}
          >
            {uploading ? <ActivityIndicator color="#FFF" /> : <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={26} color="#FFFFFF" />}
            <Text style={styles.uploadTitle}>{t('menu_upload.upload_pdf', 'Upload PDF')}</Text>
            <Text style={styles.uploadSub}>{costPdf}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.uploadCard, { backgroundColor: colors.primary, opacity: canUpload ? 1 : 0.5 }]}
            onPress={handlePhotoUpload}
            disabled={uploading || processingId !== null}
            activeOpacity={0.85}
          >
            {uploading ? <ActivityIndicator color="#FFF" /> : <IconSymbol ios_icon_name="photo.on.rectangle" android_material_icon_name="add-photo-alternate" size={26} color="#FFFFFF" />}
            <Text style={styles.uploadTitle}>{t('menu_upload.upload_photos', 'Upload Photos')}</Text>
            <Text style={styles.uploadSub}>{costPhoto}</Text>
          </TouchableOpacity>
        </View>

        {processingId ? (
          <View style={[styles.processingBanner, { backgroundColor: '#FFF3E0' }]}>
            <ActivityIndicator size="small" color="#FF9800" />
            <Text style={styles.processingText}>{t('menu_upload.processing_message', 'AI is reading your menu… this can take 40 seconds to 3 minutes depending on the file size.')}</Text>
          </View>
        ) : (
          <View style={[styles.hintBanner, { backgroundColor: colors.primary + '0D' }]}>
            <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={16} color={colors.textSecondary} />
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('menu_upload.upload_hint', 'Reading a menu takes about 40 seconds to 3 minutes depending on the file size.')}</Text>
          </View>
        )}

        {/* History */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('menu_upload.history', 'Recent Uploads')}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : uploads.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('menu_upload.no_uploads', 'No uploads yet.')}</Text>
        ) : (
          uploads.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[styles.historyCard, { backgroundColor: colors.card }]}
              activeOpacity={u.status === 'ready_for_review' ? 0.7 : 1}
              onPress={() => u.status === 'ready_for_review' && router.push({ pathname: '/menu-upload-review', params: { upload_id: u.id } })}
            >
              <IconSymbol
                ios_icon_name={u.source_type === 'image' ? 'photo' : 'doc'}
                android_material_icon_name={u.source_type === 'image' ? 'image' : 'description'}
                size={20}
                color={colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyName, { color: colors.text }]} numberOfLines={1}>{u.file_name}</Text>
                <Text style={[styles.historyMeta, { color: statusColor(u.status) }]}>
                  {statusLabel(u.status)}
                  {u.status === 'applied' && u.items_inserted != null ? ` · ${u.items_inserted} ${t('menu_upload.items', 'items')}` : ''}
                  {creditLabel(u) ? ` · ${creditLabel(u)}` : ''}
                </Text>
              </View>
              {u.status === 'ready_for_review' && (
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))
        )}

        {/* Danger zone — clear a menu before a fresh upload */}
        {isOwner && (
          <TouchableOpacity style={[styles.dangerRow, { borderColor: '#F44336' + '40' }]} onPress={() => { setDeleteSlot(menuOptions[0].slot); setDeleteVisible(true); }} activeOpacity={0.8}>
            <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color="#F44336" />
            <Text style={styles.dangerText}>{t('menu_upload.delete_menu_cta', 'Delete a menu (start fresh)')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Delete-a-menu modal */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => setDeleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('menu_upload.delete_modal_title', 'Delete a Menu')}</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>{t('menu_upload.delete_modal_sub', 'This permanently deletes that menu’s items. Items shared with the other menu are kept.')}</Text>

            {menuOptions.length > 1 && (
              <View style={styles.segmentRow}>
                {menuOptions.map((o) => (
                  <TouchableOpacity
                    key={o.slot}
                    style={[styles.segment, deleteSlot === o.slot && { backgroundColor: colors.primary }]}
                    onPress={() => setDeleteSlot(o.slot)}
                  >
                    <Text style={[styles.segmentText, { color: deleteSlot === o.slot ? '#FFF' : colors.text }]} numberOfLines={1}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.checkRow} onPress={() => setDeleteAlsoCats((v) => !v)}>
              <IconSymbol ios_icon_name={deleteAlsoCats ? 'checkmark.square.fill' : 'square'} android_material_icon_name={deleteAlsoCats ? 'check-box' : 'check-box-outline-blank'} size={20} color={colors.primary} />
              <Text style={[styles.checkLabel, { color: colors.text }]}>{t('menu_upload.delete_also_cats', 'Also delete custom categories (keeps built-in ones)')}</Text>
            </TouchableOpacity>

            <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>
              {t('menu_upload.delete_type_name', { defaultValue: 'Type "{{name}}" to confirm', name: menuOptions.find((o) => o.slot === deleteSlot)?.label })}
            </Text>
            <TextInput
              style={[styles.confirmInput, { color: colors.text, borderColor: colors.border }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={menuOptions.find((o) => o.slot === deleteSlot)?.label}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setDeleteVisible(false); setDeleteConfirmText(''); }}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalDelete, { opacity: deleting ? 0.6 : 1 }]} onPress={confirmDeleteMenu} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalDeleteText}>{t('common.delete', 'Delete')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 16, paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRight: { width: 40 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  creditsCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 12, marginBottom: 14 },
  creditsTitle: { fontSize: 15, fontWeight: '700' },
  creditsSub: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 14 },
  lockText: { flex: 1, fontSize: 13, fontWeight: '600' },
  uploadRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  uploadCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, gap: 6 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  uploadSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 14 },
  processingText: { flex: 1, fontSize: 13, color: '#E65100' },
  hintBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 14 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 8 },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, marginBottom: 8 },
  historyName: { fontSize: 14, fontWeight: '600' },
  historyMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginTop: 20 },
  dangerText: { fontSize: 13, fontWeight: '600', color: '#F44336' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  segmentRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  segmentText: { fontSize: 12.5, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  checkLabel: { flex: 1, fontSize: 12.5 },
  confirmLabel: { fontSize: 12.5, marginTop: 16, marginBottom: 6 },
  confirmInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalDelete: { backgroundColor: '#F44336', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalDeleteText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
