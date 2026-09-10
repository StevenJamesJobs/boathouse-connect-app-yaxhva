import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useScheduleQuota } from '@/hooks/useScheduleQuota';
import { setStagedPick, type StagedAsset } from '@/utils/schedule/uploadStaging';
import { fonts } from '@/constants/fonts';

/** the schedules bucket + broker cap (25 MB) */
export const SCHEDULE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export interface ScheduleUploadSheetProps {
  visible: boolean;
  /** Closes only this nested sheet (back to the ⚙ Schedule sheet behind it). */
  onClose: () => void;
  /**
   * Hides this sheet AND routes `fn` through the HOST sheet's handoff — the
   * MenuSheet/MenuUploadSheet staggered double-dismiss (child fully gone first,
   * then the host, then the push; simultaneous teardown strands an invisible
   * touch-eating layer on iOS).
   */
  closeBothThen: (fn: () => void) => void;
  onFullyClosed?: () => void;
}

/**
 * "Upload Schedules & View History" — the nested s2 sheet inside ScheduleNavSheet
 * (s83). Unlike the menu twin it does NOT upload: a pick (file / photos / camera)
 * is STAGED and the Upload page opens on its staging card (title, optional week
 * range, Scan). Nothing costs a credit until Scan. The View History row lands on
 * the page's Recent uploads tab.
 */
export default function ScheduleUploadSheet({ visible, onClose, closeBothThen, onFullyClosed }: ScheduleUploadSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { hasPremium } = useSubscription();
  const { quota, refresh: refreshQuota } = useScheduleQuota();
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [picking, setPicking] = useState(false);

  // Edge-triggered refresh on OPEN (an unstable refresh identity can never loop the RPC).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) refreshQuota();
    wasVisible.current = visible;
  }, [visible, refreshQuota]);

  const goStaged = (pick: Parameters<typeof setStagedPick>[0]) => {
    setStagedPick(pick);
    closeBothThen(() => router.push({ pathname: '/schedule-upload', params: { staged: '1' } } as any));
  };

  const premiumGuard = (): boolean => {
    if (hasPremium || quota?.freeAvailable) return true;
    closeBothThen(() =>
      Alert.alert(t('schedule_upload.premium_title'), t('schedule_upload.premium_msg'), [
        { text: t('common.not_now', 'Not Now'), style: 'cancel' },
        { text: t('common.upgrade', 'Upgrade'), onPress: () => router.push('/subscription-management' as any) },
      ])
    );
    return false;
  };

  const tooBig = (bytes: number | null | undefined) => !!bytes && bytes > SCHEDULE_UPLOAD_MAX_BYTES;

  const handleChooseFile = async () => {
    if (!premiumGuard()) return;
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (tooBig(file.size)) {
        defer(() => Alert.alert(t('schedule_upload.too_big_title'), t('schedule_upload.too_big_msg')));
        return;
      }
      const ext = (file.name || '').toLowerCase().split('.').pop();
      const isImg = ext === 'jpg' || ext === 'jpeg' || ext === 'png';
      const mediaType = file.mimeType || (ext === 'png' ? 'image/png' : isImg ? 'image/jpeg' : 'application/pdf');
      const asset: StagedAsset = { uri: file.uri, name: file.name || 'schedule', mimeType: mediaType, size: file.size ?? null };
      goStaged({
        kind: 'file',
        assets: [asset],
        displayName: file.name || t('schedule_upload.default_file_name'),
        sourceType: isImg ? 'image' : 'pdf',
        pageCount: 1,
        mediaType,
      });
    } catch (e) {
      console.error('schedule file pick error:', e);
      defer(() => Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic')));
    } finally {
      setPicking(false);
    }
  };

  const handleChooseLibrary = async () => {
    if (!premiumGuard()) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('schedule_upload.permission_title'), t('schedule_upload.permission_msg')));
        return;
      }
      setPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
        orderedSelection: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const images = result.assets;
      if (images.some((img) => tooBig(img.fileSize))) {
        defer(() => Alert.alert(t('schedule_upload.too_big_title'), t('schedule_upload.too_big_msg')));
        return;
      }
      const assets: StagedAsset[] = images.map((img, i) => {
        const png = img.uri.toLowerCase().endsWith('.png');
        return { uri: img.uri, name: `schedule-page-${i + 1}.${png ? 'png' : 'jpg'}`, mimeType: png ? 'image/png' : 'image/jpeg', size: img.fileSize ?? null };
      });
      goStaged({
        kind: 'images',
        assets,
        displayName: images.length > 1
          ? t('schedule_upload.images_name', { n: images.length })
          : t('schedule_upload.image_name'),
        sourceType: 'image',
        pageCount: images.length,
        mediaType: assets[0].mimeType,
      });
    } catch (e) {
      console.error('schedule photo pick error:', e);
      defer(() => Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic')));
    } finally {
      setPicking(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!premiumGuard()) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('schedule_upload.camera_denied_title'), t('schedule_upload.camera_denied_msg')));
        return;
      }
      setPicking(true);
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const img = result.assets[0];
      const png = img.uri.toLowerCase().endsWith('.png');
      const asset: StagedAsset = { uri: img.uri, name: `schedule-photo.${png ? 'png' : 'jpg'}`, mimeType: png ? 'image/png' : 'image/jpeg', size: img.fileSize ?? null };
      goStaged({ kind: 'camera', assets: [asset], displayName: t('schedule_upload.photo_name'), sourceType: 'image', pageCount: 1, mediaType: asset.mimeType });
    } catch (e) {
      console.error('schedule camera error:', e);
      defer(() => Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic')));
    } finally {
      setPicking(false);
    }
  };

  const lead = quota ? String(quota.remaining) : '';
  const creditsLine = quota
    ? t('schedule_upload.credits_left', { n: quota.remaining, max: quota.max }) + ' · ' + t('schedule_upload.credits_costs', { pdf: quota.pdfCost })
    : '';
  const creditsRest = creditsLine.startsWith(lead) ? creditsLine.slice(lead.length).trimStart() : creditsLine;

  const sourceRow = (opts: { key: string; iosIcon: string; androidIcon: string; label: string; sub: string; onPress: () => void }) => (
    <Pressable
      key={opts.key}
      onPress={opts.onPress}
      disabled={picking}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, picking && styles.rowDim]}
    >
      <IconSymbol ios_icon_name={opts.iosIcon} android_material_icon_name={opts.androidIcon} size={20} color={colors.textSecondary} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>{opts.label}</Text>
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
      title={t('schedule_upload_sheet.title')}
      subtitle={t('schedule_upload_sheet.subtitle')}
    >
      {!!quota && (
        <View style={[styles.credits, { backgroundColor: colors.blue + '21', borderColor: colors.blue + '47' }]}>
          <Text style={[styles.creditsNum, { color: colors.blueText }]}>{lead}</Text>
          <Text style={[styles.creditsText, { color: colors.textSecondary }]}>
            {creditsRest}
            {quota.freeAvailable ? ' · ' + t('schedule_upload.first_free') : ''}
          </Text>
        </View>
      )}

      {sourceRow({ key: 'file', iosIcon: 'doc.fill', androidIcon: 'description', label: t('schedule_upload_sheet.choose_file'), sub: t('schedule_upload_sheet.choose_file_sub'), onPress: handleChooseFile })}
      {sourceRow({ key: 'library', iosIcon: 'photo.on.rectangle', androidIcon: 'photo-library', label: t('schedule_upload_sheet.choose_library'), sub: t('schedule_upload_sheet.choose_library_sub'), onPress: handleChooseLibrary })}
      {sourceRow({ key: 'camera', iosIcon: 'camera.fill', androidIcon: 'camera-alt', label: t('schedule_upload_sheet.take_photo'), sub: t('schedule_upload_sheet.take_photo_sub'), onPress: handleTakePhoto })}

      <View style={[styles.divider, { backgroundColor: colors.hairline }]} />

      <Pressable
        onPress={() => closeBothThen(() => router.push({ pathname: '/schedule-upload', params: { tab: 'recent' } } as any))}
        style={[styles.row, styles.historyRow, { borderColor: colors.primary + '6B' }]}
      >
        <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={20} color={colors.primary} />
        <View style={styles.rowBody}>
          <Text style={[styles.rowLabel, { color: colors.primary }]} numberOfLines={1}>{t('schedule_upload_sheet.view_history')}</Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{t('schedule_upload_sheet.view_history_sub')}</Text>
        </View>
      </Pressable>
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
  rowDim: { opacity: 0.6 },
  rowBody: { flex: 1, flexShrink: 1 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 2 },
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
  divider: { height: 1, marginVertical: 3 },
});
