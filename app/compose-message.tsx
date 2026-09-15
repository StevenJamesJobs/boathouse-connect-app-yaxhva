import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { useNotification } from '@/contexts/NotificationContext';
import { bothLanguages } from '@/utils/notificationHelpers';
import i18n from '@/i18n';
import { uploadMessageImage } from '@/utils/messageImages';
import { uploadMessageFile } from '@/utils/messageFiles';
import { isManagerOrOwner } from '@/utils/roles';
import { fonts } from '@/constants/fonts';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import { FieldLabel, GlassTextInput } from '@/components/content/FormKit';
import Composer, { AttachmentStrip } from '@/components/messages/Composer';
import AttachMenu from '@/components/messages/AttachMenu';
import RecipientChips, {
  EMPTY_SELECTION,
  recipientIdsOf,
  type RecipientSelection,
} from '@/components/messages/RecipientChips';
import RecipientsSheet, { type RecipientGroupDef } from '@/components/messages/RecipientsSheet';
import { useThreadPeople } from '@/components/messages/useThreadPeople';

// The pre-glass picker listed these titles first, in this order; the rest follow alphabetically.
const STANDARD_JOB_TITLES = ['Banquets', 'Bartender', 'Busser', 'Chef', 'Host', 'Kitchen', 'Manager', 'Runner', 'Server'];

export default function ComposeMessageScreen() {
  const { t } = useTranslation('compose');
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const router = useRouter();
  const params = useLocalSearchParams();
  const colors = useThemeColors();

  // Reply / Reply All parameters (still accepted from any caller that pushes them)
  const replyToMessageId = params.replyToMessageId as string;
  const replyToSenderId = params.replyToSenderId as string;
  const replyAllRecipientIds = params.replyAllRecipientIds as string;
  const replySubject = params.replySubject as string;
  const isReplyAll = params.isReplyAll === 'true';

  // Direct-message deep link (mini-profile card / participants sheet "Message"):
  // pre-select this recipient and skip the picker.
  const directRecipientId = params.recipientId as string;
  const directRecipientName = params.recipientName as string | undefined;

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selection, setSelection] = useState<RecipientSelection>(EMPTY_SELECTION);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);

  const { rows, byId, loaded, personOf } = useThreadPeople(user?.id);
  const canAttachFiles = isManagerOrOwner(user);

  // Active members minus self, by name — the sheet's people list.
  const directory = useMemo(
    () =>
      rows
        .filter((r) => r.is_active)
        .filter((r) => r.id !== (user?.id || ''))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [rows, user?.id],
  );

  // Quick-select groups: All staff · Managers · one per job title present.
  const groupDefs = useMemo<RecipientGroupDef[]>(() => {
    const defs: RecipientGroupDef[] = [];
    if (directory.length > 0) {
      defs.push({ key: 'all', title: t('all_staff'), memberIds: directory.map((u) => u.id), icon: true });
    }
    const managers = directory.filter((u) => u.role === 'manager' || u.role === 'owner');
    if (managers.length > 0) {
      defs.push({ key: 'managers', title: t('managers'), memberIds: managers.map((u) => u.id) });
    }
    const byTitle = new Map<string, string[]>();
    directory.forEach((u) => {
      const titles =
        u.job_titles && Array.isArray(u.job_titles) && u.job_titles.length > 0
          ? u.job_titles
          : u.job_title
            ? [u.job_title]
            : [];
      titles.forEach((title) => {
        if (!byTitle.has(title)) byTitle.set(title, []);
        byTitle.get(title)!.push(u.id);
      });
    });
    const ordered = [
      ...STANDARD_JOB_TITLES.filter((x) => byTitle.has(x)),
      ...Array.from(byTitle.keys()).filter((x) => !STANDARD_JOB_TITLES.includes(x)).sort(),
    ];
    ordered.forEach((title) => {
      defs.push({ key: `title:${title}`, title, memberIds: byTitle.get(title)! });
    });
    return defs;
  }, [directory, t]);

  // Reply prefill: "Re: " subject + the sender (Reply) or everyone (Reply All).
  const replySeeded = useRef(false);
  useEffect(() => {
    if (!replyToMessageId || !replyToSenderId) return;
    if (replySubject) {
      setSubject((prev) => prev || (replySubject.startsWith('Re: ') ? replySubject : `Re: ${replySubject}`));
    }
    if (!loaded || replySeeded.current) return;
    replySeeded.current = true;
    const me = user?.id;
    if (isReplyAll && replyAllRecipientIds) {
      const ids = replyAllRecipientIds.split(',').filter((id) => id && id !== me && byId.has(id));
      setSelection((prev) => ({ ...prev, people: Array.from(new Set([...prev.people, ...ids])) }));
    } else if (byId.has(replyToSenderId)) {
      setSelection((prev) => ({ ...prev, people: Array.from(new Set([...prev.people, replyToSenderId])) }));
    }
  }, [replyToMessageId, replyToSenderId, replySubject, isReplyAll, replyAllRecipientIds, loaded, byId, user?.id]);

  // Direct message: pre-select the target recipient from the deep link.
  const directSeeded = useRef(false);
  useEffect(() => {
    if (!directRecipientId || replyToMessageId || directSeeded.current) return;
    if (directRecipientId === user?.id) return;
    directSeeded.current = true;
    setSelection((prev) => ({ ...prev, people: Array.from(new Set([...prev.people, directRecipientId])) }));
  }, [directRecipientId, replyToMessageId, user?.id]);

  const personFor = useCallback(
    (id: string) => personOf(id, id === directRecipientId ? directRecipientName : null),
    [personOf, directRecipientId, directRecipientName],
  );

  const recipientIds = useMemo(() => recipientIdsOf(selection), [selection]);
  const hasContent = !!(body.trim() || selectedImageUri || selectedFileUri);

  const handleSend = async () => {
    if (!user?.id) return;
    const actorId = user.id;
    if (recipientIds.length === 0) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_no_recipients'));
      return;
    }

    if (!body.trim() && !selectedImageUri && !selectedFileUri) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_no_message'));
      return;
    }

    try {
      setSending(true);

      // Upload image if selected
      let imageUrl: string | null = null;
      if (selectedImageUri) {
        setUploading(true);
        imageUrl = await uploadMessageImage(selectedImageUri, actorId);
        setUploading(false);
        if (!imageUrl) {
          Alert.alert(
            t('common:error', { defaultValue: 'Error' }),
            t('upload_failed', { defaultValue: 'Failed to upload image' }),
          );
          setSending(false);
          return;
        }
      }

      // Upload file if selected
      let fileUrl: string | null = null;
      const fileName: string | null = selectedFileName;
      if (selectedFileUri && selectedFileName) {
        setUploading(true);
        fileUrl = await uploadMessageFile(selectedFileUri, selectedFileName, actorId);
        setUploading(false);
        if (!fileUrl) {
          Alert.alert(
            t('common:error', { defaultValue: 'Error' }),
            t('file_upload_failed', { defaultValue: 'Failed to upload file' }),
          );
          setSending(false);
          return;
        }
      }

      // Create the message (reply threading is resolved server-side; the
      // recipient fan-out happens in the same transaction)
      const { data: newMessageId, error: messageError } = await supabase.rpc('send_message', {
        p_actor_id: actorId,
        p_recipient_ids: recipientIds,
        p_subject: subject.trim() || null,
        p_body: body.trim() || '',
        p_image_url: imageUrl,
        p_file_url: fileUrl,
        p_file_name: fileName,
        p_reply_to_message_id: replyToMessageId || null,
      });

      if (messageError) throw messageError;

      // Send push notification to recipients (don't block on failure)
      try {
        // Subject bodies are sender-typed (language-neutral) — same for
        // everyone; the no-subject scaffold is prose, so both copies ride.
        const msgTitle = bothLanguages('notifications.new_message_title');
        const subj = subject.trim();
        const attachSuffix = `${imageUrl ? ' 📷' : ''}${fileUrl ? ' 📎' : ''}`;
        const noSubjKey = imageUrl
          ? 'notifications.sent_you_photo'
          : fileUrl ? 'notifications.sent_you_file' : 'notifications.sent_you_message';
        await sendNotification({
          userIds: recipientIds,
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
        // Silent fail - don't block message sending
        console.error('Failed to send push notification:', notificationError);
      }

      Alert.alert(t('common:success', { defaultValue: 'Success' }), t('message_sent'), [
        { text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_send'));
    } finally {
      setUploading(false);
      setSending(false);
    }
  };

  const title = replyToMessageId ? (isReplyAll ? t('reply_all') : t('reply')) : t('new_message');
  const hasAttachments = !!(selectedImageUri || selectedFileName);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={title} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The composer is absolute inside THIS view (not the KAV): Yoga places
            absolute children against the border box, so the KAV's keyboard
            padding alone would never lift it — this view's height shrinks instead. */}
        <View style={styles.flex}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* To */}
            <RecipientChips
              selection={selection}
              personOf={personFor}
              onChange={setSelection}
              onAdd={() => setRecipientsOpen(true)}
            />

            {/* Subject */}
            <View>
              <FieldLabel label={t('subject_label')} trailing={t('optional')} />
              <GlassTextInput
                value={subject}
                onChangeText={setSubject}
                placeholder={t('subject_placeholder')}
                returnKeyType="done"
              />
            </View>

            {/* Draft area — attachment previews live here before sending */}
            <GlassCard variant="glass" radius={16} style={styles.draft}>
              <Text style={[styles.draftEyebrow, { color: colors.tint }]}>
                {uploading
                  ? t('uploading', { defaultValue: 'Uploading...' })
                  : t('draft_recipients', { count: recipientIds.length })}
              </Text>
              {hasAttachments ? (
                <AttachmentStrip
                  imageUri={selectedImageUri}
                  onRemoveImage={() => setSelectedImageUri(null)}
                  fileName={selectedFileName}
                  fileSize={selectedFileSize}
                  onRemoveFile={() => {
                    setSelectedFileUri(null);
                    setSelectedFileName(null);
                    setSelectedFileSize(null);
                  }}
                />
              ) : (
                <Text style={[styles.draftHint, { color: colors.textSecondary }]}>{t('draft_hint')}</Text>
              )}
            </GlassCard>
          </ScrollView>

          <Composer
            value={body}
            onChangeText={setBody}
            placeholder={t('message_placeholder')}
            canSend={hasContent}
            sending={sending}
            onSend={handleSend}
            onPlus={() => setAttachOpen(true)}
          />
        </View>
      </KeyboardAvoidingView>

      <RecipientsSheet
        visible={recipientsOpen}
        onClose={() => setRecipientsOpen(false)}
        people={directory}
        groups={groupDefs}
        initial={selection}
        onDone={(next) => {
          setSelection(next);
          setRecipientsOpen(false);
        }}
      />

      <AttachMenu
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        allowFiles={canAttachFiles}
        onImage={(uri) => setSelectedImageUri(uri)}
        onFile={(uri, name, size) => {
          setSelectedFileUri(uri);
          setSelectedFileName(name);
          setSelectedFileSize(size);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 220,
    gap: 12,
  },
  draft: { padding: 12, minHeight: 150, gap: 8 },
  // The draft card is tall while it waits for an attachment — its two lines read bigger
  // than the field eyebrows so they don't get lost in the space (Steve's round).
  draftEyebrow: { fontFamily: fonts.mono.semibold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  draftHint: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 19 },
  eyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
});
