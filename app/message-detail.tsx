
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { refreshAllUnreadCounts } from '@/hooks/useUnreadMessages';

interface MessageThread {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_job_title: string;
  sender_profile_picture: string | null;
  subject: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
  is_current_user: boolean;
  recipient_names?: string[];
}

export default function MessageDetailScreen() {
  const { t } = useTranslation('message_detail');
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const messageId = params.messageId as string;
  const threadId = params.threadId as string;
  
  const [messages, setMessages] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [allRecipientIds, setAllRecipientIds] = useState<string[]>([]);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const loadThread = useCallback(async () => {
    try {
      setLoading(true);

      // Load the main message first
      const { data: mainMessage, error: mainError } = await supabase
        .from('messages')
        .select(`
          id,
          sender_id,
          subject,
          body,
          image_url,
          created_at,
          sender:users!messages_sender_id_fkey (
            name,
            job_title,
            profile_picture_url
          )
        `)
        .eq('id', messageId)
        .single();

      if (mainError) throw mainError;

      // Load all recipients of the original message
      const { data: recipients, error: recipientsError } = await supabase
        .from('message_recipients')
        .select(`
          recipient_id,
          recipient:users (
            name
          )
        `)
        .eq('message_id', messageId);

      if (recipientsError) throw recipientsError;

      // Store all recipient IDs and names
      const recipientIds = recipients?.map(r => r.recipient_id) || [];
      const recipientNames = recipients?.map(r => r.recipient?.name).filter(Boolean) || [];
      const allIds = [mainMessage.sender_id, ...recipientIds].filter(id => id !== user?.id);
      setAllRecipientIds(allIds);

      // Load all messages in the thread
      const { data: threadMessages, error: threadError } = await supabase
        .from('messages')
        .select(`
          id,
          sender_id,
          subject,
          body,
          image_url,
          created_at,
          sender:users!messages_sender_id_fkey (
            name,
            job_title,
            profile_picture_url
          )
        `)
        .or(`id.eq.${messageId},thread_id.eq.${threadId}`)
        .order('created_at', { ascending: true });

      if (threadError) throw threadError;

      const formattedMessages: MessageThread[] = (threadMessages || [mainMessage]).map((msg: any) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: msg.sender?.name || 'Unknown',
        sender_job_title: msg.sender?.job_title || '',
        sender_profile_picture: msg.sender?.profile_picture_url || null,
        subject: msg.subject,
        body: msg.body,
        image_url: msg.image_url || null,
        created_at: msg.created_at,
        is_current_user: msg.sender_id === user?.id,
        recipient_names: msg.id === messageId ? recipientNames : undefined,
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
      console.log('Marking entire thread as read for user:', user.id, 'thread:', threadId);
      
      // Get all message IDs in this thread
      const { data: threadMessages, error: threadError } = await supabase
        .from('messages')
        .select('id')
        .or(`id.eq.${messageId},thread_id.eq.${threadId}`);

      if (threadError) {
        console.error('Error fetching thread messages:', threadError);
        throw threadError;
      }

      const messageIds = threadMessages?.map(m => m.id) || [messageId];
      console.log('Message IDs to mark as read:', messageIds);

      // Mark all messages in the thread as read for this user
      const { error: updateError } = await supabase
        .from('message_recipients')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('recipient_id', user.id)
        .in('message_id', messageIds);

      if (updateError) {
        console.error('Error marking thread as read:', updateError);
        throw updateError;
      }

      console.log('Successfully marked thread as read');
      // Immediately refresh all badge counts across the app
      refreshAllUnreadCounts();
    } catch (error) {
      console.error('Error in markThreadAsRead:', error);
    }
  }, [messageId, threadId, user?.id]);

  // Reload thread when screen gains focus (e.g., returning from compose reply)
  useFocusEffect(
    useCallback(() => {
      loadThread().then(() => {
        // Auto-scroll to bottom after loading to show latest messages
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: false });
        }, 100);
      });
      markThreadAsRead();
    }, [loadThread, markThreadAsRead])
  );

  const handleReply = () => {
    const originalMessage = messages[0];
    router.push({
      pathname: '/compose-message',
      params: {
        replyToMessageId: messageId,
        replyToSenderId: originalMessage.sender_id,
        replySubject: originalMessage.subject || '',
        isReplyAll: 'false',
      },
    });
  };

  const handleReplyAll = () => {
    const originalMessage = messages[0];
    router.push({
      pathname: '/compose-message',
      params: {
        replyToMessageId: messageId,
        replyToSenderId: originalMessage.sender_id,
        replyAllRecipientIds: allRecipientIds.join(','),
        replySubject: originalMessage.subject || '',
        isReplyAll: 'true',
      },
    });
  };

  const handleDelete = () => {
    // Check if user is the sender of the original message
    const originalMessage = messages.find(m => m.id === messageId || m.id === threadId);
    const isSender = originalMessage?.sender_id === user?.id;

    Alert.alert(
      t('delete_title'),
      isSender
        ? t('delete_sent_confirm')
        : t('delete_inbox_confirm'),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common:delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              if (isSender) {
                // Soft delete sent message - mark as deleted by sender
                const deleteThreadId = threadId || messageId;
                await supabase
                  .from('messages')
                  .update({ deleted_by_sender: true })
                  .eq('sender_id', user?.id)
                  .or(`id.eq.${deleteThreadId},thread_id.eq.${deleteThreadId}`);
              } else {
                // Soft delete from inbox
                await supabase
                  .from('message_recipients')
                  .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                  .eq('recipient_id', user?.id)
                  .eq('message_id', messageId);
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
      ]
    );
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="chevron-left"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('title')}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary || colors.highlight} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Message</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleReply} style={styles.headerActionButton}>
            <IconSymbol
              ios_icon_name="arrowshape.turn.up.left.fill"
              android_material_icon_name="reply"
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerActionButton}>
            <IconSymbol
              ios_icon_name="trash"
              android_material_icon_name="delete"
              size={22}
              color="#E74C3C"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Thread — iMessage-style bubbles */}
      <ScrollView ref={scrollViewRef} style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Subject header card — shown once at top */}
        {messages.length > 0 && messages[0].subject && (
          <View style={[styles.subjectCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.subjectText, { color: colors.text }]}>
              {messages[0].subject}
            </Text>
            {messages[0].recipient_names && messages[0].recipient_names.length > 0 && (
              <Text style={[styles.subjectRecipients, { color: colors.textSecondary }]}>
                {t('to', { names: messages[0].recipient_names.join(', ') })}
              </Text>
            )}
          </View>
        )}

        {messages.map((message, index) => {
          const isMe = message.is_current_user;
          const showSenderInfo = !isMe || (messages.length > 2);
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const sameSenderAsPrev = prevMessage && prevMessage.sender_id === message.sender_id;

          return (
            <View
              key={index}
              style={[
                styles.bubbleRow,
                isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
                sameSenderAsPrev ? styles.bubbleRowGrouped : styles.bubbleRowSpaced,
              ]}
            >
              {/* Small profile pic for other users (hidden if same sender consecutive) */}
              {!isMe && (
                <View style={styles.bubbleAvatarContainer}>
                  {!sameSenderAsPrev ? (
                    message.sender_profile_picture ? (
                      <Image source={{ uri: message.sender_profile_picture }} style={styles.bubbleAvatar} />
                    ) : (
                      <View style={[styles.bubbleAvatarPlaceholder, { backgroundColor: colors.highlight }]}>
                        <Text style={[styles.bubbleAvatarText, { color: colors.text }]}>
                          {message.sender_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )
                  ) : (
                    <View style={styles.bubbleAvatarSpacer} />
                  )}
                </View>
              )}

              <View style={[styles.bubbleContent, isMe ? styles.bubbleContentRight : styles.bubbleContentLeft]}>
                {/* Sender name for group chats or other users — only if not consecutive */}
                {!isMe && !sameSenderAsPrev && (
                  <Text style={[styles.bubbleSenderName, { color: colors.textSecondary }]}>
                    {message.sender_name}
                  </Text>
                )}

                <View
                  style={[
                    styles.bubble,
                    isMe
                      ? [styles.bubbleRight, { backgroundColor: '#1976D2' }]
                      : [styles.bubbleLeft, { backgroundColor: colors.card }],
                    message.image_url ? styles.bubbleWithImage : null,
                  ]}
                >
                  {message.image_url && (
                    <TouchableOpacity
                      onPress={() => setViewingImageUrl(message.image_url)}
                      activeOpacity={0.9}
                    >
                      <Image
                        source={{ uri: message.image_url }}
                        style={styles.bubbleImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  )}
                  {message.body ? (
                    <Text style={[
                      styles.bubbleText,
                      { color: isMe ? '#FFFFFF' : colors.text },
                      message.image_url ? styles.bubbleTextWithImage : null,
                    ]}>
                      {message.body}
                    </Text>
                  ) : null}
                </View>

                <Text
                  style={[
                    styles.bubbleTime,
                    { color: colors.textSecondary },
                    isMe ? styles.bubbleTimeRight : styles.bubbleTimeLeft,
                  ]}
                >
                  {formatDateTime(message.created_at)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Reply Section — compact with safe area padding for Android dock bar */}
      <View style={[styles.replyButtonContainer, { backgroundColor: colors.card, paddingBottom: Math.max(12, insets.bottom + 4) }]}>
        <View style={styles.replyButtonRow}>
          <TouchableOpacity
            style={[styles.replyButton, { backgroundColor: colors.primary || colors.highlight }]}
            onPress={handleReply}
          >
            <IconSymbol
              ios_icon_name="arrowshape.turn.up.left.fill"
              android_material_icon_name="reply"
              size={18}
              color="#FFFFFF"
            />
            <Text style={[styles.replyButtonText, { color: '#FFFFFF' }]}>
              {t('reply')}
            </Text>
          </TouchableOpacity>

          {allRecipientIds.length > 1 && (
            <TouchableOpacity
              style={[styles.replyAllButton, { backgroundColor: colors.highlight }]}
              onPress={handleReplyAll}
            >
              <IconSymbol
                ios_icon_name="arrowshape.turn.up.left.2.fill"
                android_material_icon_name="reply-all"
                size={18}
                color={colors.text}
              />
              <Text style={[styles.replyButtonText, { color: colors.text }]}>
                {t('reply_all')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* Full-screen Image Viewer Modal */}
      <Modal
        visible={!!viewingImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImageUrl(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={() => setViewingImageUrl(null)}
          >
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={32}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          {viewingImageUrl && (
            <Image
              source={{ uri: viewingImageUrl }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
  },
  // Subject header card
  subjectCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  subjectText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  subjectRecipients: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  // iMessage-style bubble layout
  bubbleRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  bubbleRowLeft: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  bubbleRowSpaced: {
    marginTop: 12,
  },
  bubbleRowGrouped: {
    marginTop: 3,
  },
  bubbleAvatarContainer: {
    width: 28,
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  bubbleAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  bubbleAvatarSpacer: {
    width: 28,
    height: 28,
  },
  bubbleContent: {
    maxWidth: '75%',
  },
  bubbleContentLeft: {
    alignItems: 'flex-start',
  },
  bubbleContentRight: {
    alignItems: 'flex-end',
  },
  bubbleSenderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 8,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.06)',
    elevation: 1,
  },
  bubbleLeft: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 2,
    marginHorizontal: 8,
  },
  bubbleTimeLeft: {
    textAlign: 'left',
  },
  bubbleTimeRight: {
    textAlign: 'right',
  },
  // Image in bubble
  bubbleWithImage: {
    padding: 0,
    overflow: 'hidden',
  },
  bubbleImage: {
    width: 220,
    height: 165,
    borderRadius: 0,
  },
  bubbleTextWithImage: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  // Full-screen image viewer
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  imageViewerImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.7,
  },
  // Reply buttons — compact
  replyButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  replyButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  replyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  replyAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  replyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
