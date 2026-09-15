import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { StorageImage } from '@/components/StorageImage';
import { toPublicUrl } from '@/utils/storageResolver';
import { fonts } from '@/constants/fonts';
import { AVATAR_ROW, AVATAR_STACK, STACK_MAX_FACES, initialOf } from './messageVisuals';

export interface AvatarPerson {
  id: string;
  name: string;
  profile_picture_url?: string | null;
}

function pictureUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return toPublicUrl('profile-pictures', url);
}

/** One avatar: photo, or the initial on the thumb placeholder. */
export function Avatar({
  person,
  size = AVATAR_ROW,
  style,
  org = false,
}: {
  person: AvatarPerson | null | undefined;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Organisation sender (welcome / system): square-ish radius. */
  org?: boolean;
}) {
  const colors = useThemeColors();
  const pic = pictureUrl(person?.profile_picture_url);
  const radius = org ? Math.round(size * 0.3) : size / 2;
  return (
    <View
      style={[
        styles.av,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.thumbPlaceholder, borderColor: colors.glassBorder },
        style,
      ]}
    >
      {pic ? (
        <StorageImage source={{ uri: pic }} style={{ width: size, height: size }} />
      ) : (
        <Text style={[styles.initial, { color: colors.primary, fontSize: Math.max(10, Math.round(size * 0.36)) }]}>
          {initialOf(person?.name)}
        </Text>
      )}
    </View>
  );
}

/**
 * The list-row avatar: a single face, or up to three overlapping faces plus a "+N"
 * bubble for group threads. `unread` draws the tint ring around the whole thing.
 */
export function AvatarStack({
  people,
  unread = false,
  size = AVATAR_ROW,
  org = false,
}: {
  people: AvatarPerson[];
  unread?: boolean;
  size?: number;
  org?: boolean;
}) {
  const colors = useThemeColors();
  const faces = people.slice(0, STACK_MAX_FACES);
  const more = people.length - faces.length;
  const stacked = people.length > 1;
  const face = Math.round(size * (AVATAR_STACK / AVATAR_ROW));

  return (
    <View style={{ width: size, height: size }}>
      {unread && (
        <View
          pointerEvents="none"
          style={[styles.ring, { borderColor: colors.tint, borderRadius: size / 2 + 4 }]}
        />
      )}
      {!stacked ? (
        <Avatar person={faces[0]} size={size} org={org} />
      ) : (
        <>
          {faces.map((p, i) => {
            const pos: ViewStyle =
              i === 0 ? { top: 0, left: 0 } : i === 1 ? { top: 0, right: 0 } : { bottom: 0, left: Math.round(size * 0.18) };
            return (
              <Avatar
                key={p.id}
                person={p}
                size={face}
                style={[styles.stackFace, pos, { borderWidth: 2, borderColor: colors.background }]}
              />
            );
          })}
          {more > 0 && (
            <View style={[styles.more, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Text style={[styles.moreText, { color: colors.text }]}>+{more}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

/** Overlapping row (participants strip): faces overlap by a third, first on top. */
export function AvatarRow({ people, size = 28, max = 5 }: { people: AvatarPerson[]; size?: number; max?: number }) {
  const colors = useThemeColors();
  const shown = people.slice(0, max);
  return (
    <View style={styles.row}>
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          person={p}
          size={size}
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.32), borderWidth: 2, borderColor: colors.background, zIndex: shown.length - i }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  av: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  initial: { fontFamily: fonts.display.bold },
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2 },
  stackFace: { position: 'absolute' },
  more: {
    position: 'absolute', bottom: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4,
    borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  moreText: { fontFamily: fonts.mono.semibold, fontSize: 8.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
