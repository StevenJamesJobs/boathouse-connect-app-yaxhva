import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { fonts } from '@/constants/fonts';
import { Avatar, type AvatarPerson } from './AvatarStack';

export interface ThreadParticipant extends AvatarPerson {
  /** "Bar Manager · Bartender" */
  titles: string;
  /** Sender of the root message. */
  isRoot: boolean;
  isMe: boolean;
}

interface ParticipantsSheetProps {
  visible: boolean;
  onClose: () => void;
  participants: ThreadParticipant[];
}

/**
 * "In this thread" (D-B): a plain roster — 34pt avatar, name, titles (+ "started
 * the thread" / "you"), a small glass Message chip per other person that starts
 * a fresh one-to-one compose. Tapping the row itself opens the mini profile.
 * Both leave this sheet first (useSheetHandoff) — a compose push and the mini
 * profile card are presentations of their own.
 */
export default function ParticipantsSheet({ visible, onClose, participants }: ParticipantsSheetProps) {
  const { t } = useTranslation('message_detail');
  const colors = useThemeColors();
  const router = useRouter();
  const { open: openMiniProfile } = useMiniProfile();
  const { defer, onDismiss } = useSheetHandoff(onClose);

  const message = (p: ThreadParticipant) =>
    defer(() =>
      router.push({ pathname: '/compose-message', params: { recipientId: p.id, recipientName: p.name } }),
    );
  const profile = (p: ThreadParticipant) => defer(() => openMiniProfile(p.id));

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('in_this_thread')}
      subtitle={t('people_see_every_reply', { count: participants.length })}
      onDismiss={onDismiss}
    >
      {participants.map((p) => {
        const extras = [p.isRoot ? t('started_the_thread') : null, p.isMe ? t('you_suffix') : null].filter(Boolean);
        const line2 = [p.titles, ...extras].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={p.id}
            onPress={() => profile(p)}
            style={[styles.row, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <Avatar person={p} size={34} />
            <View style={styles.body}>
              <Text style={[styles.l1, { color: colors.text }]} numberOfLines={1}>
                {p.name}
              </Text>
              {!!line2 && (
                <Text style={[styles.l2, { color: colors.textSecondary }]} numberOfLines={1}>
                  {line2}
                </Text>
              )}
            </View>
            {!p.isMe && (
              <Pressable
                onPress={() => message(p)}
                hitSlop={6}
                style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={13} color={colors.text} />
                <Text style={[styles.chipLabel, { color: colors.text }]}>{t('message_chip')}</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('participants_hint')}</Text>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  body: { flex: 1, minWidth: 0 },
  l1: { fontFamily: fonts.body.semibold, fontSize: 14 },
  l2: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 1 },
  chip: {
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 6 },
});
