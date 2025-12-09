
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface Message {
  id: string;
  sender_id: string;
  subject: string | null;
  body: string;
  parent_message_id: string | null;
  thread_id: string | null;
  created_at: string;
  sender_name: string;
  sender_job_title: string;
  sender_profile_picture: string | null;
  is_read: boolean;
  recipient_count: number;
  recipient_id?: string;
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadMessages();
      loadUnreadCount();
      loadInboxCount();
    }, [activeTab])
  );

  useEffect(() => {
    loadMessages();
    loadUnreadCount();
    loadInboxCount();
  }, [activeTab]);

  const loadMessages = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      if (activeTab === 'inbox') {
        await loadInboxMessages();
      } else {
        await loadSentMessages();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const loadInboxMessages = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('message_recipients')
      .select(`
        id,
        is_read,
        created_at,
        recipient_id,
        message:messages (
          id,
          sender_id,
          subject,
          body,
          parent_message_id,
          thread_id,
          created_at,
          sender:users!messages_sender_id_fkey (
            name,
            job_title,
            profile_picture_url
          )
        )
      `)
      .eq('recipient_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading inbox:', error);
      throw error;
    }

    const messages: Message[] = (data || [])
      .filter((item: any) => item.message)
      .map((item: any) => ({
        id: item.message.id,
        sender_id: item.message.sender_id,
        subject: item.message.subject,
        body: item.message.body,
        parent_message_id: item.message.parent_message_id,
        thread_id: item.message.thread_id,
        created_at: item.message.created_at,
        sender_name: item.message.sender?.name || 'Unknown',
        sender_job_title: item.message.sender?.job_title || '',
        sender_profile_picture: item.message.sender?.profile_picture_url || null,
        is_read: item.is_read,
        recipient_count: 1,
        recipient_id: item.recipient_id,
      }));

    setInboxMessages(messages);
  };

  const loadSentMessages = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        subject,
        body,
        parent_message_id,
        thread_id,
        created_at,
        recipients:message_recipients (
          id,
          recipient:users (
            name,
            job_title
          )
        )
      `)
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading sent messages:', error);
      throw error;
    }

    const messages: Message[] = (data || []).map((msg: any) => ({
      id: msg.id,
      sender_id: msg.sender_id,
      subject: msg.subject,
      body: msg.body,
      parent_message_id: msg.parent_message_id,
      thread_id: msg.thread_id,
      created_at: msg.created_at,
      sender_name: user.name,
      sender_job_title: user.jobTitle,
      sender_profile_picture: user.profilePictureUrl || null,
      is_read: true,
      recipient_count: msg.recipients?.length || 0,
    }));

    setSentMessages(messages);
  };

  const loadUnreadCount = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase.rpc('get_unread_message_count', {
      user_id: user.id,
    });

    if (!error && data !== null) {
      setUnreadCount(data);
    }
  };

  const loadInboxCount = async () => {
    if (!user?.id) return;

    const { count, error } = await supabase
      .from('message_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_deleted', false);

    if (!error && count !== null) {
      setInboxCount(count);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    await loadUnreadCount();
    await loadInboxCount();
    setRefreshing(false);
  };

  const handleMessagePress = (message: Message) => {
    router.push({
      pathname: '/message-detail',
      params: { messageId: message.id, threadId: message.thread_id || message.id },
    });
  };

  const handleMarkAsRead = async (message: Message) => {
    if (!user?.id || activeTab !== 'inbox') return;

    try {
      await supabase
        .from('message_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('message_id', message.id);

      await loadMessages();
      await loadUnreadCount();
      Alert.alert('Success', 'Message marked as read');
    } catch (error) {
      console.error('Error marking as read:', error);
      Alert.alert('Error', 'Failed to mark message as read');
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    Alert.alert(
      'Delete Message',
      activeTab === 'inbox' 
        ? 'Are you sure you want to delete this message from your inbox?'
        : 'Are you sure you want to delete this sent message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'inbox') {
                // Delete from inbox (soft delete)
                await supabase
                  .from('message_recipients')
                  .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                  .eq('recipient_id', user?.id)
                  .eq('message_id', message.id);
              } else {
                // Delete sent message (hard delete)
                // First delete all recipients
                await supabase
                  .from('message_recipients')
                  .delete()
                  .eq('message_id', message.id);
                
                // Then delete the message
                await supabase
                  .from('messages')
                  .delete()
                  .eq('id', message.id);
              }

              await loadMessages();
              await loadUnreadCount();
              await loadInboxCount();
              Alert.alert('Success', 'Message deleted');
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getInboxWarning = () => {
    if (inboxCount >= 38) {
      return (
        <View style={[styles.warningBanner, { backgroundColor: '#E74C3C' }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.warningText}>
            Your inbox is almost full ({inboxCount}/40). Delete old messages to avoid losing new ones.
          </Text>
        </View>
      );
    }
    if (inboxCount >= 35) {
      return (
        <View style={[styles.warningBanner, { backgroundColor: '#F39C12' }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.warningText}>
            Your inbox is getting full ({inboxCount}/40). Consider deleting old messages.
          </Text>
        </View>
      );
    }
    return null;
  };

  const messages = activeTab === 'inbox' ? inboxMessages : sentMessages;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Inbox Warning */}
      {activeTab === 'inbox' && getInboxWarning()}

      {/* Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'inbox' && { borderBottomColor: colors.primary || colors.highlight },
          ]}
          onPress={() => setActiveTab('inbox')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'inbox' ? colors.text : colors.textSecondary },
            ]}
          >
            Inbox
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: '#E74C3C' }]}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'sent' && { borderBottomColor: colors.primary || colors.highlight },
          ]}
          onPress={() => setActiveTab('sent')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'sent' ? colors.text : colors.textSecondary },
            ]}
          >
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      {/* Compose Button */}
      <TouchableOpacity
        style={[styles.composeButton, { backgroundColor: colors.primary || colors.highlight }]}
        onPress={() => router.push('/compose-message')}
      >
        <IconSymbol
          ios_icon_name="plus.circle.fill"
          android_material_icon_name="add_circle"
          size={24}
          color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
        />
        <Text style={[styles.composeButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
          Send a New Message
        </Text>
      </TouchableOpacity>

      {/* Messages List */}
      <ScrollView
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary || colors.highlight} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary || colors.highlight} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading messages...
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name={activeTab === 'inbox' ? 'tray' : 'paperplane'}
              android_material_icon_name={activeTab === 'inbox' ? 'inbox' : 'send'}
              size={64}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeTab === 'inbox' ? 'No messages in your inbox' : 'No sent messages'}
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message, index) => (
              <View key={index} style={styles.messageItemWrapper}>
                <TouchableOpacity
                  style={[
                    styles.messageItem,
                    { backgroundColor: colors.card },
                    !message.is_read && activeTab === 'inbox' && styles.unreadMessage,
                  ]}
                  onPress={() => handleMessagePress(message)}
                >
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

                  {/* Message Content */}
                  <View style={styles.messageContent}>
                    <View style={styles.messageHeader}>
                      <View style={styles.messageHeaderLeft}>
                        {!message.is_read && activeTab === 'inbox' && (
                          <View style={styles.unreadDot} />
                        )}
                        <Text style={[styles.messageSender, { color: colors.text }]} numberOfLines={1}>
                          {activeTab === 'inbox' ? message.sender_name : `To: ${message.recipient_count} recipient${message.recipient_count > 1 ? 's' : ''}`}
                        </Text>
                      </View>
                      <Text style={[styles.messageDate, { color: colors.textSecondary }]}>
                        {formatDate(message.created_at)}
                      </Text>
                    </View>
                    {message.subject && (
                      <Text style={[styles.messageSubject, { color: colors.text }]} numberOfLines={1}>
                        {message.subject}
                      </Text>
                    )}
                    <Text style={[styles.messageBody, { color: colors.textSecondary }]} numberOfLines={2}>
                      {message.body}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  {activeTab === 'inbox' && !message.is_read && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#3498DB' }]}
                      onPress={() => handleMarkAsRead(message)}
                    >
                      <IconSymbol
                        ios_icon_name="checkmark.circle"
                        android_material_icon_name="check_circle"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionButtonText}>Mark as Read</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#E74C3C' }]}
                    onPress={() => handleDeleteMessage(message)}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  composeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  composeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  messageItemWrapper: {
    marginBottom: 12,
  },
  messageItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
    gap: 12,
  },
  unreadMessage: {
    borderLeftWidth: 4,
    borderLeftColor: '#3498DB',
  },
  profilePictureContainer: {
    width: 50,
    height: 50,
  },
  profilePicture: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  profilePicturePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicturePlaceholderText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3498DB',
  },
  messageSender: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  messageDate: {
    fontSize: 12,
  },
  messageSubject: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
