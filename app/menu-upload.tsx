import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadBase64 } from '@/utils/storageBroker';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import MenuSheet from '@/components/MenuSheet';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import ScanQuip from '@/components/MenuScanQuips';
import { fonts } from '@/constants/fonts';

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
  useRequireManagerRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = params.onboarding === '1';
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const { perms } = useManagerPermissions();
  const { t } = useTranslation();

  // s72: concept B — Upload | Recent Uploads tabs.
  const [tab, setTab] = useState<'upload' | 'history'>('upload');
  const [uploads, setUploads] = useState<MenuUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  // Dev-only rehearsal of the scanning state (Steve's ask: see the quip rotor
  // without burning parse credits). Stripped from release builds by __DEV__.
  const [simulating, setSimulating] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);

  // Delete-a-menu modal state
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteSlot, setDeleteSlot] = useState<number>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteAlsoCats, setDeleteAlsoCats] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = user?.role === 'owner';
  // Owner, or a manager the owner has granted AI Menu Uploads. Employees never
  // reach this route (useRequireManagerRoute bounces them). Menu DELETION below
  // stays owner-only — delete_menu is owner-gated server-side.
  const canAiUpload = isOwner || perms.aiUpload;
  const menuOptions = targetMenuOptions(
    organization.menu_count,
    organization.menu_category_scope,
    organization.menu_1_name,
    organization.menu_2_name
  );
  // First menu is always free; afterwards premium-only.
  const canUpload = (quota?.free_available ?? false) || hasPremium;
  const scanning = processingId !== null || simulating;

  const loadQuota = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      const { data } = await supabase.rpc('get_menu_upload_quota', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      const result = data as (Quota & { success?: boolean }) | null;
      if (result?.success) setQuota(result);
    } catch (e) {
      console.error('quota error', e);
    }
  }, [user?.id, organizationId]);

  const loadUploads = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_menu_uploads', {
        p_actor_id: user.id, p_limit: 15,
      });
      if (error) throw error;
      setUploads((data || []) as MenuUpload[]);
    } catch (e) {
      console.error('Error loading menu uploads:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, organizationId]);

  useFocusEffect(
    useCallback(() => {
      loadUploads();
      loadQuota();
    }, [loadUploads, loadQuota])
  );

  // Poll for parse completion, then route to the review screen.
  // An rpc error or 5 consecutive empty polls (e.g. a permission denial
  // returns no row) stops the poll instead of spinning forever.
  useEffect(() => {
    if (!processingId) return;
    let emptyTicks = 0;
    const interval = setInterval(async () => {
      if (!user?.id) return;
      const { data: pollRows, error: pollError } = await supabase.rpc('get_menu_uploads', {
        p_actor_id: user.id, p_upload_id: processingId,
      });
      const data: any = Array.isArray(pollRows) ? pollRows[0] : null;
      if (pollError || (!data && ++emptyTicks >= 5)) {
        clearInterval(interval);
        setProcessingId(null);
        Alert.alert(
          t('menu_upload.failed_title', 'Could Not Read Menu'),
          t('menu_upload.poll_failed', 'Could not check the upload status. Open Upload History to see the result.')
        );
        return;
      }
      if (data) emptyTicks = 0;
      if (data && data.status !== 'processing') {
        const id = processingId;
        setProcessingId(null);
        loadUploads();
        loadQuota();
        if (data.status === 'ready_for_review') {
          router.push({ pathname: '/menu-upload-review', params: { upload_id: id, ...(isOnboarding ? { onboarding: '1' } : {}) } });
        } else if (data.status === 'failed') {
          Alert.alert(
            t('menu_upload.failed_title', 'Could Not Read Menu'),
            translateServerError({ message: data.error_message }, t('menu_upload.failed_generic', 'Something went wrong reading that menu. Please try again.'))
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId, router, t, loadUploads, loadQuota, isOnboarding]);

  const uploadFileToStorage = async (base64: string, fileName: string, contentType: string): Promise<string> => {
    if (!user?.id) throw new Error('Not signed in');
    return await brokerUploadBase64('menu_upload_file', base64, fileName, contentType, user.id);
  };

  const startParse = async (
    fileUrl: string,
    displayName: string,
    mediaType: string,
    sourceType: 'pdf' | 'image',
    pageCount: number,
    additionalImageUrls: string[] = []
  ) => {
    if (!user?.id) return;
    const { data: newId, error: insertError } = await supabase.rpc('create_menu_upload', {
      p_actor_id: user.id,
      p_file_url: fileUrl,
      p_file_name: displayName,
      p_source_type: sourceType,
      p_page_count: pageCount,
    });
    if (insertError) throw insertError;

    setProcessingId(newId as string);

    const { error: fnError } = await supabase.functions.invoke('parse-menu', {
      body: {
        file_url: fileUrl,
        upload_id: newId,
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

  // Returns true if the actor (owner, or manager granted AI uploads) may start
  // an upload costing `minCost` credits. First upload is always free;
  // afterwards premium + enough credits.
  const guardUpload = (minCost: number): boolean => {
    if (!canAiUpload) {
      Alert.alert(
        t('menu_upload.permission_needed_title', 'Permission Needed'),
        t('menu_upload.permission_needed_msg', "Menu uploads need the owner's permission. Ask your owner to enable AI Menu Uploads for managers.")
      );
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
      Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.')));
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
      Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.')));
    } finally {
      setUploading(false);
    }
  };

  // s72: third source — single shot, then the exact 1-photo pipeline (the
  // MenuUploadSheet handler, with this page's plain-Alert error surface).
  const handleTakePhoto = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('menu_upload_sheet.camera_denied_title'), t('menu_upload_sheet.camera_denied_msg'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const image = result.assets[0];
      const ext = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: FileSystem.EncodingType.Base64 });
      const url = await uploadFileToStorage(base64, `menu-page-1.${ext}`, contentType);
      await startParse(url, 'Menu photo', contentType, 'image', 1);
    } catch (e: any) {
      console.error('Camera upload error:', e);
      Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.')));
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteMenu = async () => {
    if (!user?.id || !organizationId) return;
    const expected = (menuOptions.find((o) => o.slot === deleteSlot)?.label || '').trim();
    if (deleteConfirmText.trim().toLowerCase() !== expected.toLowerCase()) {
      Alert.alert(t('menu_upload.delete_mismatch_title', 'Name Did Not Match'), t('menu_upload.delete_mismatch_msg', 'Type the menu name exactly to confirm.'));
      return;
    }
    try {
      setDeleting(true);
      const { data, error } = await supabase.rpc('delete_menu', {
        p_user_id: user.id,
        p_organization_id: organizationId,
        p_target_slot: deleteSlot,
        p_delete_custom_categories: deleteAlsoCats,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; items_deleted?: number } | null;
      if (!result?.success) throw new Error(result?.error || 'Delete failed');
      setDeleteVisible(false);
      setDeleteConfirmText('');
      setDeleteAlsoCats(false);
      Alert.alert(
        t('menu_upload.delete_done_title', 'Menu Cleared'),
        t('menu_upload.delete_done_msg', { defaultValue: 'Removed {{items}} items.', items: result.items_deleted })
      );
    } catch (e: any) {
      console.error('delete_menu error:', e);
      Alert.alert(t('menu_upload.delete_failed', 'Could Not Delete'), translateServerError(e, 'Error'));
    } finally {
      setDeleting(false);
    }
  };

  const creditsWord = t('menu_upload.credits', 'credits');
  const creditWord = t('menu_upload.credit', 'credit');
  const freeWord = t('menu_upload.free', 'FREE');
  const isFree = quota?.free_available ?? false;
  const costFile = isFree ? freeWord : `${quota?.costs.pdf ?? 3} ${creditsWord}`;
  const costPhotos = isFree ? freeWord : t('menu_upload.btn_photos_cost', '1 credit each');
  const costCamera = isFree ? freeWord : `1 ${creditWord}`;

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
    if (u.was_free) return freeWord;
    if (u.credits_charged && u.credits_charged > 0) {
      const word = u.credits_charged === 1 ? creditWord : creditsWord;
      return `${u.credits_charged} ${word}`;
    }
    return '';
  };

  const styles = createStyles(colors);

  const methodButton = (
    key: string,
    label: string,
    cost: string,
    icon: { ios: string; android: string },
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.methodBtn, { opacity: canUpload ? 1 : 0.5 }]}
      onPress={onPress}
      disabled={uploading || scanning}
      activeOpacity={0.8}
    >
      {uploading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <IconSymbol ios_icon_name={icon.ios} android_material_icon_name={icon.android} size={20} color={colors.primary} />
      )}
      <Text style={styles.methodLabel}>{label}</Text>
      <Text style={styles.methodCost}>{cost}</Text>
    </TouchableOpacity>
  );

  // The delete-a-menu block — on BOTH tabs (Steve's s72 call), reworded from a
  // bare CTA into an intro + "Choose a Menu" button into the same modal.
  const dangerBlock = isOwner ? (
    <View style={styles.dangerWrap}>
      <Text style={styles.dangerIntro}>{t('menu_upload.delete_intro', 'Want to clear an existing menu from the database and start fresh?')}</Text>
      <TouchableOpacity
        style={styles.dangerBtn}
        onPress={() => { setDeleteSlot(menuOptions[0].slot); setDeleteVisible(true); }}
        activeOpacity={0.8}
      >
        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={15} color="#F44336" />
        <Text style={styles.dangerBtnText}>{t('menu_upload.choose_menu', 'Choose a Menu')}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      {/* Menu-family rhythm (insets.top + 12) — this page is a ⚙-sheet sibling
          of the Menus surface, so its chrome holds the family height. */}
      <ScreenHeader
        title={t('menu_upload.title', 'AI Menu Upload')}
        eyebrow={organization?.name}
        topOffset={insets.top + 12}
        rightWide={!isOnboarding}
        right={
          // The Menus-surface chip pair (⚙ "Menu" + the pencil flip) — this
          // page is buried behind ⚙ → Upload Menu, so carrying the family
          // chips keeps the way back (and around) familiar (s72, Steve).
          !isOnboarding ? (
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.menuChip} onPress={() => setMenuSheetVisible(true)} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="gearshape.fill" android_material_icon_name="settings" size={15} color={colors.text} />
                <Text style={styles.menuChipLabel}>{t('menu_sheet.title')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.flipChip} onPress={() => router.push('/menu-editor' as any)} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      {/* Upload | Recent Uploads */}
      <View style={styles.seg}>
        <TouchableOpacity style={[styles.segHalf, tab === 'upload' && styles.segHalfActive]} onPress={() => setTab('upload')} activeOpacity={0.8}>
          <Text style={[styles.segLabel, tab === 'upload' && styles.segLabelActive]}>{t('menu_upload.tab_upload', 'Upload')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segHalf, tab === 'history' && styles.segHalfActive]} onPress={() => setTab('history')} activeOpacity={0.8}>
          <Text style={[styles.segLabel, tab === 'history' && styles.segLabelActive]}>{t('menu_upload.tab_recent', 'Recent Uploads')}</Text>
          {uploads.length > 0 && (
            <View style={styles.segBubble}><Text style={styles.segBubbleText}>{uploads.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {tab === 'upload' ? (
          <>
            {/* Credits / gating banner */}
            <View style={[styles.creditsCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '3D' }]}>
              <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                {isFree ? (
                  <>
                    <Text style={[styles.creditsTitle, { color: colors.primary }]}>{t('menu_upload.first_free_title', 'Your first menu is FREE')}</Text>
                    <Text style={[styles.creditsSub, { color: colors.textSecondary }]}>{t('menu_upload.first_free_sub', 'Upload a PDF or photos and we’ll build your menu. You review everything before it goes live.')}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.creditsTitle, { color: colors.primary }]}>
                      {t('menu_upload.credits_left', { defaultValue: '{{n}} of {{max}} credits left this month', n: quota?.credits_remaining ?? 0, max: quota?.monthly_allowance ?? 10 })}
                    </Text>
                    <Text style={[styles.creditsSub, { color: colors.textSecondary }]}>{t('menu_upload.credits_costs', { defaultValue: 'PDF = {{pdf}} credits · Photos = 1 credit each · Take Photo = 1 credit', pdf: quota?.costs.pdf ?? 3 })}</Text>
                  </>
                )}
                <Text style={[styles.bestResults, { color: colors.textSecondary }]}>{t('menu_upload.best_results', 'For best results: make sure the image is clear when uploading or taking a photo, and review the scan afterwards for any errors.')}</Text>
              </View>
            </View>

            {!canUpload && (
              <TouchableOpacity style={[styles.lockCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={() => router.push('/subscription-management' as any)} activeOpacity={0.8}>
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={colors.primary} />
                <Text style={[styles.lockText, { color: colors.text }]}>{t('menu_upload.upgrade_cta', 'Upgrade to Premium to upload more menus')}</Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* The three slim sources (s72: + Take Photo, matching the ⚙ sheet). */}
            <View style={styles.methodRow}>
              {methodButton('file', t('menu_upload.btn_file', 'Upload File'), costFile, { ios: 'doc.fill', android: 'description' }, handlePdfUpload)}
              {methodButton('photos', t('menu_upload.btn_photos', 'Photos'), costPhotos, { ios: 'photo.on.rectangle', android: 'photo-library' }, handlePhotoUpload)}
              {methodButton('camera', t('menu_upload.btn_camera', 'Take Photo'), costCamera, { ios: 'camera.fill', android: 'camera-alt' }, handleTakePhoto)}
            </View>

            {__DEV__ && (
              <TouchableOpacity style={styles.devBtn} onPress={() => setSimulating((s) => !s)} activeOpacity={0.7}>
                <Text style={styles.devBtnText}>{simulating ? 'DEV · STOP SIMULATED SCAN' : 'DEV · SIMULATE SCAN'}</Text>
              </TouchableOpacity>
            )}

            {scanning ? (
              <View style={styles.scanCard}>
                <View style={styles.scanTop}>
                  <ActivityIndicator size="small" color="#FF9800" />
                  <ScanQuip style={styles.scanQuip} />
                </View>
                <Text style={[styles.scanSub, { color: colors.textSecondary }]}>{t('menu_upload.processing_message', 'AI is reading your menu… this can take 40 seconds to 3 minutes depending on the file size. Please don\'t close the app while it scans your file.')}</Text>
              </View>
            ) : (
              <View style={[styles.hintBanner, { backgroundColor: colors.surface }]}>
                <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={16} color={colors.textSecondary} />
                <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('menu_upload.upload_hint', 'Reading a menu takes about 40 seconds to 3 minutes depending on the file size. Please don\'t close the app while it scans your menu file or image.')}</Text>
              </View>
            )}

            {/* Onboarding: confirmation + a clear way back to the setup wizard
                (so they don't have to rely on the top-left back arrow). */}
            {isOnboarding && uploads.some((u) => u.status === 'applied') && (
              <View style={styles.onboardDoneCard}>
                <View style={styles.onboardDoneRow}>
                  <IconSymbol ios_icon_name="checkmark.seal.fill" android_material_icon_name="verified" size={22} color="#34A853" />
                  <Text style={[styles.onboardDoneText, { color: colors.text }]}>
                    {t('menu_upload.onboarding_done', 'Your first menu has been uploaded and created!')}
                  </Text>
                </View>
                <TouchableOpacity style={styles.onboardReturnBtn} onPress={() => router.back()} activeOpacity={0.85}>
                  <IconSymbol ios_icon_name="arrow.left" android_material_icon_name="arrow-back" size={18} color="#FFFFFF" />
                  <Text style={styles.onboardReturnText}>{t('menu_upload.return_to_onboarding', 'Return to Onboarding')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {dangerBlock}
          </>
        ) : (
          <>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : uploads.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('menu_upload.no_uploads', 'No uploads yet.')}</Text>
            ) : (
              uploads.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                  activeOpacity={u.status === 'ready_for_review' || u.status === 'applied' ? 0.7 : 1}
                  // ready_for_review → the live review; applied → the read-only
                  // scan viewer (the parsed snapshot outlives replaces — s72).
                  onPress={() => {
                    if (u.status === 'ready_for_review') {
                      router.push({ pathname: '/menu-upload-review', params: { upload_id: u.id, ...(isOnboarding ? { onboarding: '1' } : {}) } });
                    } else if (u.status === 'applied') {
                      router.push({ pathname: '/menu-upload-review', params: { upload_id: u.id, view: '1' } });
                    }
                  }}
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
                  {u.status === 'ready_for_review' ? (
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
                  ) : u.status === 'applied' ? (
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
                  ) : null}
                </TouchableOpacity>
              ))
            )}
            {dangerBlock}
          </>
        )}
      </ScrollView>

      {/* Delete-a-menu — the glass sheet treatment (s72). */}
      <GlassSheet
        visible={deleteVisible}
        onClose={() => { setDeleteVisible(false); setDeleteConfirmText(''); }}
        title={t('menu_upload.delete_modal_title', 'Delete a Menu')}
        subtitle={t('menu_upload.delete_modal_sub', 'This permanently deletes that menu\u2019s items. Items shared with the other menu are kept.')}
        footer={
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.sheetCancel, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              onPress={() => { setDeleteVisible(false); setDeleteConfirmText(''); }}
            >
              <Text style={[styles.sheetCancelText, { color: colors.text }]}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetDelete, { opacity: deleting ? 0.6 : 1 }]} onPress={confirmDeleteMenu} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sheetDeleteText}>{t('common.delete', 'Delete')}</Text>}
            </TouchableOpacity>
          </View>
        }
      >
        {menuOptions.length > 1 && (
          <View style={styles.segmentRow}>
            {menuOptions.map((o) => (
              <TouchableOpacity
                key={o.slot}
                style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, deleteSlot === o.slot && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setDeleteSlot(o.slot)}
              >
                <Text style={[styles.segmentText, { color: deleteSlot === o.slot ? colors.fireText : colors.text }]} numberOfLines={1}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.checkRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
          onPress={() => setDeleteAlsoCats((v) => !v)}
        >
          <IconSymbol ios_icon_name={deleteAlsoCats ? 'checkmark.square.fill' : 'square'} android_material_icon_name={deleteAlsoCats ? 'check-box' : 'check-box-outline-blank'} size={20} color={colors.primary} />
          <Text style={[styles.checkLabel, { color: colors.text }]}>{t('menu_upload.delete_also_cats', 'Also delete custom categories (keeps built-in ones)')}</Text>
        </TouchableOpacity>

        <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>
          {t('menu_upload.delete_type_name', { defaultValue: 'Type "{{name}}" to confirm', name: menuOptions.find((o) => o.slot === deleteSlot)?.label })}
        </Text>
        <TextInput
          style={[styles.confirmInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background + 'B3' }]}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder={menuOptions.find((o) => o.slot === deleteSlot)?.label}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
      </GlassSheet>

      {/* The ⚙ Menu sheet — the same Menu Options as the Menus surface. */}
      {user && !isOnboarding && (
        <MenuSheet
          visible={menuSheetVisible}
          onClose={() => setMenuSheetVisible(false)}
          colors={colors}
          role={isOwner ? 'owner' : 'manager'}
          mode="user"
          perms={perms}
          onEditMenu={() => router.push('/menu-editor' as any)}
          onEditCategories={() => router.push('/manage-menu-categories' as any)}
          onMenuConfiguration={() => {
            const p: Record<string, string> = { tab: 'menu' };
            if (!isOwner) p.scoped = '1';
            router.push({ pathname: '/organization-settings', params: p } as any);
          }}
          quota={quota ? { remaining: quota.credits_remaining, max: quota.monthly_allowance, freeAvailable: quota.free_available } : null}
          refreshQuota={loadQuota}
        />
      )}

      {/* Menu-family chrome — hidden during onboarding (the wizard owns nav). */}
      {!isOnboarding && (
        <>
          <BottomNavBar activeTab="menus" />
          <View style={styles.joltLayer} pointerEvents="box-none">
            <JoltOverlay role="manager" />
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 4, paddingBottom: 120 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.glassBorder,
  },
  menuChipLabel: { fontFamily: fonts.body.semibold, fontSize: 13, color: colors.text },
  flipChip: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '2E',
    borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.primary + '6B',
  },
  seg: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 13,
    padding: 3,
    gap: 3,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.glassBorder,
  },
  segHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  segHalfActive: { backgroundColor: colors.primary + '2E' },
  segLabel: { fontFamily: fonts.display.semibold, fontSize: 12.5, color: colors.textSecondary },
  segLabelActive: { color: colors.primary },
  segBubble: {
    minWidth: 17,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue + '38',
  },
  segBubbleText: { fontFamily: fonts.mono.semibold, fontSize: 9, color: colors.blueText },
  creditsCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14,
    borderRadius: 17, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 13,
  },
  creditsTitle: { fontSize: 15, fontFamily: fonts.display.semibold },
  creditsSub: { fontSize: 12, fontFamily: fonts.body.regular, marginTop: 3, lineHeight: 17 },
  bestResults: { fontSize: 11, fontFamily: fonts.body.regular, marginTop: 7, lineHeight: 15.5, fontStyle: 'italic' },
  lockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 13,
  },
  lockText: { flex: 1, fontSize: 13, fontFamily: fonts.body.semibold },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  methodBtn: {
    flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: colors.primary + '29',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.primary + '61',
  },
  methodLabel: { fontSize: 11.5, fontFamily: fonts.body.semibold, color: colors.text },
  methodCost: { fontSize: 8.5, fontFamily: fonts.mono.medium, color: colors.textSecondary },
  devBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 7, paddingHorizontal: 11,
    borderRadius: 10, marginBottom: 13,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary + '8C',
  },
  devBtnText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.8, color: colors.primary },
  scanCard: {
    padding: 14, borderRadius: 15, marginBottom: 13,
    backgroundColor: '#FF980018',
    borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: '#FF98004D',
  },
  scanTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanQuip: { flex: 1, fontSize: 13, fontFamily: fonts.body.semibold, color: colors.text },
  scanSub: { fontSize: 11, fontFamily: fonts.body.regular, lineHeight: 15.5, marginTop: 9 },
  hintBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    borderRadius: 13, marginBottom: 13,
  },
  hintText: { flex: 1, fontSize: 12, fontFamily: fonts.body.regular, lineHeight: 16 },
  emptyText: { fontSize: 13, fontFamily: fonts.body.regular, textAlign: 'center', marginTop: 8 },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 8,
  },
  historyName: { fontSize: 14, fontFamily: fonts.body.semibold },
  historyMeta: { fontSize: 11.5, fontFamily: fonts.mono.medium, marginTop: 2 },
  dangerWrap: { marginTop: 20, alignItems: 'center', gap: 9 },
  dangerIntro: { fontSize: 12.5, fontFamily: fonts.body.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 17, paddingHorizontal: 12 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, paddingHorizontal: 22, borderRadius: 13,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#F4433673',
  },
  dangerBtnText: { fontSize: 13, fontFamily: fonts.body.semibold, color: '#F44336' },
  onboardDoneCard: { backgroundColor: '#34A85312', borderColor: '#34A853', borderWidth: 1.5, borderRadius: 15, padding: 16, marginTop: 20 },
  onboardDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  onboardDoneText: { flex: 1, fontSize: 14, fontFamily: fonts.body.semibold, lineHeight: 19 },
  onboardReturnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: '#34A853' },
  onboardReturnText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.body.semibold },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  segmentText: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 11, borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  checkLabel: { flex: 1, fontSize: 12.5, fontFamily: fonts.body.regular },
  confirmLabel: { fontSize: 12.5, fontFamily: fonts.body.regular, marginTop: 14, marginBottom: 6 },
  confirmInput: { borderWidth: StyleSheet.hairlineWidth + 0.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: fonts.body.regular },
  sheetActions: { flexDirection: 'row', gap: 8 },
  sheetCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  sheetCancelText: { fontSize: 13.5, fontFamily: fonts.body.semibold },
  sheetDelete: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F44336' },
  sheetDeleteText: { color: '#FFFFFF', fontSize: 13.5, fontFamily: fonts.body.semibold },
  joltLayer: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
});
