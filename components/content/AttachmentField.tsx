import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { FieldLabel, Hint } from '@/components/content/FormKit';
import GuidePickerSheet, { type GuidePick } from '@/components/content/GuidePickerSheet';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_PICKER_TYPES, categoryHue, type ContentKind } from '@/components/content/contentVisuals';
import { fonts } from '@/constants/fonts';

/**
 * What the Extras step holds for "Attachment":
 *  - a guide from Guides & Training (stays there when the post goes), or
 *  - a one-time file: freshly picked (`uri`) or already stored (`file_url`).
 */
export type AttachmentDraft =
  | { kind: 'guide'; guide: GuidePick }
  | { kind: 'file'; uri?: string; file_url?: string; file_name: string; file_type: string; size_bytes: number | null };

interface AttachmentFieldProps {
  contentKind: ContentKind;
  value: AttachmentDraft | null;
  onChange: (next: AttachmentDraft | null) => void;
  /** The actor — the guide picker reads the org's guides through get_guides. */
  actorId: string;
}

export default function AttachmentField({ contentKind, value, onChange, actorId }: AttachmentFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const guideHue = categoryHue('Event', isDark);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const size = typeof file.size === 'number' ? file.size : null;
      if (size != null && size > ATTACHMENT_MAX_BYTES) {
        Alert.alert(t('content_editor.attachment_too_large_title'), t('content_editor.attachment_too_large_msg'));
        return;
      }
      onChange({
        kind: 'file',
        uri: file.uri,
        file_name: file.name || 'file',
        file_type: file.mimeType || 'application/octet-stream',
        size_bytes: size,
      });
    } catch (err) {
      console.error('Attachment pick error:', err);
    }
  };

  const lifecycleHint =
    contentKind === 'announcement'
      ? t('content_editor.attachment_hint_announcement')
      : contentKind === 'special_feature'
        ? t('content_editor.attachment_hint_special')
        : t('content_editor.attachment_hint_event');

  return (
    <View>
      <FieldLabel label={t('content_editor.attachment')} trailing={t('content_editor.optional')} />
      {value ? (
        <View
          style={[
            styles.chip,
            value.kind === 'guide'
              ? { backgroundColor: guideHue + '1A', borderColor: guideHue + '61' }
              : { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '61' },
          ]}
        >
          <IconSymbol
            ios_icon_name={value.kind === 'guide' ? 'doc.text.fill' : 'doc.fill'}
            android_material_icon_name={value.kind === 'guide' ? 'description' : 'insert-drive-file'}
            size={18}
            color={value.kind === 'guide' ? guideHue : colors.primary}
          />
          <View style={styles.chipBody}>
            <Text style={styles.chipTitle} numberOfLines={1}>
              {value.kind === 'guide' ? value.guide.title : value.file_name}
            </Text>
            <Text style={styles.chipMeta} numberOfLines={1}>
              {value.kind === 'guide'
                ? `${t('content_editor.from_guides')} · ${value.guide.category}`
                : `${formatBytes(value.size_bytes)}${value.size_bytes != null ? ' · ' : ''}${t('content_editor.one_time_upload')}`}
            </Text>
          </View>
          <Pressable style={styles.chipRemove} onPress={() => onChange(null)} hitSlop={6}>
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={12} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.tiles}>
          <Pressable style={styles.tile} onPress={() => setPickerOpen(true)}>
            <IconSymbol ios_icon_name="doc.text.fill" android_material_icon_name="description" size={19} color={colors.primary} />
            <Text style={styles.tileTitle}>{t('content_editor.from_guides')}</Text>
            <Text style={styles.tileMeta}>{t('content_editor.from_guides_sub')}</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={pickFile}>
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="upload" size={19} color={colors.primary} />
            <Text style={styles.tileTitle}>{t('content_editor.upload_file')}</Text>
            <Text style={styles.tileMeta}>{t('content_editor.upload_file_sub')}</Text>
          </Pressable>
        </View>
      )}
      <Hint>{value?.kind === 'guide' ? t('content_editor.attachment_hint_guide') : lifecycleHint}</Hint>

      <GuidePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        actorId={actorId}
        onPick={(guide) => onChange({ kind: 'guide', guide })}
      />
    </View>
  );
}

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', gap: 10 },
    tile: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 13,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    tileTitle: { fontFamily: fonts.body.semibold, fontSize: 12, color: colors.text, textAlign: 'center', marginTop: 3 },
    tileMeta: { fontFamily: fonts.mono.medium, fontSize: 8.5, color: colors.textSecondary, textAlign: 'center' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 47,
      borderRadius: 13,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    chipBody: { flex: 1, minWidth: 0 },
    chipTitle: { fontFamily: fonts.body.semibold, fontSize: 13, color: colors.text },
    chipMeta: { fontFamily: fonts.mono.medium, fontSize: 9.5, color: colors.textSecondary, marginTop: 2 },
    chipRemove: {
      width: 26,
      height: 26,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
  });
