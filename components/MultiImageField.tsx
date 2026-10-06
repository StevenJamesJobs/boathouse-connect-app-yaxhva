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
 * MultiImageField — the s90 "up to four photos" strip for every editor sheet
 * (menu items + the four recipe families + the Libations review).
 *
 * The FIRST photo is the cover: it is what tiles, shelves, hub peeks and menu
 * cards show (the server mirrors it into thumbnail_url); the Poster pages the
 * whole list. Tap a photo for Make cover · Move left · Move right · Remove;
 * tap the dashed tile to add one (library or camera).
 *
 * Uploads go through the storage broker the moment a photo is picked, so the
 * list holds STORED URLs only; a removed photo is handed to `onRemove` and the
 * host broker-deletes it AFTER its save succeeds (the MenuItemEditSheet
 * `removedPhoto` rule — a storage failure must never read as a failed save).
 *
 * ⚠️ The pickers launch DIRECTLY from the open photo sheet (the MenuUploadSheet
 * / MenuItemEditSheet pattern — a picker issued after a sheet's dismissal is
 * silently swallowed on iOS). The sheet closes on a successful pick and stays
 * open on cancel. The photo sheet is a module-level component (GlassSheet's
 * remount rule).
 */
export const MAX_ITEM_PHOTOS = 4;

export interface MultiImageFieldProps {
  /** Stored URLs (or legacy bucket paths), cover first. */
  images: string[];
  onChange: (next: string[]) => void;
  /** A photo the user removed — delete it after the host's save succeeds. */
  onRemove?: (url: string) => void;
  purpose: UploadPurpose;
  /** The bucket the legacy path-only values live in (toPublicUrl). */
  bucket: string;
  /** Crop aspect for the pickers (square recipes; menu items pass their shape). */
  aspect?: [number, number];
  label?: string;
  disabled?: boolean;
  max?: number;
}

type PhotoSheetState = { mode: 'add' } | { mode: 'edit'; index: number } | null;

function PhotoSheet({
  state,
  onClose,
  count,
  onPickLibrary,
  onTakePhoto,
  onMakeCover,
  onMove,
  onRemove,
}: {
  state: PhotoSheetState;
  onClose: () => void;
  count: number;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  onMakeCover: (i: number) => void;
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
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        opts.disabled && styles.rowDisabled,
      ]}
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
      subtitle={editing === null ? t('multi_image.sheet_add_sub', { max: MAX_ITEM_PHOTOS }) : t('multi_image.sheet_edit_sub')}
    >
      {editing === null ? (
        <>
          {row({ key: 'lib', ios: 'photo.on.rectangle', android: 'photo-library', label: t('multi_image.choose_library'), onPress: onPickLibrary })}
          {row({ key: 'cam', ios: 'camera.fill', android: 'camera-alt', label: t('multi_image.take_photo'), onPress: onTakePhoto })}
        </>
      ) : (
        <>
          {row({ key: 'cover', ios: 'star.fill', android: 'star', label: t('multi_image.make_cover'), disabled: editing === 0, onPress: () => onMakeCover(editing) })}
          {row({ key: 'left', ios: 'arrow.left', android: 'arrow-back', label: t('multi_image.move_left'), disabled: editing === 0, onPress: () => onMove(editing, -1) })}
          {row({ key: 'right', ios: 'arrow.right', android: 'arrow-forward', label: t('multi_image.move_right'), disabled: editing >= count - 1, onPress: () => onMove(editing, 1) })}
          {row({ key: 'remove', ios: 'trash', android: 'delete', label: t('multi_image.remove'), destructive: true, onPress: () => onRemove(editing) })}
        </>
      )}
    </GlassSheet>
  );
}

// The house trash red — a literal on purpose (never inverts between themes).
const TRASH_RED = '#E53935';
// The gold cover pill — same literal pair as the Special chip (fixed-dark ink
// on gold reads on any photo).
const COVER_GOLD = '#F5B942';
const COVER_INK = '#1F1A10';

export default function MultiImageField({
  images,
  onChange,
  onRemove,
  purpose,
  bucket,
  aspect = [1, 1],
  label,
  disabled,
  max = MAX_ITEM_PHOTOS,
}: MultiImageFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [sheet, setSheet] = useState<PhotoSheetState>(null);
  const [uploading, setUploading] = useState(false);

  const canAdd = !disabled && images.length < max;

  const upload = async (uri: string) => {
    if (!user?.id) return;
    try {
      setUploading(true);
      const url = await brokerUploadImage(purpose, uri, user.id);
      if (!url) throw new Error('Upload failed');
      onChange([...images, url]);
      setSheet(null);
    } catch (e: any) {
      console.error('MultiImageField upload error:', e);
      Alert.alert(t('common.error'), translateServerError(e, t('multi_image.upload_failed')));
    } finally {
      setUploading(false);
    }
  };

  const pickLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
    } catch (e) {
      console.error('MultiImageField pick error:', e);
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
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect });
      if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
    } catch (e) {
      console.error('MultiImageField camera error:', e);
      Alert.alert(t('common.error'), t('multi_image.upload_failed'));
    }
  };

  const makeCover = (i: number) => {
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
    const url = images[i];
    onChange(images.filter((_, k) => k !== i));
    onRemove?.(url);
    setSheet(null);
  };

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{(label ?? t('multi_image.photos')).toUpperCase()}</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{t('multi_image.count', { n: images.length, max })}</Text>
      </View>
      <View style={styles.strip}>
        {images.map((url, i) => (
          <Pressable
            key={`${i}-${url}`}
            style={[styles.slot, { borderColor: colors.glassBorder, backgroundColor: colors.thumbPlaceholder }]}
            onPress={disabled ? undefined : () => setSheet({ mode: 'edit', index: i })}
          >
            <StorageImage source={{ uri: toPublicUrl(bucket, url) }} style={styles.slotImage} resizeMode="cover" />
            {i === 0 && (
              <View style={styles.coverPill}>
                <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={8} color={COVER_INK} />
                <Text style={styles.coverText}>{t('multi_image.cover').toUpperCase()}</Text>
              </View>
            )}
          </Pressable>
        ))}
        {images.length < max && (
          <Pressable
            style={[styles.slot, styles.addSlot, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, !canAdd && styles.addSlotOff]}
            onPress={canAdd ? () => setSheet({ mode: 'add' }) : undefined}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color={colors.textSecondary} />
                <Text style={[styles.addText, { color: colors.textSecondary }]}>{t('multi_image.left', { n: max - images.length })}</Text>
              </>
            )}
          </Pressable>
        )}
        {/* Keep the row's geometry when the strip is full or short: empty flex
            spacers so a lone tile never stretches to the full width. */}
        {Array.from({ length: Math.max(0, max - images.length - (images.length < max ? 1 : 0)) }).map((_, k) => (
          <View key={`sp-${k}`} style={styles.spacer} />
        ))}
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('multi_image.hint')}</Text>

      <PhotoSheet
        state={sheet}
        onClose={() => setSheet(null)}
        count={images.length}
        onPickLibrary={pickLibrary}
        onTakePhoto={takePhoto}
        onMakeCover={makeCover}
        onMove={move}
        onRemove={remove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1.1 },
  count: { fontFamily: fonts.mono.medium, fontSize: 10 },
  strip: { flexDirection: 'row', gap: 8 },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  slotImage: { width: '100%', height: '100%' },
  addSlot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  addSlotOff: { opacity: 0.5 },
  addText: { fontFamily: fonts.mono.medium, fontSize: 8, letterSpacing: 0.5 },
  spacer: { flex: 1 },
  coverPill: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COVER_GOLD,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  coverText: { fontFamily: fonts.mono.semibold, fontSize: 7.5, letterSpacing: 0.6, color: COVER_INK },
  hint: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, marginTop: 7 },
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
