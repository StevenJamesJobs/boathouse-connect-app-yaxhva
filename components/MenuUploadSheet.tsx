import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import ScanQuip from '@/components/MenuScanQuips';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadBase64 } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { fonts } from '@/constants/fonts';

// A PDF costs 3 credits, each photo 1 — mirrors app/menu-upload.tsx's guards
// (the sheet's quota prop carries no cost table, so the PDF cost is pinned
// here to match the `credits_costs` copy).
const PDF_COST = 3;

export interface MenuUploadSheetProps {
  visible: boolean;
  /** Closes only this nested sheet (back to the Menu sheet behind it). */
  onClose: () => void;
  colors: any;
  quota: { remaining: number; max: number; freeAvailable: boolean } | null;
  refreshQuota: () => void;
  /**
   * Hides this sheet AND routes `fn` through the HOST MenuSheet's handoff, so a
   * navigation or Alert fires only once the outer Modal is fully gone (a push
   * under a live Modal lands beneath it; an Alert during a dismissal is
   * silently dropped by UIKit).
   */
  closeBothThen: (fn: () => void) => void;
  /**
   * Fired when THIS sheet's Modal has fully torn down (iOS onDismiss; the host
   * keeps a timer floor for Android, where RN's Modal never fires onDismiss).
   * The host uses it to stagger a close-both: child fully gone FIRST, then the
   * host dismisses — simultaneous teardown strands an invisible touch-eating
   * layer on iOS.
   */
  onFullyClosed?: () => void;
}

/**
 * The Upload Menu source picker — the nested s2 sheet inside MenuSheet's Modal
 * (iOS presents on the nearest ancestor view controller, so a root-level sheet
 * issued over the open Menu sheet would be silently dropped — the CategorySheet
 * `renameSheet` rule).
 *
 * The pickers themselves present on top of the open sheets, so the sheet stays
 * up throughout; after the parse is invoked it shows a processing row and polls
 * until the upload is ready to review. Behavior-identical to the pipeline in
 * app/menu-upload.tsx, plus the poll error branch that page lacks and the new
 * Take-a-photo source.
 */
export default function MenuUploadSheet({
  visible,
  onClose,
  colors,
  quota,
  refreshQuota,
  closeBothThen,
  onFullyClosed,
}: MenuUploadSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { hasPremium } = useSubscription();
  // For alerts that keep the user in the flow (credits, denied permissions,
  // upload failure): close only THIS sheet, alert over the Menu sheet behind.
  const { defer, onDismiss } = useSheetHandoff(onClose);

  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Keep the credits strip live: refresh on each OPEN (edge-triggered so an
  // unstable refreshQuota identity can never loop the RPC).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) refreshQuota();
    wasVisible.current = visible;
  }, [visible, refreshQuota]);

  // Poll for parse completion, then route to the review screen. Unlike the
  // page's poll this one has an ERROR BRANCH: an RPC error (or five straight
  // empty reads — a permission denial reads as an empty result here) stops the
  // interval instead of polling forever.
  useEffect(() => {
    if (!processingId) return;
    let emptyTicks = 0;
    const interval = setInterval(async () => {
      if (!user?.id) return;
      const { data: pollRows, error } = await supabase.rpc('get_menu_uploads', {
        p_actor_id: user.id, p_upload_id: processingId,
      });
      if (error) {
        clearInterval(interval);
        setProcessingId(null);
        closeBothThen(() =>
          Alert.alert(
            t('menu_upload.failed_title', 'Could Not Read Menu'),
            t('menu_upload.poll_failed'),
          )
        );
        return;
      }
      const data: any = Array.isArray(pollRows) ? pollRows[0] : null;
      if (!data) {
        emptyTicks += 1;
        if (emptyTicks >= 5) {
          clearInterval(interval);
          setProcessingId(null);
          closeBothThen(() =>
            Alert.alert(
              t('menu_upload.failed_title', 'Could Not Read Menu'),
              t('menu_upload.poll_failed'),
            )
          );
        }
        return;
      }
      emptyTicks = 0;
      if (data.status !== 'processing') {
        const id = processingId;
        clearInterval(interval);
        setProcessingId(null);
        refreshQuota();
        if (data.status === 'ready_for_review') {
          closeBothThen(() => router.push({ pathname: '/menu-upload-review', params: { upload_id: id } }));
        } else if (data.status === 'failed') {
          closeBothThen(() =>
            Alert.alert(
              t('menu_upload.failed_title', 'Could Not Read Menu'),
              translateServerError({ message: data.error_message }, t('menu_upload.failed_generic', 'Something went wrong reading that menu. Please try again.'))
            )
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId, user?.id, t, router, refreshQuota, closeBothThen]);

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
    refreshQuota();
  };

  // Premium + credits pre-guard (the role/grant check is already this sheet's
  // row gate in MenuSheet). The upsell must drop BOTH sheets — its Upgrade
  // button pushes a route; the credits alert keeps the Menu sheet behind.
  const guardUpload = (minCost: number): boolean => {
    // Free-first-upload bypass — parity with menu-upload.tsx's guardUpload:
    // the first upload is free (and uncharged) even without premium.
    if (quota?.freeAvailable) return true;
    if (!hasPremium) {
      closeBothThen(() =>
        Alert.alert(
          t('menu_upload.premium_title', 'Premium Feature'),
          t('menu_upload.premium_msg', 'AI Menu Upload requires the Premium plan ($15/mo). Upgrade to unlock this and other premium features.'),
          [
            { text: t('common.not_now', 'Not Now'), style: 'cancel' },
            { text: t('common.upgrade', 'Upgrade'), onPress: () => router.push('/subscription-management' as any) },
          ]
        )
      );
      return false;
    }
    if ((quota?.remaining ?? 0) < minCost) {
      defer(() =>
        Alert.alert(
          t('menu_upload.insufficient_title', 'Not Enough Credits'),
          t('menu_upload.insufficient_msg', { defaultValue: 'This needs {{cost}} credits but you have {{have}} left this month. Credits reset next month.', cost: minCost, have: quota?.remaining ?? 0 })
        )
      );
      return false;
    }
    return true;
  };

  const handleChooseFile = async () => {
    if (!guardUpload(PDF_COST)) return;
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
      defer(() => Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.'))));
    } finally {
      setUploading(false);
    }
  };

  const handleChooseLibrary = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('menu_upload.permission_title', 'Permission Required'), t('menu_upload.permission_msg', 'Please allow photo access to upload menu photos.')));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9, orderedSelection: true });
      if (result.canceled || !result.assets?.length) return;
      const images = result.assets;
      // Photos cost 1 credit each; enforce the precise count now — unless the
      // free first upload is still available (the server charges 0 for it
      // regardless of page count; menu-upload.tsx guards identically).
      if (!quota?.freeAvailable && (quota?.remaining ?? 0) < images.length) {
        defer(() =>
          Alert.alert(
            t('menu_upload.insufficient_title', 'Not Enough Credits'),
            t('menu_upload.insufficient_msg', { defaultValue: 'This needs {{cost}} credits but you have {{have}} left this month. Credits reset next month.', cost: images.length, have: quota?.remaining ?? 0 })
          )
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
      defer(() => Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.'))));
    } finally {
      setUploading(false);
    }
  };

  // NEW source: single shot, then the exact 1-photo library pipeline.
  // NSCameraUsageDescription already ships in app.config.ts — no config change.
  const handleTakePhoto = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('menu_upload_sheet.camera_denied_title'), t('menu_upload_sheet.camera_denied_msg')));
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
      defer(() => Alert.alert(t('menu_upload.upload_failed', 'Upload Failed'), translateServerError(e, t('menu_upload.failed_generic', 'An error occurred.'))));
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || processingId !== null;

  // The strip leads with the bold count, so strip the interpolated number off
  // the front of `credits_left` (both locales lead with {{n}}; if a locale ever
  // doesn't, the full line renders after the bold count instead).
  const lead = quota ? String(quota.remaining) : '';
  const creditsLine = quota
    ? t('menu_upload.credits_left', { defaultValue: '{{n}} of {{max}} credits left this month', n: quota.remaining, max: quota.max })
      + ' · '
      + t('menu_upload.credits_costs', { defaultValue: 'PDF = {{pdf}} credits · Each photo = 1 credit', pdf: PDF_COST })
    : '';
  const creditsRest = creditsLine.startsWith(lead) ? creditsLine.slice(lead.length).trimStart() : creditsLine;

  const sourceRow = (opts: {
    key: string;
    iosIcon: string;
    androidIcon: string;
    label: string;
    sub: string;
    onPress: () => void;
  }) => (
    <Pressable
      key={opts.key}
      onPress={opts.onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
    >
      <IconSymbol
        ios_icon_name={opts.iosIcon}
        android_material_icon_name={opts.androidIcon}
        size={20}
        color={colors.textSecondary}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
          {opts.label}
        </Text>
        <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{opts.sub}</Text>
      </View>
    </Pressable>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={() => {
        onDismiss();
        onFullyClosed?.();
      }}
      title={t('menu_upload_sheet.title')}
      subtitle={t('menu_upload_sheet.subtitle')}
    >
      {!!quota && (
        <View style={[styles.credits, { backgroundColor: colors.blue + '21', borderColor: colors.blue + '47' }]}>
          <Text style={[styles.creditsNum, { color: colors.blueText }]}>{lead}</Text>
          <Text style={[styles.creditsText, { color: colors.textSecondary }]}>{creditsRest}</Text>
        </View>
      )}

      {busy ? (
        <View style={[styles.processingCol, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.processingTop}>
            <ActivityIndicator size="small" color={colors.primary} />
            {/* The rotating scan quips — same rotor as the upload page (s72). */}
            <ScanQuip style={[styles.processingQuip, { color: colors.text }]} />
          </View>
          <Text style={[styles.processingText, { color: colors.textSecondary }]}>
            {t('menu_upload.processing_message', 'AI is reading your menu… this can take 40 seconds to 3 minutes depending on the file size. Please don\'t close the app while it scans your file.')}
          </Text>
        </View>
      ) : (
        <>
          {sourceRow({
            key: 'file',
            iosIcon: 'doc.fill',
            androidIcon: 'description',
            label: t('menu_upload_sheet.choose_file'),
            sub: t('menu_upload_sheet.choose_file_sub'),
            onPress: handleChooseFile,
          })}
          {sourceRow({
            key: 'library',
            iosIcon: 'photo.on.rectangle',
            androidIcon: 'photo-library',
            label: t('menu_upload_sheet.choose_library'),
            sub: t('menu_upload_sheet.choose_library_sub'),
            onPress: handleChooseLibrary,
          })}
          {sourceRow({
            key: 'camera',
            iosIcon: 'camera.fill',
            androidIcon: 'camera-alt',
            label: t('menu_upload_sheet.take_photo'),
            sub: t('menu_upload_sheet.take_photo_sub'),
            onPress: handleTakePhoto,
          })}

          <View style={[styles.divider, { backgroundColor: colors.hairline }]} />

          {/* THE ONLY NAVIGATING ROW — drops both sheets, then pushes the full
              upload page (history, delete-a-menu, the works). */}
          <Pressable
            onPress={() => closeBothThen(() => router.push('/menu-upload' as any))}
            style={[styles.row, styles.historyRow, { borderColor: colors.primary + '6B' }]}
          >
            <IconSymbol
              ios_icon_name="clock"
              android_material_icon_name="schedule"
              size={20}
              color={colors.primary}
            />
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: colors.primary }]} numberOfLines={1}>
                {t('menu_upload_sheet.view_history')}
              </Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                {t('menu_upload_sheet.view_history_sub')}
              </Text>
            </View>
          </Pressable>
        </>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  rowBody: { flex: 1, flexShrink: 1 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 2 },
  // Dashed needs the full 1pt — sub-point dashed borders render almost solid
  // (the guides editor's upload zones learned this the hard way).
  historyRow: { backgroundColor: 'transparent', borderStyle: 'dashed', borderWidth: 1 },
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  creditsNum: { fontFamily: fonts.mono.semibold, fontSize: 15 },
  creditsText: { flex: 1, flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  processingCol: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 8,
  },
  processingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processingQuip: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12.5 },
  processingText: { flex: 1, flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, marginVertical: 3 },
});
