import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { AvatarRow, type AvatarPerson } from './AvatarStack';
import { AVATAR_STRIP } from './messageVisuals';

interface ParticipantsStripProps {
  people: AvatarPerson[];
  /** "Nick, Sam, Amy and you" */
  label: string;
  /** "Replies reach everyone" — the mono eyebrow. */
  eyebrow: string;
  onPress: () => void;
}

/**
 * The thread's "who am I talking to" row (D-A): overlapping 28pt faces, the
 * first-names line, the mono eyebrow and a chevron → ParticipantsSheet.
 */
export default function ParticipantsStrip({ people, label, eyebrow, onPress }: ParticipantsStripProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.strip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
    >
      <AvatarRow people={people} size={AVATAR_STRIP} max={5} />
      <View style={styles.body}>
        <Text style={[styles.l1, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.l2, { color: colors.textSecondary }]} numberOfLines={1}>
          {eyebrow}
        </Text>
      </View>
      <IconSymbol
        ios_icon_name="chevron.right"
        android_material_icon_name="chevron-right"
        size={16}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  body: { flex: 1, minWidth: 0 },
  l1: { fontFamily: fonts.body.semibold, fontSize: 13 },
  l2: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 },
});
