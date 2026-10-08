import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { brokerUploadImage, type UploadPurpose } from '@/utils/storageBroker';
import { toPublicUrl } from '@/utils/storageResolver';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

/**
 * StepPhotoStrip — the compact (58pt) photo strip for one recipe STEP (s91).
 * Same behaviour as MultiImageField (cap 4, first = lead, nested PhotoSheet,
 * uploads through the storage broker the moment a photo is picked) without
 * the field label and hint rows, so a step card stays short.
 *
 * ⚠️ The pickers launch from the OPEN photo sheet (the MultiImageField rule:
 * a picker issued after a sheet's dismissal is silently swallowed on iOS).
 * Removed photos are NOT broker-deleted here: the kitchen server queues the
 * orphans itself when the recipe saves.
 */
export const MAX_STEP_PHOTOS = 4;

type PhotoSheetState = { mode: 'add' } | { mode: 'edit'; index: number } | null;

function StepPhotoSheet({
  state,
  onClose,
  count,
  onPickLibrary,
  onTakePhoto,
  onMakeFirst,
  onMove,
  onRemove,
}: {
  state: PhotoSheetState;
  onClose: () => void;
  count: number;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  onMakeFirst: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const visible = state !== null;
  const editing = state?.mode === 'edit' ? state.index : null;

  const row = (opts: { key: string; ios: string; android: string; label: string; disabled?: boolean; destructive?: boolean; onPress: () => void }) => (
    <Pressable
      key={opts.key}
      onPress={opts.disabled ? undefined : opts.onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, opts.disabled && styles.rowDisabled]}
    >
      <IconSymbol
        ios_icon_name={opts.ios}
        android_material_icon_name={opts.android}
        size={19}
        color={opts.destructive ? TRASH_RED : colors.textSecondary}
      />
      <Text style={[styles.rowLabel, { color: opts.destructive ? TRASH_RED : colors.text }]} numberOfLines={1}>
        {opts.label}
      </Text>
    </Pressable>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={editing === null ? t('multi_image.sheet_add_title') : t('multi_image.sheet_edit_title', { n: editing + 1 })}
      subtitle={editing === null ? t('multi_image.sheet_add_sub', { max: MAX_STEP_PHOTOS }) : t('multi_image.sheet_edit_sub')}
    >
      {editing === null ? (
        <>
          {row({ key: 'lib', ios: 'photo.on.rectangle', android: 'photo-library', label: t('multi_image.choose_library'), onPress: onPickLibrary })}
          {row({ key: 'cam', ios: 'camera.fill', android: 'camera-alt', label: t('multi_image.take_photo'), onPress: onTakePhoto })}
        </>
      ) : (
        <>
          {row({ key: 'first', ios: 'star.fill', android: 'star', label: t('multi_image.make_cover'), disabled: editing === 0, onPress: () => onMakeFirst(editing) })}
          {row({ key: 'left', ios: 'arrow.left', android: 'arrow-back', label: t('multi_image.move_left'), disabled: editing === 0, onPress: () => onMove(editing, -1) })}
          {row({ key: 'right', ios: 'arrow.right', android: 'arrow-forward', label: t('multi_image.move_right'), disabled: editing >= count - 1, onPress: () => onMove(editing, 1) })}
          {row({ key: 'remove', ios: 'trash', android: 'delete', label: t('multi_image.remove'), destructive: true, onPress: () => onRemove(editing) })}
        </>
      )}
    </GlassSheet>
  );
}

const TRASH_RED = '#E53935';

export interface StepPhotoStripProps {
  images: string[];
  onChange: (next: string[]) => void;
  purpose: UploadPurpose;
  bucket: string;
  /** The dashed tile's mono caption ("PHOTO"). */
  addLabel: string;
  disabled?: boolean;
}

export default function StepPhotoStrip({ images, onChange, purpose, bucket, addLabel, disabled }: StepPhotoStripProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [sheet, setSheet] = useState<PhotoSheetState>(null);
  const [uploading, setUploading] = useState(false);

  const canAdd = !disabled && images.length < MAX_STEP_PHOTOS;

  const upload = async (uri: string) => {
    if (!user?.id) return;
    try {
      setUploading(true);
      const url = await brokerUploadImage(purpose, uri, user.id);
      if (!url) throw new Error('Upload failed');
      onChange([...images, url]);
      setSheet(null);
    } catch (e: any) {
      console.error('StepPhotoStrip upload error:', e);
      Alert.alert(t('common.error'), translateServerError(e, t('multi_image.upload_failed')));
    } finally {
      setUploading(false);
    }
  };

  const pickLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
    } catch (e) {
      console.error('StepPhotoStrip pick error:', e);
      Alert.alert(t('common.error'), t('multi_image.upload_failed'));
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('menu_upload_sheet.camera_denied_title'), t('menu_upload_sheet.camera_denied_msg'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
    } catch (e) {
      console.error('StepPhotoStrip camera error:', e);
      Alert.alert(t('common.error'), t('multi_image.upload_failed'));
    }
  };

  const makeFirst = (i: number) => {
    const next = images.slice();
    const [pick] = next.splice(i, 1);
    next.unshift(pick);
    onChange(next);
    setSheet(null);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setSheet(null);
  };
  const remove = (i: number) => {
    onChange(images.filter((_, k) => k !== i));
    setSheet(null);
  };

  return (
    <View style={styles.strip}>
      {images.map((url, i) => (
        <Pressable
          key={`${i}-${url}`}
          style={[styles.tile, { borderColor: colors.glassBorder, backgroundColor: colors.thumbPlaceholder }]}
          onPress={disabled ? undefined : () => setSheet({ mode: 'edit', index: i })}
        >
          <StorageImage source={{ uri: toPublicUrl(bucket, url) }} style={styles.tileImage} resizeMode="cover" />
        </Pressable>
      ))}
      {images.length < MAX_STEP_PHOTOS && (
        <Pressable
          style={[styles.tile, styles.addTile, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, !canAdd && styles.addTileOff]}
          onPress={canAdd ? () => setSheet({ mode: 'add' }) : undefined}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera-alt" size={15} color={colors.textSecondary} />
              <Text style={[styles.addText, { color: colors.textSecondary }]}>{addLabel.toUpperCase()}</Text>
            </>
          )}
        </Pressable>
      )}

      <StepPhotoSheet
        state={sheet}
        onClose={() => setSheet(null)}
        count={images.length}
        onPickLibrary={pickLibrary}
        onTakePhoto={takePhoto}
        onMakeFirst={makeFirst}
        onMove={move}
        onRemove={remove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tile: {
    width: 58,
    height: 58,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  tileImage: { width: '100%', height: '100%' },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  addTileOff: { opacity: 0.5 },
  addText: { fontFamily: fonts.mono.medium, fontSize: 7.5, letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 8,
  },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 15, flex: 1 },
});
