import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { validateImageSize } from '@/utils/messageImages';
import { validateFileSize } from '@/utils/messageFiles';
import { MESSAGE_IMAGE_MAX_MB, MESSAGE_FILE_MAX_MB } from './messageVisuals';

interface AttachMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Files are a manager / owner tool (send_message's p_file_url gate). */
  allowFiles: boolean;
  onImage: (uri: string, size: number | null) => void;
  onFile: (uri: string, name: string, size: number | null) => void;
}

/**
 * The composer's "+" menu: Camera · Photo library · File (managers only).
 *
 * Built on GlassSheet with GlassActionSheet's row geometry rather than on
 * GlassActionSheet itself: that component DEFERS every action until the sheet
 * has dismissed, and the system pickers must be launched DIRECTLY from the
 * open sheet (the sheet closes once a pick lands). Only the error Alerts go
 * through the handoff, since an Alert is a presentation of its own.
 */
export default function AttachMenu({ visible, onClose, allowFiles, onImage, onFile }: AttachMenuProps) {
  const { t } = useTranslation('compose');
  const colors = useThemeColors();
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [busy, setBusy] = useState(false);

  const alertLater = (title: string, message: string) => defer(() => Alert.alert(title, message));
  const errorTitle = t('common:error', { defaultValue: 'Error' });

  const acceptImage = async (asset: ImagePicker.ImagePickerAsset) => {
    const ok = await validateImageSize(asset.uri);
    if (!ok) {
      alertLater(errorTitle, t('photo_too_large', { defaultValue: 'Image must be under 5MB' }));
      return;
    }
    onImage(asset.uri, asset.fileSize ?? null);
    onClose();
  };

  const handleCamera = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertLater(t('camera_denied_title'), t('camera_denied_msg'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      await acceptImage(result.assets[0]);
    } catch (error) {
      console.error('Error taking photo:', error);
    } finally {
      setBusy(false);
    }
  };

  const handleLibrary = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      await acceptImage(result.assets[0]);
    } catch (error) {
      console.error('Error picking image:', error);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const ok = await validateFileSize(asset.uri);
      if (!ok) {
        alertLater(errorTitle, t('file_too_large', { defaultValue: 'File must be under 10MB' }));
        return;
      }
      onFile(asset.uri, asset.name, asset.size ?? null);
      onClose();
    } catch (error) {
      console.error('Error picking file:', error);
    } finally {
      setBusy(false);
    }
  };

  const rows: { key: string; label: string; ios: string; android: string; limit?: string; onPress: () => void }[] = [
    { key: 'camera', label: t('attach_camera'), ios: 'camera.fill', android: 'photo-camera', onPress: handleCamera },
    {
      key: 'library',
      label: t('attach_library'),
      ios: 'photo.on.rectangle',
      android: 'photo-library',
      limit: `${MESSAGE_IMAGE_MAX_MB} MB`,
      onPress: handleLibrary,
    },
  ];
  if (allowFiles) {
    rows.push({
      key: 'file',
      label: t('attach_file'),
      ios: 'doc.fill',
      android: 'insert-drive-file',
      limit: `${MESSAGE_FILE_MAX_MB} MB`,
      onPress: handleFile,
    });
  }

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('attach_title')}
      subtitle={t('attach_subtitle')}
      onDismiss={onDismiss}
    >
      {rows.map((r) => (
        <Pressable
          key={r.key}
          onPress={r.onPress}
          disabled={busy}
          style={[
            styles.row,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <IconSymbol ios_icon_name={r.ios} android_material_icon_name={r.android} size={19} color={colors.tint} />
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
            {r.label}
          </Text>
          {!!r.limit && <Text style={[styles.limit, { color: colors.textSecondary }]}>{r.limit}</Text>}
        </Pressable>
      ))}
      <View style={{ height: 2 }} />
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  label: { flex: 1, flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  limit: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.3 },
});
