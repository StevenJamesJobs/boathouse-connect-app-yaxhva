/**
 * Message thread (s84, D-A/D-B). Chrome = AmbientGlow + ScreenHeader; the participants strip
 * opens a GlassSheet roster, the composer's "+" opens the attach sheet (GlassActionSheet
 * grammar), bubbles ride the messaging kit. The screen itself renders no glass card — the
 * kit does — so this note is the tracker's marker.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { IconSymbol } from '@/components/IconSymbol';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/app/integrations/supabase/client';
import { refreshAllUnreadCounts } from '@/hooks/useUnreadMessages';
import { useNotification } from '@/contexts/NotificationContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { bothLanguages } from '@/utils/notificationHelpers';
import i18n from '@/i18n';
import { imageContentTypeForExt } from '@/utils/storageBroker';
import { StorageImage } from '@/components/StorageImage';
import { resolveForOpen } from '@/utils/storageResolver';
import { uploadMessageImage } from '@/utils/messageImages';
import { uploadMessageFile } from '@/utils/messageFiles';
import { isManagerOrOwner } from '@/utils/roles';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import Composer, { AttachmentStrip } from '@/components/messages/Composer';
import AttachMenu from '@/components/messages/AttachMenu';
import Bubble, { DateDivider, SenderLine } from '@/components/messages/Bubble';
import ParticipantsStrip from '@/components/messages/ParticipantsStrip';
import ParticipantsSheet, { type ThreadParticipant } from '@/components/messages/ParticipantsSheet';
import { useThreadPeople, firstNameOf, titlesOf } from '@/components/messages/useThreadPeople';
import { msgHue, dateBucketOf } from '@/components/messages/messageVisuals';

interface MessageThread {
  id: string;
  sender_id: string;
  recipient_ids: string[];
  subject: string | null;
  body: string;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  is_current_user: boolean;
}

const STAMP_GAP_MS = 5 * 60 * 1000;

export default function MessageDetailScreen() {
  const { t } = useTranslation('message_detail');
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { open: openMiniProfile } = useMiniProfile();
  const router = useRouter();
  const params = useLocalSearchParams();
  const messageId = params.messageId as string;
  const threadId = params.threadId as string;

  const [messages, setMessages] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyImageUri, setReplyImageUri] = useState<string | null>(null);
  const [replyFileUri, setReplyFileUri] = useState<string | null>(null);
  const [replyFileName, setReplyFileName] = useState<string | null>(null);
  const [replyFileSize, setReplyFileSize] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { byId, personOf, nameOf } = useThreadPeople(user?.id);
  const canAttachFiles = isManagerOrOwner(user);

  const loadThread = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Whole thread in one call (participant-gated + expanded server-side, ascending)
      const { data: threadMessages, error: threadError } = await supabase.rpc('get_message_thread', {
        p_actor_id: user.id,
        p_message_id: messageId,
        p_thread_id: threadId,
      });

      if (threadError) throw threadError;

      const rows = threadMessages || [];
      const mainMessage = rows.find((msg: any) => msg.id === messageId);
      if (!mainMessage) throw new Error('Main message not found in thread');

      const formattedMessages: MessageThread[] = rows.map((msg: any) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        recipient_ids: msg.recipient_ids || [],
        subject: msg.subject,
        body: msg.body,
        image_url: msg.image_url || null,
        file_url: msg.file_url || null,
        file_name: msg.file_name || null,
        created_at: msg.created_at,
        is_current_user: msg.sender_id === user.id,
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading thread:', error);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_load'));
    } finally {
      setLoading(false);
    }
  }, [messageId, threadId, user?.id]);

  const markThreadAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Mark all messages in the thread as read for this user (expanded server-side)
      const { error: updateError } = await supabase.rpc('mark_thread_read', {
        p_actor_id: user.id,
        p_message_id: messageId,
        p_thread_id: threadId,
      });

      if (updateError) {
        console.error('Error marking thread as read:', updateError);
        throw updateError;
      }

      // Immediately refresh all badge counts across the app
      refreshAllUnreadCounts();
    } catch (error) {
      console.error('Error in markThreadAsRead:', error);
    }
  }, [messageId, threadId, user?.id]);

  const scrollToEnd = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }, 100);
  };

  // Reload thread when screen gains focus (e.g., returning from a one-to-one compose)
  useFocusEffect(
    useCallback(() => {
      loadThread().then(scrollToEnd);
      markThreadAsRead();
    }, [loadThread, markThreadAsRead]),
  );

  // ── Participants: sender + recipients across every row, minus nobody ──
  const rootMessage = useMemo(
    () => messages.find((m) => m.id === threadId) || messages[0] || null,
    [messages, threadId],
  );
  const participantIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (id: string) => {
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    messages.forEach((m) => {
      push(m.sender_id);
      m.recipient_ids.forEach(push);
    });
    return out;
  }, [messages]);

  const participants = useMemo<ThreadParticipant[]>(
    () =>
      participantIds.map((id) => ({
        ...personOf(id, id === user?.id ? user?.name : null),
        titles: titlesOf(byId.get(id)),
        isRoot: rootMessage?.sender_id === id,
        isMe: id === user?.id,
      })),
    [participantIds, personOf, byId, rootMessage?.sender_id, user?.id, user?.name],
  );
  const others = useMemo(() => participants.filter((p) => !p.isMe), [participants]);
  const replyRecipientIds = useMemo(() => others.map((p) => p.id), [others]);

  const stripLabel = useMemo(() => {
    const names = others.slice(0, 3).map((p) => firstNameOf(p.name) || p.name).filter(Boolean);
    const extra = others.length - names.length;
    const joined = extra > 0 ? `${names.join(', ')} +${extra}` : names.join(', ');
    return t('participants_and_you', { names: joined });
  }, [others, t]);

  const rootSenderFirst = rootMessage ? firstNameOf(nameOf(rootMessage.sender_id, user?.id === rootMessage.sender_id ? user?.name : null)) : '';
  const headerTitle = rootMessage?.subject || (rootMessage ? nameOf(rootMessage.sender_id, user?.name) : t('title'));
  const headerEyebrow = rootMessage ? t('people_started_by', { count: participantIds.length, name: rootSenderFirst }) : undefined;

  const [savingImage, setSavingImage] = useState(false);

  // Session-49: save a message image from the full-screen viewer — same
  // download→share-sheet pattern as guides (iOS sheet includes "Save Image").
  // resolveForOpen keeps this working after the private-bucket flip.
  const handleSaveImage = async (url: string) => {
    if (savingImage) return;
    try {
      setSavingImage(true);
      const downloadUrl = await resolveForOpen(url, { tier: 'file' });
      const base = url.split('?')[0];
      const rawName = base.substring(base.lastIndexOf('/') + 1);
      const fileName = rawName || `image_${Date.now()}.jpg`;
      const downloadsDir = `${FileSystem.cacheDirectory}downloads/`;
      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      }
      const destinationUri = `${downloadsDir}${Date.now()}_${fileName}`;
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, destinationUri);
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }
      const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'jpg';
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: imageContentTypeForExt(ext),
          dialogTitle: `Save ${fileName}`,
        });
      }
    } catch (err) {
      console.error('Error saving image:', err);
      Alert.alert('Error', 'Could not save the image');
    } finally {
      setSavingImage(false);
    }
  };

  const openFile = async (fileUrl: string) => {
    try {
      await WebBrowser.openBrowserAsync(await resolveForOpen(fileUrl, { tier: 'file' }));
    } catch (err) {
      console.error('Error opening file:', err);
      Alert.alert('Error', 'Could not open the file');
    }
  };

  const handleDelete = () => {
    if (!user?.id) return;
    const actorId = user.id;
    // Check if user is the sender of the original message
    const originalMessage = messages.find((m) => m.id === messageId || m.id === threadId);
    const isSender = originalMessage?.sender_id === user?.id;

    Alert.alert(
      t('delete_title'),
      isSender ? t('delete_sent_confirm') : t('delete_inbox_confirm'),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common:delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              if (isSender) {
                // Soft delete sent message - mark as deleted by sender
                // (whole thread, sender-scoped, expanded server-side)
                await supabase.rpc('delete_sent_thread', {
                  p_actor_id: actorId,
                  p_thread_id: threadId || messageId,
                });
              } else {
                // Soft delete the whole thread from inbox (recipient-scoped)
                await supabase.rpc('delete_received_thread', {
                  p_actor_id: actorId,
                  p_thread_ids: [threadId || messageId],
                });
              }

              Alert.alert(t('common:success', { defaultValue: 'Success' }), t('message_deleted'), [
                { text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_delete'));
            }
          },
        },
      ],
    );
  };

  // ── Inline reply: send_message threaded on the ROOT, to everyone but me ──
  const hasReplyContent = !!(reply.trim() || replyImageUri || replyFileUri);

  const handleReply = async () => {
    if (!user?.id || !rootMessage) return;
    const actorId = user.id;
    if (replyRecipientIds.length === 0) return;
    if (!hasReplyContent) return;

    try {
      setSending(true);

      let imageUrl: string | null = null;
      if (replyImageUri) {
        imageUrl = await uploadMessageImage(replyImageUri, actorId);
        if (!imageUrl) {
          Alert.alert(
            t('common:error', { defaultValue: 'Error' }),
            t('compose:upload_failed', { defaultValue: 'Failed to upload image' }),
          );
          setSending(false);
          return;
        }
      }

      let fileUrl: string | null = null;
      const fileName: string | null = replyFileName;
      if (replyFileUri && replyFileName) {
        fileUrl = await uploadMessageFile(replyFileUri, replyFileName, actorId);
        if (!fileUrl) {
          Alert.alert(
            t('common:error', { defaultValue: 'Error' }),
            t('compose:file_upload_failed', { defaultValue: 'Failed to upload file' }),
          );
          setSending(false);
          return;
        }
      }

      const rootSubject = rootMessage.subject || '';
      const subject = rootSubject ? (rootSubject.startsWith('Re: ') ? rootSubject : `Re: ${rootSubject}`) : null;

      const { data: newMessageId, error: messageError } = await supabase.rpc('send_message', {
        p_actor_id: actorId,
        p_recipient_ids: replyRecipientIds,
        p_subject: subject,
        p_body: reply.trim() || '',
        p_image_url: imageUrl,
        p_file_url: fileUrl,
        p_file_name: fileName,
        p_reply_to_message_id: rootMessage.id,
      });

      if (messageError) throw messageError;

      // Push to the recipients (same payload as compose; never blocks the send)
      try {
        const msgTitle = bothLanguages('notifications.new_message_title');
        const subj = subject || '';
        const attachSuffix = `${imageUrl ? ' 📷' : ''}${fileUrl ? ' 📎' : ''}`;
        const noSubjKey = imageUrl
          ? 'notifications.sent_you_photo'
          : fileUrl ? 'notifications.sent_you_file' : 'notifications.sent_you_message';
        await sendNotification({
          userIds: replyRecipientIds,
          notificationType: 'message',
          title: msgTitle.en,
          body: subj
            ? `${user?.name}: ${subj}${attachSuffix}`
            : i18n.t(noSubjKey, { lng: 'en', name: user?.name }),
          title_es: msgTitle.es,
          body_es: subj ? undefined : i18n.t(noSubjKey, { lng: 'es', name: user?.name }),
          data: {
            messageId: newMessageId,
            senderId: user?.id,
            senderName: user?.name,
          },
        });
      } catch (notificationError) {
        console.error('Failed to send push notification:', notificationError);
      }

      setReply('');
      setReplyImageUri(null);
      setReplyFileUri(null);
      setReplyFileName(null);
      setReplyFileSize(null);
      await loadThread();
      scrollToEnd();
      refreshAllUnreadCounts();
    } catch (error) {
      console.error('Error sending reply:', error);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_send'));
    } finally {
      setSending(false);
    }
  };

  // ── Formatting ──
  const formatStamp = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const dividerLabel = (iso: string) => {
    const bucket = dateBucketOf(iso);
    if (bucket === 'today') return t('today');
    if (bucket === 'yesterday') return t('yesterday');
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const deleteChip = (
    <TouchableOpacity
      onPress={handleDelete}
      hitSlop={8}
      style={[styles.headerChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
    >
      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={msgHue('delete', isDark)} />
    </TouchableOpacity>
  );

  if (loading && messages.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('title')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary || colors.highlight} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={headerTitle} eyebrow={headerEyebrow} right={deleteChip} rightWide />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The composer is absolute inside THIS view (not the KAV) — see compose-message. */}
        <View style={styles.flex}>
          {/* Pinned under the ScreenHeader (Steve's round): the strip stays reachable while the
              thread scrolls, so "who's in this" and the one-to-one Message buttons are one tap away. */}
          {participants.length > 0 && (
            <View style={styles.stripWrap}>
              <ParticipantsStrip
                people={participants}
                label={stripLabel}
                eyebrow={t('replies_reach_everyone')}
                onPress={() => setParticipantsOpen(true)}
              />
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            <View style={styles.thread}>
              {messages.map((message, index) => {
                const isMe = message.is_current_user;
                const prev = index > 0 ? messages[index - 1] : null;
                const next = index < messages.length - 1 ? messages[index + 1] : null;
                const newDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);
                const sameSenderAsPrev = !!prev && !newDay && prev.sender_id === message.sender_id;
                const endOfRun =
                  !next ||
                  next.sender_id !== message.sender_id ||
                  new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > STAMP_GAP_MS ||
                  dayKey(next.created_at) !== dayKey(message.created_at);
                const sender = personOf(message.sender_id);
                const senderName = nameOf(message.sender_id, isMe ? user?.name : null) || t('you');

                // A row can carry text, a photo and a file at once — each is its own bubble.
                const parts: ('text' | 'photo' | 'file')[] = [];
                if (message.body) parts.push('text');
                if (message.image_url) parts.push('photo');
                if (message.file_url && message.file_name) parts.push('file');
                if (parts.length === 0) parts.push('text');

                return (
                  <React.Fragment key={message.id}>
                    {newDay && <DateDivider label={dividerLabel(message.created_at)} />}
                    {!isMe && !sameSenderAsPrev && <SenderLine name={senderName} />}
                    {parts.map((kind, pi) => {
                      const first = pi === 0 && !sameSenderAsPrev;
                      const last = pi === parts.length - 1;
                      return (
                        <Bubble
                          key={`${message.id}:${kind}`}
                          mine={isMe}
                          kind={kind}
                          text={message.body}
                          imageUrl={message.image_url}
                          fileName={message.file_name}
                          fileHint={t('tap_to_open')}
                          onPress={
                            kind === 'photo'
                              ? () => setViewingImageUrl(message.image_url)
                              : kind === 'file'
                                ? () => openFile(message.file_url!)
                                : undefined
                          }
                          avatar={first ? sender : null}
                          onAvatarPress={() => openMiniProfile(message.sender_id)}
                          stamp={last && endOfRun ? formatStamp(message.created_at) : null}
                        />
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </View>
          </ScrollView>

          <Composer
            value={reply}
            onChangeText={setReply}
            placeholder={t('reply_placeholder')}
            canSend={hasReplyContent && replyRecipientIds.length > 0}
            sending={sending}
            onSend={handleReply}
            onPlus={() => setAttachOpen(true)}
            attachments={
              replyImageUri || replyFileName ? (
                <AttachmentStrip
                  imageUri={replyImageUri}
                  onRemoveImage={() => setReplyImageUri(null)}
                  fileName={replyFileName}
                  fileSize={replyFileSize}
                  onRemoveFile={() => {
                    setReplyFileUri(null);
                    setReplyFileName(null);
                    setReplyFileSize(null);
                  }}
                />
              ) : undefined
            }
          />
        </View>
      </KeyboardAvoidingView>

      <ParticipantsSheet
        visible={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        participants={participants}
      />

      <AttachMenu
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        allowFiles={canAttachFiles}
        onImage={(uri) => setReplyImageUri(uri)}
        onFile={(uri, name, size) => {
          setReplyFileUri(uri);
          setReplyFileName(name);
          setReplyFileSize(size);
        }}
      />

      {/* Full-screen Image Viewer Modal */}
      <Modal
        visible={!!viewingImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImageUrl(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewingImageUrl(null)}>
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={32} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.imageViewerSave}
            onPress={() => viewingImageUrl && handleSaveImage(viewingImageUrl)}
            disabled={savingImage}
          >
            {savingImage ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <IconSymbol ios_icon_name="arrow.down.circle.fill" android_material_icon_name="download" size={32} color="#FFFFFF" />
            )}
          </TouchableOpacity>
          {viewingImageUrl && (
            <StorageImage source={{ uri: viewingImageUrl }} style={styles.imageViewerImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 90,
    gap: 12,
  },
  thread: { gap: 0 },
  // Full-screen image viewer
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: { position: 'absolute', top: 60, right: 20, zIndex: 10, padding: 8 },
  imageViewerSave: { position: 'absolute', top: 60, left: 20, zIndex: 10, padding: 8 },
  imageViewerImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.7,
  },
});
