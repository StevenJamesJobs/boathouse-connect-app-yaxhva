/**
 * My Info — the identity card: 64pt photo with the camera badge, name, @handle, job-title
 * pills, the badge title, the tagline (or "Add a tagline"), the pencil top-right; then the
 * field rows with the locked pair marked.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { toPublicUrl } from '@/utils/storageResolver';
import { fonts } from '@/constants/fonts';
import type { User } from '@/types/user';
import { GOLD_HUE, hexToRgba } from './profileVisuals';

interface Props {
  user: User;
  tagline: string | null | undefined;
  uploading: boolean;
  onPhoto: () => void;
  onEdit: () => void;
}

function pic(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : toPublicUrl('profile-pictures', url);
}

export default function IdentityCard({ user, tagline, uploading, onPhoto, onEdit }: Props) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { t } = useTranslation();
  const url = pic(user.profilePictureUrl);
  const titles = user.jobTitles && user.jobTitles.length ? user.jobTitles : user.jobTitle ? [user.jobTitle] : [];
  const gold = GOLD_HUE[resolvedMode];

  return (
    <GlassCard variant="glass" radius={18} style={styles.card}>
      <View style={styles.top}>
        <TouchableOpacity onPress={onPhoto} activeOpacity={0.85} style={[styles.avWrap, { backgroundColor: colors.thumbPlaceholder, borderColor: colors.glassBorder }]}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : url ? (
            <StorageImage source={{ uri: url }} style={styles.avImg} key={url} />
          ) : (
            <Text style={[styles.initial, { color: colors.primary }]}>{(user.name || '?').trim()[0]?.toUpperCase()}</Text>
          )}
          <View style={[styles.cam, { backgroundColor: colors.tint, borderColor: colors.background }]}>
            <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={11} color={colors.fireText} />
          </View>
        </TouchableOpacity>
        <View style={styles.who}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={[styles.handle, { color: colors.tint }]} numberOfLines={1}>
            @{user.username}
          </Text>
          <View style={styles.pills}>
            {titles.map((jt) => (
              <View key={jt} style={[styles.pill, { backgroundColor: hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#FF7A2F', 0.14), borderColor: hexToRgba(colors.tint.startsWith('#') ? colors.tint : '#FF7A2F', 0.26) }]}>
                <Text style={[styles.pillText, { color: colors.tint }]} numberOfLines={1}>
                  {jt}
                </Text>
              </View>
            ))}
            {user.badgeTitle ? (
              <View style={[styles.pill, { backgroundColor: hexToRgba(gold, 0.16), borderColor: hexToRgba(gold, 0.34) }]}>
                <Text style={[styles.pillText, { color: gold }]} numberOfLines={1}>
                  ★ {user.badgeTitle}
                </Text>
              </View>
            ) : null}
          </View>
          {tagline ? (
            <Text style={[styles.tagline, { color: colors.textSecondary }]} numberOfLines={2}>
              “{tagline}”
            </Text>
          ) : tagline === null ? (
            <TouchableOpacity onPress={onEdit} style={styles.addTag} activeOpacity={0.8}>
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={13} color={colors.tint} />
              <Text style={[styles.addTagText, { color: colors.tint }]}>{t('profile_hub.add_tagline')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={onEdit} hitSlop={8} style={[styles.pen, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={15} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.rows, { borderTopColor: colors.hairline }]}>
        <Row k={t('profile.email')} v={user.email || '—'} />
        <Row k={t('profile.phone_number')} v={user.phoneNumber || '—'} />
        <Row k={t('profile.username')} v={user.username} mono muted locked />
        <Row k={t('profile.full_name')} v={user.name} muted locked />
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('profile_hub.info_hint')}</Text>
    </GlassCard>
  );
}

function Row({ k, v, mono, muted, locked }: { k: string; v: string; mono?: boolean; muted?: boolean; locked?: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.row, { borderTopColor: colors.hairline }]}>
      <Text style={[styles.k, { color: colors.textSecondary }]} numberOfLines={1}>
        {k}
      </Text>
      <Text style={[styles.v, { color: muted ? colors.textSecondary : colors.text }, mono && { fontFamily: fonts.mono.medium, fontSize: 13 }]} numberOfLines={1}>
        {v}
      </Text>
      {locked ? <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={13} color={colors.textSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avWrap: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  avImg: { width: 64, height: 64, borderRadius: 32 },
  initial: { fontFamily: fonts.display.bold, fontSize: 22 },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.display.bold, fontSize: 18, letterSpacing: -0.3, lineHeight: 21 },
  handle: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1, maxWidth: 160 },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  tagline: { fontFamily: fonts.body.regular, fontStyle: 'italic', fontSize: 12.5, lineHeight: 17, marginTop: 8 },
  addTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  addTagText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  pen: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rows: { marginTop: 12, borderTopWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  k: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', width: 104 },
  v: { flex: 1, fontFamily: fonts.body.regular, fontSize: 13.5, minWidth: 0 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
});
