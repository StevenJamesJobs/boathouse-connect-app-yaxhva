import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { SegControl } from '@/components/content/FormKit';
import { StorageImage } from '@/components/StorageImage';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { getFileIconInfo } from '@/utils/messageFiles';
import { Avatar } from './AvatarStack';
import { msgHue } from './messageVisuals';
import { formatRowTime } from './MessageRow';
import type { MessageAttachment } from './useMessageDirectory';

const GAP = 6;

function isPdf(name: string | null): boolean {
  return (name || '').split('.').pop()?.toLowerCase() === 'pdf';
}

function Rule({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.rule}>
      <Text style={[styles.ruleLabel, { color: colors.tint }]}>{label.toUpperCase()}</Text>
      <View style={[styles.ruleLine, { backgroundColor: colors.hairline }]} />
    </View>
  );
}

/**
 * The Files filter (L2b): everything ever attached across inbox + sent — photos
 * as a three-up grid stamped with who sent them and when, files as rows with a
 * tinted glyph (red PDF, azure documents), name, "sender · date" and a download
 * square. Tap opens; hold hands off to the screen's Share / Open-the-message sheet.
 */
export default function FilesGallery({
  attachments,
  onOpenPhoto,
  onOpenFile,
  onLongPress,
}: {
  attachments: MessageAttachment[];
  onOpenPhoto: (a: MessageAttachment) => void;
  onOpenFile: (a: MessageAttachment) => void;
  onLongPress: (a: MessageAttachment) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, resolvedMode } = useAppTheme();
  const isDark = resolvedMode === 'dark';
  const [gridWidth, setGridWidth] = useState(0);

  const photos = attachments.filter((a) => a.kind === 'photo');
  const files = attachments.filter((a) => a.kind === 'file');
  // Measured on the GRID itself — measuring the padded wrapper made three thumbs overflow
  // the row and wrap to two with a hole on the right (Steve's round).
  const thumb = gridWidth > 0 ? Math.floor((gridWidth - GAP * 2) / 3) : 0;
  const you = t('messages.you');

  // Photos and files are two tabs once both exist, so a long photo grid never buries the
  // files underneath it.
  const [tab, setTab] = useState<'photos' | 'files'>(photos.length > 0 ? 'photos' : 'files');
  useEffect(() => {
    if (tab === 'photos' && photos.length === 0 && files.length > 0) setTab('files');
    if (tab === 'files' && files.length === 0 && photos.length > 0) setTab('photos');
  }, [tab, photos.length, files.length]);
  const both = photos.length > 0 && files.length > 0;
  const showPhotos = photos.length > 0 && (!both || tab === 'photos');
  const showFiles = files.length > 0 && (!both || tab === 'files');

  return (
    <View style={styles.wrap}>
      {both && (
        <SegControl
          options={[
            { key: 'photos', label: t('messages.photos_count', { count: photos.length }), iosIcon: 'photo', androidIcon: 'image' },
            { key: 'files', label: t('messages.files_count', { count: files.length }), iosIcon: 'doc', androidIcon: 'description' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      {showPhotos && (
        <>
          <Rule label={t('messages.photos_count', { count: photos.length })} />
          <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}>
            {thumb > 0 &&
              photos.map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => onOpenPhoto(a)}
                  onLongPress={() => onLongPress(a)}
                  delayLongPress={350}
                  style={({ pressed }) => [
                    styles.thumb,
                    { width: thumb, height: thumb, backgroundColor: colors.thumbPlaceholder },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <StorageImage source={{ uri: a.url }} style={{ width: thumb, height: thumb }} resizeMode="cover" />
                  <View style={styles.who}>
                    <Avatar person={a.sender} size={18} style={{ borderWidth: 1.5, borderColor: colors.background }} />
                  </View>
                  <View style={styles.datePill}>
                    <Text style={styles.dateText}>{formatRowTime(a.createdAt, i18n.language)}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        </>
      )}

      {showFiles && (
        <>
          <Rule label={t('messages.files_count', { count: files.length })} />
          <View style={styles.fileList}>
            {files.map((a) => {
              const name = a.fileName || t('messages.preview_file');
              const icon = getFileIconInfo(name);
              const hue = isPdf(a.fileName) ? msgHue('file', isDark) : msgHue('doc', isDark);
              const sender = a.isMine ? you : a.sender.name;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => onOpenFile(a)}
                  onLongPress={() => onLongPress(a)}
                  delayLongPress={350}
                  style={({ pressed }) => [
                    styles.fileRow,
                    { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.glyph, { backgroundColor: hue + '2E' }]}>
                    <IconSymbol ios_icon_name={icon.iosIcon} android_material_icon_name={icon.androidIcon} size={16} color={hue} />
                  </View>
                  <View style={styles.fileBody}>
                    <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {sender} · {formatRowTime(a.createdAt, i18n.language)}
                    </Text>
                  </View>
                  <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="download" size={18} color={colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {attachments.length > 0 && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('messages.files_hint')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 10 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  ruleLabel: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2 },
  ruleLine: { flex: 1, height: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  thumb: { borderRadius: 10, overflow: 'hidden' },
  who: { position: 'absolute', bottom: 4, left: 4 },
  datePill: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dateText: { fontFamily: fonts.mono.medium, fontSize: 8, color: '#FFFFFF' },
  fileList: { gap: 8 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  glyph: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileBody: { flex: 1, minWidth: 0 },
  fileName: { fontFamily: fonts.body.semibold, fontSize: 13 },
  fileMeta: { fontFamily: fonts.mono.medium, fontSize: 10, marginTop: 1 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 4 },
});
