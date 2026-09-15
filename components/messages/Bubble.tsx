import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { getFileIconInfo } from '@/utils/messageFiles';
import { Avatar, type AvatarPerson } from './AvatarStack';
import { AVATAR_BUBBLE, msgHue } from './messageVisuals';

export type BubbleKind = 'text' | 'photo' | 'file';

export interface BubbleProps {
  mine: boolean;
  kind: BubbleKind;
  text?: string | null;
  imageUrl?: string | null;
  fileName?: string | null;
  /** "tap to open" line on a file bubble (size is not in the thread rows). */
  fileHint?: string;
  /** Photo → the full-screen viewer; file → resolveForOpen + WebBrowser. */
  onPress?: () => void;
  /** Theirs only: the 28pt face beside the first bubble of a run; omit for a 30pt spacer. */
  avatar?: AvatarPerson | null;
  onAvatarPress?: () => void;
  /** Mono 9.5 stamp under the bubble ("2:14 PM"); mine right-aligns. */
  stamp?: string | null;
}

/**
 * One thread bubble (D-A). Theirs = surface fill + hairline, radius 18 with 5
 * on the bottom-left, avatar or spacer to its left; mine = tint fill +
 * fireText, right-aligned, 5 on the bottom-right. File and photo bubbles share
 * the geometry.
 */
export default function Bubble({
  mine,
  kind,
  text,
  imageUrl,
  fileName,
  fileHint,
  onPress,
  avatar,
  onAvatarPress,
  stamp,
}: BubbleProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const ink = mine ? colors.fireText : colors.text;
  const inkSoft = mine ? hexToRgba(colors.fireText.startsWith('#') ? colors.fireText : '#FFFFFF', 0.72) : colors.textSecondary;

  const shape = [
    styles.bub,
    mine
      ? { backgroundColor: colors.tint, borderColor: colors.tint, borderBottomRightRadius: 5 }
      : { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderBottomLeftRadius: 5 },
  ];

  let body: React.ReactNode = null;
  if (kind === 'photo' && imageUrl) {
    // No fill, no hairline: a photo bubble is the photo itself, rounded, on a soft glow
    // (tint for mine, shadow for theirs). The old tinted frame read as a fat half-border.
    body = (
      <Pressable
        onPress={onPress}
        style={[
          styles.photoGlow,
          { shadowColor: mine ? colors.tint : '#000000', shadowOpacity: mine ? 0.35 : 0.28 },
        ]}
      >
        <View style={[styles.photo, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
          <StorageImage source={{ uri: imageUrl }} style={styles.photoImg} resizeMode="cover" />
        </View>
      </Pressable>
    );
  } else if (kind === 'file' && fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const glyphHue = ext === 'pdf' || !ext ? msgHue('file', isDark) : msgHue('doc', isDark);
    const info = getFileIconInfo(fileName);
    body = (
      <Pressable onPress={onPress} style={[shape, styles.fileBub]}>
        <View style={[styles.fileGlyph, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : hexToRgba(glyphHue, 0.18) }]}>
          <IconSymbol
            ios_icon_name={info.iosIcon}
            android_material_icon_name={info.androidIcon}
            size={17}
            color={mine ? colors.fireText : glyphHue}
          />
        </View>
        <View style={styles.fileBody}>
          <Text style={[styles.fileName, { color: ink }]} numberOfLines={1}>
            {fileName}
          </Text>
          {!!fileHint && <Text style={[styles.fileHint, { color: inkSoft }]}>{fileHint}</Text>}
        </View>
        <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="download" size={16} color={inkSoft} />
      </Pressable>
    );
  } else {
    body = (
      <View style={shape}>
        <Text style={[styles.text, { color: ink }]}>{text}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}>
      <View style={[styles.msg, mine && styles.msgMine]}>
        {!mine &&
          (avatar ? (
            <Pressable onPress={onAvatarPress} hitSlop={6} style={styles.avatarSlot}>
              <Avatar person={avatar} size={AVATAR_BUBBLE} />
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          ))}
        {body}
      </View>
      {!!stamp && (
        <Text style={[styles.stamp, { color: colors.textSecondary }, mine ? styles.stampMine : styles.stampTheirs]}>
          {stamp}
        </Text>
      )}
    </View>
  );
}

/** "Nick Zebra" over a new sender's run — 11 semibold secondary, indented past the avatar. */
export function SenderLine({ name }: { name: string }) {
  const colors = useThemeColors();
  return (
    <Text style={[styles.who, { color: colors.textSecondary }]} numberOfLines={1}>
      {name}
    </Text>
  );
}

/** hairline · mono eyebrow · hairline. */
export function DateDivider({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.dd}>
      <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
      <Text style={[styles.eyeb, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 3 },
  wrapTheirs: { alignItems: 'flex-start' },
  wrapMine: { alignItems: 'flex-end' },
  msg: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '86%' },
  msgMine: { flexDirection: 'row-reverse' },
  avatarSlot: { width: AVATAR_BUBBLE, height: AVATAR_BUBBLE },
  spacer: { width: 30 },
  bub: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexShrink: 1,
  },
  text: { fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 19 },
  // Shadow lives on the OUTER view (overflow:hidden on the clip would swallow it).
  photoGlow: { borderRadius: 18, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 6 },
  photo: { overflow: 'hidden', width: 200, height: 132, borderRadius: 18 },
  photoImg: { width: 200, height: 132 },
  fileBub: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 8, paddingRight: 12, paddingVertical: 8 },
  fileGlyph: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileBody: { flexShrink: 1, maxWidth: 180 },
  fileName: { fontFamily: fonts.body.semibold, fontSize: 13 },
  fileHint: { fontFamily: fonts.mono.medium, fontSize: 10, marginTop: 1 },
  stamp: { fontFamily: fonts.mono.medium, fontSize: 9.5, marginTop: 1 },
  stampTheirs: { marginLeft: 38 },
  stampMine: { marginRight: 4, textAlign: 'right' },
  who: { fontFamily: fonts.body.semibold, fontSize: 11, marginTop: 8, marginBottom: 2, marginLeft: 38 },
  dd: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 6 },
  ln: { flex: 1, height: StyleSheet.hairlineWidth + 0.5 },
  eyeb: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
});
