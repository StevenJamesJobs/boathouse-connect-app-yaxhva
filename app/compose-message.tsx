
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useNotification } from '@/contexts/NotificationContext';

interface User {
  id: string;
  name: string;
  job_title: string;
  job_titles: string[];
  role: string;
}

interface RecipientGroup {
  id: string;
  label: string;
  description: string;
  userIds: string[];
}

export default function ComposeMessageScreen() {
  const { t } = useTranslation('compose');
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Reply/Reply All parameters
  const replyToMessageId = params.replyToMessageId as string;
  const replyToSenderId = params.replyToSenderId as string;
  const replyAllRecipientIds = params.replyAllRecipientIds as string;
  const replySubject = params.replySubject as string;
  const isReplyAll = params.isReplyAll === 'true';
  
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<User[]>([]);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientGroups, setRecipientGroups] = useState<RecipientGroup[]>([]);

  const colors = useThemeColors();

  const loadReplyRecipients = useCallback(async () => {
    try {
      if (isReplyAll && replyAllRecipientIds) {
        // Reply All: Load all original recipients + sender
        const recipientIds = replyAllRecipientIds.split(',').filter(id => id !== user?.id);
        
        const { data, error } = await supabase
          .from('users')
          .select('id, name, job_title, job_titles, role')
          .in('id', recipientIds);

        if (error) throw error;
        setSelectedRecipients(data || []);
      } else if (replyToSenderId) {
        // Reply: Load only the sender
        const { data, error } = await supabase
          .from('users')
          .select('id, name, job_title, job_titles, role')
          .eq('id', replyToSenderId)
          .single();

        if (error) throw error;
        if (data) {
          setSelectedRecipients([data]);
        }
      }
    } catch (error) {
      console.error('Error loading reply recipients:', error);
    }
  }, [isReplyAll, replyAllRecipientIds, replyToSenderId, user?.id]);

  // Initialize reply/reply all
  useEffect(() => {
    if (replyToMessageId && replyToSenderId) {
      // Set subject with "Re: " prefix
      if (replySubject) {
        const subjectText = replySubject.startsWith('Re: ') ? replySubject : `Re: ${replySubject}`;
        setSubject(subjectText);
      }
      
      // Load reply recipients
      loadReplyRecipients();
    }
  }, [replyToMessageId, replyToSenderId, replySubject, loadReplyRecipients]);

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, job_title, job_titles, role')
        .eq('is_active', true)
        .neq('id', user?.id || '')
        .order('name');

      if (error) throw error;
      
      console.log('Loaded users:', data?.length);
      console.log('Sample user job_titles:', data?.[0]?.job_titles);
      
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_load_users'));
    }
  }, [user?.id]);

  const generateRecipientGroups = useCallback(() => {
    const groups: RecipientGroup[] = [];

    console.log('Generating recipient groups for role:', user?.role);
    console.log('Total users:', allUsers.length);

    // Default group for employees: All Managers
    if (user?.role === 'employee') {
      const managers = allUsers.filter(u => u.role === 'manager');
      if (managers.length > 0) {
        groups.push({
          id: 'all-managers',
          label: 'All Managers',
          description: `Send to all ${managers.length} manager${managers.length > 1 ? 's' : ''}`,
          userIds: managers.map(m => m.id),
        });
      }
      console.log('Added All Managers group:', managers.length, 'managers');
    }

    // Default group for managers: All Employees
    if (user?.role === 'manager') {
      const allCount = allUsers.length;
      
      groups.push({
        id: 'all-employees',
        label: 'All Employees',
        description: `Send to all ${allCount} employee${allCount > 1 ? 's' : ''} and managers`,
        userIds: allUsers.map(u => u.id),
      });
      console.log('Added All Employees group:', allCount, 'users');
    }

    // Group by job titles (using the new job_titles array)
    const jobTitlesMap = new Map<string, string[]>();
    
    allUsers.forEach(u => {
      if (u.job_titles && Array.isArray(u.job_titles) && u.job_titles.length > 0) {
        u.job_titles.forEach(title => {
          if (!jobTitlesMap.has(title)) {
            jobTitlesMap.set(title, []);
          }
          jobTitlesMap.get(title)!.push(u.id);
        });
      }
    });

    console.log('Job titles found:', Array.from(jobTitlesMap.keys()));

    // Define the standard job titles in the desired order
    const standardJobTitles = ['Banquets', 'Bartender', 'Busser', 'Chef', 'Host', 'Kitchen', 'Manager', 'Runner', 'Server'];
    
    // Add job title groups in order
    standardJobTitles.forEach(jobTitle => {
      const userIds = jobTitlesMap.get(jobTitle);
      if (userIds && userIds.length > 0) {
        const pluralLabel = jobTitle === 'Chef' ? 'Chefs' : 
                           jobTitle === 'Manager' ? 'Managers' :
                           jobTitle + 's';
        groups.push({
          id: `job-${jobTitle}`,
          label: `All ${pluralLabel}`,
          description: `Send to all ${userIds.length} ${jobTitle}${userIds.length > 1 ? 's' : ''}`,
          userIds: userIds,
        });
        console.log(`Added ${jobTitle} group:`, userIds.length, 'users');
      }
    });

    // Add any non-standard job titles
    Array.from(jobTitlesMap.keys())
      .filter(title => !standardJobTitles.includes(title))
      .sort()
      .forEach(jobTitle => {
        const userIds = jobTitlesMap.get(jobTitle);
        if (userIds && userIds.length > 0) {
          groups.push({
            id: `job-${jobTitle}`,
            label: `All ${jobTitle}s`,
            description: `Send to all ${userIds.length} ${jobTitle}${userIds.length > 1 ? 's' : ''}`,
            userIds: userIds,
          });
          console.log(`Added ${jobTitle} group (non-standard):`, userIds.length, 'users');
        }
      });

    console.log('Total groups generated:', groups.length);
    setRecipientGroups(groups);
  }, [allUsers, user?.role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (allUsers.length > 0) {
      generateRecipientGroups();
    }
  }, [allUsers, generateRecipientGroups]);

  const handleSelectGroup = (group: RecipientGroup) => {
    const groupUsers = allUsers.filter(u => group.userIds.includes(u.id));
    
    // Add users that aren't already selected
    const newRecipients = groupUsers.filter(
      gu => !selectedRecipients.some(sr => sr.id === gu.id)
    );
    
    setSelectedRecipients([...selectedRecipients, ...newRecipients]);
    setShowRecipientPicker(false);
    setSearchQuery('');
  };

  const handleSelectUser = (selectedUser: User) => {
    if (selectedRecipients.some(r => r.id === selectedUser.id)) {
      // Remove if already selected
      setSelectedRecipients(selectedRecipients.filter(r => r.id !== selectedUser.id));
    } else {
      // Add to selected
      setSelectedRecipients([...selectedRecipients, selectedUser]);
    }
  };

  const handleRemoveRecipient = (userId: string) => {
    setSelectedRecipients(selectedRecipients.filter(r => r.id !== userId));
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_no_recipients'));
      return;
    }

    if (!body.trim()) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('error_no_message'));
      return;
    }

    try {
      setSending(true);

      // Determine thread_id and parent_message_id for replies
      let threadId = null;
      let parentMessageId = null;
      
      if (replyToMessageId) {
        // This is a reply
        parentMessageId = replyToMessageId;
        
        // Get the thread_id from the original message
        const { data: originalMessage, error: originalError } = await supabase
          .from('messages')
          .select('thread_id, id')
          .eq('id', replyToMessageId)
          .single();
        
        if (originalError) throw originalError;
        
        // If original message has a thread_id, use it; otherwise use the original message id
        threadId = originalMessage.thread_id || originalMessage.id;
      }

      // Create the message
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: user?.id,
          subject: subject.trim() || null,
          body: body.trim(),
          thread_id: threadId,
          parent_message_id: parentMessageId,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Create message recipients
      const recipients = selectedRecipients.map(recipient => ({
        message_id: messageData.id,
        recipient_id: recipient.id,
      }));

      const { error: recipientsError } = await supabase
        .from('message_recipients')
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      // Send push notification to recipients (don't block on failure)
      try {
        await sendNotification({
          userIds: selectedRecipients.map(r => r.id),
          notificationType: 'message',
          title: '📨 New Message',
          body: subject.trim() 
            ? `${user?.name}: ${subject.trim()}`
            : `${user?.name} sent you a message`,
          data: {
            messageId: messageData.id,
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
      setSending(false);
    }
  };

  const getJobTitlesDisplay = (u: User) => {
    if (u.job_titles && Array.isArray(u.job_titles) && u.job_titles.length > 0) {
      return u.job_titles.join(', ');
    }
    return u.job_title || t('no_job_title');
  };

  // Filter users based on search query
  // If no search query, show all users (for the "All Users" section)
  const filteredUsers = searchQuery
    ? allUsers.filter(u => {
        const nameMatch = u.name.toLowerCase().includes(searchQuery.toLowerCase());
        const jobTitlesMatch = u.job_titles && Array.isArray(u.job_titles) && 
          u.job_titles.some(title => title.toLowerCase().includes(searchQuery.toLowerCase()));
        const oldJobTitleMatch = u.job_title && u.job_title.toLowerCase().includes(searchQuery.toLowerCase());
        
        return nameMatch || jobTitlesMatch || oldJobTitleMatch;
      })
    : allUsers; // Show all users when no search query

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {replyToMessageId ? (isReplyAll ? t('reply_all') : t('reply')) : t('new_message')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Recipients */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('to')}</Text>
          <TouchableOpacity
            style={[styles.recipientButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowRecipientPicker(true)}
          >
            <IconSymbol
              ios_icon_name="person.badge.plus"
              android_material_icon_name="person-add"
              size={20}
              color={colors.primary || colors.highlight}
            />
            <Text style={[styles.recipientButtonText, { color: colors.text }]}>
              {selectedRecipients.length === 0
                ? t('select_recipients')
                : t('recipients_selected', { count: selectedRecipients.length })}
            </Text>
          </TouchableOpacity>

          {/* Selected Recipients */}
          {selectedRecipients.length > 0 && (
            <View style={styles.selectedRecipients}>
              {selectedRecipients.map((recipient, index) => (
                <View key={index} style={[styles.recipientChip, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.recipientChipText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]} numberOfLines={1}>
                    {recipient.name}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveRecipient(recipient.id)}>
                    <IconSymbol
                      ios_icon_name="xmark.circle.fill"
                      android_material_icon_name="cancel"
                      size={18}
                      color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('subject_optional')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('subject_placeholder')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Message Body */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t('message_label')}</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={body}
            onChangeText={setBody}
            placeholder={t('message_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.cancelButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
              {t('common:cancel', { defaultValue: 'Cancel' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary || colors.highlight }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color={user?.role === 'manager' ? colors.text : '#FFFFFF'} />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="paperplane.fill"
                  android_material_icon_name="send"
                  size={20}
                  color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
                />
                <Text style={[styles.sendButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
                  {t('common:send', { defaultValue: 'Send' })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Recipient Picker Modal */}
      <Modal
        visible={showRecipientPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRecipientPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_recipients')}</Text>
              <TouchableOpacity onPress={() => setShowRecipientPicker(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('search_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Recipient Groups - Only show when no search query */}
            {searchQuery === '' && recipientGroups.length > 0 && (
              <View style={styles.groupsSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('quick_select')}</Text>
                {recipientGroups.map((group, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.groupItem, { backgroundColor: colors.card }]}
                    onPress={() => handleSelectGroup(group)}
                  >
                    <View style={styles.groupInfo}>
                      <Text style={[styles.groupLabel, { color: colors.text }]}>{group.label}</Text>
                      <Text style={[styles.groupDescription, { color: colors.textSecondary }]}>
                        {group.description}
                      </Text>
                    </View>
                    <IconSymbol
                      ios_icon_name="chevron.right"
                      android_material_icon_name="chevron-right"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Individual Users - Always show, either filtered or all users */}
            <View style={styles.usersSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {searchQuery === '' ? t('all_users') : t('search_results')}
              </Text>
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedRecipients.some(r => r.id === item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.userItem, { backgroundColor: colors.card }]}
                      onPress={() => handleSelectUser(item)}
                    >
                      <View style={styles.userInfo}>
                        <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.userJobTitle, { color: colors.textSecondary }]}>
                          {getJobTitlesDisplay(item)}
                        </Text>
                      </View>
                      {isSelected && (
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check_circle"
                          size={24}
                          color={colors.primary || colors.highlight}
                        />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyList}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {t('no_users_found')}
                    </Text>
                  </View>
                }
              />
            </View>

            {/* Done Button */}
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.primary || colors.highlight }]}
              onPress={() => setShowRecipientPicker(false)}
            >
              <Text style={[styles.doneButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
                {t('done', { count: selectedRecipients.length })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  recipientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  recipientButtonText: {
    fontSize: 16,
    flex: 1,
  },
  selectedRecipients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  recipientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    maxWidth: '100%',
  },
  recipientChipText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 200,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  groupsSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  groupInfo: {
    flex: 1,
  },
  groupLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 13,
  },
  usersSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  userJobTitle: {
    fontSize: 13,
  },
  emptyList: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  doneButton: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
