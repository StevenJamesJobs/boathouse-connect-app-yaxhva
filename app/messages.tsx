
import React, { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';
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
  recipient_names?: string[];
  reply_count?: number;
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'feedback'>('inbox');
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [feedbackMessages, setFeedbackMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  const colors = user?.role === 'manager' ? managerColors : employeeColors;
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
        const { data: threadRecipients } = await supabase
          .from('message_recipients')
          .select('is_read, message:messages!inner(id, thread_id)')
          .eq('recipient_id', user.id)
          .or(`message_id.eq.${threadId},message.thread_id.eq.${threadId}`);

        const hasUnreadInThread = threadRecipients?.some((tr: any) => !tr.is_read) || false;

        threadMap.set(threadId, {
          id: msg.id,
          sender_id: msg.sender_id,
          subject: msg.subject,
          body: msg.body,
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

  const loadFeedbackMessages = useCallback(async () => {
    if (!user?.id || !isManager) return;

    console.log('Loading feedback messages...');

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
      console.error('Error loading feedback:', error);
      throw error;
    }

    // Filter only feedback messages
    const feedbackMsgs: Message[] = (data || [])
      .filter((item: any) => item.message)
      .filter((item: any) => item.message.subject?.startsWith('[FEEDBACK]'))
      .map((item: any) => ({
        id: item.message.id,
        sender_id: item.message.sender_id,
        subject: item.message.subject?.replace('[FEEDBACK] ', ''),
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

    console.log('Feedback messages loaded:', feedbackMsgs.length);
    setFeedbackMessages(feedbackMsgs);
  }, [user?.id, isManager]);

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

  const loadFeedbackCount = useCallback(async () => {
    if (!user?.id || !isManager) return;

    const { data, error } = await supabase
      .from('message_recipients')
      .select(`
        message:messages (
          subject
        )
      `)
      .eq('recipient_id', user.id)
      .eq('is_deleted', false);

    if (!error && data) {
      const feedbackCount = data.filter(
        (item: any) => item.message?.subject?.startsWith('[FEEDBACK]')
      ).length;
      setFeedbackCount(feedbackCount);
    }
  }, [user?.id, isManager]);

  const loadMessages = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      if (activeTab === 'inbox') {
        await loadInboxMessages();
      } else if (activeTab === 'sent') {
        await loadSentMessages();
      } else if (activeTab === 'feedback' && isManager) {
        await loadFeedbackMessages();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert(t('common.error'), t('messages.error_load'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeTab, isManager, loadInboxMessages, loadSentMessages, loadFeedbackMessages]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('Messages screen focused, refreshing data...');
      loadMessages();
      loadUnreadCount();
      loadInboxCount();
      if (isManager) {
        loadFeedbackCount();
      }
    }, [loadMessages, loadUnreadCount, loadInboxCount, loadFeedbackCount, isManager])
  );

  useEffect(() => {
    loadMessages();
    loadUnreadCount();
    loadInboxCount();
    if (isManager) {
      loadFeedbackCount();
    }
  }, [loadMessages, loadUnreadCount, loadInboxCount, loadFeedbackCount, isManager]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    await loadUnreadCount();
    await loadInboxCount();
    if (isManager) {
      await loadFeedbackCount();
    }
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
        const message = inboxMessages.find(m => m.id === messageId) || feedbackMessages.find(m => m.id === messageId);
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

    const messageType = activeTab === 'feedback' ? 'feedback' : 'message';
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

              if (activeTab === 'inbox' || activeTab === 'feedback') {
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
              if (isManager) {
                await loadFeedbackCount();
              }
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
    } catch (error) {
      console.error('Error marking as read:', error);
      Alert.alert(t('common.error'), t('messages.error_mark_read'));
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    const messageType = activeTab === 'feedback' ? 'feedback' : 'message';
    const count = 1;

    Alert.alert(
      t('messages.delete_confirm_title', { count, type: messageType }),
      activeTab === 'inbox' || activeTab === 'feedback'
        ? t('messages.delete_inbox_confirm', { type: messageType })
        : t('messages.delete_sent_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'inbox' || activeTab === 'feedback') {
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
              if (isManager) {
                await loadFeedbackCount();
              }
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

  const messages = activeTab === 'inbox' ? inboxMessages : activeTab === 'sent' ? sentMessages : feedbackMessages;

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
          {(activeTab === 'inbox' || activeTab === 'feedback') && (
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
        {isManager && (
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'feedback' && { borderBottomColor: colors.primary || colors.highlight },
            ]}
            onPress={() => setActiveTab('feedback')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'feedback' ? colors.text : colors.textSecondary },
              ]}
            >
              {t('messages.feedback')}
            </Text>
            {feedbackCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#3498DB' }]}>
                <Text style={styles.badgeText}>{feedbackCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Compose Button */}
      {activeTab !== 'feedback' && !selectionMode && (
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
              {activeTab === 'feedback' ? t('messages.loading_feedback') : t('messages.loading_messages')}
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name={activeTab === 'feedback' ? 'bubble.left.and.bubble.right' : activeTab === 'inbox' ? 'tray' : 'paperplane'}
              android_material_icon_name={activeTab === 'feedback' ? 'feedback' : activeTab === 'inbox' ? 'inbox' : 'send'}
              size={64}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeTab === 'feedback'
                ? t('messages.no_feedback')
                : activeTab === 'inbox'
                ? t('messages.no_inbox_messages')
                : t('messages.no_sent_messages')}
            </Text>
            {activeTab === 'feedback' && (
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {t('messages.feedback_hint')}
              </Text>
            )}
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

// Message Card Component (removed swipe functionality)
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
  return (
    <TouchableOpacity
      style={[
        styles.messageItem,
        { backgroundColor: colors.card },
        !message.is_read && (activeTab === 'inbox' || activeTab === 'feedback') && styles.unreadMessage,
        selectionMode && isSelected && styles.selectedMessage,
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
            isSelected && { backgroundColor: colors.primary || colors.highlight, borderColor: colors.primary || colors.highlight }
          ]}>
            {isSelected && (
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={16}
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
      </View>

      {/* Message Content */}
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <View style={styles.messageHeaderLeft}>
            {!message.is_read && (activeTab === 'inbox' || activeTab === 'feedback') && (
              <View style={styles.unreadDot} />
            )}
            <Text style={[styles.messageSender, { color: colors.text }]} numberOfLines={1}>
              {activeTab === 'sent'
                ? t('messages.recipients', { count: message.recipient_count })
                : message.sender_name}
            </Text>
          </View>
          <Text style={[styles.messageDate, { color: colors.textSecondary }]}>
            {formatDate(message.created_at)}
          </Text>
        </View>
        
        {/* Show recipients for inbox messages with multiple recipients */}
        {(activeTab === 'inbox' || activeTab === 'feedback') && message.recipient_names && message.recipient_names.length > 1 && (
          <Text style={[styles.recipientsText, { color: colors.textSecondary }]} numberOfLines={1}>
            To: {message.recipient_names.join(', ')}
          </Text>
        )}
        
        {/* Show recipients for sent messages */}
        {activeTab === 'sent' && message.recipient_names && message.recipient_names.length > 0 && (
          <Text style={[styles.recipientsText, { color: colors.textSecondary }]} numberOfLines={1}>
            {message.recipient_names.join(', ')}
          </Text>
        )}
        
        {activeTab !== 'sent' && message.sender_job_title ? (
          <Text style={[styles.messageJobTitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {message.sender_job_title}
          </Text>
        ) : null}
        {message.subject && (
          <Text style={[styles.messageSubject, { color: colors.text }]} numberOfLines={1}>
            {message.subject}
          </Text>
        )}
        <Text style={[styles.messageBody, { color: colors.textSecondary }]} numberOfLines={2}>
          {message.body}
        </Text>

        {/* Reply count indicator */}
        {message.reply_count && message.reply_count > 0 && (
          <View style={styles.replyCountContainer}>
            <IconSymbol
              ios_icon_name="bubble.left.and.bubble.right"
              android_material_icon_name="forum"
              size={14}
              color={colors.primary || colors.highlight}
            />
            <Text style={[styles.replyCountText, { color: colors.primary || colors.highlight }]}>
              {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
            </Text>
          </View>
        )}

        {/* Action Buttons Inside Card */}
        {!selectionMode && (
          <View style={styles.inlineActions}>
            {(activeTab === 'inbox' || activeTab === 'feedback') && !message.is_read && (
              <TouchableOpacity
                style={[styles.inlineActionButton, { backgroundColor: '#3498DB' }]}
                onPress={(e) => {
                  e.stopPropagation();
                  onMarkAsRead();
                }}
              >
                <IconSymbol
                  ios_icon_name="checkmark.circle"
                  android_material_icon_name="check-circle"
                  size={14}
                  color="#FFFFFF"
                />
                <Text style={styles.inlineActionText}>{t('messages.mark_as_read')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.inlineActionButton, { backgroundColor: '#E74C3C' }]}
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <IconSymbol
                ios_icon_name="trash"
                android_material_icon_name="delete"
                size={14}
                color="#FFFFFF"
              />
              <Text style={styles.inlineActionText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
    gap: 12,
    marginBottom: 12,
  },
  unreadMessage: {
    borderLeftWidth: 4,
    borderLeftColor: '#3498DB',
  },
  selectedMessage: {
    borderWidth: 2,
    borderColor: '#3498DB',
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
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
  recipientsText: {
    fontSize: 12,
    marginBottom: 2,
    fontStyle: 'italic',
  },
  messageJobTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  messageSubject: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  replyCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  replyCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inlineActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
