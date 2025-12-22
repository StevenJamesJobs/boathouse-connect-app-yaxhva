
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface MessageThread {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_job_title: string;
  sender_profile_picture: string | null;
  subject: string | null;
  body: string;
  created_at: string;
  is_current_user: boolean;
}

export default function MessageDetailScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const messageId = params.messageId as string;
  const threadId = params.threadId as string;
  
  const [messages, setMessages] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [allRecipientIds, setAllRecipientIds] = useState<string[]>([]);

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  useEffect(() => {
    loadThread();
    markAsRead();
  }, []);

  const loadThread = async () => {
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

      // Load all recipients of the original message for Reply All
      const { data: recipients, error: recipientsError } = await supabase
        .from('message_recipients')
        .select('recipient_id')
        .eq('message_id', messageId);

      if (recipientsError) throw recipientsError;

      // Store all recipient IDs including the sender for Reply All
      const recipientIds = recipients?.map(r => r.recipient_id) || [];
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
        created_at: msg.created_at,
        is_current_user: msg.sender_id === user?.id,
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading thread:', error);
      Alert.alert('Error', 'Failed to load message');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user?.id) return;

    try {
      await supabase
        .from('message_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('message_id', messageId);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

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
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message from your inbox?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('message_recipients')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .eq('recipient_id', user?.id)
                .eq('message_id', messageId);

              Alert.alert('Success', 'Message deleted', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message');
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
              android_material_icon_name="arrow_back"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Message</Text>
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
            android_material_icon_name="arrow_back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Message</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <IconSymbol
            ios_icon_name="trash"
            android_material_icon_name="delete"
            size={24}
            color="#E74C3C"
          />
        </TouchableOpacity>
      </View>

      {/* Messages Thread */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {messages.map((message, index) => (
          <View key={index} style={styles.messageContainer}>
            <View 
              style={[
                styles.messageCard, 
                { 
                  backgroundColor: message.is_current_user 
                    ? (user?.role === 'manager' ? '#4A5F7A' : '#A8D5E2')
                    : colors.card 
                }
              ]}
            >
              <View style={styles.messageHeader}>
                {/* Profile Picture */}
                <View style={styles.profilePictureContainer}>
                  {message.sender_profile_picture ? (
                    <Image
                      source={{ uri: message.sender_profile_picture }}
                      style={styles.profilePicture}
                    />
                  ) : (
                    <View style={[styles.profilePicturePlaceholder, { backgroundColor: colors.highlight }]}>
                      <Text style={[styles.profilePicturePlaceholderText, { color: colors.text }]}>
                        {message.sender_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.senderInfo}>
                  <Text style={[styles.senderName, { color: message.is_current_user ? '#FFFFFF' : colors.text }]}>
                    {message.is_current_user ? 'You' : message.sender_name}
                  </Text>
                  <Text style={[styles.senderJobTitle, { color: message.is_current_user ? 'rgba(255, 255, 255, 0.8)' : colors.textSecondary }]}>
                    {message.sender_job_title}
                  </Text>
                </View>
                <Text style={[styles.messageDate, { color: message.is_current_user ? 'rgba(255, 255, 255, 0.8)' : colors.textSecondary }]}>
                  {formatDateTime(message.created_at)}
                </Text>
              </View>
              
              {index === 0 && message.subject && (
                <Text style={[styles.messageSubject, { color: message.is_current_user ? '#FFFFFF' : colors.text }]}>
                  {message.subject}
                </Text>
              )}
              
              <Text style={[styles.messageBody, { color: message.is_current_user ? '#FFFFFF' : colors.text }]}>
                {message.body}
              </Text>
            </View>

            {index < messages.length - 1 && (
              <View style={styles.threadConnector}>
                <View style={[styles.threadLine, { backgroundColor: colors.border }]} />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Reply Section */}
      <View style={[styles.replyButtonContainer, { backgroundColor: colors.card }]}>
        <View style={styles.replyButtonRow}>
          <TouchableOpacity
            style={[styles.replyButton, { backgroundColor: colors.primary || colors.highlight }]}
            onPress={handleReply}
          >
            <IconSymbol
              ios_icon_name="arrowshape.turn.up.left.fill"
              android_material_icon_name="reply"
              size={20}
              color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
            />
            <Text style={[styles.replyButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
              Reply
            </Text>
          </TouchableOpacity>
          
          {allRecipientIds.length > 1 && (
            <TouchableOpacity
              style={[styles.replyAllButton, { backgroundColor: colors.highlight, opacity: 0.9 }]}
              onPress={handleReplyAll}
            >
              <IconSymbol
                ios_icon_name="arrowshape.turn.up.left.2.fill"
                android_material_icon_name="reply_all"
                size={20}
                color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
              />
              <Text style={[styles.replyButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
                Reply All
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  deleteButton: {
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
    padding: 16,
    paddingBottom: 100,
  },
  messageContainer: {
    marginBottom: 8,
  },
  messageCard: {
    padding: 16,
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  profilePictureContainer: {
    width: 40,
    height: 40,
  },
  profilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profilePicturePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicturePlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  senderInfo: {
    flex: 1,
  },
  senderName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  senderJobTitle: {
    fontSize: 13,
  },
  messageDate: {
    fontSize: 12,
  },
  messageSubject: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  threadConnector: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  threadLine: {
    width: 2,
    height: 20,
  },
  replyButtonContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  replyButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  replyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  replyAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  replyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  replyInputContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  replyInput: {
    fontSize: 15,
    minHeight: 80,
    maxHeight: 120,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  replyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelReplyButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelReplyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sendReplyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  sendReplyText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
