import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { AvatarStack } from './AvatarStack';
import { msgHue } from './messageVisuals';
import type { MessageThread } from './useMessageDirectory';

const SWIPE_CIRCLE = 40;
const SWIPE_GAP = 8;

/** "2:14 PM" today · "Mon" inside the week · "Sep 8" beyond (locale-aware). */
export function formatRowTime(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'short' });
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(locale, opts);
}

/** "Nick Zebra, Sam Fields +3" — the first two names, then the remainder. */
export function namesLine(thread: MessageThread, fallback: string): string {
  const names = thread.people.map((p) => p.name).filter(Boolean);
  if (names.length === 0) return fallback;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/**
 * One list row (L2a): 44pt AvatarStack with the unread ring; sender / recipients
 * in the tint with the mono time at the right; the subject beneath; the one-line
 * preview under that. No reply count. Swipe left reveals Read (azure, inbox +
 * unread only) and Delete (red); a long-press hands off to the screen's sheet.
 */
export default function MessageRow({
  thread,
  hairline,
  selectionMode,
  selected,
  onPress,
  onLongPress,
  onMarkRead,
  onDelete,
}: {
  thread: MessageThread;
  /** Draw the hairline above (every row except the first under a separator). */
  hairline: boolean;
  selectionMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, resolvedMode } = useAppTheme();
  const isDark = resolvedMode === 'dark';
  const swipeRef = useRef<Swipeable>(null);
  // While the actions are showing, a rightward drag must close the row (Steve's round 2);
  // while closed, the same drag belongs to the list's filter pager.
  const [open, setOpen] = useState(false);

  const isUnread = thread.box === 'inbox' && !thread.isRead;
  const canMarkRead = isUnread;
  const names = namesLine(
    thread,
    thread.box === 'sent' ? t('messages.recipients', { count: thread.recipientIds.length }) : t('messages.unknown_sender'),
  );
  const time = formatRowTime(thread.createdAt, i18n.language);
  const body = (thread.body || '').replace(/\s+/g, ' ').trim();
  const attachmentOnly = !body && (!!thread.imageUrl || !!thread.fileUrl);

  // Two 40pt circles (Read · Delete) centred on the row, bubbling in as the row slides —
  // the full-height blocks read as odd slabs against rows of different heights.
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const count = canMarkRead ? 2 : 1;
    const width = count * SWIPE_CIRCLE + (count + 1) * SWIPE_GAP;
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [width * 0.6, 0] });
    const scale = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.4, 0.75, 1], extrapolate: 'clamp' });
    const opacity = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeWrap, { width, transform: [{ translateX }] }]}>
        {canMarkRead && (
          <Animated.View style={{ transform: [{ scale }], opacity }}>
            <TouchableOpacity
              style={[styles.swipeCircle, { backgroundColor: msgHue('read', isDark) }]}
              onPress={() => {
                swipeRef.current?.close();
                onMarkRead();
              }}
              activeOpacity={0.85}
              accessibilityLabel={t('messages.swipe_read')}
            >
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        )}
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <TouchableOpacity
            style={[styles.swipeCircle, { backgroundColor: msgHue('delete', isDark) }]}
            onPress={() => {
              swipeRef.current?.close();
              onDelete();
            }}
            activeOpacity={0.85}
            accessibilityLabel={t('common.delete')}
          >
            <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    );
  };

  const content = (
    <Pressable
      onPress={onPress}
      onLongPress={selectionMode ? undefined : onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {hairline && <View style={[styles.hairline, { backgroundColor: colors.hairline }]} />}

      {selectionMode && (
        <View
          style={[
            styles.check,
            { borderColor: colors.border },
            selected && { backgroundColor: colors.tint, borderColor: colors.tint },
          ]}
        >
          {selected && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={colors.fireText} />}
        </View>
      )}

      <AvatarStack people={thread.people} unread={isUnread} org={thread.isOrg} />

      <View style={styles.body}>
        <View style={styles.line1}>
          <Text
            style={[styles.names, { color: colors.tint }, isUnread && styles.namesUnread]}
            numberOfLines={1}
          >
            {names}
          </Text>
          <Text style={[styles.time, { color: isUnread ? colors.tint : colors.textSecondary }, isUnread && styles.timeUnread]}>
            {time}
          </Text>
        </View>
        {!!thread.subject && (
          <Text style={[styles.subject, { color: colors.text }]} numberOfLines={1}>
            {thread.subject}
          </Text>
        )}
        {attachmentOnly ? (
          thread.imageUrl ? (
            <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('messages.preview_photo')}
            </Text>
          ) : (
            <View style={styles.previewRow}>
              <IconSymbol ios_icon_name="paperclip" android_material_icon_name="attach-file" size={12} color={colors.textSecondary} />
              <Text style={[styles.preview, styles.previewFlex, { color: colors.textSecondary }]} numberOfLines={1}>
                {thread.fileName || t('messages.preview_file')}
              </Text>
            </View>
          )
        ) : (
          !!body && (
            <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
              {body}
            </Text>
          )
        )}
      </View>
    </Pressable>
  );

  if (selectionMode) return content;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      dragOffsetFromLeftEdge={open ? 10 : 10000}
      onSwipeableWillOpen={() => setOpen(true)}
      onSwipeableClose={() => setOpen(false)}
    >
      {content}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // The card's 10pt side padding lives HERE (10 + the row's own 4) so the swipe
  // squares run flush to the card's inner edge instead of stopping 10pt short.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  hairline: { position: 'absolute', top: 0, left: 10, right: 10, height: StyleSheet.hairlineWidth },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  line1: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  names: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 14 },
  namesUnread: { fontFamily: fonts.display.bold },
  time: { fontFamily: fonts.mono.medium, fontSize: 10 },
  timeUnread: { fontFamily: fonts.mono.semibold },
  subject: { fontFamily: fonts.body.semibold, fontSize: 13, marginTop: 1 },
  preview: { fontFamily: fonts.body.regular, fontSize: 12, marginTop: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  previewFlex: { flex: 1, marginTop: 0 },
  swipeWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SWIPE_GAP, paddingRight: SWIPE_GAP },
  swipeCircle: { width: SWIPE_CIRCLE, height: SWIPE_CIRCLE, borderRadius: SWIPE_CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
});
