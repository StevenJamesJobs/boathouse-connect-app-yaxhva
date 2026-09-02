import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FieldLabel, Hint, SegControl } from '@/components/content/FormKit';
import { fonts } from '@/constants/fonts';

export type ThumbnailShape = 'square' | 'banner';

interface CoverPhotoFieldProps {
  /** A freshly picked local uri wins over the stored url. */
  coverUri: string | null;
  coverUrl: string | null;
  shape: ThumbnailShape;
  onShapeChange: (shape: ThumbnailShape) => void;
  onCoverPicked: (uri: string) => void;
  /** Stored extra-image urls (edit mode) and newly picked local uris. */
  extraUrls: string[];
  extraUris: string[];
  onExtraPicked: (uri: string) => void;
  onRemoveExtraUrl: (index: number) => void;
  onRemoveExtraUri: (index: number) => void;
}

/**
 * Cover photo + shape + the extra-photos rail — the Basics step's photo block,
 * shared by all three editors (each used to carry its own copy of the picker
 * logic). Launches the system picker DIRECTLY from the open sheet: launching
 * one from a deferred / post-dismissal action is the iOS pattern that silently
 * drops (rulebook).
 */
export default function CoverPhotoField({
  coverUri,
  coverUrl,
  shape,
  onShapeChange,
  onCoverPicked,
  extraUrls,
  extraUris,
  onExtraPicked,
  onRemoveExtraUrl,
  onRemoveExtraUri,
}: CoverPhotoFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cover = coverUri ?? coverUrl;

  const pick = async (forCover: boolean) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: forCover && shape === 'banner' ? [16, 9] : [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        if (forCover) onCoverPicked(result.assets[0].uri);
        else onExtraPicked(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Image pick error:', err);
    }
  };

  return (
    <View style={styles.wrap}>
      <FieldLabel label={t('content_editor.cover_photo')} />
      <View style={styles.row}>
        <Pressable
          style={[styles.cover, shape === 'banner' && styles.coverBanner, !cover && styles.coverEmpty]}
          onPress={() => pick(true)}
        >
          {cover ? (
            <StorageImage source={{ uri: cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverEmptyInner}>
              <IconSymbol ios_icon_name="photo" android_material_icon_name="image" size={22} color={colors.primary} />
              <Text style={styles.coverEmptyText}>{t('content_editor.add_photo')}</Text>
            </View>
          )}
          <View style={styles.shapeTag}>
            <Text style={styles.shapeTagText}>
              {(shape === 'banner' ? t('content_editor.shape_banner') : t('content_editor.shape_square')).toUpperCase()}
            </Text>
          </View>
        </Pressable>
        <View style={styles.side}>
          <SegControl<ThumbnailShape>
            value={shape}
            onChange={onShapeChange}
            options={[
              { key: 'square', label: t('content_editor.shape_square'), iosIcon: 'square', androidIcon: 'crop-square' },
              { key: 'banner', label: t('content_editor.shape_banner'), iosIcon: 'rectangle', androidIcon: 'crop-16-9' },
            ]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            <Pressable style={[styles.tile, styles.tileAdd]} onPress={() => pick(false)}>
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={colors.primary} />
            </Pressable>
            {extraUrls.map((url, i) => (
              <View key={`u-${url}`} style={styles.tile}>
                <StorageImage source={{ uri: url }} style={styles.tileImage} resizeMode="cover" />
                <Pressable style={styles.remove} onPress={() => onRemoveExtraUrl(i)} hitSlop={6}>
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={10} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {extraUris.map((uri, i) => (
              <View key={`n-${uri}`} style={styles.tile}>
                <StorageImage source={{ uri }} style={styles.tileImage} resizeMode="cover" />
                <Pressable style={styles.remove} onPress={() => onRemoveExtraUri(i)} hitSlop={6}>
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={10} color="#FFFFFF" />
                </Pressable>
                <View style={styles.newTag}>
                  <Text style={styles.newTagText}>{t('content_editor.new_badge')}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
      <Hint>{t('content_editor.extra_photos_hint')}</Hint>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrap: {},
    row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    cover: {
      width: 96,
      height: 96,
      borderRadius: 13,
      overflow: 'hidden',
      backgroundColor: colors.thumbPlaceholder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverBanner: { width: 132, height: 96 },
    // A full point of dashed border on purpose — RN draws sub-point dashes as near-solid.
    coverEmpty: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    coverEmptyInner: { alignItems: 'center', gap: 4 },
    coverEmptyText: { fontFamily: fonts.body.semibold, fontSize: 10.5, color: colors.primary },
    coverImage: { width: '100%', height: '100%' },
    shapeTag: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(8,10,14,0.6)',
    },
    shapeTagText: { fontFamily: fonts.mono.semibold, fontSize: 7.5, letterSpacing: 0.8, color: '#FFFFFF' },
    side: { flex: 1, minWidth: 0, gap: 10 },
    rail: { gap: 8, paddingRight: 4 },
    tile: {
      width: 56,
      height: 56,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.thumbPlaceholder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileAdd: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    tileImage: { width: '100%', height: '100%' },
    remove: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(8,10,14,0.6)',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: 'rgba(255,255,255,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    newTag: {
      position: 'absolute',
      left: 3,
      bottom: 3,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      borderRadius: 4,
      backgroundColor: '#10A56F',
    },
    newTagText: { fontFamily: fonts.mono.semibold, fontSize: 7, letterSpacing: 0.8, color: '#FFFFFF' },
  });
