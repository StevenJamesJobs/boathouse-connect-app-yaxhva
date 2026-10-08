import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { FieldLabel } from '@/components/content/FormKit';
import GuidePickerSheet from '@/components/content/GuidePickerSheet';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_PICKER_TYPES, categoryHue } from '@/components/content/contentVisuals';
import { fonts } from '@/constants/fonts';
import {
  ATTACHMENT_CAP,
  formatBytes,
  isPdf,
  type ChecklistAttachment,
  type ChecklistKind,
} from '@/components/checklist/checklistConfig';

/**
 * What the category sheet holds for "Attachments": the stored list plus any
 * file picked this session that has not been uploaded yet (`pending_file` —
 * the editor uploads it on save, through the broker, then hands the stored
 * shape to set_checklist_category_attachments).
 */
export type ChecklistAttachmentDraft =
  | ChecklistAttachment
  | { kind: 'pending_file'; uri: string; name: string; mime: string; size: number | null };

interface ChecklistAttachmentsFieldProps {
  kind: ChecklistKind;
  value: ChecklistAttachmentDraft[];
  onChange: (next: ChecklistAttachmentDraft[]) => void;
  /** The actor — the guide picker reads the org's guides through get_guides. */
  actorId: string;
}

/**
 * s91 — the s80 AttachmentField, grown into a LIST of up to three for a
 * checklist category (Steve's prep-sheet idea): existing chips (name · mono
 * meta · ✕), then, while under the cap, the two dashed tiles — From Guides &
 * Training | Upload a file (PDF or image, 20 MB). Lives inside the editor's
 * category GlassSheet, so the pickers launch from an OPEN sheet (the house
 * rule); the guide picker is a nested GlassSheet, as in the Content Kit.
 */
export default function ChecklistAttachmentsField({ kind, value, onChange, actorId }: ChecklistAttachmentsFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const guideHue = categoryHue('Event', isDark);
  const full = value.length >= ATTACHMENT_CAP;

  const pickFile = async () => {
    if (full) return;
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
      onChange([
        ...value,
        {
          kind: 'pending_file',
          uri: file.uri,
          name: file.name || 'file',
          mime: file.mimeType || 'application/octet-stream',
          size,
        },
      ]);
    } catch (err) {
      console.error('Checklist attachment pick error:', err);
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.wrap}>
      <FieldLabel label={t('checklist:attachments')} trailing={`· ${t('checklist:attachments_cap')}`} />

      {value.map((att, index) => {
        const isGuide = att.kind === 'guide';
        const hue = isGuide ? guideHue : colors.primary;
        const pdf = !isGuide && isPdf(att.mime, att.name);
        const meta = isGuide
          ? t('content_editor.from_guides')
          : [pdf ? 'PDF' : t('checklist:attachment_image'), formatBytes(att.size)].filter(Boolean).join(' · ');
        return (
          <View
            key={`${att.kind}-${isGuide ? att.guide_id : att.kind === 'file' ? att.url : att.uri}-${index}`}
            style={[styles.chip, { backgroundColor: hue + '1A', borderColor: hue + '61' }]}
          >
            <IconSymbol
              ios_icon_name={isGuide ? 'doc.text.fill' : pdf ? 'doc.fill' : 'photo'}
              android_material_icon_name={isGuide ? 'description' : pdf ? 'insert-drive-file' : 'image'}
              size={18}
              color={hue}
            />
            <View style={styles.chipBody}>
              <Text style={styles.chipTitle} numberOfLines={1}>
                {att.name}
              </Text>
              <Text style={styles.chipMeta} numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <Pressable style={styles.chipRemove} onPress={() => removeAt(index)} hitSlop={6}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={12} color={colors.text} />
            </Pressable>
          </View>
        );
      })}

      {!full && (
        <View style={styles.tiles}>
          <Pressable style={styles.tile} onPress={() => setPickerOpen(true)}>
            <IconSymbol ios_icon_name="doc.text.fill" android_material_icon_name="description" size={19} color={colors.primary} />
            <Text style={styles.tileTitle}>{t('content_editor.from_guides')}</Text>
            <Text style={styles.tileMeta}>{t('content_editor.from_guides_sub')}</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={pickFile}>
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="upload" size={19} color={colors.primary} />
            <Text style={styles.tileTitle}>{t('content_editor.upload_file')}</Text>
            <Text style={styles.tileMeta}>{t('checklist:upload_file_sub')}</Text>
          </Pressable>
        </View>
      )}

      <GuidePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        actorId={actorId}
        onPick={(guide) => {
          // One chip per guide — a repeat pick is a no-op.
          if (value.some((a) => a.kind === 'guide' && a.guide_id === guide.id)) return;
          if (value.length >= ATTACHMENT_CAP) return;
          onChange([...value, { kind: 'guide', guide_id: guide.id, name: guide.title }]);
        }}
      />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrap: { marginTop: 14 },
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
      marginBottom: 8,
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
