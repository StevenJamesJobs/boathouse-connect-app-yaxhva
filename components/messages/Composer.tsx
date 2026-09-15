import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Keyboard,
  Platform,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { getFileIconInfo } from '@/utils/messageFiles';
import { COMPOSER_MIN_HEIGHT, COMPOSER_MAX_HEIGHT, msgHue } from './messageVisuals';

export interface ComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** The send arrow lights up (tint) the moment there is anything to send. */
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  /** The "+" circle on the left — opens the AttachMenu. */
  onPlus: () => void;
  /** Rendered above the field row (an `AttachmentStrip`, typically). */
  attachments?: React.ReactNode;
}

/**
 * The pinned composer (C-B / D-A): a 42pt glass "+" circle, a growing glass
 * field (one line up to five, then it scrolls inside itself) and a 42pt send
 * circle. Absolute at the bottom of its parent — render it inside a
 * `flex: 1` View that sits in a KeyboardAvoidingView so it rides the keyboard;
 * the page's ScrollView underneath keeps ~220pt of bottom padding.
 */
export default function Composer({
  value,
  onChangeText,
  placeholder,
  canSend,
  sending,
  onSend,
  onPlus,
  attachments,
}: ComposerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(COMPOSER_MIN_HEIGHT);
  const [kbOpen, setKbOpen] = useState(false);

  // The safe-area inset is dead space once the keyboard is up (the field would
  // float a home-indicator above it), so the bottom offset collapses to 10.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKbOpen(true));
    const h = Keyboard.addListener(hideEvt, () => setKbOpen(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // The input auto-sizes natively between min and max; the reported content
  // height only drives the corner radius and the "scroll inside" switch.
  const onContentSizeChange = (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const h = Math.ceil(e.nativeEvent.contentSize.height);
    setHeight(Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, h)));
  };

  const grown = height > COMPOSER_MIN_HEIGHT + 4;
  const sendEnabled = canSend && !sending;

  return (
    <View
      style={[styles.wrap, { bottom: (kbOpen ? 0 : insets.bottom) + 10 }]}
      pointerEvents="box-none"
    >
      {attachments ? <View style={styles.attachRow}>{attachments}</View> : null}
      <View style={styles.row}>
        <Pressable onPress={onPlus} hitSlop={6} disabled={sending}>
          <GlassCard variant="glass" radius={21} style={styles.circle}>
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={22} color={colors.text} />
          </GlassCard>
        </Pressable>

        <GlassCard
          variant="glass"
          radius={grown ? 18 : 21}
          style={[styles.field, { backgroundColor: colors.navTint }]}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            multiline
            scrollEnabled={height >= COMPOSER_MAX_HEIGHT}
            onContentSizeChange={onContentSizeChange}
            textAlignVertical="top"
            style={[styles.input, { color: colors.text, minHeight: COMPOSER_MIN_HEIGHT, maxHeight: COMPOSER_MAX_HEIGHT }]}
          />
        </GlassCard>

        <Pressable onPress={onSend} disabled={!sendEnabled} hitSlop={6}>
          {canSend ? (
            <View style={[styles.circle, { backgroundColor: colors.tint }]}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.fireText} />
              ) : (
                <IconSymbol
                  ios_icon_name="arrow.up"
                  android_material_icon_name="arrow-upward"
                  size={20}
                  color={colors.fireText}
                />
              )}
            </View>
          ) : (
            <GlassCard variant="glass" radius={21} style={styles.circle}>
              <IconSymbol
                ios_icon_name="arrow.up"
                android_material_icon_name="arrow-upward"
                size={20}
                color={colors.textSecondary}
              />
            </GlassCard>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** "240 KB" / "1.2 MB" for the attachment chips. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentStripProps {
  imageUri?: string | null;
  onRemoveImage?: () => void;
  fileName?: string | null;
  fileSize?: number | null;
  onRemoveFile?: () => void;
}

/**
 * The attachment previews: a 58pt photo thumb and/or a 44pt file chip, each
 * with a red ✕ badge. Compose renders it inside the draft card; the thread
 * hands it to the Composer's `attachments` slot.
 */
export function AttachmentStrip({ imageUri, onRemoveImage, fileName, fileSize, onRemoveFile }: AttachmentStripProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const red = msgHue('delete', isDark);
  if (!imageUri && !fileName) return null;

  const badge = (onPress?: () => void) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.badge, { backgroundColor: red, borderColor: colors.background }]}
    >
      <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={11} color="#FFFFFF" />
    </Pressable>
  );

  const fileInfo = fileName ? getFileIconInfo(fileName) : null;
  const size = formatBytes(fileSize);

  return (
    <View style={styles.strip}>
      {!!imageUri && (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: imageUri }} style={[styles.thumb, { backgroundColor: colors.thumbPlaceholder }]} resizeMode="cover" />
          {badge(onRemoveImage)}
        </View>
      )}
      {!!fileName && fileInfo && (
        <View style={[styles.fileChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.fileGlyph, { backgroundColor: hexToRgba(red, 0.18) }]}>
            <IconSymbol
              ios_icon_name={fileInfo.iosIcon}
              android_material_icon_name={fileInfo.androidIcon}
              size={15}
              color={red}
            />
          </View>
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
              {fileName}
            </Text>
            {!!size && <Text style={[styles.fileSize, { color: colors.textSecondary }]}>{size}</Text>}
          </View>
          {badge(onRemoveFile)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 6 },
  attachRow: { marginBottom: 8, paddingLeft: 50 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  circle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, minHeight: COMPOSER_MIN_HEIGHT },
  input: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 11,
    margin: 0,
  },
  // Attachment strip
  strip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 6, paddingRight: 6 },
  thumbWrap: { width: 58, height: 58 },
  thumb: { width: 58, height: 58, borderRadius: 12 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileChip: {
    height: 44,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 240,
  },
  fileGlyph: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fileBody: { flexShrink: 1 },
  fileName: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  fileSize: { fontFamily: fonts.mono.medium, fontSize: 9.5, marginTop: 1 },
});
