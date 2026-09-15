import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
  Animated,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import GlassActionSheet, { GlassAction } from '@/components/GlassActionSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { resolveForOpen } from '@/utils/storageResolver';
import FilterRail, { FilterChip } from '@/components/messages/FilterRail';
import InboxMeter from '@/components/messages/InboxMeter';
import DateSeparator from '@/components/messages/DateSeparator';
import MessageRow, { namesLine } from '@/components/messages/MessageRow';
import FilesGallery from '@/components/messages/FilesGallery';
import { dateBucketOf, msgHue, type MessageFilter } from '@/components/messages/messageVisuals';
import {
  useMessageDirectory,
  type MessageThread,
  type MessageAttachment,
} from '@/components/messages/useMessageDirectory';

type ListItem =
  | { type: 'sep'; key: string; label: string; count: number; first: boolean }
  | { type: 'row'; key: string; thread: MessageThread; hairline: boolean };

const FAB_SIZE = 58;
// Rail order = swipe order. Files sits last (Steve's round).
const FILTERS: MessageFilter[] = ['all', 'unread', 'sent', 'groups', 'files'];
// A horizontal drag on the list body flips the filter (the rows keep their own
// left-swipe actions; a rightward drag on a row is released to this pager).
const PAGE_SWIPE_DISTANCE = 64;
const PAGE_SWIPE_VELOCITY = 650;

export default function MessagesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors, resolvedMode } = useAppTheme();
  const isDark = resolvedMode === 'dark';
  const insets = useSafeAreaInsets();
  const dir = useMessageDirectory();
  const { reload } = dir;

  const [filter, setFilter] = useState<MessageFilter>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetThread, setSheetThread] = useState<MessageThread | null>(null);
  const [sheetFile, setSheetFile] = useState<MessageAttachment | null>(null);
  const loadedOnce = useRef(false);

  // Reload whenever the screen gains focus (returning from a thread / compose).
  useFocusEffect(
    useCallback(() => {
      reload().then((ok) => {
        if (ok) loadedOnce.current = true;
        else Alert.alert(t('common.error'), t('messages.error_load'));
      });
    }, [reload, t]),
  );

  const onRefresh = useCallback(async () => {
    const ok = await dir.refresh();
    if (!ok) Alert.alert(t('common.error'), t('messages.error_load'));
  }, [dir.refresh, t]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const chips: FilterChip[] = useMemo(
    () => [
      { key: 'all', label: t('messages.filter_all') },
      { key: 'unread', label: t('messages.filter_unread'), count: dir.unreadThreads.length },
      { key: 'sent', label: t('messages.sent'), iosIcon: 'paperplane', androidIcon: 'send' },
      { key: 'groups', label: t('messages.filter_groups'), iosIcon: 'person.2', androidIcon: 'group' },
      { key: 'files', label: t('messages.filter_files'), count: dir.attachments.length, iosIcon: 'paperclip', androidIcon: 'attach-file' },
    ],
    [t, dir.unreadThreads.length, dir.attachments.length],
  );

  // The body slides 22pt in from the side you swiped toward and fades up — the
  // feedback that a page turned, without a full pager.
  const slideX = useRef(new Animated.Value(0)).current;
  const slideA = useRef(new Animated.Value(1)).current;
  const filterRef = useRef<MessageFilter>('all');
  filterRef.current = filter;

  const changeFilter = useCallback(
    (next: MessageFilter, direction: -1 | 0 | 1 = 0) => {
      if (!FILTERS.includes(next) || next === filterRef.current) return;
      setFilter(next);
      setSelectionMode(false);
      setSelected(new Set());
      if (direction !== 0) {
        slideX.setValue(22 * direction);
        slideA.setValue(0.35);
        Animated.parallel([
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }),
          Animated.timing(slideA, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]).start();
      }
    },
    [slideX, slideA],
  );

  const stepFilter = useCallback(
    (step: -1 | 1) => {
      const idx = FILTERS.indexOf(filterRef.current);
      const next = FILTERS[idx + step];
      if (next) changeFilter(next, step);
    },
    [changeFilter],
  );

  // Horizontal pan on the body; vertical movement fails it so the lists still scroll,
  // and a row's own Swipeable (activeOffsetX 10) wins a leftward drag that starts on it.
  const pageGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-28, 28])
        .failOffsetY([-14, 14])
        .runOnJS(true)
        .onEnd((e) => {
          if (e.translationX <= -PAGE_SWIPE_DISTANCE || e.velocityX <= -PAGE_SWIPE_VELOCITY) stepFilter(1);
          else if (e.translationX >= PAGE_SWIPE_DISTANCE || e.velocityX >= PAGE_SWIPE_VELOCITY) stepFilter(-1);
        }),
    [stepFilter],
  );

  const threads = dir.threadsFor(filter);

  const bucketLabel = useCallback(
    (bucket: string): string => {
      if (bucket === 'today') return t('messages.group_today');
      if (bucket === 'yesterday') return t('messages.yesterday');
      if (bucket === 'earlier_week') return t('messages.group_earlier_week');
      const [y, m] = bucket.split('-').map(Number);
      const month = new Date(y, (m || 1) - 1, 1).toLocaleDateString(i18n.language, { month: 'long' });
      const label = month.charAt(0).toUpperCase() + month.slice(1);
      return y !== new Date().getFullYear() ? `${label} ${y}` : label;
    },
    [t, i18n.language],
  );

  const items: ListItem[] = useMemo(() => {
    const now = new Date();
    const groups: { bucket: string; threads: MessageThread[] }[] = [];
    for (const th of threads) {
      const bucket = dateBucketOf(th.createdAt, now);
      const last = groups[groups.length - 1];
      if (last && last.bucket === bucket) last.threads.push(th);
      else groups.push({ bucket, threads: [th] });
    }
    const out: ListItem[] = [];
    groups.forEach((g, gi) => {
      out.push({ type: 'sep', key: `sep:${g.bucket}`, label: bucketLabel(g.bucket), count: g.threads.length, first: gi === 0 });
      g.threads.forEach((th, i) => out.push({ type: 'row', key: th.key, thread: th, hairline: i > 0 }));
    });
    return out;
  }, [threads, bucketLabel]);

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const selectedThreads = useMemo(
    () => Array.from(selected).map((k) => dir.threadByKey(k)).filter((x): x is MessageThread => !!x),
    [selected, dir.threadByKey],
  );
  const selectedInbox = selectedThreads.filter((th) => th.box === 'inbox');

  // ── Actions ──────────────────────────────────────────────────────────────
  const openThread = (th: MessageThread) => {
    router.push({ pathname: '/message-detail', params: { messageId: th.id, threadId: th.threadId } });
  };

  const onRowPress = (th: MessageThread) => {
    if (selectionMode) toggleSelect(th.key);
    else openThread(th);
  };

  const markRead = async (list: MessageThread[], announce: boolean) => {
    try {
      await dir.markThreadsRead(list);
      if (announce) {
        Alert.alert(t('common.success'), t('messages.marked_as_read_success', { count: list.length }));
      }
    } catch (error) {
      console.error('Error marking as read:', error);
      Alert.alert(t('common.error'), t('messages.error_mark_read'));
    }
  };

  const confirmDelete = (list: MessageThread[]) => {
    if (list.length === 0) return;
    const count = list.length;
    const type = 'message';
    const body =
      count === 1
        ? list[0].box === 'inbox'
          ? t('messages.delete_inbox_confirm', { type })
          : t('messages.delete_sent_confirm')
        : t('messages.delete_confirm_msg', { count, type });
    Alert.alert(t('messages.delete_confirm_title', { count, type }), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await dir.deleteThreads(list);
            exitSelection();
            Alert.alert(t('common.success'), t('messages.deleted_success', { count, type }));
          } catch (error) {
            console.error('Error deleting messages:', error);
            Alert.alert(t('common.error'), t('messages.error_delete'));
          }
        },
      },
    ]);
  };

  const replyAll = (th: MessageThread) => {
    router.push({
      pathname: '/compose-message',
      params: {
        replyToMessageId: th.threadId,
        replyToSenderId: th.senderId,
        replyAllRecipientIds: th.participantIds.join(','),
        replySubject: th.subject || '',
        isReplyAll: 'true',
      },
    });
  };

  const onBatchMarkRead = async () => {
    if (selectedInbox.length === 0) return;
    await markRead(selectedInbox, true);
    exitSelection();
  };

  // Thread long-press sheet
  const threadActions: GlassAction[] = useMemo(() => {
    const th = sheetThread;
    if (!th) return [];
    const list: GlassAction[] = [];
    if (th.box === 'inbox' && !th.isRead) {
      list.push({
        key: 'read',
        label: t('messages.mark_as_read'),
        iosIcon: 'envelope.open',
        androidIcon: 'mark-email-read',
        onPress: () => markRead([th], false),
      });
    }
    list.push({
      key: 'reply',
      label: t('messages.reply'),
      iosIcon: 'arrowshape.turn.up.left',
      androidIcon: 'reply',
      onPress: () => replyAll(th),
    });
    list.push({
      key: 'select',
      label: t('messages.select_messages'),
      iosIcon: 'checkmark.circle',
      androidIcon: 'check-circle',
      onPress: () => {
        setSelectionMode(true);
        setSelected(new Set([th.key]));
      },
    });
    list.push({
      key: 'delete',
      label: t('common.delete'),
      iosIcon: 'trash',
      androidIcon: 'delete',
      destructive: true,
      onPress: () => confirmDelete([th]),
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetThread, t]);

  // ── Files ────────────────────────────────────────────────────────────────
  const openAttachmentThread = (a: MessageAttachment) => {
    const th = dir.threadByKey(`${a.box}:${a.threadId}`);
    if (th) openThread(th);
    else router.push({ pathname: '/message-detail', params: { messageId: a.messageId, threadId: a.threadId } });
  };

  const openFile = async (a: MessageAttachment) => {
    try {
      await WebBrowser.openBrowserAsync(await resolveForOpen(a.url, { tier: 'file' }));
    } catch (err) {
      console.error('Error opening file:', err);
      Alert.alert(t('common.error'), t('messages.error_open_file'));
    }
  };

  const shareAttachment = async (a: MessageAttachment) => {
    try {
      const url = await resolveForOpen(a.url, { tier: a.kind === 'photo' ? 'image' : 'file' });
      const base = a.url.split('?')[0];
      const name = a.fileName || base.substring(base.lastIndexOf('/') + 1) || `attachment_${Date.now()}`;
      const downloadsDir = `${FileSystem.cacheDirectory}downloads/`;
      const info = await FileSystem.getInfoAsync(downloadsDir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      const result = await FileSystem.downloadAsync(url, `${downloadsDir}${Date.now()}_${name}`);
      if (result.status !== 200) throw new Error(`Download failed with status ${result.status}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { dialogTitle: name });
      } else {
        await Share.share({ url, message: url });
      }
    } catch (err) {
      console.error('Error sharing attachment:', err);
      Alert.alert(t('common.error'), t('messages.error_share'));
    }
  };

  const fileActions: GlassAction[] = useMemo(() => {
    const a = sheetFile;
    if (!a) return [];
    return [
      { key: 'open', label: t('messages.open_message'), iosIcon: 'envelope', androidIcon: 'mail', onPress: () => openAttachmentThread(a) },
      { key: 'share', label: t('messages.share'), iosIcon: 'square.and.arrow.up', androidIcon: 'share', onPress: () => shareAttachment(a) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetFile, t]);

  // ── Render ───────────────────────────────────────────────────────────────
  const showSpinner = dir.loading && !loadedOnce.current;
  const listBottomPad = insets.bottom + FAB_SIZE + 52;
  const azure = msgHue('read', isDark);
  const red = msgHue('delete', isDark);
  const selectHidden = filter === 'files';

  const selectChip = (
    <Pressable
      onPress={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
      disabled={selectHidden}
      accessibilityRole="button"
      accessibilityLabel={selectionMode ? t('messages.done') : t('messages.select')}
      style={[
        styles.selectChip,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        selectHidden && { opacity: 0 },
      ]}
    >
      <IconSymbol
        ios_icon_name={selectionMode ? 'checkmark' : 'checkmark.square'}
        android_material_icon_name={selectionMode ? 'check' : 'check-box'}
        size={15}
        color={colors.text}
      />
      <Text style={[styles.selectLabel, { color: colors.text }]}>
        {selectionMode ? t('messages.done') : t('messages.select')}
      </Text>
    </Pressable>
  );

  const emptyFor = (f: MessageFilter): { ios: string; android: string; text: string } => {
    switch (f) {
      case 'unread':
        return { ios: 'checkmark.circle', android: 'done-all', text: t('messages.no_unread') };
      case 'sent':
        return { ios: 'paperplane', android: 'send', text: t('messages.no_sent_messages') };
      case 'files':
        return { ios: 'paperclip', android: 'attach-file', text: t('messages.no_files') };
      case 'groups':
        return { ios: 'person.2', android: 'group', text: t('messages.no_groups') };
      default:
        return { ios: 'tray', android: 'inbox', text: t('messages.no_inbox_messages') };
    }
  };

  const renderEmpty = () => {
    const e = emptyFor(filter);
    return (
      <View style={styles.empty}>
        <IconSymbol ios_icon_name={e.ios} android_material_icon_name={e.android} size={44} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{e.text}</Text>
      </View>
    );
  };

  const cardSide = { backgroundColor: colors.surface, borderColor: colors.surfaceBorder };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'sep') {
      return (
        <View style={[styles.cell, styles.sepCell, cardSide]}>
          <DateSeparator label={item.label} count={item.count} first={item.first} />
        </View>
      );
    }
    return (
      <View style={[styles.cell, cardSide]}>
        <MessageRow
          thread={item.thread}
          hairline={item.hairline}
          selectionMode={selectionMode}
          selected={selected.has(item.thread.key)}
          onPress={() => onRowPress(item.thread)}
          onLongPress={() => setSheetThread(item.thread)}
          onMarkRead={() => markRead([item.thread], false)}
          onDelete={() => confirmDelete([item.thread])}
        />
      </View>
    );
  };

  const refreshControl = <RefreshControl refreshing={dir.refreshing} onRefresh={onRefresh} tintColor={colors.tint} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('messages.title')} right={selectChip} rightWide />

      <FilterRail chips={chips} value={filter} onChange={(next) => changeFilter(next, 0)} />
      {filter !== 'sent' && filter !== 'files' && <InboxMeter count={dir.inboxCount} />}

      <GestureDetector gesture={pageGesture}>
      <Animated.View style={[styles.body, { opacity: slideA, transform: [{ translateX: slideX }] }]}>
      {showSpinner ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('messages.loading_messages')}</Text>
        </View>
      ) : filter === 'files' ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: listBottomPad }}
          refreshControl={refreshControl}
        >
          {dir.attachments.length === 0 ? (
            renderEmpty()
          ) : (
            <FilesGallery
              attachments={dir.attachments}
              onOpenPhoto={openAttachmentThread}
              onOpenFile={openFile}
              onLongPress={setSheetFile}
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          // Re-keyed per filter: rows remount, so an open swipe never rides across a page turn.
          key={filter}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          extraData={[selectionMode, selected]}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          refreshControl={refreshControl}
          ListEmptyComponent={renderEmpty}
          // The single surface card around the rows: a top cap, side-bordered cells, a bottom cap.
          ListHeaderComponent={items.length > 0 ? <View style={[styles.cap, styles.capTop, cardSide]} /> : null}
          ListFooterComponent={items.length > 0 ? <View style={[styles.cap, styles.capBottom, cardSide]} /> : null}
          initialNumToRender={14}
          windowSize={7}
        />
      )}
      </Animated.View>
      </GestureDetector>

      {/* Selection bar — floats above the safe area while selecting */}
      {selectionMode && (
        <GlassCard variant="glass" radius={18} style={[styles.bar, { bottom: insets.bottom + 16 }]}>
          <Text style={[styles.barCount, { color: colors.text }]} numberOfLines={1}>
            {t('messages.selected', { count: selected.size })}
          </Text>
          {filter !== 'sent' && (
            <Pressable
              onPress={onBatchMarkRead}
              disabled={selectedInbox.length === 0}
              style={[
                styles.barBtn,
                { backgroundColor: azure + '29', borderColor: azure + '66' },
                selectedInbox.length === 0 && styles.barBtnOff,
              ]}
            >
              <IconSymbol ios_icon_name="checkmark.circle" android_material_icon_name="check-circle" size={15} color={azure} />
              <Text style={[styles.barBtnLabel, { color: azure }]} numberOfLines={1}>
                {t('messages.mark_as_read')}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => confirmDelete(selectedThreads)}
            disabled={selectedThreads.length === 0}
            style={[
              styles.barBtn,
              { backgroundColor: red + '29', borderColor: red + '66' },
              selectedThreads.length === 0 && styles.barBtnOff,
            ]}
          >
            <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={15} color={red} />
            <Text style={[styles.barBtnLabel, { color: red }]} numberOfLines={1}>
              {t('common.delete')}
            </Text>
          </Pressable>
        </GlassCard>
      )}

      {/* FAB → compose */}
      {!selectionMode && (
        <TouchableOpacity
          onPress={() => router.push('/compose-message')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('messages.new_message')}
          style={[styles.fab, { backgroundColor: colors.tint, bottom: insets.bottom + 20 }]}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={26} color={colors.fireText} />
        </TouchableOpacity>
      )}

      <GlassActionSheet
        visible={!!sheetThread}
        onClose={() => setSheetThread(null)}
        title={sheetThread?.subject || t('messages.no_subject')}
        subtitle={
          sheetThread
            ? namesLine(
                sheetThread,
                sheetThread.box === 'sent'
                  ? t('messages.recipients', { count: sheetThread.recipientIds.length })
                  : t('messages.unknown_sender'),
              )
            : undefined
        }
        actions={threadActions}
      />

      <GlassActionSheet
        visible={!!sheetFile}
        onClose={() => setSheetFile(null)}
        title={sheetFile ? sheetFile.fileName || t(sheetFile.kind === 'photo' ? 'messages.preview_photo' : 'messages.preview_file') : ''}
        subtitle={sheetFile ? (sheetFile.isMine ? t('messages.you') : sheetFile.sender.name) : undefined}
        actions={fileActions}
      />
    </View>
  );
}

const CARD_RADIUS = 16;
const CARD_BORDER = StyleSheet.hairlineWidth + 0.5;

const styles = StyleSheet.create({
  container: { flex: 1 },
  selectChip: {
    height: 38,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  body: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16 },
  // One surface card drawn across the virtualized cells: every cell carries the
  // fill and the side borders; the caps carry the radius and the top / bottom edge.
  cell: { borderLeftWidth: CARD_BORDER, borderRightWidth: CARD_BORDER, overflow: 'hidden' },
  sepCell: { paddingHorizontal: 10 },
  cap: { height: 4, borderLeftWidth: CARD_BORDER, borderRightWidth: CARD_BORDER },
  capTop: { borderTopWidth: CARD_BORDER, borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  capBottom: { borderBottomWidth: CARD_BORDER, borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS },
  loading: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.body.regular, fontSize: 14 },
  empty: { paddingVertical: 60, alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  emptyText: { fontFamily: fonts.body.regular, fontSize: 14, textAlign: 'center' },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  barCount: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 14 },
  barBtn: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barBtnOff: { opacity: 0.4 },
  barBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  fab: {
    position: 'absolute',
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
});
