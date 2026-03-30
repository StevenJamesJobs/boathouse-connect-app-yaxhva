
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  Dimensions,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { refreshAllUnreadCounts } from '@/hooks/useUnreadMessages';

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
  recipient_names?: string[];
  reply_count?: number;
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  const colors = useThemeColors();
  const isManager = user?.role === 'manager';

  const loadInboxMessages = useCallback(async () => {
    if (!user?.id) return;

    // Get all messages where user is a recipient, grouped by thread
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
          image_url,
          file_url,
          file_name,
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

    // Filter out feedback messages and group by thread
    const threadMap = new Map<string, any>();
    
    for (const item of (data || [])) {
      if (!item.message || item.message.subject?.startsWith('[FEEDBACK]')) {
        continue;
      }

      const msg = item.message;
      const threadId = msg.thread_id || msg.id;

      if (!threadMap.has(threadId)) {
        // Load all recipients for this message
        const { data: recipients } = await supabase
          .from('message_recipients')
          .select(`
            recipient:users (
              name
            )
          `)
          .eq('message_id', msg.id);

        const recipientNames = recipients?.map((r: any) => r.recipient?.name).filter(Boolean) || [];

        // Count replies in this thread
        const { count: replyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', threadId)
          .neq('id', threadId);

        // Check if ANY message in this thread is unread for this user
        // Step 1: Get all message IDs in this thread
        const { data: threadMsgs } = await supabase
          .from('messages')
          .select('id')
          .or(`id.eq.${threadId},thread_id.eq.${threadId}`);

        const threadMsgIds = threadMsgs?.map((m: any) => m.id) || [threadId];

        // Step 2: Check message_recipients for unread entries
        const { data: threadRecipients } = await supabase
          .from('message_recipients')
          .select('is_read')
          .eq('recipient_id', user.id)
          .in('message_id', threadMsgIds);

        const hasUnreadInThread = threadRecipients?.some((tr: any) => !tr.is_read) || false;

        threadMap.set(threadId, {
          id: msg.id,
          sender_id: msg.sender_id,
          subject: msg.subject,
          body: msg.body,
          image_url: msg.image_url || null,
          file_url: msg.file_url || null,
          file_name: msg.file_name || null,
          parent_message_id: msg.parent_message_id,
          thread_id: msg.thread_id,
          created_at: msg.created_at,
          sender_name: msg.sender?.name || 'Unknown',
          sender_job_title: msg.sender?.job_title || '',
          sender_profile_picture: msg.sender?.profile_picture_url || null,
          is_read: !hasUnreadInThread,
          recipient_count: recipientNames.length,
          recipient_id: item.recipient_id,
          recipient_names: recipientNames,
          reply_count: replyCount || 0,
        });
      } else {
        // Update to latest message time
        const existing = threadMap.get(threadId);
        if (new Date(msg.created_at) > new Date(existing.created_at)) {
          existing.created_at = msg.created_at;
        }
        // Check if this specific message is unread
        if (!item.is_read) {
          existing.is_read = false;
        }
      }
    }

    const messages = Array.from(threadMap.values()).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log('Loaded inbox messages:', messages.length);
    setInboxMessages(messages);
  }, [user?.id]);

  const loadSentMessages = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        subject,
        body,
        image_url,
        file_url,
        file_name,
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
      .eq('deleted_by_sender', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading sent messages:', error);
      throw error;
    }

    // Filter out feedback messages and group by thread
    const threadMap = new Map<string, any>();
    
    for (const msg of (data || [])) {
      if (msg.subject?.startsWith('[FEEDBACK]')) {
        continue;
      }

      const threadId = msg.thread_id || msg.id;
      const recipientNames = msg.recipients?.map((r: any) => r.recipient?.name).filter(Boolean) || [];

      if (!threadMap.has(threadId)) {
        // Count replies in this thread
        const { count: replyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', threadId)
          .neq('id', threadId);

        threadMap.set(threadId, {
          id: msg.id,
          sender_id: msg.sender_id,
          subject: msg.subject,
          body: msg.body,
          image_url: msg.image_url || null,
          file_url: msg.file_url || null,
          file_name: msg.file_name || null,
          parent_message_id: msg.parent_message_id,
          thread_id: msg.thread_id,
          created_at: msg.created_at,
          sender_name: user.name,
          sender_job_title: user.jobTitle,
          sender_profile_picture: user.profilePictureUrl || null,
          is_read: true,
          recipient_count: recipientNames.length,
          recipient_names: recipientNames,
          reply_count: replyCount || 0,
        });
      } else {
        // Update to latest message time
        const existing = threadMap.get(threadId);
        if (new Date(msg.created_at) > new Date(existing.created_at)) {
          existing.created_at = msg.created_at;
        }
      }
    }

    const messages = Array.from(threadMap.values()).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setSentMessages(messages);
  }, [user?.id, user?.name, user?.jobTitle, user?.profilePictureUrl]);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase.rpc('get_unread_message_count', {
      user_id: user.id,
    });

    if (!error && data !== null) {
      console.log('Unread count:', data);
      setUnreadCount(data);
    }
  }, [user?.id]);

  const loadInboxCount = useCallback(async () => {
    if (!user?.id) return;

    const { count, error } = await supabase
      .from('message_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_deleted', false);

    if (!error && count !== null) {
      setInboxCount(count);
    }
  }, [user?.id]);

  const loadMessages = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      if (activeTab === 'inbox') {
        await loadInboxMessages();
      } else if (activeTab === 'sent') {
        await loadSentMessages();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert(t('common.error'), t('messages.error_load'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeTab, loadInboxMessages, loadSentMessages]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('Messages screen focused, refreshing data...');
      loadMessages();
      loadUnreadCount();
      loadInboxCount();
    }, [loadMessages, loadUnreadCount, loadInboxCount])
  );

  useEffect(() => {
    loadMessages();
    loadUnreadCount();
    loadInboxCount();
  }, [loadMessages, loadUnreadCount, loadInboxCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    await loadUnreadCount();
    await loadInboxCount();
    setRefreshing(false);
  };

  const handleMessagePress = (message: Message) => {
    if (selectionMode) {
      toggleMessageSelection(message.id);
    } else {
      router.push({
        pathname: '/message-detail',
        params: { messageId: message.id, threadId: message.thread_id || message.id },
      });
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
    
    if (newSelected.size === 0) {
      setSelectionMode(false);
    }
  };

  const handleLongPress = (messageId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([messageId]));
  };

  const handleBatchMarkAsRead = async () => {
    if (!user?.id || selectedMessages.size === 0) return;

    try {
      const messageIds = Array.from(selectedMessages);
      
      // For each selected message, mark the entire thread as read
      for (const messageId of messageIds) {
        const message = inboxMessages.find(m => m.id === messageId);
        if (!message) continue;
        
        const threadId = message.thread_id || message.id;
        
        // Get all message IDs in this thread
        const { data: threadMessages } = await supabase
          .from('messages')
          .select('id')
          .or(`id.eq.${messageId},thread_id.eq.${threadId}`);

        const threadMessageIds = threadMessages?.map(m => m.id) || [messageId];
        
        // Mark all messages in thread as read
        await supabase
          .from('message_recipients')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('recipient_id', user.id)
          .in('message_id', threadMessageIds);
      }

      await loadMessages();
      await loadUnreadCount();
      // Immediately refresh badge counts on tab bar + WelcomeHeader
      refreshAllUnreadCounts();
      setSelectionMode(false);
      setSelectedMessages(new Set());
      Alert.alert(t('common.success'), t('messages.marked_as_read_success', { count: messageIds.length }));
    } catch (error) {
      console.error('Error marking messages as read:', error);
      Alert.alert(t('common.error'), t('messages.error_mark_read'));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedMessages.size === 0) return;

    const messageType = 'message';
    const count = selectedMessages.size;
    
    Alert.alert(
      t('messages.delete_confirm_title', { count, type: messageType }),
      t('messages.delete_confirm_msg', { count, type: messageType }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const messageIds = Array.from(selectedMessages);

              if (activeTab === 'inbox') {
                await supabase
                  .from('message_recipients')
                  .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                  .eq('recipient_id', user?.id)
                  .in('message_id', messageIds);
              } else {
                // Soft delete sent messages - mark as deleted by sender
                await supabase
                  .from('messages')
                  .update({ deleted_by_sender: true })
                  .in('id', messageIds)
                  .eq('sender_id', user?.id);
              }

              await loadMessages();
              await loadUnreadCount();
              await loadInboxCount();
              // Immediately refresh badge counts on tab bar + WelcomeHeader
              refreshAllUnreadCounts();
              setSelectionMode(false);
              setSelectedMessages(new Set());
              Alert.alert(t('common.success'), t('messages.deleted_success', { count, type: messageType }));
            } catch (error) {
              console.error('Error deleting messages:', error);
              Alert.alert(t('common.error'), t('messages.error_delete'));
            }
          },
        },
      ]
    );
  };

  const handleMarkAsRead = async (message: Message) => {
    if (!user?.id) return;

    try {
      const threadId = message.thread_id || message.id;
      
      // Get all message IDs in this thread
      const { data: threadMessages } = await supabase
        .from('messages')
        .select('id')
        .or(`id.eq.${message.id},thread_id.eq.${threadId}`);

      const threadMessageIds = threadMessages?.map(m => m.id) || [message.id];
      
      // Mark all messages in thread as read
      await supabase
        .from('message_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .in('message_id', threadMessageIds);

      await loadMessages();
      await loadUnreadCount();
      // Immediately refresh badge counts on tab bar + WelcomeHeader
      refreshAllUnreadCounts();
    } catch (error) {
      console.error('Error marking as read:', error);
      Alert.alert(t('common.error'), t('messages.error_mark_read'));
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    const messageType = 'message';
    const count = 1;

    Alert.alert(
      t('messages.delete_confirm_title', { count, type: messageType }),
      activeTab === 'inbox'
        ? t('messages.delete_inbox_confirm', { type: messageType })
        : t('messages.delete_sent_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'inbox') {
                await supabase
                  .from('message_recipients')
                  .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                  .eq('recipient_id', user?.id)
                  .eq('message_id', message.id);
              } else {
                // Soft delete sent messages - mark as deleted by sender
                // Get thread messages to mark all in thread
                const threadId = message.thread_id || message.id;
                const { data: threadMessages } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('sender_id', user?.id)
                  .or(`id.eq.${threadId},thread_id.eq.${threadId}`);

                const messageIds = threadMessages?.map(m => m.id) || [message.id];

                await supabase
                  .from('messages')
                  .update({ deleted_by_sender: true })
                  .in('id', messageIds)
                  .eq('sender_id', user?.id);
              }

              await loadMessages();
              await loadUnreadCount();
              await loadInboxCount();
              // Immediately refresh badge counts on tab bar + WelcomeHeader
              refreshAllUnreadCounts();
              Alert.alert(t('common.success'), t('messages.deleted_success', { count, type: messageType }));
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert(t('common.error'), t('messages.error_delete'));
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

    if (diffHours < 1) return t('messages.just_now');
    if (diffHours < 24) return t('messages.hours_ago', { count: diffHours });
    if (diffDays === 1) return t('messages.yesterday');
    if (diffDays < 7) return t('messages.days_ago', { count: diffDays });

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
            {t('messages.inbox_almost_full', { count: inboxCount })}
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
            {t('messages.inbox_getting_full', { count: inboxCount })}
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
        {selectionMode ? (
          <>
            <TouchableOpacity 
              onPress={() => {
                setSelectionMode(false);
                setSelectedMessages(new Set());
              }} 
              style={styles.backButton}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('messages.selected', { count: selectedMessages.size })}
            </Text>
            <View style={styles.headerRight} />
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <IconSymbol
                ios_icon_name="chevron.left"
                android_material_icon_name="chevron-left"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('messages.title')}</Text>
            <View style={styles.headerRight} />
          </>
        )}
      </View>

      {/* Selection Mode Actions */}
      {selectionMode && (
        <View style={[styles.selectionActions, { backgroundColor: colors.card }]}>
          {(activeTab === 'inbox') && (
            <TouchableOpacity
              style={[styles.selectionButton, { backgroundColor: '#3498DB' }]}
              onPress={handleBatchMarkAsRead}
            >
              <IconSymbol
                ios_icon_name="checkmark.circle"
                android_material_icon_name="check-circle"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.selectionButtonText}>{t('messages.mark_as_read')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.selectionButton, { backgroundColor: '#E74C3C' }]}
            onPress={handleBatchDelete}
          >
            <IconSymbol
              ios_icon_name="trash"
              android_material_icon_name="delete"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.selectionButtonText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      )}

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
            {t('messages.inbox')}
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
            {t('messages.sent')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Compose Button */}
      {!selectionMode && (
        <TouchableOpacity
          style={[styles.composeButton, { backgroundColor: colors.primary || colors.highlight }]}
          onPress={() => router.push('/compose-message')}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={24}
            color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
          />
          <Text style={[styles.composeButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
            {t('messages.send_new_message')}
          </Text>
        </TouchableOpacity>
      )}

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
              {t('messages.loading_messages')}
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
              {activeTab === 'inbox'
                ? t('messages.no_inbox_messages')
                : t('messages.no_sent_messages')}
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageCard
                key={index}
                message={message}
                colors={colors}
                isManager={isManager}
                activeTab={activeTab}
                selectionMode={selectionMode}
                isSelected={selectedMessages.has(message.id)}
                onPress={() => handleMessagePress(message)}
                onLongPress={() => handleLongPress(message.id)}
                onMarkAsRead={() => handleMarkAsRead(message)}
                onDelete={() => handleDeleteMessage(message)}
                formatDate={formatDate}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Compact Message Card with Swipe-to-Delete
function MessageCard({
  message,
  colors,
  isManager,
  activeTab,
  selectionMode,
  isSelected,
  onPress,
  onLongPress,
  onMarkAsRead,
  onDelete,
  formatDate,
}: {
  message: Message;
  colors: any;
  isManager: boolean;
  activeTab: string;
  selectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMarkAsRead: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}) {
  const { t } = useTranslation();
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [120, 0],
    });

    return (
      <Animated.View style={[styles.swipeActionsContainer, { transform: [{ translateX }] }]}>
        {(activeTab === 'inbox') && !message.is_read && (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionRead]}
            onPress={() => {
              swipeableRef.current?.close();
              onMarkAsRead();
            }}
          >
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.swipeActionText}>Read</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeActionDelete]}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        >
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const isUnread = !message.is_read && activeTab === 'inbox';
  const accentColor = colors.primary || colors.highlight;

  const cardContent = (
    <TouchableOpacity
      style={[
        styles.messageItem,
        { backgroundColor: colors.card },
        isUnread && [styles.unreadMessage, { borderLeftColor: accentColor, backgroundColor: accentColor + '08' }],
        selectionMode && isSelected && [styles.selectedMessage, { borderColor: accentColor }],
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Selection Checkbox */}
      {selectionMode && (
        <View style={styles.checkboxContainer}>
          <View style={[
            styles.checkbox,
            { borderColor: colors.border },
            isSelected && { backgroundColor: accentColor, borderColor: accentColor }
          ]}>
            {isSelected && (
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={14}
                color="#FFFFFF"
              />
            )}
          </View>
        </View>
      )}

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
        {/* Unread dot on profile picture */}
        {isUnread && (
          <View style={[styles.unreadDot, { backgroundColor: accentColor, borderColor: colors.card }]} />
        )}
      </View>

      {/* Message Content — compact two-column layout */}
      <View style={styles.messageContent}>
        {/* Top row: sender name + date */}
        <View style={styles.messageHeader}>
          <Text style={[styles.messageSender, { color: colors.text }, isUnread && styles.messageSenderUnread]} numberOfLines={1}>
            {activeTab === 'sent'
              ? (message.recipient_names && message.recipient_names.length > 0
                  ? message.recipient_names.join(', ')
                  : t('messages.recipients', { count: message.recipient_count }))
              : message.sender_name}
          </Text>
          <Text style={[styles.messageDate, { color: colors.textSecondary }]}>
            {formatDate(message.created_at)}
          </Text>
        </View>

        {/* Subject line */}
        {message.subject && (
          <Text style={[styles.messageSubject, { color: colors.text }, isUnread && styles.messageSubjectUnread]} numberOfLines={1}>
            {message.subject}
          </Text>
        )}

        {/* Bottom row: body preview (left) + meta indicators (right) */}
        <View style={styles.messageBottomRow}>
          <Text style={[styles.messageBody, { color: colors.textSecondary }]} numberOfLines={1}>
            {message.image_url && !message.body && !message.file_url ? '📷 Photo' :
             message.file_url && !message.body && !message.image_url ? `📎 ${message.file_name || 'File'}` :
             message.body}
          </Text>
          <View style={styles.messageMetaRight}>
            {message.file_url ? (
              <View style={styles.metaChip}>
                <IconSymbol
                  ios_icon_name="paperclip"
                  android_material_icon_name="attach-file"
                  size={11}
                  color={colors.textSecondary}
                />
              </View>
            ) : null}
            {message.image_url && message.body ? (
              <View style={styles.metaChip}>
                <IconSymbol
                  ios_icon_name="photo"
                  android_material_icon_name="photo"
                  size={11}
                  color={colors.textSecondary}
                />
              </View>
            ) : null}
            {message.reply_count != null && message.reply_count > 0 ? (
              <View style={styles.metaChip}>
                <IconSymbol
                  ios_icon_name="bubble.left.and.bubble.right"
                  android_material_icon_name="forum"
                  size={11}
                  color={accentColor}
                />
                <Text style={[styles.metaChipText, { color: accentColor }]}>
                  {message.reply_count}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Unread accent bar on right edge */}
      {isUnread && <View style={[styles.unreadBar, { backgroundColor: accentColor }]} />}
    </TouchableOpacity>
  );

  // Wrap in Swipeable when not in selection mode
  if (selectionMode) {
    return cardContent;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      {cardContent}
    </Swipeable>
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
  selectionActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  selectionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  messageItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    gap: 10,
    marginBottom: 8,
    alignItems: 'center',
    overflow: 'hidden',
  },
  unreadMessage: {
    borderLeftWidth: 4,
  },
  selectedMessage: {
    borderWidth: 2,
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 22,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePictureContainer: {
    width: 44,
    height: 44,
    position: 'relative',
  },
  profilePicture: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profilePicturePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicturePlaceholderText: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  messageSender: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  messageSenderUnread: {
    fontWeight: '700',
  },
  messageDate: {
    fontSize: 11,
  },
  messageSubject: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 1,
  },
  messageSubjectUnread: {
    fontWeight: '700',
  },
  messageBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  messageBody: {
    fontSize: 13,
    lineHeight: 17,
    flex: 1,
    marginRight: 8,
  },
  messageMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  unreadBar: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderRadius: 2,
  },
  // Swipe action styles
  swipeActionsContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    marginLeft: 4,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    paddingVertical: 8,
  },
  swipeActionRead: {
    backgroundColor: '#3498DB',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  swipeActionDelete: {
    backgroundColor: '#E74C3C',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  swipeActionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
});
